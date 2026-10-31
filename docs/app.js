/* =========================================================================
   One Price, A Million Futures — Slow-Burning 3-Module Interactive Workspace
   -------------------------------------------------------------------------
   Module 01: Live Stochastic Simulator + Single-Equation Path Spotlight
              (unpacked one stage at a time, never 4 equations at once).
   Module 02: Scroll-Driven Mathematical Journey (sticky animated laboratory
              on the left that morphs as the user scrolls through 4 chapters,
              showing 1 focused equation and living canvas at a time).
   Module 03: Trading Desk & Risk Workbench (market scenarios, interactive
              5-Greek explorer, animated tangent/Gamma canvas, CLI & JSON).
   ========================================================================= */
(() => {
  "use strict";

  // ── configuration ────────────────────────────────────────────────────────
  const CAP = 1 << 20;          // max stored Z draws (≈1M, x2 with antithetic)
  const STEPS = 64;             // time steps per drawn path
  const PCAP = 1400;            // max drawn paths in the cloud
  const BINS = 96;              // histogram bins
  const COL = { ember: "#ff6a3d", paper: "#ece6d9", dim: "#8d867a", frost: "#9cc8d8", hair: "rgba(236,230,217,0.16)", faint: "rgba(236,230,217,0.07)" };

  // ── seeded PRNG (mulberry32) + Box–Muller ────────────────────────────────
  let seed, rngState, spare = null;
  function setSeed(s) { seed = s >>> 0; rngState = seed; spare = null; }
  function uniform() {
    rngState = (rngState + 0x6D2B79F5) >>> 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296;
  }
  let lastU = [0.5, 0.5];
  function normal() {
    if (spare !== null) { const z = spare; spare = null; return z; }
    const u1 = uniform(), u2 = uniform();
    lastU = [u1, u2];
    const R = Math.sqrt(-2 * Math.log(u1)), th = 2 * Math.PI * u2;
    spare = R * Math.sin(th);
    return R * Math.cos(th);
  }

  // ── analytics: Black–Scholes + 5 Greeks ──────────────────────────────────
  function Phi(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const v = 1 - 0.3989422804014327 * Math.exp(-0.5 * x * x) * p;
    return x >= 0 ? v : 1 - v;
  }
  function phi(x) { return 0.3989422804014327 * Math.exp(-0.5 * x * x); }

  function blackScholes({ S0, K, sigma, r, T }) {
    const sqrtT = Math.sqrt(Math.max(1e-8, T));
    const sT = sigma * sqrtT;
    const d1 = (Math.log(S0 / K) + (r + 0.5 * sigma * sigma) * T) / sT, d2 = d1 - sT;
    const disc = Math.exp(-r * T), dK = K * disc;
    const call = S0 * Phi(d1) - dK * Phi(d2);
    const put = dK * Phi(-d2) - S0 * Phi(-d1);
    const nd1 = phi(d1);
    const gamma = nd1 / (S0 * sT);
    const vega = S0 * nd1 * sqrtT * 0.01;
    const thetaCall = (-(S0 * nd1 * sigma) / (2 * sqrtT) - r * dK * Phi(d2)) / 365;
    const thetaPut = (-(S0 * nd1 * sigma) / (2 * sqrtT) + r * dK * Phi(-d2)) / 365;
    const rhoCall = K * T * disc * Phi(d2) * 0.01;
    const rhoPut = -K * T * disc * Phi(-d2) * 0.01;
    return {
      call, put, d1, d2,
      deltaCall: Phi(d1), deltaPut: Phi(d1) - 1,
      gamma, vega, thetaCall, thetaPut, rhoCall, rhoPut
    };
  }

  // ── state ────────────────────────────────────────────────────────────────
  const P = { S0: 100, K: 110, sigma: 0.25, r: 0.05, T: 1, type: "call", anti: true };
  let activeMod = "sim";
  const Z = new Float64Array(CAP);
  let n = 0;
  const paths = new Float32Array(PCAP * (STEPS + 1));
  let np = 0;
  let acc;
  let hist = new Float64Array(BINS);
  let trace = [];
  let range = { lo: 50, hi: 200 };
  let leaders = [];
  let last = null;
  let playing = true, startTime = performance.now(), lastSpawn = 0;
  let dirty = { cloud: true, stats: true, labEq: true, deskEq: true };
  let rateMeter = { t: performance.now(), n: 0, v: 0 };

  const drift = () => (P.r - 0.5 * P.sigma * P.sigma) * P.T;
  const volT = () => P.sigma * Math.sqrt(P.T);
  const ST = z => P.S0 * Math.exp(drift() + volT() * z);
  const payoff = (s, type = P.type) => type === "call" ? Math.max(s - P.K, 0) : Math.max(P.K - s, 0);

  function computeRange() {
    const m = Math.log(P.S0) + drift(), v = volT();
    let lo = Math.exp(m - 2.9 * v), hi = Math.exp(m + 3.1 * v);
    lo = Math.min(lo, P.S0 * 0.92, P.K * 0.92); hi = Math.max(hi, P.S0 * 1.08, P.K * 1.08);
    range = { lo: Math.max(0, lo), hi };
  }

  function resetAcc() {
    acc = { pc: 0, pc2: 0, pp: 0, pp2: 0, ac: 0, ac2: 0, ap: 0, ap2: 0, itm: 0, cnt: 0, nextCp: 8 };
    hist.fill(0); trace = [];
  }

  function ingest(from, to) {
    const a = acc, d = drift(), v = volT(), S0 = P.S0, K = P.K, call = P.type === "call";
    const { lo, hi } = range, bw = (hi - lo) / BINS, anti = P.anti, disc = Math.exp(-P.r * P.T);
    for (let i = from; i < to; i++) {
      const s1 = S0 * Math.exp(d + v * Z[i]), s2 = S0 * Math.exp(d - v * Z[i]);
      const c1 = s1 > K ? s1 - K : 0, c2 = s2 > K ? s2 - K : 0;
      const p1 = s1 < K ? K - s1 : 0, p2 = s2 < K ? K - s2 : 0;
      a.pc += c1; a.pc2 += c1 * c1; a.pp += p1; a.pp2 += p1 * p1;
      const ca = 0.5 * (c1 + c2), pa = 0.5 * (p1 + p2);
      a.ac += ca; a.ac2 += ca * ca; a.ap += pa; a.ap2 += pa * pa;
      let b = ((s1 - lo) / bw) | 0; if (b >= 0 && b < BINS) hist[b]++;
      if (call ? s1 > K : s1 < K) a.itm++;
      a.cnt++;
      if (anti) {
        b = ((s2 - lo) / bw) | 0; if (b >= 0 && b < BINS) hist[b]++;
        if (call ? s2 > K : s2 < K) a.itm++;
        a.cnt++;
      }
      if (i + 1 >= a.nextCp) {
        const k = i + 1;
        const mp = (call ? a.pc : a.pp) / k, ma = (call ? a.ac : a.ap) / k;
        trace.push({ k, plain: disc * mp, anti: disc * ma });
        a.nextCp = Math.max(k + 1, Math.floor(k * 1.045));
      }
    }
  }

  function recompute() {
    computeRange(); resetAcc(); ingest(0, n);
    dirty.cloud = true; dirty.stats = true; dirty.labEq = true; dirty.deskEq = true;
  }

  function estimates() {
    const k = Math.max(n, 2), a = acc, disc = Math.exp(-P.r * P.T), call = P.type === "call";
    const stat = (s, s2) => { const m = s / k; return { m, v: Math.max(0, (s2 / k - m * m) * k / (k - 1)) }; };
    const pc = stat(a.pc, a.pc2), pp = stat(a.pp, a.pp2), ac = stat(a.ac, a.ac2), ap = stat(a.ap, a.ap2);
    const plain = call ? pc : pp, an = call ? ac : ap;
    const act = P.anti ? an : plain;
    return {
      mc: disc * act.m, se: disc * Math.sqrt(act.v / k),
      sdPerEval: P.anti ? disc * Math.sqrt(2 * an.v) : disc * Math.sqrt(plain.v),
      sdPlain: disc * Math.sqrt(plain.v), sdAnti: disc * Math.sqrt(2 * an.v),
      callMc: disc * (P.anti ? ac.m : pc.m), putMc: disc * (P.anti ? ap.m : pp.m),
      eff: an.v > 0 ? plain.v / (2 * an.v) : NaN,
      evals: P.anti ? 2 * n : n
    };
  }

  // ── generation ───────────────────────────────────────────────────────────
  let firstDraw = null;
  function newPath(forcedU = null) {
    const b = new Float32Array(STEPS + 1), sq = Math.sqrt(1 / STEPS);
    spare = null;
    for (let j = 1; j <= STEPS; j++) {
      let z;
      if (j === 1 && forcedU) {
        const R = Math.sqrt(-2 * Math.log(forcedU[0])), th = 2 * Math.PI * forcedU[1];
        z = R * Math.cos(th);
        firstDraw = { u: forcedU.slice(), z };
      } else {
        z = normal();
        if (j === 1) firstDraw = { u: lastU.slice(), z };
      }
      b[j] = b[j - 1] + sq * z;
    }
    if (forcedU) {
      const targetZ = firstDraw.z;
      const shift = (targetZ - b[STEPS]) / STEPS;
      for (let j = 1; j <= STEPS; j++) b[j] += shift * j;
    }
    return b;
  }
  function storePath(b) {
    if (n >= CAP) return false;
    if (np < PCAP) { paths.set(b, np * (STEPS + 1)); bakePath(np); np++; }
    Z[n] = b[STEPS]; ingest(n, n + 1); n++;
    dirty.stats = true; dirty.deskEq = true;
    return true;
  }

  function spawnLeader(now, forcedU = null) {
    if (n >= CAP) return;
    const b = newPath(forcedU);
    leaders.push({ b, t0: now, dur: 1700, first: firstDraw });
  }

  function step(now) {
    if (!playing || n >= CAP) return;
    const e = (now - startTime) / 1000;
    if (now - lastSpawn > (e < 3 ? 900 : 650) && leaders.length < 3) { spawnLeader(now); lastSpawn = now; }
    if (e < 2.6) return;
    const rate = Math.min(2500, Math.floor(Math.pow(2, (e - 2.6) * 0.9)));
    const drawn = Math.min(rate, np < PCAP ? 10 : 0);
    for (let i = 0; i < drawn; i++) storePath(newPath());
    const bulk = Math.min(rate - drawn, CAP - n);
    if (bulk > 0) {
      for (let i = 0; i < bulk; i++) Z[n + i] = normal();
      ingest(n, n + bulk); n += bulk;
    }
    rateMeter.n += (drawn + Math.max(0, bulk)) * (P.anti ? 2 : 1);
    dirty.stats = true;
  }

  // ── Scroll Progress & Progressive Reveal Animations ──────────────────────
  const $ = id => document.getElementById(id);

  function updateScrollBar() {
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docH > 10 ? Math.min(100, Math.max(0, (window.scrollY / docH) * 100)) : 0;
    $("scrollBarFill").style.width = pct.toFixed(1) + "%";
  }
  window.addEventListener("scroll", updateScrollBar, { passive: true });

  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) en.target.classList.add("in");
    });
  }, { threshold: 0.08 });

  function observeReveals() {
    document.querySelectorAll(".reveal").forEach(el => revealObs.observe(el));
  }

  // ── Module Navigation ────────────────────────────────────────────────────
  function switchModule(mod, scrollTop = true) {
    activeMod = mod;
    document.querySelectorAll(".m-tab").forEach(btn => {
      const on = btn.dataset.mod === mod;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".j-step").forEach(btn => btn.classList.toggle("on", btn.dataset.goto === mod));
    document.querySelectorAll(".mod-view").forEach(v => v.classList.toggle("on", v.id === `mod-${mod}`));
    if (mod === "sim") { resize(); dirty.cloud = true; dirty.stats = true; }
    if (mod === "math") { resize(); dirty.labEq = true; }
    if (mod === "desk") { resize(); dirty.deskEq = true; }
    observeReveals();
    if (scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(updateScrollBar, 60);
  }

  document.querySelectorAll(".m-tab").forEach(btn => btn.addEventListener("click", () => switchModule(btn.dataset.mod)));
  document.querySelectorAll("[data-goto]").forEach(btn => btn.addEventListener("click", () => switchModule(btn.dataset.goto)));

  // ── Module 01: Single-Equation Path Spotlight (1 equation at a time) ─────
  let spotIdx = 0;
  const SPOT_META = [
    {
      tag: "Stage I of IV · Gaussian Shock",
      title: "Box–Muller turns two flat uniforms into a bell-curve shock",
      desc: "Each glowing trajectory begins with uniform random numbers in (0, 1) transformed into 64 standard normal steps. Their sum gives the terminal shock Z for that path.",
      nextLbl: "Next Stage: II. Drift & Itô →",
      eqLbl: "Stage I — Box–Muller evaluation for the newest trajectory"
    },
    {
      tag: "Stage II of IV · Geometric Brownian Motion",
      title: "Itô's Lemma evolves the spot price to expiry without bias",
      desc: "Because Brownian motion has quadratic variation (dW)² = dt, the exponential drift includes the −½σ² Itô correction, pulling the median below the mean.",
      nextLbl: "Next Stage: III. Payoff →",
      eqLbl: "Stage II — Exact terminal price S_T for the newest trajectory"
    },
    {
      tag: "Stage III of IV · Option Contract Payoff",
      title: "The hockey-stick payoff filters out-of-the-money futures",
      desc: "At expiry T, the option only cares where the path finishes relative to the strike K. In-the-money paths pay the difference; out-of-the-money paths expire worth 0.",
      nextLbl: "Next Stage: IV. Expectation →",
      eqLbl: "Stage III — Terminal payoff f(S_T) for the newest trajectory"
    },
    {
      tag: "Stage IV of IV · Law of Large Numbers",
      title: "Discounting the average across all simulated futures",
      desc: "As hundreds of thousands of payoffs are averaged and discounted at e^(−rT), the sampling error shrinks at 1/√N until the estimate locks onto Black–Scholes.",
      nextLbl: "Loop to Stage I: Chance ↺",
      eqLbl: "Stage IV — Running discounted Monte Carlo estimator vs. Black–Scholes"
    }
  ];

  function setSpotlight(idx) {
    spotIdx = idx % 4;
    document.querySelectorAll(".sp-btn").forEach((b, i) => b.classList.toggle("on", i === spotIdx));
    const m = SPOT_META[spotIdx];
    $("spStageTag").textContent = m.tag;
    $("spTitle").textContent = m.title;
    $("spDesc").textContent = m.desc;
    $("spNextBtn").textContent = m.nextLbl;
    $("spEqLabel").textContent = m.eqLbl;
    renderSpotlightEq(true);
  }

  document.querySelectorAll(".sp-btn").forEach(btn => {
    btn.addEventListener("click", () => setSpotlight(+btn.dataset.sp));
  });
  $("spNextBtn").addEventListener("click", () => setSpotlight((spotIdx + 1) % 4));
  $("spDeepBtn").addEventListener("click", () => {
    switchModule("math", false);
    setTimeout(() => {
      const chap = document.querySelector(`.math-chapter[data-chap="${spotIdx}"]`);
      if (chap) chap.scrollIntoView({ behavior: "smooth", block: "center" });
      setActiveChapter(spotIdx);
    }, 80);
  });

  function tex(el, s) { if (window.katex && el) katex.render(s, el, { throwOnError: false, displayMode: false, trust: true, strict: false }); }
  const hl = s => `\\htmlClass{hl}{${s}}`;

  function renderSpotlightEq(flash = false) {
    if (!window.katex) return;
    const z = last ? last.z : 0, sT = last ? last.sT : ST(0), f = last ? last.f : payoff(ST(0));
    const fd = last && last.first ? last.first : { u: [0.5, 0.5], z: 0 };
    const E = estimates(), bs = blackScholes(P), exact = bs[P.type];
    const el = $("spEq");
    if (spotIdx === 0) {
      tex(el, `z_1 = \\sqrt{-2\\ln ${fd.u[0].toFixed(3)}}\\,\\cos(2\\pi\\!\\cdot\\! ${fd.u[1].toFixed(3)}) = ${fd.z.toFixed(3)}\\quad\\Longrightarrow\\quad Z = \\tfrac{1}{8}\\textstyle\\sum_{j=1}^{64} z_j = ${hl(z.toFixed(4))}`);
    } else if (spotIdx === 1) {
      tex(el, `S_T = S_0\\,e^{(r-\\frac{1}{2}\\sigma^2)T+\\sigma\\sqrt{T}Z} = ${P.S0}\\,e^{${((P.r - 0.5 * P.sigma * P.sigma) * P.T).toFixed(3)} + ${(P.sigma * Math.sqrt(P.T)).toFixed(3)}(${z.toFixed(2)})} = ${hl("\\$" + sT.toFixed(2))}`);
    } else if (spotIdx === 2) {
      tex(el, P.type === "call"
        ? `f(S_T) = \\max(S_T - K,\\, 0) = \\max(${sT.toFixed(2)} - ${P.K},\\, 0) = ${hl("\\$" + f.toFixed(2))}`
        : `f(S_T) = \\max(K - S_T,\\, 0) = \\max(${P.K} - ${sT.toFixed(2)},\\, 0) = ${hl("\\$" + f.toFixed(2))}`);
    } else {
      tex(el, `\\hat{V}_N = e^{-${P.r.toFixed(3)}\\cdot${P.T.toFixed(2)}}\\frac{1}{${E.evals.toLocaleString().replace(/,/g, "{,}")}}\\sum_{i=1}^{N} f(S_T^{(i)}) = ${hl(n ? "\\$" + E.mc.toFixed(4) : "\\,?")}\\;\\longrightarrow\\;\\text{Black–Scholes } \\$${exact.toFixed(4)}`);
    }
    if (flash && el) {
      el.parentElement.style.borderColor = COL.ember;
      setTimeout(() => { el.parentElement.style.borderColor = ""; }, 380);
    }
  }

  // ── canvas plumbing (Module 01) ──────────────────────────────────────────
  const cv = $("main"), cx = cv.getContext("2d");
  const cc = $("conv"), ccx = cc.getContext("2d");
  const cloud = document.createElement("canvas"), clx = cloud.getContext("2d");
  let W = 0, H = 0, dpr = 1, L = {};

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rMain = cv.getBoundingClientRect();
    if (rMain.width > 0) {
      for (const c of [cv, cc]) { const r = c.getBoundingClientRect(); c.width = r.width * dpr; c.height = r.height * dpr; }
      W = cv.width / dpr; H = cv.height / dpr;
      const narrow = W < 640;
      const pad = { l: narrow ? 44 : 64, r: 18, t: 40, b: 38 };
      const side = narrow ? 0.2 : 0.17, gap = narrow ? 8 : 18;
      const pw = (W - pad.l - pad.r) * (1 - 2 * side) - 2 * gap;
      const sw = (W - pad.l - pad.r) * side;
      L = {
        pad, narrow, top: pad.t, bot: H - pad.b, h: H - pad.t - pad.b,
        paths: { x: pad.l, w: pw },
        dist: { x: pad.l + pw + gap, w: sw },
        pay: { x: pad.l + pw + gap * 2 + sw, w: sw }
      };
      cloud.width = Math.max(1, L.paths.w * dpr); cloud.height = Math.max(1, L.h * dpr);
      dirty.cloud = true;
    }
    dirty.labEq = true; dirty.deskEq = true;
  }

  const yOf = s => L.top + L.h * (1 - (s - range.lo) / (range.hi - range.lo));
  const sOf = y => range.lo + (1 - (y - L.top) / L.h) * (range.hi - range.lo);

  function pathStroke(ctx, b, x0, w, y0) {
    const d = (P.r - 0.5 * P.sigma * P.sigma) * P.T, v = volT();
    ctx.beginPath();
    for (let j = 0; j <= STEPS; j++) {
      const u = j / STEPS, s = P.S0 * Math.exp(d * u + v * b[j]);
      const x = x0 + u * w, y = yOf(s) - y0;
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
  }

  function bakePath(i) {
    if (dirty.cloud || !L.paths) return;
    const b = paths.subarray(i * (STEPS + 1), (i + 1) * (STEPS + 1));
    drawCloudPath(b, 1); if (P.anti) drawCloudPath(b.map(x => -x), -1);
  }
  function drawCloudPath(b) {
    const sEnd = P.S0 * Math.exp(drift() + volT() * b[STEPS]);
    const itm = P.type === "call" ? sEnd > P.K : sEnd < P.K;
    clx.strokeStyle = itm ? "rgba(255,106,61,0.05)" : "rgba(156,200,216,0.035)";
    pathStroke(clx, b, 0, L.paths.w, L.top);
    clx.stroke();
  }
  function redrawCloud() {
    if (!L.paths) return;
    clx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clx.clearRect(0, 0, cloud.width, cloud.height);
    clx.globalCompositeOperation = "lighter"; clx.lineWidth = 1; clx.lineJoin = "round";
    dirty.cloud = false;
    const neg = new Float32Array(STEPS + 1);
    for (let i = 0; i < np; i++) {
      const b = paths.subarray(i * (STEPS + 1), (i + 1) * (STEPS + 1));
      drawCloudPath(b);
      if (P.anti) { for (let j = 0; j <= STEPS; j++) neg[j] = -b[j]; drawCloudPath(neg); }
    }
  }

  let hover = null, dragK = false;

  function label(ctx, txt, x, y, color = COL.dim, align = "left", font = "11px 'IBM Plex Mono'") {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(txt, x, y);
  }
  function tag(ctx, txt, x, y, color, align = "left") {
    ctx.font = "11px 'IBM Plex Mono'";
    const w = ctx.measureText(txt).width + 8, x0 = align === "right" ? x - w + 4 : align === "center" ? x - w / 2 : x - 4;
    ctx.fillStyle = "rgba(10,9,8,0.82)"; ctx.fillRect(x0, y - 11, w, 15);
    label(ctx, txt, x, y, color, align);
  }
  function callout(ctx, num, title, x, y) {
    ctx.strokeStyle = COL.ember; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x + 9, y - 4, 9, 0, Math.PI * 2); ctx.stroke();
    label(ctx, num, x + 9, y, COL.ember, "center", "10px 'IBM Plex Mono'");
    label(ctx, title, x + 24, y, COL.paper, "left", "italic 17px 'Instrument Serif'");
  }

  function drawMain(now) {
    if (!L.paths) return;
    if (dirty.cloud) redrawCloud();
    const c = cx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const { paths: A, dist: D, pay: Y, top, bot, h } = L;

    c.lineWidth = 1; c.strokeStyle = COL.faint; c.beginPath();
    const ticks = niceTicks(range.lo, range.hi, 6);
    for (const s of ticks) { const y = Math.round(yOf(s)) + .5; c.moveTo(A.x, y); c.lineTo(Y.x + Y.w, y); }
    for (let i = 0; i <= 8; i++) { const x = Math.round(A.x + A.w * i / 8) + .5; c.moveTo(x, top); c.lineTo(x, bot); }
    c.stroke();
    for (const s of ticks) label(c, s.toFixed(0), A.x - 10, yOf(s) + 4, COL.dim, "right");
    const nt = L.narrow ? 2 : 4;
    for (let i = 0; i <= nt; i++) label(c, (P.T * i / nt).toFixed(2) + "y", A.x + A.w * i / nt, bot + 18, COL.dim, i === 0 ? "left" : i === nt ? "right" : "center");

    c.drawImage(cloud, A.x, top, A.w, h);

    const curve = (fn, dash, color, w = 1) => {
      c.setLineDash(dash); c.strokeStyle = color; c.lineWidth = w; c.beginPath();
      for (let j = 0; j <= 60; j++) { const u = j / 60, x = A.x + u * A.w, y = yOf(fn(u * P.T)); j ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke(); c.setLineDash([]);
    };
    const mu = t => (P.r - 0.5 * P.sigma * P.sigma) * t;
    for (const k of [-2, -1, 1, 2]) curve(t => P.S0 * Math.exp(mu(t) + k * P.sigma * Math.sqrt(t)), [2, 4], "rgba(236,230,217,0.35)");
    curve(t => P.S0 * Math.exp(P.r * t), [], "rgba(236,230,217,0.75)");
    const yEnd = (k) => yOf(P.S0 * Math.exp(mu(P.T) + k * P.sigma * Math.sqrt(P.T)));
    tag(c, "+2σ", A.x + A.w - 4, yEnd(2) - 5, COL.dim, "right");
    tag(c, "−2σ", A.x + A.w - 4, yEnd(-2) + 13, COL.dim, "right");
    tag(c, `E[S_T] = ${(P.S0 * Math.exp(P.r * P.T)).toFixed(1)}`, A.x + A.w - 4, yOf(P.S0 * Math.exp(P.r * P.T)) - 6, COL.paper, "right");

    for (const ld of leaders) {
      const prog = Math.min(1, (now - ld.t0) / ld.dur), m = Math.max(1, Math.floor(prog * STEPS));
      const d = drift(), v = volT();
      const pts = [];
      for (let j = 0; j <= m; j++) { const u = j / STEPS; pts.push([A.x + u * A.w, yOf(P.S0 * Math.exp(d * u + v * ld.b[j]))]); }
      c.shadowColor = COL.ember; c.shadowBlur = 10; c.strokeStyle = "rgba(255,240,225,0.95)"; c.lineWidth = 1.4;
      c.beginPath(); pts.forEach(([x, y], j) => j ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
      const [hx, hy] = pts[pts.length - 1];
      c.fillStyle = "#fff"; c.beginPath(); c.arc(hx, hy, 2.6, 0, 7); c.fill(); c.shadowBlur = 0;
      if (prog >= 1 && !ld.done) {
        ld.done = true; ld.tDone = now;
        storePath(ld.b);
        const sT = P.S0 * Math.exp(d + v * ld.b[STEPS]);
        last = { z: ld.b[STEPS], first: ld.first, sT, f: payoff(sT) };
        renderSpotlightEq(true);
      }
      if (ld.done) {
        const a = (now - ld.tDone) / 900;
        c.strokeStyle = `rgba(255,106,61,${Math.max(0, 1 - a)})`; c.beginPath(); c.arc(D.x, hy, 4 + a * 22, 0, 7); c.stroke();
      }
    }
    leaders = leaders.filter(l => !l.done || now - l.tDone < 900);

    c.fillStyle = COL.paper; c.beginPath(); c.arc(A.x, yOf(P.S0), 3, 0, 7); c.fill();
    label(c, "S₀", A.x + 7, yOf(P.S0) - 7, COL.paper);

    const bw = (range.hi - range.lo) / BINS, total = Math.max(1, acc.cnt);
    const m = Math.log(P.S0) + drift(), v = volT();
    const theo = new Float64Array(BINS);
    for (let b = 0; b < BINS; b++) {
      const a0 = range.lo + b * bw, a1 = a0 + bw;
      theo[b] = Phi((Math.log(a1) - m) / v) - (a0 > 0 ? Phi((Math.log(a0) - m) / v) : 0);
    }
    let maxT = 0; for (let b = 0; b < BINS; b++) maxT = Math.max(maxT, theo[b]);
    const sx = D.w / (maxT * 1.08), bh = h / BINS;
    const call = P.type === "call";
    for (let b = 0; b < BINS; b++) {
      const mid = range.lo + (b + 0.5) * bw, frac = hist[b] / total;
      const itm = call ? mid > P.K : mid < P.K;
      c.fillStyle = itm ? "rgba(255,106,61,0.75)" : "rgba(156,200,216,0.45)";
      c.fillRect(D.x, yOf(range.lo + (b + 1) * bw), Math.min(D.w, frac * sx), Math.max(1, bh - 0.6));
    }
    c.strokeStyle = COL.paper; c.lineWidth = 1.2; c.beginPath();
    for (let b = 0; b < BINS; b++) { const x = D.x + theo[b] * sx, y = yOf(range.lo + (b + 0.5) * bw); b ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    c.strokeStyle = COL.hair; c.beginPath(); c.moveTo(D.x + .5, top); c.lineTo(D.x + .5, bot); c.stroke();

    let fpMax = 0;
    const fp = new Float64Array(BINS), fpEmp = new Float64Array(BINS);
    for (let b = 0; b < BINS; b++) {
      const f = payoff(range.lo + (b + 0.5) * bw);
      fp[b] = f * theo[b]; fpEmp[b] = f * hist[b] / total; fpMax = Math.max(fpMax, fp[b]);
    }
    const sp = Y.w / (fpMax * 1.12 || 1);
    for (let b = 0; b < BINS; b++) {
      if (!fpEmp[b]) continue;
      c.fillStyle = "rgba(255,106,61,0.8)";
      c.fillRect(Y.x, yOf(range.lo + (b + 1) * bw), Math.min(Y.w, fpEmp[b] * sp), Math.max(1, bh - 0.6));
    }
    c.strokeStyle = COL.paper; c.lineWidth = 1.2; c.beginPath();
    for (let b = 0; b < BINS; b++) { const x = Y.x + fp[b] * sp, y = yOf(range.lo + (b + 0.5) * bw); b ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    c.setLineDash([3, 3]); c.strokeStyle = "rgba(236,230,217,0.45)"; c.beginPath();
    c.moveTo(Y.x, yOf(call ? range.lo : range.hi)); c.lineTo(Y.x, yOf(P.K));
    c.lineTo(Y.x + Y.w, yOf(call ? range.hi : range.lo)); c.stroke(); c.setLineDash([]);
    label(c, "f(S)", Y.x + Y.w - 2, yOf(call ? range.hi : range.lo) + (call ? 14 : -6), COL.dim, "right");
    c.strokeStyle = COL.hair; c.beginPath(); c.moveTo(Y.x + .5, top); c.lineTo(Y.x + .5, bot); c.stroke();

    const yK = Math.round(yOf(P.K)) + .5;
    c.strokeStyle = dragK || (hover && hover.nearK) ? COL.ember : "rgba(255,106,61,0.8)";
    c.lineWidth = dragK ? 2 : 1; c.setLineDash([6, 4]);
    c.beginPath(); c.moveTo(A.x, yK); c.lineTo(Y.x + Y.w, yK); c.stroke(); c.setLineDash([]);
    c.fillStyle = COL.ember; c.fillRect(A.x - 8, yK - 4, 8, 8);
    tag(c, `K = ${P.K.toFixed(0)}`, A.x + A.w * (L.narrow ? 0.3 : 0.5), yK + (call ? 15 : -7), COL.ember, "center");

    if (L.narrow) {
      callout(c, "II", "paths", A.x, top - 16);
      callout(c, "III", "f·p", Y.x - 6, top - 16);
    } else {
      callout(c, "II", "Brownian futures", A.x, top - 16);
      label(c, "where futures land", D.x, top - 12, COL.paper, "left", "italic 17px 'Instrument Serif'");
      callout(c, "III", "payoff × chance", Y.x, top - 16);
      label(c, `${(np * (P.anti ? 2 : 1)).toLocaleString()} drawn`, A.x + A.w, top - 12, COL.dim, "right");
    }

    if (hover && !dragK && hover.x >= A.x && hover.x <= A.x + A.w && hover.y > top && hover.y < bot) {
      const t = (hover.x - A.x) / A.w * P.T, s = sOf(hover.y);
      c.strokeStyle = "rgba(236,230,217,0.35)"; c.beginPath();
      c.moveTo(hover.x + .5, top); c.lineTo(hover.x + .5, bot); c.moveTo(A.x, hover.y + .5); c.lineTo(A.x + A.w, hover.y + .5); c.stroke();
      const pr = t > 1e-6 && s > 0 ? Phi((Math.log(s / P.S0) - mu(t)) / (P.sigma * Math.sqrt(t))) : (s >= P.S0 ? 1 : 0);
      const lines = [`t = ${t.toFixed(2)}y   S = ${s.toFixed(1)}`, `P(S_t > S) = ${(100 * (1 - pr)).toFixed(1)}%`];
      const bx = Math.min(hover.x + 12, A.x + A.w - 190), by = Math.max(top + 4, hover.y - 50);
      c.fillStyle = "rgba(13,12,11,0.88)"; c.fillRect(bx, by, 182, 42); c.strokeStyle = COL.hair; c.strokeRect(bx + .5, by + .5, 182, 42);
      label(c, lines[0], bx + 10, by + 17, COL.paper); label(c, lines[1], bx + 10, by + 33, COL.ember);
    }
  }

  function drawConv() {
    if (!L.pad) return;
    const c = ccx, w = cc.width / dpr, h = cc.height / dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const pad = { l: L.pad.l, r: 18, t: 34, b: 28 }, pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const bs = blackScholes(P)[P.type], E = estimates();
    const kMax = Math.max(1e4, E.evals * 1.15), lx = k => pad.l + pw * Math.log10(Math.max(1, k)) / Math.log10(kMax);
    const sd = Math.max(E.sdPlain, 1e-9), span = Math.max(4 * sd / Math.sqrt(60), bs * 0.002 + 1e-4);
    const ly = v => pad.t + ph / 2 - (v - bs) / span * (ph / 2);

    c.strokeStyle = COL.faint; c.lineWidth = 1; c.beginPath();
    for (let d = 1; Math.pow(10, d) <= kMax; d++) { const x = Math.round(lx(Math.pow(10, d))) + .5; c.moveTo(x, pad.t); c.lineTo(x, pad.t + ph); }
    c.stroke();
    for (let d = 1; Math.pow(10, d) <= kMax; d++) label(c, ["", "10", "100", "1k", "10k", "100k", "1M"][d] || "", lx(Math.pow(10, d)), pad.t + ph + 18, COL.dim, "center");

    c.fillStyle = "rgba(255,106,61,0.08)"; c.beginPath();
    const sdA = P.anti ? E.sdAnti : E.sdPlain;
    for (let j = 0; j <= 120; j++) { const k = Math.pow(kMax, j / 120) + 1; const x = lx(k), y = ly(bs + 1.96 * sdA / Math.sqrt(k)); j ? c.lineTo(x, Math.max(pad.t, y)) : c.moveTo(x, Math.max(pad.t, y)); }
    for (let j = 120; j >= 0; j--) { const k = Math.pow(kMax, j / 120) + 1; const x = lx(k), y = ly(bs - 1.96 * sdA / Math.sqrt(k)); c.lineTo(x, Math.min(pad.t + ph, y)); }
    c.fill();

    c.strokeStyle = COL.paper; c.setLineDash([]); c.beginPath(); c.moveTo(pad.l, ly(bs) + .5); c.lineTo(pad.l + pw, ly(bs) + .5); c.stroke();
    label(c, `Black–Scholes ${bs.toFixed(4)}`, pad.l + pw, ly(bs) - 7, COL.paper, "right");

    c.save(); c.beginPath(); c.rect(pad.l, pad.t - 2, pw, ph + 4); c.clip();
    const tr = (key, mult, color, lw) => {
      c.strokeStyle = color; c.lineWidth = lw; c.beginPath();
      trace.forEach((p, i) => { const x = lx(p.k * mult), y = ly(p[key]); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    };
    tr("plain", 1, P.anti ? "rgba(156,200,216,0.45)" : COL.frost, P.anti ? 1 : 1.5);
    if (P.anti) tr("anti", 2, COL.ember, 1.6);
    c.restore();
    if (n > 0) {
      const x = lx(E.evals), y = Math.min(pad.t + ph, Math.max(pad.t, ly(E.mc)));
      c.fillStyle = COL.ember; c.shadowColor = COL.ember; c.shadowBlur = 12; c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fill(); c.shadowBlur = 0;
    }
    callout(c, "IV", L.narrow ? "convergence" : "the law of large numbers", pad.l, 22);
    if (L.narrow) return;
    label(c, "error ∝ 1/√N   ·   shaded: 95% band", pad.l + pw, 18, COL.dim, "right");
    label(c, "— plain MC", pad.l + pw, 32, COL.frost, "right");
    if (P.anti) label(c, "— antithetic", pad.l + pw - 88, 32, COL.ember, "right");
  }

  function niceTicks(lo, hi, count) {
    const raw = Math.max(1e-6, (hi - lo) / count), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || mag;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
    return out;
  }

  let lastSpotRefresh = 0;
  function renderStats(now) {
    const E = estimates(), bs = blackScholes(P), exact = bs[P.type];
    $("topContract").textContent = `${P.type.toUpperCase()} · S₀ ${P.S0} · K ${P.K} · σ ${(P.sigma * 100).toFixed(0)}% · T ${P.T.toFixed(2)}y`;
    $("roMc").textContent = n ? E.mc.toFixed(4) : "—";
    $("roCi").textContent = n ? `± ${(1.96 * E.se).toFixed(4)}  (95%)` : "waiting for futures…";
    $("roBs").textContent = exact.toFixed(4);
    $("roType").textContent = `European ${P.type}`;
    const z = E.se > 0 ? (E.mc - exact) / E.se : 0;
    $("roZ").textContent = n > 30 ? (z >= 0 ? "+" : "") + z.toFixed(2) + " SE" : "—";
    $("roZdot").style.left = `${50 + Math.max(-3.8, Math.min(3.8, z)) / 3.84 * 48.5}%`;
    $("roN").textContent = E.evals.toLocaleString();
    if (now - rateMeter.t > 500) { rateMeter.v = rateMeter.n / ((now - rateMeter.t) / 1000); rateMeter.t = now; rateMeter.n = 0; }
    $("roRate").textContent = n >= CAP ? "experiment complete" : playing ? `${Math.round(rateMeter.v).toLocaleString()} paths / s` : "paused";

    const pItmTh = P.type === "call" ? Phi(bs.d2) : Phi(-bs.d2);
    $("dItm").textContent = acc.cnt ? (100 * acc.itm / acc.cnt).toFixed(2) + "%" : "—";
    $("dItmTh").textContent = `theory N(${P.type === "call" ? "" : "−"}d₂) = ${(100 * pItmTh).toFixed(2)}%`;
    const delta = P.type === "call" ? bs.deltaCall : bs.deltaPut;
    $("dDelta").textContent = (delta >= 0 ? "+" : "") + delta.toFixed(4);
    $("dDeltaTxt").textContent = `${P.type === "call" ? "N(d₁)" : "N(d₁) − 1"}: shares to hedge one option`;
    const gap = E.callMc - E.putMc - (P.S0 - P.K * Math.exp(-P.r * P.T));
    $("dParity").textContent = n ? (gap >= 0 ? "+" : "") + gap.toFixed(4) : "—";
    $("dEff").textContent = Number.isFinite(E.eff) && n > 30 ? `× ${E.eff.toFixed(2)}` : "—";

    if (spotIdx === 3 && now - lastSpotRefresh > 220) {
      lastSpotRefresh = now;
      renderSpotlightEq(false);
    }
  }

  // ── controls (Module 01) ─────────────────────────────────────────────────
  const knobs = [
    ["kS0", "vS0", "S0", v => v.toFixed(0)], ["kK", "vK", "K", v => v.toFixed(0)],
    ["kSig", "vSig", "sigma", v => (v * 100).toFixed(0) + "%"], ["kR", "vR", "r", v => (v * 100).toFixed(2) + "%"],
    ["kT", "vT", "T", v => v.toFixed(2) + "y"]
  ];
  let pending = false;
  function schedule() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => { pending = false; recompute(); renderSpotlightEq(false); syncLabFromMain(); });
    }
  }
  function syncMainKnobsUI() {
    for (const [id, out, key, f] of knobs) {
      $(id).value = P[key];
      $(out).textContent = f(P[key]);
    }
    document.querySelectorAll(".seg button[data-type]").forEach(x => x.classList.toggle("on", x.dataset.type === P.type));
  }
  for (const [id, out, key, f] of knobs) {
    const el = $(id);
    const sync = () => { P[key] = parseFloat(el.value); $(out).textContent = f(P[key]); };
    sync(); el.addEventListener("input", () => { sync(); if (last) { last.sT = ST(last.z); last.f = payoff(last.sT); } schedule(); });
  }
  function setK(k) {
    k = Math.round(Math.max(+$("kK").min, Math.min(+$("kK").max, k)));
    if (k === P.K) return;
    $("kK").value = k; $("kK").dispatchEvent(new Event("input"));
  }
  document.querySelectorAll(".seg button[data-type]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".seg button[data-type]").forEach(x => x.classList.toggle("on", x === b));
    P.type = b.dataset.type; if (last) last.f = payoff(last.sT); schedule();
  }));
  $("kAnti").addEventListener("change", e => { P.anti = e.target.checked; schedule(); });
  $("bPlay").addEventListener("click", () => {
    playing = !playing; $("bPlay").textContent = playing ? "Pause" : "Play";
    if (playing && n === 0) startTime = performance.now();
  });
  $("bReseed").addEventListener("click", () => reset((Math.random() * 2 ** 32) >>> 0));

  function reset(s) {
    setSeed(s); n = 0; np = 0; leaders = []; last = null;
    startTime = performance.now(); lastSpawn = 0; playing = true; $("bPlay").textContent = "Pause";
    $("seedLbl").textContent = `seed ${s.toString(16).padStart(8, "0")}`;
    recompute(); renderSpotlightEq(false);
  }

  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener("pointermove", e => {
    if (!L.paths) return;
    const p = pos(e);
    if (dragK) { setK(sOf(p.y)); return; }
    hover = { ...p, nearK: Math.abs(p.y - yOf(P.K)) < 9 && p.x > L.paths.x - 10 };
    cv.style.cursor = hover.nearK ? "ns-resize" : "crosshair";
  });
  cv.addEventListener("pointerleave", () => { hover = null; });
  cv.addEventListener("pointerdown", e => {
    if (!L.paths) return;
    const p = pos(e);
    if (Math.abs(p.y - yOf(P.K)) < 10 && p.x > L.paths.x - 10) {
      dragK = true; cv.setPointerCapture(e.pointerId); $("hint").style.opacity = 0; e.preventDefault();
    }
  });
  const endDrag = () => { dragK = false; };
  cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);

  // =========================================================================
  // MODULE 02 — SCROLL-DRIVEN SLOW-BURN MATHEMATICAL JOURNEY
  // =========================================================================
  const lab = {
    active: 0,
    u1: 0.280, u2: 0.160,
    itoZ: 0.0, showNaive: true,
    probeS: 130,
    avZ: 1.15
  };

  function setActiveChapter(idx) {
    if (lab.active !== idx) dirty.labEq = true;
    lab.active = idx;
    document.querySelectorAll(".math-chapter").forEach((ch, i) => ch.classList.toggle("active", i === idx));
    document.querySelectorAll(".st-pill").forEach((p, i) => p.classList.toggle("on", i === idx));
    document.querySelectorAll(".st-ctrl-group").forEach((g, i) => g.classList.toggle("on", i === idx));
  }

  // IntersectionObserver for Scrollytelling chapters
  const chapObs = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting && activeMod === "math") {
        setActiveChapter(+en.target.dataset.chap);
      }
    });
  }, { rootMargin: "-28% 0px -42% 0px", threshold: 0.05 });

  document.querySelectorAll(".math-chapter").forEach(ch => chapObs.observe(ch));

  document.querySelectorAll(".st-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const idx = +pill.dataset.jump;
      setActiveChapter(idx);
      const ch = document.querySelector(`.math-chapter[data-chap="${idx}"]`);
      if (ch) ch.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  function syncLabFromMain() {
    $("itoSig").value = P.sigma;
    $("itoSigVal").textContent = (P.sigma * 100).toFixed(0) + "%";
    $("bsK").value = P.K;
    $("bsKVal").textContent = P.K.toFixed(0);
    document.querySelectorAll("button[data-bstype]").forEach(b => b.classList.toggle("on", b.dataset.bstype === P.type));
    dirty.labEq = true; dirty.deskEq = true;
  }

  // Chapter I controls (Box-Muller)
  $("bmU1").addEventListener("input", e => { lab.u1 = +e.target.value; $("bmU1Val").textContent = lab.u1.toFixed(3); dirty.labEq = true; });
  $("bmU2").addEventListener("input", e => { lab.u2 = +e.target.value; $("bmU2Val").textContent = lab.u2.toFixed(3); dirty.labEq = true; });
  $("bmRoll").addEventListener("click", () => {
    lab.u1 = Math.max(0.005, Math.min(0.995, +(Math.random()).toFixed(3)));
    lab.u2 = Math.max(0.005, Math.min(0.995, +(Math.random()).toFixed(3)));
    $("bmU1").value = lab.u1; $("bmU1Val").textContent = lab.u1.toFixed(3);
    $("bmU2").value = lab.u2; $("bmU2Val").textContent = lab.u2.toFixed(3);
    dirty.labEq = true;
  });
  $("bmSend").addEventListener("click", () => {
    switchModule("sim", true);
    spawnLeader(performance.now(), [lab.u1, lab.u2]);
  });

  // Chapter II controls (Ito's Lemma)
  $("itoZ").addEventListener("input", e => {
    lab.itoZ = +e.target.value;
    $("itoZVal").textContent = (lab.itoZ >= 0 ? "+" : "") + lab.itoZ.toFixed(2) + "σ";
    dirty.labEq = true;
  });
  $("itoSig").addEventListener("input", e => {
    $("kSig").value = e.target.value;
    $("kSig").dispatchEvent(new Event("input"));
  });
  $("itoShowNaive").addEventListener("change", e => { lab.showNaive = e.target.checked; dirty.labEq = true; });

  // Chapter III controls (Black-Scholes & Payoff)
  $("bsK").addEventListener("input", e => { setK(+e.target.value); });
  $("bsProbe").addEventListener("input", e => {
    lab.probeS = +e.target.value;
    $("bsProbeVal").textContent = lab.probeS.toFixed(0);
    dirty.labEq = true;
  });
  document.querySelectorAll("button[data-bstype]").forEach(b => b.addEventListener("click", () => {
    const mainBtn = document.querySelector(`.seg button[data-type="${b.dataset.bstype}"]`);
    if (mainBtn) mainBtn.click();
  }));

  // Chapter IV controls (Antithetic Variates)
  $("avZ").addEventListener("input", e => {
    lab.avZ = +e.target.value;
    $("avZVal").textContent = (lab.avZ >= 0 ? "+" : "") + lab.avZ.toFixed(2) + "σ";
    dirty.labEq = true;
  });
  $("avSample").addEventListener("click", () => {
    const u1 = Math.max(0.01, Math.random()), u2 = Math.random();
    const z = Math.max(-2.6, Math.min(2.6, Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)));
    lab.avZ = z;
    $("avZ").value = z;
    $("avZVal").textContent = (z >= 0 ? "+" : "") + z.toFixed(2) + "σ";
    dirty.labEq = true;
  });
  $("avToggleMain").addEventListener("click", () => {
    $("kAnti").checked = !$("kAnti").checked;
    $("kAnti").dispatchEvent(new Event("change"));
    switchModule("sim", true);
  });

  function setupSubCanvas(id) {
    const c = $(id);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (r.width === 0) return null;
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    return { ctx, w: r.width, h: r.height };
  }

  // Continuous living animations inside Module 02's sticky canvas
  function drawMathStage(now) {
    if (activeMod !== "math") return;
    const s = setupSubCanvas("mathStageCanvas");
    if (!s) return;
    const { ctx: c, w, h } = s;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
    const phase = (now * 0.00055) % 1;

    if (lab.active === 0) {
      // Chapter I: Box-Muller with animated sweeping ray & pulsing projection
      const u1 = lab.u1, u2 = lab.u2;
      const R = Math.sqrt(-2 * Math.log(u1)), th = 2 * Math.PI * u2;
      const z1 = R * Math.cos(th), z2 = R * Math.sin(th);

      const pad = 36, sq = Math.min(h - 2 * pad, w * 0.38 - pad);
      const x1 = pad, y1 = (h - sq) / 2;

      label(c, "1. Uniform square (U₁, U₂) ∈ (0,1)²", x1, y1 - 12, COL.paper);
      c.strokeStyle = COL.hair; c.lineWidth = 1;
      c.strokeRect(x1 + .5, y1 + .5, sq, sq);
      c.strokeStyle = COL.faint; c.beginPath();
      for (let i = 1; i < 4; i++) {
        c.moveTo(x1 + sq * i / 4, y1); c.lineTo(x1 + sq * i / 4, y1 + sq);
        c.moveTo(x1, y1 + sq * i / 4); c.lineTo(x1 + sq, y1 + sq * i / 4);
      }
      c.stroke();

      const ux = x1 + u1 * sq, uy = y1 + (1 - u2) * sq;
      c.strokeStyle = "rgba(255,106,61,0.45)"; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(ux, y1 + sq); c.lineTo(ux, uy); c.lineTo(x1, uy); c.stroke(); c.setLineDash([]);
      c.strokeStyle = `rgba(255,106,61,${0.25 + 0.4 * pulse})`;
      c.beginPath(); c.arc(ux, uy, 6 + 4 * pulse, 0, 7); c.stroke();
      c.fillStyle = COL.ember; c.beginPath(); c.arc(ux, uy, 5, 0, 7); c.fill();
      label(c, `U₁=${u1.toFixed(2)}`, ux, y1 + sq + 16, COL.ember, "center");
      label(c, `U₂=${u2.toFixed(2)}`, x1 + 6, uy - 6, COL.frost, "left");

      const cx0 = x1 + sq + (w - (x1 + sq)) * 0.52, cy0 = h * 0.44;
      const radMax = Math.min(h * 0.35, (w - (x1 + sq)) * 0.40);
      const scaleR = radMax / 3.2;

      label(c, "2. Polar Gaussian space (Z₁, Z₂) ~ N(0,1)", cx0 - radMax, y1 - 12, COL.paper);
      c.strokeStyle = COL.faint; c.beginPath();
      for (const sig of [1, 2, 3]) { c.moveTo(cx0 + sig * scaleR, cy0); c.arc(cx0, cy0, sig * scaleR, 0, Math.PI * 2); }
      c.moveTo(cx0 - radMax, cy0); c.lineTo(cx0 + radMax, cy0);
      c.moveTo(cx0, cy0 - radMax); c.lineTo(cx0, cy0 + radMax);
      c.stroke();
      label(c, "1σ", cx0 + scaleR + 3, cy0 - 3, COL.dim);
      label(c, "2σ", cx0 + 2 * scaleR + 3, cy0 - 3, COL.dim);

      const rPx = Math.min(radMax, R * scaleR);
      c.strokeStyle = "rgba(156,200,216,0.35)"; c.setLineDash([2, 3]);
      c.beginPath(); c.arc(cx0, cy0, rPx, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);

      // Animated angle arc showing θ = 2π U2
      c.strokeStyle = "rgba(156,200,216,0.55)"; c.lineWidth = 1.5;
      c.beginPath(); c.arc(cx0, cy0, Math.min(24, rPx * 0.6), -th, 0); c.stroke();

      const zx = cx0 + Math.max(-3.2, Math.min(3.2, z1)) * scaleR;
      const zy = cy0 - Math.max(-3.2, Math.min(3.2, z2)) * scaleR;
      c.strokeStyle = COL.frost; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(cx0, cy0); c.lineTo(zx, zy); c.stroke();

      // Animated photon traveling down the projection line to the bell curve
      const bellBase = h - 22, bellH = 54;
      c.strokeStyle = "rgba(255,106,61,0.5)"; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(zx, zy); c.lineTo(zx, bellBase); c.stroke(); c.setLineDash([]);
      const pyTravel = zy + (bellBase - zy) * phase;
      c.fillStyle = COL.ember; c.beginPath(); c.arc(zx, pyTravel, 3, 0, 7); c.fill();
      c.fillStyle = COL.ember; c.beginPath(); c.arc(zx, zy, 5, 0, 7); c.fill();

      c.fillStyle = "rgba(255,106,61,0.14)";
      c.strokeStyle = COL.paper; c.lineWidth = 1.2; c.beginPath();
      for (let j = -64; j <= 64; j++) {
        const zVal = (j / 64) * 3.2;
        const bx = cx0 + zVal * scaleR, by = bellBase - (phi(zVal) / phi(0)) * bellH;
        j === -64 ? c.moveTo(bx, bellBase) : c.lineTo(bx, by);
      }
      c.lineTo(cx0 + 3.2 * scaleR, bellBase); c.closePath(); c.fill(); c.stroke();
      const byDot = bellBase - (phi(z1) / phi(0)) * bellH;
      c.fillStyle = COL.ember; c.beginPath(); c.arc(zx, byDot, 4.5 + 1.5 * pulse, 0, 7); c.fill();
      tag(c, `Z₁ = ${(z1 >= 0 ? "+" : "") + z1.toFixed(2)}σ`, zx, byDot - 10, COL.ember, "center");

      if (dirty.labEq && window.katex) {
        dirty.labEq = false;
        tex($("mathLiveEq"),
          `\\begin{aligned}` +
          `R &= \\sqrt{-2\\ln ${u1.toFixed(3)}} = ${R.toFixed(3)},\\quad \\theta = 2\\pi(${u2.toFixed(3)}) = ${th.toFixed(2)}\\text{ rad}\\\\` +
          `Z_1 &= R\\cos\\theta = ${hl((z1 >= 0 ? "+" : "") + z1.toFixed(4))},\\quad Z_2 = R\\sin\\theta = ${(z2 >= 0 ? "+" : "") + z2.toFixed(4)}` +
          `\\end{aligned}`
        );
      }
    } else if (lab.active === 1) {
      // Chapter II: Ito's Lemma with animated wave packet traveling along the drift-diffusion cone
      const pad = { l: 54, r: 132, t: 32, b: 32 }, pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const S0 = P.S0, r = P.r, sig = P.sigma, T = P.T, z = lab.itoZ;
      const sMean = S0 * Math.exp(r * T);
      const sMed = S0 * Math.exp((r - 0.5 * sig * sig) * T);
      const sIto = S0 * Math.exp((r - 0.5 * sig * sig) * T + sig * Math.sqrt(T) * z);
      const sNaive = S0 * Math.exp(r * T + sig * Math.sqrt(T) * z);

      const hi = Math.max(S0 * 1.6, sMean * 1.35, sNaive * 1.12, S0 * Math.exp((r - 0.5 * sig * sig) * T + 2 * sig * Math.sqrt(T)) * 1.05);
      const lo = Math.max(0, Math.min(S0 * 0.45, sIto * 0.85, S0 * Math.exp((r - 0.5 * sig * sig) * T - 2 * sig * Math.sqrt(T)) * 0.9));
      const xOf = u => pad.l + u * pw;
      const yL = val => pad.t + ph * (1 - (val - lo) / (hi - lo));

      c.strokeStyle = COL.faint; c.lineWidth = 1; c.beginPath();
      for (const tk of niceTicks(lo, hi, 5)) {
        const y = Math.round(yL(tk)) + .5;
        c.moveTo(pad.l, y); c.lineTo(pad.l + pw, y);
        label(c, tk.toFixed(0), pad.l - 8, y + 4, COL.dim, "right");
      }
      c.stroke();
      label(c, "t = 0", pad.l, pad.t + ph + 18, COL.dim, "left");
      label(c, `T = ${T.toFixed(2)}y`, pad.l + pw, pad.t + ph + 18, COL.dim, "right");

      c.fillStyle = "rgba(236,230,217,0.05)"; c.beginPath();
      for (let j = 0; j <= 60; j++) {
        const u = j / 60, t = u * T;
        const val = S0 * Math.exp((r - 0.5 * sig * sig) * t + sig * Math.sqrt(t));
        j ? c.lineTo(xOf(u), yL(val)) : c.moveTo(xOf(u), yL(val));
      }
      for (let j = 60; j >= 0; j--) {
        const u = j / 60, t = u * T;
        const val = S0 * Math.exp((r - 0.5 * sig * sig) * t - sig * Math.sqrt(t));
        c.lineTo(xOf(u), yL(val));
      }
      c.closePath(); c.fill();

      const drawCurve = (fn, col, dash = [], lw = 1.5) => {
        c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash); c.beginPath();
        for (let j = 0; j <= 64; j++) { const u = j / 64; const x = xOf(u), y = yL(fn(u * T)); j ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.stroke(); c.setLineDash([]);
      };
      drawCurve(t => S0 * Math.exp(r * t), COL.paper, [], 1.3);
      drawCurve(t => S0 * Math.exp((r - 0.5 * sig * sig) * t), "rgba(255,106,61,0.5)", [4, 4], 1.2);
      if (lab.showNaive) drawCurve(t => S0 * Math.exp(r * t + sig * Math.sqrt(t) * z), COL.frost, [3, 3], 1.4);
      drawCurve(t => S0 * Math.exp((r - 0.5 * sig * sig) * t + sig * Math.sqrt(t) * z), COL.ember, [], 2.2);

      // Animated time-evolution particle comparing Naive vs Ito along t ∈ [0, T]
      const tAnim = phase * T;
      const sItoT = S0 * Math.exp((r - 0.5 * sig * sig) * tAnim + sig * Math.sqrt(tAnim) * z);
      c.fillStyle = "#fff"; c.beginPath(); c.arc(xOf(phase), yL(sItoT), 3.5, 0, 7); c.fill();

      const rLabels = [
        { txt: `Itô S_T: ${sIto.toFixed(1)}`, y: yL(sIto), col: COL.ember },
        { txt: `Mean: ${sMean.toFixed(1)}`, y: yL(sMean), col: COL.paper },
        { txt: `Median: ${sMed.toFixed(1)}`, y: yL(sMed), col: COL.dim }
      ];
      if (lab.showNaive) rLabels.push({ txt: `Naive: ${sNaive.toFixed(1)}`, y: yL(sNaive), col: COL.frost });
      rLabels.sort((a, b) => a.y - b.y);
      for (let i = 1; i < rLabels.length; i++) {
        if (rLabels[i].y - rLabels[i - 1].y < 14) rLabels[i].y = rLabels[i - 1].y + 14;
      }
      c.fillStyle = COL.ember; c.beginPath(); c.arc(pad.l + pw, yL(sIto), 4.5 + 1.2 * pulse, 0, 7); c.fill();
      for (const rl of rLabels) label(c, rl.txt, pad.l + pw + 8, rl.y + 4, rl.col, "left");

      if (dirty.labEq && window.katex) {
        dirty.labEq = false;
        const dragPct = (1 - Math.exp(-0.5 * sig * sig * T)) * 100;
        tex($("mathLiveEq"),
          `S_T = ${S0}\\,\\exp\\!\\Big(\\underbrace{(${r.toFixed(3)} - ${hl(`\\tfrac{1}{2}(${sig.toFixed(2)})^2`)})\\cdot ${T.toFixed(2)}}_{\\text{net drift } ${((r - 0.5 * sig * sig) * T).toFixed(4)}} + ${sig.toFixed(2)}\\sqrt{${T.toFixed(2)}}(${z.toFixed(2)})\\Big) = ${hl("\\$" + sIto.toFixed(2))}` +
          `\\quad\\big(\\text{Itô drag } -${dragPct.toFixed(1)}\\%\\big)`
        );
      }
    } else if (lab.active === 2) {
      // Chapter III: Risk-Neutral Valuation with animated probability darts falling onto the integrand
      const pad = { l: 50, r: 24, t: 26, b: 32 }, pw = w - pad.l - pad.r;
      const topH = (h - pad.t - pad.b - 26) * 0.48, botY = pad.t + topH + 26, botH = h - botY - pad.b;

      const { lo, hi } = range, call = P.type === "call";
      const xOf = st => pad.l + ((st - lo) / (hi - lo)) * pw;
      const m = Math.log(P.S0) + drift(), v = volT();
      const pdf = st => st > 0 ? phi((Math.log(st) - m) / v) / (st * v) : 0;

      let maxPdf = 0, maxFp = 0;
      const N = 160;
      for (let i = 0; i <= N; i++) {
        const st = lo + (hi - lo) * i / N, p = pdf(st), fp = payoff(st) * p;
        if (p > maxPdf) maxPdf = p;
        if (fp > maxFp) maxFp = fp;
      }
      maxPdf = maxPdf || 1; maxFp = maxFp || 1;

      label(c, "1. Terminal density p(S_T)  —  shaded area = P(exercise) = N(d₂)", pad.l, pad.t - 8, COL.paper);
      c.fillStyle = "rgba(255,106,61,0.22)"; c.beginPath();
      let started = false;
      for (let i = 0; i <= N; i++) {
        const st = lo + (hi - lo) * i / N;
        if (call ? st >= P.K : st <= P.K) {
          const x = xOf(st), y = pad.t + topH * (1 - pdf(st) / (maxPdf * 1.1));
          if (!started) { c.moveTo(x, pad.t + topH); c.lineTo(x, y); started = true; } else c.lineTo(x, y);
        }
      }
      if (started) { c.lineTo(xOf(call ? hi : P.K), pad.t + topH); c.closePath(); c.fill(); }

      c.strokeStyle = COL.paper; c.lineWidth = 1.4; c.beginPath();
      for (let i = 0; i <= N; i++) {
        const st = lo + (hi - lo) * i / N, x = xOf(st), y = pad.t + topH * (1 - pdf(st) / (maxPdf * 1.1));
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
      c.strokeStyle = COL.hair; c.beginPath(); c.moveTo(pad.l, pad.t + topH + .5); c.lineTo(pad.l + pw, pad.t + topH + .5); c.stroke();

      label(c, "2. Weighted payoff f(S_T)·p(S_T)  —  area × e^(−rT) = Black–Scholes price", pad.l, botY - 8, COL.paper);
      c.fillStyle = "rgba(255,106,61,0.35)"; c.beginPath();
      c.moveTo(xOf(lo), botY + botH);
      for (let i = 0; i <= N; i++) {
        const st = lo + (hi - lo) * i / N, x = xOf(st), y = botY + botH * (1 - (payoff(st) * pdf(st)) / (maxFp * 1.12));
        c.lineTo(x, y);
      }
      c.lineTo(xOf(hi), botY + botH); c.closePath(); c.fill();

      c.strokeStyle = COL.ember; c.lineWidth = 1.6; c.beginPath();
      for (let i = 0; i <= N; i++) {
        const st = lo + (hi - lo) * i / N, x = xOf(st), y = botY + botH * (1 - (payoff(st) * pdf(st)) / (maxFp * 1.12));
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
      c.strokeStyle = COL.hair; c.beginPath(); c.moveTo(pad.l, botY + botH + .5); c.lineTo(pad.l + pw, botY + botH + .5); c.stroke();

      const xK = xOf(P.K);
      c.strokeStyle = COL.ember; c.setLineDash([4, 4]); c.beginPath();
      c.moveTo(xK, pad.t); c.lineTo(xK, botY + botH); c.stroke(); c.setLineDash([]);
      tag(c, `K = ${P.K}`, xK, pad.t + 14, COL.ember, "center");

      const sp = Math.max(lo, Math.min(hi, lab.probeS)), xP = xOf(sp);
      c.strokeStyle = COL.frost; c.lineWidth = 1.2; c.beginPath();
      c.moveTo(xP, pad.t); c.lineTo(xP, botY + botH); c.stroke();
      const yTopDot = pad.t + topH * (1 - pdf(sp) / (maxPdf * 1.1));
      const yBotDot = botY + botH * (1 - (payoff(sp) * pdf(sp)) / (maxFp * 1.12));
      c.fillStyle = COL.frost; c.beginPath(); c.arc(xP, yTopDot, 4, 0, 7); c.fill();
      c.fillStyle = COL.ember; c.beginPath(); c.arc(xP, yBotDot, 4.5 + 1.2 * pulse, 0, 7); c.fill();
      tag(c, `S_T = ${sp.toFixed(0)} → payoff $${payoff(sp).toFixed(0)}`, xP, botY + 16, COL.frost, "center");

      for (const tk of niceTicks(lo, hi, 6)) label(c, tk.toFixed(0), xOf(tk), botY + botH + 18, COL.dim, "center");

      if (dirty.labEq && window.katex) {
        dirty.labEq = false;
        const bs = blackScholes(P), exact = bs[P.type];
        const nd1 = call ? Phi(bs.d1) : Phi(-bs.d1), nd2 = call ? Phi(bs.d2) : Phi(-bs.d2);
        tex($("mathLiveEq"),
          call
            ? `C = S_0 N(d_1) - K e^{-rT} N(d_2) = ${P.S0}(${nd1.toFixed(3)}) - ${P.K}e^{-${(P.r * P.T).toFixed(3)}}(${nd2.toFixed(3)}) = ${hl("\\$" + exact.toFixed(4))}`
            : `P = K e^{-rT} N(-d_2) - S_0 N(-d_1) = ${P.K}e^{-${(P.r * P.T).toFixed(3)}}(${nd2.toFixed(3)}) - ${P.S0}(${nd1.toFixed(3)}) = ${hl("\\$" + exact.toFixed(4))}`
        );
      }
    } else if (lab.active === 3) {
      // Chapter IV: Antithetic Variates with animated twin particles & pulsing midpoint
      const pad = { l: 52, r: 162, t: 30, b: 32 }, pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;

      const S0 = P.S0, K = P.K, r = P.r, sig = P.sigma, T = P.T, z = lab.avZ;
      const d = drift(), v = volT(), disc = Math.exp(-r * T);
      const sPlus = S0 * Math.exp(d + v * z), sMinus = S0 * Math.exp(d - v * z);
      const fPlus = disc * payoff(sPlus), fMinus = disc * payoff(sMinus), fPair = 0.5 * (fPlus + fMinus);
      const bs = blackScholes(P)[P.type];

      const hi = Math.max(S0 * 1.5, K * 1.25, sPlus * 1.08, sMinus * 1.08);
      const lo = Math.max(0, Math.min(S0 * 0.55, K * 0.75, sPlus * 0.9, sMinus * 0.9));
      const xOf = u => pad.l + u * pw, yL = val => pad.t + ph * (1 - (val - lo) / (hi - lo));

      c.strokeStyle = COL.faint; c.lineWidth = 1; c.beginPath();
      for (const tk of niceTicks(lo, hi, 5)) {
        const y = Math.round(yL(tk)) + .5;
        c.moveTo(pad.l, y); c.lineTo(pad.l + pw, y);
        label(c, tk.toFixed(0), pad.l - 8, y + 4, COL.dim, "right");
      }
      c.stroke();

      const yK = Math.round(yL(K)) + .5;
      c.strokeStyle = "rgba(255,106,61,0.55)"; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(pad.l, yK); c.lineTo(pad.l + pw, yK); c.stroke(); c.setLineDash([]);
      tag(c, `Strike K = ${K}`, pad.l + 50, yK - 6, COL.ember, "left");

      const ptAt = (sign, u) => {
        const t = u * T;
        const bridge = sign * (z * u + 0.18 * Math.sin(Math.PI * 3 * u) * (1 - u));
        return S0 * Math.exp((r - 0.5 * sig * sig) * t + sig * Math.sqrt(T) * bridge);
      };
      const drawTraj = (sign, col) => {
        c.strokeStyle = col; c.lineWidth = 2; c.beginPath();
        for (let j = 0; j <= 64; j++) {
          const u = j / 64, st = ptAt(sign, u);
          j ? c.lineTo(xOf(u), yL(st)) : c.moveTo(xOf(u), yL(st));
        }
        c.stroke();
      };
      drawTraj(1, COL.ember);
      drawTraj(-1, COL.frost);

      // Animated twin particles racing symmetrically along +Z and -Z
      c.fillStyle = "#fff";
      c.beginPath(); c.arc(xOf(phase), yL(ptAt(1, phase)), 3.2, 0, 7); c.fill();
      c.beginPath(); c.arc(xOf(phase), yL(ptAt(-1, phase)), 3.2, 0, 7); c.fill();

      c.fillStyle = COL.ember; c.beginPath(); c.arc(pad.l + pw, yL(sPlus), 4.5, 0, 7); c.fill();
      c.fillStyle = COL.frost; c.beginPath(); c.arc(pad.l + pw, yL(sMinus), 4.5, 0, 7); c.fill();

      let yP = yL(sPlus), yM = yL(sMinus);
      if (Math.abs(yP - yM) < 16) {
        const mid = 0.5 * (yP + yM);
        yP = sPlus >= sMinus ? mid - 8 : mid + 8;
        yM = sPlus >= sMinus ? mid + 8 : mid - 8;
      }
      label(c, `+Z: S⁺=${sPlus.toFixed(1)}, f⁺=${fPlus.toFixed(1)}`, pad.l + pw + 8, yP + 4, COL.ember, "left");
      label(c, `−Z: S⁻=${sMinus.toFixed(1)}, f⁻=${fMinus.toFixed(1)}`, pad.l + pw + 8, yM + 4, COL.frost, "left");

      if (dirty.labEq && window.katex) {
        dirty.labEq = false;
        tex($("mathLiveEq"),
          `f^+ = \\$${fPlus.toFixed(2)},\\quad f^- = \\$${fMinus.toFixed(2)}\\quad\\Longrightarrow\\quad ` +
          `\\text{Pair average } \\bar{f} = \\tfrac{1}{2}(f^+ + f^-) = ${hl("\\$" + fPair.toFixed(3))}\\quad ` +
          `\\big(\\text{Exact Black–Scholes } = \\$${bs.toFixed(3)}\\big)`
        );
      }
    }
  }

  // =========================================================================
  // MODULE 03 — TRADING DESK & RISK WORKBENCH (Interactive Greek Explorer)
  // =========================================================================
  const desk = { shockS: 0, contracts: 10, greek: "delta" };

  const GREEK_INFO = {
    delta: {
      badge: "Selected Greek · Delta (Δ = ∂V/∂S)",
      title: "Why Delta is both a slope and a dynamic hedge ratio",
      body: "On the top chart, the solid ember curve is Black–Scholes value V(S) and the straight paper line is its tangent of slope Δ. When a dealer sells you an option and buys Δ shares, their hedged portfolio rides that tangent line: small spot moves cancel out, while large shocks leave only second-order Gamma curvature."
    },
    gamma: {
      badge: "Selected Greek · Gamma (Γ = ∂²V/∂S²)",
      title: "Gamma measures the curvature that makes Delta change",
      body: "Look at the bottom profile curve: Gamma peaks sharply right around the strike price K. When spot sits near K, Delta changes rapidly with every dollar move, forcing market makers to rebalance their stock hedge frequently."
    },
    vega: {
      badge: "Selected Greek · Vega (𝒱 = ∂V/∂σ)",
      title: "Vega measures sensitivity to implied volatility spikes",
      body: "Every option is long volatility: more uncertainty widens the lognormal cloud and increases expected payoff. Vega peaks at-the-money and rises with √T, which is why long-dated options react strongly to VIX shocks."
    },
    theta: {
      badge: "Selected Greek · Theta (Θ = ∂V/∂t)",
      title: "Theta is the daily time-decay rent paid for Gamma",
      body: "In the Black–Scholes PDE, Theta and Gamma have opposite signs: Θ + ½σ²S²Γ = r(V − SΔ). An option buyer enjoys positive Gamma convexity when the market jumps, but pays for it every quiet day via negative Theta bleed."
    },
    rho: {
      badge: "Selected Greek · Rho (ρ = ∂V/∂r)",
      title: "Rho captures the interest-rate carry on the strike price",
      body: "Higher interest rates reduce the present value of the strike Ke^(−rT), helping calls (positive Rho) and hurting puts (negative Rho)—especially on multi-year LEAPS contracts."
    }
  };

  const PRESETS = {
    equity:   { type: "put",  S0: 100, K: 95,  sigma: 0.18, r: 0.045, T: 1.00 },
    earnings: { type: "call", S0: 100, K: 115, sigma: 0.65, r: 0.050, T: 0.15 },
    leaps:    { type: "call", S0: 120, K: 90,  sigma: 0.25, r: 0.050, T: 2.50 },
    atm:      { type: "call", S0: 100, K: 110, sigma: 0.25, r: 0.050, T: 1.00 }
  };

  document.querySelectorAll(".preset-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".preset-card").forEach(c => c.classList.toggle("on", c === card));
      const pr = PRESETS[card.dataset.preset];
      if (!pr) return;
      Object.assign(P, pr);
      syncMainKnobsUI();
      schedule();
    });
  });

  document.querySelectorAll(".g-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".g-card").forEach(c => c.classList.toggle("on", c === card));
      desk.greek = card.dataset.greek;
      const info = GREEK_INFO[desk.greek];
      if (info) {
        $("greekFocusBadge").textContent = info.badge;
        $("greekFocusTitle").textContent = info.title;
        $("greekFocusBody").textContent = info.body;
      }
      dirty.deskEq = true;
    });
  });

  $("dShockS").addEventListener("input", e => {
    desk.shockS = +e.target.value;
    dirty.deskEq = true;
  });
  $("dContracts").addEventListener("input", e => {
    desk.contracts = +e.target.value;
    $("dContractsVal").textContent = `${desk.contracts} contract${desk.contracts > 1 ? "s" : ""}`;
    dirty.deskEq = true;
  });

  function greekVal(bsObj, gName, call) {
    if (gName === "delta") return call ? bsObj.deltaCall : bsObj.deltaPut;
    if (gName === "gamma") return bsObj.gamma;
    if (gName === "vega") return bsObj.vega;
    if (gName === "theta") return call ? bsObj.thetaCall : bsObj.thetaPut;
    return call ? bsObj.rhoCall : bsObj.rhoPut;
  }

  function renderDesk(now) {
    if (activeMod !== "desk") return;
    const bs = blackScholes(P), E = estimates(), call = P.type === "call";
    const V0 = bs[P.type];
    const delta = call ? bs.deltaCall : bs.deltaPut;
    const theta = call ? bs.thetaCall : bs.thetaPut;
    const rho = call ? bs.rhoCall : bs.rhoPut;

    if (dirty.deskEq) {
      dirty.deskEq = false;
      $("gDelta").textContent = (delta >= 0 ? "+" : "") + delta.toFixed(4);
      $("gGamma").textContent = bs.gamma.toFixed(4);
      $("gVega").textContent = "+$" + bs.vega.toFixed(3);
      $("gTheta").textContent = (theta >= 0 ? "+$" : "−$") + Math.abs(theta).toFixed(3);
      $("gRho").textContent = (rho >= 0 ? "+$" : "−$") + Math.abs(rho).toFixed(3);

      const mult = desk.contracts * 100;
      const sNew = Math.max(5, P.S0 + desk.shockS);
      $("dShockSVal").textContent = `${desk.shockS >= 0 ? "+$" : "−$"}${Math.abs(desk.shockS)} (Spot = $${sNew})`;
      $("deskBookTitle").textContent = `${desk.contracts} Contract${desk.contracts > 1 ? "s" : ""} (${mult.toLocaleString()} ${P.type.toUpperCase()} Options)`;

      const bsShocked = blackScholes({ ...P, S0: sNew })[P.type];
      const dV = bsShocked - V0;
      const pnlBuyer = dV * mult;
      const pnlMakerHedged = (-dV + delta * desk.shockS) * mult;
      const hedgeShares = Math.round(delta * mult);

      $("bkFair").textContent = `$${V0.toFixed(3)} BS  /  $${n ? E.mc.toFixed(3) : "—"} MC`;
      $("bkPrem").textContent = `$${(V0 * mult).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      $("bkHedge").textContent = `${hedgeShares >= 0 ? "Buy" : "Short"} ${Math.abs(hedgeShares).toLocaleString()} shares (Δ = ${delta.toFixed(3)})`;
      $("bkNewVal").textContent = `$${bsShocked.toFixed(3)} per option (${dV >= 0 ? "+" : ""}${dV.toFixed(3)})`;
      $("bkPnlUnhedged").textContent = `${pnlBuyer >= 0 ? "+$" : "−$"}${Math.abs(pnlBuyer).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      $("bkPnlHedged").textContent = `${pnlMakerHedged >= 0 ? "+$" : "−$"}${Math.abs(pnlMakerHedged).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      $("cliCmd").textContent =
        `python -m mc_option_pricing --S0 ${P.S0} --K ${P.K} --r ${P.r} --sigma ${P.sigma} --T ${P.T} --paths ${Math.max(10000, E.evals)} --seed ${seed}`;

      if (window.katex) {
        const gammaTerm = 0.5 * bs.gamma * desk.shockS * desk.shockS;
        tex($("deskEq"),
          `\\Delta V \\approx \\Delta\\cdot(\\Delta S) + \\tfrac{1}{2}\\Gamma(\\Delta S)^2 = ` +
          `${delta.toFixed(3)}(${desk.shockS}) + \\tfrac{1}{2}(${bs.gamma.toFixed(4)})(${desk.shockS})^2 = ` +
          `${hl((delta * desk.shockS + gammaTerm >= 0 ? "+" : "") + (delta * desk.shockS + gammaTerm).toFixed(3))}\\quad ` +
          `\\big(\\text{Exact } \\Delta V = ${(dV >= 0 ? "+" : "") + dV.toFixed(3)}\\big)`
        );
        const gEqBox = $("greekFocusEq");
        if (gEqBox) {
          let gTex = "";
          if (desk.greek === "delta") {
            gTex = call
              ? `\\Delta_{\\text{call}} = \\frac{\\partial C}{\\partial S_0} = N(d_1) = N(${bs.d1.toFixed(3)}) = ${hl("+" + delta.toFixed(4))}`
              : `\\Delta_{\\text{put}} = \\frac{\\partial P}{\\partial S_0} = N(d_1) - 1 = ${hl(delta.toFixed(4))}`;
          } else if (desk.greek === "gamma") {
            gTex = `\\Gamma = \\frac{\\partial^2 V}{\\partial S_0^2} = \\frac{\\phi(d_1)}{S_0 \\sigma \\sqrt{T}} = ${hl(bs.gamma.toFixed(4))}`;
          } else if (desk.greek === "vega") {
            gTex = `\\mathcal{V} = 0.01\\,S_0\\,\\phi(d_1)\\sqrt{T} = ${hl("+\\$" + bs.vega.toFixed(3))}\\text{ per }+1\\%\\,\\sigma`;
          } else if (desk.greek === "theta") {
            gTex = `\\Theta = \\frac{1}{365}\\frac{\\partial V}{\\partial t} = ${hl((theta >= 0 ? "+\\$" : "-\\$") + Math.abs(theta).toFixed(3))}\\text{ / day}`;
          } else {
            gTex = `\\rho = 0.01\\frac{\\partial V}{\\partial r} = ${hl((rho >= 0 ? "+\\$" : "-\\$") + Math.abs(rho).toFixed(3))}\\text{ per }+1\\%\\,r`;
          }
          tex(gEqBox, gTex);
        }
      }
    }

    // Draw split Desk Canvas: Top = Option Value & Tangent Hedge, Bottom = Selected Greek Profile across Spot
    const s = setupSubCanvas("deskCanvas");
    if (!s) return;
    const { ctx: c, w, h } = s;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
    const pad = { l: 54, r: 28, t: 28, b: 32 }, pw = w - pad.l - pad.r;
    const topH = (h - pad.t - pad.b - 36) * 0.56, botY = pad.t + topH + 36, botH = h - botY - pad.b;

    const sMin = Math.max(10, Math.min(P.S0, P.K) * 0.55);
    const sMax = Math.max(P.S0, P.K) * 1.45;
    const sNew = Math.max(5, P.S0 + desk.shockS);
    const bsShocked = blackScholes({ ...P, S0: sNew })[P.type];
    const vMax = Math.max(
      blackScholes({ ...P, S0: call ? sMax : sMin })[P.type] * 1.08,
      V0 * 2.2,
      10
    );
    const xOf = spot => pad.l + ((spot - sMin) / (sMax - sMin)) * pw;
    const yTop = val => pad.t + topH * (1 - (val / vMax));

    // Top Plot Grid
    c.strokeStyle = COL.faint; c.lineWidth = 1; c.beginPath();
    for (const tk of niceTicks(0, vMax, 4)) {
      const y = Math.round(yTop(tk)) + .5;
      c.moveTo(pad.l, y); c.lineTo(pad.l + pw, y);
      label(c, "$" + tk.toFixed(0), pad.l - 8, y + 4, COL.dim, "right");
    }
    for (const tk of niceTicks(sMin, sMax, 6)) {
      const x = Math.round(xOf(tk)) + .5;
      c.moveTo(x, pad.t); c.lineTo(x, botY + botH);
      label(c, "$" + tk.toFixed(0), x, botY + botH + 18, COL.dim, "center");
    }
    c.stroke();

    // Intrinsic hockey-stick payoff
    c.strokeStyle = COL.frost; c.lineWidth = 1.3; c.setLineDash([4, 4]); c.beginPath();
    for (let i = 0; i <= 120; i++) {
      const sp = sMin + (sMax - sMin) * i / 120;
      const intr = call ? Math.max(sp - P.K, 0) : Math.max(P.K - sp, 0);
      i ? c.lineTo(xOf(sp), yTop(intr)) : c.moveTo(xOf(sp), yTop(intr));
    }
    c.stroke(); c.setLineDash([]);

    // Delta Tangent Line
    c.strokeStyle = "rgba(236,230,217,0.65)"; c.lineWidth = 1.2; c.beginPath();
    let started = false;
    for (let i = 0; i <= 120; i++) {
      const sp = sMin + (sMax - sMin) * i / 120;
      const tang = V0 + delta * (sp - P.S0);
      if (tang >= 0 && tang <= vMax) {
        started ? c.lineTo(xOf(sp), yTop(tang)) : c.moveTo(xOf(sp), yTop(tang));
        started = true;
      }
    }
    c.stroke();

    // Black-Scholes Value Curve V(S)
    c.strokeStyle = COL.ember; c.lineWidth = 2.1; c.beginPath();
    for (let i = 0; i <= 120; i++) {
      const sp = sMin + (sMax - sMin) * i / 120;
      const val = blackScholes({ ...P, S0: sp })[P.type];
      i ? c.lineTo(xOf(sp), yTop(val)) : c.moveTo(xOf(sp), yTop(val));
    }
    c.stroke();
    c.strokeStyle = COL.hair; c.beginPath(); c.moveTo(pad.l, pad.t + topH + .5); c.lineTo(pad.l + pw, pad.t + topH + .5); c.stroke();

    c.fillStyle = COL.paper; c.beginPath(); c.arc(xOf(P.S0), yTop(V0), 4.5, 0, 7); c.fill();
    tag(c, `S₀=$${P.S0} (V=$${V0.toFixed(2)})`, xOf(P.S0), yTop(V0) - 12, COL.paper, "center");

    if (desk.shockS !== 0 && sNew >= sMin && sNew <= sMax) {
      const xS = xOf(sNew), yS = yTop(bsShocked), yTang = yTop(Math.max(0, V0 + delta * desk.shockS));
      c.strokeStyle = "rgba(255,106,61,0.5)"; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(xS, yS); c.lineTo(xS, yTang); c.stroke(); c.setLineDash([]);
      c.fillStyle = COL.ember; c.beginPath(); c.arc(xS, yS, 4.5 + 1.5 * pulse, 0, 7); c.fill();
      tag(c, `Shocked S=$${sNew} → $${bsShocked.toFixed(2)}`, xS, yS + 18, COL.ember, "center");
    }
    label(c, "1. Option Value V(S)   — Δ tangent hedge   - - intrinsic payoff", pad.l, pad.t - 10, COL.paper, "left");

    // Bottom Plot: Selected Greek Profile across Spot S
    const gArr = new Float64Array(121);
    let gMin = Infinity, gMax = -Infinity;
    for (let i = 0; i <= 120; i++) {
      const sp = sMin + (sMax - sMin) * i / 120;
      const gv = greekVal(blackScholes({ ...P, S0: sp }), desk.greek, call);
      gArr[i] = gv;
      if (gv < gMin) gMin = gv;
      if (gv > gMax) gMax = gv;
    }
    if (Math.abs(gMax - gMin) < 1e-6) { gMax += 1; gMin -= 1; }
    const yBot = gv => (botY + 12) + (botH - 14) * (1 - (gv - gMin) / (gMax - gMin));

    label(c, `2. Active Sensitivity Profile: ${desk.greek.toUpperCase()}(S) across Spot`, pad.l, botY - 6, COL.ember, "left");
    c.strokeStyle = COL.frost; c.lineWidth = 1.8; c.beginPath();
    for (let i = 0; i <= 120; i++) {
      const sp = sMin + (sMax - sMin) * i / 120;
      i ? c.lineTo(xOf(sp), yBot(gArr[i])) : c.moveTo(xOf(sp), yBot(gArr[i]));
    }
    c.stroke();
    c.strokeStyle = COL.hair; c.beginPath(); c.moveTo(pad.l, botY + botH + .5); c.lineTo(pad.l + pw, botY + botH + .5); c.stroke();

    const gNow = greekVal(bs, desk.greek, call);
    c.fillStyle = COL.ember; c.beginPath(); c.arc(xOf(P.S0), yBot(gNow), 4 + 1.5 * pulse, 0, 7); c.fill();
  }

  // ── Artifact Export Buttons (Module 03) ──────────────────────────────────
  function flashBtn(btn, msg) {
    const orig = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = orig; }, 1600);
  }
  $("btnCopyCli").addEventListener("click", e => {
    navigator.clipboard?.writeText($("cliCmd").textContent);
    flashBtn(e.currentTarget, "Copied CLI ✓");
  });
  $("btnCopyReport").addEventListener("click", e => {
    const E = estimates(), bs = blackScholes(P);
    const txt = [
      `Monte Carlo Option Pricing — Quantitative Summary`,
      `Contract: European ${P.type.toUpperCase()} | S0=$${P.S0}, K=$${P.K}, sigma=${(P.sigma * 100).toFixed(1)}%, r=${(P.r * 100).toFixed(2)}%, T=${P.T}y`,
      `Monte Carlo Estimate (${E.evals.toLocaleString()} paths, antithetic=${P.anti}): $${E.mc.toFixed(4)} ± $${(1.96 * E.se).toFixed(4)} (95% CI)`,
      `Black-Scholes Exact: $${bs[P.type].toFixed(4)}`,
      `Greeks: Delta=${(P.type === "call" ? bs.deltaCall : bs.deltaPut).toFixed(4)}, Gamma=${bs.gamma.toFixed(4)}, Vega=$${bs.vega.toFixed(4)}/1%, Theta=$${(P.type === "call" ? bs.thetaCall : bs.thetaPut).toFixed(4)}/day`
    ].join("\n");
    navigator.clipboard?.writeText(txt);
    flashBtn(e.currentTarget, "Copied Summary ✓");
  });
  $("btnExportJson").addEventListener("click", e => {
    const E = estimates(), bs = blackScholes(P);
    const payload = {
      timestamp: new Date().toISOString(),
      parameters: { ...P, seed },
      monte_carlo: {
        evaluations: E.evals,
        price: +E.mc.toFixed(6),
        standard_error: +E.se.toFixed(6),
        ci_95: [+(E.mc - 1.96 * E.se).toFixed(6), +(E.mc + 1.96 * E.se).toFixed(6)],
        antithetic_efficiency: +E.eff.toFixed(4)
      },
      black_scholes: {
        call: +bs.call.toFixed(6),
        put: +bs.put.toFixed(6),
        d1: +bs.d1.toFixed(6),
        d2: +bs.d2.toFixed(6),
        greeks: {
          delta: +(P.type === "call" ? bs.deltaCall : bs.deltaPut).toFixed(6),
          gamma: +bs.gamma.toFixed(6),
          vega_per_1pct: +bs.vega.toFixed(6),
          theta_per_day: +(P.type === "call" ? bs.thetaCall : bs.thetaPut).toFixed(6),
          rho_per_1pct: +(P.type === "call" ? bs.rhoCall : bs.rhoPut).toFixed(6)
        }
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mc-option-report-${P.type}-S${P.S0}-K${P.K}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    flashBtn(e.currentTarget, "Downloaded JSON ✓");
  });

  window.addEventListener("resize", () => { resize(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) rateMeter.t = performance.now(); });

  let texReady = false;
  function ensureTex() {
    if (texReady || !window.katex) return false;
    texReady = true;
    document.querySelectorAll(".tex").forEach(el => tex(el, el.textContent));
    renderSpotlightEq(false);
    syncLabFromMain();
    dirty.stats = true; dirty.labEq = true; dirty.deskEq = true;
    return true;
  }
  window.addEventListener("load", () => {
    ensureTex();
    observeReveals();
    updateScrollBar();
  });

  // ── main loop ────────────────────────────────────────────────────────────
  function frame(now) {
    ensureTex();
    step(now);
    if (activeMod === "sim") {
      drawMain(now);
      drawConv();
    } else if (activeMod === "math") {
      drawMathStage(now);
    } else if (activeMod === "desk") {
      renderDesk(now);
    }
    if (dirty.stats) { renderStats(now); dirty.stats = false; }
    requestAnimationFrame(frame);
  }
  resize();
  observeReveals();
  reset(0x5eed2026);
  requestAnimationFrame(frame);
})();
