from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.bot.api import bot_service
from app.models.bot import (
    BacktestRunRequest,
    BacktestRunStatus,
    BacktestTrade,
    BotSettings,
    BotStatusResponse,
    EquityPoint,
    ExecuteOrderRequest,
    KiteCallbackRequest,
    KiteCredentialsRequest,
    KiteStatusResponse,
    OrderApprovalRequest,
    RiskStatusResponse,
    SignalsRunRequest,
    StrategyBlueprintRequest,
    StrategyBlueprintResponse,
    StrategyConfig,
    StrategyImprovementResponse,
    StrategyRegistrationRequest,
    ToggleBotRequest,
    WalkforwardRunRequest,
)

router = APIRouter(prefix="/bot")


# ---- Strategies ----

@router.post("/strategies/register")
async def register_strategy(req: StrategyRegistrationRequest):
    bot_service.register_strategy(req.config)
    return {"status": "ok", "strategy_id": req.config.strategy_id}


@router.get("/strategies", response_model=list[StrategyConfig])
async def list_strategies():
    return bot_service.list_strategies()


# ---- Backtests ----

@router.post("/backtests/run", response_model=BacktestRunStatus)
async def run_backtest(req: BacktestRunRequest):
    try:
        return bot_service.run_backtest(req)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Backtest failed: {exc}") from exc


@router.get("/backtests/{run_id}", response_model=BacktestRunStatus)
async def get_backtest_run(run_id: str):
    run = bot_service.get_backtest_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    return run


@router.get("/backtests/{run_id}/trades", response_model=list[BacktestTrade])
async def get_backtest_trades(run_id: str):
    return bot_service.get_backtest_trades(run_id)


@router.get("/backtests/{run_id}/equity", response_model=list[EquityPoint])
async def get_backtest_equity(run_id: str):
    return bot_service.get_backtest_equity(run_id)


@router.post("/backtests/{run_id}/improve", response_model=StrategyImprovementResponse)
async def improve_strategy(run_id: str):
    try:
        return bot_service.improve_strategy(run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI improvement failed: {exc}") from exc


@router.post("/strategies/blueprint", response_model=StrategyBlueprintResponse)
async def strategy_blueprint(req: StrategyBlueprintRequest):
    try:
        return bot_service.strategy_blueprint(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Blueprint generation failed: {exc}") from exc


@router.post("/walkforward/run")
async def run_walkforward(req: WalkforwardRunRequest):
    try:
        return bot_service.run_walkforward(req)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Walkforward failed: {exc}") from exc


# ---- Signals ----

@router.post("/signals/run")
async def run_signals(req: SignalsRunRequest):
    return bot_service.run_signals(req)


@router.get("/signals")
async def list_signals(on_date: date | None = Query(default=None, alias="date")):
    return bot_service.list_signals(on_date or date.today())


# ---- Order intents ----

@router.get("/orders/pending")
async def list_pending_intents():
    return bot_service.list_pending_intents()


@router.post("/orders/approve")
async def approve_order(req: OrderApprovalRequest):
    result = bot_service.approve_order(req)
    if not result["updated"]:
        raise HTTPException(status_code=404, detail="intent not found")
    return result


@router.post("/orders/{intent_id}/execute")
async def execute_order(intent_id: str):
    try:
        return bot_service.execute_order(intent_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Execution failed: {exc}") from exc


# ---- Risk ----

@router.get("/risk/status", response_model=RiskStatusResponse)
async def risk_status():
    return bot_service.risk_status()


# ---- Kite OAuth ----

@router.post("/kite/credentials")
async def save_kite_credentials(req: KiteCredentialsRequest):
    bot_service.save_kite_credentials(req.api_key, req.api_secret)
    return {"status": "ok", "message": "Credentials saved. Click 'Connect Zerodha Account' to complete login."}


@router.get("/kite/login-url")
async def kite_login_url():
    try:
        url = bot_service.kite_login_url()
        return {"login_url": url}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/kite/callback")
async def kite_callback(req: KiteCallbackRequest):
    try:
        result = bot_service.kite_callback(req)
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Kite login failed: {exc}") from exc


@router.get("/kite/status", response_model=KiteStatusResponse)
async def kite_status():
    return bot_service.kite_status()


@router.post("/kite/disconnect")
async def kite_disconnect():
    bot_service.kite_disconnect()
    return {"status": "ok", "message": "Disconnected from Kite. Switched to Paper Mode."}


# ---- Settings ----

@router.get("/settings", response_model=BotSettings)
async def get_settings():
    return bot_service.get_settings()


@router.post("/settings")
async def save_settings(settings: BotSettings):
    bot_service.save_settings(settings)
    return {"status": "ok"}


# ---- Bot on/off ----

@router.get("/status", response_model=BotStatusResponse)
async def get_bot_status():
    return bot_service.get_bot_status()


@router.post("/toggle")
async def toggle_bot(req: ToggleBotRequest):
    return bot_service.toggle_bot(req.enabled)


# ---- Live positions & orders ----

@router.get("/live/positions")
async def get_live_positions():
    return bot_service.get_live_positions()


@router.get("/live/orders")
async def get_live_orders():
    return bot_service.get_live_orders_today()


# ---- Audit ----

@router.get("/audit/{on_date}")
async def audit_events(on_date: date):
    return bot_service.audit_events(on_date)
