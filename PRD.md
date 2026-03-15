# Product Requirements Document (PRD)
## Global Market Analysis Dashboard

## 1. Document Summary
- Version: 1.0
- Date: 2026-02-23
- Status: Ready for Engineering Handoff
- Source baseline: Existing repository implementation (`backend/` + `frontend/`)

## 2. Product Overview
Global Market Analysis Dashboard is a web application for monitoring major equity indices and individual stocks with technical, statistical, trend, sector, opening-range, and AI-assisted narrative analysis.

The system currently supports:
- Multi-index global monitoring (Asia-Pacific, Europe, Americas)
- Index and stock detail analysis pages
- India-first dashboard prioritization
- Cached, near-real-time market snapshots and derived analytics
- Optional LLM-generated plain-English commentary

## 3. Problem Statement
Traders and market-followers currently use fragmented tools for:
- Spotting global index movement and sentiment
- Understanding technical/statistical state quickly
- Linking index movement to sector/constituent drivers
- Translating indicator-heavy outputs into actionable summaries

This product unifies these into one operational dashboard with API-first architecture.

## 4. Goals and Success Criteria
### 4.1 Goals
- Provide a fast, single-pane market pulse for global indices.
- Enable deep drill-down per index and per stock.
- Offer actionable interpretation (playbook + optional LLM summary).
- Keep data retrieval resilient and low-latency using caching.

### 4.2 Success Criteria (MVP)
- Dashboard loads index cards and sentiment overview in <3s under normal network conditions.
- Detail pages load core chart + analysis data without blocking if one module fails.
- Data refresh works manually and through automatic polling.
- All documented APIs are reachable and return typed JSON responses.
- Application runs locally from documented setup steps without code changes.

## 5. Target Users
- Active retail traders
- Market analysts and researchers
- Learners who need plain-English technical interpretation

## 6. Scope
### 6.1 In Scope
- Index snapshots, historical OHLCV, technical indicators, statistical metrics
- Multi-timeframe trend analysis (daily/weekly/monthly/yearly)
- Opening gap and opening-range OHOL signal analysis
- Sector analysis (regional ETF performance + per-index constituent breakdown)
- Constituent heatmap for supported indices
- Optional LLM summary generation
- Stock-level analysis endpoints and stock detail page

### 6.2 Out of Scope (Current Version)
- Order execution / broker integration
- User authentication and portfolios
- Persistent historical storage (no database in current architecture)
- Backtesting engine
- Alerting/notifications

## 7. Functional Requirements
### FR-1: Global Dashboard
- Display all tracked index snapshots with last close, change %, sparkline, and sentiment cues.
- Prioritize India indices in a primary section.
- Show international indices in a secondary section with country filter chips.
- Auto-refresh dashboard data every 60 seconds.
- Provide retry behavior for initial load failure.

### FR-2: Index Detail Page
- Route by symbol (e.g., `/:symbol`).
- Show header with index price, change, trade dates, and optional TradingView link.
- Render 90-day candlestick chart with SMA overlays.
- Display action playbook panel.
- Support expandable advanced section containing:
  - Opening range panel
  - Technical panel
  - Statistical panel
  - Trend panel
  - LLM summary panel (on-demand fetch)
  - Sector breakdown card
- Auto-refresh detail data every 60 seconds.

### FR-3: Stock Detail Page
- Route by ticker (e.g., `/stock/:ticker`).
- Provide stock snapshot, history, technical/statistical/trend/opening-range.
- Show action playbook and advanced analysis modules similar to index detail.
- Support on-demand LLM summary for stock.

### FR-4: Market Data API
- Expose index and stock snapshot endpoints.
- Expose index and stock history endpoints with OHLCV + SMA20/50/200 overlays.
- Return standardized typed contracts for frontend rendering.

### FR-5: Analysis API
- Expose technical + statistical analysis endpoints for index and stock.
- Return overall sentiment classification and sentiment score.

### FR-6: Trend API
- Expose multi-timeframe trend endpoint for index and stock.
- Include statistical trend quality and forecast metadata.

### FR-7: Opening Range API
- Expose gap analysis and OHOL signals for index and stock.
- Include current/previous session signals when available.

### FR-8: Sector API
- Expose global sector ETF performance by region.
- Expose per-index sector and constituent-level contribution analysis.
- Expose all-index sector aggregation endpoint.

### FR-9: Heatmap API
- Expose constituent heatmap data grouped by sector with weights and daily change.

### FR-10: LLM Summary API
- Generate plain-English commentary from analysis and trend context.
- Degrade gracefully if LLM API key is missing/unavailable.

### FR-11: Cache and Refresh
- Use in-memory TTL caching for market, analysis, trend, LLM, sector, opening-range, and heatmap data.
- Provide `/api/v1/refresh` endpoint to clear caches.

## 8. Non-Functional Requirements
### NFR-1 Performance
- P95 API response target (cached): <500ms
- P95 API response target (uncached, Yahoo-dependent): <5s
- Frontend initial dashboard render target: <3s on local dev setup

### NFR-2 Reliability
- Service should return partial data where possible rather than hard-fail entire page.
- Log upstream provider failures with sufficient context.

### NFR-3 Freshness
- Snapshot/history/analysis should reflect latest available daily/intraday provider data.
- Polling interval: 60s on dashboard/detail pages.

### NFR-4 Security
- Restrict CORS to configured frontend URL(s).
- Keep OpenRouter key in environment variables only.
- No secrets hardcoded in repo.

### NFR-5 Maintainability
- Typed request/response models in backend (Pydantic) and frontend (TypeScript).
- Layered architecture: API endpoints → services → data providers.

## 9. Tech Stack
### Frontend
- React 19 + TypeScript
- Vite 6
- Zustand for client state
- Axios for HTTP
- Tailwind CSS for styling
- D3 + lightweight-charts for visualization
- React Router for navigation

### Backend
- Python 3.10+
- FastAPI + Uvicorn
- Pydantic / pydantic-settings
- yfinance + pandas + numpy
- ta, scipy, statsmodels for analytics
- httpx for external HTTP calls

### External/Data Dependencies
- Yahoo Finance (primary market data)
- NSE index constituents endpoint (for NSE index constituent enrichment)
- OpenRouter API (optional LLM summaries)

### Infrastructure Pattern
- Single backend service + single frontend SPA
- No database (in-memory TTL cache only)

## 10. Data and Domain Requirements
### 10.1 Index Universe
System currently tracks 13 indices:
- Asia-Pacific: `N225`, `HSI`, `KS11`, `AXJO`, `NSEI`, `CNX100`, `NSEBANK`
- Europe: `FTSE`, `GDAXI`, `FCHI`
- Americas: `GSPC`, `DJI`, `NDX`

### 10.2 Core Analytics
- Technical: RSI, MACD, Bollinger, ADX/DI, SMA20/50/200, ATR/ATR%, OBV, RVOL
- Statistical: daily/weekly/monthly/yearly/YTD returns, 52-week distance, volatility, range metrics
- Trend: Theil-Sen slope, Mann-Kendall significance, OLS R², Holt forecast, Hurst (yearly)
- Opening Range: gap type/size + OHOL signal with tolerance/window logic

## 11. API Requirements (Contract Surface)
All endpoints are under `/api/v1` unless noted.

### 11.1 Health and Ops
- `GET /health`
- `GET /api/v1/refresh`

### 11.2 Market Data
- `GET /api/v1/indices`
- `GET /api/v1/indices/{symbol}`
- `GET /api/v1/indices/{symbol}/history`
- `GET /api/v1/stocks/{ticker}`
- `GET /api/v1/stocks/{ticker}/history`

### 11.3 Analysis and Trend
- `GET /api/v1/indices/{symbol}/analysis`
- `GET /api/v1/stocks/{ticker}/analysis`
- `GET /api/v1/indices/{symbol}/trend`
- `GET /api/v1/stocks/{ticker}/trend`
- `GET /api/v1/overview`

### 11.4 LLM
- `GET /api/v1/indices/{symbol}/summary`
- `GET /api/v1/stocks/{ticker}/summary`

### 11.5 Opening Range
- `GET /api/v1/indices/{symbol}/opening-range`
- `GET /api/v1/stocks/{ticker}/opening-range`

### 11.6 Sector and Heatmap
- `GET /api/v1/sectors/global/{region}`
- `GET /api/v1/sectors/index/{symbol}`
- `GET /api/v1/sectors/all`
- `GET /api/v1/overview/sectors`
- `GET /api/v1/indices/{symbol}/heatmap`

## 12. Configuration Requirements
Environment variables:
- `OPENROUTER_API_KEY` (optional)
- `CACHE_TTL_SECONDS` (optional; default 3600)
- `BACKEND_PORT` (optional; default 8000)
- `FRONTEND_URL` (optional; default `http://localhost:5173`)

## 13. Usage Requirements
### 13.1 Developer Setup
1. Copy env file: `cp .env.example .env`
2. Backend:
   - `cd backend`
   - `python3 -m venv .venv`
   - `source .venv/bin/activate`
   - `pip install -r requirements.txt`
   - `python run.py`
3. Frontend:
   - `cd frontend`
   - `npm install`
   - `npm run dev`

Expected URLs:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

### 13.2 End-User Workflow
1. Open dashboard and monitor India-first + global cards.
2. Click an index card for detailed analysis.
3. Expand advanced view for technical/statistical/trend/opening-range/sector modules.
4. Optionally request LLM summary when narrative interpretation is needed.
5. Click stock ideas in playbook to navigate to stock detail pages.
6. Use Refresh button for forced data refresh (cache clear + refetch).

## 14. Observed Gaps and Engineering Notes
- README currently mentions 5 indices, while implemented config supports 13 indices.
- No automated test suite is present in this repo baseline; add API/unit/UI tests in implementation cycle.
- Caching is in-process memory only; horizontal scaling will require shared cache (e.g., Redis).

## 15. Acceptance Criteria
- AC-1: Dashboard displays all configured indices and updates every 60s.
- AC-2: Index detail page renders chart + playbook + advanced modules without page crash when one module fails.
- AC-3: Stock detail route supports arbitrary ticker analysis endpoints.
- AC-4: Sector endpoints return valid structures for configured regions and index symbols.
- AC-5: Heatmap endpoint returns grouped constituent data for supported indices.
- AC-6: LLM summary endpoint returns fallback-safe response when key is missing.
- AC-7: `/api/v1/refresh` clears caches and subsequent calls refetch provider data.

## 16. Delivery Phasing (Recommended)
1. Phase 1: Core market data + dashboard + index detail chart.
2. Phase 2: Technical/statistical/trend + opening range modules.
3. Phase 3: Sector + heatmap + playbook enhancements.
4. Phase 4: LLM summary + hardening (tests, observability, scalability).
