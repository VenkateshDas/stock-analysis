# Global Market Analysis Dashboard

A professional web-based stock market analysis dashboard with a Python FastAPI backend and React frontend. Covers 5 major global indices with full technical analysis and optional LLM-generated commentary.

## Indices Covered

| Index | Ticker | Timezone |
|---|---|---|
| Dow Jones Industrial Average | `^DJI` | America/New_York |
| Nasdaq 100 | `^NDX` | America/New_York |
| Nikkei 225 | `^N225` | Asia/Tokyo |
| Hang Seng Index | `^HSI` | Asia/Hong_Kong |
| GIFT Nifty / Nifty 50 (proxy) | `^NSEI` | Asia/Kolkata |

## Quick Start

### 1. Set up environment

```bash
cp .env.example .env
# Edit .env and add your OpenRouter API key (optional, for LLM commentary)
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py
# → API running at http://localhost:8000
# → Swagger UI at http://localhost:8000/docs
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# → App running at http://localhost:5173
```

## Features

- **Real-time data** via Yahoo Finance (free, no API key)
- **Technical indicators**: RSI, MACD, Bollinger Bands, ADX, SMA 20/50/200, ATR, OBV, Relative Volume
- **Statistical metrics**: Daily/weekly/monthly/yearly returns, YTD, 52-week range, volatility
- **90-day candlestick chart** with SMA overlays (TradingView Lightweight Charts)
- **LLM commentary** via OpenRouter API (MiniMax-Text-01) — optional
- **In-memory TTL cache** — 1 hour for market/analysis data, 6 hours for LLM responses
- **Dark theme** UI
- **India Bot Lab (upgraded)**: guided beginner workflow, curated instrument picker, multi-strategy workspace, AI strategy blueprint + AI improvement assistant, paper-trading approvals

## API Endpoints

```
GET /api/v1/indices                     All 5 indices snapshots
GET /api/v1/indices/{symbol}            Single index snapshot
GET /api/v1/indices/{symbol}/history    90-day OHLCV + SMA overlays
GET /api/v1/indices/{symbol}/analysis   Full technical + statistical analysis
GET /api/v1/indices/{symbol}/summary    LLM-generated commentary
GET /api/v1/overview                    Cross-index sentiment summary
GET /api/v1/refresh                     Clear all caches
GET /health                             Health check
```

Symbols: `DJI`, `NDX`, `N225`, `HSI`, `NSEI`

## Bot APIs (India Trading Bot)

```
POST /api/v1/bot/strategies/register
GET  /api/v1/bot/strategies
POST /api/v1/bot/strategies/blueprint
POST /api/v1/bot/backtests/run
GET  /api/v1/bot/backtests/{run_id}
GET  /api/v1/bot/backtests/{run_id}/trades
GET  /api/v1/bot/backtests/{run_id}/equity
POST /api/v1/bot/walkforward/run
POST /api/v1/bot/signals/run
GET  /api/v1/bot/signals?date=YYYY-MM-DD
POST /api/v1/bot/orders/approve
GET  /api/v1/bot/risk/status
GET  /api/v1/bot/audit/{date}
```

UI route: `http://localhost:5173/bot`

## LLM Commentary

Set `OPENROUTER_API_KEY` in `.env` to enable AI-generated 3-sentence market summaries.
Get a key at: https://openrouter.ai/keys
Model used: `minimax/minimax-text-01`

Without the key, the commentary panel shows a helpful message instead of failing.

## Requirements

- Python 3.10+
- Node.js 18+
