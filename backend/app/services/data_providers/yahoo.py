import yfinance as yf
import pandas as pd
import numpy as np
from typing import Optional, List, Dict
import logging
import datetime

from app.services.data_providers.base import DataProvider

logger = logging.getLogger(__name__)

# ETF ticker to index mapping for fetching constituents
INDEX_ETF_MAP = {
    "NSEI": "NIFTYBEES.NS",    # Nifty 50
    "CNX100": "N100BEES.NS",   # Nifty 100
    "CNX200": "N200.NS",       # Nifty 200 (Mirae Asset Nifty 200 ETF)
    "NSEBANK": "BANKBEES.NS",  # Nifty Bank
}


class YahooFinanceProvider(DataProvider):
    """Fetches market data from Yahoo Finance via yfinance."""

    def get_history(self, ticker: str, period_days: int) -> pd.DataFrame:
        """
        Download OHLCV history for the given number of trading days.
        Uses start/end dates — yfinance does NOT accept arbitrary 'period=Nd' strings.
        Returns a DataFrame with columns: Open, High, Low, Close, Volume.
        """
        try:
            # Add calendar-day buffer to ensure we get enough trading days
            buffer_days = period_days + 90
            end_date = datetime.date.today()
            start_date = end_date - datetime.timedelta(days=buffer_days)
            # Yahoo's `end` is exclusive. Use tomorrow so today's bar is included when available.
            end_exclusive = end_date + datetime.timedelta(days=1)

            ticker_obj = yf.Ticker(ticker)
            df = ticker_obj.history(
                start=start_date.strftime("%Y-%m-%d"),
                end=end_exclusive.strftime("%Y-%m-%d"),
                auto_adjust=True,
            )
            if df.empty:
                logger.warning(f"No history data returned for {ticker}")
                return pd.DataFrame()

            # Normalise column names
            df = df[["Open", "High", "Low", "Close", "Volume"]]
            df = df.dropna(subset=["Close"])

            # Keep only the last `period_days` trading rows
            df = df.tail(period_days)
            return df
        except Exception as exc:
            logger.error(f"YahooFinanceProvider.get_history({ticker}): {exc}")
            return pd.DataFrame()

    def get_history_intraday(self, ticker: str, interval: str, days_back: int) -> pd.DataFrame:
        """
        Fetch intraday OHLCV bars for the given interval ('5m', '15m', '1h').
        Yahoo Finance limits: 5m/15m up to 60 days, 1h up to 730 days.
        Returns a DataFrame with columns: Open, High, Low, Close, Volume.
        """
        try:
            end_date = datetime.date.today()
            start_date = end_date - datetime.timedelta(days=days_back + 3)
            end_exclusive = end_date + datetime.timedelta(days=1)

            ticker_obj = yf.Ticker(ticker)
            df = ticker_obj.history(
                start=start_date.strftime("%Y-%m-%d"),
                end=end_exclusive.strftime("%Y-%m-%d"),
                interval=interval,
                auto_adjust=True,
            )
            if df.empty:
                logger.warning(f"No intraday ({interval}) data returned for {ticker}")
                return pd.DataFrame()

            df = df[["Open", "High", "Low", "Close", "Volume"]]
            return df.dropna(subset=["Close"])
        except Exception as exc:
            logger.error(f"YahooFinanceProvider.get_history_intraday({ticker}, {interval}): {exc}")
            return pd.DataFrame()

    def get_intraday_5m(self, ticker: str, days_back: int = 2) -> pd.DataFrame:
        """Fetch 5-minute OHLCV bars. Max 60 days back per Yahoo Finance limits."""
        try:
            ticker_obj = yf.Ticker(ticker)
            df = ticker_obj.history(
                period=f"{max(days_back, 2) + 2}d",
                interval="5m",
                auto_adjust=True,
            )
            if df.empty:
                return pd.DataFrame()
            df = df[["Open", "High", "Low", "Close", "Volume"]]
            return df.dropna(subset=["Close"])
        except Exception as exc:
            logger.error(f"YahooFinanceProvider.get_intraday_5m({ticker}): {exc}")
            return pd.DataFrame()

    def get_snapshot(self, ticker: str) -> Optional[dict]:
        """
        Fetch latest quote. Uses last two rows of recent history to compute
        prev_close and change, which is more reliable than yfinance .info for indices.
        """
        try:
            df = self.get_history(ticker, period_days=5)
            if df.empty or len(df) < 2:
                return None

            last = df.iloc[-1]
            prev = df.iloc[-2]
            return {
                "last_close": float(last["Close"]),
                "prev_close": float(prev["Close"]),
                "open": float(last["Open"]),
                "high": float(last["High"]),
                "low": float(last["Low"]),
                "volume": float(last["Volume"]),
                "trade_date": df.index[-1],
                "prev_trade_date": df.index[-2],
            }
        except Exception as exc:
            logger.error(f"YahooFinanceProvider.get_snapshot({ticker}): {exc}")
            return None

    def get_asset_metadata(self, ticker: str) -> dict:
        """Best-effort metadata fetch for generic assets (stocks/ETFs/indices)."""
        default_name = ticker.upper()
        default_currency = "USD"
        default_timezone = "America/New_York"

        try:
            ticker_obj = yf.Ticker(ticker)
            info = getattr(ticker_obj, "info", {}) or {}
            fast_info = getattr(ticker_obj, "fast_info", {}) or {}

            name = (
                info.get("longName")
                or info.get("shortName")
                or info.get("displayName")
                or default_name
            )
            currency = info.get("currency") or fast_info.get("currency") or default_currency
            timezone = (
                info.get("timeZoneFullName")
                or info.get("exchangeTimezoneName")
                or fast_info.get("timezone")
                or default_timezone
            )
            if isinstance(timezone, str) and "/" not in timezone:
                timezone = default_timezone

            return {
                "name": str(name),
                "currency": str(currency),
                "timezone": str(timezone),
            }
        except Exception as exc:
            logger.warning(f"YahooFinanceProvider.get_asset_metadata({ticker}): {exc}")
            return {
                "name": default_name,
                "currency": default_currency,
                "timezone": default_timezone,
            }

    def get_index_constituents(self, index_symbol: str) -> List[Dict]:
        """
        Fetch index constituents from Yahoo Finance via ETF holdings.
        Uses the ETF that tracks the index to get the constituent stocks.
        Returns list of constituents with symbol, name, sector, industry, and weight.
        """
        # Get the ETF ticker for this index
        etf_ticker = INDEX_ETF_MAP.get(index_symbol)
        if not etf_ticker:
            logger.warning(f"No ETF mapping found for index {index_symbol}")
            return []

        try:
            ticker_obj = yf.Ticker(etf_ticker)
            # Get holdings - this gives us the constituent stocks
            holdings = ticker_obj.holders
            
            if holdings is None or holdings.empty:
                logger.warning(f"No holdings data available for {etf_ticker}")
                return []

            # Process holdings data
            constituents = []
            for _, row in holdings.iterrows():
                # yfinance holders typically has: Symbol, Name, Sector, Industry, %
                symbol = str(row.get("Symbol", ""))
                name = str(row.get("Name", symbol))
                sector = str(row.get("Sector", "Unknown"))
                industry = str(row.get("Industry", "Unknown"))
                weight = float(row.get("%", row.get("Weight", 0)) or 0)

                if symbol and symbol != "nan":
                    constituents.append({
                        "symbol": f"{symbol}.NS" if not symbol.endswith(".NS") else symbol,
                        "name": name,
                        "sector": sector,
                        "industry": industry,
                        "weight": weight
                    })

            logger.info(f"Fetched {len(constituents)} constituents for {index_symbol} from {etf_ticker}")
            return constituents

        except Exception as exc:
            logger.error(f"Error fetching constituents for {index_symbol}: {exc}")
            return []


# Singleton
yahoo_provider = YahooFinanceProvider()
