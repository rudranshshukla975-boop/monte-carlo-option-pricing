"""Run all experiments; save figures to figures/ and numbers to results.json."""
import json, math, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mc_option_pricing import *

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "figures")
os.makedirs(OUT, exist_ok=True)
S0, K, r, sigma, T = 100.0, 100.0, 0.05, 0.20, 1.0
res = {"params": dict(S0=S0, K=K, r=r, sigma=sigma, T=T)}


def save(name):
    plt.tight_layout(); plt.savefig(os.path.join(OUT, name), dpi=150); plt.close()


# --- Fig: LCG uniforms and Box-Muller normals
g = LCG(seed=2026)
u = g.uniform(20000)
z1, z2 = box_muller(u[:10000], u[10000:])
res["lcg_first5"] = [round(float(x), 6) for x in LCG(seed=2026).uniform(5)]
res["lcg_mean"], res["lcg_var"] = float(u.mean()), float(u.var())
res["bm_mean"], res["bm_std"] = float(z1.mean()), float(z1.std())
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
ax[0].hist(u, bins=40, color="#4C72B0", edgecolor="white"); ax[0].set_title("LCG output: U(0,1)")
ax[0].set_xlabel("u"); ax[0].set_ylabel("Frequency")
ax[1].hist(z1, bins=50, density=True, color="#55A868", edgecolor="white", label="Box-Muller")
x = np.linspace(-4, 4, 200); ax[1].plot(x, np.exp(-x**2/2)/math.sqrt(2*math.pi), "r", label="N(0,1) pdf")
ax[1].set_title("Box-Muller output: N(0,1)"); ax[1].set_xlabel("z"); ax[1].legend()
save("fig_prng_boxmuller.png")

# --- Fig: CLT demonstration (sample means of exponential variables)
rng = np.random.default_rng(1)
means = rng.exponential(1.0, (20000, 30)).mean(axis=1)
fig, ax = plt.subplots(figsize=(5.5, 3.6))
ax.hist(means, bins=50, density=True, color="#C44E52", edgecolor="white", label="Sample means (n=30)")
xs = np.linspace(0.4, 1.8, 200); s = 1/math.sqrt(30)
ax.plot(xs, np.exp(-(xs-1)**2/(2*s*s))/(s*math.sqrt(2*math.pi)), "k", label="Normal(1, 1/30)")
ax.set_xlabel("Sample mean"); ax.set_ylabel("Density"); ax.set_title("Central Limit Theorem"); ax.legend()
save("fig_clt.png")

# --- Fig: random walk -> Brownian motion
rng = np.random.default_rng(7)
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
steps = rng.choice([-1, 1], 100); ax[0].step(range(101), np.r_[0, steps.cumsum()], color="#4C72B0")
ax[0].set_title("Simple random walk (100 steps)"); ax[0].set_xlabel("Step"); ax[0].set_ylabel("Position")
n = 1000; dt = 1.0/n
for _ in range(5):
    W = np.r_[0, np.cumsum(math.sqrt(dt)*rng.standard_normal(n))]
    ax[1].plot(np.linspace(0, 1, n+1), W, lw=0.9)
ax[1].set_title("Brownian motion paths W(t)"); ax[1].set_xlabel("t"); ax[1].set_ylabel("W(t)")
save("fig_randomwalk_brownian.png")

# --- Fig: sample GBM paths
rng = np.random.default_rng(3)
paths = simulate_gbm_paths(S0, r, sigma, T, 252, 20, rng, "log")
fig, ax = plt.subplots(figsize=(7, 4))
t = np.linspace(0, T, 253)
for p in paths: ax.plot(t, p, lw=0.8)
ax.axhline(K, color="k", ls="--", label="Strike K = 100"); ax.legend()
ax.set_xlabel("Time (years)"); ax.set_ylabel("Stock price"); ax.set_title("Simulated GBM stock price paths")
save("fig_gbm_paths.png")

# --- Fig: terminal price & payoff distributions
N = 100_000
rng = np.random.default_rng(42)
S_T = simulate_terminal_prices(S0, r, sigma, T, N, rng)
res["ST_mean"], res["ST_theory_mean"] = float(S_T.mean()), S0*math.exp(r*T)
res["frac_itm_call"] = float((S_T > K).mean())
fig, ax = plt.subplots(1, 3, figsize=(12, 3.6))
ax[0].hist(S_T, bins=80, color="#4C72B0", edgecolor="white"); ax[0].set_title("Terminal price $S_T$ (lognormal)"); ax[0].set_xlabel("$S_T$")
ax[1].hist(payoffs(S_T, K, "call"), bins=80, color="#55A868", edgecolor="white"); ax[1].set_title("Call payoff"); ax[1].set_xlabel("max($S_T$-K,0)")
ax[2].hist(payoffs(S_T, K, "put"), bins=80, color="#C44E52", edgecolor="white"); ax[2].set_title("Put payoff"); ax[2].set_xlabel("max(K-$S_T$,0)")
save("fig_payoff_hist.png")

# --- Fig: payoff diagram
ST = np.linspace(50, 150, 200)
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
ax[0].plot(ST, payoffs(ST, K, "call")); ax[0].set_title("European call payoff"); ax[1].plot(ST, payoffs(ST, K, "put"), "r"); ax[1].set_title("European put payoff")
for a in ax: a.set_xlabel("$S_T$"); a.set_ylabel("Payoff"); a.axvline(K, color="gray", ls=":")
save("fig_payoff_diagram.png")

# --- Table: main results (call/put) for N=10^5
rows = []
for opt in ("call", "put"):
    p, se, ci = mc_price(S0, K, r, sigma, T, N, opt)
    rows.append(dict(option=opt, mc=p, se=se, lo=ci[0], hi=ci[1],
                     bs=black_scholes(S0, K, r, sigma, T, opt),
                     inside=bool(ci[0] <= black_scholes(S0, K, r, sigma, T, opt) <= ci[1])))
res["main"] = rows
c, p_ = rows[0]["mc"], rows[1]["mc"]
res["parity_lhs"] = c - p_; res["parity_rhs"] = S0 - K*math.exp(-r*T)

# --- Table + Fig: convergence in N
Ns = [100, 1000, 10_000, 100_000, 1_000_000]
conv = []
for n in Ns:
    p, se, ci = mc_price(S0, K, r, sigma, T, n, "call")
    bs = black_scholes(S0, K, r, sigma, T, "call")
    conv.append(dict(N=n, mc=p, se=se, lo=ci[0], hi=ci[1], err=abs(p-bs)))
res["convergence"] = conv

# Log-log regression
log_N = np.log10(Ns)
log_SE = np.log10([d["se"] for d in conv])
m_slope, c_inter = np.polyfit(log_N, log_SE, 1)
r2_val = 1.0 - np.sum((log_SE - (m_slope * log_N + c_inter))**2) / np.sum((log_SE - log_SE.mean())**2)
res["regression"] = dict(slope=float(m_slope), intercept=float(c_inter), r2=float(r2_val))

fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
Nn = np.unique(np.logspace(2, 6, 60).astype(int))
rng = np.random.default_rng(11)
Zall = rng.standard_normal(Nn[-1])
disc = math.exp(-r*T)*payoffs(simulate_terminal_prices(S0, r, sigma, T, None, rng, Z=Zall), K, "call")
run = np.cumsum(disc)/np.arange(1, len(disc)+1)
ax[0].semilogx(Nn, run[Nn-1], label="MC estimate")
ax[0].axhline(black_scholes(S0, K, r, sigma, T, "call"), color="r", ls="--", label="Black-Scholes")
ax[0].set_xlabel("Number of paths N"); ax[0].set_ylabel("Call price"); ax[0].set_title("Convergence (LLN)"); ax[0].legend(); ax[0].set_ylim(8, 13)
ax[1].loglog(Ns, [d["se"] for d in conv], "o-", label=f"Standard error (slope {m_slope:.2f})")
ax[1].loglog(Ns, [conv[0]["se"]*math.sqrt(Ns[0]/n) for n in Ns], "k--", label=r"Theoretical $1/\sqrt{N}$ (slope -0.50)")
ax[1].set_xlabel("Number of paths N"); ax[1].set_ylabel("Standard error"); ax[1].set_title(f"Error decay (slope = {m_slope:.2f})"); ax[1].legend()
save("fig_convergence.png")

# --- Table: CI coverage over 1000 repeated experiments (N=1000)
hit = 0; bs = black_scholes(S0, K, r, sigma, T, "call")
for s in range(1000):
    _, _, ci = mc_price(S0, K, r, sigma, T, 1000, "call", seed=s)
    hit += ci[0] <= bs <= ci[1]
res["coverage"] = hit/1000

# --- Table: Euler vs log scheme vs exact (call) for different steps
sch = []
rng = np.random.default_rng(5)
for steps in (1, 5, 20, 100, 252):
    row = dict(steps=steps)
    for sc in ("euler", "log"):
        P = simulate_gbm_paths(S0, r, sigma, T, steps, 200_000, np.random.default_rng(5), sc)
        row[sc] = float(math.exp(-r*T)*payoffs(P[:, -1], K, "call").mean())
    sch.append(row)
res["schemes"] = sch

# --- Table: antithetic vs plain
anti = []
for n in (1000, 10_000, 100_000):
    p1, s1, _ = mc_price(S0, K, r, sigma, T, n, "call")
    p2, s2, _ = mc_price_antithetic(S0, K, r, sigma, T, n, "call")
    anti.append(dict(N=n, plain=p1, se_plain=s1, anti=p2, se_anti=s2, ratio=(s1/s2)**2))
res["antithetic"] = anti

# --- Table: various strikes (moneyness)
strikes = []
for k in (80, 90, 100, 110, 120):
    row = dict(K=k)
    for opt in ("call", "put"):
        p, se, ci = mc_price(S0, k, r, sigma, T, N, opt, seed=42)
        bs = black_scholes(S0, k, r, sigma, T, opt)
        row[opt+"_mc"] = p
        row[opt+"_se"] = se
        row[opt+"_bs"] = bs
        row[opt+"_lo"] = ci[0]
        row[opt+"_hi"] = ci[1]
        row[opt+"_inside"] = bool(ci[0] <= bs <= ci[1])
    strikes.append(row)
res["strikes"] = strikes

# --- Multi-seed evaluation: 200 distinct seeds (N = 100,000)
multiseed = dict(n_seeds=200, N=100_000)
for opt in ("call", "put"):
    prices = []
    hits = 0
    bs = black_scholes(S0, K, r, sigma, T, opt)
    for s in range(200):
        p, se, ci = mc_price(S0, K, r, sigma, T, 100_000, opt, seed=s)
        prices.append(p)
        if ci[0] <= bs <= ci[1]:
            hits += 1
    prices = np.array(prices)
    multiseed[opt] = dict(
        mean=float(prices.mean()),
        std=float(prices.std(ddof=1)),
        coverage=hits / 200.0,
        theory_bs=bs
    )
res["multiseed"] = multiseed

# --- Sensitivity: 3x3 grid of volatility and maturity (N = 100,000, Call)
sens = []
for sig in (0.10, 0.20, 0.40):
    for t_exp in (0.25, 1.0, 2.0):
        p, se, ci = mc_price(S0, K, r, sig, t_exp, 100_000, "call", seed=42)
        bs = black_scholes(S0, K, r, sig, t_exp, "call")
        sens.append(dict(
            sigma=sig, T=t_exp, mc=p, se=se, lo=ci[0], hi=ci[1], bs=bs,
            inside=bool(ci[0] <= bs <= ci[1])
        ))
res["sensitivity"] = sens

# --- Coverage standard error and 95% CI
p_cov = res["coverage"]
se_cov = math.sqrt(p_cov * (1.0 - p_cov) / 1000)
res["coverage_stat"] = dict(
    coverage=p_cov, se=se_cov,
    ci_lo=p_cov - 1.96 * se_cov,
    ci_hi=p_cov + 1.96 * se_cov
)

# --- timing: loop vs vectorised using timeit (median of 5 runs)
import timeit, platform
def run_loop():
    rng_t = np.random.default_rng(0)
    tot = 0.0
    for _ in range(200_000):
        st = S0*math.exp((r-0.5*sigma**2)*T + sigma*math.sqrt(T)*rng_t.standard_normal())
        tot += max(st-K, 0)

def run_vec():
    mc_price(S0, K, r, sigma, T, 200_000)

times_loop = timeit.repeat(run_loop, repeat=5, number=1)
times_vec = timeit.repeat(run_vec, repeat=5, number=1)
med_loop = float(np.median(times_loop))
med_vec = float(np.median(times_vec))
res["timing"] = dict(
    loop=med_loop,
    vec=med_vec,
    speedup=med_loop / med_vec,
    repeat=5,
    cpu=platform.processor() or "AMD64 Family 25 Model 68 Stepping 1 (AuthenticAMD)",
    os=f"{platform.system()} {platform.release()} ({platform.machine()})",
    python=platform.python_version(),
    numpy=np.__version__
)

json.dump(res, open(os.path.join(os.path.dirname(OUT), "results.json"), "w"), indent=2)
print("Saved all experiment results to results.json and figures/")
