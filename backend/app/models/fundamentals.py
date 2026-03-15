from pydantic import BaseModel
from typing import Optional


class StockFundamentals(BaseModel):
    ticker: str
    trade_date: str

    # Valuation
    trailing_pe: Optional[float]
    forward_pe: Optional[float]
    price_to_book: Optional[float]
    ev_to_ebitda: Optional[float]

    # Income & growth
    earnings_growth: Optional[float]    # yoy EPS growth (0.15 = 15%)
    revenue_growth: Optional[float]     # yoy revenue growth

    # Returns
    return_on_equity: Optional[float]   # ROE (0.15 = 15%)
    profit_margins: Optional[float]     # net profit margin

    # Capital structure
    debt_to_equity: Optional[float]
    current_ratio: Optional[float]

    # Income
    dividend_yield: Optional[float]     # % (already × 100)
    payout_ratio: Optional[float]       # 0–1

    # Market characteristics
    beta: Optional[float]
    market_cap: Optional[float]         # in native currency
    currency: str
