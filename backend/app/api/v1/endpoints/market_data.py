from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from typing import List, Optional

from app.config import INDICES, settings
from app.models.market import IndexSnapshot, HistoryResponse, OHLCVBar, CPRBar
from app.services.data_providers.yahoo import yahoo_provider
from app.services.cache import market_cache
import ta.trend
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

SNAPSHOT_TTL_SECONDS = 300
HISTORY_TTL_SECONDS = 300
HISTORY_HOURLY_TTL_SECONDS = 60


def _compute_cpr(df) -> list:
    """
    Compute CPR (Central Pivot Range) for each bar using the PREVIOUS bar's H/L/C.
    Returns a list of CPRBar (or None for the first bar which has no prior session).

    Formulas:
      PP      = (H + L + C) / 3                   ← Pivot Point
      BC      = (H + L) / 2                        ← Bottom Central Pivot (raw)
      TC      = 2*PP - BC                          ← Top Central Pivot (raw; may be < BC)
      cpr_low = min(TC, BC)                        ← Lower bound of CPR zone (always ≤ cpr_high)
      cpr_high= max(TC, BC)                        ← Upper bound of CPR zone
      R1      = 2*PP - L                           ← Resistance 1
      R2      = PP + (H - L)                       ← Resistance 2
      R3      = H + 2*(PP - L)                     ← Resistance 3
      S1      = 2*PP - H                           ← Support 1
      S2      = PP - (H - L)                       ← Support 2
      S3      = L - 2*(H - PP)                     ← Support 3

    CPR width (always non-negative):
      width_pct = (cpr_high - cpr_low) / PP * 100
      < 0.3%  → "narrow"  (trending day expected)
      0.3-0.7 → "moderate"
      > 0.7%  → "wide"    (sideways / range day expected)

    Virgin CPR for bar i:
      True if bar i's H/L range never touched the CPR zone [cpr_low, cpr_high].
      i.e., the session's High < cpr_low  OR  the session's Low > cpr_high.
    """
    result = [None]  # first bar has no prior session

    for i in range(1, len(df)):
        prev = df.iloc[i - 1]
        h = float(prev["High"])
        l = float(prev["Low"])
        c = float(prev["Close"])

        pp = (h + l + c) / 3
        bc = (h + l) / 2
        tc = 2 * pp - bc

        # Normalise: cpr_low ≤ cpr_high regardless of session direction
        cpr_low  = min(tc, bc)
        cpr_high = max(tc, bc)

        r1 = 2 * pp - l
        r2 = pp + (h - l)
        r3 = h + 2 * (pp - l)

        s1 = 2 * pp - h
        s2 = pp - (h - l)
        s3 = l - 2 * (h - pp)

        # Width is always positive
        width_pct = round((cpr_high - cpr_low) / pp * 100, 4) if pp > 0 else 0.0
        if width_pct < 0.3:
            width_signal = "narrow"
        elif width_pct < 0.7:
            width_signal = "moderate"
        else:
            width_signal = "wide"

        # Virgin CPR: did the current session's H/L touch the CPR zone?
        curr = df.iloc[i]
        curr_high = float(curr["High"])
        curr_low  = float(curr["Low"])
        is_virgin = (curr_high < cpr_low) or (curr_low > cpr_high)

        result.append(CPRBar(
            pp=round(pp, 4),
            tc=round(tc, 4),
            bc=round(bc, 4),
            cpr_low=round(cpr_low, 4),
            cpr_high=round(cpr_high, 4),
            r1=round(r1, 4),
            r2=round(r2, 4),
            r3=round(r3, 4),
            s1=round(s1, 4),
            s2=round(s2, 4),
            s3=round(s3, 4),
            width_pct=width_pct,
            width_signal=width_signal,
            is_virgin=is_virgin,
        ))

    return result


def _compute_cpr_hourly(df_hourly) -> list:
    """
    Compute CPR for hourly bars using the PREVIOUS trading day's H/L/C.
    Each hourly bar within a session shares the same CPR (derived from yesterday's H/L/C).
    Returns a list of CPRBar (or None for bars whose prior trading day is unknown).
    """
    import pandas as pd

    if df_hourly.empty:
        return []

    # Normalise index to date (handles both tz-aware and tz-naive)
    idx = df_hourly.index
    try:
        bar_dates = idx.normalize().date
    except AttributeError:
        bar_dates = [ts.date() for ts in idx]

    # Build daily H/L/C per trading date
    daily: dict = {}
    for i, (ts, row) in enumerate(df_hourly.iterrows()):
        d = bar_dates[i]
        if d not in daily:
            daily[d] = {"H": float(row["High"]), "L": float(row["Low"]), "C": float(row["Close"])}
        else:
            daily[d]["H"] = max(daily[d]["H"], float(row["High"]))
            daily[d]["L"] = min(daily[d]["L"], float(row["Low"]))
            daily[d]["C"] = float(row["Close"])  # last close of the day

    sorted_dates = sorted(daily.keys())
    date_to_prev: dict = {}
    for i, d in enumerate(sorted_dates):
        if i > 0:
            prev = daily[sorted_dates[i - 1]]
            date_to_prev[d] = (prev["H"], prev["L"], prev["C"])

    result = []
    for i, (ts, row) in enumerate(df_hourly.iterrows()):
        bar_date = bar_dates[i]
        if bar_date not in date_to_prev:
            result.append(None)
            continue

        h, l, c = date_to_prev[bar_date]
        pp = (h + l + c) / 3
        bc = (h + l) / 2
        tc = 2 * pp - bc

        cpr_low  = min(tc, bc)
        cpr_high = max(tc, bc)

        r1 = 2 * pp - l
        r2 = pp + (h - l)
        r3 = h + 2 * (pp - l)

        s1 = 2 * pp - h
        s2 = pp - (h - l)
        s3 = l - 2 * (h - pp)

        width_pct = round((cpr_high - cpr_low) / pp * 100, 4) if pp > 0 else 0.0
        if width_pct < 0.3:
            width_signal = "narrow"
        elif width_pct < 0.7:
            width_signal = "moderate"
        else:
            width_signal = "wide"

        curr_high = float(row["High"])
        curr_low  = float(row["Low"])
        is_virgin = (curr_high < cpr_low) or (curr_low > cpr_high)

        result.append(CPRBar(
            pp=round(pp, 4),
            tc=round(tc, 4),
            bc=round(bc, 4),
            cpr_low=round(cpr_low, 4),
            cpr_high=round(cpr_high, 4),
            r1=round(r1, 4),
            r2=round(r2, 4),
            r3=round(r3, 4),
            s1=round(s1, 4),
            s2=round(s2, 4),
            s3=round(s3, 4),
            width_pct=width_pct,
            width_signal=width_signal,
            is_virgin=is_virgin,
        ))

    return result


def _build_snapshot(symbol: str) -> Optional[IndexSnapshot]:
    cache_key = f"snapshot:{symbol}"
    cached = market_cache.get(cache_key)
    if cached is not None:
        return cached

    config = INDICES[symbol]
    snap = yahoo_provider.get_snapshot(config.ticker)
    if snap is None:
        return None

    # 30-day spark data (covers both 1-week and 30-day performance tabs)
    spark_df = yahoo_provider.get_history(config.ticker, period_days=30)
    spark_closes = [round(float(v), 4) for v in spark_df["Close"].tolist()] if not spark_df.empty else []
    spark_dates = [d.strftime("%Y-%m-%d") for d in spark_df.index.tolist()] if not spark_df.empty else []

    trade_date = snap["trade_date"]
    if hasattr(trade_date, "strftime"):
        trade_date_str = trade_date.strftime("%Y-%m-%d")
    else:
        trade_date_str = str(trade_date)[:10]
    prev_trade_date = snap.get("prev_trade_date")
    if hasattr(prev_trade_date, "strftime"):
        prev_trade_date_str = prev_trade_date.strftime("%Y-%m-%d")
    elif prev_trade_date is not None:
        prev_trade_date_str = str(prev_trade_date)[:10]
    else:
        prev_trade_date_str = None

    last_close = snap["last_close"]
    prev_close = snap["prev_close"]
    change_pts = round(last_close - prev_close, 4)
    change_pct = round((last_close - prev_close) / prev_close * 100, 4) if prev_close else 0.0

    result = IndexSnapshot(
        symbol=symbol,
        name=config.name,
        currency=config.currency,
        timezone=config.timezone,
        note=config.note,
        tradingview_url=config.tradingview_url,
        last_close=round(last_close, 4),
        prev_close=round(prev_close, 4),
        open=round(snap["open"], 4),
        high=round(snap["high"], 4),
        low=round(snap["low"], 4),
        volume=snap["volume"],
        change_pts=change_pts,
        change_pct=change_pct,
        trade_date=trade_date_str,
        prev_trade_date=prev_trade_date_str,
        last_updated=datetime.utcnow(),
        spark_closes=spark_closes,
        spark_dates=spark_dates,
    )
    market_cache.set(cache_key, result, ttl=SNAPSHOT_TTL_SECONDS)
    return result


def _build_stock_snapshot(ticker: str) -> Optional[IndexSnapshot]:
    symbol = ticker.upper()
    cache_key = f"snapshot:stock:{symbol}"
    cached = market_cache.get(cache_key)
    if cached is not None:
        return cached

    snap = yahoo_provider.get_snapshot(symbol)
    if snap is None:
        return None

    meta = yahoo_provider.get_asset_metadata(symbol)

    spark_df = yahoo_provider.get_history(symbol, period_days=30)
    spark_closes = [round(float(v), 4) for v in spark_df["Close"].tolist()] if not spark_df.empty else []
    spark_dates = [d.strftime("%Y-%m-%d") for d in spark_df.index.tolist()] if not spark_df.empty else []

    trade_date = snap["trade_date"]
    if hasattr(trade_date, "strftime"):
        trade_date_str = trade_date.strftime("%Y-%m-%d")
    else:
        trade_date_str = str(trade_date)[:10]
    prev_trade_date = snap.get("prev_trade_date")
    if hasattr(prev_trade_date, "strftime"):
        prev_trade_date_str = prev_trade_date.strftime("%Y-%m-%d")
    elif prev_trade_date is not None:
        prev_trade_date_str = str(prev_trade_date)[:10]
    else:
        prev_trade_date_str = None

    last_close = snap["last_close"]
    prev_close = snap["prev_close"]
    change_pts = round(last_close - prev_close, 4)
    change_pct = round((last_close - prev_close) / prev_close * 100, 4) if prev_close else 0.0

    result = IndexSnapshot(
        symbol=symbol,
        name=meta.get("name", symbol),
        currency=meta.get("currency", "USD"),
        timezone=meta.get("timezone", "America/New_York"),
        note="",
        tradingview_url="",
        last_close=round(last_close, 4),
        prev_close=round(prev_close, 4),
        open=round(snap["open"], 4),
        high=round(snap["high"], 4),
        low=round(snap["low"], 4),
        volume=snap["volume"],
        change_pts=change_pts,
        change_pct=change_pct,
        trade_date=trade_date_str,
        prev_trade_date=prev_trade_date_str,
        last_updated=datetime.utcnow(),
        spark_closes=spark_closes,
        spark_dates=spark_dates,
    )
    market_cache.set(cache_key, result, ttl=SNAPSHOT_TTL_SECONDS)
    return result


@router.get("/indices", response_model=List[IndexSnapshot])
async def get_all_indices():
    """Return snapshot data for all 5 indices."""
    results = []
    errors = []
    for symbol in INDICES:
        try:
            snap = _build_snapshot(symbol)
            if snap:
                results.append(snap)
        except Exception as e:
            errors.append(f"{symbol}: {e}")
            logger.error(f"Error fetching {symbol}: {e}")

    if not results:
        raise HTTPException(status_code=503, detail="Failed to fetch any market data")
    return results


@router.get("/indices/{symbol}", response_model=IndexSnapshot)
async def get_index(symbol: str):
    """Return snapshot for a single index."""
    symbol = symbol.upper()
    if symbol not in INDICES:
        raise HTTPException(status_code=404, detail=f"Index '{symbol}' not found")
    snap = _build_snapshot(symbol)
    if snap is None:
        raise HTTPException(status_code=503, detail=f"Failed to fetch data for {symbol}")
    return snap


# days_back and TTL per intraday interval
_INTRADAY_CONFIG = {
    "5m":  {"days_back": 5,  "ttl": 30},
    "15m": {"days_back": 15, "ttl": 60},
    "1h":  {"days_back": 30, "ttl": 60},
}


@router.get("/indices/{symbol}/history", response_model=HistoryResponse)
async def get_history(symbol: str, interval: str = Query("1d", pattern="^(1d|1h|15m|5m)$")):
    """Return OHLCV bars + SMA overlays + CPR. interval: 1d (90 days), 1h (30 days), 15m (15 days), 5m (5 days)."""
    symbol = symbol.upper()
    if symbol not in INDICES:
        raise HTTPException(status_code=404, detail=f"Index '{symbol}' not found")

    cache_key = f"history:{symbol}:{interval}"
    cached = market_cache.get(cache_key)
    if cached is not None:
        return cached

    config = INDICES[symbol]

    if interval in _INTRADAY_CONFIG:
        cfg = _INTRADAY_CONFIG[interval]
        df = yahoo_provider.get_history_intraday(config.ticker, interval=interval, days_back=cfg["days_back"])
        if df.empty:
            raise HTTPException(status_code=503, detail=f"No {interval} history data available for {symbol}")
        cpr = _compute_cpr_hourly(df)  # session-based CPR works for all intraday intervals
        ttl = cfg["ttl"]
    else:
        df = yahoo_provider.get_history(config.ticker, period_days=settings.history_days)
        if df.empty:
            raise HTTPException(status_code=503, detail=f"No history data available for {symbol}")
        cpr = _compute_cpr(df)
        ttl = HISTORY_TTL_SECONDS

    bars = []
    for ts, row in df.iterrows():
        bars.append(OHLCVBar(
            timestamp=int(ts.timestamp() * 1000),
            open=round(float(row["Open"]), 4),
            high=round(float(row["High"]), 4),
            low=round(float(row["Low"]), 4),
            close=round(float(row["Close"]), 4),
            volume=float(row["Volume"]),
        ))

    close = df["Close"]
    sma20_s = ta.trend.SMAIndicator(close=close, window=20).sma_indicator()
    sma50_s = ta.trend.SMAIndicator(close=close, window=50).sma_indicator() if len(close) >= 50 else None
    sma200_s = ta.trend.SMAIndicator(close=close, window=200).sma_indicator() if len(close) >= 200 else None

    def to_list(s):
        if s is None:
            return [None] * len(close)
        return [round(float(v), 4) if not (v != v) else None for v in s.tolist()]

    result = HistoryResponse(
        symbol=symbol,
        bars=bars,
        sma20=to_list(sma20_s),
        sma50=to_list(sma50_s),
        sma200=to_list(sma200_s),
        cpr=cpr,
    )
    market_cache.set(cache_key, result, ttl=ttl)
    return result


@router.get("/stocks/{ticker}", response_model=IndexSnapshot)
async def get_stock_snapshot(ticker: str):
    """Return snapshot for an arbitrary stock ticker."""
    snap = _build_stock_snapshot(ticker)
    if snap is None:
        raise HTTPException(status_code=503, detail=f"Failed to fetch data for {ticker.upper()}")
    return snap


@router.get("/stocks/{ticker}/history", response_model=HistoryResponse)
async def get_stock_history(ticker: str, interval: str = Query("1d", pattern="^(1d|1h|15m|5m)$")):
    """Return OHLCV bars + SMA overlays + CPR for stock charting. interval: 1d, 1h, 15m, 5m."""
    symbol = ticker.upper()
    cache_key = f"history:stock:{symbol}:{interval}"
    cached = market_cache.get(cache_key)
    if cached is not None:
        return cached

    if interval in _INTRADAY_CONFIG:
        cfg = _INTRADAY_CONFIG[interval]
        df = yahoo_provider.get_history_intraday(symbol, interval=interval, days_back=cfg["days_back"])
        if df.empty:
            raise HTTPException(status_code=503, detail=f"No {interval} history data available for {symbol}")
        cpr = _compute_cpr_hourly(df)
        ttl = cfg["ttl"]
    else:
        df = yahoo_provider.get_history(symbol, period_days=settings.history_days)
        if df.empty:
            raise HTTPException(status_code=503, detail=f"No history data available for {symbol}")
        cpr = _compute_cpr(df)
        ttl = HISTORY_TTL_SECONDS

    bars = []
    for ts, row in df.iterrows():
        bars.append(OHLCVBar(
            timestamp=int(ts.timestamp() * 1000),
            open=round(float(row["Open"]), 4),
            high=round(float(row["High"]), 4),
            low=round(float(row["Low"]), 4),
            close=round(float(row["Close"]), 4),
            volume=float(row["Volume"]),
        ))

    close = df["Close"]
    sma20_s = ta.trend.SMAIndicator(close=close, window=20).sma_indicator()
    sma50_s = ta.trend.SMAIndicator(close=close, window=50).sma_indicator() if len(close) >= 50 else None
    sma200_s = ta.trend.SMAIndicator(close=close, window=200).sma_indicator() if len(close) >= 200 else None

    def to_list(s):
        if s is None:
            return [None] * len(close)
        return [round(float(v), 4) if not (v != v) else None for v in s.tolist()]

    result = HistoryResponse(
        symbol=symbol,
        bars=bars,
        sma20=to_list(sma20_s),
        sma50=to_list(sma50_s),
        sma200=to_list(sma200_s),
        cpr=cpr,
    )
    market_cache.set(cache_key, result, ttl=ttl)
    return result
