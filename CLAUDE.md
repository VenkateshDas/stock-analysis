# CLAUDE.md

Developer guidance for Claude Code. Update this file whenever a repo-wide decision, constraint, or gotcha needs to persist across sessions.

**Last updated:** 2026-03-15 — Bot Lab redesign, CPR indicator, 13 indices

---

## Commands

### Backend
```bash
cd backend && .venv/bin/python3 run.py            # dev server → http://localhost:8000
cd backend && .venv/bin/python3 -m pytest tests/  # all tests
cd backend && .venv/bin/python3 -m pytest tests/test_bot_api.py -v          # single file
cd backend && .venv/bin/python3 -m pytest tests/test_bot_api.py::test_register_and_list_strategy -v  # single test
cd backend && .venv/bin/pip install -r requirements.txt
```

### Frontend
```bash
cd frontend && npm run dev      # → http://localhost:5173
cd frontend && npm run build    # type-check + Vite bundle → dist/
cd frontend && npm run preview  # serve dist/ locally
```

---

## Hard Constraints — Read Before Touching Anything

These are non-obvious. Violating them silently breaks things.

| Constraint | Rule | Why |
|---|---|---|
| **yfinance** | Always `.history(start=..., end=...)` — never `period="Nd"` | Arbitrary day strings are invalid in yfinance ≥ 1.2.0; causes JSONDecodeError |
| **Technical analysis** | Use `ta==0.11.0` only — never `pandas-ta` | `pandas-ta` is incompatible with Python 3.10 |
| **ta API style** | `ta.momentum.RSIIndicator`, `ta.trend.MACD`, `ta.volatility.BollingerBands` | Class-based API, not function-based |
| **Lightweight Charts** | `chart.addCandlestickSeries()` / `chart.addLineSeries()` | v4 API — the v5 `addSeries(CandlestickSeries, ...)` pattern does not exist here |
| **TypeScript** | All types in `frontend/src/types/` — never inline | `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` |
| **UI labels** | Never display "RSI", "MACD", "ADX" to users | Plain-English descriptions only (user-facing product decision) |
| **LLM model** | `minimax/minimax-m2.5` via OpenRouter | Both `market_summary.py` and `strategy_advisor.py` must use this model |

---

## Architecture

### Stack
FastAPI backend (Python 3.10+) + React/TypeScript frontend (Vite). No external database — all state is in-memory TTL caches. Yahoo Finance is the sole data source (no API key). OpenRouter LLM is optional.

### Request Flow
```
HTTP → api/v1/router.py → endpoints/*.py → services/* → TTL cache → data_providers/yahoo.py
```

### Cache Instances (`services/cache.py`)
| Cache | TTL | Holds |
|---|---|---|
| `market_cache` | 1 h | Index/stock snapshots |
| `analysis_cache` | 1 h | Technical + statistical results |
| `trend_cache` | 6 h | Multi-timeframe trend |
| `llm_cache` | 6 h | LLM commentary |
| `opening_range_cache` | 10 m | Gap + ORB signals |
| `heatmap_cache` | 15 m | Constituent heatmaps |
| `stock_info_cache` | 24 h | Fundamentals |
| `pcr_cache` / `screener_cache` / `opportunities_cache` | 1 h | Options, screener, alerts |

Cache is swept every 5 minutes by a background task in `main.py`. Never add a new cache without registering it in `_periodic_cache_cleanup()`.

### Key Services
- **Data**: `services/data_providers/yahoo.py` — `YahooFinanceProvider`
- **Technical**: `services/analysis/technical.py` — RSI, MACD, Bollinger, ADX, ATR, OBV
- **Statistical**: `services/analysis/statistical.py` — returns, volatility, ranges
- **Trend**: `services/analysis/trend.py` — Theil-Sen + Mann-Kendall, daily → yearly
- **LLM**: `services/llm/market_summary.py` — market commentary
- **Bot**: `bot/backtest/engine.py` (backtrader), `bot/signals/engine.py` (live)
- **Storage**: `bot/storage/repository.py` — SQLite (strategies, backtest runs, live trades, bot settings)

### Frontend State
All async fetching lives in Zustand stores (`store/useMarketStore.ts`, `useScreenerStore.ts`, `usePaperTradeStore.ts`). Components do not call `api.ts` directly.

### Routing (4 pages + 2 extras)
```
/              Dashboard       — MarketGrid + overview
/:symbol       IndexDetail     — chart + analysis panels
/stock/:ticker StockDetail     — stock-level detail
/bot           BotLab          — trading bot
/screener      Screener
/paper-trades  PaperTrades
```

---

## Indices (`backend/app/config.py`)

13 indices in the `INDICES` dict. Asia-Pacific: `NSEI`, `NSEBANK`, `CNX100`, `N225`, `HSI`, `KS11`, `AXJO`. Europe: `FTSE`, `GDAXI`, `FCHI`. Americas: `GSPC`, `DJI`, `NDX`.

When adding a new index: add to `INDICES`, wire into sector ETF proxies, and update the README indices table.

---

## Bot Lab — IndiaORBStrategy

Five-filter intraday system. All five must be true to fire a signal.

| Filter | BUY | SELL |
|---|---|---|
| Opening Range | Close > morning high | Close < morning low |
| EMA trend | EMA(9) > EMA(21) | EMA(9) < EMA(21) |
| VWAP | Price > session VWAP | Price < session VWAP |
| RSI anti-chase | RSI(14) < 70 | RSI(14) > 30 |
| Volume | Vol > 20-bar avg × `volume_mult` | same |

**Risk**: stop = 1.5 × ATR(14); target = stop × `target_rr`; max 3 trades/session; force-exit at 15:00 IST.

`BacktestConfig` must carry: `opening_range_end`, `target_rr`, `ema_fast`, `ema_slow`, `volume_mult`. Missing any of these causes silent incorrect results.

`TradeCaptureAnalyzer` uses `trade.size` (not PnL sign) when `trade.isopen` to determine side.

Walk-forward: `bot/backtest/walkforward.py`. Promotion threshold: `max(5, min(20, days // 3))` minimum trades.

---

## UI Conventions

- Primary visual on each index card: **"CLOSED UP" / "CLOSED DOWN"**
- `SentimentBadge` — bullish/bearish/neutral from technical score
- `TechnicalGauge` — circular gauge of overall signal strength
- `CPRPanel` — width thresholds: < 0.3% narrow (trending), 0.3–0.7% moderate, > 0.7% wide (sideways)
- CPR price lines drawn via `candleSeries.createPriceLine()`, toggled by checkbox in `CandlestickChart`

---

## Environment

`.env` at project root:
```
OPENROUTER_API_KEY=   # optional — LLM commentary works without it
```

Production detection: if `PORT` env var is set → Uvicorn runs without reload (Koyeb/Render/Railway compatible). Frontend Vite proxy: `/api/*` → `http://localhost:8000`.

Kite Connect OAuth session stored at `data/bot/kite_session.json`.

---

## Updating This File

Update CLAUDE.md when:
- A build/run command changes
- A new hard constraint or gotcha is discovered
- An architectural decision is made that future Claude sessions need to respect
- A service, cache instance, or page route is added or removed
- A bug is fixed by a non-obvious workaround that could regress

Update the **Last updated** line at the top with today's date and a 5-word summary of what changed.
