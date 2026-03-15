from pydantic import BaseModel
from typing import Optional


class ValuationMetrics(BaseModel):
    symbol: str
    trade_date: str

    # Core multiples
    trailing_pe: Optional[float]        # trailing 12-month P/E
    forward_pe: Optional[float]         # next 12-month P/E estimate
    price_to_book: Optional[float]      # P/B ratio
    dividend_yield: Optional[float]     # % (already multiplied by 100)

    # Derived
    earnings_yield: Optional[float]     # 1 / trailing_pe * 100  (%)
    equity_risk_premium: Optional[float]  # earnings_yield - us_10y_yield  (%)

    # Context
    historical_pe_avg: Optional[float]  # long-run average P/E for this index
    pe_signal: str                      # "cheap" | "fair" | "stretched" | "expensive" | "unavailable"
    data_source: str                    # "ETF proxy: SPY" | "Constituent-weighted" etc.
