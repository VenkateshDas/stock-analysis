from __future__ import annotations

from datetime import datetime, date
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class StrategyConfig(BaseModel):
    strategy_id: str
    name: str
    version: str = "v1"
    description: str = ""
    instrument: str = "NIFTY"
    parameters: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    algo_id: str = "ALG-IN-BREAKOUT-V1"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RiskConfig(BaseModel):
    capital: float = 100000.0
    per_trade_risk_pct: float = 0.75
    daily_loss_cap_pct: float = 2.0
    max_open_positions: int = 1
    max_trades_per_day: int = 3
    cooldown_after_losses: int = 2
    expiry_position_size_multiplier: float = 0.5
    expiry_stop_multiplier: float = 0.8


class ExecutionPolicy(BaseModel):
    mode: str = "signal_only"  # signal_only | paper
    manual_approval_required: bool = True
    allow_live_auto_execution: bool = False


class BacktestConfig(BaseModel):
    symbol: str = "NIFTY"
    timeframe: str = "5m"
    start_date: date
    end_date: date
    initial_capital: float = 100000.0
    commission_pct: float = 0.03
    slippage_pct: float = 0.02
    strategy_id: str = "IN_BREAKOUT_V1"
    session_start: str = "09:30"     # trade window opens (also used as opening_range_end fallback)
    session_end: str = "15:00"
    # Strategy-tunable params — carried here so the engine uses them directly
    opening_range_end: str = "09:30" # ORB capture window: 9:15 → this time
    target_rr: float = 2.0           # profit target = stop_dist × target_rr
    ema_fast: int = 9
    ema_slow: int = 21
    volume_mult: float = 1.0


class SignalEvent(BaseModel):
    signal_id: str
    strategy_id: str
    symbol: str
    signal_type: str
    confidence: float
    price: float
    timestamp: datetime
    reason: str


class OrderIntent(BaseModel):
    intent_id: str
    algo_id: str
    strategy_version: str
    signal_id: str
    symbol: str
    side: str
    quantity: int
    order_type: str = "MARKET"
    status: str = "PENDING_APPROVAL"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None


class RiskDecision(BaseModel):
    allowed: bool
    reason: str
    quantity: int = 0
    stop_loss_price: Optional[float] = None


class BacktestTrade(BaseModel):
    run_id: str
    symbol: str
    side: str
    entry_time: datetime
    entry_price: float
    exit_time: datetime
    exit_price: float
    qty: int
    pnl: float
    pnl_pct: float


class EquityPoint(BaseModel):
    run_id: str
    timestamp: datetime
    equity: float


class BacktestReport(BaseModel):
    run_id: str
    strategy_id: str
    symbol: str
    start_date: date
    end_date: date
    total_trades: int
    win_rate: float
    net_pnl: float
    max_drawdown_pct: float
    sharpe: float
    sortino: float
    profit_factor: float
    cagr_pct: float
    promotion_pass: bool
    promotion_notes: str


class StrategyRegistrationRequest(BaseModel):
    config: StrategyConfig


class BacktestRunRequest(BaseModel):
    config: BacktestConfig
    risk: RiskConfig = Field(default_factory=RiskConfig)


class WalkforwardRunRequest(BaseModel):
    config: BacktestConfig
    risk: RiskConfig = Field(default_factory=RiskConfig)
    train_days: int = 30
    test_days: int = 10
    steps: int = 3


class BacktestRunStatus(BaseModel):
    run_id: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    report: Optional[BacktestReport] = None


class SignalsRunRequest(BaseModel):
    strategy_id: str = "IN_BREAKOUT_V1"
    symbol: str = "NIFTY"
    as_of: Optional[datetime] = None
    risk: RiskConfig = Field(default_factory=RiskConfig)


class OrderApprovalRequest(BaseModel):
    intent_id: str
    approved: bool


class RiskStatusResponse(BaseModel):
    date: date
    capital: float
    daily_loss_used_pct: float
    trades_taken: int
    max_trades_per_day: int
    open_positions: int
    max_open_positions: int


class AuditEvent(BaseModel):
    id: Optional[int] = None
    event_date: date
    event_time: datetime
    event_type: str
    run_id: Optional[str] = None
    strategy_id: Optional[str] = None
    algo_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


# ---- New models for redesigned Bot Lab ----

class KiteCallbackRequest(BaseModel):
    api_key: str
    api_secret: str
    request_token: str


class KiteCredentialsRequest(BaseModel):
    api_key: str
    api_secret: str


class KiteStatusResponse(BaseModel):
    connected: bool
    profile_name: Optional[str] = None
    available_margin: Optional[float] = None
    has_credentials: bool = False
    masked_api_key: Optional[str] = None


class BotSettings(BaseModel):
    mode: str = "paper"
    capital: float = 100000.0
    risk_config: RiskConfig = Field(default_factory=RiskConfig)
    api_key: Optional[str] = None
    api_secret: Optional[str] = None


class BotStatusResponse(BaseModel):
    is_running: bool
    mode: str
    today_trades: int
    today_pnl: float
    risk_used_pct: float


class LivePosition(BaseModel):
    symbol: str
    qty: int
    avg_price: float
    last_price: float
    unrealized_pnl: float
    product: str


class LiveOrder(BaseModel):
    order_id: str
    symbol: str
    side: str
    qty: int
    order_type: str
    status: str
    placed_at: str


class ToggleBotRequest(BaseModel):
    enabled: bool


class ExecuteOrderRequest(BaseModel):
    intent_id: str


# ---- AI Strategy Improvement ----

class StrategySuggestion(BaseModel):
    parameter: str
    label: str
    current_value: Any
    suggested_value: Any
    plain_reason: str


class StrategyImprovementResponse(BaseModel):
    run_id: str
    assessment: str
    confidence: str  # low | medium | high
    suggestions: List[StrategySuggestion] = Field(default_factory=list)
    improved_params: Dict[str, Any] = Field(default_factory=dict)
    model_used: str
    generated_at: str


class StrategyBlueprintRequest(BaseModel):
    symbol: str = "NIFTY"
    experience_level: str = "beginner"  # beginner | intermediate | advanced
    risk_level: str = "medium"          # low | medium | high
    objective: str = ""


class StrategyBlueprintResponse(BaseModel):
    summary: str
    confidence: str  # low | medium | high
    suggested_name: str
    suggested_description: str
    suggested_params: Dict[str, Any] = Field(default_factory=dict)
    notes: List[str] = Field(default_factory=list)
    model_used: str
    generated_at: str
