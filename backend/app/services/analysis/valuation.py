"""
Valuation service — fetches P/E, P/B, dividend yield for an index.

Strategy:
  • Global indices (non-India): pull trailingPE / forwardPE / priceToBook /
    dividendYield from the corresponding ETF proxy (SPY, QQQ, EXS1.DE, …).
  • India indices: ETF proxies return unreliable PE (~10x vs actual ~20x).
    Instead, fetch trailingPE for the top Nifty/BankNifty constituents and
    compute a weighted-average PE.

Equity Risk Premium = earnings_yield − US 10Y yield
                    = (1 / trailing_PE) × 100  −  ^TNX close

PE signal uses each index's long-run average PE (HISTORICAL_PE_AVG):
  cheap      < avg × 0.85
  fair       avg × 0.85 – 1.15
  stretched  avg × 1.15 – 1.35
  expensive  > avg × 1.35

Cached at 6-hour TTL (fundamentals change slowly).
"""

import logging
from datetime import date, timedelta
from typing import Optional

import yfinance as yf

from app.config import (
    VALUATION_ETF_PROXY,
    INDIA_SYMBOLS,
    NIFTY50_CONSTITUENTS,
    NSEBANK_CONSTITUENTS,
    HISTORICAL_PE_AVG,
)
from app.models.valuation import ValuationMetrics
from app.services.cache import TTLCache

log = logging.getLogger(__name__)

_cache = TTLCache(ttl=3600 * 6)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tnx_yield() -> Optional[float]:
    """Return current US 10-year yield (%) as the risk-free rate proxy."""
    try:
        hist = yf.Ticker("^TNX").history(
            start=date.today() - timedelta(days=10),
            end=date.today() + timedelta(days=1),
        )
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception as exc:
        log.warning("TNX fetch failed: %s", exc)
    return None


def _etf_metrics(etf_ticker: str) -> dict:
    """Fetch valuation multiples from a liquid ETF's .info dict."""
    try:
        info = yf.Ticker(etf_ticker).info
        return {
            "trailing_pe":   info.get("trailingPE"),
            "forward_pe":    info.get("forwardPE"),
            "price_to_book": info.get("priceToBook"),
            "dividend_yield": info.get("dividendYield"),
        }
    except Exception as exc:
        log.warning("ETF info fetch failed for %s: %s", etf_ticker, exc)
        return {}


def _india_weighted_pe(symbol: str) -> Optional[float]:
    """Constituent-weighted trailing PE for India indices."""
    constituents = NSEBANK_CONSTITUENTS if symbol == "NSEBANK" else NIFTY50_CONSTITUENTS

    total_weight = 0.0
    weighted_pe = 0.0
    for c in constituents:
        try:
            info = yf.Ticker(c["ticker"]).info
            pe = info.get("trailingPE")
            if pe and 5 < pe < 200:   # sanity filter: skip negative / anomalous PEs
                weighted_pe += pe * c["weight"]
                total_weight += c["weight"]
        except Exception:
            continue

    if total_weight >= 0.3:           # need ≥30% weight coverage to trust the result
        return weighted_pe / total_weight
    return None


def _pe_signal(pe: Optional[float], symbol: str) -> str:
    avg = HISTORICAL_PE_AVG.get(symbol)
    if pe is None or avg is None:
        return "unavailable"
    ratio = pe / avg
    if ratio > 1.35:
        return "expensive"
    if ratio > 1.15:
        return "stretched"
    if ratio > 0.85:
        return "fair"
    return "cheap"


# ── Public API ────────────────────────────────────────────────────────────────

def get_valuation(symbol: str) -> Optional[ValuationMetrics]:
    cache_key = f"valuation_{symbol}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    tnx = _tnx_yield()
    trailing_pe: Optional[float] = None
    forward_pe:  Optional[float] = None
    price_to_book: Optional[float] = None
    dividend_yield: Optional[float] = None
    source: str

    if symbol in INDIA_SYMBOLS:
        trailing_pe = _india_weighted_pe(symbol)
        source = "Constituent-weighted"
    else:
        etf = VALUATION_ETF_PROXY.get(symbol)
        if not etf:
            return None
        raw = _etf_metrics(etf)
        trailing_pe   = raw.get("trailing_pe")
        forward_pe    = raw.get("forward_pe")
        price_to_book = raw.get("price_to_book")
        raw_dy        = raw.get("dividend_yield")
        # yfinance returns dividendYield as a decimal (0.013 = 1.3%)
        dividend_yield = round(raw_dy * 100, 2) if raw_dy else None
        source = f"ETF proxy: {etf}"

    earnings_yield: Optional[float] = None
    erp: Optional[float] = None
    if trailing_pe and trailing_pe > 0:
        earnings_yield = round((1.0 / trailing_pe) * 100, 2)
        if tnx:
            erp = round(earnings_yield - tnx, 2)

    result = ValuationMetrics(
        symbol=symbol,
        trade_date=str(date.today()),
        trailing_pe=round(trailing_pe, 1) if trailing_pe else None,
        forward_pe=round(forward_pe, 1) if forward_pe else None,
        price_to_book=round(price_to_book, 2) if price_to_book else None,
        dividend_yield=dividend_yield,
        earnings_yield=earnings_yield,
        equity_risk_premium=erp,
        historical_pe_avg=HISTORICAL_PE_AVG.get(symbol),
        pe_signal=_pe_signal(trailing_pe, symbol),
        data_source=source,
    )

    _cache.set(cache_key, result)
    return result
