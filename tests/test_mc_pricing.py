"""Unit tests for Monte Carlo option pricing engine and variance reduction."""

import unittest
from mc_option_pricing.pricing import mc_price
from mc_option_pricing.variance_reduction import mc_price_antithetic
from mc_option_pricing.black_scholes import black_scholes


class TestMCPricing(unittest.TestCase):
    def setUp(self):
        self.S0 = 100.0
        self.K = 100.0
        self.r = 0.05
        self.sigma = 0.20
        self.T = 1.0

    def test_mc_call_contains_black_scholes(self):
        """Verify that the 95% confidence interval of plain MC contains the true BS price."""
        bs_call = black_scholes(self.S0, self.K, self.r, self.sigma, self.T, "call")
        price, se, (ci_lo, ci_hi) = mc_price(
            self.S0, self.K, self.r, self.sigma, self.T, n_paths=200_000, option="call", seed=101
        )
        self.assertTrue(ci_lo <= bs_call <= ci_hi)
        self.assertLess(abs(price - bs_call), 1.96 * se)

    def test_mc_put_contains_black_scholes(self):
        """Verify that the 95% confidence interval of plain MC contains the true BS price for puts."""
        bs_put = black_scholes(self.S0, self.K, self.r, self.sigma, self.T, "put")
        price, se, (ci_lo, ci_hi) = mc_price(
            self.S0, self.K, self.r, self.sigma, self.T, n_paths=200_000, option="put", seed=101
        )
        self.assertTrue(ci_lo <= bs_put <= ci_hi)
        self.assertLess(abs(price - bs_put), 1.96 * se)

    def test_antithetic_variance_reduction(self):
        """Verify that antithetic variates achieves lower standard error than plain MC."""
        _, se_plain, _ = mc_price(
            self.S0, self.K, self.r, self.sigma, self.T, n_paths=100_000, option="call", seed=42
        )
        _, se_anti, _ = mc_price_antithetic(
            self.S0, self.K, self.r, self.sigma, self.T, n_paths=100_000, option="call", seed=42
        )
        # Standard error with antithetic variates must be strictly lower
        self.assertLess(se_anti, se_plain)


if __name__ == "__main__":
    unittest.main()
