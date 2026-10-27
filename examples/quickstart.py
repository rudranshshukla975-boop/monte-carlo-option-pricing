"""
Quickstart Example: European Option Pricing with Monte Carlo Simulation.

This self-contained script shows the minimal steps to price a European option:
1. Define market parameters (spot, strike, interest rate, volatility, maturity).
2. Calculate the exact analytical Black-Scholes benchmark.
3. Run Monte Carlo simulation with standard error and 95% confidence interval.
"""

from mc_option_pricing import mc_price, black_scholes, mc_price_antithetic

# 1. Market & Contract Parameters
S0 = 100.0       # Initial asset price
K = 100.0        # Strike price (At-the-money)
r = 0.05         # Risk-free annual interest rate (5%)
sigma = 0.20     # Volatility (20%)
T = 1.0          # Time to maturity (1 year)
n_paths = 100_000

print(f"Pricing European Call Option (S0={S0}, K={K}, r={r}, sigma={sigma}, T={T}):")

# 2. Exact Black-Scholes Benchmark
bs_call = black_scholes(S0, K, r, sigma, T, option="call")
print(f"  Exact Black-Scholes Price : ${bs_call:.4f}")

# 3. Plain Monte Carlo Pricing
mc_call, se, (ci_lo, ci_hi) = mc_price(S0, K, r, sigma, T, n_paths=n_paths, option="call", seed=42)
print(f"  Plain Monte Carlo Price   : ${mc_call:.4f} +/- ${1.96 * se:.4f} (95% CI: [${ci_lo:.4f}, ${ci_hi:.4f}])")

# 4. Antithetic Variates (Variance Reduction)
anti_call, anti_se, (anti_lo, anti_hi) = mc_price_antithetic(S0, K, r, sigma, T, n_paths=n_paths, option="call", seed=42)
print(f"  Antithetic Variates Price : ${anti_call:.4f} +/- ${1.96 * anti_se:.4f} (95% CI: [${anti_lo:.4f}, ${anti_hi:.4f}])")
print(f"  Variance Reduction Ratio  : {(se / anti_se)**2:.2f}x speedup")
