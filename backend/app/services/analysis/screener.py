"""Stock screener service — batch-downloads OHLCV for all constituents in a single
yf.download() call, computes all technical indicators locally, then applies
condition-based filtering.  This avoids per-symbol API calls and the associated
Yahoo Finance rate-limit errors.
"""
import gc
import logging
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import ta
import yfinance as yf

from app.models.screener import (
    SCREENER_FIELDS,
    OP_LABELS,
    AvailableField,
    ScreenerCondition,
    ScreenerCriteria,
    ScreenerFieldsResponse,
    ScreenerPreset,
    ScreenerResult,
    ScreenerRow,
    condition_display_label,
)
from app.services.sector_service import sector_service
from app.services.cache import screener_cache

logger = logging.getLogger(__name__)

_BANK_INDUSTRIES = {"Banks - Regional", "Banks - Diversified"}
_FUNDAMENTAL_FIELDS = {"market_cap_cr", "pe_ratio"}
_US_INDEX_SYMBOLS = {"SP500", "NDX100", "DJI30"}

# Interval → look-back days (must be generous enough for 200-period indicators)
_LOOKBACK: Dict[str, int] = {
    "1d":  420,
    "1h":   60,
    "15m":  59,   # yfinance hard limit for sub-hour is 60 calendar days
    "5m":   59,
}

# Download symbols in batches to stay well under Yahoo's rate limits
_BATCH_SIZE = 100
_BATCH_SLEEP = 0.3   # seconds between batches


# ── Constituent fetcher ───────────────────────────────────────────────────────

def _get_screener_constituents(index_symbol: str) -> list:
    try:
        constituents = sector_service.get_screener_constituents(index_symbol)
        if index_symbol == "NSEBANK":
            constituents = [c for c in constituents if c.get("industry") in _BANK_INDUSTRIES]
        return constituents
    except Exception as exc:
        logger.warning(f"Failed to get constituents for {index_symbol}: {exc}")
        return []


# ── Built-in presets ──────────────────────────────────────────────────────────

def _preset(pid, name, tf, desc, conditions, category="Trend Following"):
    chips = [condition_display_label(c.lhs, c.op, c.rhs_value, c.rhs_field) for c in conditions]
    return ScreenerPreset(id=pid, name=name, timeframe=tf, category=category, description=desc, conditions=conditions, filter_chips=chips)


# ─── TREND FOLLOWING presets ──────────────────────────────────────────────────

PRESETS: List[ScreenerPreset] = [
    _preset("swing_pullback", "Pullback in Uptrend", "swing",
            "Stocks in a strong uptrend that have pulled back — optimal lower-risk swing entry",
            [
                ScreenerCondition(lhs="close",         op="gt",  rhs_field="ema200"),
                ScreenerCondition(lhs="ema50",         op="gt",  rhs_field="ema200"),
                ScreenerCondition(lhs="macd",          op="gt",  rhs_value=0.0),
                ScreenerCondition(lhs="rsi",           op="gte", rhs_value=40.0),
                ScreenerCondition(lhs="rsi",           op="lte", rhs_value=58.0),
                ScreenerCondition(lhs="market_cap_cr", op="gte", rhs_value=5000.0),
            ],
            category="Trend Following"),

    _preset("intraday_momentum", "Day Trade Momentum", "intraday",
            "Stocks with short-term breakout momentum suitable for same-day trades",
            [
                ScreenerCondition(lhs="rsi",  op="gte", rhs_value=60.0),
                ScreenerCondition(lhs="rsi",  op="lte", rhs_value=75.0),
                ScreenerCondition(lhs="macd", op="gt",  rhs_value=0.0),
                ScreenerCondition(lhs="rvol", op="gte", rhs_value=1.5),
                ScreenerCondition(lhs="adx",  op="gte", rhs_value=20.0),
            ],
            category="Trend Following"),

    _preset("swing_uptrend", "Swing Uptrend", "swing",
            "Stocks in confirmed uptrends for 1–4 week swing trades",
            [
                ScreenerCondition(lhs="ema20", op="gt",  rhs_field="ema50"),
                ScreenerCondition(lhs="rsi",   op="gte", rhs_value=55.0),
                ScreenerCondition(lhs="rsi",   op="lte", rhs_value=75.0),
                ScreenerCondition(lhs="macd",  op="gt",  rhs_value=0.0),
                ScreenerCondition(lhs="close", op="gt",  rhs_field="sma50"),
            ],
            category="Trend Following"),

    _preset("power_breakout", "Power Breakout", "swing",
            "Stocks breaking out with strong momentum — EMA20>EMA50, RSI>60, MACD+",
            [
                ScreenerCondition(lhs="ema20",        op="gt",  rhs_field="ema50"),
                ScreenerCondition(lhs="rsi",           op="gte", rhs_value=60.0),
                ScreenerCondition(lhs="macd",          op="gt",  rhs_value=0.0),
                ScreenerCondition(lhs="market_cap_cr", op="gte", rhs_value=5000.0),
            ],
            category="Trend Following"),

    _preset("medium_growth", "Medium-Term Growth", "medium",
            "Stocks in structural uptrends for 3–12 month positions",
            [
                ScreenerCondition(lhs="close", op="gt",  rhs_field="sma200"),
                ScreenerCondition(lhs="rsi",   op="gte", rhs_value=50.0),
                ScreenerCondition(lhs="rsi",   op="lte", rhs_value=70.0),
                ScreenerCondition(lhs="macd",  op="gt",  rhs_value=0.0),
                ScreenerCondition(lhs="adx",   op="gte", rhs_value=20.0),
            ],
            category="Trend Following"),

    _preset("long_compounder", "Quality Compounder", "long",
            "High-quality stocks with sustained outperformance for multi-year holding",
            [
                ScreenerCondition(lhs="close",             op="gt",  rhs_field="sma200"),
                ScreenerCondition(lhs="ema20",             op="gt",  rhs_field="ema50"),
                ScreenerCondition(lhs="rsi",               op="gte", rhs_value=40.0),
                ScreenerCondition(lhs="rsi",               op="lte", rhs_value=65.0),
                ScreenerCondition(lhs="yearly_return_pct", op="gte", rhs_value=15.0),
            ],
            category="Trend Following"),

    # ── New: Golden Cross (long-term MA crossover) ─────────────────────────────
    _preset("trend_golden_cross", "Golden Cross Uptrend", "long",
            "Stocks where the 50-day average has crossed above the 200-day average — the classic long-term bullish signal",
            [
                ScreenerCondition(lhs="sma50",  op="gt",  rhs_field="sma200"),
                ScreenerCondition(lhs="close",  op="gt",  rhs_field="sma200"),
                ScreenerCondition(lhs="adx",    op="gte", rhs_value=22.0),
                ScreenerCondition(lhs="rsi",    op="gte", rhs_value=50.0),
                ScreenerCondition(lhs="rsi",    op="lte", rhs_value=70.0),
                ScreenerCondition(lhs="rvol",   op="gte", rhs_value=1.2),
            ],
            category="Trend Following"),

    # ── New: Near 52-Week High Breakout ────────────────────────────────────────
    _preset("trend_52w_breakout", "Near 52-Week High", "swing",
            "Stocks within 2% of their 52-week high with above-average volume — breakout candidates with strong relative strength",
            [
                ScreenerCondition(lhs="hi52w_pct", op="gte", rhs_value=-2.0),
                ScreenerCondition(lhs="rvol",      op="gte", rhs_value=1.5),
                ScreenerCondition(lhs="rsi",       op="gte", rhs_value=50.0),
                ScreenerCondition(lhs="rsi",       op="lte", rhs_value=68.0),
                ScreenerCondition(lhs="adx",       op="gte", rhs_value=18.0),
            ],
            category="Trend Following"),

    # ── New: 12-Month Momentum Screen ─────────────────────────────────────────
    _preset("trend_momentum_12m", "12-Month Momentum", "medium",
            "Stocks with sustained 12-month outperformance above the 200-day average — the cross-sectional momentum strategy",
            [
                ScreenerCondition(lhs="yearly_return_pct", op="gte", rhs_value=15.0),
                ScreenerCondition(lhs="close",             op="gt",  rhs_field="sma200"),
                ScreenerCondition(lhs="rsi",               op="gte", rhs_value=45.0),
                ScreenerCondition(lhs="rsi",               op="lte", rhs_value=72.0),
                ScreenerCondition(lhs="adx",               op="gte", rhs_value=15.0),
                ScreenerCondition(lhs="rvol",              op="gte", rhs_value=1.0),
            ],
            category="Trend Following"),

    # ─── MEAN REVERSION presets ───────────────────────────────────────────────

    # ── New: RSI Oversold Bounce ───────────────────────────────────────────────
    _preset("mr_rsi_oversold", "Oversold Bounce Setup", "swing",
            "Stocks that have become deeply oversold while remaining in a long-term uptrend — high-probability mean reversion entry",
            [
                ScreenerCondition(lhs="rsi",    op="lte", rhs_value=30.0),
                ScreenerCondition(lhs="close",  op="gt",  rhs_field="sma200"),
                ScreenerCondition(lhs="adx",    op="lte", rhs_value=25.0),
                ScreenerCondition(lhs="bb_pctb",op="lte", rhs_value=0.2),
            ],
            category="Mean Reversion"),

    # ── New: Bollinger Band Lower Touch ───────────────────────────────────────
    _preset("mr_bb_lower_touch", "Bollinger Band Reversal", "swing",
            "Stocks touching the lower Bollinger Band in a non-trending environment — statistically likely to revert to the middle band",
            [
                ScreenerCondition(lhs="close",   op="lte", rhs_field="bb_lower"),
                ScreenerCondition(lhs="adx",     op="lte", rhs_value=22.0),
                ScreenerCondition(lhs="rsi",     op="lte", rhs_value=40.0),
                ScreenerCondition(lhs="rvol",    op="lte", rhs_value=1.0),
            ],
            category="Mean Reversion"),

    # ── New: Consecutive Day Reversal ─────────────────────────────────────────
    _preset("mr_consecutive_reversal", "Multi-Day Pullback Reversal", "short",
            "Stocks with 3 or more consecutive down days in a broader uptrend — short-term mean reversion after exhaustion",
            [
                ScreenerCondition(lhs="consec_red", op="gte", rhs_value=3.0),
                ScreenerCondition(lhs="close",      op="gt",  rhs_field="sma200"),
                ScreenerCondition(lhs="adx",        op="lte", rhs_value=25.0),
                ScreenerCondition(lhs="rsi",        op="lte", rhs_value=45.0),
            ],
            category="Mean Reversion"),

    # ─── HYBRID presets ───────────────────────────────────────────────────────

    # ── New: Breakout Retest Entry ─────────────────────────────────────────────
    _preset("hybrid_breakout_retest", "Breakout Retest Entry", "swing",
            "Stocks that broke out and are now retesting support — combines trend following direction with mean reversion timing for a higher win-rate entry",
            [
                ScreenerCondition(lhs="ema20",  op="gt",  rhs_field="ema50"),
                ScreenerCondition(lhs="close",  op="gt",  rhs_field="ema50"),
                ScreenerCondition(lhs="rsi",    op="gte", rhs_value=45.0),
                ScreenerCondition(lhs="rsi",    op="lte", rhs_value=65.0),
                ScreenerCondition(lhs="macd",   op="gt",  rhs_value=0.0),
            ],
            category="Hybrid"),

    # ── US Market presets ─────────────────────────────────────────────────────

    _preset("us_pullback_uptrend", "US Pullback in Uptrend", "swing",
            "Large-cap US stocks in a confirmed uptrend that have pulled back — lower-risk swing entry",
            [
                ScreenerCondition(lhs="close",        op="gt",  rhs_field="ema200"),
                ScreenerCondition(lhs="ema50",         op="gt",  rhs_field="ema200"),
                ScreenerCondition(lhs="macd",          op="gt",  rhs_value=0.0),
                ScreenerCondition(lhs="rsi",           op="gte", rhs_value=40.0),
                ScreenerCondition(lhs="rsi",           op="lte", rhs_value=58.0),
                ScreenerCondition(lhs="market_cap_b",  op="gte", rhs_value=10.0),
            ],
            category="Trend Following"),

    _preset("us_power_breakout", "US Power Breakout", "swing",
            "US stocks breaking out with strong momentum — EMA20>EMA50, RSI>60, MACD+",
            [
                ScreenerCondition(lhs="ema20",        op="gt",  rhs_field="ema50"),
                ScreenerCondition(lhs="rsi",           op="gte", rhs_value=60.0),
                ScreenerCondition(lhs="macd",          op="gt",  rhs_value=0.0),
                ScreenerCondition(lhs="market_cap_b",  op="gte", rhs_value=10.0),
            ],
            category="Trend Following"),

    _preset("us_golden_cross", "US Golden Cross", "long",
            "US stocks where the 50-day average crossed above the 200-day — classic long-term bullish signal",
            [
                ScreenerCondition(lhs="sma50",  op="gt",  rhs_field="sma200"),
                ScreenerCondition(lhs="close",  op="gt",  rhs_field="sma200"),
                ScreenerCondition(lhs="adx",    op="gte", rhs_value=20.0),
                ScreenerCondition(lhs="rsi",    op="gte", rhs_value=50.0),
                ScreenerCondition(lhs="rsi",    op="lte", rhs_value=70.0),
            ],
            category="Trend Following"),

    _preset("us_52w_breakout", "US Near 52-Week High", "swing",
            "US stocks within 2% of their 52-week high with above-average volume",
            [
                ScreenerCondition(lhs="hi52w_pct", op="gte", rhs_value=-2.0),
                ScreenerCondition(lhs="rvol",      op="gte", rhs_value=1.5),
                ScreenerCondition(lhs="rsi",       op="gte", rhs_value=50.0),
                ScreenerCondition(lhs="rsi",       op="lte", rhs_value=68.0),
            ],
            category="Trend Following"),

    _preset("us_oversold_bounce", "US Oversold Bounce", "swing",
            "Oversold US large-cap stocks with long-term uptrend intact — mean reversion setup",
            [
                ScreenerCondition(lhs="rsi",    op="lte", rhs_value=35.0),
                ScreenerCondition(lhs="close",  op="gt",  rhs_field="sma200"),
                ScreenerCondition(lhs="adx",    op="lte", rhs_value=30.0),
            ],
            category="Mean Reversion"),
]


def get_presets() -> List[ScreenerPreset]:
    return PRESETS


def get_fields() -> ScreenerFieldsResponse:
    fields = [
        AvailableField(id=fid, label=meta["label"], group=meta["group"], price_like=meta["price_like"])
        for fid, meta in SCREENER_FIELDS.items()
    ]
    return ScreenerFieldsResponse(fields=fields, operators=OP_LABELS)


# ── Condition evaluation ──────────────────────────────────────────────────────

def _eval_op(lhs_val: float, op: str, rhs_val: float) -> bool:
    if op == "gt":  return lhs_val >  rhs_val
    if op == "lt":  return lhs_val <  rhs_val
    if op == "gte": return lhs_val >= rhs_val
    if op == "lte": return lhs_val <= rhs_val
    if op == "eq":  return abs(lhs_val - rhs_val) < 0.001
    return False


def _evaluate_conditions_dict(
    ind: Dict[str, Any],
    conditions: List[ScreenerCondition],
) -> Tuple[int, int, List[str]]:
    """Evaluate conditions against a plain indicator dict.  Returns (score, evaluatable, matched_labels)."""
    score = 0
    evaluatable = 0
    matched: List[str] = []
    for cond in conditions:
        lhs_val = ind.get(cond.lhs)
        if lhs_val is None:
            continue
        lhs_val = float(lhs_val)
        if cond.rhs_field:
            rhs_val = ind.get(cond.rhs_field)
            if rhs_val is None:
                continue
            rhs_val = float(rhs_val)
        elif cond.rhs_value is not None:
            rhs_val = cond.rhs_value
        else:
            continue
        evaluatable += 1
        if _eval_op(lhs_val, cond.op, rhs_val):
            score += 1
            matched.append(condition_display_label(cond.lhs, cond.op, cond.rhs_value, cond.rhs_field))
    return score, evaluatable, matched


def _quality(score: int, total: int) -> str:
    if total == 0:
        return "C"
    pct = score / total
    if pct >= 0.8:
        return "A"
    if pct >= 0.5:
        return "B"
    return "C"


# ── Indicator computation ─────────────────────────────────────────────────────

def _safe(v) -> Optional[float]:
    """Convert to float, return None for NaN/None."""
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def _compute_indicators(df: pd.DataFrame, sym: str) -> Optional[Dict[str, Any]]:
    """Compute all screener indicator values from an OHLCV DataFrame."""
    try:
        df = df.dropna(subset=["Close"])
        if len(df) < 30:
            return None

        close  = df["Close"].astype(float)
        high   = df["High"].astype(float)
        low    = df["Low"].astype(float)
        volume = df["Volume"].astype(float)

        last_close = _safe(close.iloc[-1])
        if last_close is None:
            return None

        last_open = _safe(df["Open"].iloc[-1]) if "Open" in df.columns else None
        last_vol  = _safe(volume.iloc[-1])

        prev_close = _safe(close.iloc[-2]) if len(close) >= 2 else last_close
        change     = round(last_close - prev_close, 2) if prev_close else 0
        change_pct = round(change / prev_close * 100, 2) if prev_close else 0

        # Moving averages
        ema20  = _safe(close.ewm(span=20,  adjust=False).mean().iloc[-1])
        ema50  = _safe(close.ewm(span=50,  adjust=False).mean().iloc[-1])
        ema200 = _safe(close.ewm(span=200, adjust=False).mean().iloc[-1]) if len(close) >= 100 else None
        sma20  = _safe(close.rolling(20).mean().iloc[-1])
        sma50  = _safe(close.rolling(50).mean().iloc[-1])
        sma200 = _safe(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else None

        # RSI
        rsi = _safe(ta.momentum.RSIIndicator(close=close, window=14).rsi().iloc[-1])

        # MACD
        macd_obj  = ta.trend.MACD(close=close)
        macd_val  = _safe(macd_obj.macd().iloc[-1])
        macd_hist = _safe(macd_obj.macd_diff().iloc[-1])

        # ATR
        atr_obj = ta.volatility.AverageTrueRange(high=high, low=low, close=close, window=14)
        atr_val = _safe(atr_obj.average_true_range().iloc[-1])
        atr_pct = round(atr_val / last_close * 100, 4) if atr_val and last_close else None

        # Bollinger Bands
        bb_obj   = ta.volatility.BollingerBands(close=close, window=20, window_dev=2)
        bb_upper = _safe(bb_obj.bollinger_hband().iloc[-1])
        bb_lower = _safe(bb_obj.bollinger_lband().iloc[-1])
        bb_mid   = _safe(bb_obj.bollinger_mavg().iloc[-1])
        bb_pctb  = _safe(bb_obj.bollinger_pband().iloc[-1])

        # ADX
        adx_obj  = ta.trend.ADXIndicator(high=high, low=low, close=close, window=14)
        adx      = _safe(adx_obj.adx().iloc[-1])
        plus_di  = _safe(adx_obj.adx_pos().iloc[-1])
        minus_di = _safe(adx_obj.adx_neg().iloc[-1])

        # Relative volume
        avg_vol = _safe(volume.rolling(20).mean().iloc[-1])
        rvol    = round(last_vol / avg_vol, 2) if last_vol and avg_vol and avg_vol > 0 else None

        # 1-year return
        yr_ago     = _safe(close.iloc[-252]) if len(close) >= 252 else None
        yearly_ret = round((last_close - yr_ago) / yr_ago * 100, 2) if yr_ago and yr_ago > 0 else None

        # 52-week high distance (negative = below high, 0 = at high)
        if len(high) >= 252:
            hi52w = float(high.rolling(252).max().iloc[-1])
        else:
            hi52w = float(high.max()) if len(high) > 0 else None
        hi52w_pct = round((last_close - hi52w) / hi52w * 100, 2) if hi52w and hi52w > 0 else None

        # Consecutive red candles (close < open = red candle)
        consec_red = 0
        if "Open" in df.columns:
            opens = df["Open"].astype(float)
            for i in range(len(close) - 1, max(-1, len(close) - 11), -1):
                if close.iloc[i] < opens.iloc[i]:
                    consec_red += 1
                else:
                    break

        return {
            "close":             last_close,
            "open":              last_open,
            "volume":            last_vol,
            "change":            change,
            "change_pct":        change_pct,
            "ema20":             ema20,
            "ema50":             ema50,
            "ema200":            ema200,
            "sma20":             sma20,
            "sma50":             sma50,
            "sma200":            sma200,
            "rsi":               rsi,
            "macd":              macd_val,
            "macd_hist":         macd_hist,
            "atr":               atr_val,
            "atr_pct":           atr_pct,
            "bb_upper":          bb_upper,
            "bb_lower":          bb_lower,
            "bb_middle":         bb_mid,
            "bb_pctb":           bb_pctb,
            "adx":               adx,
            "plus_di":           plus_di,
            "minus_di":          minus_di,
            "rvol":              rvol,
            "yearly_return_pct": yearly_ret,
            "hi52w_pct":         hi52w_pct,
            "consec_red":        float(consec_red),
        }
    except Exception as exc:
        logger.debug(f"Indicator compute failed for {sym}: {exc}")
        return None


def _extract_sym_df(raw: pd.DataFrame, sym: str, n_symbols: int) -> Optional[pd.DataFrame]:
    """Extract single-symbol DataFrame from a possibly multi-level download result."""
    if n_symbols == 1:
        return raw

    # yfinance group_by='ticker' → top level = ticker
    if isinstance(raw.columns, pd.MultiIndex):
        lvl0 = raw.columns.get_level_values(0).unique().tolist()
        if sym in lvl0:
            df = raw[sym]
            if isinstance(df, pd.DataFrame):
                return df
        # Fallback: metric-first MultiIndex (older yfinance behaviour)
        lvl1 = raw.columns.get_level_values(1).unique().tolist()
        if sym in lvl1:
            df = raw.xs(sym, axis=1, level=1)
            if isinstance(df, pd.DataFrame):
                return df
    return None


def _batch_fetch_indicators(symbols: List[str], interval: str) -> Dict[str, Dict[str, Any]]:
    """Batch-download OHLCV for all symbols and compute indicators.

    Uses yf.download() in batches of _BATCH_SIZE, which makes ~5 API calls
    for 500 symbols instead of 500 individual calls — avoids rate-limit errors.
    """
    lookback_days = _LOOKBACK.get(interval, 420)
    end   = datetime.now()
    start = end - timedelta(days=lookback_days)

    # Deduplicate while preserving order
    seen: set = set()
    deduped = [s for s in symbols if not (s in seen or seen.add(s))]

    result: Dict[str, Dict] = {}

    for batch_start in range(0, len(deduped), _BATCH_SIZE):
        batch = deduped[batch_start: batch_start + _BATCH_SIZE]
        try:
            raw = yf.download(
                tickers=batch,
                start=start.strftime("%Y-%m-%d"),
                end=end.strftime("%Y-%m-%d"),
                interval=interval,
                group_by="ticker",
                auto_adjust=True,
                progress=False,
                threads=True,
            )
        except Exception as exc:
            logger.warning(f"Batch yf.download failed (batch {batch_start}): {exc}")
            if batch_start + _BATCH_SIZE < len(deduped):
                time.sleep(1)
            continue

        if raw is None or raw.empty:
            continue

        for sym in batch:
            sym_df = _extract_sym_df(raw, sym, len(batch))
            if sym_df is None or sym_df.empty:
                continue
            ind = _compute_indicators(sym_df, sym)
            if ind is not None:
                result[sym] = ind

        # Polite delay between batches
        if batch_start + _BATCH_SIZE < len(deduped):
            time.sleep(_BATCH_SLEEP)

    logger.info(
        f"Batch indicators: {len(result)}/{len(deduped)} symbols computed "
        f"in {math.ceil(len(deduped) / _BATCH_SIZE)} download calls"
    )
    gc.collect()  # reclaim memory from large intermediate DataFrames
    return result


# ── Fundamentals (market cap / PE) ───────────────────────────────────────────

_NEEDS_EXTRAS_FIELDS = {"market_cap_cr", "market_cap_b", "pe_ratio"}


def _fetch_extras(symbol: str, need_market_cap: bool, need_pe: bool, is_us: bool = False) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if not need_market_cap and not need_pe:
        return out
    try:
        fi = yf.Ticker(symbol).fast_info
        if need_market_cap:
            mc = getattr(fi, "market_cap", None)
            if mc and mc > 0:
                if is_us:
                    out["market_cap_b"] = round(mc / 1e9, 2)
                else:
                    out["market_cap_cr"] = round(mc / 1e7, 2)
    except Exception:
        pass
    if need_pe:
        try:
            info = yf.Ticker(symbol).info
            pe = info.get("trailingPE")
            if pe and pe > 0:
                out["pe_ratio"] = round(float(pe), 2)
        except Exception:
            pass
    return out


def _fetch_extras_batch(
    symbols: List[str],
    need_market_cap: bool,
    need_pe: bool,
    is_us: bool = False,
) -> Dict[str, Dict[str, Any]]:
    """Fetch market-cap / PE for a (small) set of symbols in parallel."""
    if not symbols or (not need_market_cap and not need_pe):
        return {}
    out: Dict[str, Dict] = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(_fetch_extras, s, need_market_cap, need_pe, is_us): s for s in symbols}
        for fut in as_completed(futures):
            sym = futures[fut]
            try:
                out[sym] = fut.result()
            except Exception:
                out[sym] = {}
    return out


# ── Public scan entry point ───────────────────────────────────────────────────

def run_scan(criteria: ScreenerCriteria) -> ScreenerResult:
    cache_key = f"screener3:{criteria.index_symbol}:{criteria.model_dump_json()}"
    cached = screener_cache.get(cache_key)
    if cached:
        return cached

    constituents = _get_screener_constituents(criteria.index_symbol)
    conditions   = criteria.conditions
    interval     = criteria.interval or "1d"
    is_us        = criteria.index_symbol in _US_INDEX_SYMBOLS

    # Determine which extras are needed (avoid slow PE/mktcap fetch unless required)
    lhs_fields  = {c.lhs for c in conditions}
    rhs_fields  = {c.rhs_field for c in conditions if c.rhs_field}
    all_fields  = lhs_fields | rhs_fields
    need_mktcap = ("market_cap_cr" in all_fields) or ("market_cap_b" in all_fields)
    need_pe     = "pe_ratio" in all_fields
    has_fundamental_cond = need_mktcap or need_pe

    # Split conditions into technical vs fundamental for 2-pass filtering
    tech_conditions  = [c for c in conditions if c.lhs not in _NEEDS_EXTRAS_FIELDS
                        and (c.rhs_field is None or c.rhs_field not in _NEEDS_EXTRAS_FIELDS)]
    fund_conditions  = [c for c in conditions if c.lhs in _NEEDS_EXTRAS_FIELDS
                        or c.rhs_field in _NEEDS_EXTRAS_FIELDS]

    symbols = [c["symbol"] for c in constituents]
    sym_to_constituent = {c["symbol"]: c for c in constituents}

    # ── Batch indicator cache (reuse within the 30-min screener window) ──────
    batch_cache_key = f"batch_ind:{criteria.index_symbol}:{interval}"
    indicators: Dict[str, Dict] = screener_cache.get(batch_cache_key) or {}
    if not indicators:
        indicators = _batch_fetch_indicators(symbols, interval)
        if indicators:
            screener_cache.set(batch_cache_key, indicators, ttl=1800)

    # ── Pass 1: technical conditions ─────────────────────────────────────────
    tech_pass: List[Tuple[str, Dict, int, int, List[str]]] = []
    for sym, ind in indicators.items():
        if sym not in sym_to_constituent:
            continue
        if tech_conditions:
            score, evaluatable, matched = _evaluate_conditions_dict(ind, tech_conditions)
            if evaluatable == 0 or score < evaluatable:
                continue
        else:
            score, evaluatable, matched = 0, 0, []
        tech_pass.append((sym, ind, score, evaluatable, matched))

    # ── Pass 2: fundamental conditions (only for tech-passing stocks) ─────────
    if has_fundamental_cond and fund_conditions:
        passing_syms = [sym for sym, *_ in tech_pass]
        extras_map   = _fetch_extras_batch(passing_syms, need_mktcap, need_pe, is_us=is_us)

        final_pass: List[Tuple[str, Dict, int, int, List[str]]] = []
        for sym, ind, tech_score, tech_eval, tech_matched in tech_pass:
            extras = extras_map.get(sym, {})
            combined = {**ind, **extras}
            # Re-evaluate ALL conditions against combined data (technical + fundamental)
            full_score, full_eval, full_matched = _evaluate_conditions_dict(combined, conditions)
            if conditions and (full_eval == 0 or full_score < full_eval):
                continue
            final_pass.append((sym, {**ind, **extras}, full_score, full_eval, full_matched))
    else:
        # No fundamentals — tech pass is the final pass
        if conditions:
            final_pass = tech_pass
        else:
            # Browsing mode (no conditions): include everything with indicator data
            final_pass = [(sym, ind, 0, 0, []) for sym, ind in indicators.items()
                          if sym in sym_to_constituent]

    # ── Build ScreenerRows ────────────────────────────────────────────────────
    rows: List[ScreenerRow] = []
    total_cond = len(conditions)

    for sym, ind, score, evaluatable, matched in final_pass:
        c = sym_to_constituent.get(sym, {})
        rows.append(ScreenerRow(
            symbol=sym,
            name=c.get("name", sym),
            sector=c.get("sector", ""),
            price=round(ind["close"], 2),
            open_price=round(ind["open"], 2) if ind.get("open") else None,
            change=ind.get("change"),
            change_pct=ind.get("change_pct"),
            volume=ind.get("volume"),
            market_cap_cr=ind.get("market_cap_cr"),
            market_cap_b=ind.get("market_cap_b"),
            pe_ratio=ind.get("pe_ratio"),
            ema20=ind.get("ema20"),
            ema50=ind.get("ema50"),
            ema200=ind.get("ema200"),
            sma50=ind.get("sma50"),
            sma200=ind.get("sma200"),
            rsi=ind.get("rsi"),
            adx=ind.get("adx"),
            macd=ind.get("macd"),
            rvol=ind.get("rvol"),
            atr=ind.get("atr"),
            atr_pct=ind.get("atr_pct"),
            score=score,
            total_conditions=total_cond,
            matched=matched,
            quality=_quality(score, total_cond),
        ))

    rows.sort(key=lambda r: (-r.score, r.symbol))

    result = ScreenerResult(
        index_symbol=criteria.index_symbol,
        preset_id=criteria.preset_id,
        total_scanned=len(constituents),
        total_matched=len(rows),
        rows=rows,
        scanned_at=datetime.utcnow().isoformat(),
    )
    screener_cache.set(cache_key, result)
    return result
