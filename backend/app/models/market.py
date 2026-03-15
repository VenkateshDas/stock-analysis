from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class OHLCVBar(BaseModel):
    timestamp: int  # Unix ms
    open: float
    high: float
    low: float
    close: float
    volume: float


class IndexConfig(BaseModel):
    symbol: str
    name: str
    ticker: str
    timezone: str
    currency: str
    note: str = ""
    tradingview_url: str = ""


class IndexSnapshot(BaseModel):
    symbol: str
    name: str
    currency: str
    timezone: str
    note: str = ""
    tradingview_url: str = ""

    # Latest price data
    last_close: float
    prev_close: float
    open: float
    high: float
    low: float
    volume: float

    # Change
    change_pts: float
    change_pct: float

    # Metadata
    trade_date: str          # YYYY-MM-DD in local timezone
    prev_trade_date: Optional[str] = None
    last_updated: datetime

    # 5-day spark data (close prices)
    spark_closes: List[float] = Field(default_factory=list)
    spark_dates: List[str] = Field(default_factory=list)


class CPRBar(BaseModel):
    """Central Pivot Range levels for one session (computed from previous day H/L/C)."""
    pp: float         # Pivot Point = (H + L + C) / 3
    tc: float         # Top Central Pivot = 2*PP - BC  (raw; may be below BC in bearish session)
    bc: float         # Bottom Central Pivot = (H + L) / 2
    cpr_low: float    # min(tc, bc) — always the lower bound of the CPR zone
    cpr_high: float   # max(tc, bc) — always the upper bound of the CPR zone
    r1: float         # Resistance 1 = 2*PP - L
    r2: float         # Resistance 2 = PP + (H - L)
    r3: float         # Resistance 3 = H + 2*(PP - L)
    s1: float         # Support 1 = 2*PP - H
    s2: float         # Support 2 = PP - (H - L)
    s3: float         # Support 3 = L - 2*(H - PP)
    width_pct: float  # (cpr_high - cpr_low) / PP * 100  — always non-negative
    width_signal: str # "narrow" | "moderate" | "wide"
    is_virgin: bool   # True if current session's H/L never entered the CPR zone


class HistoryResponse(BaseModel):
    symbol: str
    bars: List[OHLCVBar]
    # Moving average overlays
    sma20: List[Optional[float]]
    sma50: List[Optional[float]]
    sma200: List[Optional[float]]
    # CPR levels per bar (None for first bar; each bar's CPR is from previous bar H/L/C)
    cpr: List[Optional[CPRBar]] = Field(default_factory=list)
