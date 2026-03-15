from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from app.bot.auth.kite_auth import kite_auth
from app.bot.backtest.engine import BacktestEngine
from app.bot.backtest.walkforward import WalkForwardRunner
from app.bot.execution.brokers import build_order_intent
from app.bot.live.trading import live_trading
from app.bot.signals.engine import get_signal_engine
from app.bot.storage import repo
from app.models.bot import (
    AuditEvent,
    BacktestRunRequest,
    BacktestRunStatus,
    BotSettings,
    BotStatusResponse,
    KiteCallbackRequest,
    KiteStatusResponse,
    LiveOrder,
    LivePosition,
    OrderApprovalRequest,
    RiskConfig,
    RiskStatusResponse,
    SignalEvent,
    SignalsRunRequest,
    StrategyBlueprintRequest,
    StrategyConfig,
    WalkforwardRunRequest,
)


class BotService:
    def __init__(self):
        self.engine = BacktestEngine()
        self.walkforward = WalkForwardRunner()

    # ---- Strategy management ----

    def register_strategy(self, strategy: StrategyConfig) -> None:
        repo.register_strategy(strategy)
        repo.save_audit_event(
            AuditEvent(
                event_date=date.today(),
                event_time=datetime.utcnow(),
                event_type="strategy_registered",
                strategy_id=strategy.strategy_id,
                algo_id=strategy.algo_id,
                payload=strategy.model_dump(mode="json"),
            )
        )

    def list_strategies(self) -> List[StrategyConfig]:
        return repo.list_strategies()

    # ---- Backtest ----

    def run_backtest(self, req: BacktestRunRequest) -> BacktestRunStatus:
        run_id = f"BT-{uuid.uuid4().hex[:10]}"
        repo.create_backtest_run(run_id, req.config.strategy_id, req.config.symbol)
        repo.save_audit_event(
            AuditEvent(
                event_date=date.today(),
                event_time=datetime.utcnow(),
                event_type="backtest_started",
                run_id=run_id,
                strategy_id=req.config.strategy_id,
                algo_id="ALG-IN-BREAKOUT-V1",
                payload=req.model_dump(mode="json"),
            )
        )
        try:
            artifacts = self.engine.run(req.config, req.risk, run_id=run_id)
            repo.save_backtest_trades(artifacts.trades)
            repo.save_backtest_equity(artifacts.equity)
            repo.finish_backtest_run(run_id, "COMPLETED", artifacts.report)
            repo.save_audit_event(
                AuditEvent(
                    event_date=date.today(),
                    event_time=datetime.utcnow(),
                    event_type="backtest_completed",
                    run_id=run_id,
                    strategy_id=req.config.strategy_id,
                    algo_id="ALG-IN-BREAKOUT-V1",
                    payload={
                        "report": artifacts.report.model_dump(mode="json"),
                        "data_quality": artifacts.data_quality,
                    },
                )
            )
        except Exception as exc:
            repo.finish_backtest_run(run_id, "FAILED", None)
            repo.save_audit_event(
                AuditEvent(
                    event_date=date.today(),
                    event_time=datetime.utcnow(),
                    event_type="backtest_failed",
                    run_id=run_id,
                    strategy_id=req.config.strategy_id,
                    algo_id="ALG-IN-BREAKOUT-V1",
                    payload={"error": str(exc)},
                )
            )
            raise

        record = repo.get_backtest_run(run_id)
        assert record is not None
        return BacktestRunStatus(**record)

    def get_backtest_run(self, run_id: str) -> BacktestRunStatus | None:
        record = repo.get_backtest_run(run_id)
        if record is None:
            return None
        return BacktestRunStatus(**record)

    def get_backtest_trades(self, run_id: str):
        return repo.get_backtest_trades(run_id)

    def get_backtest_equity(self, run_id: str):
        return repo.get_backtest_equity(run_id)

    def improve_strategy(self, run_id: str):
        from app.bot.ai.strategy_advisor import strategy_advisor_service

        status = self.get_backtest_run(run_id)
        if status is None or status.report is None:
            raise ValueError(f"Backtest {run_id} not found or has no completed report")

        trades = self.get_backtest_trades(run_id)
        strategies = self.list_strategies()
        strategy = next(
            (s for s in strategies if s.strategy_id == status.report.strategy_id),
            None,
        )
        current_params = strategy.parameters if strategy else {}
        symbol = status.report.symbol

        return strategy_advisor_service.improve(
            report=status.report,
            trades=trades,
            current_params=current_params,
            symbol=symbol,
        )

    def strategy_blueprint(self, req: StrategyBlueprintRequest):
        from app.bot.ai.strategy_advisor import strategy_advisor_service

        return strategy_advisor_service.build_blueprint(req)

    def run_walkforward(self, req: WalkforwardRunRequest) -> Dict:
        out = self.walkforward.run(
            req.config,
            req.risk,
            train_days=req.train_days,
            test_days=req.test_days,
            steps=req.steps,
        )
        repo.save_audit_event(
            AuditEvent(
                event_date=date.today(),
                event_time=datetime.utcnow(),
                event_type="walkforward_completed",
                strategy_id=req.config.strategy_id,
                algo_id="ALG-IN-BREAKOUT-V1",
                payload=out,
            )
        )
        return out

    # ---- Signals (real engine) ----

    def run_signals(self, req: SignalsRunRequest) -> Dict:
        # Load registered strategy parameters so signal engine uses user's config
        strategy_params: dict = {}
        strategies = repo.list_strategies()
        active = next((s for s in strategies if s.strategy_id == req.strategy_id), None)
        if active:
            strategy_params = active.parameters or {}

        engine = get_signal_engine()
        result = engine.generate(
            symbol=req.symbol,
            strategy_id=req.strategy_id,
            risk_config=req.risk.model_dump() if req.risk else None,
            strategy_params=strategy_params,
        )

        signal_type = result["signal_type"]
        confidence = result["confidence"]
        price = result["price"]
        reason = result["reason"]

        if signal_type == "NONE":
            signal = SignalEvent(
                signal_id=f"SIG-{uuid.uuid4().hex[:12]}",
                strategy_id=req.strategy_id,
                symbol=req.symbol,
                signal_type="NONE",
                confidence=confidence,
                price=price,
                timestamp=req.as_of or datetime.utcnow(),
                reason=reason,
            )
            repo.save_signal(signal)
            repo.save_audit_event(
                AuditEvent(
                    event_date=date.today(),
                    event_time=datetime.utcnow(),
                    event_type="signal_generated",
                    strategy_id=req.strategy_id,
                    algo_id="ALG-IN-BREAKOUT-V1",
                    payload={"signal": signal.model_dump(mode="json"), "order_intent": None},
                )
            )
            return {"signal": signal, "order_intent": None}

        signal = SignalEvent(
            signal_id=f"SIG-{uuid.uuid4().hex[:12]}",
            strategy_id=req.strategy_id,
            symbol=req.symbol,
            signal_type=signal_type,
            confidence=confidence,
            price=price,
            timestamp=req.as_of or datetime.utcnow(),
            reason=reason,
        )
        repo.save_signal(signal)

        intent = build_order_intent(
            algo_id="ALG-IN-BREAKOUT-V1",
            strategy_version="v1",
            signal_id=signal.signal_id,
            symbol=req.symbol,
            side=signal_type,
            quantity=1,
        )
        repo.create_order_intent(intent)

        # Stash signal price on the intent row for paper execution
        try:
            repo.save_setting(f"signal_price_{intent.intent_id}", str(price))
        except Exception:
            pass

        repo.save_audit_event(
            AuditEvent(
                event_date=date.today(),
                event_time=datetime.utcnow(),
                event_type="signal_generated",
                strategy_id=req.strategy_id,
                algo_id=intent.algo_id,
                payload={
                    "signal": signal.model_dump(mode="json"),
                    "intent": intent.model_dump(mode="json"),
                },
            )
        )
        return {"signal": signal, "order_intent": intent}

    def list_signals(self, on_date: date):
        return repo.list_signals(on_date)

    def list_pending_intents(self) -> List[Dict]:
        return repo.get_pending_intents()

    # ---- Order approval + execution ----

    def approve_order(self, req: OrderApprovalRequest) -> Dict:
        ok = repo.approve_order_intent(req.intent_id, req.approved)
        repo.save_audit_event(
            AuditEvent(
                event_date=date.today(),
                event_time=datetime.utcnow(),
                event_type="order_intent_reviewed",
                algo_id="ALG-IN-BREAKOUT-V1",
                payload={"intent_id": req.intent_id, "approved": req.approved, "updated": ok},
            )
        )
        return {"updated": ok}

    def execute_order(self, intent_id: str) -> Dict:
        mode = repo.get_setting("bot_mode") or "paper"
        kite_client = kite_auth.get_kite_client() if mode == "live" else None

        # Inject signal price into intent dict before execution
        intent = repo.get_order_intent(intent_id)
        if intent is not None:
            price_str = repo.get_setting(f"signal_price_{intent_id}")
            if price_str:
                try:
                    intent["signal_price"] = float(price_str)
                except ValueError:
                    pass

        result = live_trading.execute_approved_intent(intent_id, mode, kite_client)
        repo.save_audit_event(
            AuditEvent(
                event_date=date.today(),
                event_time=datetime.utcnow(),
                event_type="order_executed",
                algo_id="ALG-IN-BREAKOUT-V1",
                payload=result,
            )
        )
        return result

    # ---- Risk status (real DB query) ----

    def risk_status(self) -> RiskStatusResponse:
        capital_str = repo.get_setting("bot_capital") or "100000"
        try:
            capital = float(capital_str)
        except ValueError:
            capital = 100000.0

        daily_loss_cap_str = repo.get_setting("daily_loss_cap_pct") or "2.0"
        try:
            daily_loss_cap_pct = float(daily_loss_cap_str)
        except ValueError:
            daily_loss_cap_pct = 2.0

        max_trades_str = repo.get_setting("max_trades_per_day") or "3"
        try:
            max_trades_per_day = int(max_trades_str)
        except ValueError:
            max_trades_per_day = 3

        trades_taken = repo.get_today_trade_count()
        today_pnl = repo.get_today_pnl()

        daily_loss_limit = capital * (daily_loss_cap_pct / 100.0)
        daily_loss_used_pct = (abs(min(today_pnl, 0)) / max(daily_loss_limit, 1.0)) * 100.0

        open_positions = len(repo.get_open_paper_positions())

        return RiskStatusResponse(
            date=date.today(),
            capital=capital,
            daily_loss_used_pct=round(daily_loss_used_pct, 2),
            trades_taken=trades_taken,
            max_trades_per_day=max_trades_per_day,
            open_positions=open_positions,
            max_open_positions=1,
        )

    # ---- Kite auth ----

    def kite_login_url(self) -> str:
        session = kite_auth.load_session()
        if not session or not session.get("api_key"):
            raise ValueError("No API key saved. Please save credentials first.")
        return kite_auth.get_login_url(session["api_key"])

    def kite_callback(self, req: KiteCallbackRequest) -> Dict:
        session = kite_auth.complete_login(req.api_key, req.api_secret, req.request_token)
        return {
            "connected": True,
            "user_name": session.get("user_name", ""),
            "user_id": session.get("user_id", ""),
        }

    def kite_status(self) -> KiteStatusResponse:
        connected = kite_auth.is_connected()
        has_creds = kite_auth.has_credentials()
        profile = kite_auth.get_profile() if connected else None
        margin = kite_auth.get_available_margin() if connected else None
        masked_key = kite_auth.get_masked_api_key()
        return KiteStatusResponse(
            connected=connected,
            profile_name=profile["user_name"] if profile else None,
            available_margin=margin,
            has_credentials=has_creds,
            masked_api_key=masked_key,
        )

    def save_kite_credentials(self, api_key: str, api_secret: str) -> None:
        kite_auth.save_credentials(api_key, api_secret)

    def kite_disconnect(self) -> None:
        kite_auth.disconnect()

    # ---- Bot settings ----

    def get_settings(self) -> BotSettings:
        mode = repo.get_setting("bot_mode") or "paper"
        capital_str = repo.get_setting("bot_capital") or "100000"
        try:
            capital = float(capital_str)
        except ValueError:
            capital = 100000.0

        per_trade_risk_str = repo.get_setting("per_trade_risk_pct") or "0.75"
        daily_loss_cap_str = repo.get_setting("daily_loss_cap_pct") or "2.0"
        max_trades_str = repo.get_setting("max_trades_per_day") or "3"

        risk_config = RiskConfig(
            capital=capital,
            per_trade_risk_pct=float(per_trade_risk_str),
            daily_loss_cap_pct=float(daily_loss_cap_str),
            max_trades_per_day=int(max_trades_str),
        )

        masked_key = kite_auth.get_masked_api_key()

        return BotSettings(
            mode=mode,
            capital=capital,
            risk_config=risk_config,
            api_key=masked_key,
        )

    def save_settings(self, settings: BotSettings) -> None:
        repo.save_setting("bot_mode", settings.mode)
        repo.save_setting("bot_capital", str(settings.capital))
        repo.save_setting("per_trade_risk_pct", str(settings.risk_config.per_trade_risk_pct))
        repo.save_setting("daily_loss_cap_pct", str(settings.risk_config.daily_loss_cap_pct))
        repo.save_setting("max_trades_per_day", str(settings.risk_config.max_trades_per_day))

        if settings.api_key and not settings.api_key.endswith("****"):
            api_secret = settings.api_secret or ""
            kite_auth.save_credentials(settings.api_key, api_secret)

    # ---- Bot on/off ----

    def get_bot_status(self) -> BotStatusResponse:
        is_running = (repo.get_setting("bot_running") or "false") == "true"
        mode = repo.get_setting("bot_mode") or "paper"
        trades_taken = repo.get_today_trade_count()
        today_pnl = repo.get_today_pnl()

        capital_str = repo.get_setting("bot_capital") or "100000"
        try:
            capital = float(capital_str)
        except ValueError:
            capital = 100000.0

        daily_loss_cap_str = repo.get_setting("daily_loss_cap_pct") or "2.0"
        try:
            daily_loss_cap_pct = float(daily_loss_cap_str)
        except ValueError:
            daily_loss_cap_pct = 2.0

        daily_loss_limit = capital * (daily_loss_cap_pct / 100.0)
        risk_used_pct = (abs(min(today_pnl, 0)) / max(daily_loss_limit, 1.0)) * 100.0

        return BotStatusResponse(
            is_running=is_running,
            mode=mode,
            today_trades=trades_taken,
            today_pnl=round(today_pnl, 2),
            risk_used_pct=round(risk_used_pct, 2),
        )

    def toggle_bot(self, enabled: bool) -> Dict:
        repo.save_setting("bot_running", "true" if enabled else "false")
        return {"is_running": enabled}

    # ---- Live positions / orders ----

    def get_live_positions(self) -> List[Dict]:
        mode = repo.get_setting("bot_mode") or "paper"
        kite_client = kite_auth.get_kite_client() if mode == "live" else None
        return live_trading.get_live_positions(mode, kite_client)

    def get_live_orders_today(self) -> List[Dict]:
        mode = repo.get_setting("bot_mode") or "paper"
        kite_client = kite_auth.get_kite_client() if mode == "live" else None
        return live_trading.get_live_orders_today(mode, kite_client)

    # ---- Audit ----

    def audit_events(self, on_date: date):
        return repo.get_audit_events(on_date)
