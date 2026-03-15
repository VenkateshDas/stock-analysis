# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
# Start dev server (from project root or backend/)
cd backend && .venv/bin/python3 run.py          # → http://localhost:8000
# or with venv activated:
source backend/.venv/bin/activate && python run.py

# Run all backend tests
cd backend && .venv/bin/python3 -m pytest tests/

# Run a single test file
cd backend && .venv/bin/python3 -m pytest tests/test_bot_api.py -v

# Run a single test function
cd backend && .venv/bin/python3 -m pytest tests/test_bot_api.py::test_register_and_list_strategy -v

# Install dependencies
cd backend && .venv/bin/pip install -r requirements.txt
```

### Frontend
```bash
cd frontend && npm run dev       # → http://localhost:5173
cd frontend && npm run build     # Type-check + Vite build → dist/
cd frontend && npm run preview   # Serve built dist/ locally
```

## Architecture

### Overview
Full-stack dashboard: **FastAPI backend** (Python 3.10+) + **React/TypeScript frontend** (Vite). No database — in-memory TTL caches only. Yahoo Finance provides all market data (no API key required). LLM commentary is optional (OpenRouter).

### Backend — Key Services
- **Data**: `services/data_providers/yahoo.py` — `YahooFinanceProvider` using `yfinance>=1.2.0`. Always call `.history(start=..., end=...)`, never `period="Nd"` (arbitrary day strings are invalid).
- **Technical analysis**: `services/analysis/technical.py` — uses `ta==0.11.0` (not `pandas-ta`, which is incompatible with Python 3.10). API is `ta.momentum.RSIIndicator`, `ta.trend.MACD`, etc.
- **Cache**: `services/cache.py` — multiple TTL instances: `market_cache` (1h), `analysis_cache` (1h), `llm_cache` (6h), `trend_cache` (6h), `opening_range_cache` (10m), `heatmap_cache` (15m), `stock_info_cache` (24h).
- **LLM**: `services/llm/market_summary.py` + `bot/ai/strategy_advisor.py` — both call OpenRouter with model `minimax/minimax-m2.5`.
- **Bot engine**: `bot/backtest/engine.py` — `IndiaORBStrategy` using `backtrader`. `bot/signals/engine.py` — same logic for live signals.

### Backend — Request Flow
```
HTTP request → api/v1/router.py → endpoints/*.py → services/* → cache or data_providers
```

### Frontend — Key Patterns
- **State**: Zustand store at `store/useMarketStore.ts` — all async data fetching goes here.
- **API client**: `services/api.ts` — Axios, proxied via Vite to `http://localhost:8000`.
- **Charts**: `lightweight-charts` v4. Use `chart.addCandlestickSeries()` and `chart.addLineSeries()` — NOT the v5 pattern `addSeries(CandlestickSeries, ...)`.
- **CPR price lines**: drawn via `candleSeries.createPriceLine()`, toggled by checkbox in CandlestickChart.
- **Routing**: 4 pages — `/` Dashboard, `/:symbol` IndexDetail, `/stock/:ticker` StockDetail, `/bot` BotLab.

### Indices Covered
13 global indices across three regions, configured in `backend/app/config.py` (`INDICES` dict):
- **Asia-Pacific**: N225, HSI, KS11, AXJO, NSEI, CNX100, NSEBANK
- **Europe**: FTSE, GDAXI, FCHI
- **Americas**: GSPC, DJI, NDX

### Bot Lab (India ORB Strategy)
The `IndiaORBStrategy` uses 5 combined filters: Opening Range Breakout + VWAP + RSI(14) + ATR-based stops + EMA(9/21) crossover. Key constraints:
- ATR stop = 1.5× ATR; target = `target_rr` × stop distance
- RSI anti-chase: < 70 for BUY, > 30 for SELL
- `BacktestConfig` must carry `opening_range_end`, `target_rr`, `ema_fast`, `ema_slow`, `volume_mult`
- Walk-forward analysis available via `bot/backtest/walkforward.py`
- Persistent storage via SQLite in `bot/storage/repository.py` (strategies, backtest runs, live trades, bot settings)
- Kite Connect OAuth session stored at `data/bot/kite_session.json`

### UI Conventions
- **Plain-English labels only** — never show "RSI", "MACD", "ADX" abbreviations to users; use descriptive text.
- **"CLOSED UP / CLOSED DOWN"** is the primary visual on each index card.
- `SentimentBadge` shows bullish/bearish/neutral derived from technical score.
- `TechnicalGauge` is a circular gauge showing overall signal strength.
- `CPRPanel` width thresholds: < 0.3% = narrow (trending), 0.3–0.7% = moderate, > 0.7% = wide (sideways).

## Environment
`.env` at project root (copy from `.env.example`):
```
OPENROUTER_API_KEY=   # Optional — enables LLM commentary; app works without it
```
Frontend dev server proxies `/api/*` to `http://localhost:8000` (configured in `vite.config.ts`).

## TypeScript Config
Strict mode is on: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. All types live in `frontend/src/types/` — add new types there, not inline.
