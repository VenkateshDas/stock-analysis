from __future__ import annotations

from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Dict, Optional, Tuple

import pandas as pd
import yfinance as yf


SYMBOL_MAP = {
    "NIFTY": "^NSEI",
    "BANKNIFTY": "^NSEBANK",
}

# Map any variant interval string → yfinance-valid interval
# yfinance valid: 1m 2m 5m 15m 30m 60m 90m 1h 4h 1d 5d 1wk 1mo 3mo
INTERVAL_ALIASES: dict[str, str] = {
    "1minute": "1m",
    "2minute": "2m",
    "5minute": "5m",
    "15minute": "15m",
    "30minute": "30m",
    "60minute": "60m",
    "90minute": "90m",
    "1hour": "1h",
    "4hour": "4h",
    "day": "1d",
    "week": "1wk",
    "month": "1mo",
}

# Map variant interval string → Kite Connect interval string
KITE_INTERVAL_MAP: dict[str, str] = {
    "1minute": "minute",
    "2minute": "2minute",
    "3minute": "3minute",
    "5minute": "5minute",
    "10minute": "10minute",
    "15minute": "15minute",
    "30minute": "30minute",
    "60minute": "60minute",
    "1hour": "60minute",
    "day": "day",
    "week": "week",
    "1d": "day",
    "1wk": "week",
    "minute": "minute",
}


class IndiaMarketDataAdapter:
    """
    Fetches OHLCV data for Indian market instruments.

    Priority:
      1. Zerodha Kite Connect (if `user_id` session is active) — accurate,
         point-in-time, corporate-action-adjusted data from NSE/BSE.
      2. yfinance fallback — for unauthenticated / demo usage.

    Kite Connect is preferred because:
    - Corporate actions (bonus, splits) are correctly adjusted for all NSE stocks.
    - No rate-limit issues at normal usage (<3 req/sec).
    - Intraday data goes back 3 years for 1-min; daily data back to late 1990s.
    - No look-ahead bias from hindsight-only price re-adjustments.
    """

    def __init__(self, data_dir: Path, user_id: str = "default"):
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._user_id = user_id
        self._kite_provider: Optional[object] = None  # lazy-loaded

    # ------------------------------------------------------------------
    # Kite provider (lazy, with fallback)
    # ------------------------------------------------------------------

    def _get_kite_provider(self):
        """Return KiteProvider if a valid session exists, else None."""
        if self._kite_provider is not None:
            return self._kite_provider
        try:
            from app.services.data_providers.kite import build_kite_provider
            self._kite_provider = build_kite_provider(user_id=self._user_id)
            return self._kite_provider
        except Exception:
            return None

    def _kite_interval(self, interval: str) -> str:
        """Normalise any interval string to a Kite Connect interval."""
        return KITE_INTERVAL_MAP.get(interval, interval)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def fetch_intraday(
        self,
        symbol: str,
        start: date,
        end: date,
        interval: str = "1m",
    ) -> pd.DataFrame:
        """
        Fetch intraday OHLCV bars for `symbol` between `start` and `end`.

        Tries Kite Connect first; falls back to yfinance.
        Returns DataFrame with columns [Open, High, Low, Close, Volume],
        indexed by DatetimeIndex in Asia/Kolkata timezone.
        """
        kite = self._get_kite_provider()
        if kite is not None:
            return self._fetch_kite(kite, symbol, start, end, interval)
        return self._fetch_yfinance(symbol, start, end, interval)

    def fetch_daily(
        self,
        symbol: str,
        from_date: date,
        to_date: date,
    ) -> pd.DataFrame:
        """
        Fetch daily OHLCV bars.  Kite daily candles go back to late 1990s for NSE.
        """
        kite = self._get_kite_provider()
        if kite is not None:
            return self._fetch_kite(kite, symbol, from_date, to_date, "day")
        return self._fetch_yfinance(symbol, from_date, to_date, "1d")

    def fetch_universe_daily(
        self,
        symbols: list[str],
        from_date: date,
        to_date: date,
    ) -> dict[str, pd.DataFrame]:
        """
        Bulk download daily OHLCV for a list of NSE symbols.

        Returns dict[symbol → DataFrame].
        Kite path uses KiteProvider.fetch_universe() with built-in rate limiting.
        yfinance fallback downloads all tickers in a single batched call.
        """
        kite = self._get_kite_provider()
        if kite is not None:
            return kite.fetch_universe(symbols, from_date, to_date, interval="day")
        return self._fetch_yfinance_universe(symbols, from_date, to_date)

    # ------------------------------------------------------------------
    # Kite path
    # ------------------------------------------------------------------

    def _fetch_kite(
        self,
        kite,
        symbol: str,
        start: date,
        end: date,
        interval: str,
    ) -> pd.DataFrame:
        kite_interval = self._kite_interval(interval)
        try:
            return kite.fetch_by_symbol(symbol, start, end, kite_interval)
        except Exception as exc:
            print(f"[MarketDataAdapter] Kite fetch failed for {symbol!r}, "
                  f"falling back to yfinance: {exc}")
            return self._fetch_yfinance(symbol, start, end, interval)

    # ------------------------------------------------------------------
    # yfinance fallback
    # ------------------------------------------------------------------

    def _yf_ticker(self, symbol: str) -> str:
        return SYMBOL_MAP.get(symbol.upper(), symbol)

    def _fetch_yfinance(
        self,
        symbol: str,
        start: date,
        end: date,
        interval: str,
    ) -> pd.DataFrame:
        interval = INTERVAL_ALIASES.get(interval, interval)
        ticker = self._yf_ticker(symbol)
        df = yf.download(
            ticker,
            start=start.isoformat(),
            end=(end + timedelta(days=1)).isoformat(),
            interval=interval,
            auto_adjust=True,
            progress=False,
        )
        if df.empty:
            return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        df = df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"]).copy()
        if df.index.tzinfo is None:
            df.index = df.index.tz_localize("UTC").tz_convert("Asia/Kolkata")
        else:
            df.index = df.index.tz_convert("Asia/Kolkata")
        return df

    def _fetch_yfinance_universe(
        self,
        symbols: list[str],
        from_date: date,
        to_date: date,
    ) -> dict[str, pd.DataFrame]:
        """Batch-download daily data for multiple symbols via yfinance."""
        import time as _time
        result: dict[str, pd.DataFrame] = {}
        # Process in batches of 25 to avoid rate limits
        batch_size = 25
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i : i + batch_size]
            tickers = [self._yf_ticker(s) for s in batch]
            raw = yf.download(
                tickers,
                start=from_date.isoformat(),
                end=(to_date + timedelta(days=1)).isoformat(),
                interval="1d",
                auto_adjust=True,
                group_by="ticker",
                threads=False,
                progress=False,
            )
            for sym, ticker in zip(batch, tickers):
                try:
                    if len(batch) == 1:
                        df = raw
                    else:
                        df = raw[ticker] if ticker in raw.columns.get_level_values(0) else pd.DataFrame()
                    if df.empty:
                        continue
                    if isinstance(df.columns, pd.MultiIndex):
                        df.columns = df.columns.get_level_values(0)
                    df = df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"]).copy()
                    if df.index.tzinfo is None:
                        df.index = df.index.tz_localize("UTC").tz_convert("Asia/Kolkata")
                    else:
                        df.index = df.index.tz_convert("Asia/Kolkata")
                    if not df.empty:
                        result[sym] = df
                except Exception:
                    pass
            if i + batch_size < len(symbols):
                _time.sleep(1)
        return result

    # ------------------------------------------------------------------
    # Utilities (unchanged from original)
    # ------------------------------------------------------------------

    def persist_csv(self, symbol: str, interval: str, df: pd.DataFrame) -> Path:
        out = self.data_dir / f"{symbol.lower()}_{interval}.csv"
        out.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(out)
        return out

    def aggregate_5m(self, df_1m: pd.DataFrame) -> pd.DataFrame:
        if df_1m.empty:
            return df_1m
        return df_1m.resample("5min").agg(
            {
                "Open": "first",
                "High": "max",
                "Low": "min",
                "Close": "last",
                "Volume": "sum",
            }
        ).dropna(subset=["Close"])

    def quality_flags(self, df: pd.DataFrame) -> Dict[str, bool]:
        if df.empty:
            return {
                "missing_bars": True,
                "stale_snapshot": True,
                "session_gaps": True,
            }

        now = datetime.now(tz=df.index.tz)
        stale = (now - df.index.max()).total_seconds() > 60 * 30

        session_start = time(9, 15)
        session_end = time(15, 30)
        market_df = df.between_time(session_start, session_end)
        missing = market_df.shape[0] < 60

        idx_diff = df.index.to_series().diff().dropna()
        gap = bool((idx_diff > pd.Timedelta(minutes=15)).any())
        return {
            "missing_bars": bool(missing),
            "stale_snapshot": bool(stale),
            "session_gaps": gap,
        }


def default_data_adapter(user_id: str = "default") -> IndiaMarketDataAdapter:
    data_dir = Path(__file__).resolve().parents[3] / "data" / "bot" / "market"
    return IndiaMarketDataAdapter(data_dir=data_dir, user_id=user_id)
