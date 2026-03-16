from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


class TradeStatus(str, Enum):
    OPEN = "OPEN"
    TARGET_HIT = "TARGET_HIT"
    STOP_HIT = "STOP_HIT"
    TREND_EXIT = "TREND_EXIT"
    TIME_STOP = "TIME_STOP"
    CLOSED = "CLOSED"          # manually closed by user


class ExitAlert(BaseModel):
    type: str        # "stop_hit" | "partial_target" | "target_hit" | "trend_exit" | "time_stop"
    severity: str    # "danger" | "success" | "warning" | "info"
    message: str


class PaperTrade(BaseModel):
    id: str
    symbol: str
    company_name: str
    sector: str
    strategy: str              # "pullback" | "momentum" | "vcp"
    entry_price: float
    stop_price: float
    target_price: float
    atr: float
    shares: int
    virtual_capital: float
    entry_date: str            # "YYYY-MM-DD"
    notes: Optional[str] = None
    status: TradeStatus
    exit_price: Optional[float] = None
    exit_date: Optional[str] = None
    created_at: str


class PaperTradeCreate(BaseModel):
    symbol: str
    company_name: str
    sector: str = ""
    strategy: str = "pullback"
    entry_price: float
    stop_price: float
    target_price: float
    atr: float
    notes: Optional[str] = None
    virtual_capital: float = 100000.0
    capital_deployed: Optional[float] = None


class PaperTradeLiveStatus(BaseModel):
    trade: PaperTrade
    current_price: Optional[float]
    current_pnl: Optional[float]            # ₹ profit/loss
    current_pnl_pct: Optional[float]        # % return on capital deployed
    r_multiple: Optional[float]             # pnl / initial risk amount
    progress_to_target_pct: Optional[float] # 0–100 bar fill
    days_open: int
    alerts: List[ExitAlert]
    ema20: Optional[float] = None
    ema50: Optional[float] = None


class PositionSizingResult(BaseModel):
    virtual_capital: float
    risk_pct: float = 1.0
    risk_amount: float
    entry_price: float
    stop_price: float
    target_price: float
    stop_distance: float
    target_distance: float
    risk_reward: float
    shares: int
    capital_needed: float
    capital_pct: float
    max_loss: float
    max_gain: float


class PaperTradeCloseRequest(BaseModel):
    exit_price: float
