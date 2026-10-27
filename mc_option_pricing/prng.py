"""
Pseudo-random number generation and distribution transforms.

This module provides:
1. LCG: A pure-Python Linear Congruential Generator for educational purposes,
   showing how uniform pseudo-random numbers are generated from scratch.
2. box_muller: The Box-Muller transform, converting independent U(0, 1)
   uniform random variables into independent N(0, 1) standard normal variates.
"""

import math
import numpy as np


class LCG:
    """Linear Congruential Generator: X_{n+1} = (a * X_n + c) mod m.

    This implements a classic Lehmer / congruential pseudo-random number generator.
    By default, it uses standard numerical constants (a=1103515245, c=12345, m=2^31)
    matching the historic POSIX rand() specification.

    Parameters
    ----------
    seed : int
        Initial state / seed of the generator.
    a : int
        Multiplier.
    c : int
        Increment.
    m : int
        Modulus (period <= m).
    """

    def __init__(self, seed=12345, a=1103515245, c=12345, m=2**31):
        self.state = seed
        self.a = a
        self.c = c
        self.m = m

    def uniform(self, n):
        """Generate n pseudo-random floating-point numbers in (0, 1).

        Parameters
        ----------
        n : int
            Number of uniform variates to generate.

        Returns
        -------
        np.ndarray
            1D array of shape (n,) containing samples in (0, 1).
        """
        out = np.empty(n, dtype=float)
        for i in range(n):
            self.state = (self.a * self.state + self.c) % self.m
            # Adding 0.5 prevents exact 0.0 or 1.0 (helpful for log operations)
            out[i] = (self.state + 0.5) / self.m
        return out


def box_muller(u1, u2):
    """Transform two independent U(0, 1) variables into two independent N(0, 1) variables.

    Uses the Box-Muller polar coordinate transform:
        R^2 = -2 * ln(U_1)
        theta = 2 * pi * U_2
        Z_1 = R * cos(theta)
        Z_2 = R * sin(theta)

    Parameters
    ----------
    u1 : np.ndarray or float
        Independent samples from Uniform(0, 1).
    u2 : np.ndarray or float
        Independent samples from Uniform(0, 1).

    Returns
    -------
    tuple of (np.ndarray, np.ndarray)
        Two independent arrays of standard normal variates ~ N(0, 1).
    """
    radius = np.sqrt(-2.0 * np.log(u1))
    theta = 2.0 * np.pi * u2
    z1 = radius * np.cos(theta)
    z2 = radius * np.sin(theta)
    return z1, z2
