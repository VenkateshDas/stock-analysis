from pydantic import BaseModel
from typing import Optional, List


class GapInfo(BaseModel):
    prev_close: float
    open_price: float
    gap_pts: float
    gap_pct: float        # positive = gap up
    gap_type: str         # "GAP_UP" | "GAP_DOWN" | "FLAT"


class OHOLSignal(BaseModel):
    signal: str           # "OPEN_HIGH" | "OPEN_LOW" | "NONE" | "DOJI" | "UNAVAILABLE"
    session_date: Optional[str] = None
    window_minutes: Optional[int] = None
    bars_used: Optional[int] = None
    candle_open: Optional[float] = None
    candle_high: Optional[float] = None
    candle_low: Optional[float] = None
    candle_close: Optional[float] = None
    candle_time: Optional[str] = None
    entry_trigger_long: Optional[float] = None   # set when signal == OPEN_LOW
    entry_trigger_short: Optional[float] = None  # set when signal == OPEN_HIGH
    data_source: str


class HistoricalGapDay(BaseModel):
    date: str
    gap_pct: float
    gap_type: str


class OpeningRangeResult(BaseModel):
    symbol: str
    trade_date: str
    gap: GapInfo
    ohol: OHOLSignal
    ohol_current: Optional[OHOLSignal] = None
    ohol_previous: Optional[OHOLSignal] = None
    historical_gaps: List[HistoricalGapDay]  # last 30 trading days
    gap_up_pct: float    # % of days that gapped up   (e.g. 43.3)
    gap_down_pct: float  # % of days that gapped down
    avg_gap_pct: float   # average abs gap size
    note: str            # any caveats
