from typing import List, Optional
from pydantic import BaseModel


class MacroTicker(BaseModel):
    key: str                       # e.g. "india_vix"
    label: str                     # e.g. "India VIX"
    value: Optional[float]         # latest close
    change_1w_pct: Optional[float]
    change_1m_pct: Optional[float]
    change_3m_pct: Optional[float]
    direction: str                 # "rising" | "falling" | "flat"
    context: str                   # plain-English one-liner


class MacroSnapshot(BaseModel):
    trade_date: str
    tickers: List[MacroTicker]
