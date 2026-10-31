"""
Visualizing Geometric Brownian Motion Paths.

Simulates 25 sample stock trajectories under the risk-neutral measure Q
and plots them against the option strike price K.
"""

import math
import sys
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np

# Allow running directly from examples/ without installation
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mc_option_pricing import simulate_gbm_paths

# 1. Market & Simulation Parameters
S0 = 100.0      # Initial stock price
K = 100.0       # Strike price
r = 0.05        # 5% risk-free rate
sigma = 0.20    # 20% annual volatility
T = 1.0         # 1 year
n_steps = 252   # 252 daily steps
n_paths = 30    # 30 paths for clear visualization

print(f"Simulating {n_paths} Geometric Brownian Motion paths over {n_steps} trading days...")

# 2. Simulate Paths
rng = np.random.default_rng(2026)
paths = simulate_gbm_paths(S0, r, sigma, T, n_steps=n_steps, n_paths=n_paths, rng=rng, scheme="log")

# 3. Create Aesthetic Plot
t = np.linspace(0, T, n_steps + 1)
plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")
fig, ax = plt.subplots(figsize=(10, 5.5), dpi=150)

# Color each path by whether it expires In-The-Money (ITM) or Out-Of-The-Money (OTM)
itm_count = 0
for p in paths:
    if p[-1] > K:
        ax.plot(t, p, lw=1.0, alpha=0.6, color="#2563eb")
        itm_count += 1
    else:
        ax.plot(t, p, lw=1.0, alpha=0.6, color="#ef4444")

# Benchmark lines
ax.axhline(K, color="#1e293b", ls="--", lw=1.8, label=f"Strike Price K = ${K:.0f}")
ax.axhline(S0 * math.exp(r * T), color="#10b981", ls=":", lw=1.8, label=f"Expected Drift E[S_T] = ${S0 * math.exp(r * T):.2f}")

ax.set_title(f"30 Simulated Geometric Brownian Motion Paths (ITM: {itm_count}, OTM: {n_paths - itm_count})", fontsize=12, fontweight="bold")
ax.set_xlabel("Time to Expiration (Years)", fontsize=10)
ax.set_ylabel("Stock Price ($)", fontsize=10)
ax.legend(loc="upper left", frameon=True)

out_file = Path(__file__).parent.parent / "figures" / "fig_sample_paths_demo.png"
plt.tight_layout()
plt.savefig(out_file)
print(f"Saved visualization to: {out_file}")
