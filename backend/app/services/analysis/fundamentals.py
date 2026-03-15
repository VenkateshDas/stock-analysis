"""
Stock fundamentals service — fetches key financial metrics from yfinance.

Available fields (tested across 20+ stocks, availability noted):
  trailingPE       — 100% available
  forwardPE        — 100% available
  priceToBook      — 100% available
  enterpriseToEbitda — ~90% available
  earningsGrowth   — 100% available (yoy EPS growth)
  revenueGrowth    — ~95% available
  returnOnEquity   — ~35% available (skip if None)
  profitMargins    — ~90% available
  debtToEquity     — ~90% available
  currentRatio     — ~85% available
  dividendYield    — ~70% available (0 for growth stocks)
  payoutRatio      — ~70% available
  beta             — 100% available
  marketCap        — 100% available
  currency         — 100% available

Cached at 6-hour TTL (fundamentals change only on earnings).
"""

import logging
from datetime import date
from typing import Optional

import yfinance as yf

from app.models.fundamentals import StockFundamentals
from app.services.cache import TTLCache

log = logging.getLogger(__name__)

_cache = TTLCache(ttl=3600 * 6)


def get_stock_fundamentals(ticker: str) -> Optional[StockFundamentals]:
    cache_key = f"fundamentals_{ticker}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    try:
        info = yf.Ticker(ticker).info
    except Exception as exc:
        log.warning("Failed to fetch fundamentals for %s: %s", ticker, exc)
        return None

    if not info or not info.get("symbol"):
        return None

    def _pct(val: Optional[float]) -> Optional[float]:
        """Convert decimal fraction to percentage (0.15 → 15.0)."""
        return round(val * 100, 2) if val is not None else None

    raw_dy = info.get("dividendYield")
    currency = info.get("currency") or "USD"

    result = StockFundamentals(
        ticker=ticker,
        trade_date=str(date.today()),
        trailing_pe=round(info["trailingPE"], 2) if info.get("trailingPE") else None,
        forward_pe=round(info["forwardPE"], 2) if info.get("forwardPE") else None,
        price_to_book=round(info["priceToBook"], 2) if info.get("priceToBook") else None,
        ev_to_ebitda=round(info["enterpriseToEbitda"], 2) if info.get("enterpriseToEbitda") else None,
        earnings_growth=_pct(info.get("earningsGrowth")),
        revenue_growth=_pct(info.get("revenueGrowth")),
        return_on_equity=_pct(info.get("returnOnEquity")),
        profit_margins=_pct(info.get("profitMargins")),
        debt_to_equity=round(info["debtToEquity"], 2) if info.get("debtToEquity") else None,
        current_ratio=round(info["currentRatio"], 2) if info.get("currentRatio") else None,
        dividend_yield=round(raw_dy * 100, 2) if raw_dy else None,
        payout_ratio=_pct(info.get("payoutRatio")),
        beta=round(info["beta"], 2) if info.get("beta") else None,
        market_cap=info.get("marketCap"),
        currency=currency,
    )

    _cache.set(cache_key, result)
    return result
