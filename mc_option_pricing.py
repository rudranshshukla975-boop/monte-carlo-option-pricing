"""
Convenience runner and package exports for Monte Carlo Option Pricing.

Can be run directly via:
    python mc_option_pricing.py
    python mc_option_pricing.py --help
    python mc_option_pricing.py --interactive
    python mc_option_pricing.py --benchmark
    python mc_option_pricing.py --ascii
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
from mc_option_pricing.cli import main

if __name__ == "__main__":
    main()
