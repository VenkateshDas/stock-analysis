# Fundamental Trading Strategy Archetypes

> Based on: *"The Long and the Short"* podcast — Three archetypes of trading strategy
> Purpose: Reference guide for stock screening strategy selection and implementation
> Scope: Equities, F&O (India/NSE focus), global indices

---

## Overview

Almost every trading strategy ever devised — from a billion-dollar hedge fund to a solo retail trader — can be traced back to one of three foundational archetypes:

| Archetype | Core Idea | Win Rate | Avg Win/Loss | Best Market Regime |
|-----------|-----------|----------|--------------|-------------------|
| **Trend Following** | Ride moves as long as they last | 35–55% | 2.5–5× | Sustained directional markets |
| **Mean Reversion** | Extremes don't last; prices snap back | 55–80% | 0.8–1.4× | Range-bound, choppy markets |
| **Arbitrage** | Fair value exists; deviations converge | 75–98% | 0.1–0.4× | Any regime (near risk-free) |

> **Key insight (from the transcript):** These archetypes are not competitors — they are complementary. On an hourly chart a stock might be trending; on the daily chart it may be mean-reverting. The edge is knowing which regime you are in and choosing the right archetype.

---

## ARCHETYPE 1 — Trend Following

### Philosophy

*"The trend is your friend until it bends."*

Trend following does **not** predict direction. It reacts to an established price move and rides it until a reversal signal is confirmed. The return profile has positive skew: many small losses cancelled by large, infrequent wins.

- **Cut losses short, let profits run** (attributed to David Ricardo, popularised by every systematic CTA)
- Crisis alpha: Trend following historically delivers its best returns during market crises (2008, COVID 2020)
- Low win rate, high reward/risk ratio — psychologically demanding to trade

### Historical Lineage

| Era | Key Development |
|-----|----------------|
| 1600s | Dutch East India Company share trading; price persistence first observed |
| 1700s | Japanese rice traders develop candlestick charts |
| 1884 | Charles Dow formalises trend persistence in Dow Theory |
| 1949 | Richard Donchian launches first managed futures fund; invents Donchian Channels |
| 1983 | Richard Dennis and William Eckhardt train the *Turtle Traders* — proving trend following can be taught |
| 1990s–2000s | CTAs (Bill Dunn, David Harding/Winton) scale to billion-dollar systematic trend funds |

---

### Sub-Strategy 1.1 — Moving Average Crossover

**What it captures:** When a faster moving average crosses above a slower one, it signals that recent momentum has shifted bullish (and vice versa).

#### Variants

| Name | Fast MA | Slow MA | Time Horizon | Use Case |
|------|---------|---------|--------------|----------|
| Golden / Death Cross | 50-day SMA | 200-day SMA | Months | Long-term positional |
| ORB / Intraday filter | 9-day EMA | 21-day EMA | Days | Swing / intraday filter |
| Medium swing | 20-day EMA | 50-day EMA | 2–8 weeks | Swing trading |
| Long-term positional | 50-day EMA | 200-day EMA | 3–12 months | Portfolio timing |
| Triple MA | 5/10/20 | — | Days | Multi-layer confirmation |

#### Entry / Exit Rules

- **Entry (long):** Fast MA crosses above slow MA AND price is above slow MA
- **Entry (short):** Fast MA crosses below slow MA AND price is below slow MA
- **Exit:** Reverse crossover OR trailing ATR stop
- **False-signal filter:** ADX > 20 confirms a trend is present before entry

#### Key Parameters

| Parameter | Intraday/Swing | Positional | Long-term |
|-----------|---------------|------------|-----------|
| MA type | EMA (faster) | EMA | SMA |
| Fast period | 9 | 20 | 50 |
| Slow period | 21 | 50 | 200 |
| Volume filter | ≥ 1.5× 20-day avg | ≥ 1.2× | ≥ 1.0× |
| ADX minimum | 20 | 22 | 25 |
| RSI filter | 50–70 (long) | 45–72 | 40–75 |

#### Stock Screening Criteria

```
Price > 50-day EMA
Price > 200-day EMA (regime safety filter)
50-day EMA > 200-day EMA
ADX(14) > 20
RSI(14) between 50 and 70
Volume (today) > 1.5 × 20-day average volume
```

#### Risk Profile

- Win rate: 40–48%
- Primary failure mode: Whipsawing in sideways/choppy markets
- Use ATR-based stops (not MA exit) to avoid giving back large gains

---

### Sub-Strategy 1.2 — Breakout Strategies

**What it captures:** When price decisively breaches a key level (resistance or support), a new trend often initiates or accelerates.

#### Variants

| Breakout Type | Setup | Entry Signal | Stop Location |
|---------------|-------|-------------|---------------|
| **Horizontal** | Flat top/bottom consolidation | Close above resistance | Inside broken range |
| **52-Week High** | New annual high | Buy on new high with volume | -1.5× ATR below breakout |
| **Flag / Pennant** | Tight consolidation after impulse | Break of flag high | Bottom of flag pole |
| **Cup & Handle** | Rounded bottom + brief pullback | Break of handle resistance | Below handle low |
| **Ascending Triangle** | Flat top + rising bottom | Break above flat top | Below most recent low |
| **Volatility Squeeze** | BBands inside Keltner channels | First directional expansion | Opposite band |

#### Entry / Exit Rules

- **Entry:** Close above resistance on volume ≥ 1.5× 20-day average
- **Stop:** 1.5–2× ATR below breakout level
- **Target:** Width of the consolidation range projected from breakout point
- **False-breakout filter:** 3-day rule — require 3 consecutive closes above the level

#### Key Parameters

```
Consolidation duration:  minimum 5 candles, ideally 10–20 bars
Volume filter:           breakout volume ≥ 1.5× 20-period average
ATR stop multiplier:     1.5× (aggressive) to 2× (conservative)
RSI at breakout:         between 50 and 68 (not overstretched)
Relative strength:       stock outperforming sector/index over 3 months
```

#### Stock Screening Criteria

```
Price within 2% of 52-week high OR at chart resistance level
Volume today > 1.5 × 20-day avg volume
RSI(14) between 50 and 68
ADX(14) > 18 (some trend present)
6-month price return in top 30% of universe
No earnings within next 5 trading days
```

#### Risk Profile

- Win rate: 40–55% (with volume filter), 30–40% (without)
- Best in: Bull markets, sector-specific tailwinds
- Avoid: Bear markets, high VIX environments, near earnings dates

---

### Sub-Strategy 1.3 — Donchian Channel Breakout (Turtle System)

**What it captures:** The highest high and lowest low of the past N periods forms a channel. A new N-period high/low signals a sustained trend in that direction.

#### Original Turtle Trading Rules

**System 1 (Short-term):**
- Entry: New 20-day high (long) / new 20-day low (short)
- Exit: 10-day low (long) / 10-day high (short)
- Skip-entry filter: Skip if last breakout (even if passed) was profitable

**System 2 (Long-term):**
- Entry: New 55-day high (long) / new 55-day low (short)
- Exit: 20-day low (long) / 20-day high (short)
- No entry filter

#### Position Sizing (Turtle N-System)

```
N = 20-period ATR (exponential)
Dollar Volatility   = N × value per point
Unit size           = (1% of Account) / Dollar Volatility

Add units (pyramid): every 0.5N move in favour (max 4 units per instrument)
Stop per unit:       2N below entry
```

#### Key Parameters

| Period | Signal Type | Holding Period | Signal Frequency |
|--------|-------------|----------------|------------------|
| 10-day | Short-term | Days | Very high |
| 20-day | System 1 | 2–4 weeks | High |
| 55-day | System 2 | 1–3 months | Medium |
| 100-day | Long-term | 2–6 months | Low |

#### Stock Screening Criteria

```
Today's close = new N-day high (N = 20 or 55)
Volume today > 1.2 × N-period average volume
ATR stop = 2× ATR below breakout bar low
Price > 200-day SMA (avoid breakdown-in-disguise)
ADX(14) > 20
```

#### Risk Profile

- Win rate: 35–40% (lowest of all sub-strategies)
- Average winner: 3–5× average loser (highest reward/risk)
- Turtle Traders earned 80%+ annualised in early years with this system

---

### Sub-Strategy 1.4 — Momentum Strategies

**What it captures:** Assets that have outperformed over the past 3–12 months tend to continue outperforming for the next 1–6 months (Jegadeesh & Titman, 1993).

#### Variants

**A) Cross-Sectional Momentum**
- Rank all stocks by past 12-month return (skip most recent 1 month)
- Long: top decile stocks
- Short: bottom decile stocks (or avoid entirely for long-only)
- Rebalance: monthly

**B) Time-Series Momentum**
- For each stock, if 12-month return is positive → long
- If 12-month return is negative → avoid or short
- Rebalance: monthly with volatility scaling

**C) Sector / Industry Momentum**
- Rank sectors by 3-month or 6-month relative return vs. Nifty
- Overweight top 2–3 sectors; underweight/avoid bottom 2–3
- Rebalance: quarterly

#### Key Parameters

| Parameter | Short-term | Medium-term | Long-term |
|-----------|-----------|-------------|-----------|
| Lookback period | 1 month | 3–6 months | 12 months |
| Skip period | None | None | Last 1 month |
| Rebalance | Weekly | Monthly | Monthly |
| Position filter | RSI 50–70 | RSI 45–72 | — |
| Volume filter | > 20-day avg | — | — |

#### Momentum Indicators

| Indicator | Formula | Signal |
|-----------|---------|--------|
| Rate of Change (ROC) | (Close - Close[N]) / Close[N] × 100 | Positive = upward momentum |
| Relative Strength | Stock return / Index return over period | > 1.0 = outperforming |
| MACD Histogram | MACD(12,26,9) | Positive + rising = momentum |
| RSI(14) | Wilder smoothed RS | 50–70 = bullish momentum zone |

#### Stock Screening Criteria

```
6-month return > 15% (or top 20th percentile of universe)
12-month return > 0% (positive time-series momentum)
RSI(14) between 50 and 70
Price > 50-day EMA and 200-day EMA
50-day average volume > threshold (minimum liquidity)
Sector in top 3 by 3-month relative performance
No earnings within 5 trading days
```

#### Performance Benchmarks

- Win rate: 45–55%
- Annual alpha: 6–12% historically (before transaction costs)
- Key risk: Momentum crashes at bear market bottoms (2009, March 2020 — catastrophic losses)
- India consideration: High STT on delivery trades erodes momentum returns in cash segment; consider F&O for short leg

---

## ARCHETYPE 2 — Mean Reversion

### Philosophy

*"The rubber band always snaps back."*

Mean reversion exploits the statistical tendency of prices to return toward their average after extreme deviations. The return profile has **negative skew**: many small, frequent wins with occasional large losses when a trend takes hold and does not reverse.

- Psychologically easier than trend following (higher win rate feels comfortable)
- The catastrophic risk: a mean-reverting trade becomes a trend — requires strict stops
- Best in choppy, range-bound, low-trend (low ADX) market regimes

### Historical Lineage

| Era | Key Development |
|-----|----------------|
| 1880s | Francis Galton coins "regression to the mean" studying inherited height data |
| 1930–40s | Alfred Cowles finds mean-reverting behaviour in stock returns |
| 1980s | John Bollinger develops Bollinger Bands to visualise price deviation from mean |
| 1980s | Morgan Stanley quantitative desk pioneers pairs trading (statistical arbitrage) |
| 2000s+ | Renaissance Technologies and other quant funds embed mean reversion in market-neutral portfolios |

---

### Sub-Strategy 2.1 — RSI-Based Mean Reversion

**What it captures:** RSI measures the magnitude of recent price moves. At extremes (< 30 oversold, > 70 overbought), prices statistically tend to revert.

#### Variants

**Standard RSI(14) Mean Reversion:**
- Entry (long): RSI(14) < 30 while price is above 200-day SMA
- Entry (short): RSI(14) > 70 while price is below 200-day SMA
- Exit: RSI crosses back above/below 50

**Larry Connors RSI(2) — High Win Rate System:**
- Use 2-period RSI (extremely sensitive to recent closes)
- Entry (long): RSI(2) < 10, price above 200-day SMA
- Entry (short): RSI(2) > 90, price below 200-day SMA
- Exit (long): RSI(2) crosses above 65
- Historical win rate: 70–80% on large-cap stocks

**RSI Divergence:**
- Bullish divergence: Price makes new low, RSI makes higher low → long
- Bearish divergence: Price makes new high, RSI makes lower high → short
- Confirmation: Wait for initial price reversal candle before entry

**Double RSI Filter (High Conviction):**
- RSI(14) < 30 AND RSI(2) < 10 → strong oversold
- Fewer signals but higher quality

#### Key Parameters

| RSI Period | Sensitivity | Best Time Horizon | Typical Win Rate |
|------------|-------------|------------------|-----------------|
| RSI(2) | Very High | 1–3 days | 70–80% |
| RSI(7) | High | 3–7 days | 65–72% |
| RSI(14) | Standard | 1–3 weeks | 60–68% |
| RSI(21) | Lower | 2–4 weeks | 55–62% |

#### Stock Screening Criteria

```
RSI(14) < 30  (or RSI(2) < 10 for aggressive entry)
Price > 200-day SMA  (long-side safety — in overall uptrend)
ADX(14) < 25  (non-trending environment — MR works better)
No earnings announcement within 5 trading days
Average daily volume > minimum threshold  (avoid illiquid traps)
3 or more consecutive red candles (optional; increases conviction)
BBands: Price at or near lower Bollinger Band
```

#### Risk Profile

- Win rate: 65–80%
- Average winner: 0.8–1.2× average loser
- Primary risks: Earnings gaps, strong trends that override RSI signals
- India note: Works well on Nifty index options during monthly expiry week

---

### Sub-Strategy 2.2 — Bollinger Band Mean Reversion

**What it captures:** Bollinger Bands (20-day SMA ± 2σ) define statistical price bounds. Price touching or breaching the lower band in a non-trending environment signals reversion to the mean (middle band).

#### Variants

**Band Touch (Basic):**
- Entry: Close at or below lower Bollinger Band
- Exit: Close reaches middle band (20-day SMA)
- Stop: Close below lower band by > 1% (or 1.5× ATR)

**%B Oscillator:**
- %B = (Price - Lower Band) / (Upper Band - Lower Band)
- Entry (long): %B < 0 (price below lower band)
- Entry (short): %B > 1 (price above upper band)
- Exit: %B crosses 0.5 (price at middle band)

**Bollinger Band Squeeze → Breakout (Hybrid):**
- Bandwidth = (Upper - Lower) / Middle
- Squeeze: Bandwidth < 6-month minimum → consolidation
- Direction: Determined by first breakout after squeeze
- This is a trend following signal triggered from a mean-reversion condition

**Double Band (Bollinger + Keltner):**
- Squeeze: BBands (20, 2σ) inside Keltner Channels (20, 1.5×ATR)
- Expansion: BBands exit Keltner → new trend in that direction

#### Key Parameters

| Parameter | Aggressive | Standard | Conservative |
|-----------|-----------|----------|--------------|
| Period | 10 | 20 | 50 |
| Std Dev multiplier | 1.5 | 2.0 | 2.5 |
| %B entry threshold | < 0.05 | < 0 | < -0.05 |
| %B exit threshold | > 0.5 | > 0.5 | > 0.5 |
| Bandwidth squeeze | < 4% | < 6% | < 8% |

#### Stock Screening Criteria

```
Price at or below lower Bollinger Band(20, 2.0)
%B < 0.05
ADX(14) < 22  (avoid entering MR trade in strong trend)
RSI(14) < 40  (confirmation of oversold)
Volume below 20-day average  (low conviction selling = coiling, not panic)
Bandwidth contracting (squeeze building — more explosive reversion likely)
```

#### Risk Profile

- Win rate: 55–68% in range-bound markets
- Drops sharply in trending markets (ADX filter is critical)
- Time horizons: Intraday (5-min chart) to positional (weekly chart)

---

### Sub-Strategy 2.3 — Pairs Trading / Statistical Arbitrage

**What it captures:** Two cointegrated stocks maintain a long-run equilibrium. When the spread between them deviates beyond a statistical threshold, you enter a market-neutral trade expecting reversion to the historical spread.

#### Step-by-Step Process

**Step 1 — Pair Selection**
- Start with fundamentally related stocks (same sector, competing companies)
- India examples: HDFCBANK/ICICIBANK, TCS/INFY, SBI/BANKBARODA, RELIANCE/ONGC
- Require Pearson correlation > 0.80 over 252 trading days

**Step 2 — Cointegration Test**
- Run Engle-Granger cointegration test on log prices
- Require ADF test p-value < 0.05 on the residual spread
- Calculate hedge ratio β via OLS regression: `log(A) = α + β × log(B) + ε`
- Recalculate hedge ratio on rolling 60–120 day window

**Step 3 — Spread Z-Score**
```
Spread       = log(Price_A) - β × log(Price_B)
Mean         = rolling mean of spread (20–60 days)
Std Dev      = rolling std dev of spread (20–60 days)
Z-score      = (Spread - Mean) / Std Dev
```

**Step 4 — Half-Life Calculation**
```
Fit AR(1) model: ΔSpread = α + ρ × Spread + ε
Half-life    = -ln(2) / ρ
Target range: 5 to 30 days (liquid, not too slow)
```

**Step 5 — Entry/Exit Rules**

| Signal | Z-score | Action |
|--------|---------|--------|
| Long spread entry | Z < -2.0 | Long A, Short B |
| Short spread entry | Z > +2.0 | Short A, Long B |
| Profit exit | Z crosses 0 | Close both legs |
| Stop-loss | \|Z\| > 3.5 | Close both — relationship may have broken |

#### Stock Screening Criteria

```
Same sector / industry group
Correlation(252 days) > 0.80
Engle-Granger ADF p-value < 0.05 on spread
Half-life of spread: 5 to 30 days
Current Z-score: |Z| > 2.0
Both stocks have NSE F&O  (for short leg without securities lending)
Daily volume > ₹10 crore on both legs
No corporate action pending on either stock (merger, delisting, split)
```

#### India-Specific Pairs (NSE F&O Universe)

| Pair | Rationale |
|------|-----------|
| HDFCBANK / ICICIBANK | Competing private banks, same customer base |
| TCS / INFY | Top-2 IT services companies, highly correlated order books |
| SBI / BANKBARODA | PSU banks, driven by same government policy signals |
| NIFTY / BANKNIFTY | Index spread; mean reverts with carry/sector rotation |
| RELIANCE / ONGC | Energy sector, crude oil exposure |
| MARUTI / M&M | Auto sector, competing passenger vehicle segments |

#### Risk Profile

- Win rate: 60–75%
- Market-neutral: zero beta (uncorrelated to Nifty direction)
- Primary risks: Regime change (merger, regulatory change breaks the pair permanently), margin calls on short leg
- India advantage: F&O available for both legs; avoids SLBM complexity

---

### Sub-Strategy 2.4 — Consecutive Day Reversal

**What it captures:** After N consecutive losing days, statistical probability of an up-day increases significantly. One of the simplest, most robust mean-reversion patterns.

#### Variants

| Signal | Trigger | Filter | Exit |
|--------|---------|--------|------|
| 3-day drop | 3 consecutive red candles | Price above 200-day SMA | Next day open or 1-day hold |
| 4-day drop | 4 consecutive red candles | Price above 200-day SMA | RSI(2) crosses 65 |
| IBS < 0.2 | (Close-Low)/(High-Low) < 0.2 | Price above 50-day SMA | Next open |
| Williams %R < -90 | Extreme intraday weakness | Above 200-day SMA | %R crosses -50 |

#### Key Parameters

```
Consecutive red candles: 3 (minimum), 4 (higher quality)
Price location: Above 200-day SMA for long-only
Volume: No minimum (often below average in pullbacks — that's fine)
Avoid: Earnings within 2 days, stocks with recent news catalysts
```

#### Risk Profile

- Win rate: 60–70% on large-cap, above-200-SMA stocks
- Time horizon: 1–3 days (very short-term)
- Works best in liquid, large-cap universe (Nifty 50 / Nifty Next 50)

---

### Sub-Strategy 2.5 — Calendar Effects and Overnight Gap Reversion

**Calendar Effects**

| Effect | Observation | Direction | Reliability |
|--------|-------------|-----------|-------------|
| Monday effect | Markets often gap down Monday open | Buy Monday, sell Friday | Moderate |
| Turn-of-month | Last 2 + first 2 days of month | Bullish | Moderate–High |
| January effect | Small-caps outperform in January | Long small-caps Jan | Moderate |
| Post-earnings drift (PEAD) | Stocks drift in earnings direction 1–3 months | Follow earnings surprise | High |
| India monthly expiry | Nifty pins near max pain on expiry Thursday | Event-driven | Moderate |

**Overnight Gap Mean Reversion**

- Setup: Stock gaps down 3–5% at open without fundamental news catalyst
- Signal: High probability bounce within 1–2 days
- Filter: Must be above 200-day SMA; not a fundamental catalyst gap
- Entry: Buy at market open or on reversal candle
- Exit: Gap fill (return to prior session close) or 50% gap fill
- India tool: GIFT Nifty (formerly SGX Nifty) for overnight directional bias

---

### Sub-Strategy 2.6 — Sector Rotation Mean Reversion

**What it captures:** Sectors that have underperformed over the past 1–3 months tend to outperform next quarter as institutional capital rotates.

#### NSE Sector Indices (for screening)
- NIFTY Bank, NIFTY IT, NIFTY Pharma, NIFTY FMCG, NIFTY Auto
- NIFTY Metal, NIFTY Energy, NIFTY Realty, NIFTY Media, NIFTY PSU Bank

#### Implementation

```
Step 1: Rank all 11 sectors by 3-month relative return vs. Nifty 50
Step 2: Sectors in bottom 2–3 → candidates for mean reversion long
Step 3: Sectors in top 2–3 → avoid (or short via sector ETF / futures)
Step 4: Rebalance quarterly
Combine: Economic cycle analysis for direction confirmation
```

#### Risk Profile

- Win rate: 55–65%
- Time horizon: 1–3 months (quarterly cycles)
- Works poorly if sector is in structural decline (not cyclical underperformance)

---

### Mean Reversion: Indicator Quick Reference

| Indicator | Oversold Entry | Overbought Entry | Exit Signal |
|-----------|---------------|-----------------|-------------|
| RSI(14) | < 30 | > 70 | Crosses 50 |
| RSI(2) | < 10 | > 90 | Crosses 65 |
| Bollinger %B | < 0 | > 1 | Crosses 0.5 |
| Stochastic %K | < 20 | > 80 | Crosses 50 |
| Williams %R | < -90 | > -10 | Crosses -50 |
| IBS | < 0.2 | > 0.8 | N/A (1-day trade) |
| Pairs Z-score | < -2.0 | > +2.0 | Crosses 0 |
| ADX (regime filter) | < 20 (safe for MR) | > 25 (danger — trend forming) | — |

---

## ARCHETYPE 3 — Arbitrage

### Philosophy

*"If prices deviate from fair value, rational traders will act to close the gap."*
— Implicit assumption of the Black-Scholes model

Arbitrage exploits price discrepancies between equivalent assets. In theory it is riskless; in practice almost all forms carry some risk (execution, timing, regulatory, or financing risk). The LTCM collapse of 1998 — run by Nobel Prize winners — demonstrated that convergence-assumed trades can fail catastrophically when overleveraged.

### Historical Lineage

| Era | Key Development |
|-----|----------------|
| 1600s | Dutch merchants exploit share price differences between cities |
| 1800s | Bond arbitrage between London and Paris during Napoleonic Wars |
| 1900 | Louis Bachelier introduces stochastic price modeling (foundation for fair pricing) |
| 1970s | Black-Scholes model formalises no-arbitrage pricing for options |
| 1980s | Morgan Stanley pioneers statistical arbitrage (pairs trading at scale) |
| 1994–98 | LTCM achieves spectacular returns via convergence arbitrage; collapses due to overleveraging |
| 2000s+ | HFT firms capture microsecond arbitrage; traditional arb squeezed to near-zero |

---

### Sub-Strategy 3.1 — Pure / Riskless Arbitrage

**What it captures:** Simultaneous buy and sell of the identical asset at different prices in different markets.

**Examples:**
- Cross-exchange price discrepancy (NSE vs. BSE)
- ADR vs. home exchange (INFY ADR on NYSE vs. INFY on NSE)
- Currency triangular arbitrage (USD/EUR × EUR/GBP × GBP/USD ≠ 1)

**Reality in modern markets:**
- HFT algorithms capture these in microseconds
- Requires co-location, direct market access, sub-millisecond execution
- Not accessible to retail or manual traders
- Not a viable screen-based strategy

---

### Sub-Strategy 3.2 — Cash-Futures Arbitrage (India — Most Accessible)

**What it captures:** When Nifty/BankNifty futures trade above their fair value (cost-of-carry price), buy the underlying basket and simultaneously short futures. Basis converges to zero at expiry.

#### Fair Value Formula

```
Futures Fair Value = Spot Price × [1 + Rf × (Days to Expiry / 365)] - Expected Dividends

Where:
  Rf = RBI 91-day T-bill rate (risk-free proxy, currently ~6.5–7%)
  Days to Expiry = calendar days until last Thursday of month
```

#### Entry Rules

```
If Actual Futures Price > Fair Value + Transaction Cost Buffer (≈ 0.30%):
  → Buy spot index components (or Nifty ETF)
  → Sell equivalent futures contract
  → Hold until expiry (basis converges to zero)

If Actual Futures Price < Fair Value - Buffer:
  → Buy futures
  → Short spot (requires F&O or institutional securities lending)
```

#### Calendar Spread Variant

- Near-month futures overpriced vs. far-month → sell near, buy far
- Significantly lower margin than outright positions
- Profit from near-month basis compression

#### NSE Contract Specifications

| Index | Lot Size | Expiry | Monthly Cycles |
|-------|----------|--------|----------------|
| Nifty 50 | 25 | Last Thursday | 3 months |
| BankNifty | 15 | Last Thursday | 3 months |
| FinNifty | 40 | Last Tuesday | 3 months |

#### Transaction Costs (India — Round Trip)

| Cost Component | Rate |
|----------------|------|
| Brokerage (both legs) | 0.01–0.03% per leg |
| STT (F&O sell) | 0.0125% on futures |
| STT (delivery buy) | 0.1% |
| Exchange + SEBI charges | ~0.01% |
| GST on brokerage | 18% of brokerage |
| **Total round-trip estimate** | **~0.15–0.25%** |
| **Minimum viable spread** | **> 0.30% above risk-free** |

#### Risk Profile

- Win rate: 90–98% (near risk-free if held to expiry)
- Typical annualised yield: 6–9% above risk-free (above repo rate)
- Risks: Execution slippage, unexpected dividends, margin calls mid-position
- India arbitrage mutual funds run this at scale (Nippon, ICICI Pru Arbitrage)

#### Screening / Monitoring

```
Monitor: Daily futures basis = (Futures Price - Spot) / Spot × 100
Alert when: Basis exceeds fair value by > 0.30% (annualised spread opportunity)
Entry: Start of new F&O series (premium is highest; 25+ days to expiry)
Avoid: Last week before expiry (basis collapses; lower potential return)
```

---

### Sub-Strategy 3.3 — Merger / Event-Driven Arbitrage

**What it captures:** After a takeover announcement, the target company's stock trades below the offer price due to deal-completion uncertainty. The spread is the market's risk premium for deal failure.

#### Mechanics

```
Merger Arb Spread = Offer Price - Current Market Price

Annualised Yield = (Spread / Current Price) × (365 / Days to Close)

Expected Return = (P_success × Spread) - (P_failure × Downside)

Downside = Stock return to pre-announcement price (typically -20% to -50%)
```

**Example:**
- Offer price: ₹500
- Current price: ₹488
- Spread: ₹12 (2.46%)
- Deal closes in 75 days
- Annualised yield: 2.46% × (365/75) ≈ 12%

#### Deal Quality Screening Criteria

```
Deal type: All-cash >> Stock-for-stock (all-cash = no market risk on acquirer)
Strategic rationale: Related businesses = lower regulatory risk
Acquirer financial strength: No material deterioration risk
SEBI / CCI regulatory clearance: Required for India; assess complexity
Shareholder approval probability: Promoter holding, activist presence
Current spread vs. historical spreads for similar deals
```

#### SEBI Takeover Code (India-Specific)

- Mandatory open offer triggered when acquirer crosses 25% shareholding
- Open offer must be made for minimum 26% of total shares
- Offer price: Maximum of (i) negotiated deal price, (ii) 52-week high, (iii) 26-week average VWAP
- Timeline: Open offer closes within ~26 weeks of announcement

**India Delisting Arbitrage:**
- Company announces voluntary delisting via reverse book building
- Buy below floor price (usually 52-week high)
- Tendering price is discovered via shareholder bids
- Risk: Price discovered below market expectations

#### Stock Screening Criteria

```
Takeover announcement confirmed (BSE/NSE corporate announcements)
Current price < Offer price (spread > 0)
Spread > 1.5% (minimum to cover transaction costs + risk premium)
Annualised yield > 8% (for the risk taken)
Assess: regulatory approvals pending, deal type, timeline
Avoid: Deals with pending CCI / SEBI scrutiny or complex regulatory issues
```

#### Risk Profile

- Win rate: 75–90% (most deals close; catastrophic when they break)
- Time horizon: 1–6 months
- When deals break: Stock drops 20–50% back to pre-announcement levels

---

### Sub-Strategy 3.4 — ETF Arbitrage

**What it captures:** ETF shares can deviate from their underlying NAV. When premium/discount appears, Authorized Participants (institutions) arbitrage it away via creation/redemption.

#### Mechanics

```
Premium to NAV (ETF price > iNAV):
  → Buy underlying basket → Deliver to issuer → Receive ETF shares → Sell ETF
  → Profit = ETF premium - transaction costs

Discount to NAV (ETF price < iNAV):
  → Buy ETF shares → Redeem with issuer → Receive underlying basket → Sell basket
  → Profit = NAV - ETF price - transaction costs
```

#### India ETF Opportunities

| ETF | Index | Typical Premium/Discount |
|-----|-------|-------------------------|
| Nifty BeES | Nifty 50 | ±0.1–0.3% |
| Bank BeES | BankNifty | ±0.1–0.5% |
| Nifty Next 50 ETF | Nifty Next 50 | ±0.2–0.8% |
| Gold ETF | Domestic gold price | ±0.2–0.5% |

**Practical retail use:**
- Monitor iNAV on NSE website in real time
- When ETF trades at > 0.3% discount → buy ETF instead of buying individual stocks (cheaper)
- Full institutional arbitrage requires creation unit sizes (25,000–100,000 ETF shares)

---

### Sub-Strategy 3.5 — Convertible Bond Arbitrage

**What it captures:** Long convertible bond (fixed income + embedded stock call option) + short underlying stock. Profit from bond coupon, option convexity (gamma), and short rebate.

#### Gamma Scalping

- Delta of convertible bond changes as stock price moves
- Continuously rebalance short hedge: buy stock dips, sell stock rallies
- Generates profit from volatility regardless of direction

#### Typical Return Decomposition

| Source | Contribution |
|--------|-------------|
| Bond coupon | +4.6% |
| Short rebate (interest on short proceeds) | +0.8% |
| Dividend cost (paid on short) | -0.6% |
| Leverage cost | -1.6% |
| Arbitrage spread | +0.6% |
| **With 3–4× leverage** | **~20% ROE** |

**India Applicability:** Very limited — India's convertible bond market (FCCBs) is thin and illiquid. Not practically accessible for most traders.

---

### Arbitrage: Accessibility Summary

| Type | Capital Needed | Risk Level | Time Horizon | India Accessibility |
|------|---------------|------------|--------------|---------------------|
| Pure / Riskless | Very High | Near-zero | Milliseconds | Institutional only |
| Cash-Futures | Moderate–High | Low | 1 day – 1 month | Accessible via F&O |
| Merger / Event | Moderate | Medium | 1–6 months | Accessible (cash) |
| Statistical / Pairs | High | Low–Medium | Days–weeks | Partly (F&O pairs) |
| ETF Arbitrage | Moderate | Very Low | Hours–days | Limited (institutional) |
| Convertible Bond | High | Medium | Weeks–months | Very limited in India |

---

## HYBRID APPROACHES

### Hybrid 1 — Regime-Switching (Trend + Mean Reversion)

The most robust multi-strategy approach: detect market regime and apply the appropriate archetype.

#### Regime Detection Methods

| Indicator | Trending (use Trend Following) | Ranging (use Mean Reversion) |
|-----------|-------------------------------|------------------------------|
| ADX(14) | > 25 | < 20 |
| Bollinger Bandwidth | Expanding | Contracting / at minimum |
| Hurst Exponent | > 0.5 | < 0.5 |
| India VIX | < 15 (calm trend) | > 22 (volatile range) |
| Price vs. 200-day SMA | Above (long-side trend) | Below (cautious) |

#### Implementation

```
ADX(14) > 25 + Price above 200-day SMA:
  → Use MA crossover or breakout entry
  → Trail with ATR stop

ADX(14) < 20 + Price above 200-day SMA:
  → Buy RSI(14) < 30 or %B < 0 dips
  → Target middle Bollinger Band

ADX(14) < 20 + Price below 200-day SMA:
  → Pairs trading only, or cash
  → Avoid directional mean reversion longs
```

---

### Hybrid 2 — Momentum + Quality + Mean Reversion Entry

- Screen for top momentum stocks (12-month return top 20th percentile)
- Filter by quality: high ROE, low debt, positive earnings growth
- Wait for pullback to 50-day EMA (mean reversion timing)
- Enter on reversal candle at the 50-day EMA
- Higher win rate than immediate breakout; tighter stop possible

---

### Hybrid 3 — Breakout Retest Entry

- Identify breakout on daily chart (price above multi-week resistance)
- Wait for pullback to retest breakout level (50–61.8% Fibonacci of initial breakout candle)
- Enter on bullish reversal candle at the retest (mean reversion timing into breakout direction)
- Stop: Below the retest low
- Result: Higher win rate than immediate breakout entry; smaller stop distance

---

### Hybrid 4 — ORB + Multi-Filter (India-Specific — Current Bot Strategy)

The Opening Range Breakout strategy implemented in this project is already a 5-factor hybrid:

| Component | Archetype | Implementation |
|-----------|-----------|---------------|
| Opening range break (9:15–9:30 AM) | Trend Following (breakout) | Entry only above/below ORB high/low |
| EMA 9/21 crossover | Trend Following (MA crossover) | Directional filter |
| VWAP position | Trend Following (momentum) | Institutional flow direction |
| RSI anti-chase filter | Mean Reversion (guard) | RSI < 70 for buy, > 30 for sell |
| ATR-based stops | Volatility | 1.5× ATR stop; target_rr × stop |

---

## INDIA-SPECIFIC MARKET CONSIDERATIONS

### Market Structure

| Parameter | Detail |
|-----------|--------|
| Primary exchange | NSE (most liquid F&O globally by contract volume) |
| Equity settlement | T+1 |
| F&O settlement | Cash-settled (indices), physically-settled (stock F&O) |
| Trading hours | 9:15 AM – 3:30 PM IST |
| Pre-market | 9:00–9:15 AM IST (price discovery session) |
| Weekly options expiry | Nifty: Thursday; BankNifty: Wednesday; FinNifty: Tuesday |
| Monthly F&O expiry | Last Thursday of month |

### F&O Universe (Key Parameters)

| Index | Lot Size | Weekly Expiry Day |
|-------|----------|------------------|
| Nifty 50 | 25 | Thursday |
| BankNifty | 15 | Wednesday |
| FinNifty | 40 | Tuesday |
| MidcapNifty | 75 | Monday |

### Transaction Costs (Impact by Strategy)

| Strategy Type | Key Cost | Impact |
|---------------|----------|--------|
| Intraday equity MR | STT 0.025% sell-side only | Moderate |
| Delivery momentum | STT 0.1% buy + sell + LTCG/STCG | High — erodes alpha |
| F&O intraday | STT 0.0125% futures / 0.0625% options | Low — preferred for short leg |
| Cash-futures arb | STT on cash + F&O | Must exceed 0.30% basis to be viable |

### India-Specific Signals

**For Trend Following:**
- GIFT Nifty (pre-market): Overnight gap predictor before 9:15 AM
- FII net buy/sell data (NSE): Directional bias for next session
- Budget / government policy announcements: Sector-specific trend initiators (defence, infra, PLI)
- Monsoon progress: FMCG, Agro, Power sector seasonal trends

**For Mean Reversion:**
- India VIX > 20: High fear; index mean-reversion setups more frequent
- NSE PCR (Put-Call Ratio) > 1.5: Market oversold sentiment
- Monthly expiry week: High volatility; IV crush after expiry → options sellers' mean reversion
- Results season (Q1: Jul–Aug, Q2: Oct–Nov, Q3: Jan–Feb, Q4: Apr–May): Avoid holding through

**For Arbitrage:**
- F&O series start (25+ DTE): Highest futures premium = best cash-futures arb window
- Nifty quarterly rebalance: Index constituent changes create predictable buy/sell pressure
- SEBI open offer filings: Merger arb opportunities in BSE/NSE corporate action announcements

---

## MULTI-FACTOR SCREENING FRAMEWORK

### Factor Combination Matrix

| Screening Factor | Trend Following | Mean Reversion | Pairs Arb |
|-----------------|----------------|---------------|-----------|
| Price > 200-day SMA | Required | Safety filter | — |
| ADX(14) > 25 | Confirm entry | Avoid (skip MR) | — |
| ADX(14) < 20 | Avoid | Prefer | — |
| RSI(14) 50–70 | Uptrend zone | — | — |
| RSI(14) < 30 | — | Entry signal | — |
| Volume > 1.5× avg | Breakout signal | Not required | — |
| Volume < avg | Avoid breakout | Coiling signal | — |
| BB lower band touch | — | Entry signal | — |
| BB width expanding | Trend signal | Avoid | — |
| Correlation > 0.80 | — | — | Required |
| Cointegration p < 0.05 | — | — | Required |
| Z-score > \|2.0\| | — | — | Entry signal |
| Futures basis > fair | — | — | Cash-futures arb |
| Takeover announced | — | — | Merger arb |

---

### Recommended Screening Stacks

#### Trend Following Screen — Swing (1–4 weeks)

```
Universe:     Nifty 500
1. Price > 50-day EMA AND Price > 200-day EMA
2. 50-day EMA > 200-day EMA  (uptrend structure intact)
3. ADX(14) > 20
4. Price within 3% of N-day high (N = 20 or 55)  (breakout candidate)
5. Volume (today) > 1.5 × 20-day average volume
6. RSI(14) between 50 and 70  (momentum, not overbought)
7. 6-month return in top 30% of universe  (momentum filter)
8. No earnings within 5 trading days
```

#### Momentum Screen — Positional (1–3 months)

```
Universe:     Nifty 500
1. 12-month return > 0%  (positive time-series momentum)
2. 12-month return in top 20th percentile of universe
3. Price > 200-day SMA
4. Sector in top 3 by 3-month relative performance vs. Nifty
5. RSI(14) between 45 and 72
6. 20-day average volume above minimum threshold
7. Market cap > ₹1,000 crore  (avoid micro-cap liquidity issues)
```

#### Mean Reversion Screen — Short-term (1–10 days)

```
Universe:     Nifty 200 (large + mid cap only, for liquidity)
1. Price > 200-day SMA  (long-side safety — in uptrend)
2. RSI(14) < 30  OR  RSI(2) < 10  (oversold)
3. Price at or below lower Bollinger Band(20, 2.0)
4. ADX(14) < 25  (non-trending — safe for MR)
5. No earnings within 5 trading days
6. 50-day average volume > ₹5 crore/day  (sufficient liquidity)
7. 3 or more consecutive red candles (optional; increases conviction)
```

#### Pairs Trading Screen — Swing (1–3 weeks)

```
Universe:     Nifty F&O stocks (both legs need futures/options for short)
1. Same sector / industry group
2. Pearson correlation(252 days) > 0.80
3. Engle-Granger ADF p-value < 0.05 on log-price spread
4. Half-life of spread mean-reversion: 5–30 days
5. Current Z-score of spread: |Z| > 2.0
6. Daily volume > ₹10 crore on both legs
7. No corporate actions pending on either stock
```

#### Cash-Futures Arbitrage Monitor

```
Daily check:
1. Futures basis = (Futures Close - Spot Close) / Spot Close × (365 / DTE) × 100
2. If basis annualised > risk-free rate (RBI T-bill) + 0.30%:
   → Cash-futures arb window open
3. Best entry: Days to expiry > 20 (new F&O series)
4. Exit: Hold to expiry or when basis collapses to fair value
```

---

## PERFORMANCE BENCHMARKS

| Strategy | Win Rate | Avg Win/Loss | Profit Factor | Sharpe | Max Drawdown |
|----------|----------|--------------|--------------|--------|--------------|
| CTA Trend Following | 35–45% | 2.5–4.0× | 1.5–2.5 | 0.4–0.8 | 20–40% |
| MA Crossover | 40–48% | 1.8–2.5× | 1.3–1.8 | 0.3–0.6 | 15–35% |
| Breakout (with volume) | 40–55% | 1.5–2.5× | 1.3–1.7 | 0.4–0.7 | 15–30% |
| Turtle System | 35–40% | 3.0–5.0× | 1.6–2.2 | 0.5–0.9 | 25–40% |
| 12-Month Momentum | 45–55% | 1.5–2.0× | 1.4–1.8 | 0.5–0.9 | 30–50% |
| RSI(14) Mean Reversion | 65–80% | 0.8–1.2× | 1.3–1.8 | 0.6–1.2 | 10–20% |
| RSI(2) Mean Reversion | 70–80% | 0.7–1.0× | 1.3–1.7 | 0.8–1.4 | 8–15% |
| Bollinger Band MR | 55–68% | 0.9–1.4× | 1.2–1.6 | 0.5–1.0 | 10–25% |
| Pairs / Stat Arb | 60–75% | 1.0–1.5× | 1.3–1.8 | 0.8–1.5 | 8–20% |
| Merger Arbitrage | 75–90% | 0.2–0.4× | 1.2–1.6 | 0.6–1.0 | 5–15% |
| Cash-Futures Arb | 90–98% | 0.1–0.2× | 1.4–2.0 | 1.5–3.0 | 2–5% |

> **Key insight:** Win rate and avg win/loss ratio have an inverse relationship. High win-rate strategies (MR, arb) have small per-win profits; low win-rate strategies (trend following) require large wins to compensate. Combining both — regime-switching — is how institutional quantitative funds achieve superior risk-adjusted returns.

---

## QUICK REFERENCE — STRATEGY SELECTION GUIDE

```
Q: What is the market doing right now?

ADX > 25 and price above 200-day SMA?
  → TREND FOLLOWING mode
  → Use: MA crossover, breakout, momentum screen

ADX < 20 and price above 200-day SMA?
  → MEAN REVERSION mode
  → Use: RSI(14) < 30, Bollinger lower band, consecutive-day reversal

ADX < 20 and price below 200-day SMA?
  → PAIRS / ARBITRAGE mode only
  → Use: Pairs trading, cash-futures arb, merger arb
  → Avoid: Directional long mean reversion

Strong prior trend + sharp pullback?
  → HYBRID: Buy pullback to 50-day EMA (trend following + MR timing)

Cointegrated pair with Z-score > |2.0|?
  → PAIRS TRADING (market-neutral)

Takeover/open offer announced?
  → MERGER ARBITRAGE

New F&O series started (> 20 DTE)?
  → Monitor CASH-FUTURES BASIS for arb window
```

---

## SOURCES AND REFERENCES

| Source | Archetype | Key Contribution |
|--------|-----------|-----------------|
| "The Long and the Short" podcast (Sepra) | All three | Original framework and mental models |
| Jegadeesh & Titman (1993) | Momentum | Cross-sectional momentum documented across markets |
| Moskowitz, Ooi, Pedersen (2012) | Time-series momentum | 1.31 Sharpe, 20.7% return, 1965–2009 |
| Richard Dennis / Turtle Traders (1983) | Trend following | Turtle trading rules: 20/55-day Donchian |
| Larry Connors | Mean Reversion | RSI(2) high win-rate system |
| Zerodha Varsity | Arbitrage (India) | Cash-futures fair value, pairs trading |
| Hudson & Thames | Pairs trading | Cointegration, ADF, half-life methodology |
| Roger Lowenstein — *When Genius Failed* | Arbitrage (risk) | LTCM collapse — overleveraged convergence trades |
| Black-Scholes-Merton (1973) | Arbitrage | No-arbitrage pricing foundation |
| Wall Street Prep | Merger arb | Spread calculation, deal risk framework |
