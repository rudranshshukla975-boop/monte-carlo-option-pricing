"""
Convenience entry point for Monte Carlo European Option Pricing.

This file re-exports the modular library implemented under `mc_option_pricing/`.
"""

from mc_option_pricing import (
    LCG,
    box_muller,
    simulate_terminal_prices,
    simulate_gbm_paths,
    call_payoff,
    put_payoff,
    payoffs,
    black_scholes,
    norm_cdf,
    put_call_parity_difference,
    mc_price,
    mc_price_antithetic,
    summarise,
)

if __name__ == "__main__":
    S0, K, r, sigma, T = 100.0, 100.0, 0.05, 0.20, 1.0
    print("=" * 65)
    print("Monte Carlo European Option Pricing Simulation")
    print(f"Parameters: S0={S0}, K={K}, r={r}, sigma={sigma}, T={T}")
    print("=" * 65)

    for opt in ("call", "put"):
        price, se, ci = mc_price(S0, K, r, sigma, T, n_paths=100_000, option=opt, seed=42)
        bs_exact = black_scholes(S0, K, r, sigma, T, option=opt)
        anti_price, anti_se, anti_ci = mc_price_antithetic(
            S0, K, r, sigma, T, n_paths=100_000, option=opt, seed=42
        )
        print(f"\n[{opt.upper()} OPTION]")
        print(f"  Analytical Black-Scholes : {bs_exact:.4f}")
        print(f"  Plain Monte Carlo (N=10^5): {price:.4f} (SE: {se:.4f}, 95% CI: [{ci[0]:.4f}, {ci[1]:.4f}])")
        print(f"  Antithetic MC     (N=10^5): {anti_price:.4f} (SE: {anti_se:.4f}, 95% CI: [{anti_ci[0]:.4f}, {anti_ci[1]:.4f}])")
        print(f"  Variance Reduction Ratio : {(se / anti_se)**2:.2f}x speedup equivalent")
    print("\n" + "=" * 65)
