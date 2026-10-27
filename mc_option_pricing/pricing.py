"""
Monte Carlo pricing engine for European options.

By the Fundamental Theorem of Asset Pricing under risk-neutral measure Q:
    Price = E^Q [ exp(-r * T) * Payoff(S_T) ]

The Monte Carlo estimator approximates the expectation by the sample mean:
    Price_hat = (1 / N) * sum_{i=1}^N exp(-r * T) * Payoff(S_T^{(i)})

By the Central Limit Theorem:
    Standard Error (SE) = s / sqrt(N)
    95% Confidence Interval = [Price_hat - 1.96 * SE, Price_hat + 1.96 * SE]
"""

import math
import numpy as np
from .gbm import simulate_terminal_prices
from .payoffs import payoffs


def summarise(discounted_payoffs):
    """Compute mean, standard error, and 95% confidence interval for discounted payoffs.

    Parameters
    ----------
    discounted_payoffs : np.ndarray
        1D array of discounted payoff values exp(-r * T) * Payoff(S_T).

    Returns
    -------
    tuple of (float, float, tuple of (float, float))
        - price : Sample mean (point estimate of option price).
        - std_err : Standard error of the sample mean s / sqrt(N).
        - ci : Tuple (ci_lower, ci_upper) representing the 95% confidence interval.
    """
    n = len(discounted_payoffs)
    price = float(discounted_payoffs.mean())
    # Sample standard deviation with Bessel's correction (ddof=1)
    std_err = float(discounted_payoffs.std(ddof=1) / math.sqrt(n))
    ci = (price - 1.96 * std_err, price + 1.96 * std_err)
    return price, std_err, ci


def mc_price(S0, K, r, sigma, T, n_paths=100_000, option="call", seed=None, rng=None):
    """Estimate European option price using plain Monte Carlo simulation.

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
        Number of simulated Monte Carlo sample paths.
    option : {'call', 'put'}, default 'call'
        Option contract type.
    seed : int, optional
        Seed for reproducible random number generation.
    rng : np.random.Generator, optional
        NumPy random generator instance.

    Returns
    -------
    price : float
        Estimated option price (sample mean).
    std_err : float
        Standard error of the Monte Carlo estimator.
    ci : tuple of (float, float)
        95% confidence interval (lower_bound, upper_bound).
    """
    if rng is None:
        rng = np.random.default_rng(seed)

    # 1. Simulate terminal asset prices under risk-neutral measure Q
    S_T = simulate_terminal_prices(S0, r, sigma, T, n_paths, rng=rng)

    # 2. Evaluate option payoffs at expiry
    payoff_vals = payoffs(S_T, K, option=option)

    # 3. Discount back to present value at risk-free rate r
    discount_factor = math.exp(-r * T)
    discounted = discount_factor * payoff_vals

    # 4. Summarise statistical properties
    return summarise(discounted)
