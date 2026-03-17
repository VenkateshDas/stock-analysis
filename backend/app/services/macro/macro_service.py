"""Macro context service — fetches VIX, bond yields, currencies, commodities."""
import logging
from datetime import date, timedelta
from typing import Optional

import yfinance as yf

from app.models.macro import MacroSnapshot, MacroTicker
from app.services.cache import TTLCache

logger = logging.getLogger(__name__)

# 5-minute cache — keeps macro context reasonably fresh
_macro_cache = TTLCache(ttl=300)

# ── Ticker config ─────────────────────────────────────────────────────────────

_TICKERS = [
    ("india_vix",  "^INDIAVIX",  "India VIX",      "fear_gauge"),
    ("us_10y",     "^TNX",       "US 10Y Yield",    "rates"),
    ("usd_inr",    "USDINR=X",   "USD / INR",       "currency"),
    ("brent",      "BZ=F",       "Brent Crude",     "commodity"),
    ("gold",       "GC=F",       "Gold",            "commodity"),
    ("dxy",        "DX=F",       "Dollar Index",    "rates"),
]

# ── Plain-English context generators ─────────────────────────────────────────

def _vix_context(val: float, chg_1m: Optional[float]) -> str:
    if val < 13:
        return "Complacency — markets pricing in very little risk"
    if val < 18:
        return "Calm — normal market conditions"
    if val < 25:
        return "Elevated fear — hedging demand rising"
    return "High fear — significant uncertainty in the market"

def _yield_context(val: float, chg_1m: Optional[float]) -> str:
    trend = ""
    if chg_1m is not None:
        trend = " · rising, equity headwind" if chg_1m > 5 else " · falling, equity tailwind" if chg_1m < -5 else ""
    if val < 3.5:
        return f"Low rates — supportive for equities{trend}"
    if val < 4.5:
        return f"Moderate rates — balanced outlook{trend}"
    return f"High rates — valuation pressure on equities{trend}"

def _usdinr_context(val: float, chg_1m: Optional[float]) -> str:
    if chg_1m is None:
        return "Rupee rate vs US dollar"
    if chg_1m > 1.5:
        return "Rupee weakening — potential FII outflow pressure"
    if chg_1m < -1.5:
        return "Rupee strengthening — supportive for FII inflows"
    return "Rupee stable — neutral FII impact"

def _crude_context(val: float, chg_1m: Optional[float]) -> str:
    if chg_1m is None:
        return "Brent crude oil price"
    if chg_1m > 8:
        return "Crude surging — cost pressure, India import bill rises"
    if chg_1m > 3:
        return "Crude rising — mild inflationary pressure"
    if chg_1m < -8:
        return "Crude falling sharply — relief for India's import bill"
    if chg_1m < -3:
        return "Crude easing — positive for India's current account"
    return "Crude range-bound — neutral impact"

def _gold_context(val: float, chg_1m: Optional[float]) -> str:
    if chg_1m is None:
        return "Gold — safe-haven asset"
    if chg_1m > 5:
        return "Gold surging — risk-off sentiment, flight to safety"
    if chg_1m < -5:
        return "Gold falling — risk appetite returning to equities"
    return "Gold stable — no strong risk-off or risk-on signal"

def _dxy_context(val: float, chg_1m: Optional[float]) -> str:
    if chg_1m is None:
        return "US Dollar Index — global reserve currency strength"
    if chg_1m > 2:
        return "Dollar strengthening — headwind for emerging markets"
    if chg_1m < -2:
        return "Dollar weakening — tailwind for emerging market inflows"
    return "Dollar steady — neutral EM impact"

_CONTEXT_FNS = {
    "india_vix": _vix_context,
    "us_10y":    _yield_context,
    "usd_inr":   _usdinr_context,
    "brent":     _crude_context,
    "gold":      _gold_context,
    "dxy":       _dxy_context,
}

# ── Fetch helpers ─────────────────────────────────────────────────────────────

def _pct_change(series, lookback_bars: int) -> Optional[float]:
    if len(series) < lookback_bars + 1:
        return None
    base = series.iloc[-lookback_bars - 1]
    if base == 0:
        return None
    return round(((series.iloc[-1] - base) / abs(base)) * 100, 2)

def _direction(chg_1m: Optional[float]) -> str:
    if chg_1m is None:
        return "flat"
    if chg_1m > 1:
        return "rising"
    if chg_1m < -1:
        return "falling"
    return "flat"

def _fetch_ticker(key: str, yf_symbol: str, label: str) -> MacroTicker:
    # end must be tomorrow so today's session data is included (yfinance end is exclusive)
    end = date.today() + timedelta(days=1)
    start = end - timedelta(days=101)
    try:
        hist = yf.Ticker(yf_symbol).history(start=start, end=end, interval="1d")
        if hist.empty:
            raise ValueError("empty history")
        closes = hist["Close"].dropna()
        val = round(float(closes.iloc[-1]), 4)
        chg_1w  = _pct_change(closes, 5)
        chg_1m  = _pct_change(closes, 21)
        chg_3m  = _pct_change(closes, 63)
        context_fn = _CONTEXT_FNS.get(key, lambda v, c: label)
        return MacroTicker(
            key=key,
            label=label,
            value=val,
            change_1w_pct=chg_1w,
            change_1m_pct=chg_1m,
            change_3m_pct=chg_3m,
            direction=_direction(chg_1m),
            context=context_fn(val, chg_1m),
        )
    except Exception as exc:
        logger.warning("macro fetch failed for %s: %s", yf_symbol, exc)
        return MacroTicker(
            key=key, label=label,
            value=None, change_1w_pct=None,
            change_1m_pct=None, change_3m_pct=None,
            direction="flat",
            context="Data unavailable",
        )

# ── Public API ────────────────────────────────────────────────────────────────

# key → (yf_symbol, label) lookup
_KEY_META = {key: (sym, label) for key, sym, label, _ in _TICKERS}


def get_macro_snapshot() -> MacroSnapshot:
    cache_key = "macro_snapshot"
    cached = _macro_cache.get(cache_key)
    if cached is not None:
        return cached

    tickers = [_fetch_ticker(key, sym, label) for key, sym, label, _ in _TICKERS]
    snapshot = MacroSnapshot(trade_date=str(date.today()), tickers=tickers)
    _macro_cache.set(cache_key, snapshot)
    return snapshot


def get_macro_ticker_detail(key: str) -> Optional[dict]:
    """Return a single macro ticker with 90-day price history for charting."""
    if key not in _KEY_META:
        return None

    cache_key = f"macro_detail:{key}"
    cached = _macro_cache.get(cache_key)
    if cached is not None:
        return cached

    yf_symbol, label = _KEY_META[key]
    end = date.today() + timedelta(days=1)  # exclusive — include today
    start = end - timedelta(days=131)  # ~90 trading days
    try:
        hist = yf.Ticker(yf_symbol).history(start=start, end=end, interval="1d")
        if hist.empty:
            return None
        closes = hist["Close"].dropna()
        val = round(float(closes.iloc[-1]), 4)
        chg_1w  = _pct_change(closes, 5)
        chg_1m  = _pct_change(closes, 21)
        chg_3m  = _pct_change(closes, 63)
        context_fn = _CONTEXT_FNS.get(key, lambda v, c: label)
        # Last 90 trading days for chart
        history_slice = closes.iloc[-90:]
        result = {
            "key": key,
            "label": label,
            "value": val,
            "change_1w_pct": chg_1w,
            "change_1m_pct": chg_1m,
            "change_3m_pct": chg_3m,
            "direction": _direction(chg_1m),
            "context": context_fn(val, chg_1m),
            "history_dates": [d.strftime("%Y-%m-%d") for d in history_slice.index],
            "history_closes": [round(float(v), 4) for v in history_slice.tolist()],
        }
        _macro_cache.set(cache_key, result, ttl=300)
        return result
    except Exception as exc:
        logger.warning("macro detail fetch failed for %s: %s", key, exc)
        return None
