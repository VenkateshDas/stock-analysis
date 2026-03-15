from typing import Optional
from pydantic import BaseModel


class PCRResult(BaseModel):
    proxy_ticker: str         # e.g. "SPY"
    is_thin_market: bool      # EWJ, EWH — show disclaimer
    expiry_count: int         # number of expiries fetched
    near_expiry_count: int    # expiries ≤30 days (for vol PCR)

    # Near-term (≤30 days) volume PCR — None for thin markets
    pcr_volume: Optional[float] = None
    put_volume: Optional[float] = None
    call_volume: Optional[float] = None
    vol_signal: str           # "complacent" | "neutral" | "fearful" | "unavailable"

    # All-expiry OI PCR
    pcr_oi: float
    put_oi: float
    call_oi: float
    oi_signal: str            # "call_dominant" | "neutral" | "heavy_hedging"

    # Combined human-readable signal
    overall_signal: str       # "contrarian_bullish" | "neutral" | "contrarian_bearish"
    signal_label: str         # plain English e.g. "Heavy put hedging — contrarian buy signal"
