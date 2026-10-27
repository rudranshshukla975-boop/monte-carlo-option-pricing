"""
Variance reduction techniques for Monte Carlo option pricing.

Antithetic Variates Method:
Standard normal variables are symmetric around zero (if Z ~ N(0, 1), then -Z ~ N(0, 1)).
By simulating both paths S_T(Z) and S_T(-Z) using the same standard normal realization Z:
    Y_i = 0.5 * [ f(S_T(+Z_i)) + f(S_T(-Z_i)) ]

Because S_T is monotonically increasing in Z, the two payoffs are negatively correlated:
    Cov(f(S_T(+Z)), f(S_T(-Z))) < 0
This negative covariance reduces the total sample variance:
    Var(Y_i) = 0.5 * [ Var(f(+Z)) + Cov(f(+Z), f(-Z)) ] < 0.5 * Var(f(+Z))
"""

import math
import numpy as np
from .gbm import simulate_terminal_prices
from .payoffs import payoffs
from .pricing import summarise


def mc_price_antithetic(S0, K, r, sigma, T, n_paths=100_000, option="call", seed=None, rng=None):
    """Estimate European option price using antithetic variates variance reduction.

    Parameters
    ----------
    S0 : float
        Current underlying asset price.
    K : float
        Option strike price.
    r : float
        Annual risk-free interest rate.
    sigma : float
        Annual underlying volatility.
    T : float
        Time to maturity in years.
    n_paths : int, default 100_000
        Total simulated paths (n_paths // 2 independent antithetic pairs).
    option : {'call', 'put'}, default 'call'
        Option contract type.
    seed : int, optional
        Seed for reproducible random generation.
    rng : np.random.Generator, optional
        NumPy random generator.

    Returns
    -------
    price : float
        Estimated option price (sample mean of paired averages).
    std_err : float
        Standard error with antithetic variance reduction.
    ci : tuple of (float, float)
        95% confidence interval (lower_bound, upper_bound).
    """
    if rng is None:
        rng = np.random.default_rng(seed)

    half_n = n_paths // 2
    # Draw independent standard normal shocks
    Z = rng.standard_normal(half_n)

    # Simulate paired terminal prices using +Z and -Z
    S_plus = simulate_terminal_prices(S0, r, sigma, T, None, rng=rng, Z=Z)
    S_minus = simulate_terminal_prices(S0, r, sigma, T, None, rng=rng, Z=-Z)

    # Evaluate payoffs for both paired paths
    payoff_plus = payoffs(S_plus, K, option=option)
    payoff_minus = payoffs(S_minus, K, option=option)

    # Average the payoffs within each antithetic pair
    pair_avg = 0.5 * (payoff_plus + payoff_minus)
    discounted_pairs = math.exp(-r * T) * pair_avg

    return summarise(discounted_pairs)
