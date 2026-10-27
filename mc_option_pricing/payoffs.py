"""
Option payoff functions for European contingent claims.
"""

import numpy as np


def call_payoff(S_T, K):
    """European call option payoff: max(S_T - K, 0).

    Parameters
    ----------
    S_T : np.ndarray or float
        Asset price(s) at expiration time T.
    K : float
        Strike price.

    Returns
    -------
    np.ndarray or float
        Option payoff at expiration.
    """
    return np.maximum(S_T - K, 0.0)


def put_payoff(S_T, K):
    """European put option payoff: max(K - S_T, 0).

    Parameters
    ----------
    S_T : np.ndarray or float
        Asset price(s) at expiration time T.
    K : float
        Strike price.

    Returns
    -------
    np.ndarray or float
        Option payoff at expiration.
    """
    return np.maximum(K - S_T, 0.0)


def payoffs(S_T, K, option="call"):
    """Evaluate call or put payoff for given terminal prices.

    Parameters
    ----------
    S_T : np.ndarray or float
        Terminal asset prices.
    K : float
        Option strike price.
    option : {'call', 'put'}, default 'call'
        Option contract type.

    Returns
    -------
    np.ndarray or float
        Option payoff values.
    """
    opt = option.lower().strip()
    if opt == "call":
        return call_payoff(S_T, K)
    elif opt == "put":
        return put_payoff(S_T, K)
    else:
        raise ValueError(f"Unknown option type '{option}'. Expected 'call' or 'put'.")
