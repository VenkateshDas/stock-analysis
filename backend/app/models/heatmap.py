from typing import Optional
from pydantic import BaseModel


class HeatmapStock(BaseModel):
    symbol: str
    name: str
    sector: str
    industry: str
    weight: float
    price: Optional[float] = None
    change_pct: Optional[float] = None


class HeatmapSector(BaseModel):
    name: str
    total_weight: float
    stocks: list[HeatmapStock]


class HeatmapData(BaseModel):
    index_symbol: str
    timestamp: str
    sectors: list[HeatmapSector]
