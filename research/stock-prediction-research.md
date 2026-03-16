# Stock Price Prediction Research: Combining ML, Technical & Fundamental Analysis

**Research Date:** 2026-03-16
**Branch:** `claude/research-stock-prediction-BIrO4`
**Purpose:** Foundation research for implementing a multi-modal stock price prediction system.

---

## Table of Contents

1. [Problem Definition & Scope](#1-problem-definition--scope)
2. [The Prediction Landscape: What the Research Says](#2-the-prediction-landscape-what-the-research-says)
3. [Data Sources & Feature Engineering](#3-data-sources--feature-engineering)
4. [Technical Analysis Features](#4-technical-analysis-features)
5. [Fundamental Analysis Features](#5-fundamental-analysis-features)
6. [Alternative & Sentiment Data](#6-alternative--sentiment-data)
7. [ML & DL Model Architectures](#7-ml--dl-model-architectures)
8. [Hybrid & Ensemble Methods](#8-hybrid--ensemble-methods)
9. [Market Regime Detection](#9-market-regime-detection)
10. [Validation, Bias Prevention & Anti-Leakage](#10-validation-bias-prevention--anti-leakage)
11. [Production Frameworks & Libraries](#11-production-frameworks--libraries)
12. [Evaluation Metrics](#12-evaluation-metrics)
13. [Risk-Adjusted Training & Objectives](#13-risk-adjusted-training--objectives)
14. [Recommended Architecture for This Project](#14-recommended-architecture-for-this-project)
15. [Implementation Roadmap](#15-implementation-roadmap)
16. [Key Pitfalls to Avoid](#16-key-pitfalls-to-avoid)
17. [References](#17-references)

---

## 1. Problem Definition & Scope

Stock price prediction is a multi-horizon, multi-modal forecasting problem. The goal is not to achieve "perfect prediction" (impossible due to market efficiency and noise) but to identify **high-probability directional moves** and provide **calibrated price ranges** over a defined future window.

### Prediction Horizons

| Horizon | Timeframe | Primary Drivers | Model Preference |
|---|---|---|---|
| Ultra-short | 1–5 min | Order flow, microstructure | Mamba, CNN-LSTM |
| Intraday | 1 h to 1 day | Technical signals, momentum | LSTM, TFT |
| Short-term | 1–10 days | Technical + macro sentiment | TFT, Ensemble |
| Medium-term | 1–4 weeks | Fundamental + technical | TFT-GNN, Hybrid |
| Long-term | 1–12 months | Fundamentals, macro cycles | GBM, Factor models |

### Key Insight from Research

> *Technical indicators and momentum features become significantly less predictive beyond 6 months (correlation dropping from 0.72 to 0.31), while fundamental factors maintain relatively stable predictive power (correlation decrease from 0.65 to 0.48). This differential decay suggests horizon-specific feature weighting is necessary.*

---

## 2. The Prediction Landscape: What the Research Says

### 2.1 What Works

Based on 2022–2025 research:

1. **Hybrid models consistently outperform single-model approaches** — combining LSTM's sequential memory with Transformer's attention mechanism yields 40–50% MAE reduction vs. LSTM alone (TFT vs. LSTM on Vietnamese market stocks).
2. **Multi-modal fusion is now standard** — models incorporating price + sentiment + macro data outperform price-only models in 90%+ of studies.
3. **Regime-aware models are significantly more robust** — models that detect market regimes (bull/bear/sideways) and apply regime-specific logic achieve higher Sharpe ratios and fewer drawdowns.
4. **Ensemble / stacking outperforms individual models** — stacking XGBoost + LightGBM + deep learning can boost AUC-ROC by 12–15% vs. best single model.
5. **Attention mechanisms provide interpretability** — TFT's variable selection network clearly identifies feature importance, enabling explainability.

### 2.2 What Doesn't Work Well

- **Pure technical analysis for long horizons** — degrades rapidly after 6 months
- **Overfitted LSTM models** — common train/test gaps due to improper time-series CV
- **Black-box single models without regime awareness** — fail catastrophically during volatility spikes (COVID-19, geopolitical events)
- **Random k-fold cross-validation on time series** — introduces severe look-ahead bias (RMSE artificially reduced by >20%)

---

## 3. Data Sources & Feature Engineering

### 3.1 Available Data Sources

#### Price & Volume Data
- **yfinance** — Free, unofficial API. Suitable for prototyping. Use `.history(start=..., end=...)` (not `period=` shorthand).
- **Alpha Vantage** — Free tier + paid plans. Official API. 50+ built-in technical indicators, fundamentals, options, news & AI-powered sentiment.
- **Polygon.io** — High-quality tick data, options flow, institutional-grade.
- **Quandl/NASDAQ Data Link** — Macro + alternative data.

#### Fundamental Data (Key Sources)
- **Alpha Vantage Fundamentals API** — P/E, EPS, income statements, balance sheets, cash flows (refreshed same-day as earnings).
- **yfinance `.info` & `.financials`** — P/E, P/B, revenue, margins, debt ratios (partial, scraped).
- **SEC EDGAR** — Raw 10-K/10-Q filings for custom parsing.
- **Simfin** — Structured financial statements API (free tier available).

#### Sentiment & Alternative Data
- **Alpha Vantage News & Sentiments API** — Real-time news, 15-year earnings call transcripts with LLM-based sentiment.
- **NewsAPI** — Financial news headlines for FinBERT processing.
- **Reddit/Twitter** — WallStreetBets sentiment (via Pushshift, Twitter API).
- **Options flow** — Put/Call ratio (PCR), unusual options activity as sentiment proxy.

### 3.2 Feature Engineering Philosophy

> *Feature engineering is fundamentally a creative process. The cardinal rule is: **No peeking** — never use information that would not have been available at prediction time.*

#### The Anti-Leakage Rule for Features

```
WRONG: scaler.fit_transform(entire_dataset)  # leaks future statistics
RIGHT: scaler.fit(train_set).transform(val_set)  # fit only on past

WRONG: rolling_mean(window=20, future_included=True)  # look-ahead
RIGHT: rolling_mean(window=20).shift(1)  # only use data available yesterday
```

#### Feature Categories & Engineering Steps

```
Raw OHLCV → Price-derived features (returns, log-returns, range)
         → Volume-derived features (VWAP, volume ratio, OBV)
         → Technical indicators (RSI, MACD, BB, ATR, EMA cross)
         → Calendar features (day of week, month, earnings date proximity)
         → Fundamental ratios (P/E, P/B, EPS growth, debt/equity)
         → Macro features (VIX, sector performance, index correlation)
         → Sentiment scores (FinBERT or LLM-derived from news)
         → Regime labels (HMM-derived: bull/bear/sideways)
```

---

## 4. Technical Analysis Features

### 4.1 Feature Taxonomy

| Category | Indicators | Horizon Utility |
|---|---|---|
| **Trend** | SMA(20/50/200), EMA(9/21/50), ADX | All horizons |
| **Momentum** | RSI(14), MACD, Stochastic, Williams %R | Short-to-medium |
| **Volatility** | Bollinger Bands, ATR, Keltner Channel, VIX | All horizons |
| **Volume** | OBV, VWAP, CMF, Volume SMA ratio | Short-term |
| **Structure** | Support/Resistance levels, CPR, Opening Range | Intraday |
| **Cross-asset** | Sector ETF returns, Index correlation, DXY | Medium-to-long |

### 4.2 Feature Engineering Specifics

**Momentum Features (most predictive short-term)**
```python
# RSI (momentum oscillator) — already in codebase via ta library
rsi = ta.momentum.RSIIndicator(close, window=14).rsi()

# MACD signal strength (normalized)
macd = ta.trend.MACD(close)
macd_hist_normalized = macd.macd_diff() / close  # normalize by price

# Rate of change (short-term momentum)
roc_5 = close.pct_change(5)   # 5-day return
roc_21 = close.pct_change(21)  # 1-month return

# Relative strength vs. index
rs_vs_nifty = close / nifty_close  # ratio, not difference
```

**Volatility Features (regime proxy)**
```python
# Realized volatility (key input for regime detection)
realized_vol_10 = close.pct_change().rolling(10).std() * np.sqrt(252)
realized_vol_30 = close.pct_change().rolling(30).std() * np.sqrt(252)

# ATR-based volatility normalized
atr = ta.volatility.AverageTrueRange(high, low, close, window=14).average_true_range()
atr_pct = atr / close  # normalize

# Bollinger Band width (squeeze = low vol, expansion = breakout)
bb = ta.volatility.BollingerBands(close, window=20)
bb_width = (bb.bollinger_hband() - bb.bollinger_lband()) / bb.bollinger_mavg()
bb_pct_b = bb.bollinger_pband()  # 0=lower band, 1=upper band
```

**Volume Features (institutional activity proxy)**
```python
# Volume ratio (current vs. average)
vol_ratio = volume / volume.rolling(20).mean()

# OBV divergence
obv = ta.volume.OnBalanceVolumeIndicator(close, volume).on_balance_volume()
obv_trend = obv.rolling(10).mean() / obv.rolling(30).mean()

# VWAP deviation
vwap_dev = (close - vwap) / vwap  # % deviation from VWAP
```

### 4.3 Feature Selection — LASSO Approach

Research shows 57+ technical indicators can be used, but LASSO feature selection reduces this to a manageable, non-redundant set:

```python
from sklearn.linear_model import LassoCV
from sklearn.preprocessing import StandardScaler

# Fit LASSO to identify most predictive features
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_train)  # ONLY fit on train!

lasso = LassoCV(cv=5, random_state=42)
lasso.fit(X_scaled, y_train)

# Features with non-zero coefficients
selected_features = X_train.columns[lasso.coef_ != 0].tolist()
```

**Key empirical finding:** Primary price-based features (returns, log-returns, OHLC ratios) consistently outperform derived technical indicators in high-frequency contexts. Technical indicators add more value at daily+ horizons.

---

## 5. Fundamental Analysis Features

### 5.1 Feature Categories

| Category | Features | Update Frequency |
|---|---|---|
| **Valuation** | P/E, P/B, EV/EBITDA, PEG ratio, Price/Sales | Quarterly (earnings) |
| **Profitability** | ROE, ROA, Net Margin, Gross Margin, EBITDA margin | Quarterly |
| **Growth** | EPS growth (YoY, QoQ), Revenue growth, Forward EPS | Quarterly |
| **Financial Health** | Debt/Equity, Current Ratio, Interest Coverage | Quarterly |
| **Cash Flow** | Free Cash Flow yield, Cash Flow / Revenue | Quarterly |
| **Dividends** | Dividend Yield, Payout Ratio, Dividend Growth | Quarterly |
| **Efficiency** | Asset Turnover, Inventory Turnover, Days Sales Outstanding | Quarterly |

### 5.2 Fundamental Feature Engineering

**Key insight:** Fundamental data updates only quarterly, so it must be forward-filled between reporting dates — but only using point-in-time data to avoid look-ahead bias.

```python
# Point-in-time fundamental features
# Merge quarterly fundamentals with daily price data
def merge_fundamentals_point_in_time(prices_df, fundamentals_df):
    """
    Merge fundamentals ensuring no future data leaks.
    Use 'as-of' merge — for each trading day, use the most recent
    quarterly report that would have been PUBLICLY AVAILABLE.
    SEC filings are typically available 45-60 days after quarter end.
    """
    # Add publication lag (45 days after quarter end = typical SEC filing delay)
    fundamentals_df['available_date'] = (
        fundamentals_df['report_date'] + pd.DateOffset(days=45)
    )

    # pd.merge_asof merges on nearest key without exceeding
    merged = pd.merge_asof(
        prices_df.sort_values('date'),
        fundamentals_df.sort_values('available_date'),
        left_on='date',
        right_on='available_date',
        by='ticker'
    )
    return merged

# Normalized fundamental features (remove currency scale)
pe_ratio = price / eps_ttm  # Trailing P/E
pe_zscore = (pe_ratio - pe_ratio.rolling(252).mean()) / pe_ratio.rolling(252).std()  # Relative valuation

# Earnings surprise (actual vs. estimate — high predictive power)
earnings_surprise = (actual_eps - estimated_eps) / abs(estimated_eps)

# EPS growth momentum
eps_growth_qoq = (current_eps - prev_eps) / abs(prev_eps)
eps_growth_yoy = (current_eps - year_ago_eps) / abs(year_ago_eps)
```

### 5.3 Why Fundamentals Matter for Long-Horizon Predictions

Research finding: Fundamental data is a **stronger predictor beyond 6 months** than technical data. Key mechanisms:
- **Earnings surprises** cause sustained multi-week price moves
- **Valuation compression/expansion** drives sector rotations over months
- **Free cash flow yield** is a strong predictor of 12-month forward returns
- **Debt levels** predict downside risk during credit tightening cycles

### 5.4 Data Access in This Codebase

Using yfinance (already integrated):
```python
import yfinance as yf

ticker = yf.Ticker("RELIANCE.NS")

# Fundamentals
info = ticker.info  # P/E, market cap, sector, beta, etc.
financials = ticker.financials          # Income statement (annual)
quarterly_financials = ticker.quarterly_financials
balance_sheet = ticker.balance_sheet
cashflow = ticker.cashflow

# Key metrics to extract:
pe_ratio = info.get('trailingPE')
forward_pe = info.get('forwardPE')
eps = info.get('trailingEps')
revenue_growth = info.get('revenueGrowth')
profit_margins = info.get('profitMargins')
debt_to_equity = info.get('debtToEquity')
return_on_equity = info.get('returnOnEquity')
```

---

## 6. Alternative & Sentiment Data

### 6.1 News Sentiment with FinBERT

FinBERT is the domain-specific BERT model pre-trained on financial texts. It outperforms general BERT and even GPT-4 in financial sentiment classification tasks.

**Architecture: FinBERT + LSTM Pipeline**
```
Financial News Headlines → FinBERT → Sentiment Score (bullish/bearish/neutral)
                                   → Sentiment Embedding Vector
                    ↓
Daily Sentiment Aggregation → Rolling Sentiment Momentum
                    ↓
LSTM/TFT Input (fused with price features)
```

**Implementation:**
```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

# Load FinBERT (pre-trained on financial texts)
tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert")
model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert")

def get_sentiment_score(text: str) -> float:
    """Returns sentiment score: -1 (bearish) to +1 (bullish)"""
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        outputs = model(**inputs)
    probs = torch.softmax(outputs.logits, dim=1).squeeze()
    # [positive, negative, neutral]
    return (probs[0] - probs[1]).item()

# Daily sentiment aggregation
def aggregate_daily_sentiment(news_df: pd.DataFrame) -> pd.Series:
    """Aggregate multiple headlines per day into a single score"""
    scores = news_df['headline'].apply(get_sentiment_score)
    # Weight by recency within the day
    return scores.groupby(news_df['date']).mean()
```

**Key Research Findings:**
- FinBERT-LSTM achieves the best performance among LSTM, DNN, and FinBERT-LSTM variants
- Sentiment is particularly impactful **around earnings announcements and major product releases**
- SHAP analysis confirms FinBERT-derived sentiment features **rank among the most influential predictors** alongside technical price features

### 6.2 LLM-Enhanced Sentiment (Next Level)

For higher-quality sentiment, newer approaches use:
- **FinGPT** — Open-source LLM fine-tuned on 360,000+ finance texts; trained versions: FinGPT-internLM, FinGPT-llama, FinMA
- **GPT-4 with Domain Knowledge Chain-of-Thought (DK-CoT)** — Injects financial domain knowledge into reasoning chain
- **MambaLLM** — Combines Mamba SSM with LLM outputs for price prediction; significantly outperforms alternatives during volatile periods (late 2024, early 2025)

### 6.3 Options Flow as Sentiment Proxy

Options data provides a forward-looking market sentiment signal — one of the strongest alternative data sources available without paid data subscriptions (PCR is free via NSE/BSE).

```python
# Put/Call Ratio (PCR) — already partially implemented in codebase
pcr = put_volume / call_volume  # > 1 = bearish, < 0.7 = bullish

# Implied Volatility (IV) features
iv_rank = (current_iv - iv_52w_low) / (iv_52w_high - iv_52w_low)  # 0-100
iv_percentile = percentile_rank(current_iv, historical_iv)

# IV skew (put IV vs. call IV — measures tail risk perception / fear)
iv_skew = put_iv_25_delta - call_iv_25_delta  # positive = bearish skew

# Gamma Exposure (GEX) — predicts near-term price pinning
# GEX = sum(option_delta × option_gamma × open_interest × 100)
# High positive GEX → market maker hedging keeps price pinned
# Negative GEX → hedging amplifies moves (dangerous)
```

**Research finding:** The put/call IV spread (difference between put and call IV at same strike) **predicts cross-section of stock returns over 1–6 week horizons** — one of the most robust options-based signals from 1996–2017.

**Important caveat:** ~2/3 of the IV spread predictability disappears when excluding hard-to-borrow (high short-fee) stocks. Part of the signal reflects stock borrow costs, not pure information content. Always filter by float and borrow availability.

| Signal | Window | Direction | Notes |
|---|---|---|---|
| PCR | 1–5 days | Contrarian | High PCR → bullish reversal |
| IV Rank | current | Fear proxy | > 70 = elevated fear, mean-revert |
| IV Skew | 1–3 weeks | Directional | Negative skew = institutional hedging |
| GEX | intraday | Pinning | Positive = range-bound; negative = explosive |
| Unusual OI buildup | 1–2 weeks | Leading | Large OTM calls before earnings = bullish |

---

## 7. ML & DL Model Architectures

### 7.1 Architecture Taxonomy

```
Classical ML
├── Linear: Ridge, Lasso, ElasticNet
├── Tree-Based: XGBoost, LightGBM, CatBoost, Random Forest
└── SVM/SVR (useful as base learners in stacking)

Classical Time Series
├── ARIMA/SARIMA (baseline)
├── Prophet (Facebook — handles seasonality)
└── Exponential Smoothing (ETS)

Deep Learning — Sequential
├── LSTM / BiLSTM (long-term memory)  RMSE=43.25, DA=65–68%
├── GRU (faster LSTM; lowest MAE on single-stock tasks)
├── xLSTM (extended LSTM with matrix memory — outperforms all on NASDAQ)
├── TCN — Temporal Convolutional Network (parallelizable, dilated)
└── WaveNet (dilated causal convolutions)

Deep Learning — Attention-Based
├── Vanilla Transformer  RMSE=41.87, DA=69.1% ← best pure architecture
├── Informer (sparse attention for long sequences)
├── PatchTST (patch tokenization; 50% error reduction vs. DeepAR)
├── iTransformer (ICLR 2024 — inverts axes: variables as tokens)
├── CATS (NeurIPS 2024 — cross-attention only; no self-attention)
└── TFT — Temporal Fusion Transformer ⭐ BEST OVERALL PRACTICAL

State Space Models (2024–2025 Frontier)
├── Mamba (selective SSM — near-linear O(n) complexity)
├── MambaStock (single-direction Mamba; limited global deps)
├── SAMBA (ICASSP 2025 — bidirectional Mamba + graph convolution)
├── T-Mamba (Mamba macro trends + Window Transformer micro variations)
├── CMDMamba (dual temporal-sensitivity modules; -11.6% MSE on DAX)
└── MambaLLM (Mamba micro + DeepSeek R1 + FinBERT; best in volatile regimes)

Interpretable / Decomposition Models
├── N-BEATS (neural basis expansion; trend + seasonality)
├── N-HiTS (hierarchical interpolation; strong volatility forecasting)
└── TimesNet (2D temporal modeling; competitive RMSE)

Graph Neural Networks (relational modeling across stocks)
├── LSTM-GNN (Pearson/Granger edges; MSE 10.6% lower than LSTM alone)
├── TFT-GNN (TFT + graph attention; highest accuracy on US equities) ⭐
├── Dynamic Dual-Graph NN (price relationship graph + semantic graph)
├── DASF-Net (diffusion-graph + FinBERT sentiment fusion)
└── MSGCA (gated cross-attention multimodal; +8–31% MCC improvement)
```

> **Key insight on graph edge construction:** Granger causality (directional, causal) outperforms Pearson correlation for edges — eliminates spurious relationships that inflate apparent predictability.

### 7.2 Temporal Fusion Transformer (TFT) — Primary Recommendation

TFT is the current state-of-the-art for stock price prediction based on research consensus.

**Why TFT wins:**
- Handles **static metadata** (company sector, market cap class) + **time-varying known** (calendar features, earnings dates) + **time-varying observed** (price, volume, technical indicators, fundamentals)
- **Variable Selection Networks** automatically weight feature importance per time step
- **Multi-head attention** captures long-range dependencies
- **Quantile outputs** provide prediction intervals (uncertainty quantification)
- **Interpretability** — attention weights reveal which past time steps drove the prediction

**Architecture Details:**
```
Static Metadata (ticker, sector) → Static Covariate Encoder
                                          ↓
Time-Varying Known Inputs          → LSTM Encoder → Variable Selection
(earnings date, calendar features)        ↓
                                   Multi-Head Attention
Time-Varying Observed Inputs      → LSTM Decoder → Variable Selection
(OHLCV, indicators, fundamentals)         ↓
                                   Gate → Output (quantiles: 10th, 50th, 90th)
```

**Hyperparameters from research:**
```python
# Best-performing TFT config (from IIETA 2025 paper)
TFT_CONFIG = {
    "hidden_size": 128,
    "lstm_layers": 2,
    "num_attention_heads": 8,
    "dropout": 0.2,
    "learning_rate": 1e-3,
    "max_epochs": 80,
    "batch_size": 64,
    "lookback_window": 60,  # 60 trading days ≈ 3 months
    "prediction_horizon": [1, 5, 21],  # 1d, 1w, 1m
    "quantiles": [0.1, 0.25, 0.5, 0.75, 0.9],
}
```

**Result:** Starting with $1 in Jan 2024, the TFT CNN-LSTM strategy grew to ~$9.07 by Sept 2025 (+807% total return vs. +38% buy-and-hold). Stayed in cash ~79% of the time when prediction uncertainty was high.

### 7.2b iTransformer — Best for High-Dimensional Multi-Stock Setups

The iTransformer (ICLR 2024) **inverts the Transformer axes**: instead of a token per time step, each variable (stock/feature) is a token. Self-attention then models cross-variable correlations rather than temporal dependencies — the FFN handles temporal patterns per variable.

Best used when forecasting **many correlated stocks simultaneously** (e.g., the 50 Nifty 50 stocks as a single model) — captures sector-level co-movement.

### 7.2c CATS (NeurIPS 2024) — Cross-Attention Only

Controversial 2024 NeurIPS finding: **eliminate self-attention entirely**. Use future horizon-dependent parameters as queries, past data as keys/values. Result: simpler, better performance on long-horizon tasks.

Implication: self-attention in standard Transformers may be learning noise from the many-to-many temporal relationships; a focused cross-attention from "what I want to predict" to "what's relevant in the past" is more precise.

### 7.3 Mamba — Emerging Frontier Model

Mamba is a **Selective State Space Model (SSM)** with near-linear O(n) complexity vs. Transformer's O(n²).

**Why Mamba matters for stock prediction:**
- Handles very long sequences efficiently (useful for intraday data)
- **MambaLLM** significantly outperforms in high-volatility regimes (late 2024)
- **T-Mamba** (Mamba + local window Transformer) achieves SOTA on multiple benchmarks

**FinMamba architecture (2025):**
- **Market-aware graph**: captures inter-stock relationships (sector correlations)
- **Multi-level Mamba**: processes micro (individual stock) and macro (market-wide) patterns separately
- Integrates LLM sentiment as an additional input channel

### 7.4 N-BEATS and N-HiTS — Strong Baselines

| Model | Strengths | Best For |
|---|---|---|
| **N-BEATS** | Pure neural, interpretable (trend/seasonality decomposition), no external features needed | Clean univariate price series |
| **N-HiTS** | Multi-scale sampling, strong MAE/MAPE on realized volatility | Volatility forecasting |
| **NBEATSx** | N-BEATS with exogenous covariates | Multi-variate with features |

### 7.5 XGBoost / LightGBM — For Tabular Feature-Heavy Setups

Tree-based models excel when fundamental + technical features dominate over sequential patterns:

```python
import lightgbm as lgb

# Feature set: 50+ engineered features (technical + fundamental + sentiment)
lgb_params = {
    "objective": "regression",
    "metric": "rmse",
    "num_leaves": 127,
    "learning_rate": 0.05,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "min_child_samples": 20,
    "n_estimators": 1000,
    "early_stopping_rounds": 50,
}

model = lgb.LGBMRegressor(**lgb_params)
model.fit(
    X_train, y_train,
    eval_set=[(X_val, y_val)],
    callbacks=[lgb.early_stopping(50), lgb.log_evaluation(100)]
)
```

---

## 8. Hybrid & Ensemble Methods

### 8.1 Stacking Architecture (Recommended)

```
Layer 0 — Base Learners (trained independently)
├── LightGBM (tabular features: technical + fundamental)
├── LSTM (sequential price patterns)
├── TFT (multi-modal temporal fusion)
├── ARIMA (statistical baseline)
└── N-HiTS (decomposition model)

Layer 1 — Meta-Learner
└── XGBoost or Ridge Regression (combines base learner outputs)
         ↓
Final Prediction (price direction + magnitude + uncertainty interval)
```

**Performance:** Stacking consistently outperforms any single base learner. A 2025 global market study showed stacking achieving MAE of 0.0332 — the lowest across all tested approaches.

### 8.2 Regime-Conditional Ensemble

Rather than a single universal model, use **regime-specific specialist models**:

```python
# Step 1: Detect current regime (HMM output)
regime = hmm_model.predict(recent_returns)  # 0=low-vol, 1=high-vol, 2=trending

# Step 2: Route to regime-specific model
if regime == 0:  # Low volatility / trending
    prediction = lgb_model_lowvol.predict(features)
elif regime == 1:  # High volatility / choppy
    prediction = tft_model_highvol.predict(features)
else:  # Trending bull/bear
    prediction = lstm_trending.predict(features)

# Step 3: Weighted ensemble across regimes (soft routing)
regime_probs = hmm_model.predict_proba(recent_returns)
prediction = (
    regime_probs[0] * lgb_model_lowvol.predict(features) +
    regime_probs[1] * tft_model_highvol.predict(features) +
    regime_probs[2] * lstm_trending.predict(features)
)
```

### 8.2b DASF-Net — Diffusion Graph + Sentiment Fusion

A 2025 model combining three modalities via multi-head attention:
1. **Industry relationship graph** (inter-stock supply chain / sector relationships)
2. **Fundamental indicator graph** (P/E, margins, etc. as node features)
3. **FinBERT sentiment** from daily news (3-day aggregation window = optimal)

Finding: **3 days** is the empirically optimal sentiment aggregation window for next-day prediction — not 1 day (too noisy) and not 7 days (too stale).

### 8.3 TFT + GNN Hybrid (Highest Accuracy)

The TFT-GNN model achieves the highest predictive accuracy by incorporating **relational information between stocks**:

```
Stock A prices/features  ─┐
Stock B prices/features  ─┼→ Graph Attention Network → Relational embeddings
Stock C prices/features  ─┘         ↓
                               TFT input layer
                                     ↓
                            TFT with relational context
                                     ↓
                              Price prediction
```

The graph edges encode: same-sector relationships, historical return correlations, supply chain dependencies.

### 8.4 Transfer Learning Approach

A 2026 paper shows that **Dynamic Time Warping + Transfer Learning** achieves the highest R² and lowest MAE among hybrid/ensemble methods by sharing learned patterns across similar stocks:

```python
# Use DTW similarity to identify "donor" stocks for transfer learning
# E.g., train on HDFC Bank → transfer to Kotak Bank (similar business model)
from dtaidistance import dtw

# Find most similar historical series
similarity = dtw.distance(stock_a_returns, stock_b_returns)
# Use pre-trained weights from similar stock as initialization
```

---

## 9. Market Regime Detection

### 9.1 Why Regime Detection Is Critical

Markets alternate between **4 primary regimes**:
1. **Bull trending** (low volatility, upward drift)
2. **Bear trending** (low volatility, downward drift)
3. **High volatility / choppy** (mean-reverting, wide swings)
4. **Crisis / shock** (volatility spike, correlation breakdown)

Different models perform best in different regimes. Without regime detection, a model trained in bull market will catastrophically fail in a bear market.

### 9.2 Hidden Markov Model (HMM) for Regime Detection

```python
from hmmlearn import hmm
import numpy as np

class MarketRegimeDetector:
    def __init__(self, n_regimes=3):
        self.n_regimes = n_regimes
        self.model = hmm.GaussianHMM(
            n_components=n_regimes,
            covariance_type="full",
            n_iter=1000,
            random_state=42
        )

    def fit(self, returns: np.ndarray):
        """Fit HMM on daily returns"""
        # Features: returns, volatility (rolling std), volume ratio
        features = np.column_stack([
            returns,
            pd.Series(returns).rolling(5).std().fillna(0).values,
            pd.Series(returns).rolling(20).std().fillna(0).values,
        ])
        self.model.fit(features.reshape(-1, 3))
        return self

    def predict_regime(self, recent_returns: np.ndarray) -> int:
        """Predict current regime"""
        features = np.column_stack([...])
        return self.model.predict(features)[-1]

    def predict_regime_proba(self, recent_returns: np.ndarray) -> np.ndarray:
        """Soft regime probabilities for weighted ensemble"""
        features = np.column_stack([...])
        return self.model.predict_proba(features)[-1]
```

**Key Result:** HMM-based regime-switching portfolio returned ~210% from 2005–2017 vs. ~70% for ACWI benchmark. Used as a **risk filter** (blocking trades in high-volatility regimes), it significantly improves Sharpe ratio.

### 9.3 Additional Regime Indicators

Beyond HMM, these features serve as regime proxies:

```python
# VIX-based regime flags
high_vol_regime = vix > 25  # VIX > 25 = stressed market

# Trend regime (moving average crossover)
trend_up = sma_50 > sma_200  # Golden cross
trend_down = sma_50 < sma_200  # Death cross

# Breadth-based regime (market internals)
advance_decline_ratio = advancing_stocks / declining_stocks
new_highs_lows_ratio = new_52w_highs / (new_52w_highs + new_52w_lows)

# Macro regime (yield curve)
yield_curve_spread = ten_year_yield - two_year_yield
inverted = yield_curve_spread < 0  # Recession signal
```

---

## 10. Validation, Bias Prevention & Anti-Leakage

This is the **most critical section**. Most published research suffers from some form of data leakage, making results overly optimistic.

### 10.1 The Seven Look-Ahead Bias Sources

1. **Look-ahead bias in features** — Using future data to compute present features (e.g., rolling mean that includes future timestamps)
2. **Train/test contamination** — Fitting scalers/normalizers on entire dataset before split
3. **Random k-fold on time series** — Future observations appear in training set (RMSE artificially reduced >20% per 2025 arXiv study)
4. **Survivorship bias** — Training only on currently listed stocks excludes delisted companies; inflates performance significantly
5. **Fundamental data timing** — Using Q3 earnings (announced Oct 15) for a prediction made on Oct 1 — must use SEC filing availability date, not period end date
6. **Target engineering leak** — Computing "did price rise 5 days?" globally before splitting; must compute per-fold
7. **Timestamp trap** — Using bar open/close prices before the bar has actually closed; bar timestamps must reflect *when data was available*, not when the period started

### 10.2 Walk-Forward Validation (Gold Standard)

```python
class WalkForwardValidator:
    """
    Expanding window walk-forward validation.
    At each step, train on all past data and validate on next window.
    """
    def __init__(self, initial_train_size: int, step_size: int, val_size: int):
        self.initial_train_size = initial_train_size
        self.step_size = step_size
        self.val_size = val_size

    def split(self, X: pd.DataFrame):
        n = len(X)
        train_end = self.initial_train_size

        while train_end + self.val_size <= n:
            train_idx = list(range(0, train_end))
            val_idx = list(range(train_end, min(train_end + self.val_size, n)))
            yield train_idx, val_idx
            train_end += self.step_size

# Usage:
# Step 1: Train Jan 2020 – Dec 2021, validate Jan 2022
# Step 2: Train Jan 2020 – Jun 2022, validate Jul 2022
# Step 3: ... etc.
```

### 10.3 Purged Cross-Validation (Advanced)

Developed by Marcos López de Prado (author of "Advances in Financial Machine Learning"):

```python
# Two mechanisms:
# 1. PURGING: Remove training samples whose label horizon overlaps with test period
# 2. EMBARGOING: Remove N days after test end from training (prevents autocorrelation leakage)

from mlfinlab.cross_validation import PurgedKFold

cv = PurgedKFold(
    n_splits=5,
    pct_embargo=0.01  # 1% embargo = ~2-3 days for daily data
)
```

### 10.4 Proper Preprocessing Pipeline

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# CORRECT: Fit preprocessor ONLY on training data
for train_idx, val_idx in walk_forward.split(X):
    X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
    y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]

    # Scaler fitted ONLY on train, applied to val
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)  # transform only, no fit!

    model.fit(X_train_scaled, y_train)
    preds = model.predict(X_val_scaled)
```

### 10.5 Fundamental Data Point-in-Time

The most subtle and common leakage in fundamental data:

```python
# WRONG: Using Q3 earnings (reported Oct 15) for a prediction on Oct 1
fundamentals_wrong = fundamentals.merge(prices, on='date', how='right')

# CORRECT: Add 45-day filing lag — SEC 10-Q filed ~45 days after quarter end
fundamentals['available_date'] = fundamentals['report_date'] + pd.Timedelta(days=45)

# Use as-of merge
fundamentals_correct = pd.merge_asof(
    prices.sort_values('date'),
    fundamentals.sort_values('available_date'),
    left_on='date',
    right_on='available_date'
)
```

---

## 11. Production Frameworks & Libraries

### 11.1 Library Comparison

| Library | Models Available | Best For | Maturity |
|---|---|---|---|
| **Darts** (unit8co) | ARIMA, Prophet, LSTM, TFT, N-BEATS, N-HiTS, TCN, Transformer | End-to-end pipeline, backtesting | ⭐⭐⭐⭐⭐ |
| **NeuralForecast** (Nixtla) | LSTM, NHITS, PatchTST, iTransformer, NBEATS | Pure DL, fast training | ⭐⭐⭐⭐ |
| **PyTorch-Forecasting** | TFT, N-BEATS, DeepAR, MQCNN | TFT reference implementation | ⭐⭐⭐⭐ |
| **GluonTS** (Amazon) | DeepAR, WaveNet, Transformer | Probabilistic forecasting | ⭐⭐⭐ |
| **sktime** | Statistical + ML hybrid | Sklearn-compatible pipelines | ⭐⭐⭐ |

### 11.2 Darts — Recommended Primary Library

Darts provides a unified scikit-learn-style API for 30+ models:

```python
from darts import TimeSeries
from darts.models import TFTModel, NHiTSModel, LightGBMModel
from darts.dataprocessing.transformers import Scaler
from darts.metrics import mae, mape, smape

# 1. Create TimeSeries objects
series = TimeSeries.from_dataframe(df, 'date', 'close')
past_covariates = TimeSeries.from_dataframe(df, 'date',
    ['rsi', 'macd', 'bb_width', 'volume_ratio', 'realized_vol'])
future_covariates = TimeSeries.from_dataframe(df, 'date',
    ['day_of_week', 'month', 'is_earnings_week'])
static_covariates = pd.DataFrame({'sector': ['BANK'], 'market_cap_class': ['LARGE']})

# 2. Scale (fit on train only)
scaler = Scaler()
series_train, series_val = series.split_after(0.8)
series_train_scaled = scaler.fit_transform(series_train)
series_val_scaled = scaler.transform(series_val)

# 3. Train TFT
tft = TFTModel(
    input_chunk_length=60,
    output_chunk_length=21,  # predict 21 days ahead
    hidden_size=128,
    lstm_layers=2,
    num_attention_heads=8,
    dropout=0.2,
    n_epochs=80,
    add_relative_index=True,
    quantiles=[0.1, 0.25, 0.5, 0.75, 0.9],
)
tft.fit(
    series_train_scaled,
    past_covariates=past_covariates,
    future_covariates=future_covariates,
    val_series=series_val_scaled,
)

# 4. Predict with uncertainty
forecast = tft.predict(
    n=21,
    series=series_train_scaled,
    past_covariates=past_covariates,
    future_covariates=future_covariates,
    num_samples=200,  # Monte Carlo samples for probabilistic output
)

# 5. Evaluate
print(f"MAE: {mae(series_val_scaled, forecast):.4f}")
print(f"MAPE: {mape(series_val_scaled, forecast):.2f}%")
```

### 11.3 Backtesting with Darts

```python
from darts.backtesting import backtest

# Expanding window backtest
historical_forecasts = tft.historical_forecasts(
    series=series_scaled,
    past_covariates=past_covariates,
    start=0.6,  # start from 60% of data
    forecast_horizon=5,
    stride=1,
    retrain=False,  # use pre-trained model (for speed)
)
```

### 11.3b Hyperparameter Reference Table (Research Baselines)

| Hyperparameter | LSTM | Transformer | TFT | LightGBM |
|---|---|---|---|---|
| Lookback window | 20–60 days | 60–180 days | 180 days | N/A (feature lags) |
| Hidden units / d_model | 64–256 | 128–512 | 128 | num_leaves=127 |
| Layers | 2–3 | 3–6 encoder | 2 LSTM + attn | N/A |
| Attention heads | N/A | 8 | 8 | N/A |
| Learning rate | 0.001 | 0.0001 | 0.001 | 0.05 |
| Batch size | 32–64 | 32–64 | 64 | N/A |
| Dropout | 0.2–0.3 | 0.1–0.2 | 0.2 | N/A |
| Gradient clipping | 1.0 | 1.0 | 1.0 | N/A |
| Optimizer | Adam | AdamW | Adam | N/A |
| Normalization | RevIN or SAN | RevIN or SAN | built-in VSN | StandardScaler |

**Important:** For Transformers and LSTMs on stock data, use **RevIN** (Reversible Instance Normalization) or **SAN** (Short-window Adaptive Normalization) instead of standard global normalization. These normalize per-instance (per sequence window) and reverse the normalization at output — addressing non-stationarity without leaking global statistics.

```python
# RevIN: normalize each input window independently, denormalize predictions
class RevIN(nn.Module):
    def normalize(self, x):  # x: [batch, seq_len, features]
        self.mean = x.mean(dim=1, keepdim=True)
        self.std = x.std(dim=1, keepdim=True) + 1e-8
        return (x - self.mean) / self.std

    def denormalize(self, x):
        return x * self.std + self.mean
```

### 11.4 NeuralForecast — Alternative for Pure DL

```python
from neuralforecast import NeuralForecast
from neuralforecast.models import TFT, NHITS, PatchTST

nf = NeuralForecast(
    models=[
        TFT(h=21, input_size=60, hidden_size=128, n_head=8, dropout=0.2, max_steps=500),
        NHITS(h=21, input_size=60, max_steps=500),
        PatchTST(h=21, input_size=60, patch_len=16, max_steps=500),
    ],
    freq='D'
)

nf.fit(df)  # df must have 'unique_id', 'ds', 'y' columns
forecasts = nf.predict()
```

---

## 12. Evaluation Metrics

### 12.1 Regression Metrics (Price Level Prediction)

| Metric | Formula | Notes |
|---|---|---|
| **MAE** | mean(\|y - ŷ\|) | Scale-dependent, intuitive |
| **MAPE** | mean(\|y - ŷ\| / y) × 100 | % error, easy to interpret |
| **SMAPE** | mean(2\|y - ŷ\| / (\|y\| + \|ŷ\|)) × 100 | Symmetric, handles near-zero prices |
| **RMSE** | sqrt(mean((y - ŷ)²)) | Penalizes large errors more |
| **R²** | 1 - SS_res / SS_tot | Variance explained (0–1) |

**Research benchmarks:**
- TFT achieves SMAPE of 0.0022 on Indonesian stocks (near-perfect for daily data)
- TFT achieves MAPE < 2% for all tested stocks vs. LSTM/BiLSTM
- Target for Indian large-cap stocks: MAPE < 3% for 5-day horizon

### 12.2 Direction Accuracy (Classification Metrics)

For trading, **directional accuracy** matters more than absolute price accuracy:

```python
def directional_accuracy(y_true, y_pred):
    """% of predictions with correct sign (up/down)"""
    actual_direction = np.sign(y_true - y_true.shift(1))
    pred_direction = np.sign(y_pred - y_true.shift(1))
    return (actual_direction == pred_direction).mean()

def hit_rate(signals, returns):
    """% of signals that were profitable"""
    return (np.sign(signals) == np.sign(returns)).mean()
```

### 12.3 Financial Performance Metrics

```python
def sharpe_ratio(returns, risk_free_rate=0.065, periods=252):
    """Annualized Sharpe ratio (India: ~6.5% risk-free rate)"""
    excess = returns - risk_free_rate / periods
    return (excess.mean() / excess.std()) * np.sqrt(periods)

def max_drawdown(equity_curve):
    """Maximum peak-to-trough decline"""
    rolling_max = equity_curve.cummax()
    drawdowns = equity_curve / rolling_max - 1
    return drawdowns.min()

def calmar_ratio(returns, equity_curve):
    """Annualized return / |max drawdown|"""
    annualized_return = (1 + returns.mean()) ** 252 - 1
    mdd = abs(max_drawdown(equity_curve))
    return annualized_return / mdd

def information_coefficient(y_pred_returns, y_true_returns):
    """
    Spearman rank correlation between predictions and realizations.
    The industry-standard metric for factor/signal evaluation.
    IC > 0.05 is considered a good signal; IC > 0.1 is excellent.
    """
    from scipy.stats import spearmanr
    ic, _ = spearmanr(y_pred_returns, y_true_returns)
    return ic

def icir(ic_series):
    """
    IC Information Ratio = IC.mean() / IC.std()
    Measures signal consistency over time. ICIR > 0.5 is good.
    """
    return ic_series.mean() / ic_series.std()
```

### 12.3b Advanced Financial Metrics (Industry Standard)

| Metric | Formula / Source | Threshold |
|---|---|---|
| **Sharpe Ratio** | (mean_excess_return / std) × √252 | > 1.0 good, > 2.0 excellent |
| **Maximum Drawdown** | peak-to-trough decline | < -20% concerning |
| **Calmar Ratio** | annualized return / \|max drawdown\| | > 1.0 good |
| **Sortino Ratio** | mean_excess / downside_std × √252 | Better than Sharpe for non-Gaussian |
| **Information Coefficient (IC)** | Spearman(pred, actual) | > 0.05 useful signal |
| **ICIR** | IC.mean() / IC.std() | > 0.5 consistent signal |
| **Directional Accuracy** | correct sign predictions / total | > 55% useful |
| **Probability of Backtest Overfitting (PBO)** | CPCV-derived (López de Prado) | < 0.5 means not overfit |
| **Deflated Sharpe Ratio (DSR)** | Adjusts Sharpe for multiple testing | Use to report honest results |

> **Warning:** A high Sharpe from a single backtest path is meaningless without PBO/DSR. The CPCV method generates a *distribution* of Sharpe ratios across combinatorial splits, giving a statistically honest assessment of strategy quality.

### 12.4 Calibration of Probabilistic Forecasts

```python
def prediction_interval_coverage(y_true, lower_bound, upper_bound):
    """% of actuals within the predicted interval"""
    return ((y_true >= lower_bound) & (y_true <= upper_bound)).mean()

# Target: 90th percentile interval should cover ~90% of actuals
# If coverage >> 90%, intervals are too wide (overconfident in uncertainty)
# If coverage << 90%, intervals are too narrow (underconfident)
```

---

## 13. Risk-Adjusted Training & Objectives

### 13.1 The Core Insight

Most ML models optimize MSE/MAE — treating all errors equally. For trading, an error during a high-volatility spike costs far more than during a quiet period. 2024–2025 research trend: **embed risk-adjusted objectives directly into training**.

### 13.2 Sharpe Ratio as Training Loss

```python
def sharpe_loss(y_pred_returns: torch.Tensor, risk_free_rate: float = 0.065/252) -> torch.Tensor:
    """
    Directly optimize Sharpe ratio during training.
    y_pred_returns: predicted return series (not prices)
    """
    excess_returns = y_pred_returns - risk_free_rate
    sharpe = excess_returns.mean() / (excess_returns.std() + 1e-8)
    return -sharpe  # minimize negative Sharpe = maximize Sharpe

# TFT-ASRO (Adaptive Sharpe Ratio Optimization):
# Multi-task learning: predict both returns AND volatility simultaneously
# Loss = alpha * return_prediction_loss + beta * (-sharpe_loss)
```

**Key results (TFT-ASRO, 2024):** Outperforms conventional forecasting on both predictive accuracy AND portfolio returns across stock indices, crypto, and commodities simultaneously.

### 13.3 End-to-End Portfolio Optimization

Rather than predict → sort → construct (two steps), include **portfolio weights and transaction costs** directly in the training loss:

```python
# Loss = -E[after_cost_portfolio_return] + lambda * portfolio_risk
# This is a "one-step weight optimization" approach
# Outperforms predict-then-sort benchmark
# Less susceptible to transaction cost erosion
```

### 13.4 Deep Reinforcement Learning (DRL) for Risk-Adjusted Trading

Three DRL agents trained on different reward functions, then combined into unified policy:
- Agent A: Maximize log returns
- Agent B: Maximize differential Sharpe ratio
- Agent C: Minimize maximum drawdown

Result: The ensemble policy achieves better risk-adjusted performance than any single reward function, tested across global markets 2021–2024.

### 13.5 Activity-Based Bars (Advanced Data Construction)

Standard time bars (daily OHLCV) are suboptimal because different days have vastly different information content. Activity-based bars address this:

| Bar Type | Construction | Benefit |
|---|---|---|
| **Tick bars** | New bar every N transactions | Equal information per bar |
| **Volume bars** | New bar every N shares traded | Removes volume-driven noise |
| **Dollar bars** | New bar every $N traded | Best for correlated multi-asset models |

Dollar bars are preferred for ML training: each bar contains equal dollar value, making features (returns, volatility) more stationary and reducing serial correlation in features. Eliminates "timestamp trap" — bar timestamps reflect information completion, not arbitrary time boundaries.

---

## 14. Recommended Architecture for This Project

### 13.1 Phased Implementation

#### Phase 1: Foundation (Baseline)
```
Data Pipeline:
yfinance OHLCV → Technical Features (RSI, MACD, BB, ATR, EMA, Volume)
             → Normalization (per-symbol z-score, fit on train)
             → 60-day lookback window

Model: LightGBM (fast iteration, feature importance, no leakage issues)
Validation: Walk-forward (train on 3 years, validate on next 3 months, roll)
Target: Next-day return direction (classification) + magnitude (regression)

Metrics: Directional accuracy, MAE, Sharpe on paper trades
```

#### Phase 2: Deep Learning Integration
```
Upgrade Model: TFT (darts library) with past covariates (technical features)
Add: Fundamental features via yfinance quarterly data (P/E, margins, growth)
Add: Regime detection (HMM on 2-state: low/high volatility)
Output: Multi-horizon forecasts (1d, 5d, 21d) with quantile intervals
```

#### Phase 3: Multi-Modal Fusion
```
Add: FinBERT sentiment from news headlines
Add: Options PCR as market sentiment proxy
Architecture: Stacking ensemble
  - Layer 0: LightGBM (tabular features) + TFT (sequential) + ARIMA (baseline)
  - Layer 1: XGBoost meta-learner
Regime-routing: Use HMM regime probabilities to weight ensemble components
```

#### Phase 4: Advanced (Production)
```
Upgrade DL: T-Mamba or TFT-GNN (relational learning across correlated stocks)
Add: FinGPT for richer sentiment signals
Add: SHAP explanations for each prediction
Output: Full prediction card (price range, confidence, key drivers, regime context)
```

### 13.2 System Architecture Diagram

```
[Data Ingestion Layer]
yfinance → OHLCV (daily)
yfinance → Fundamentals (quarterly, with 45-day lag)
NewsAPI/AlphaVantage → News Headlines
Options Data → PCR, IV metrics

        ↓
[Feature Engineering Layer]
Technical: RSI, MACD, BB, ATR, EMA crossovers, Volume ratio, VWAP
Fundamental: P/E, P/B, EPS growth, Debt/Equity, Revenue growth
Sentiment: FinBERT(headlines) → daily sentiment score + rolling momentum
Regime: HMM → [bull, bear, volatile, trending] + probabilities
Calendar: day_of_week, month, days_to_earnings, days_to_expiry

        ↓
[Feature Store] (60-day rolling window, no look-ahead)

        ↓
[Prediction Layer — Stacking Ensemble]
├── LightGBM (tabular: all features, 1-day ahead)
├── TFT (sequential: OHLCV + technical, 1/5/21-day ahead, quantiles)
├── N-HiTS (volatility forecasting: realized vol, 5/10-day ahead)
└── Meta-learner: XGBoost (combines above, regime-weighted)

        ↓
[Post-Processing]
- Denormalize predictions
- Generate price range (low/mid/high) from quantile outputs
- Compute confidence score from prediction interval width
- Add regime context label

        ↓
[Output]
{
  "ticker": "RELIANCE.NS",
  "horizon": "5_days",
  "price_now": 2850.00,
  "price_target_low": 2780.00,   # 10th percentile
  "price_target_mid": 2910.00,   # 50th percentile
  "price_target_high": 2975.00,  # 90th percentile
  "direction_confidence": 0.73,  # % probability of upward move
  "key_drivers": ["RSI oversold", "P/E below sector avg", "Positive earnings surprise"],
  "regime": "low_volatility_bull",
  "model_confidence": "HIGH"
}
```

---

## 15. Implementation Roadmap

### Step 1: Data Infrastructure
- [ ] Create `PriceDataProvider` wrapping yfinance (already exists)
- [ ] Create `FundamentalDataProvider` using yfinance `.info` + `.financials` with 45-day lag
- [ ] Create `SentimentDataProvider` using FinBERT on news headlines
- [ ] Create `FeatureStore` — computes and caches 60-day feature windows per ticker
- [ ] Create `WalkForwardSplitter` — prevents all look-ahead bias

### Step 2: Feature Engineering Module
- [ ] `backend/app/services/ml/features/technical.py` — 20 technical features
- [ ] `backend/app/services/ml/features/fundamental.py` — 15 fundamental features
- [ ] `backend/app/services/ml/features/sentiment.py` — FinBERT pipeline
- [ ] `backend/app/services/ml/features/regime.py` — HMM regime detector
- [ ] `backend/app/services/ml/features/pipeline.py` — unified feature pipeline

### Step 3: Model Training
- [ ] `backend/app/services/ml/models/lgbm_model.py` — LightGBM baseline
- [ ] `backend/app/services/ml/models/tft_model.py` — TFT via darts
- [ ] `backend/app/services/ml/models/ensemble.py` — stacking meta-learner
- [ ] `backend/app/services/ml/training/walk_forward.py` — training loop

### Step 4: Prediction API
- [ ] `backend/app/api/v1/endpoints/prediction.py` — REST endpoint
- [ ] `GET /api/v1/predict/{ticker}?horizon=5d` → prediction card
- [ ] Cache predictions (24h TTL for daily models)

### Step 5: Frontend Integration
- [ ] Prediction card component on StockDetail page
- [ ] Price range visualization (fan chart or cone)
- [ ] Key drivers list (SHAP-based)
- [ ] Regime indicator badge

---

## 16. Key Pitfalls to Avoid

| Pitfall | Description | Prevention |
|---|---|---|
| **Look-ahead bias in normalization** | Fitting scaler on full dataset | Always fit scaler ONLY on training window |
| **Overlapping windows in CV** | K-fold creates future-in-past contamination | Use walk-forward or purged CV only |
| **Fundamental data lag** | Using Q3 earnings before they're filed | Add 45-day filing lag for all fundamental features |
| **Survivorship bias** | Only using currently traded stocks | Include delisted stocks in training data |
| **Overfitting to specific market period** | Model trained only in bull market fails in bear | Always include multiple market cycles in training |
| **Feature count inflation** | Too many correlated features → noise > signal | Use LASSO or correlation-based feature selection |
| **Fixed hyperparameters** | Best HP for 2020 may not work for 2024 | Retrain periodically with walk-forward |
| **Ignoring transaction costs** | High-frequency signals look profitable but are not | Include realistic slippage + brokerage in backtest |
| **Non-stationarity** | Raw prices are non-stationary | Model returns (% change), not raw prices |
| **Calendar effects** | Model trained on regular days fails on earnings days | Add earnings proximity features, or exclude earnings days |
| **Indian market specifics** | US model assumptions don't apply (different liquidity, circuit breakers) | Train separately on Indian market data; use NSE-specific features |

---

## 17. References

### Key Papers — Temporal Models

1. [Temporal Fusion Transformer (Bryan Lim et al., 2021)](https://arxiv.org/abs/1912.09363) — Original TFT paper; VSN + shared-Values attention
2. [A Novel Hybrid TFT-GNN for Stock Market Prediction (MDPI, 2024)](https://www.mdpi.com/2673-9909/5/4/176) — Highest accuracy on US equity benchmark
3. [Hybrid CNN-LSTM + TFT for Stock Forecasting (IIETA, 2025)](https://www.iieta.org/journals/isi/paper/10.18280/isi.301122) — +807% strategy return vs +38% buy-and-hold
4. [TFT for Vietnamese Equities (Springer, 2025)](https://link.springer.com/content/pdf/10.1007/978-981-95-3358-9_8.pdf) — 40–50% MAE reduction vs LSTM/BiLSTM
5. [iTransformer (ICLR, 2024)](https://proceedings.iclr.cc/paper_files/paper/2024/file/2ea18fdc667e0ef2ad82b2b4d65147ad-Paper-Conference.pdf) — Inverted Transformer; best for high-dimensional multivariate
6. [CATS: Are Self-Attentions Effective? (NeurIPS, 2024)](https://proceedings.neurips.cc/paper_files/paper/2024/file/cf66f995883298c4db2f0dcba28fb211-Paper-Conference.pdf) — Cross-attention only outperforms standard Transformer
7. [PatchTST (arXiv, 2022)](https://arxiv.org/pdf/2211.14730) — Patch tokenization; 50% error reduction vs DeepAR

### Key Papers — State Space / Mamba

8. [T-Mamba: Mamba-Transformer for Stock Prediction (ACM, 2025)](https://dl.acm.org/doi/10.1145/3746709.3746715)
9. [FinMamba: Market-Aware Graph-Enhanced Multi-Level Mamba (arXiv, 2025)](https://arxiv.org/html/2502.06707v1)
10. [MambaLLM: Macro + Micro Stock Prediction (MDPI, 2025)](https://www.mdpi.com/2227-7390/13/10/1599) — Best in volatile 2024–2025 regimes
11. [CMDMamba — Dual Temporal Sensitivity Mamba (Frontiers AI, 2025)](https://www.frontiersin.org/journals/artificial-intelligence) — -11.6% MSE on DAX
12. [Graph-Mamba for Stock Prediction (arXiv, 2024)](https://arxiv.org/abs/2410.03707)

### Key Papers — NLP / Sentiment

13. [Predicting Stock Prices with FinBERT-LSTM (arXiv, 2024)](https://arxiv.org/abs/2407.16150)
14. [FinGPT: Sentiment-Based Stock Movement Prediction (arXiv, 2024)](https://arxiv.org/html/2412.10823v2) — 526% cumulative return, Sharpe 0.407
15. [Innovative Sentiment Analysis: FinBERT, GPT-4, Logistic Regression (MDPI, 2024)](https://www.mdpi.com/2504-2289/8/11/143)
16. [DASF-Net: Diffusion-Graph + FinBERT Sentiment Fusion (MDPI, 2025)](https://www.mdpi.com/1911-8074/18/8/417) — 3-day optimal sentiment window
17. [MSGCA: Gated Cross-Attention Multimodal Fusion (Springer, 2025)](https://link.springer.com/article/10.1007/s40747-025-02023-3) — +8–31% MCC improvement

### Key Papers — Ensemble & Feature Engineering

18. [Advancing Stock Price Prediction through Hybrid Ensembles (Springer, 2025)](https://link.springer.com/article/10.1186/s40537-025-01185-8)
19. [Flexible Target Prediction with Ensemble + Transfer Learning (MDPI, 2026)](https://www.mdpi.com/1099-4300/28/1/84)
20. [Stock Price Prediction Using Stacked Heterogeneous Ensemble (MDPI, 2025)](https://www.mdpi.com/2227-7072/13/4/201)
21. [Survey of Feature Selection for Stock Prediction (PMC, 2023)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9834034/)
22. [Assessing Technical Indicators on ML Models (arXiv, 2024)](https://arxiv.org/html/2412.15448v1)
23. [R-CSAN Channel-Spatial Attention (Nature Sci. Reports, 2025)](https://www.nature.com/articles/s41598) — 17–49% RMSE reduction vs ARIMA
24. [Systematic Review on GNN-based Stock Forecasting (ACM, 2024)](https://dl.acm.org/doi/10.1145/3696411)
25. [Hybrid LSTM-GNN for Stock Prediction (arXiv, 2025)](https://arxiv.org/html/2502.15813v1) — MSE 10.6% lower than LSTM alone

### Key Papers — Validation & Risk

26. [Hidden Leaks in Time Series: Data Leakage in LSTM (arXiv, 2025)](https://arxiv.org/html/2512.06932v1) — 10-fold CV introduces >20% artificial RMSE gain
27. [Purged Cross-Validation (Wikipedia)](https://en.wikipedia.org/wiki/Purged_cross-validation) — with embargo
28. [Advances in Financial Machine Learning — Marcos López de Prado (Book, 2018)](https://www.wiley.com/en-us/Advances+in+Financial+Machine+Learning-p-9781119482086) — **Definitive practitioner reference**
29. [Regime-Switching Factor Investing with HMMs (MDPI, 2020)](https://www.mdpi.com/1911-8074/13/12/311)
30. [Multi-Sensor TFT with Adaptive Sharpe Ratio (MDPI, 2024)](https://www.mdpi.com/1424-8220/25/3/976) — TFT-ASRO risk-adjusted training
31. [Why Options IV Predicts Stock Returns (ScienceDirect, 2025)](https://www.sciencedirect.com/science/article/pii/S0304405X25001618)

### Libraries & Tools

| Library | URL | Purpose |
|---|---|---|
| Darts | https://unit8co.github.io/darts/ | Primary forecasting framework |
| NeuralForecast | https://nixtlaverse.nixtla.io/neuralforecast/ | Alternative DL forecasting |
| PyTorch-Forecasting | https://pytorch-forecasting.readthedocs.io/ | TFT reference implementation |
| hmmlearn | https://hmmlearn.readthedocs.io/ | HMM regime detection |
| FinBERT | https://huggingface.co/ProsusAI/finbert | Financial sentiment NLP |
| FinGPT | https://github.com/AI4Finance-Foundation/FinGPT | Open-source financial LLM |
| mlfinlab | https://github.com/hudson-and-thames/mlfinlab | Purged CV, financial ML tools |
| ta | https://technical-analysis-library-in-python.readthedocs.io/ | Technical indicators (already used) |
| yfinance | https://pypi.org/project/yfinance/ | Price + fundamental data (already used) |
| Alpha Vantage | https://www.alphavantage.co/documentation/ | Premium fundamentals + sentiment |
| SHAP | https://shap.readthedocs.io/ | Model explainability |
| LightGBM | https://lightgbm.readthedocs.io/ | Gradient boosting |

---

*This research document will be updated as implementation progresses. See implementation files in `backend/app/services/ml/` (to be created).*
