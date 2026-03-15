from abc import ABC, abstractmethod
from typing import Optional
import pandas as pd


class DataProvider(ABC):
    """Abstract interface for market data sources."""

    @abstractmethod
    def get_history(self, ticker: str, period_days: int) -> pd.DataFrame:
        """
        Fetch OHLCV history.

        Returns DataFrame with columns: Open, High, Low, Close, Volume
        Index: DatetimeIndex (UTC or tz-aware)
        """

    @abstractmethod
    def get_snapshot(self, ticker: str) -> Optional[dict]:
        """
        Fetch latest quote data.
        Returns dict with keys: last_close, prev_close, open, high, low, volume
        """
