"""Paper trade tracker — create, monitor, and close paper swing trades."""
from __future__ import annotations

import math
import uuid
from datetime import date, datetime, time as dtime, timedelta
from typing import List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from app.api.v1.auth import AuthUser, get_current_user
from app.bot.storage import repo
from app.models.paper_trade import (
    ExitAlert,
    PaperTrade,
    PaperTradeCloseRequest,
    PaperTradeCreate,
    PaperTradeLiveStatus,
    PositionSizingResult,
    ProjectionPoint,
    TradeProjection,
    TradeStatus,
)
from app.services.analysis.previous_day import analysis_orchestrator
from app.services.data_providers.yahoo import yahoo_provider

router = APIRouter(prefix="/paper-trades")

_VIRTUAL_CAPITAL_KEY = "paper_virtual_capital"
_DEFAULT_CAPITAL = 100000.0
_RISK_PCT = 1.0          # 1 % of capital per trade
_ATR_STOP_MULT = 1.5     # stop = entry − 1.5 × ATR
_RR_TARGET = 2.5         # target = entry + 2.5 × stop_distance
_TIME_STOP_DAYS = 20


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_virtual_capital(user_id: str = "default") -> float:
    val = repo.get_setting(_VIRTUAL_CAPITAL_KEY, user_id=user_id)
    return float(val) if val else _DEFAULT_CAPITAL


def _compute_shares(entry: float, stop: float, virtual_capital: float) -> float:
    stop_dist = entry - stop
    if stop_dist <= 0:
        return 1.0
    risk_amount = virtual_capital * (_RISK_PCT / 100)
    return round(max(0.01, risk_amount / stop_dist), 4)


def _build_alerts(
    trade: PaperTrade,
    current_price: float,
    ema20: Optional[float],
    ema50: Optional[float],
) -> List[ExitAlert]:
    alerts: List[ExitAlert] = []
    stop = trade.stop_price
    target = trade.target_price
    entry = trade.entry_price

    if current_price <= stop:
        alerts.append(ExitAlert(
            type="stop_hit",
            severity="danger",
            message=f"Stop hit — price ₹{current_price:,.2f} touched stop ₹{stop:,.2f}. Exit now to limit loss.",
        ))

    if current_price >= target:
        alerts.append(ExitAlert(
            type="target_hit",
            severity="success",
            message=f"Target reached at ₹{target:,.2f} — profitable exit opportunity.",
        ))
    elif current_price >= entry + 0.6 * (target - entry):
        alerts.append(ExitAlert(
            type="partial_target",
            severity="warning",
            message=f"60% of target reached. Consider selling half to lock in profit, trail the rest.",
        ))

    if ema20 is not None and ema50 is not None and ema20 < ema50:
        alerts.append(ExitAlert(
            type="trend_exit",
            severity="warning",
            message="Short-term average crossed below medium-term average — trend weakening. Review position.",
        ))

    entry_dt = datetime.fromisoformat(trade.entry_date)
    days_open = (datetime.utcnow() - entry_dt).days
    if days_open >= _TIME_STOP_DAYS and current_price < target:
        alerts.append(ExitAlert(
            type="time_stop",
            severity="info",
            message=f"Trade is {days_open} days old with no target hit. Reassess — is the thesis still valid?",
        ))

    return alerts


def _enrich(trade: PaperTrade) -> PaperTradeLiveStatus:
    """Fetch live price + indicators and compute all exit alerts."""
    current_price: Optional[float] = None
    ema20: Optional[float] = None
    ema50: Optional[float] = None

    try:
        analysis = analysis_orchestrator.get_analysis_for_ticker_with_interval(
            symbol=trade.symbol,
            ticker=trade.symbol,
            currency="INR",
            interval="1d",
        )
        if analysis:
            current_price = analysis.last_close
            ema20 = analysis.technical.ema20
            ema50 = analysis.technical.ema50
    except Exception:
        pass

    entry_dt = datetime.fromisoformat(trade.entry_date)
    days_open = (datetime.utcnow() - entry_dt).days

    current_pnl: Optional[float] = None
    current_pnl_pct: Optional[float] = None
    r_multiple: Optional[float] = None
    progress_pct: Optional[float] = None
    alerts: List[ExitAlert] = []

    if current_price is not None:
        pnl = (current_price - trade.entry_price) * trade.shares
        capital_deployed = trade.entry_price * trade.shares
        current_pnl = round(pnl, 2)
        current_pnl_pct = round(pnl / capital_deployed * 100, 2) if capital_deployed else None

        risk_amount = (trade.entry_price - trade.stop_price) * trade.shares
        r_multiple = round(pnl / risk_amount, 2) if risk_amount > 0 else None

        target_dist = trade.target_price - trade.entry_price
        price_dist = current_price - trade.entry_price
        if target_dist > 0:
            progress_pct = round(max(0.0, min(100.0, price_dist / target_dist * 100)), 1)

        if trade.status == TradeStatus.OPEN:
            alerts = _build_alerts(trade, current_price, ema20, ema50)

    return PaperTradeLiveStatus(
        trade=trade,
        current_price=current_price,
        current_pnl=current_pnl,
        current_pnl_pct=current_pnl_pct,
        r_multiple=r_multiple,
        progress_to_target_pct=progress_pct,
        days_open=days_open,
        alerts=alerts,
        ema20=ema20,
        ema50=ema50,
    )


# ── GBM Projection ───────────────────────────────────────────────────────────

def _next_trading_days(start: date, n: int) -> list[date]:
    """Return the next n Mon–Fri dates after start."""
    result: list[date] = []
    d = start
    while len(result) < n:
        d += timedelta(days=1)
        if d.weekday() < 5:
            result.append(d)
    return result


def _strip_tz(idx: pd.DatetimeIndex) -> pd.DatetimeIndex:
    return idx.tz_localize(None) if idx.tz is not None else idx


def _gbm_projection(
    ticker: str,
    entry_price: float,
    entry_date_str: Optional[str] = None,
    project_days: int = 20,
) -> Optional[TradeProjection]:
    """
    Geometric Brownian Motion projection.

    Fetches 90 trading days of history to estimate:
      μ  = mean of daily log-returns  (drift)
      σ  = std  of daily log-returns  (volatility)

    Then projects `project_days` trading days forward from entry_price:
      mid(d)   = entry × exp(μ·d)
      upper(d) = entry × exp(μ·d + σ·√d)   ← +1σ percentile
      lower(d) = entry × exp(μ·d − σ·√d)   ← −1σ percentile

    If entry_date_str is given, also returns actual closes since entry
    and a direction indicator comparing current price to today's projected midline.
    """
    df = yahoo_provider.get_history(ticker, 90)
    if df.empty or len(df) < 10:
        return None

    closes = df["Close"].values.astype(float)
    log_ret = np.diff(np.log(closes))
    mu = float(np.mean(log_ret))
    sigma = float(np.std(log_ret, ddof=1))

    # ── Build projection cone ────────────────────────────────────────────────
    entry_dt = datetime.strptime(entry_date_str, "%Y-%m-%d").date() if entry_date_str else date.today()
    entry_ts = int(datetime.combine(entry_dt, dtime(0, 0)).timestamp())

    # Anchor point: d=0
    proj: list[ProjectionPoint] = [
        ProjectionPoint(time=entry_ts, mid=round(entry_price, 2),
                        upper=round(entry_price, 2), lower=round(entry_price, 2))
    ]
    for i, td in enumerate(_next_trading_days(entry_dt, project_days), 1):
        t_unix = int(datetime.combine(td, dtime(0, 0)).timestamp())
        mid   = entry_price * math.exp(mu * i)
        upper = entry_price * math.exp(mu * i + sigma * math.sqrt(i))
        lower = entry_price * math.exp(mu * i - sigma * math.sqrt(i))
        proj.append(ProjectionPoint(
            time=t_unix,
            mid=round(mid, 2), upper=round(upper, 2), lower=round(lower, 2),
        ))

    # ── Actual price path since entry (My Trades use-case) ──────────────────
    actual: Optional[list[dict]] = None
    direction: Optional[str] = None
    direction_label: Optional[str] = None
    direction_detail: Optional[str] = None

    if entry_date_str:
        entry_dt_pd = pd.Timestamp(entry_date_str).normalize()
        idx_dates = _strip_tz(df.index).normalize()
        filtered = df[idx_dates >= entry_dt_pd]

        if not filtered.empty:
            actual = []
            for raw_idx, row in filtered.iterrows():
                ts_idx = pd.Timestamp(raw_idx)
                if ts_idx.tz is not None:
                    ts_idx = ts_idx.tz_localize(None)
                actual.append({"time": int(ts_idx.timestamp()), "value": round(float(row["Close"]), 2)})

            if actual:
                current_price = actual[-1]["value"]
                d_open = len(actual)          # trading days open
                mid_now   = entry_price * math.exp(mu * d_open)
                lower_now = entry_price * math.exp(mu * d_open - sigma * math.sqrt(d_open))

                if current_price >= mid_now:
                    direction = "on_track"
                    direction_label = "On Track"
                    direction_detail = "Price is tracking above the projected path — developing as expected"
                elif current_price >= lower_now:
                    direction = "stalling"
                    direction_label = "Stalling"
                    direction_detail = "Price is below the projected midline but within normal volatility range"
                else:
                    direction = "breaking_down"
                    direction_label = "Breaking Down"
                    direction_detail = "Price has fallen below the projected lower band — trade is off track"

    return TradeProjection(
        projection=proj,
        actual=actual,
        direction=direction,
        direction_label=direction_label,
        direction_detail=direction_detail,
        mu_annual=round(mu * 252 * 100, 2),
        sigma_annual=round(sigma * math.sqrt(252) * 100, 2),
    )


# ── Settings ─────────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(current_user: AuthUser = Depends(get_current_user)):
    return {"virtual_capital": _get_virtual_capital(user_id=current_user.id)}


@router.put("/settings")
async def update_settings(
    body: dict,
    current_user: AuthUser = Depends(get_current_user),
):
    capital = body.get("virtual_capital")
    if capital and float(capital) > 0:
        repo.save_setting(_VIRTUAL_CAPITAL_KEY, str(float(capital)), user_id=current_user.id)
    return {"virtual_capital": _get_virtual_capital(user_id=current_user.id)}


# ── Position sizing calculator ────────────────────────────────────────────────

@router.get("/sizing")
async def calculate_sizing(
    entry_price: float,
    stop_price: float,
    target_price: float,
    virtual_capital: Optional[float] = None,
    current_user: AuthUser = Depends(get_current_user),
):
    cap = virtual_capital or _get_virtual_capital(user_id=current_user.id)
    stop_dist = entry_price - stop_price
    if stop_dist <= 0:
        raise HTTPException(status_code=400, detail="Stop must be below entry price")
    target_dist = target_price - entry_price
    risk_amount = cap * (_RISK_PCT / 100)
    shares = round(max(0.01, risk_amount / stop_dist), 4)
    capital_needed = shares * entry_price
    return PositionSizingResult(
        virtual_capital=cap,
        risk_pct=_RISK_PCT,
        risk_amount=round(risk_amount, 2),
        entry_price=round(entry_price, 2),
        stop_price=round(stop_price, 2),
        target_price=round(target_price, 2),
        stop_distance=round(stop_dist, 2),
        target_distance=round(target_dist, 2),
        risk_reward=round(target_dist / stop_dist, 2) if stop_dist > 0 else 0,
        shares=shares,
        capital_needed=round(capital_needed, 2),
        capital_pct=round(capital_needed / cap * 100, 2),
        max_loss=round(shares * stop_dist, 2),
        max_gain=round(shares * target_dist, 2),
    )


# ── Projection ───────────────────────────────────────────────────────────────

@router.get("/projection", response_model=TradeProjection)
async def get_projection(
    ticker: str,
    entry_price: float,
    stop_price: float,
    target_price: float,
    entry_date: Optional[str] = None,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    GBM-based projection cone for a trade.
    Pass entry_date (YYYY-MM-DD) to also receive the actual price path
    since entry and a direction indicator.
    """
    result = _gbm_projection(ticker, entry_price, entry_date_str=entry_date)
    if result is None:
        raise HTTPException(status_code=404, detail="Insufficient historical data for projection")
    return result


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("", response_model=PaperTradeLiveStatus)
async def create_trade(
    body: PaperTradeCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    cap = body.virtual_capital or _get_virtual_capital(user_id=current_user.id)
    if body.capital_deployed and body.capital_deployed > 0 and body.entry_price > 0:
        shares = round(body.capital_deployed / body.entry_price, 4)
    else:
        shares = _compute_shares(body.entry_price, body.stop_price, cap)
    trade_id = str(uuid.uuid4())
    entry_date = date.today().isoformat()
    repo.create_paper_trade(body, trade_id, shares, entry_date, user_id=current_user.id)
    trade = repo.get_paper_trade(trade_id, user_id=current_user.id)
    if not trade:
        raise HTTPException(status_code=500, detail="Failed to save trade")
    return _enrich(trade)


@router.get("", response_model=List[PaperTradeLiveStatus])
async def list_trades(
    open_only: bool = False,
    current_user: AuthUser = Depends(get_current_user),
):
    trades = repo.list_paper_trades(open_only=open_only, user_id=current_user.id)
    return [_enrich(t) for t in trades]


@router.get("/{trade_id}", response_model=PaperTradeLiveStatus)
async def get_trade(
    trade_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    trade = repo.get_paper_trade(trade_id, user_id=current_user.id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    return _enrich(trade)


@router.put("/{trade_id}/close", response_model=PaperTrade)
async def close_trade(
    trade_id: str,
    body: PaperTradeCloseRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    trade = repo.get_paper_trade(trade_id, user_id=current_user.id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade.status != TradeStatus.OPEN:
        raise HTTPException(status_code=400, detail="Trade is already closed")

    if body.exit_price >= trade.target_price:
        status = TradeStatus.TARGET_HIT
    elif body.exit_price <= trade.stop_price:
        status = TradeStatus.STOP_HIT
    else:
        status = TradeStatus.CLOSED

    repo.close_paper_trade(trade_id, status, body.exit_price, user_id=current_user.id)
    updated = repo.get_paper_trade(trade_id, user_id=current_user.id)
    return updated


@router.delete("/{trade_id}")
async def delete_trade(
    trade_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    if not repo.delete_paper_trade(trade_id, user_id=current_user.id):
        raise HTTPException(status_code=404, detail="Trade not found")
    return {"status": "deleted"}
