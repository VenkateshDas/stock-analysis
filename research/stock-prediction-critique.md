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
- FII flows have **contemporaneous** (not leading) correlation with NIFTY direction
- **Granger causality tests fail**: A 2022 study using 2011–2021 monthly data finds FII flows and NIFTY direction do not reliably Granger-cause each other at monthly frequency
- **Practical classification**: FII flow is a sentiment confirmation signal, not alpha. Use as a macro filter (e.g., "no new long positions when FII have been net sellers 5+ consecutive days"), not as a primary signal
- DII (Domestic Institutional Investors) often counter-trade FIIs, reducing volatility

```python
# Free NSE FII/DII JSON endpoint (requires session handling — NSE blocks plain requests)
import requests
headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.nseindia.com/reports/fii-dii"}
session = requests.Session()
session.get("https://www.nseindia.com", headers=headers)
response = session.get("https://www.nseindia.com/api/fiidiiTradeReact", headers=headers)
data = response.json()
# Note: NSE blocks non-Indian IP addresses. Use NSEPython library for robust access:
# pip install nsetools nsepython
# Historical data beyond 1 day: https://www.fpi.nsdl.co.in/web/Reports/Latest.aspx
```

**Important caveat:** NSE blocks cloud server IPs (AWS, GCP, DigitalOcean). The [NSEPython library](https://unofficed.com/nse-python/) and [nsefin](https://pypi.org/project/nsefin/) handle retries and session management.

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

IC reference points (from literature):
- IC = 0.00: no signal
- IC = 0.02–0.05: weak but potentially usable (practitioner minimum)
- IC = 0.05–0.06: "very strong" (CFA practitioner standard for monthly equity signals)
- IC > 0.10: exceptional; rare in live out-of-sample settings

| Addition | Implementation Cost | Expected 1-month IC | Notes |
|---|---|---|---|
| **LightGBM baseline** (12-1 momentum + realized vol + volume ratio + RSI + 52w-high) | Low | **0.04–0.07** | Based on LightGBM multi-factor studies and NSE momentum index evidence; sweet spot is 1-month horizon |
| + Fundamental features (P/E, ROE, earnings growth) | Medium | +0.01–0.02 | Incremental; quality factor adds stability |
| + HMM regime filter | Medium | +0.005–0.01 | Risk reduction > return; reduces momentum crash drawdown |
| + FinBERT sentiment | High | +0.003–0.008 | R² = 0.01 standalone; marginal additive value in ensemble |
| + LSTM/TFT | Very High | +0.005–0.015 | Only if walk-forward shows consistent improvement over LightGBM baseline |
| + GNN multi-stock | Extreme | +0.002–0.010 | Often negative OOS; overfitting risk high |

IC by forecast horizon for the baseline feature set:
- **1-week forward**: IC 0.02–0.04 (noisy; high turnover erodes after costs)
- **1-month forward**: IC 0.04–0.07 ← **sweet spot for this feature set**
- **3-month forward**: IC 0.02–0.05 (momentum still predictive; RSI/vol features decay)

The marginal return on complexity diminishes rapidly. **Most of the edge comes from the baseline features.** The LightGBM IC of 0.04–0.07 already comfortably exceeds the ~0.02–0.03 breakeven threshold for semi-annual rebalancing at NSE delivery costs.

Sources: [arXiv 2507.07107: IC 0.023→0.041 with neutralization](https://arxiv.org/html/2507.07107) | [CFA practitioner IC range](https://analystprep.com/study-notes/cfa-level-iii/quantitative-investing/) | [PyQuant News IC guide](https://www.pyquantnews.com/the-pyquant-newsletter/information-coefficient-measure-your-alpha)

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

These are the most important open questions for practical implementation. Questions with new evidence are marked ✅.

### ✅ 1. Does NSE Momentum Work, and Does It Survive Transaction Costs?

**Answer: Yes — strongly, and with quantified evidence from the official NSE index.**

The NSE officially runs the **Nifty500 Momentum 50 Index** (12-1 month methodology, semi-annual rebalance, 50 stocks). Performance since inception (April 2005, data as of October 2024):

| Horizon | Nifty500 Momentum 50 | Nifty 500 (benchmark) | Premium |
|---|---|---|---|
| 3 years CAGR | 23.6% | 15.7% | **+7.9%** |
| 5 years CAGR | 31.7% | 19.7% | **+12.0%** |
| 10 years CAGR | 22.3% | 14.2% | **+8.1%** |
| Since inception | 24.3% | 15.2% | **+9.1%** |

After transaction costs modeled at 0.11% per trade + 0.05% slippage + tax (BacktestIndia.com, 2006–2025): momentum delivers ~14% CAGR vs ~12–13% for Nifty 500. The premium **narrows but survives** at semi-annual rebalancing.

**Critical caveat from ScienceDirect (2017):** On the NIFTY 50 universe alone (50 largest stocks), aggregate momentum returns are "insignificant in most cases." The premium is in **Nifty 200/500**, not the 50 most liquid names.

Sources: [Nifty500 Momentum 50 Factsheet](https://www.niftyindices.com/Factsheet/FactsheetNifty500Momentum50.pdf) | [BacktestIndia](https://backtestindia.com/) | [ScienceDirect 2017](https://www.sciencedirect.com/science/article/pii/S0970389617301647)

---

### 2. On timing: Does momentum work better in bull markets?

**Still open.** Practitioner consensus: yes. Momentum tends to outperform in sustained trending markets and collapses in sharp reversals (2009, 2020). The formal test for NSE is not available in peer-reviewed literature. Capitalmind analysis confirms "most momentum factor portfolios tend to stay invested irrespective of broader market conditions, making them particularly vulnerable in broad and sharp market corrections." The crash protection mechanisms in section 13 address this.

---

### ✅ 3. yfinance NSE Data Quality — Specific Issues

**Answer: Usable post-2015 for NIFTY 50/100 with validation; unreliable pre-2010; bonus issues partially handled; rights issues NOT handled.**

Known documented issues:

| Issue | Detail | Source |
|---|---|---|
| Empty DataFrames without error | Must use `.NS` suffix; some valid tickers (e.g., ITC.NS) intermittently flagged as delisted | GitHub #2612 |
| Bad OHLC on specific dates | `TATASTEEL.NS` on 2023-12-29; other spot errors | GitHub #2055 |
| NSE data broadly unavailable | Extended outages reported 2024 | GitHub #2089 |
| Rate limiting (2024+) | Bulk download of 100+ tickers triggers IP blocks | Various |
| Pre-2010 data | Sparse or missing for mid/small-caps | Practitioner consensus |
| `auto_adjust=True` bonus issues | Handled for NIFTY 50 large-caps; **documented errors for mid/small-caps pre-2015** | NSE Clearing docs |
| Rights issues | **Not reliably handled** in yfinance for any NSE stock | NSE Clearing docs |

**Critical look-ahead bias warning:** `ticker.financials` is the worst source of look-ahead bias — data has no availability timestamp, includes restatements, and mixes fiscal periods without filing dates. **Do not use `ticker.financials` for point-in-time backtesting without external filing date data.**

Workarounds:
```python
# Rate limiting: batch with delays
import time
batches = [tickers[i:i+25] for i in range(0, len(tickers), 25)]
dfs = []
for batch in batches:
    dfs.append(yf.download(batch, start=start, end=end, auto_adjust=True, threads=False))
    time.sleep(1)

# Basic OHLC validation
def validate_ohlc(df):
    daily_returns = df['Close'].pct_change().abs()
    suspicious = daily_returns > 0.5  # >50% single-day move flag
    if suspicious.any():
        print(f"WARNING: {suspicious.sum()} suspicious dates: {df.index[suspicious].tolist()}")
```

**Survivorship bias**: No free point-in-time NIFTY constituent list exists — but [niftyindices.com historical data](https://www.niftyindices.com/reports/historical-data) provides semi-annual rebalancing files. Alternatively use the [India Fama-French survivorship-free dataset](https://rkohli3.github.io/india-famafrench/Fama.html). If neither is available, subtract **~3% per annum** as a rough survivorship bias correction.

Sources: [yfinance #2612](https://github.com/ranaroussi/yfinance/issues/2612) | [yfinance #2055](https://github.com/ranaroussi/yfinance/issues/2055) | [NSE Clearing corporate actions](https://www.nseclearing.in/clearing-settlement/equity-derivatives/corporate-actions-adjustment) | [PyQuant News data cleaning](https://www.pyquantnews.com/free-python-resources/insiders-guide-to-clean-financial-market-data-with-python-and-yahoo-finance)

---

### ✅ 4. Fundamental Data Timeliness (PEAD implementation)

**Answer: Large-cap NIFTY 100 companies file within 15–30 days of quarter-end; Screener.in/Moneycontrol reflect data 1–3 days after NSE filing. Use 2-day entry delay for PEAD strategy.**

PEAD on NSE (Harshita, Singh & Yadav, 2018, *Journal of Accounting and Finance*):
- NSE-listed stocks, 2002–2017
- SUE-sorted decile portfolios: long-short captures approximately **6–7% over the 60-day post-announcement drift window**
- Anomaly survives controls for beta, market cap, P/B, illiquidity, and idiosyncratic volatility

Free earnings surprise data for NSE:

| Source | Cost | Use |
|---|---|---|
| **Screener.in** | Free with login | Quarterly EPS actuals; compute seasonal RW surprise (no analyst estimates) |
| **NSE filings portal** | Free | Announcement date + PDF; requires parsing |
| **Twelve Data** | Free tier (rate-limited) | EPS estimate vs. actual for NIFTY 100 |
| **Financial Modeling Prep** | Free tier (250 req/day) | Earnings surprise list |

Since free analyst estimates for NSE are unavailable at scale, use the **seasonal random walk proxy**:
```python
# SUE using seasonal random walk (same quarter, prior year)
df['expected_eps'] = df.groupby('ticker')['eps'].shift(4)  # same quarter, year ago
df['eps_surprise'] = df['eps'] - df['expected_eps']
df['eps_surprise_std'] = df.groupby('ticker')['eps_surprise'].transform(
    lambda x: x.rolling(8, min_periods=4).std()
)
df['sue'] = df['eps_surprise'] / df['eps_surprise_std']
# Enter PEAD position 2 trading days after announcement date
```

Sources: [SCIRP PEAD India 2018](https://www.scirp.org/journal/paperinformation?paperid=88060) | [Quantpedia PEAD](https://quantpedia.com/strategies/post-earnings-announcement-effect/) | [Screener.in earnings screen](https://www.screener.in/screens/2989688/earnings-surprise/)

---

### ✅ 5. Minimum IC to Break Even After NSE Transaction Costs

**Answer: IC ≈ 0.02–0.03 at semi-annual rebalancing (Nifty 100/200 universe).**

Derivation using Fundamental Law of Active Management (IR = IC × √BR):
- Semi-annual rebalance: ~100% annual turnover → ~0.25% annual cost drag (at 0.25% round-trip)
- At BR = 100 independent bets/year, an IC of 0.02–0.03 generates expected IR just above zero
- The Nifty500 Momentum 50 index evidence implies IC ≈ 0.04–0.07 for the 12-1 month signal — comfortably above breakeven

For intraday/weekly rebalancing strategies: breakeven IC rises sharply due to higher turnover and wider spreads.

Sources: [AQR Transaction Costs white paper](https://www.aqr.com/-/media/AQR/Documents/Insights/White-Papers/AQR-Transactions-Costs---Practical-Application.pdf) | [IC as performance measure — arXiv](https://arxiv.org/pdf/2010.08601)

---

### ✅ 6. India VIX Threshold vs. HMM for Regime Detection

**Answer: India VIX filter is simpler and has practitioner support; no peer-reviewed head-to-head comparison exists for NSE. Use the 200-day SMA filter first.**

India VIX facts:
- All-time high: **92.5** (November 2008); second peak: **~87** (March 2020); current 52-week range: 8.72–23.19
- VIX = 20 is approximately the **75th–80th percentile** of historical readings
- VIX = 25 is approximately the **85th–90th percentile**
- India VIX **mean reverts** in ~45 days (GARCH half-life estimate) — significantly slower than US VIX (~10–20 days). Re-entry timing after VIX spike is 4–8 weeks.

**Crash protection ranking for retail India (empirical evidence, best to worst):**
1. **NIFTY 50 below 200-day SMA** — strongest documented evidence; reduces momentum max drawdown to sub-20%; costs ~2% CAGR in whipsaw scenarios
2. **India VIX > 20 / > 25 filter** — practitioner consensus; go to cash or reduce size; re-enter when VIX normalizes below threshold
3. **Absolute 12-month trailing stop** — exit when portfolio 12-month return turns negative (Dual Momentum approach); reduces 2008 and 2020 crashes
4. **Volatility-scaled position sizing** — theoretically optimal; hardest to implement correctly

No peer-reviewed paper compares HMM vs. India VIX threshold for NSE momentum specifically. Global evidence (MDPI 2020) favors HMM over single-factor regime filters, but HMM adds implementation complexity without a proven India-specific advantage.

Sources: [NSE India VIX White Paper](https://nsearchives.nseindia.com/web/sites/default/files/inline-files/white_paper_IndiaVIX.pdf) | [MomentumIndia Substack backtest](https://momoindia.substack.com/p/backtest-reducing-momentum-drawdowns) | [Capitalmind momentum](https://www.capitalmind.in/insights/momentum-investing-basics-india) | [Indian Dual Momentum](https://samasthiti.substack.com/p/indian-edition-of-the-dual-momentum) | [MDPI HMM regime-switching](https://www.mdpi.com/1911-8074/13/12/311)

---

### 7. On compounding vs. consistency

**Still open.** This is fundamentally a behavioral finance question — the "right" answer depends on the specific investor's ability to continue trading through drawdowns. Literature consensus: most retail investors abandon strategies after 15–20% drawdowns, making the lower-volatility path (scenario B in Section 3) more valuable in practice regardless of theoretical expected value.

---

### 8. On ensemble complexity and meta-overfitting

**Still open.** The general principle from López de Prado: once you've tested more than ~20 parameter combinations, the Deflated Sharpe Ratio penalty makes even excellent-looking results statistically indistinguishable from noise. Stop adding complexity when the Combinatorial Purged Cross-Validation (CPCV) Sharpe stops improving by > 0.1 per added model.

---

### 9. On FinBERT for Indian markets

**Still open, but concern is real.** FinBERT is trained on English US financial text (Reuters, 10-K filings). Indian financial news (Economic Times, Mint, Business Standard) uses different idioms, mentions of "promoter pledging," SEBI orders, F&O expiry language, and occasionally mixed Hindi-English. No published benchmarking of FinBERT performance on Indian financial news exists. Treat FinBERT sentiment on Indian text as an approximation until validated.

---

### 10. On `minimax/minimax-m2.5` vs. alternatives

**Open, but bounded.** For the market commentary use case in this codebase, sentiment classification accuracy matters less than latency, cost, and coherence. The model is mandated in CLAUDE.md; evaluating it against FinBERT for classification accuracy is a legitimate test but outside scope unless the LLM commentary quality is explicitly unsatisfactory.

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

---

## Appendix A: Minimum Viable Phase 1 Momentum Backtest (NSE)

### Walk-Forward Configuration (Evidence-Based)

| Parameter | Recommended Value | Rationale |
|---|---|---|
| Training window | **2-year rolling** | Non-stationary markets; old data can hurt (rolling > expanding for equity ML) |
| Test window | **3 months** | Balances regime coverage vs. statistical noise |
| Embargo period | **4 weeks** | Covers earnings lag, quarterly autocorrelation, T+2 settlement |
| Min walk-forward periods | **8–12** | Sufficient to span 2–3 market regimes over 2015–2025 |
| Universe | **NIFTY 200** (not NIFTY 50) | Momentum premium insignificant in NIFTY 50 alone |
| Backtesting library | **Pandas vectorized** for first build; **Vectorbt** for parameter sweeps | NSE-specific costs must be modeled manually either way |

```python
# Walk-forward splits utility
from dateutil.relativedelta import relativedelta
import pandas as pd

def walk_forward_splits(dates, train_years=2, test_months=3, embargo_weeks=4):
    """Yields (train_start, train_end, test_start, test_end) with embargo gap."""
    test_start = dates[0] + relativedelta(years=train_years)
    while test_start + relativedelta(months=test_months) <= dates[-1]:
        embargo_end = test_start  # test starts after embargo
        train_end = test_start - pd.Timedelta(weeks=embargo_weeks)
        train_start = train_end - relativedelta(years=train_years)
        test_end = test_start + relativedelta(months=test_months)
        yield train_start, train_end, test_start, test_end
        test_start += relativedelta(months=test_months)
```

### NSE Circuit Breaker Detection

When backtesting, flag and exclude circuit-locked days to avoid unrealistic fills:

```python
def flag_circuit_locked(ohlcv_df):
    """Proxy for circuit-locked days: High == Low (no price discovery)."""
    return (ohlcv_df['High'] == ohlcv_df['Low'])
```

Stocks with F&O derivatives (most NIFTY 100 names) have **no individual circuit limits** — only index-level circuit breakers apply. This makes NIFTY 100 stocks significantly safer for backtesting than mid/small-caps with 2–20% daily price bands.

A working template for the simplest possible walk-forward momentum backtest on NSE data, consistent with the evidence above:

```python
"""
Phase 1 Momentum Backtest — NSE/NIFTY 200 Universe
Walk-forward, monthly rebalance, long-only, equal-weight top-20
No ML. Validates signal before adding complexity.
"""
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# --- Universe: Nifty 200 tickers (partial list for illustration) ---
NIFTY200_TICKERS = [
    "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
    # ... full 200-ticker list from NSE website
]

# --- Hard constraint from CLAUDE.md: always use start/end, never period="Nd" ---
START_DATE = "2015-01-01"   # post-2015 for reliable yfinance data
END_DATE = "2025-12-31"

def momentum_score(close_prices: pd.Series) -> float:
    """12-1 month momentum: return skipping last month."""
    if len(close_prices) < 252:
        return np.nan
    return close_prices.iloc[-21] / close_prices.iloc[-252] - 1  # skip last month

def india_vix_regime_ok(vix_value: float, threshold: float = 20.0) -> bool:
    """Crash protection: pause momentum when India VIX > threshold."""
    return vix_value < threshold

def nifty_above_200sma(nifty_close: pd.Series) -> bool:
    """Best-documented crash protection: only run when NIFTY 50 above 200-day SMA."""
    if len(nifty_close) < 200:
        return True
    return nifty_close.iloc[-1] > nifty_close.iloc[-200:].mean()

def walk_forward_backtest(tickers, start, end, top_n=20, rebalance_freq="ME"):
    """
    Monthly walk-forward momentum backtest.
    rebalance_freq: "ME" = month-end (pandas offset alias)
    """
    # Download all price data
    prices = yf.download(tickers, start=start, end=end, auto_adjust=True)["Close"]

    # Rebalance dates
    rebalance_dates = prices.resample(rebalance_freq).last().index

    portfolio_returns = []

    for i, rebalance_date in enumerate(rebalance_dates[12:-1]):  # need 12m history
        # Compute momentum scores for each stock as of rebalance date
        scores = {}
        hist = prices.loc[:rebalance_date]
        for ticker in tickers:
            scores[ticker] = momentum_score(hist[ticker].dropna())

        # Rank and select top N
        ranked = sorted(scores.items(), key=lambda x: x[1] if not np.isnan(x[1]) else -999, reverse=True)
        selected = [t for t, s in ranked[:top_n] if not np.isnan(s)]

        if not selected:
            continue

        # Next month return (forward return)
        next_date = rebalance_dates[i + 13] if i + 13 < len(rebalance_dates) else prices.index[-1]
        current_prices = prices.loc[rebalance_date, selected]
        future_prices = prices.loc[next_date, selected]
        returns = (future_prices / current_prices - 1).mean()

        portfolio_returns.append({
            "date": rebalance_date,
            "return": returns,
            "n_stocks": len(selected)
        })

    df = pd.DataFrame(portfolio_returns).set_index("date")

    # Evaluation metrics
    sharpe = df["return"].mean() / df["return"].std() * np.sqrt(12)
    max_dd = (1 + df["return"]).cumprod().div((1 + df["return"]).cumprod().cummax()).sub(1).min()
    ic = df["return"].mean()  # simplified; proper IC requires cross-sectional rank correlation

    print(f"Annualized Return: {df['return'].mean() * 12:.1%}")
    print(f"Sharpe (annualized): {sharpe:.2f}")
    print(f"Max Drawdown: {max_dd:.1%}")

    return df

# Run
# results = walk_forward_backtest(NIFTY200_TICKERS, START_DATE, END_DATE)
```

---

## Appendix B: FII/DII Data Fetching

```python
"""
NSE FII/DII net flow data — free, but requires session handling.
Use as a macro regime filter, NOT a primary alpha signal.
"""
import requests
import pandas as pd

def fetch_fii_dii_data() -> pd.DataFrame:
    """
    Fetch current FII/DII data from NSE.
    Returns DataFrame with buy/sell/net columns for FII and DII.
    NOTE: NSE blocks non-Indian IPs. Use Indian server or proxy.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.nseindia.com/reports/fii-dii",
        "Accept": "application/json"
    }
    session = requests.Session()
    # Establish session cookies first
    session.get("https://www.nseindia.com", headers=headers, timeout=10)

    response = session.get(
        "https://www.nseindia.com/api/fiidiiTradeReact",
        headers=headers,
        timeout=10
    )
    data = response.json()
    return pd.DataFrame(data)

def consecutive_fii_selling_days(fii_series: pd.Series) -> int:
    """Count consecutive days of FII net selling (negative net values)."""
    consecutive = 0
    for val in reversed(fii_series.values):
        if val < 0:
            consecutive += 1
        else:
            break
    return consecutive

# Usage:
# df = fetch_fii_dii_data()
# selling_days = consecutive_fii_selling_days(df["fii_net"])
# if selling_days >= 5:
#     print("Macro caution: pause new long positions")
```

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
