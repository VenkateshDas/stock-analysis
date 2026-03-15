# Global Market Analysis Dashboard

> A professional, full-stack stock market intelligence platform — real-time data, multi-timeframe analysis, constituent heatmaps, sector rotation, and an AI-powered India intraday trading bot. No paid data subscriptions required.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Indices Covered](#indices-covered)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Bot Lab — India ORB Strategy](#bot-lab--india-orb-strategy)
- [Project Structure](#project-structure)
- [Development Guide](#development-guide)

---

## Overview

This dashboard aggregates live market data from **13 global indices** across Asia-Pacific, Europe, and the Americas. It computes technical indicators, statistical metrics, multi-timeframe trends, sector performance, and Central Pivot Range (CPR) levels — all in a clean, dark-themed React UI.

The **Bot Lab** is a fully self-contained India intraday trading system: define a strategy, backtest it with walk-forward validation, get AI-generated parameter suggestions, and approve live signals before they hit the market via Zerodha Kite Connect.

**No paid data sources.** Yahoo Finance powers all price data. LLM commentary is optional (OpenRouter).

---

## Features

### Market Intelligence
- **Live snapshots** for 13 global indices — price, change, 52-week range, volume
- **90-day candlestick charts** with SMA 20/50/200 overlays (TradingView Lightweight Charts v4)
- **Central Pivot Range (CPR)** — pivot, top/bottom central, R1–R3, S1–S3 drawn as price lines; width signal (narrow = trending, wide = sideways)
- **Multi-timeframe trend** — daily, weekly, monthly, yearly with Theil-Sen regression and Mann-Kendall significance test
- **Opening range analysis** — gap classification, ORB breakout signals
- **Constituent heatmaps** — sector-level color-coded performance for Nifty 50, Nifty Bank, S&P 500, and more
- **Sector rotation** — regional ETF-proxy performance across 10+ GICS sectors
- **Put-Call Ratio (PCR)** — options sentiment for supported indices
- **Macro context** — economic regime and calendar events
- **Valuation metrics** — P/E, P/B, dividend yield vs. historical averages
- **Fundamental data** — EPS, revenue, market cap for individual stocks
- **Stock screener** — filter by technical signal, sector, and momentum
- **Paper trading** — simulate trades and track P&L without real capital

### Analysis Engine
- **Technical indicators**: RSI(14), MACD, Bollinger Bands, ADX, ATR, OBV, EMA, SMA, Stochastic, Relative Volume
- **Statistical metrics**: daily/weekly/monthly/yearly/YTD returns, annualized volatility, Sharpe-like ratio
- **Market regime identification** — trending vs. ranging, bull vs. bear classification
- **Opportunity alerts** — cross-index signal aggregation

### AI Layer
- **LLM market commentary** — 3-sentence summaries via OpenRouter (MiniMax M2.5), cached 6 hours
- **AI strategy blueprint** — describe a strategy idea, get structured ORB parameters back
- **AI strategy improvement** — after a backtest, get parameter suggestions with plain-English explanations

### Bot Lab
- **India ORB Strategy** — 5-filter intraday system: Opening Range Breakout + VWAP + RSI + ATR stops + EMA trend
- **Backtesting** — event-driven simulation via `backtrader`, full trade log + equity curve
- **Walk-forward validation** — rolling in-sample/out-of-sample splits
- **Live signal engine** — same 5-filter logic applied to real-time data
- **Human-in-the-loop approvals** — review and approve each signal before execution
- **Kite Connect integration** — OAuth session, paper mode and live mode execution
- **Risk management** — daily loss limits, position sizing, drawdown monitoring
- **Persistent storage** — SQLite for strategies, backtest runs, live trades, settings

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript 5.7, Vite 6, Tailwind CSS 3 |
| **State management** | Zustand 5 |
| **Charts** | Lightweight Charts v4 (candlesticks), D3 v7 (sparklines, heatmaps) |
| **HTTP client** | Axios 1.7 |
| **Backend** | FastAPI 0.115, Uvicorn 0.32, Pydantic v2 |
| **Data** | yfinance ≥ 1.2.0 (Yahoo Finance) |
| **Technical analysis** | ta 0.11.0 (RSI, MACD, Bollinger, ADX, ATR, OBV) |
| **Statistical analysis** | scipy, statsmodels, numpy, pandas |
| **Backtesting** | backtrader 1.9.78 |
| **Broker** | Zerodha Kite Connect ≥ 5.0.1 |
| **LLM** | OpenRouter API → MiniMax M2.5 |
| **Caching** | In-memory TTL cache (no external store) |
| **Runtime** | Python 3.10+, Node.js 18+ |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│   Zustand ──▶ api.ts (Axios) ──▶ Vite proxy /api/*      │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼────────────────────────────────┐
│               FastAPI Backend  :8000                     │
│   api/v1/router.py                                       │
│   └── endpoints/  ──▶  services/  ──▶  cache (TTL)      │
│                            │                             │
│                   data_providers/yahoo.py  (yfinance)    │
│                   analysis/{technical, statistical,      │
│                             trend, opening_range, ...}   │
│                   llm/market_summary.py  (OpenRouter)    │
│                   bot/{backtest, signals, live, auth}    │
│                   macro/, sector_service.py              │
└─────────────────────────────────────────────────────────┘
                         │
            ┌────────────┼─────────────┐
            ▼            ▼             ▼
       Yahoo Finance  OpenRouter  Kite Connect
        (free, no key) (optional)  (optional)
```

### Cache TTLs

| Cache | TTL | Purpose |
|---|---|---|
| `market_cache` | 1 hour | Index/stock snapshots |
| `analysis_cache` | 1 hour | Technical & statistical results |
| `trend_cache` | 6 hours | Multi-timeframe trend |
| `llm_cache` | 6 hours | LLM commentary |
| `heatmap_cache` | 15 minutes | Constituent heatmaps |
| `opening_range_cache` | 10 minutes | Gap & ORB signals |
| `stock_info_cache` | 24 hours | Fundamentals |
| `pcr_cache` / `screener_cache` / `opportunities_cache` | 1 hour | Options, screener, alerts |

Caches are swept every 5 minutes. All are in-process — no Redis or database required.

---

## Indices Covered

### Asia-Pacific
| Symbol | Name | Exchange | Currency |
|---|---|---|---|
| `NSEI` | Nifty 50 | NSE India | INR |
| `NSEBANK` | Nifty Bank | NSE India | INR |
| `CNX100` | Nifty 100 | NSE India | INR |
| `N225` | Nikkei 225 | Tokyo | JPY |
| `HSI` | Hang Seng | Hong Kong | HKD |
| `KS11` | KOSPI | Seoul | KRW |
| `AXJO` | S&P/ASX 200 | Sydney | AUD |

### Europe
| Symbol | Name | Exchange | Currency |
|---|---|---|---|
| `FTSE` | FTSE 100 | London | GBP |
| `GDAXI` | DAX 40 | Frankfurt | EUR |
| `FCHI` | CAC 40 | Paris | EUR |

### Americas
| Symbol | Name | Exchange | Currency |
|---|---|---|---|
| `GSPC` | S&P 500 | New York | USD |
| `DJI` | Dow Jones | New York | USD |
| `NDX` | Nasdaq 100 | New York | USD |

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+

### 1. Clone and configure

```bash
git clone <repo-url>
cd stock-analysis
cp .env.example .env
# Optional: add OPENROUTER_API_KEY to .env for AI commentary
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

Backend runs at **http://localhost:8000**
Swagger UI at **http://localhost:8000/docs**

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:5173**

> The Vite dev server proxies all `/api/*` requests to the backend, so no CORS issues in development.

---

## Configuration

All settings live in `.env` at the project root:

```env
# LLM commentary — optional. App works fully without this.
OPENROUTER_API_KEY=your_key_here

# Overrides (optional — defaults shown)
# BACKEND_PORT=8000
# FRONTEND_URL=http://localhost:5173
# CACHE_TTL_SECONDS=3600
```

Get an OpenRouter key at https://openrouter.ai/keys (free tier available).

---

## API Reference

All endpoints are prefixed with `/api/v1`. Interactive docs at `/docs`.

### Market Data

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/indices` | Snapshots for all 13 indices |
| `GET` | `/indices/{symbol}` | Single index snapshot + current CPR |
| `GET` | `/indices/{symbol}/history` | 90-day OHLCV + SMA 20/50/200 + CPR bars |
| `GET` | `/stocks/{ticker}` | Stock snapshot |
| `GET` | `/stocks/{ticker}/history` | Stock 90-day OHLCV + indicators |

### Analysis

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/indices/{symbol}/analysis` | Technical indicators + statistical metrics |
| `GET` | `/indices/{symbol}/trend` | Multi-timeframe trend (daily → yearly) |
| `GET` | `/indices/{symbol}/opening-range` | Gap classification + ORB breakout signals |
| `GET` | `/indices/{symbol}/heatmap` | Constituent heatmap by sector |
| `GET` | `/valuation/{symbol}` | P/E, P/B, dividend yield vs. historical |
| `GET` | `/pcr/{symbol}` | Put-Call Ratio + sentiment |
| `GET` | `/stocks/{ticker}/analysis` | Stock technical + statistical |
| `GET` | `/stocks/{ticker}/trend` | Stock multi-timeframe trend |

### Content

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/indices/{symbol}/summary` | AI-generated market commentary |
| `GET` | `/stocks/{ticker}/summary` | AI stock commentary |
| `GET` | `/overview` | Cross-index sentiment summary |
| `GET` | `/macro/context` | Macro economic conditions |
| `GET` | `/macro/calendar` | Economic event calendar |
| `GET` | `/opportunities` | Actionable signal alerts |

### Sectors

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/sectors/global/{region}` | ETF-proxy sector performance by region |
| `GET` | `/sectors/index/{symbol}` | Per-index sector composition |
| `GET` | `/sectors/all` | All regions combined |

### Screener & Paper Trading

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/screener` | Filtered stock list by signal/sector |
| `GET` | `/paper-trades` | Paper trade history |
| `POST` | `/paper-trades` | Create new paper trade |

### Bot Lab

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/bot/strategies/register` | Register a new strategy |
| `GET` | `/bot/strategies` | List all strategies |
| `POST` | `/bot/strategies/blueprint` | AI strategy blueprint from description |
| `POST` | `/bot/backtests/run` | Run backtest for a strategy |
| `GET` | `/bot/backtests/{run_id}` | Backtest summary report |
| `GET` | `/bot/backtests/{run_id}/trades` | Full trade log |
| `GET` | `/bot/backtests/{run_id}/equity` | Equity curve points |
| `POST` | `/bot/backtests/{run_id}/improve` | AI parameter improvement suggestions |
| `POST` | `/bot/walkforward/run` | Walk-forward validation |
| `POST` | `/bot/signals/run` | Generate live signals |
| `GET` | `/bot/signals?date=YYYY-MM-DD` | Signal history for a date |
| `POST` | `/bot/orders/approve` | Approve a pending signal |
| `POST` | `/bot/orders/{id}/execute` | Execute approved order (paper or live) |
| `GET` | `/bot/risk/status` | Daily risk metrics |
| `GET` | `/bot/audit/{date}` | Trade audit log |
| `GET` | `/bot/status` | Bot on/off + mode |
| `POST` | `/bot/toggle` | Enable or disable the bot |
| `GET` | `/bot/settings` | Capital, risk, mode settings |
| `POST` | `/bot/settings` | Save settings |
| `GET` | `/bot/kite/status` | Kite Connect OAuth status |
| `POST` | `/bot/kite/credentials` | Save API key + secret |
| `GET` | `/bot/kite/login-url` | Generate OAuth login URL |
| `POST` | `/bot/kite/callback` | Exchange request token |
| `POST` | `/bot/kite/disconnect` | Logout from Kite |
| `GET` | `/bot/live/positions` | Open positions |
| `GET` | `/bot/live/orders` | Open orders |

### System

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/refresh` | Force-clear all caches |
| `GET` | `/health` | Health check (`{"status": "ok"}`) |

---

## Bot Lab — India ORB Strategy

The Bot Lab implements **IndiaORBStrategy**, a five-filter intraday system for NSE instruments.

### Signal Logic

A BUY signal fires only when all five conditions are true simultaneously:

| Filter | BUY Condition | SELL Condition |
|---|---|---|
| Opening Range | Price closes above morning high | Price closes below morning low |
| EMA Trend | EMA(9) > EMA(21) | EMA(9) < EMA(21) |
| VWAP | Price > session VWAP | Price < session VWAP |
| RSI anti-chase | RSI(14) < 70 | RSI(14) > 30 |
| Volume | Volume > 20-bar avg × multiplier | Same |

### Risk Parameters

```
Stop-loss  =  entry ± 1.5 × ATR(14)
Target     =  entry ∓ stop_distance × target_rr   (default: 2×)
Max trades =  3 per session
Force exit =  15:00 IST (session close)
```

ATR-based stops adapt to current volatility — wider stops in volatile conditions, tighter in calm ones.

### Workflow

```
1. Register strategy  →  define ticker + parameters
2. Run backtest       →  event-driven simulation via backtrader
3. Inspect results    →  trade log, equity curve, win rate, max drawdown
4. AI improvement     →  get plain-English suggestions with parameter deltas
5. Walk-forward       →  rolling in/out-of-sample validation
6. Generate signals   →  apply same logic to live data
7. Review & approve   →  human confirmation before any order
8. Execute            →  paper mode or live via Kite Connect
```

### Kite Connect Setup (for live trading)

1. Create an app at https://developers.kite.trade
2. Enter API key + secret in the Bot Lab connection card
3. Click "Connect" — completes OAuth in the browser
4. Session is stored at `data/bot/kite_session.json`
5. Toggle to **Live** mode in settings to route real orders

Paper mode is the default and requires no broker credentials.

---

## Project Structure

```
stock-analysis/
├── .env.example
├── backend/
│   ├── run.py                       # Uvicorn entry point
│   ├── requirements.txt
│   └── app/
│       ├── config.py                # Indices, settings, ETF proxies, constituents
│       ├── main.py                  # FastAPI app factory, CORS, cache cleanup
│       ├── models/                  # Pydantic response models
│       │   ├── market.py            # IndexSnapshot, OHLCVBar, CPRBar, HistoryResponse
│       │   ├── analysis.py          # TechnicalIndicators, StatisticalMetrics, LLMSummary
│       │   ├── bot.py               # BacktestConfig, BacktestReport, BotSettings
│       │   └── ...                  # sector, heatmap, screener, pcr, macro, valuation
│       ├── services/
│       │   ├── cache.py             # TTLCache with evict_expired()
│       │   ├── data_providers/
│       │   │   └── yahoo.py         # YahooFinanceProvider (yfinance ≥ 1.2.0)
│       │   ├── analysis/
│       │   │   ├── technical.py     # RSI, MACD, Bollinger, ADX, ATR, OBV via ta lib
│       │   │   ├── statistical.py   # Returns, volatility, ranges
│       │   │   ├── trend.py         # Theil-Sen + Mann-Kendall multi-timeframe
│       │   │   ├── opening_range.py # Gap + ORB calculations
│       │   │   ├── regime.py        # Market regime classification
│       │   │   └── ...              # fundamentals, screener, valuation, pcr
│       │   ├── llm/
│       │   │   └── market_summary.py # OpenRouter → MiniMax M2.5
│       │   └── macro/
│       │       └── macro_service.py
│       ├── api/v1/
│       │   ├── router.py            # Aggregates all 11 sub-routers
│       │   └── endpoints/           # One file per domain
│       └── bot/
│           ├── backtest/engine.py   # IndiaORBStrategy (backtrader)
│           ├── backtest/walkforward.py
│           ├── signals/engine.py    # Live signal generation
│           ├── auth/kite_auth.py    # Kite OAuth session
│           ├── storage/repository.py # SQLite (strategies, runs, trades, settings)
│           ├── live/trading.py      # Paper + live execution
│           ├── risk/manager.py      # Daily loss limits, position sizing
│           └── ai/strategy_advisor.py # AI improvement service
└── frontend/
    ├── vite.config.ts               # Proxy /api → :8000
    ├── tailwind.config.js
    └── src/
        ├── types/                   # All TypeScript interfaces (strict mode)
        ├── services/api.ts          # Axios client
        ├── store/                   # Zustand stores (market, screener, paper trades)
        ├── pages/
        │   ├── Dashboard.tsx        # MarketGrid + overview
        │   ├── IndexDetail.tsx      # Chart + analysis panels
        │   ├── StockDetail.tsx      # Stock-level detail
        │   ├── BotLab.tsx           # Trading bot interface
        │   ├── Screener.tsx         # Stock screener
        │   └── PaperTrades.tsx      # Paper trade history
        └── components/
            ├── charts/              # CandlestickChart, SparklineChart, HeatmapChart
            ├── analysis/            # TechnicalGauge, CPRPanel, TrendPanel, LLMSummaryPanel, ...
            ├── market/              # IndexCard, MarketGrid, SentimentBadge
            └── bot/                 # ConnectionCard, EquityChart, RiskGauge, SignalCard
```

---

## Development Guide

### Running tests

```bash
cd backend && .venv/bin/python3 -m pytest tests/ -v
```

### Key constraints

- **yfinance**: Always use `.history(start=..., end=...)`. Do not use `period="Nd"` — arbitrary day strings are not valid.
- **Technical analysis**: Uses `ta==0.11.0`. Do not use `pandas-ta` — it is incompatible with Python 3.10.
- **Lightweight Charts**: v4 API — use `chart.addCandlestickSeries()` and `chart.addLineSeries()`. The v5 `addSeries(CandlestickSeries, ...)` pattern will not work.
- **TypeScript**: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. All types go in `frontend/src/types/`.
- **UI labels**: Never show technical abbreviations (RSI, MACD, ADX) directly to users. Use plain-English descriptions.

### Frontend build

```bash
cd frontend
npm run build    # Type-check + Vite bundle → dist/
npm run preview  # Serve dist/ locally
```

### Environment detection

The backend auto-detects production vs. development:
- If the `PORT` environment variable is set → production mode (no hot reload)
- Otherwise → development mode (Uvicorn reload enabled)

This makes the backend Koyeb/Render/Railway-ready with zero config changes.
