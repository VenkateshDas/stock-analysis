from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.models.bot import RiskConfig, RiskDecision


@dataclass
class DayRiskState:
    trades_taken: int = 0
    open_positions: int = 0
    consecutive_losses: int = 0
    realized_pnl: float = 0.0


class RiskManager:
    def __init__(self, risk: RiskConfig):
        self.risk = risk

    def is_expiry_day(self, ts: datetime) -> bool:
        # Weekly index expiry is typically Thursday.
        return ts.weekday() == 3

    def max_daily_loss_amount(self) -> float:
        return self.risk.capital * (self.risk.daily_loss_cap_pct / 100.0)

    def per_trade_risk_amount(self) -> float:
        return self.risk.capital * (self.risk.per_trade_risk_pct / 100.0)

    def compute_position_size(self, entry_price: float, stop_price: float, is_expiry: bool = False) -> int:
        risk_per_unit = max(abs(entry_price - stop_price), 0.01)
        qty = int(self.per_trade_risk_amount() / risk_per_unit)
        if is_expiry:
            qty = int(qty * self.risk.expiry_position_size_multiplier)
        return max(qty, 1)

    def check_trade_allowed(self, state: DayRiskState) -> RiskDecision:
        if state.open_positions >= self.risk.max_open_positions:
            return RiskDecision(allowed=False, reason="max_open_positions_reached")
        if state.trades_taken >= self.risk.max_trades_per_day:
            return RiskDecision(allowed=False, reason="max_trades_per_day_reached")
        if state.consecutive_losses >= self.risk.cooldown_after_losses:
            return RiskDecision(allowed=False, reason="cooldown_after_consecutive_losses")
        if abs(min(state.realized_pnl, 0.0)) >= self.max_daily_loss_amount():
            return RiskDecision(allowed=False, reason="daily_loss_cap_reached")
        return RiskDecision(allowed=True, reason="ok")
