"""Unit tests for Black-Scholes analytical formulas and Put-Call parity."""

import unittest
from mc_option_pricing.black_scholes import (
    black_scholes,
    norm_cdf,
    put_call_parity_difference,
)


class TestBlackScholes(unittest.TestCase):
    def setUp(self):
        self.S0 = 100.0
        self.K = 100.0
        self.r = 0.05
        self.sigma = 0.20
        self.T = 1.0

    def test_norm_cdf_known_values(self):
        """Test CDF at standard points: Phi(0)=0.5, Phi(inf)=1, Phi(-inf)=0."""
        self.assertAlmostEqual(norm_cdf(0.0), 0.5, places=7)
        self.assertAlmostEqual(norm_cdf(5.0), 1.0, places=6)
        self.assertAlmostEqual(norm_cdf(-5.0), 0.0, places=6)
        # Phi(1.95996) ~ 0.975
        self.assertAlmostEqual(norm_cdf(1.95996398454), 0.975, places=5)

    def test_benchmark_prices(self):
        """Test textbook benchmark option prices for S=100, K=100, r=0.05, sigma=0.2, T=1."""
        call = black_scholes(self.S0, self.K, self.r, self.sigma, self.T, "call")
        put = black_scholes(self.S0, self.K, self.r, self.sigma, self.T, "put")

        # Standard benchmark values
        self.assertAlmostEqual(call, 10.45058, places=4)
        self.assertAlmostEqual(put, 5.57352, places=4)

    def test_put_call_parity(self):
        """Verify no-arbitrage Put-Call parity: C - P = S0 - K * exp(-r * T)."""
        call = black_scholes(self.S0, self.K, self.r, self.sigma, self.T, "call")
        put = black_scholes(self.S0, self.K, self.r, self.sigma, self.T, "put")
        diff = put_call_parity_difference(call, put, self.S0, self.K, self.r, self.T)
        self.assertAlmostEqual(diff, 0.0, places=10)

    def test_expiry_boundary_conditions(self):
        """At T=0, call price is max(S0 - K, 0) and put is max(K - S0, 0)."""
        self.assertEqual(black_scholes(110, 100, 0.05, 0.2, 0.0, "call"), 10.0)
        self.assertEqual(black_scholes(90, 100, 0.05, 0.2, 0.0, "call"), 0.0)
        self.assertEqual(black_scholes(90, 100, 0.05, 0.2, 0.0, "put"), 10.0)


if __name__ == "__main__":
    unittest.main()
