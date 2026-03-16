# Meta-Research Critique: Signal Validity, Gaps & Practical Feasibility

**Date:** 2026-03-16
**Subject:** Critical analysis of `stock-prediction-research.md`
**Purpose:** Identify what the prior research got wrong, what it glossed over, what is noise vs. signal, and what a practical, affordable system actually looks like.

---

## The Core Problem With Most ML Stock Prediction Research

Before the gaps: the prior document suffers from **selection bias in its sources**. Academic papers on ML stock prediction are systematically biased toward:

1. **Positive results only** — journals rarely publish "LSTM performed no better than buy-and-hold"
2. **In-sample or near-in-sample results** — walk-forward validation is described but rarely shown in final numbers
3. **No transaction costs** — nearly every benchmark ignores brokerage, STT, impact cost, slippage
4. **Cherry-picked periods** — the "807% return" claim covers Jan 2024–Sept 2025, a bull market period; a 20-month window tells you almost nothing
5. **Survivorship-biased universes** — tests on S&P 500 or NIFTY 50 constituents exclude delisted and degraded stocks

> **The meta-finding from replication studies:** Hou, Xue & Zhang (2020, *Review of Financial Studies*) tested 452 published anomalies. **65% cannot clear a t-statistic of 1.96** once microcap stocks are filtered via NYSE breakpoints. Apply a multiple-testing t-threshold of 2.78 and **82% fail**. The prior research document presents these predictors uncritically.

**On ML specifically:** Fischer & Krauss (2018, *European Journal of Operational Research*) — the most honest published treatment — showed LSTM on S&P 500 generated a Sharpe of 5.8 pre-costs (1992–2015), but: *"as of 2010, excess returns seem to have been arbitraged away, with LSTM profitability fluctuating around zero after transaction costs."* This single finding invalidates the premise of most post-2010 ML stock prediction papers.

**On Sharpe ratio publication bias:** Bailey & López de Prado's Deflated Sharpe Ratio (DSR) framework proves mathematically that when many model configurations are tested, a strategy with a Sharpe > 3 is **statistically expected from pure noise** without any real predictive content. The "807% TFT return" is structurally indistinguishable from a lucky draw from this distribution.

---

## Table of Contents

1. [The 807% Return Red Flag](#1-the-807-return-red-flag)
2. [Missing: Transaction Costs Destroy Most Signals](#2-missing-transaction-costs-destroy-most-signals)
3. [Missing: Position Sizing Is More Important Than Signal Quality](#3-missing-position-sizing-is-more-important-than-signal-quality)
4. [Technical Indicators: Real Signal or Widespread Noise?](#4-technical-indicators-real-signal-or-widespread-noise)
5. [Sentiment (R² = 0.01): The Buried Truth](#5-sentiment-r--001-the-buried-truth)
6. [Deep Learning vs. Simple Baselines: The Missing Comparison](#6-deep-learning-vs-simple-baselines-the-missing-comparison)
7. [The RMSE ≠ Profit Disconnect](#7-the-rmse--profit-disconnect)
8. [India-Specific Gaps (NSE/BSE)](#8-india-specific-gaps-nsebse)
9. [Signal Decay: Published Anomalies Get Arbitraged Away](#9-signal-decay-published-anomalies-get-arbitraged-away)
10. [Complexity Overkill: What You Actually Need to Start](#10-complexity-overkill-what-you-actually-need-to-start)
11. [What Has Genuine Out-of-Sample Evidence?](#11-what-has-genuine-out-of-sample-evidence)
12. [The Missing Pieces: A Complete Trading System](#12-the-missing-pieces-a-complete-trading-system)
13. [Practical Recommendations: Start Here, Not There](#13-practical-recommendations-start-here-not-there)
14. [Questions the Research Didn't Answer](#14-questions-the-research-didnt-answer)

---

## 1. The 807% Return Red Flag

The prior document cited:
> *"Starting with $1 in Jan 2024, the TFT CNN-LSTM strategy grew to ~$9.07 by Sept 2025 (+807% total return vs. +38% buy-and-hold)."*

This is almost certainly misleading for the following reasons:

### Why This Number Cannot Be Trusted

| Issue | Explanation |
|---|---|
| **20-month window** | Jan 2024–Sept 2025. Markets were bullish in this period. Any leveraged long strategy would look spectacular. |
| **No transaction costs stated** | 807% implies thousands of trades. At NSE STT + brokerage costs, this would be significantly lower. |
| **Single strategy, single backtest** | One path Sharpe ratio has near-zero statistical significance (López de Prado: need PBO/DSR). |
| **Paper trading vs. live** | Academic papers uniformly test on "close prices" — you can't buy at the close you used to make the decision. |
| **No drawdown stated** | An 807% gain is meaningless without knowing the maximum drawdown. A -60% drawdown is psychologically unsurvivable. |
| **Academic paper motivation** | The paper is incentivized to show a spectacular number to get published. |

### The Correct Framing
> *A single-path Sharpe ratio on a 20-month window with no transaction costs is worthless as evidence. Discard headline return numbers from academic papers. Focus only on: (a) is the approach validated on multiple out-of-sample periods across multiple market cycles? (b) does it survive realistic costs?*

---

## 2. Missing: Transaction Costs Destroy Most Signals

The prior research document **never mentions transaction costs in the context of whether signals are profitable**. This is the single most dangerous omission.

### Indian Market Transaction Costs (NSE/BSE, 2025–2026 — Confirmed)

| Cost Component | Equity Delivery | Equity Intraday | F&O Options |
|---|---|---|---|
| STT | 0.1% buy+sell | 0.025% sell only | 0.15% sell (from April 2026) |
| NSE Transaction Charge | 0.00307% | 0.00307% | 0.03552% |
| SEBI Fee | ₹10/crore | ₹10/crore | ₹10/crore |
| Stamp Duty | 0.015% buy | 0.003% buy | 0.003% buy |
| Brokerage (Zerodha) | ₹0 (delivery) | ₹20 flat | ₹20 flat |
| GST | 18% on brokerage+charges | 18% | 18% |
| **Total round-trip (large cap)** | **~0.25–0.30%** | **~0.05–0.10%** | **Varies** |

> **Critical:** SEBI data shows **91% of individual F&O traders incurred losses in FY25**. In response, Budget 2026 raised F&O STT by 50–150% effective April 2026 specifically to reduce speculation. This context alone should recalibrate expectations for retail strategy viability.

### The Impact Cost Problem for Mid/Small Caps

NSE defines impact cost as the percentage mark-up vs. ideal price for a ₹1 lakh order. Key reality:
- **Large cap liquid stocks** (NIFTY 50): impact cost < 0.05%
- **Mid cap** (NIFTY Midcap 100): impact cost 0.1–0.5%
- **Small cap / illiquid**: impact cost routinely **1–4%**

For a mid-cap stock with 0.3% impact cost, the true round-trip cost is **0.6%+**. Any signal with an IC of 0.05 (a genuinely good signal) translates to roughly 0.1–0.3% expected return per trade — **wiped out entirely by mid-cap impact costs**.

**Practical implication:** A viable ML strategy on NSE must either:
1. Trade only NIFTY 50/100 liquid stocks (low impact cost, lower alpha), OR
2. Hold for 5+ days (amortize the fixed round-trip cost across a larger expected move)

For **futures (F&O)** — slightly lower STT but lot size constraints.

### What This Means for Signal Quality

A strategy that makes 25 round-trip trades per month needs to overcome **6–8% annual drag just from costs**. This eliminates:
- Most intraday technical signal strategies (RSI crossovers, MACD crosses)
- Any strategy with daily rebalancing
- Short-term mean reversion (1–3 day holds) unless the edge is very large

**Survival filter for any signal:**
```
Gross annual return > 2 × (annual transaction cost)
Gross Sharpe > 1.5 to be confident net Sharpe > 0.5
Hold period > 5 days for most NSE retail strategies
```

### The Missing Calculation

Every section in the prior document should have included:
- **Minimum required edge per trade** = round-trip cost / typical trade
- **Required signal precision** given that cost
- **Whether the claimed signal IC (0.05–0.1) is sufficient** to overcome costs

A signal with IC = 0.05 translates roughly to a 52.5% directional accuracy. On a 0.3% round-trip cost, you need average gains to exceed losses by enough to overcome that edge — often marginal or impossible intraday.

---

## 3. Missing: Position Sizing Is More Important Than Signal Quality

The prior research covers signal generation extensively. It never discusses what to **do** with a signal once you have one. This is arguably more important.

### The Kelly Criterion — Not Mentioned Once

The Kelly criterion determines the optimal fraction of capital to risk on each trade:

```
f* = (p × b - q) / b

where:
  p = probability of winning (directional accuracy)
  q = 1 - p (probability of losing)
  b = win/loss ratio (average win / average loss)
```

A directional accuracy of 55% with a 1:1 win/loss ratio:
```
f* = (0.55 × 1 - 0.45) / 1 = 0.10 = 10% of capital per trade
```

Most traders use **half-Kelly or quarter-Kelly** to reduce variance.

### Why Position Sizing Changes Everything

| Scenario | Signal Quality | Position Size | Outcome |
|---|---|---|---|
| A | 60% directional accuracy | 100% concentrated | Ruin after 3 wrong calls in a row |
| B | 55% directional accuracy | 5% Kelly-sized | Steady compounding |
| C | 52% directional accuracy | 10% Kelly-sized | Marginal; costs likely kill it |
| D | 65% directional accuracy | 2% Kelly-sized | Conservative but very resilient |

### Volatility-Scaled Sizing (More Practical)

```python
# Risk-parity / volatility-scaled position sizing
def position_size(signal_strength, realized_vol, target_vol=0.01):
    """
    Size position so that 1-day expected P&L volatility = target_vol % of portfolio.
    signal_strength: -1 to +1 (normalized model output)
    realized_vol: rolling 20-day realized volatility of the stock
    target_vol: 1% of portfolio per position (adjust per risk tolerance)
    """
    return (target_vol / realized_vol) * signal_strength
```

This is the industry standard approach for equity signal generation and is **entirely absent** from the prior research.

---

## 4. Technical Indicators: Real Signal or Widespread Noise?

### RSI (Relative Strength Index)

**What papers claim:** RSI(14) is among the most predictive features.

**What the empirical literature actually shows:**
- Muruganandan (2020) tested RSI directly on **BSE Sensex** across multiple market cycles: **no positive returns, underperforms buy-and-hold** over long horizons. Bootstrap testing contradicted any t-statistic results.
- RSI is a lagged nonlinear transformation of price — it contains **no information not already in the price series itself**.
- Its apparent predictive power in ML papers is primarily: (a) data mining across parameter choices, (b) survivorship bias in test universes, (c) look-ahead in normalization steps.
- **Conditional positive evidence exists only for:** RSI on daily bars with lookback < 5 days, individual stocks (not indices), and only *as one component within a multi-indicator system*. Even then, the edge is thin.

**Verdict:** RSI standalone — **noise, confirmed on BSE data**. As a feature in a 20+ feature ensemble — **marginally informative, not a primary driver**.

### MACD (Moving Average Convergence Divergence)

**What papers claim:** MACD signal crosses are predictive.

**What the empirical literature actually shows:**
- Traditional MACD parameters (12, 26, 9) produce **negative performance on Nikkei 225 futures (2011–2019)** in direct testing. Performance becomes positive only with optimized parameters — which raises severe overfitting concerns (optimized = data-mined).
- MACD fails in sideways/non-trending markets due to whipsawing. The lag in both lines causes entries after moves are largely complete.
- A cross-market study found MACD performs better on **monthly bars** than daily — consistent with it being a medium-term momentum proxy, not a short-term signal.

**Verdict:** MACD crossover as a daily signal — **largely noise after costs**. MACD histogram value (not crossover) as a feature — **weakly informative as one of many features in an ensemble**.

### Moving Average Crossovers (EMA 9/21, SMA 50/200)

**What papers claim:** EMA/SMA crossovers define trend direction.

**What the empirical literature actually shows:**
- A study of S&P 500 (1960–2025) found **false signal rates of 57–76%** for basic MA crossover systems.
- An unfiltered 10/30 SMA crossover on EUR/USD produced **37 false signals in 6 months**, causing a 12% drawdown (*Journal of Trading*).
- Regime-dependence is severe: a 2024 IJBF study (Nasdaq 2018–2022) found significant differences pre-COVID but **no significant difference during and after** — the signal collapsed exactly when you'd want protection most.
- The combination of MA crossover + RSI improved S&P 500 annual returns from 3.9% to 5.1% over 12 years — a modest real effect, but only in combination, never standalone.

**Verdict:** As trend **state indicators** (bull/bear regime filter) — **modestly useful for conditioning other signals**. As trade **entry triggers** — **marginal to no edge after costs**.

### Bollinger Bands

- Band width (squeeze indicator) has genuine predictive content for volatility breakouts — a squeeze predicts that a large move is coming, though not the direction.
- %B as an entry signal (buy near lower band) — mean reversion logic that has genuine edge in low-to-moderate volatility regimes but fails catastrophically in trending markets.

**Verdict:** BB width as a **volatility forecast feature** — genuinely useful. %B as a direction signal — **regime-dependent, not robust standalone**.

### What Actually Has Demonstrated Predictive Content in Technical Data?

| Feature | Evidence Quality | Why It Works |
|---|---|---|
| **Price momentum (12-1 month return)** | ⭐⭐⭐⭐⭐ Strong | Institutional herding, trending behavior |
| **Short-term reversal (1-week)** | ⭐⭐⭐⭐ Moderate | Liquidity provision, overreaction correction |
| **Volume-price divergence (OBV trend)** | ⭐⭐⭐ Moderate | Institutional accumulation/distribution |
| **52-week high proximity** | ⭐⭐⭐ Moderate | Anchoring behavior, breakout follow-through |
| **Realized volatility (10/30-day)** | ⭐⭐⭐⭐ Strong | Volatility clustering is a real phenomenon |
| **RSI/MACD as features (not signals)** | ⭐⭐ Weak | Marginal information beyond raw returns |
| **EMA cross as state indicator** | ⭐⭐ Weak | Marginally better than raw price as regime flag |

---

## 5. Sentiment (R² = 0.01): The Buried Truth

The prior research document mentioned in a footnote:
> *"sentiment alone has limited explanatory power (R² ≈ 0.01 for next-day prediction)"*

This number deserves to be prominently displayed, not buried.

### What R² = 0.01 Actually Means

An R² of 0.01 means sentiment explains **1% of the variance** in next-day returns. The remaining 99% is unexplained (noise). In practical terms:

- Correlation between sentiment and next-day returns ≈ 0.10 (√0.01)
- This is similar to the IC = 0.05–0.10 range — barely above noise
- After transaction costs, the marginal signal from sentiment is likely zero for most strategies

### When Sentiment Actually Helps

Sentiment signals have the most genuine evidence in specific, narrow contexts:
1. **Earnings announcement reactions** — sentiment around earnings calls predicts the post-announcement drift, not just the initial reaction
2. **Macro risk-off events** — aggregated market-wide negative sentiment predicts short-term index weakness
3. **IPO/lockup expirations** — sentiment shifts around corporate events are more predictable than random

**The honest summary:**
FinBERT sentiment features improve multi-modal models by a small but measurable amount in research settings. In a live trading system with transaction costs and execution slippage, the marginal improvement is insufficient to justify the infrastructure cost of running a FinBERT pipeline for retail traders.

**Recommendation:** Use sentiment as one feature in a large ensemble, not as a primary signal driver. Do not build infrastructure around it until you have evidence it improves live trading performance.

---

## 6. Deep Learning vs. Simple Baselines: The Missing Comparison

### The Question the Research Avoided

Does TFT/LSTM/Mamba actually beat a simple 12-month momentum strategy + volatility scaling?

This comparison was **never made** in the prior research. Papers compare against ARIMA, LSTM, or buy-and-hold. They do not compare against:
- Risk parity with momentum tilt
- Simple factor models (Fama-French 3-factor)
- The "one-signal" rule: buy when 12-month return > 0 and realized vol < median

### What the Honest Empirical Literature Shows

**Fischer & Krauss (2018, *European Journal of OR*)** — the most rigorous published treatment:
- LSTM on all S&P 500 constituents 1992–2015: achieved Sharpe of 5.8 and daily returns of 0.46% **before transaction costs**
- **"As of 2010, excess returns seem to have been arbitraged away, with LSTM profitability fluctuating around zero after transaction costs"**
- This single finding explains why 90% of published deep learning stock papers are unreliable: they test on post-2010 data where the alpha has already been extracted

**Strict evaluation protocol (ScienceDirect 2025):**
- When walk-forward OOS validation is enforced with fold-local hyperparameter selection: *"classical baselines (ARIMA and Random Forest) remain difficult to beat, and deep models are not uniformly dominant — suggesting that some previously reported deep learning gains may be sensitive to evaluation design."*
- **ARIMA beats basic single-feature LSTM** on NASDAQ 30-day forecasting (3.4× better RMSE)

**Transformer stability problem (practical concern):**
- Under identical hyperparameters, re-trained Transformer models fail to replicate performance consistently. "There were times its MAPE topped out over 3%." LSTM is more consistent but requires more parameters.

| Model | Typical Reported DA | Realistic OOS DA | Gap Explanation |
|---|---|---|---|
| Naive (always predict up) | 53% | 53% | Market drift |
| Simple momentum rule | 55% | 54–56% | Robustly replicated |
| ARIMA | 52–54% | 52–54% | Honest baseline |
| LSTM (in papers) | 60–67% | 52–56% | k-fold leakage + survivorship bias |
| TFT (in papers) | 65–72% | 54–60% (likely) | All of the above + selection |

> *A realistically validated TFT model likely has genuine directional accuracy of 54–60% on NSE daily data. After 0.3% round-trip cost on a weekly rebalance, this translates to a Sharpe of 0.5–1.5 — real, valuable, but not 807% per year.*

---

## 7. The RMSE ≠ Profit Disconnect

This is the most fundamental methodological problem in the prior research.

### Why Minimizing RMSE Does Not Maximize Profit

Consider two models predicting next-day returns for 100 stocks:

- **Model A (low RMSE):** Correctly predicts small ±0.1% moves with high accuracy. Average absolute error = 0.08%.
- **Model B (high RMSE):** Misses small moves but correctly calls the 3% daily moves. Average absolute error = 0.5%.

Model A wins on RMSE. Model B generates dramatically more profit because it catches the high-magnitude moves that actually matter for returns.

### What Should Be Optimized Instead

| If you want to... | Optimize for... |
|---|---|
| Predict prices accurately | RMSE / MAE |
| Generate directional trading signals | F1-score on direction, Matthews Correlation Coefficient |
| Maximize risk-adjusted returns | Sharpe ratio (directly in loss function, per TFT-ASRO) |
| Minimize catastrophic losses | Sortino ratio or CVaR |
| Select stocks to hold (not trade) | Information Coefficient (IC) at monthly frequency |

### The Critical Implication for Model Selection

The prior research recommends TFT based partly on RMSE improvements. For trading purposes, the correct evaluation is:
1. Rank stocks by model output each week
2. Buy top quartile, hold 1 week, repeat
3. Measure: long-short Sharpe, hit rate, average IC over 3+ years

Only this evaluation tells you if the model generates tradeable alpha. RMSE papers do not.

---

## 8. India-Specific Gaps (NSE/BSE)

The prior research document is almost entirely US/global-market-centric. Critical India-specific factors were never discussed.

### 8.1 NSE Circuit Breakers Destroy Short-Selling Strategies

Indian markets have intraday circuit breakers:
- **10%** circuit: Trading halted 45 minutes if index falls 10%
- **15%** circuit: Trading halted 2 hours if index falls 15%
- **20%** circuit: Trading halted for the day if index falls 20%
- **Individual stock circuits**: 5%, 10%, 20% upper/lower circuits for individual stocks

**Impact:** Any strategy that depends on continuous price discovery (e.g., intraday momentum, mean reversion around events) can be frozen at the worst possible time. Circuit breakers also create price gaps that make stop-losses ineffective.

### 8.2 No Cash Segment Short Selling for Retail

In India's cash segment, retail traders **cannot short sell and carry overnight**. Short selling is only available via:
- Futures & Options (F&O) — but lot sizes are large (₹5–15 lakh notional per lot for NIFTY stocks)
- Intraday short selling (must cover by end of day)

This eliminates **long-short strategies** entirely for most retail investors, which are the majority of ML alpha generation strategies described in the prior research (which are tested long-short on S&P 500 where short selling is frictionless).

### 8.3 F&O Lot Sizes and Margins

- Minimum contract size: ₹5 lakh (recently changed; previously ₹2 lakh)
- SPAN + Exposure margin: typically 15–25% of notional
- This means options strategies require ₹75k–₹1.25 lakh per lot minimum

This creates a minimum capital threshold for many strategies that the prior research never discussed.

### 8.4 Indian Market Data Quality Issues

Using **yfinance for NSE/BSE data** has specific problems:
- Ticker format: Must use `.NS` suffix (e.g., `RELIANCE.NS`) — inconsistent across yfinance versions
- **Missing data**: Many mid/small cap stocks have data gaps
- **Adjusted prices**: Dividend and split adjustments are unreliable for older data
- **Historical depth**: Pre-2010 data is sparse or missing for many tickers
- **Corporate actions**: Bonus issues, rights issues, mergers — yfinance sometimes handles these incorrectly
- **Index constituents**: No easy way to get point-in-time NIFTY 50/100 constituents (survivorship bias)

### 8.5 Promoter Holding as a Signal (India-Specific)

One powerful India-specific fundamental signal **not mentioned** in the prior research:
- **High promoter pledge** (> 50% of promoter holding pledged) is a strong risk flag
- **Increasing promoter buying** is a positive signal (insiders are buying)
- Data source: BSE Shareholding Pattern (free, quarterly)

### 8.6 DII/FII Flow Data (India-Specific Macro Signal)

- **FII (Foreign Institutional Investor) net buy/sell** data is published daily by NSE — free
- FII flows have high correlation with NIFTY direction (FII are large enough to move the index)
- DII (Domestic Institutional Investors) often counter-trade FIIs, reducing volatility
- This **freely available, India-specific signal** was entirely absent from the prior research

```python
# Free from NSE India (no API key required)
# https://www.nseindia.com/reports-indices-fii-dii-data
# FII net equity flows are a legitimate macro regime indicator for Indian markets
```

### 8.7 The NSE Options PCR Is Already Free and Useful

NSE publishes Put-Call Ratio data publicly. Unlike the IV-spread signal (which requires expensive options data), the simple PCR from NSE is:
- **Free**
- **Updated daily**
- **Genuinely predictive** for 1–5 day NIFTY direction (contrarian signal)
- Already partially implemented in this codebase

This should be **the first options-based feature implemented**, not IV skew or GEX (which require expensive data).

---

## 9. Signal Decay: Published Anomalies Get Arbitraged Away

### The Core Problem With Using Published Research

Once a trading anomaly is published in an academic paper, arbitrageurs exploit it, reducing the alpha to near-zero. Known examples:
- **January effect**: Nearly gone by 1990s after publication
- **Small-cap premium**: Significantly reduced; largely explained by illiquidity premium
- **P/E reversal**: Still present but much smaller than Basu (1977) documented
- **Short-term reversal (1-week)**: Still present but requires very low transaction costs to exploit
- **Momentum**: Still present but has had crushing drawdowns (2009, 2020) as factor became crowded

### How Fast Do Signals Decay?

Research by McLean and Pontiff (2016) on 97 documented anomalies:
- Return predictability decreases by **26%** after publication
- After 5 years, most effects are reduced by **50%+**
- Signals that require: (a) small-cap stocks, (b) illiquid stocks, or (c) large capital to exploit persist longer

### What This Means for Using the Research

Every signal in the prior document should be evaluated:
1. When was it first published? (older = more decayed)
2. Is it in large-cap/liquid stocks? (more arbitraged = weaker)
3. Is it being used by institutional algos? (if yes, nearly gone for retail)

| Signal | First Published | Likely Current Strength |
|---|---|---|
| Price momentum (12-1) | 1993 (Jegadeesh) | Still alive, but weaker; crowded |
| Value (low P/B) | 1992 (Fama-French) | Significantly weakened |
| Short-term reversal | 1990 (Lehmann) | Still alive; requires low costs |
| PEAD (earnings momentum) | 1968 (Ball-Brown) | Still alive; strongest remaining anomaly |
| Technical indicators | Various | Largely arbitraged away |
| Sentiment (FinBERT) | 2019–2024 | Too new to assess; possibly already crowded |
| GNN-based cross-stock | 2023–2025 | Very new; likely institutional use only |

---

## 10. Complexity Overkill: What You Actually Need to Start

### The Complexity Problem in the Prior Research

The prior document recommends as a "baseline" or "Phase 1":
- LightGBM with 50+ features
- TFT with 128 hidden units, 8 attention heads, 180-day lookback
- FinBERT for sentiment processing
- HMM for regime detection
- Stacking ensemble with meta-learner

This is a **Phase 4 or 5 system** being called Phase 1. The complexity required:
- GPU instance for TFT training
- Financial news feed for FinBERT
- 3–5 years of clean, point-in-time data
- Expertise in PyTorch, time series validation, model deployment
- Significant engineering time to build and maintain

### What a Practical Phase 1 Actually Looks Like

**Minimum viable signal system for NSE retail:**

```
1. Data: yfinance OHLCV (free)
2. Features: 5-10 technical features (returns, vol, RSI, volume ratio, EMA trend)
3. Model: LightGBM with walk-forward CV
4. Signal: Weekly rebalance (reduces costs)
5. Universe: NIFTY 100 stocks (liquid, reliable data)
6. Evaluation: IC over 2+ years of walk-forward
7. Infrastructure: Python on a laptop — no GPU needed
```

**Total build time:** 2–4 weeks
**Cost:** ₹0 for data and infrastructure
**Expected edge:** IC ≈ 0.03–0.06 (modest but real)

Only after this baseline is showing consistent IC should you add:
- Fundamental features (Phase 2)
- Multi-model ensemble (Phase 3)
- Sentiment integration (Phase 4)
- TFT/DL models (Phase 5, only if Phase 1–4 show genuine additive IC)

### Complexity vs. Actual Gain

| Addition | Implementation Cost | Expected IC Gain |
|---|---|---|
| LightGBM baseline (momentum + vol) | Low | 0.03–0.06 |
| + Fundamental features | Medium | +0.01–0.02 |
| + HMM regime filter | Medium | +0.005–0.01 (risk reduction > return) |
| + FinBERT sentiment | High | +0.003–0.008 |
| + LSTM/TFT | Very High | +0.005–0.015 |
| + GNN multi-stock | Extreme | +0.002–0.010 (often negative; overfitting risk) |

The marginal return on complexity diminishes rapidly. **Most of the edge comes from the baseline features.**

---

## 11. What Has Genuine Out-of-Sample Evidence?

Being rigorous: what signals have been validated across multiple markets, multiple time periods, with transaction costs, and by researchers with no vested interest in the result?

### Tier 1: Robustly Replicated (Use These)

| Signal | Evidence Quality | Notes |
|---|---|---|
| **12-1 month momentum** | ⭐⭐⭐⭐⭐ | Jegadeesh & Titman (1993). Replicated in 23/51 global markets (2024). **Risk: momentum crash** — max drawdown up to -88% in reversals. Must have crash protection. |
| **Low volatility / BAB anomaly** | ⭐⭐⭐⭐⭐ | Frazzini & Pedersen (2014). Documented across decades and markets. Works in India. |
| **Volatility clustering** | ⭐⭐⭐⭐⭐ | Mandelbrot (1963). High vol predicts high vol. Non-controversial. Use as risk feature. |
| **Short-term reversal (1-week)** | ⭐⭐⭐⭐ | Lo & MacKinlay (1990). Survives, but **requires very low transaction costs** — not viable for retail mid/small cap NSE. |

### Tier 2: Present But Requires Care

| Signal | Evidence | Current Status |
|---|---|---|
| **PEAD (earnings momentum)** | Ball & Brown (1968). Historically strong. | **Contested for large caps.** UCLA Subrahmanyam (2024): when microcaps excluded, t-stat drops from 2.18 → 1.43 (below significance). Likely persists in Indian mid/small caps but data quality limits exploitation. |
| **Value (low P/E, P/B)** | Fama-French (1992). Real. | Significantly weakened. Works only at 12m+ horizons. |
| **Earnings quality / accruals** | Sloan (1996). Real. | Partially explained by other factors (q5 model). Still present but smaller. |
| **Sector momentum** | Moskowitz & Grinblatt (1999). | Most individual stock momentum is just sector momentum in disguise. |
| **FII/DII net flow (India)** | Present in NSE data. | Correlated with market-wide moves, not single stocks. Use as macro filter only. |

### Tier 3: Weak Evidence or Unvalidated (Skepticism Required)

| Signal | Why Skeptical |
|---|---|
| **RSI/MACD crossovers** | Muruganandan (2020): tested on BSE Sensex — no positive returns. 57–76% false signal rates for MA crossovers. Empirically weak. |
| **FinBERT sentiment (1-day)** | R² ≈ 0.01. Viability threshold: 0.4% per trade — easily breached by NSE costs. Logistic regression sometimes beats FinBERT in direct comparisons. |
| **GNN multi-stock signals** | Very new (2023–2025). Institutional-scale only. Requires expensive data and compute. No retail validation. |
| **LSTM post-2010 alpha** | Fischer & Krauss (2018): *"as of 2010, excess returns seem to have been arbitraged away, with LSTM profitability fluctuating around zero after transaction costs."* |
| **IV skew / GEX** | Requires Bloomberg/Refinitiv data. Signal partially reflects borrow costs not information. Not free on NSE. |

### Tier 4: Likely Noise (Avoid)

| Signal | Why Avoid |
|---|---|
| **Chart patterns (H&S, flags, triangles)** | No rigorous peer-reviewed evidence of out-of-sample predictability. |
| **Support/resistance levels** | Self-referential; no independent information content. |
| **Social media sentiment (Reddit/Twitter)** | Highly noisy, easily manipulated, costly to denoising. R² likely < 0.005. |
| **Optimization-dependent MACD/RSI parameters** | If parameters were optimized to fit past data, the strategy is data-mined by definition. |

---

## 12. The Missing Pieces: A Complete Trading System

The prior research covers signal generation. It ignores everything else needed for an actual trading system.

### What a Complete System Requires

```
Signal Generation (covered in prior research: ~30% of the system)
        ↓
Universe Filtering (not covered)
  - Liquidity filter (avoid stocks < ₹5 crore daily turnover)
  - Quality filter (exclude promoter pledge > 50%)
  - Sector diversification constraints
        ↓
Signal Combination (partially covered)
  - How to weight multiple signals
  - Conflict resolution (momentum says buy, sentiment says sell)
        ↓
Position Sizing (not covered — critical)
  - Kelly fraction or volatility-scaled sizing
  - Portfolio-level risk constraints
  - Correlation between positions (don't hold 10 banks simultaneously)
        ↓
Execution Logic (not covered at all)
  - When to place orders (open auction vs. limit order mid-day)
  - How to handle circuit breakers and halted stocks
  - Order size relative to daily volume (impact cost)
        ↓
Portfolio Risk Management (not covered)
  - Maximum sector exposure
  - Maximum single-stock concentration
  - Portfolio-level stop-loss (if portfolio falls 10%, stop trading)
  - Drawdown-linked position sizing reduction
        ↓
Performance Attribution (not covered)
  - Is alpha coming from the right source? (model vs. luck vs. factor loading)
  - IC decomposition by time period and sector
  - Transaction cost attribution
```

---

## 13. Practical Recommendations: Start Here, Not There

Based on this critique, here is the revised priority order:

### Phase 0: Establish What You Are Trying to Do (Missing from Prior Research)

Before any ML, answer:
1. **What is my hold period?** (intraday, weekly, monthly)
2. **What is my universe?** (NIFTY 50, NIFTY 100, NIFTY 500)
3. **What is my minimum capital and max position size?**
4. **Can I execute futures/options?** (if not, long-only cash segment only)
5. **What is my acceptable maximum drawdown?** (this constrains Sharpe required)

### Phase 1: The Simplest Possible System That Might Work

**Signal:** Monthly momentum (12-1 month return), cross-sectionally ranked
**Universe:** NIFTY 100 (liquid, reliable data via yfinance)
**Rebalance:** Monthly (12 round-trips/year → ~4% annual cost drag)
**Position sizing:** Equal weight, top-20 stocks
**Evaluation:** Walk-forward IC over 2018–2026 (pre/post-COVID, rate cycles)

This requires:
- 100 lines of Python
- No GPU, no ML library, no API key
- Zero cost
- 1 week to implement and validate

If IC is not positive over 5+ years of walk-forward, the entire ML stack built on top will also fail.

### Phase 2: Add One Thing at a Time

Add one signal at a time and measure IC improvement:
1. **Earnings momentum** (PEAD): Buy stocks that beat estimates in the last 4 weeks
2. **Low volatility tilt**: Penalize high-realized-vol stocks in ranking
3. **Fundamental quality**: Add ROE/earnings growth as secondary ranking factor
4. **FII flow filter**: Block buys when FII have been net sellers for 5+ consecutive days (macro filter)

### Phase 3: First ML Model

Only after Phase 2 shows stable IC:
- **LightGBM** on the feature set above, trained monthly
- Walk-forward CV with 2-year expanding window
- Objective: IC improvement over Phase 2

### Phase 4: Deep Learning (Only If Phase 3 Adds IC)

- TFT via Darts — for multi-horizon prediction and uncertainty intervals
- Use Phase 2 features as past covariates

**Key gate:** Each phase should only proceed if the prior phase shows positive, consistent IC in walk-forward validation.

---

## 14. Questions the Research Didn't Answer

These are the most important open questions for practical implementation:

1. **On Indian markets specifically:** Does momentum work as well in NSE as in US markets, or does the thin liquidity and higher transaction costs eliminate the edge?

2. **On timing:** How does signal quality vary across the market cycle? Does momentum work better in bull markets? Does value work better post-correction?

3. **On yfinance reliability:** How many NSE tickers have >5 consecutive missing trading days in the last 5 years? What percentage of adjusted prices are incorrect post-split? (No one has tested this rigorously.)

4. **On fundamental data timeliness:** BSE corporate disclosures: what is the actual lag between results declaration and data availability in yfinance's `ticker.financials`?

5. **On minimum viable signal:** What is the minimum IC needed to generate positive alpha after NSE transaction costs at a monthly rebalance? (Rough answer: IC > 0.04, but this has not been calculated for this specific codebase's data.)

6. **On regime detection:** Is a simple VIX/India VIX threshold (> 20 = risk-off) better than HMM for a weekly-rebalancing retail strategy? (HMM is complex; simple thresholds may be sufficient.)

7. **On compounding vs. consistency:** Is a 55% directional accuracy strategy with 5% monthly drawdowns better than a 62% accuracy strategy with occasional 20% drawdowns? (Depends entirely on the trader's ability to continue trading through drawdowns — a behavioral question the research ignores.)

8. **On ensemble complexity:** At what point does ensemble complexity (more base learners, stacking) start hurting OOS performance due to meta-overfitting? When should you stop adding models?

9. **On FinBERT for Indian markets:** FinBERT is trained primarily on English financial text from US markets. Does it correctly interpret sentiment in Indian financial news, which often uses different idioms, mixed Hindi-English, and India-specific corporate governance language?

10. **On the LLM model in this codebase:** `minimax/minimax-m2.5` via OpenRouter — what is its track record on financial sentiment classification vs. FinBERT or GPT-4? This was mandated in CLAUDE.md but never evaluated against alternatives.

---

## Summary: The Honest Assessment

| Claim in Prior Research | Reality |
|---|---|
| "Hybrid models achieve 40–50% MAE reduction" | True in controlled in-paper tests. Likely 5–15% in strict OOS. |
| "TFT returns 807% vs 38% buy-and-hold" | Cherry-picked period, no costs, single path — discard this number |
| "FinBERT sentiment among most influential features" | R² = 0.01. Marginal impact on trading profitability. |
| "Stacking improves accuracy by 12–15%" | Possibly true in papers; unknown if it translates to trading profit. |
| "HMM regime detection improves Sharpe" | Useful as a risk filter; questionable if the complexity is justified over VIX threshold. |
| "TFT is the primary recommendation" | Too complex for Phase 1. Momentum + LightGBM first; TFT only after IC baseline is established. |
| "52-week high, RSI, MACD among most predictive" | RSI/MACD evidence is weak. 52-week high proximity has moderate genuine evidence. |

### The Practical Conclusion

> The research document is a high-quality survey of what academia **claims** works. It is not a guide to what will actually work in a live NSE/BSE trading system with real capital, real costs, and real execution constraints.
>
> The most valuable signals (momentum, PEAD, low volatility, volatility clustering) are the simplest and cheapest to implement. The most complex systems (GNN, Mamba, stacking ensembles) have the weakest real-world validation.
>
> **Build simple first. Validate rigorously. Add complexity only when each addition demonstrably improves live IC.**

---

*This critique will be updated as web research on signal replication and Indian market specifics is incorporated.*

---

**References for Critique Claims:**
- Harvey, C.R., Liu, Y., Zhu, H. (2016). "...and the Cross-Section of Expected Returns." *Review of Financial Studies* 29(1), 5–68. [Factor zoo / replication rates]
- Hou, K., Xue, C., Zhang, L. (2020). "Replicating Anomalies." *Review of Financial Studies* 33(5), 2019–2133. [85% replication failure rate]
- McLean, R.D., Pontiff, J. (2016). "Does Academic Research Destroy Stock Return Predictability?" *Journal of Finance* 71(1), 5–32. [Signal decay post-publication]
- Jegadeesh, N., Titman, S. (1993). "Returns to Buying Winners and Selling Losers." *Journal of Finance* 48(1), 65–91. [Momentum anomaly]
- López de Prado, M. (2018). *Advances in Financial Machine Learning*. Wiley. [PBO, DSR, purged CV]
- Ball, R., Brown, P. (1968). "An Empirical Evaluation of Accounting Income Numbers." *Journal of Accounting Research* 6(2), 159–178. [PEAD]
- Baker, M., Bradley, B., Wurgler, J. (2011). "Benchmarks as Limits to Arbitrage." *Financial Analysts Journal* 67(1), 40–54. [Low volatility anomaly]
