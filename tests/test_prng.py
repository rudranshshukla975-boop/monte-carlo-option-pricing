"""Unit tests for PRNG and Box-Muller transforms."""

import unittest
import numpy as np
from mc_option_pricing.prng import LCG, box_muller


class TestPRNG(unittest.TestCase):
    def test_lcg_uniform_bounds(self):
        """Verify LCG generates numbers strictly inside (0, 1)."""
        gen = LCG(seed=42)
        samples = gen.uniform(10_000)
        self.assertEqual(len(samples), 10_000)
        self.assertTrue(np.all(samples > 0.0))
        self.assertTrue(np.all(samples < 1.0))
        # Mean of U(0, 1) is 0.5, variance is 1/12 ~ 0.0833
        self.assertAlmostEqual(float(samples.mean()), 0.50, delta=0.02)
        self.assertAlmostEqual(float(samples.var()), 1.0 / 12.0, delta=0.01)

    def test_lcg_reproducibility(self):
        """Verify that identical seeds produce identical output sequences."""
        g1 = LCG(seed=123)
        g2 = LCG(seed=123)
        np.testing.assert_array_equal(g1.uniform(100), g2.uniform(100))

    def test_box_muller_distribution(self):
        """Verify Box-Muller transform produces standard normal N(0, 1) variates."""
        rng = np.random.default_rng(2026)
        n = 50_000
        u1 = rng.uniform(0.00001, 0.99999, n)
        u2 = rng.uniform(0.00001, 0.99999, n)
        z1, z2 = box_muller(u1, u2)

        # Standard normal has mean 0 and standard deviation 1
        self.assertAlmostEqual(float(z1.mean()), 0.0, delta=0.02)
        self.assertAlmostEqual(float(z1.std()), 1.0, delta=0.02)
        self.assertAlmostEqual(float(z2.mean()), 0.0, delta=0.02)
        self.assertAlmostEqual(float(z2.std()), 1.0, delta=0.02)


if __name__ == "__main__":
    unittest.main()
