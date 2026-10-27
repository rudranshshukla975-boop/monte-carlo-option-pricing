"""
Monte Carlo European Option Pricing Package.

A clean, educational, and modular library for pricing European options using
Monte Carlo simulation, Geometric Brownian Motion, Black-Scholes benchmarking,
and variance reduction techniques.
"""

from .prng import LCG, box_muller
from .gbm import simulate_terminal_prices, simulate_gbm_paths
from .payoffs import call_payoff, put_payoff, payoffs
from .black_scholes import black_scholes, norm_cdf, put_call_parity_difference
from .pricing import mc_price, summarise
from .variance_reduction import mc_price_antithetic

__version__ = "1.0.0"
__all__ = [
    "LCG",
    "box_muller",
    "simulate_terminal_prices",
    "simulate_gbm_paths",
    "call_payoff",
    "put_payoff",
    "payoffs",
    "black_scholes",
    "norm_cdf",
    "put_call_parity_difference",
    "mc_price",
    "mc_price_antithetic",
    "summarise",
]
