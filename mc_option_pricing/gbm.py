"""
Geometric Brownian Motion (GBM) simulation models.

Under the Black-Scholes risk-neutral measure Q, the asset price follows:
    dS_t = r * S_t * dt + sigma * S_t * dW_t

By applying Ito's Lemma to ln(S_t), the exact analytical solution at time T is:
    S_T = S_0 * exp((r - 0.5 * sigma^2) * T + sigma * sqrt(T) * Z)
where Z ~ N(0, 1).
"""

import math
import numpy as np


def simulate_terminal_prices(S0, r, sigma, T, n_paths, rng=None, Z=None):
    """Simulate asset prices at expiry T using the exact analytical GBM solution.

    Because European options only depend on the final price S_T, this single-step
    exact solution is exact (no time-discretisation error) and computationally efficient.

    Parameters
    ----------
    S0 : float
        Current stock price at time t=0.
    r : float
        Risk-free annual interest rate (e.g. 0.05 for 5%).
    sigma : float
        Annual asset volatility (e.g. 0.20 for 20%).
    T : float
        Time to maturity in years (e.g. 1.0 for 1 year).
    n_paths : int or None
        Number of simulation trajectories. If Z is provided, n_paths can be None.
    rng : np.random.Generator, optional
        NumPy random generator instance. If None, default_rng is used.
    Z : np.ndarray, optional
        Pre-generated standard normal array ~ N(0, 1). If None, generated from rng.

    Returns
    -------
    np.ndarray
        Array of simulated terminal stock prices S_T of shape (n_paths,).
    """
    if Z is None:
        if rng is None:
            rng = np.random.default_rng()
        Z = rng.standard_normal(n_paths)

    drift = (r - 0.5 * sigma**2) * T
    diffusion = sigma * math.sqrt(T) * Z
    return S0 * np.exp(drift + diffusion)


def simulate_gbm_paths(S0, r, sigma, T, n_steps, n_paths, rng=None, scheme="log"):
    """Simulate complete price trajectories over time [0, T] using discrete time steps.

    Useful for visualising path evolution or pricing path-dependent options.

    Two discretisation schemes are supported:
    1. 'euler' (Euler-Maruyama on S_t):
       S_{t+dt} = S_t * (1 + r * dt + sigma * sqrt(dt) * Z)
       Contains time-discretisation bias of order O(dt).
    2. 'log' (Exact stepping on ln S_t, also known as log-Euler):
       S_{t+dt} = S_t * exp((r - 0.5 * sigma^2) * dt + sigma * sqrt(dt) * Z)
       Has zero distribution error at every step.

    Parameters
    ----------
    S0 : float
        Initial stock price.
    r : float
        Risk-free interest rate.
    sigma : float
        Annual volatility.
    T : float
        Time to maturity in years.
    n_steps : int
        Number of discrete time steps between 0 and T.
    n_paths : int
        Number of sample paths to simulate.
    rng : np.random.Generator, optional
        NumPy random generator.
    scheme : str, default 'log'
        Discretisation method ('log' or 'euler').

    Returns
    -------
    np.ndarray
        Array of shape (n_paths, n_steps + 1) containing price trajectories.
    """
    if rng is None:
        rng = np.random.default_rng()

    dt = T / n_steps
    sqrt_dt = math.sqrt(dt)
    Z = rng.standard_normal((n_paths, n_steps))

    paths = np.empty((n_paths, n_steps + 1), dtype=float)
    paths[:, 0] = S0

    if scheme == "euler":
        growth = 1.0 + r * dt + sigma * sqrt_dt * Z
        paths[:, 1:] = S0 * np.cumprod(growth, axis=1)
    elif scheme == "log":
        log_increments = (r - 0.5 * sigma**2) * dt + sigma * sqrt_dt * Z
        paths[:, 1:] = S0 * np.exp(np.cumsum(log_increments, axis=1))
    else:
        raise ValueError(f"Unknown scheme '{scheme}'. Choose 'euler' or 'log'.")

    return paths
