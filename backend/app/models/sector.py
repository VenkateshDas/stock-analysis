from pydantic import BaseModel, Field
from typing import List, Optional


# ── Global sector ETF performance ────────────────────────────────────────────


class SectorPerformance(BaseModel):
    """Individual sector ETF performance (used for the global/regional view)."""
    sector_name: str
    ticker: str
    change_pct: float
    change_pts: float
    is_positive: bool


class GlobalSectorSummary(BaseModel):
    """Regional sector performance summary built from sector-tracking ETFs."""
    trade_date: str
    region: str
    positive_sectors: List[SectorPerformance]
    negative_sectors: List[SectorPerformance]
    neutral_sectors: List[SectorPerformance]


# ── Per-stock constituent analysis ───────────────────────────────────────────


class StockBreakdown(BaseModel):
    """Full analysis for a single index constituent."""
    symbol: str
    name: str
    sector: str
    industry: str = ""
    weight: float             # % of index (0–100)
    daily_change_pct: float   # price change vs previous close
    contribution_pct: float   # weight × change / 100  (index-point contribution)
    last_close: float
    prev_close: float
    is_positive: bool
    above_sma200: Optional[bool] = None   # True if last_close > 200-day SMA


# ── Sector-level aggregation ─────────────────────────────────────────────────


class SectorBreakdown(BaseModel):
    """Aggregated performance for all stocks in one sector."""
    sector: str
    weight: float             # sum of constituent weights in this sector
    daily_change_pct: float   # weighted-average daily change
    contribution_pct: float   # total sector contribution to index move
    stock_count: int
    analyzed_count: int       # stocks for which price data was available
    top_gainers: List[StockBreakdown]   # top 3 by daily_change_pct
    top_losers: List[StockBreakdown]    # bottom 3 by daily_change_pct
    stocks: List[StockBreakdown]        # all stocks, sorted by weight desc


# ── Index-level response ─────────────────────────────────────────────────────


class IndexSectorAnalysis(BaseModel):
    """Complete sector + constituent breakdown for a single index."""
    index_symbol: str
    index_name: str
    proxy_etf: str
    trade_date: str
    data_source: str
    total_constituents: int
    analyzed_constituents: int
    sectors: List[SectorBreakdown]    # sorted by weight desc
    sector_count: int
    top_gainers: List[StockBreakdown]  # top 5 movers (any sector)
    top_losers: List[StockBreakdown]   # bottom 5 movers (any sector)
    positive_sector_count: int
    negative_sector_count: int
    pct_above_sma200: Optional[float] = None  # % of analyzed stocks above 200-day SMA
