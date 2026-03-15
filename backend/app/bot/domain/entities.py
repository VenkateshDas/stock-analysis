from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class StrategyRun(BaseModel):
    run_id: str
    strategy_id: str
    status: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Fill(BaseModel):
    run_id: str
    symbol: str
    side: str
    qty: int
    price: float
    timestamp: datetime


class Position(BaseModel):
    symbol: str
    qty: int
    avg_price: float
    side: str


class RiskEvent(BaseModel):
    run_id: str
    event_type: str
    detail: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
