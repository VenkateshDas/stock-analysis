import datetime
import logging
from typing import List, Optional, Tuple

import pandas as pd
import pytz

from app.config import INDICES, INDEX_PROXY_ETFS
from app.models.opening_range import (
    GapInfo,
    HistoricalGapDay,
    OHOLSignal,
    OpeningRangeResult,
)
from app.services.cache import opening_range_cache
from app.services.data_providers.yahoo import yahoo_provider

logger = logging.getLogger(__name__)

# Symbols where we prefer an ETF proxy for intraday 5-minute bars
_FORCED_INTRADAY_PROXIES = {
    "GSPC": ("SPY", "SPY (proxy for ^GSPC)"),
    "NDX": ("QQQ", "QQQ (proxy for ^NDX)"),
    "DJI": ("DIA", "DIA (proxy for ^DJI)"),
}

# Gap threshold: abs(gap_pct) below this is treated as FLAT
_FLAT_THRESHOLD = 0.1

# OHOL tolerance: open ±0.015% is considered "equal"
_OHOL_TOLERANCE_FACTOR = 0.00015
_OHOL_WINDOW_MINUTES = 15


class OpeningRangeService:
    """
    Computes gap analysis and OHOL signal for a given index.
    Results are cached for 10 minutes (intraday data changes frequently).
    """

    def get_opening_range(self, symbol: str) -> Optional[OpeningRangeResult]:
        config = INDICES.get(symbol)
        if config is None:
            return None
        return self.get_opening_range_for_asset(
            symbol=symbol,
            ticker=config.ticker,
            timezone=config.timezone,
            intraday_symbol=symbol,
        )

    def get_opening_range_for_asset(
        self,
        symbol: str,
        ticker: str,
        timezone: str,
        intraday_symbol: Optional[str] = None,
    ) -> Optional[OpeningRangeResult]:
        cache_key = f"opening_range:{symbol}"
        cached = opening_range_cache.get(cache_key)
        if cached is not None:
            return cached

        # Fetch 40 days of daily data: covers today's gap + 30-day history
        df_daily = yahoo_provider.get_history(ticker, period_days=40)
        if df_daily.empty or len(df_daily) < 2:
            logger.warning(f"Insufficient daily data for opening range of {symbol}")
            return None

        gap = self._compute_gap(df_daily)
        trade_date = df_daily.index[-1].strftime("%Y-%m-%d")

        note_parts: List[str] = []
        source_symbol = intraday_symbol or symbol
        intraday_candidates = self._build_intraday_candidates(source_symbol, ticker)
        df_5m, data_source, used_fallback = self._fetch_intraday_with_fallback(intraday_candidates)

        if data_source != ticker:
            note_parts.append(f"5-min data via {data_source}")
        if used_fallback:
            note_parts.append(f"Primary intraday source unavailable ({ticker}); fallback applied")

        ohol_current, ohol_previous = self._compute_ohol_pair(df_5m, timezone, data_source, symbol)
        ohol = ohol_current if ohol_current.signal != "UNAVAILABLE" else ohol_previous

        if ohol.signal == "UNAVAILABLE":
            note_parts.append(f"Intraday data unavailable for {ticker}")
        elif ohol_current.signal == "UNAVAILABLE" and ohol_previous.signal != "UNAVAILABLE":
            note_parts.append("Current session unavailable; showing previous session first 5-minute candle")

        historical_gaps = self._compute_historical_gaps(df_daily)

        total = len(historical_gaps)
        if total > 0:
            gap_up_count = sum(1 for g in historical_gaps if g.gap_type == "GAP_UP")
            gap_down_count = sum(1 for g in historical_gaps if g.gap_type == "GAP_DOWN")
            gap_up_pct = round(gap_up_count / total * 100, 1)
            gap_down_pct = round(gap_down_count / total * 100, 1)
            avg_gap_pct = round(sum(abs(g.gap_pct) for g in historical_gaps) / total, 2)
        else:
            gap_up_pct = gap_down_pct = avg_gap_pct = 0.0

        result = OpeningRangeResult(
            symbol=symbol,
            trade_date=trade_date,
            gap=gap,
            ohol=ohol,
            ohol_current=ohol_current,
            ohol_previous=ohol_previous,
            historical_gaps=historical_gaps,
            gap_up_pct=gap_up_pct,
            gap_down_pct=gap_down_pct,
            avg_gap_pct=avg_gap_pct,
            note="; ".join(note_parts),
        )

        opening_range_cache.set(cache_key, result)
        return result

    # ──────────────────────────────────────────────────────────────────
    def _compute_gap(self, df_daily: pd.DataFrame) -> GapInfo:
        prev_close = float(df_daily["Close"].iloc[-2])
        open_price = float(df_daily["Open"].iloc[-1])
        gap_pts = round(open_price - prev_close, 4)
        gap_pct = round((open_price - prev_close) / prev_close * 100, 4)

        if abs(gap_pct) < _FLAT_THRESHOLD:
            gap_type = "FLAT"
        elif gap_pct > 0:
            gap_type = "GAP_UP"
        else:
            gap_type = "GAP_DOWN"

        return GapInfo(
            prev_close=round(prev_close, 2),
            open_price=round(open_price, 2),
            gap_pts=round(gap_pts, 2),
            gap_pct=gap_pct,
            gap_type=gap_type,
        )

    def _build_intraday_candidates(self, symbol: str, primary_ticker: str) -> List[Tuple[str, str]]:
        if symbol in _FORCED_INTRADAY_PROXIES:
            proxy_ticker, label = _FORCED_INTRADAY_PROXIES[symbol]
            return [(proxy_ticker, label)]

        candidates: List[Tuple[str, str]] = [(primary_ticker, primary_ticker)]
        proxy_ticker = INDEX_PROXY_ETFS.get(symbol)
        if proxy_ticker and proxy_ticker != primary_ticker:
            candidates.append((proxy_ticker, f"{proxy_ticker} (proxy for {primary_ticker})"))
        return candidates

    def _fetch_intraday_with_fallback(self, candidates: List[Tuple[str, str]]) -> Tuple[pd.DataFrame, str, bool]:
        for i, (ticker, label) in enumerate(candidates):
            df_5m = yahoo_provider.get_intraday_5m(ticker, days_back=2)
            if not df_5m.empty:
                return df_5m, label, i > 0

        default_source = candidates[0][1] if candidates else ""
        return pd.DataFrame(), default_source, False

    def _compute_ohol_pair(
        self,
        df_5m: pd.DataFrame,
        timezone: str,
        data_source: str,
        symbol: str = "",
    ) -> Tuple[OHOLSignal, OHOLSignal]:
        if df_5m.empty:
            unavailable = OHOLSignal(signal="UNAVAILABLE", data_source=data_source)
            return unavailable, unavailable

        try:
            df_local = self._convert_to_local_tz(df_5m, timezone)
            available_dates = sorted({ts.date() for ts in df_local.index})
            if not available_dates:
                unavailable = OHOLSignal(signal="UNAVAILABLE", data_source=data_source)
                return unavailable, unavailable

            tz = pytz.timezone(timezone)
            today_local = datetime.datetime.now(tz).date()

            current_signal = self._compute_ohol_for_date(df_local, today_local, data_source)

            previous_target = None
            for session_date in reversed(available_dates):
                if session_date < today_local:
                    previous_target = session_date
                    break
            previous_signal = self._compute_ohol_for_date(df_local, previous_target, data_source)

            return current_signal, previous_signal

        except Exception as exc:
            logger.error(f"_compute_ohol error for {symbol}: {exc}")
            unavailable = OHOLSignal(signal="UNAVAILABLE", data_source=data_source)
            return unavailable, unavailable

    def _convert_to_local_tz(self, df_5m: pd.DataFrame, timezone: str) -> pd.DataFrame:
        tz = pytz.timezone(timezone)
        df_local = df_5m.copy()

        # yfinance intraday index is usually UTC; normalize regardless of source TZ.
        if df_local.index.tz is None:
            df_local.index = df_local.index.tz_localize("UTC").tz_convert(tz)
        else:
            df_local.index = df_local.index.tz_convert(tz)
        return df_local

    def _compute_ohol_for_date(
        self,
        df_local: pd.DataFrame,
        session_date: Optional[datetime.date],
        data_source: str,
    ) -> OHOLSignal:
        if session_date is None:
            return OHOLSignal(signal="UNAVAILABLE", data_source=data_source)

        mask = [ts.date() == session_date for ts in df_local.index]
        df_session = df_local[mask]
        if df_session.empty:
            return OHOLSignal(
                signal="UNAVAILABLE",
                session_date=session_date.strftime("%Y-%m-%d"),
                data_source=data_source,
            )

        df_session = df_session.sort_index()
        session_open_ts = df_session.index[0]
        window_end = session_open_ts + datetime.timedelta(minutes=_OHOL_WINDOW_MINUTES)
        df_window = df_session[df_session.index < window_end]
        if df_window.empty:
            df_window = df_session.iloc[:1]

        first = df_window.iloc[0]
        last = df_window.iloc[-1]
        o = float(first["Open"])
        h = float(df_window["High"].max())
        l_val = float(df_window["Low"].min())
        c = float(last["Close"])
        t = f"{session_open_ts.strftime('%Y-%m-%d %H:%M %Z')} → {last.name.strftime('%H:%M %Z')}"

        tol = o * _OHOL_TOLERANCE_FACTOR
        oh_match = abs(o - h) <= tol
        ol_match = abs(o - l_val) <= tol

        if oh_match and ol_match:
            signal = "DOJI"
            entry_trigger_long = None
            entry_trigger_short = None
        elif oh_match:
            signal = "OPEN_HIGH"
            entry_trigger_long = None
            entry_trigger_short = round(l_val, 2)
        elif ol_match:
            signal = "OPEN_LOW"
            entry_trigger_long = round(h, 2)
            entry_trigger_short = None
        else:
            signal = "NONE"
            entry_trigger_long = None
            entry_trigger_short = None

        return OHOLSignal(
            signal=signal,
            session_date=session_date.strftime("%Y-%m-%d"),
            window_minutes=_OHOL_WINDOW_MINUTES,
            bars_used=int(len(df_window)),
            candle_open=round(o, 2),
            candle_high=round(h, 2),
            candle_low=round(l_val, 2),
            candle_close=round(c, 2),
            candle_time=t,
            entry_trigger_long=entry_trigger_long,
            entry_trigger_short=entry_trigger_short,
            data_source=data_source,
        )

    def _compute_historical_gaps(self, df_daily: pd.DataFrame) -> List[HistoricalGapDay]:
        if len(df_daily) < 2:
            return []

        closes = df_daily["Close"].values
        opens = df_daily["Open"].values
        dates = df_daily.index

        gaps: List[HistoricalGapDay] = []
        for i in range(1, len(df_daily)):
            prev_c = float(closes[i - 1])
            curr_o = float(opens[i])
            if prev_c == 0:
                continue
            gap_pct = round((curr_o - prev_c) / prev_c * 100, 4)

            if abs(gap_pct) < _FLAT_THRESHOLD:
                gap_type = "FLAT"
            elif gap_pct > 0:
                gap_type = "GAP_UP"
            else:
                gap_type = "GAP_DOWN"

            gaps.append(
                HistoricalGapDay(
                    date=dates[i].strftime("%Y-%m-%d"),
                    gap_pct=gap_pct,
                    gap_type=gap_type,
                )
            )

        # Return last 30 trading days
        return gaps[-30:]


opening_range_service = OpeningRangeService()
