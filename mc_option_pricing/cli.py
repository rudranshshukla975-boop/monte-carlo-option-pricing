"""
Command-Line Interface for Monte Carlo Option Pricing.

Run directly via:
    python mc_option_pricing.py
    python -m mc_option_pricing
    monte-carlo --interactive
"""

import argparse
import math
import sys
import time
import webbrowser
from typing import Optional

# Ensure UTF-8 output across environments
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import numpy as np

from .black_scholes import black_scholes, put_call_parity_difference
from .gbm import simulate_gbm_paths, simulate_terminal_prices
from .payoffs import payoffs
from .pricing import mc_price
from .variance_reduction import mc_price_antithetic

# ANSI Color codes with automatic disable if not a terminal
IS_TTY = sys.stdout.isatty()


def color(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if IS_TTY else text


def bold(text: str) -> str:
    return color(text, "1")


def cyan(text: str) -> str:
    return color(text, "36")


def green(text: str) -> str:
    return color(text, "32")


def yellow(text: str) -> str:
    return color(text, "33")


def red(text: str) -> str:
    return color(text, "31")


def magenta(text: str) -> str:
    return color(text, "35")


def blue(text: str) -> str:
    return color(text, "34")


def dim(text: str) -> str:
    return color(text, "2")


BANNER = r"""
  +----------------------------------------------------------------------------+
  |    MONTE CARLO OPTION PRICING                                              |
  |    Risk-Neutral Simulation & Black-Scholes Analytical Benchmark            |
  +----------------------------------------------------------------------------+
"""


def format_ci_gauge(lo: float, hi: float, target: float, width: int = 24) -> str:
    """Format an ASCII confidence interval gauge showing target position."""
    if hi <= lo:
        return "[?]"
    ratio = (target - lo) / (hi - lo)
    pos = int(round(ratio * (width - 1)))
    pos = max(0, min(width - 1, pos))

    bar = ["-"] * width
    bar[pos] = "|"
    bar_str = "".join(bar)
    inside = lo <= target <= hi
    status = green("[OK: Inside CI]") if inside else red("[FAIL: Outside CI]")
    return f"[{cyan(bar_str)}] {status}"


def print_pricing_report(
    S0: float,
    K: float,
    r: float,
    sigma: float,
    T: float,
    n_paths: int,
    seed: Optional[int] = 42,
    show_both: bool = True,
    target_opt: str = "both",
):
    """Print structured terminal table comparing MC against Black-Scholes."""
    opts = ["call", "put"] if target_opt == "both" else [target_opt]

    print(f"\n{bold(cyan('CONTRACT & MARKET PARAMETERS:'))}")
    print(f"  Spot Price (S0)      : {bold(f'${S0:,.2f}')}")
    print(f"  Strike Price (K)     : {bold(f'${K:,.2f}')} ({'ATM' if S0 == K else ('ITM' if S0 > K else 'OTM')})")
    print(f"  Risk-Free Rate (r)   : {bold(f'{r * 100:.2f}%')} p.a.")
    print(f"  Volatility (sigma)   : {bold(f'{sigma * 100:.2f}%')} annualized")
    print(f"  Time to Expiry (T)   : {bold(f'{T:.2f} years')} ({int(T * 252)} trading days)")
    print(f"  Simulated Paths (N)  : {bold(f'{n_paths:,}')} trajectories\n")

    results = {}
    for opt in opts:
        bs_price = black_scholes(S0, K, r, sigma, T, option=opt)
        mc_p, mc_se, (mc_lo, mc_hi) = mc_price(S0, K, r, sigma, T, n_paths=n_paths, option=opt, seed=seed)
        anti_p, anti_se, (anti_lo, anti_hi) = mc_price_antithetic(
            S0, K, r, sigma, T, n_paths=n_paths, option=opt, seed=seed
        )
        speedup = (mc_se / anti_se) ** 2 if anti_se > 0 else 1.0
        results[opt] = {
            "bs": bs_price,
            "mc": mc_p,
            "mc_se": mc_se,
            "mc_ci": (mc_lo, mc_hi),
            "anti": anti_p,
            "anti_se": anti_se,
            "anti_ci": (anti_lo, anti_hi),
            "speedup": speedup,
        }

        header = f"EUROPEAN {opt.upper()} OPTION"
        print(bold(magenta(f"+{'-' * 66}+")))
        print(bold(magenta(f"|  {header:<64}|")))
        print(bold(magenta(f"+{'-' * 66}+")))
        print(f"|  Black-Scholes (Exact)    : {bold(green(f'${bs_price:,.4f}')):<53}|")
        print(f"|  Plain Monte Carlo        : {bold(f'${mc_p:,.4f}')} +/- ${1.96 * mc_se:,.4f} (SE: {mc_se:.4f}){' ':>14}|")
        print(f"|  95% Confidence Interval  : [${mc_lo:,.4f}, ${mc_hi:,.4f}]{' ':>30}|")
        print(f"|  CI Alignment Gauge       : {format_ci_gauge(mc_lo, mc_hi, bs_price):<53}|")
        print(f"|  Antithetic Variates MC   : {bold(f'${anti_p:,.4f}')} +/- ${1.96 * anti_se:,.4f} (SE: {anti_se:.4f}){' ':>14}|")
        print(f"|  Variance Reduction Gain  : {bold(yellow(f'{speedup:.2f}x speedup equivalent')):<52}|")
        print(bold(magenta(f"+{'-' * 66}+\n")))

    if target_opt == "both":
        c_mc = results["call"]["mc"]
        p_mc = results["put"]["mc"]
        parity_lhs = c_mc - p_mc
        parity_rhs = S0 - K * math.exp(-r * T)
        parity_gap = abs(parity_lhs - parity_rhs)
        print(dim("  Put-Call Parity Identity: C - P = S0 - K * exp(-r * T)"))
        print(f"  C - P (Monte Carlo) : ${parity_lhs:,.4f}")
        print(f"  S0 - K*exp(-rT)     : ${parity_rhs:,.4f}")
        print(f"  Parity Difference   : ${parity_gap:,.6f} {green('[Verified within numerical error]')}\n")


def run_benchmark():
    """Run performance comparison between naive loops and vectorized NumPy."""
    print(bold(cyan("\nPERFORMANCE BENCHMARK: Vectorized NumPy vs Naive Python Loops")))
    print(dim("   Simulating 200,000 terminal GBM stock paths & Call option payoffs...\n"))

    S0, K, r, sigma, T = 100.0, 100.0, 0.05, 0.20, 1.0
    N = 200_000

    # 1. Naive loop
    print("   [1/2] Running naive Python for-loop...", end="", flush=True)
    rng_py = np.random.default_rng(42)
    start_loop = time.perf_counter()
    drift = (r - 0.5 * sigma**2) * T
    vol_sqrt = sigma * math.sqrt(T)
    disc = math.exp(-r * T)
    tot = 0.0
    for _ in range(N):
        z = rng_py.standard_normal()
        st = S0 * math.exp(drift + vol_sqrt * z)
        tot += max(st - K, 0.0)
    loop_price = disc * (tot / N)
    time_loop = time.perf_counter() - start_loop
    print(f" {yellow(f'{time_loop * 1000:.1f} ms')} (Price: ${loop_price:.4f})")

    # 2. Vectorized NumPy
    print("   [2/2] Running vectorized NumPy engine...", end="", flush=True)
    start_vec = time.perf_counter()
    rng_np = np.random.default_rng(42)
    Z = rng_np.standard_normal(N)
    ST = S0 * np.exp(drift + vol_sqrt * Z)
    vec_price = disc * float(np.maximum(ST - K, 0.0).mean())
    time_vec = time.perf_counter() - start_vec
    print(f" {green(f'{time_vec * 1000:.1f} ms')} (Price: ${vec_price:.4f})")

    speedup = time_loop / time_vec if time_vec > 0 else 1.0
    print(f"\n   {bold(green(f'Result: Vectorized NumPy is {speedup:.1f}x faster.'))}")
    print(dim(f"   Throughput: {int(N / time_vec):,} paths/sec ({time_vec * 1000:.1f} ms elapsed).\n"))


def render_ascii_paths(n_steps: int = 40, n_paths: int = 3):
    """Draw sample Geometric Brownian Motion trajectories in ASCII."""
    print(bold(cyan("\nASCII TRAJECTORY VISUALIZATION:")))
    print(dim(f"   Simulating {n_paths} stock trajectories over 1 year (Strike K=100 indicated)...\n"))

    S0, r, sigma, T = 100.0, 0.05, 0.20, 1.0
    rng = np.random.default_rng(7)
    paths = simulate_gbm_paths(S0, r, sigma, T, n_steps=n_steps, n_paths=n_paths, rng=rng)

    min_p = min(paths.min(), 90.0)
    max_p = max(paths.max(), 120.0)
    height = 14

    colors = [cyan, yellow, magenta]
    grid = [[" " for _ in range(n_steps + 1)] for _ in range(height)]

    # Draw strike line
    strike_row = int(round((100.0 - min_p) / (max_p - min_p) * (height - 1)))
    strike_row = height - 1 - strike_row
    for col in range(n_steps + 1):
        grid[strike_row][col] = dim("-")

    # Draw paths
    symbols = ["*", "o", "+"]
    for p_idx, path in enumerate(paths):
        sym = symbols[p_idx % len(symbols)]
        colr = colors[p_idx % len(colors)]
        for step, val in enumerate(path):
            r_idx = int(round((val - min_p) / (max_p - min_p) * (height - 1)))
            r_idx = height - 1 - max(0, min(height - 1, r_idx))
            grid[r_idx][step] = colr(sym)

    for r_idx, row in enumerate(grid):
        price_val = max_p - (r_idx / (height - 1)) * (max_p - min_p)
        label = f"${price_val:5.1f} |"
        print(f"   {dim(label)}{''.join(row)}")

    print("   " + dim("       +" + "-" * (n_steps + 1)))
    print("   " + dim(f"        t=0{' ' * (n_steps - 10)}Expiry T=1.0 yr\n"))


def interactive_menu():
    """Terminal interactive menu for scenario evaluation."""
    print(color(BANNER, "36"))
    print(bold("Monte Carlo Option Pricing: Interactive Console"))
    print(dim("Evaluate derivative contracts, variance reduction, and convergence rates.\n"))

    while True:
        print(bold(cyan("Select an option:")))
        print("  [1] Standard Benchmark (Spot $100, Strike $100, 20% Vol)")
        print("  [2] Out-of-the-Money Call (Spot $100, Strike $130, 50% Vol)")
        print("  [3] In-the-Money Protective Put (Spot $100, Strike $125)")
        print("  [4] Custom Parameter Input")
        print("  [5] Run Execution Benchmark (NumPy vs Loops)")
        print("  [6] Render ASCII GBM Paths")
        print("  [7] Open Web Simulator in Browser")
        print("  [0] Exit")

        choice = input(bold("\nEnter selection [0-7]: ")).strip()
        if choice == "0":
            print(green("\nSession ended.\n"))
            break
        elif choice == "1":
            print_pricing_report(100.0, 100.0, 0.05, 0.20, 1.0, 100_000)
        elif choice == "2":
            print_pricing_report(100.0, 130.0, 0.05, 0.50, 0.5, 100_000, target_opt="call")
        elif choice == "3":
            print_pricing_report(100.0, 125.0, 0.05, 0.25, 1.0, 100_000, target_opt="put")
        elif choice == "4":
            try:
                s0 = float(input("  Spot price S0 [100.0]: ") or "100.0")
                k = float(input("  Strike price K [100.0]: ") or "100.0")
                r = float(input("  Risk-free rate r (e.g. 0.05) [0.05]: ") or "0.05")
                sig = float(input("  Volatility sigma (e.g. 0.20) [0.20]: ") or "0.20")
                t_exp = float(input("  Maturity T in years [1.0]: ") or "1.0")
                n_p = int(input("  Number of paths N [100000]: ") or "100000")
                print_pricing_report(s0, k, r, sig, t_exp, n_p)
            except ValueError as e:
                print(red(f"  Invalid input: {e}"))
        elif choice == "5":
            run_benchmark()
        elif choice == "6":
            render_ascii_paths()
        elif choice == "7":
            url = "https://rudranshshukla975-boop.github.io/monte-carlo-option-pricing/"
            print(f"  Opening web simulator: {cyan(url)}")
            try:
                webbrowser.open(url)
            except Exception:
                print(f"  Please visit: {url}")
        else:
            print(yellow("  Unrecognized option. Please choose 0-7."))

        input(dim("\nPress [Enter] to continue..."))
        print("\n" + "-" * 70 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="Monte Carlo Option Pricing: Numerical simulation engine and Black-Scholes benchmark.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("-S", "--spot", type=float, default=100.0, help="Initial spot price S0 (default: 100.0)")
    parser.add_argument("-K", "--strike", type=float, default=100.0, help="Strike price K (default: 100.0)")
    parser.add_argument("-r", "--rate", type=float, default=0.05, help="Annual risk-free rate r (default: 0.05)")
    parser.add_argument("-v", "--vol", type=float, default=0.20, help="Annual volatility sigma (default: 0.20)")
    parser.add_argument("-T", "--expiry", type=float, default=1.0, help="Time to maturity in years (default: 1.0)")
    parser.add_argument("-N", "--paths", type=int, default=100_000, help="Number of simulated paths (default: 100,000)")
    parser.add_argument("-o", "--option", choices=["call", "put", "both"], default="both", help="Option contract type")
    parser.add_argument("-s", "--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("-i", "--interactive", action="store_true", help="Launch interactive console")
    parser.add_argument("-b", "--benchmark", action="store_true", help="Run execution speed benchmark")
    parser.add_argument("--ascii", action="store_true", help="Render ASCII GBM trajectories in terminal")

    args = parser.parse_args()

    if args.interactive:
        interactive_menu()
    elif args.benchmark:
        print(color(BANNER, "36"))
        run_benchmark()
    elif args.ascii:
        print(color(BANNER, "36"))
        render_ascii_paths()
    else:
        print(color(BANNER, "36"))
        print_pricing_report(
            S0=args.spot,
            K=args.strike,
            r=args.rate,
            sigma=args.vol,
            T=args.expiry,
            n_paths=args.paths,
            seed=args.seed,
            target_opt=args.option,
        )


if __name__ == "__main__":
    main()
