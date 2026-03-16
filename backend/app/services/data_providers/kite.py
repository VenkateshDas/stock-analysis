"""
Kite Connect v3 historical data provider.

Authentication
--------------
Requires a valid KiteConnect session (api_key + access_token) stored in the
per-user session file managed by KiteAuthManager.  If no session is available
the provider raises RuntimeError so callers can fall back to yfinance.

Intervals supported by Kite Connect v3
---------------------------------------
"minute"   → max 60 days per request   (1-min candles; up to 3 years total)
"3minute"  → max 100 days
"5minute"  → max 100 days
"10minute" → max 100 days
"15minute" → max 200 days
"30minute" → max 200 days
"60minute" → max 400 days  (also accepted as "60minute")
"day"      → max 2000 days (daily candles; back-filled to late 1990s for NSE)
"week"     → max 2000 days

Instrument tokens
-----------------
Each NSE equity has a unique integer `instrument_token` in the Kite instrument
master CSV (refreshed daily).  For indices use:

    NIFTY 50   → 256265
    NIFTY BANK → 260105
    NIFTY 100  → 261889
    SENSEX     → 265

For equities look up `KiteProvider.get_instrument_token(symbol)` which caches
the instrument master CSV locally for 24 hours.

Rate limits
-----------
Kite Connect imposes ~3 requests/second on the historical API.  This module
adds a configurable inter-request sleep (default 0.35 s) and chunks large date
ranges automatically.
"""

from __future__ import annotations

import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd

# Kite Connect interval → (max_days_per_request)
_INTERVAL_MAX_DAYS: dict[str, int] = {
    "minute": 60,
    "2minute": 60,
    "3minute": 100,
    "4minute": 100,
    "5minute": 100,
    "10minute": 100,
    "15minute": 200,
    "30minute": 200,
    "60minute": 400,
    "day": 2000,
    "week": 2000,
}

# Well-known index tokens (NSE)
INDEX_TOKENS: dict[str, int] = {
    "NIFTY": 256265,
    "NIFTY50": 256265,
    "^NSEI": 256265,
    "NIFTY 50": 256265,
    "BANKNIFTY": 260105,
    "NIFTYBANK": 260105,
    "^NSEBANK": 260105,
    "NIFTY BANK": 260105,
    "NIFTY100": 261889,
    "SENSEX": 265,
    "^BSESN": 265,
}

_INSTRUMENT_CACHE_HOURS = 24
_DEFAULT_SLEEP = 0.35  # seconds between API calls


class KiteProvider:
    """
    Fetches OHLCV data from Zerodha Kite Connect v3.

    Parameters
    ----------
    kite_client : KiteConnect instance with a valid access token already set.
    cache_dir   : Directory for caching the instrument master CSV.
    sleep_sec   : Seconds to sleep between chunked API requests (rate limit).
    """

    def __init__(self, kite_client, cache_dir: Optional[Path] = None, sleep_sec: float = _DEFAULT_SLEEP):
        self._kite = kite_client
        self._cache_dir = cache_dir or Path(__file__).resolve().parents[4] / "data" / "kite_cache"
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._sleep_sec = sleep_sec
        self._instruments_df: Optional[pd.DataFrame] = None

    # ------------------------------------------------------------------
    # Instrument master
    # ------------------------------------------------------------------

    def _instruments_cache_path(self) -> Path:
        return self._cache_dir / "instruments_NSE.csv"

    def _load_instruments(self) -> pd.DataFrame:
        """Load instrument master from cache or download fresh copy."""
        cache_path = self._instruments_cache_path()
        if cache_path.exists():
            age_hours = (time.time() - cache_path.stat().st_mtime) / 3600
            if age_hours < _INSTRUMENT_CACHE_HOURS:
                return pd.read_csv(cache_path)

        instruments = self._kite.instruments("NSE")
        df = pd.DataFrame(instruments)
        df.to_csv(cache_path, index=False)
        return df

    @property
    def instruments(self) -> pd.DataFrame:
        if self._instruments_df is None:
            self._instruments_df = self._load_instruments()
        return self._instruments_df

    def get_instrument_token(self, symbol: str) -> int:
        """
        Return the Kite instrument_token for an NSE equity symbol.

        Priority:
          1. Well-known index tokens (NIFTY, BANKNIFTY, SENSEX)
          2. Instrument master lookup by tradingsymbol (exact match)
          3. Instrument master lookup by name (case-insensitive, partial)

        Raises KeyError if the symbol cannot be resolved.
        """
        upper = symbol.upper().replace(".NS", "").strip()

        # Well-known indices first
        if upper in INDEX_TOKENS:
            return INDEX_TOKENS[upper]

        df = self.instruments
        # Exact tradingsymbol match
        match = df[df["tradingsymbol"] == upper]
        if not match.empty:
            # Prefer EQ series for equity (not BE, BZ, etc.)
            eq = match[match.get("series", pd.Series(dtype=str)) == "EQ"]
            row = eq.iloc[0] if not eq.empty else match.iloc[0]
            return int(row["instrument_token"])

        # Partial name match (fallback)
        name_match = df[df["name"].str.upper().str.contains(upper, na=False)]
        if not name_match.empty:
            eq = name_match[name_match.get("series", pd.Series(dtype=str)) == "EQ"]
            row = eq.iloc[0] if not eq.empty else name_match.iloc[0]
            return int(row["instrument_token"])

        raise KeyError(f"Instrument not found for symbol: {symbol!r}. "
                       "Use get_instrument_token() after checking instruments df.")

    # ------------------------------------------------------------------
    # Core historical fetch
    # ------------------------------------------------------------------

    def fetch(
        self,
        instrument_token: int,
        from_date: date,
        to_date: date,
        interval: str = "day",
        continuous: bool = False,
        oi: bool = False,
    ) -> pd.DataFrame:
        """
        Fetch OHLCV (+ optionally OI) candles for the full date range,
        automatically chunking requests to respect per-interval limits.

        Parameters
        ----------
        instrument_token : int  — from get_instrument_token() or INDEX_TOKENS
        from_date        : date — start of range (inclusive)
        to_date          : date — end of range (inclusive)
        interval         : str  — Kite interval string (see module docstring)
        continuous       : bool — continuous futures data (F&O only)
        oi               : bool — include open interest column

        Returns
        -------
        pd.DataFrame with columns [Open, High, Low, Close, Volume] (+ OI if oi=True)
        Index: DatetimeIndex in Asia/Kolkata timezone
        """
        max_days = _INTERVAL_MAX_DAYS.get(interval, 60)
        chunks = self._split_date_range(from_date, to_date, max_days)

        all_records: list[dict] = []
        for chunk_from, chunk_to in chunks:
            # Kite expects datetime strings; for intraday use time boundaries
            from_str = f"{chunk_from} 09:15:00" if interval != "day" and interval != "week" else str(chunk_from)
            to_str = f"{chunk_to} 15:30:00" if interval != "day" and interval != "week" else str(chunk_to)

            records = self._kite.historical_data(
                instrument_token=instrument_token,
                from_date=from_str,
                to_date=to_str,
                interval=interval,
                continuous=continuous,
                oi=oi,
            )
            all_records.extend(records)

            if len(chunks) > 1:
                time.sleep(self._sleep_sec)

        if not all_records:
            cols = ["Open", "High", "Low", "Close", "Volume"]
            if oi:
                cols.append("OI")
            return pd.DataFrame(columns=cols)

        return self._records_to_dataframe(all_records, oi=oi)

    def fetch_by_symbol(
        self,
        symbol: str,
        from_date: date,
        to_date: date,
        interval: str = "day",
        continuous: bool = False,
        oi: bool = False,
    ) -> pd.DataFrame:
        """Convenience wrapper: resolves symbol → instrument_token then fetches."""
        token = self.get_instrument_token(symbol)
        return self.fetch(token, from_date, to_date, interval, continuous=continuous, oi=oi)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _split_date_range(
        from_date: date, to_date: date, max_days: int
    ) -> list[tuple[date, date]]:
        """Split [from_date, to_date] into chunks of at most max_days each."""
        chunks: list[tuple[date, date]] = []
        current = from_date
        while current <= to_date:
            chunk_end = min(current + timedelta(days=max_days - 1), to_date)
            chunks.append((current, chunk_end))
            current = chunk_end + timedelta(days=1)
        return chunks

    @staticmethod
    def _records_to_dataframe(records: list[dict], oi: bool = False) -> pd.DataFrame:
        """Convert Kite candle dicts to a clean OHLCV DataFrame."""
        rows = []
        for r in records:
            row = {
                "date": r["date"],
                "Open": float(r["open"]),
                "High": float(r["high"]),
                "Low": float(r["low"]),
                "Close": float(r["close"]),
                "Volume": int(r["volume"]),
            }
            if oi:
                row["OI"] = int(r.get("oi", 0))
            rows.append(row)

        df = pd.DataFrame(rows)
        df["date"] = pd.to_datetime(df["date"], utc=True).dt.tz_convert("Asia/Kolkata")
        df = df.set_index("date").sort_index()
        df.index.name = "date"
        return df

    # ------------------------------------------------------------------
    # Bulk download (multiple symbols)
    # ------------------------------------------------------------------

    def fetch_universe(
        self,
        symbols: list[str],
        from_date: date,
        to_date: date,
        interval: str = "day",
    ) -> dict[str, pd.DataFrame]:
        """
        Download historical data for a list of symbols.

        Returns dict mapping symbol → OHLCV DataFrame.
        Failed symbols are silently skipped with a warning printed.

        Rate limit: sleeps self._sleep_sec between each symbol.
        """
        result: dict[str, pd.DataFrame] = {}
        for symbol in symbols:
            try:
                df = self.fetch_by_symbol(symbol, from_date, to_date, interval)
                if not df.empty:
                    result[symbol] = df
            except Exception as exc:
                print(f"[KiteProvider] WARNING: failed to fetch {symbol!r}: {exc}")
            time.sleep(self._sleep_sec)
        return result


# ------------------------------------------------------------------
# Factory: build KiteProvider from existing KiteAuthManager session
# ------------------------------------------------------------------

def build_kite_provider(user_id: str = "default") -> KiteProvider:
    """
    Build a KiteProvider using the stored Kite session for `user_id`.

    Raises RuntimeError if no valid session exists (user must log in via
    the Bot Lab → Kite Connect OAuth flow first).
    """
    from app.bot.auth.kite_auth import KiteAuthManager

    auth = KiteAuthManager(user_id=user_id)
    client = auth.get_kite_client()
    if client is None:
        raise RuntimeError(
            "No active Kite Connect session for user_id={!r}. "
            "Log in via the Bot Lab → Kite Connect settings page first.".format(user_id)
        )
    return KiteProvider(kite_client=client)
