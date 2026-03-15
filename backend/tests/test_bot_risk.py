from datetime import datetime

from app.bot.risk.manager import DayRiskState, RiskManager
from app.models.bot import RiskConfig


def test_position_size_and_expiry_adjustment():
    mgr = RiskManager(RiskConfig(capital=100000, per_trade_risk_pct=1.0, expiry_position_size_multiplier=0.5))
    normal_qty = mgr.compute_position_size(entry_price=100, stop_price=99, is_expiry=False)
    expiry_qty = mgr.compute_position_size(entry_price=100, stop_price=99, is_expiry=True)

    assert normal_qty >= 1
    assert expiry_qty >= 1
    assert expiry_qty <= normal_qty


def test_trade_blocked_on_limits():
    mgr = RiskManager(RiskConfig(max_trades_per_day=3, max_open_positions=1, cooldown_after_losses=2))

    decision = mgr.check_trade_allowed(DayRiskState(trades_taken=3))
    assert decision.allowed is False
    assert decision.reason == 'max_trades_per_day_reached'

    decision = mgr.check_trade_allowed(DayRiskState(open_positions=1))
    assert decision.allowed is False
    assert decision.reason == 'max_open_positions_reached'

    decision = mgr.check_trade_allowed(DayRiskState(consecutive_losses=2))
    assert decision.allowed is False
    assert decision.reason == 'cooldown_after_consecutive_losses'


def test_expiry_day_detection():
    mgr = RiskManager(RiskConfig())
    thursday = datetime(2026, 2, 26, 10, 0)
    wednesday = datetime(2026, 2, 25, 10, 0)

    assert mgr.is_expiry_day(thursday) is True
    assert mgr.is_expiry_day(wednesday) is False
