# Monte Carlo Simulation for European Option Pricing

[![Python Version](https://img.shields.io/badge/python-3.8%2B-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](tests/)

An educational, clean, and modular implementation of **Monte Carlo simulation for European options pricing** in Python and NumPy. This project validates Monte Carlo pricing against the closed-form **Black-Scholes (1973)** benchmark, verifies the theoretical $\mathcal{O}(1/\sqrt{N})$ convergence rate, and explores variance reduction via **antithetic variates**.

---

## Table of Contents

- [Overview](#overview)
- [Mathematical Framework](#mathematical-framework)
  - [Asset Price Dynamics (GBM)](#1-asset-price-dynamics-geometric-brownian-motion)
  - [Risk-Neutral Pricing](#2-risk-neutral-option-valuation)
  - [Monte Carlo Estimator & Error](#3-monte-carlo-estimator--error-quantification)
  - [Analytical Benchmark (Black-Scholes)](#4-analytical-benchmark-black-scholes)
  - [Variance Reduction (Antithetic Variates)](#5-variance-reduction-antithetic-variates)
- [Project Architecture](#project-architecture)
- [Installation & Quickstart](#installation--quickstart)
- [Running Experiments](#running-experiments)
- [Running Unit Tests](#running-unit-tests)
- [Key Experimental Results](#key-experimental-results)
- [Visualizations](#visualizations)
- [References](#references)
- [License](#license)

---

## Overview

A **European option** gives the holder the right, but not the obligation, to buy (Call) or sell (Put) an underlying asset at a pre-specified strike price $K$ at a fixed maturity date $T$. 

While vanilla European options admit exact analytical solutions via the Black-Scholes formula, more complex financial derivatives (e.g. exotic, multi-asset, or path-dependent options) rarely have closed-form expressions. In industry, **Monte Carlo simulation** is the foundational numerical tool used to value these claims.

This repository provides:
1. **Clean, transparent code** without unnecessary abstractions or over-optimizations.
2. **Direct correspondence** between mathematical equations and Python functions.
3. **Statistical rigor**: Calculation of standard errors, 95% confidence intervals, and empirical Central Limit Theorem validation.
4. **Benchmarking against theory**: Verification of convergence rate $\mathcal{O}(1/\sqrt{N})$ and Put-Call parity.

---

## Mathematical Framework

### 1. Asset Price Dynamics: Geometric Brownian Motion

Under the risk-neutral measure $\mathbb{Q}$, the asset price $S_t$ follows the Stochastic Differential Equation (SDE):

$$dS_t = r S_t \, dt + \sigma S_t \, dW_t$$

where:
- $r$ is the risk-free rate,
- $\sigma$ is the asset volatility,
- $W_t$ is a standard Brownian motion.

By applying **Itô's Lemma** to $\ln(S_t)$, we obtain the exact continuous-time solution at maturity $T$:

$$S_T = S_0 \exp\left( \left(r - \frac{1}{2}\sigma^2\right)T + \sigma \sqrt{T} Z \right), \quad Z \sim \mathcal{N}(0, 1)$$

### 2. Risk-Neutral Option Valuation

By the Fundamental Theorem of Asset Pricing, the fair value of an option is the discounted expectation of its payoff under $\mathbb{Q}$:

$$C = e^{-r T} \mathbb{E}^{\mathbb{Q}}\left[ \max(S_T - K, 0) \right] \quad \text{(European Call)}$$

$$P = e^{-r T} \mathbb{E}^{\mathbb{Q}}\left[ \max(K - S_T, 0) \right] \quad \text{(European Put)}$$

### 3. Monte Carlo Estimator & Error Quantification

Monte Carlo approximates the mathematical expectation by taking the sample average over $N$ simulated trajectories:

$$\hat{C}_N = \frac{e^{-r T}}{N} \sum_{i=1}^{N} \max\left(S_T^{(i)} - K, 0\right)$$

By the **Central Limit Theorem (CLT)**, the statistical accuracy is governed by the standard error (SE):

$$\text{SE} = \frac{s}{\sqrt{N}}, \quad s = \sqrt{\frac{1}{N-1} \sum_{i=1}^N \left(X_i - \bar{X}\right)^2}$$

The asymptotic **95% Confidence Interval** is:

$$\text{CI}_{95\%} = \left[ \hat{C}_N - 1.96 \cdot \text{SE}, \; \hat{C}_N + 1.96 \cdot \text{SE} \right]$$

### 4. Analytical Benchmark: Black-Scholes

The exact closed-form benchmark is given by:

$$C = S_0 \Phi(d_1) - K e^{-r T} \Phi(d_2)$$

$$P = K e^{-r T} \Phi(-d_2) - S_0 \Phi(-d_1)$$

where:
$$d_1 = \frac{\ln(S_0 / K) + \left(r + \frac{1}{2}\sigma^2\right)T}{\sigma \sqrt{T}}, \quad d_2 = d_1 - \sigma \sqrt{T}$$

and $\Phi(\cdot)$ denotes the standard normal cumulative distribution function (CDF).

### 5. Variance Reduction: Antithetic Variates

Because standard Gaussian shocks are symmetric ($Z \sim \mathcal{N}(0, 1) \iff -Z \sim \mathcal{N}(0, 1)$), we can simulate paired prices $S_T(+Z)$ and $S_T(-Z)$ and average their payoffs:

$$Y_i = \frac{1}{2}\left[ f(S_T(+Z_i)) + f(S_T(-Z_i)) \right]$$

Because $f(S_T(Z))$ is monotonic in $Z$, the paired payoffs are negatively correlated ($\text{Cov} < 0$), significantly reducing estimator variance without introducing bias.

---

## Project Architecture

```text
monte-carlo-option-pricing/
│
├── mc_option_pricing/             # Core Python package
│   ├── __init__.py                # Package exports
│   ├── prng.py                    # LCG generator & Box-Muller normal transform
│   ├── gbm.py                     # Exact terminal price & discrete path simulation
│   ├── payoffs.py                 # European Call and Put payoff functions
│   ├── black_scholes.py           # Analytical benchmark pricing & Put-Call parity
│   ├── pricing.py                 # Plain Monte Carlo engine (mean, SE, 95% CI)
│   └── variance_reduction.py      # Antithetic variates implementation
│
├── examples/
│   └── quickstart.py              # Minimal self-contained demo script (~30 lines)
│
├── tests/
│   ├── test_prng.py               # Tests for LCG & Box-Muller transforms
│   ├── test_black_scholes.py      # Tests for analytical benchmark & Put-Call parity
│   └── test_mc_pricing.py         # Tests validating MC convergence to Black-Scholes
│
├── figures/                       # High-resolution experiment figures
│   ├── fig_convergence.png        # LLN convergence and 1/sqrt(N) error decay
│   ├── fig_gbm_paths.png          # Sample Geometric Brownian Motion trajectories
│   ├── fig_payoff_hist.png        # Terminal price and payoff distributions
│   ├── fig_prng_boxmuller.png     # Uniform (LCG) vs Normal (Box-Muller) histograms
│   ├── fig_randomwalk_brownian.png# Discrete random walk to continuous Brownian motion
│   └── fig_clt.png                # Central Limit Theorem demonstration
│
├── run_experiments.py             # Reproduces all tables, results.json, and figures
├── mc_option_pricing.py           # Root convenience runner
├── requirements.txt               # Dependencies
└── LICENSE                        # MIT License
```

---

## Installation & Quickstart

### 1. Clone the repository
```bash
git clone https://github.com/rudranshshukla975-boop/monte-carlo-option-pricing.git
cd monte-carlo-option-pricing
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the quickstart example
```bash
python examples/quickstart.py
```

Output:
```text
Pricing European Call Option (S0=100.0, K=100.0, r=0.05, sigma=0.2, T=1.0):
  Exact Black-Scholes Price : $10.4506
  Plain Monte Carlo Price   : $10.4205 +/- $0.0917 (95% CI: [$10.3289, $10.5122])
  Antithetic Variates Price : $10.4673 +/- $0.0648 (95% CI: [$10.4025, $10.5321])
  Variance Reduction Ratio  : 2.00x speedup
```

---

## Running Experiments

To reproduce all numerical experiments and generate the figures in `figures/`:

```bash
python run_experiments.py
```

This updates `results.json` and outputs all convergence and simulation plots.

---

## Running Unit Tests

To run the automated test suite:

```bash
python -m unittest discover -s tests -v
```
or with pytest:
```bash
pytest -v
```

---

## Key Experimental Results

Using baseline market parameters ($S_0 = 100$, $K = 100$, $r = 5\%$, $\sigma = 20\%$, $T = 1.0\text{ yr}$):

### 1. Main Pricing Results ($N = 100,000$ paths)

| Option Type | Monte Carlo Price | Standard Error | 95% Confidence Interval | Black-Scholes Benchmark | Within 95% CI? |
|:-----------:|:-----------------:|:--------------:|:-----------------------:|:-----------------------:|:--------------:|
| **Call**    | **10.4205**       | 0.0468         | [10.3289, 10.5122]      | **10.4506**             | Yes            |
| **Put**     | **5.6122**        | 0.0275         | [5.5583, 5.6661]        | **5.5735**              | Yes            |

- **Put-Call Parity**: $C - P = 4.8083 \approx S_0 - K e^{-r T} = 4.8771$ (differs by only $0.0688$, well within statistical error).

### 2. Convergence Rate Across Path Counts ($N$)

| Number of Paths ($N$) | Monte Carlo Call | Standard Error | Absolute Error |
|:---------------------:|:----------------:|:--------------:|:--------------:|
| $100$                 | 7.8258           | 1.0120         | 2.6248         |
| $1,000$               | 9.9120           | 0.4483         | 0.5386         |
| $10,000$              | 10.3452          | 0.1477         | 0.1054         |
| $100,000$             | 10.4205          | 0.0468         | 0.0300         |
| $1,000,000$           | 10.4532          | 0.0147         | 0.0026         |

Log-log regression of the standard error against $N$ yields an empirical slope of **$-0.466 \approx -0.500$** ($R^2 = 0.996$), perfectly validating the theoretical $1/\sqrt{N}$ convergence rate.

### 3. Antithetic Variates Performance

| Number of Paths ($N$) | Plain MC SE | Antithetic MC SE | Variance Reduction Ratio ($(\text{SE}_1 / \text{SE}_2)^2$) |
|:---------------------:|:-----------:|:----------------:|:----------------------------------------------------------:|
| $1,000$               | 0.4483      | 0.3168           | **2.00x**                                                  |
| $10,000$              | 0.1477      | 0.1044           | **2.00x**                                                  |
| $100,000$             | 0.0468      | 0.0331           | **2.00x**                                                  |

Antithetic variates cuts the variance in half, yielding an effective **$2.0\times$ computational speedup** for identical precision.

---

## Visualizations

### Convergence and Error Decay
Demonstration of the Law of Large Numbers (left) and the log-log empirical standard error decay confirming the $\mathcal{O}(1/\sqrt{N})$ rate (right):

![Convergence and Error Decay](figures/fig_convergence.png)

### Simulated Asset Price Trajectories
Simulated Geometric Brownian Motion paths under the risk-neutral measure relative to the strike price $K = 100$:

![GBM Paths](figures/fig_gbm_paths.png)

### Terminal Price & Payoff Distributions
Lognormal terminal price distribution $S_T$ and the truncated hockey-stick payoff distributions for Call and Put options:

![Terminal Distributions](figures/fig_payoff_hist.png)

### Random Number Generation & Transform
Uniform samples generated via the Linear Congruential Generator (LCG) and transformed into standard Gaussian variates via the Box-Muller method:

![PRNG and Box-Muller](figures/fig_prng_boxmuller.png)

---

## References

1. Black, F., & Scholes, M. (1973). *The Pricing of Options and Corporate Liabilities*. Journal of Political Economy, 81(3), 637–654.
2. Glasserman, P. (2004). *Monte Carlo Methods in Financial Engineering*. Springer-Verlag New York.
3. Hull, J. C. (2018). *Options, Futures, and Other Derivatives* (10th ed.). Pearson.

---

## License

This project is open-source and available under the [MIT License](LICENSE).
