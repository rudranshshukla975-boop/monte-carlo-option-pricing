"""
Black-Scholes analytical benchmark formulas for European options.

The Black-Scholes (1973) closed-form price of a European call option is:
    C = S_0 * Phi(d_1) - K * exp(-r * T) * Phi(d_2)

And for a European put option:
    P = K * exp(-r * T) * Phi(-d_2) - S_0 * Phi(-d_1)

where:
    d_1 = [ln(S_0 / K) + (r + 0.5 * sigma^2) * T] / [sigma * sqrt(T)]
    d_2 = d_1 - sigma * sqrt(T)
    Phi(x) is the cumulative distribution function (CDF) of standard normal N(0, 1).
"""

import math


def norm_cdf(x):
    """Cumulative distribution function Phi(x) of the standard normal distribution.

    Implemented using the relation Phi(x) = 0.5 * [1 + erf(x / sqrt(2))] from
    Python's standard math library, avoiding external heavy dependencies.
    """
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def black_scholes(S0, K, r, sigma, T, option="call"):
    """Calculate the theoretical Black-Scholes price of a European option.

    Parameters
    ----------
    S0 : float
        Current asset price.
    K : float
        Strike price.
    r : float
        Annual risk-free interest rate (e.g. 0.05).
    sigma : float
        Annual volatility (e.g. 0.20).
    T : float
        Time to maturity in years.
    option : {'call', 'put'}, default 'call'
        Option type.

    Returns
    -------
    float
        Analytical option price under the Black-Scholes model.
    """
    opt = option.lower().strip()
    if opt not in ("call", "put"):
        raise ValueError(f"Unknown option type '{option}'. Expected 'call' or 'put'.")

    # Edge case: instantaneous expiration
    if T <= 0:
        return max(S0 - K, 0.0) if opt == "call" else max(K - S0, 0.0)

    d1 = (math.log(S0 / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)

    if opt == "call":
        return S0 * norm_cdf(d1) - K * math.exp(-r * T) * norm_cdf(d2)
    else:
        return K * math.exp(-r * T) * norm_cdf(-d2) - S0 * norm_cdf(-d1)


def put_call_parity_difference(call_price, put_price, S0, K, r, T):
    """Compute the difference in the Put-Call Parity identity:
        (C - P) - (S_0 - K * exp(-r * T)).

    By no-arbitrage, this difference should be zero (within numerical precision).
    """
    lhs = call_price - put_price
    rhs = S0 - K * math.exp(-r * T)
    return lhs - rhs
