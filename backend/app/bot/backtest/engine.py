"""
Backtest engine — India Intraday ORB strategy with VWAP + RSI + ATR filters.

Design choices:
  - Session-anchored VWAP computed from pandas before running backtrader (correct,
    non-lookahead: each bar's VWAP = cumulative(TP×vol) / cumulative(vol) from day start)
  - ATR(14) for adaptive stop/target instead of fixed %-based stops
  - RSI(14) anti-chasing filter: skip BUY when overbought, skip SELL when oversold
  - Trade direction determined from opening position size (not from P&L sign)
  - All tunable params flow through BacktestConfig so UI changes actually take effect
"""
from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Dict, List, Optional

try:
    import backtrader as bt
except Exception:  # pragma: no cover
    bt = None
import numpy as np
import pandas as pd

from app.bot.data.market_data import default_data_adapter
from app.bot.risk.manager import RiskManager
from app.models.bot import BacktestConfig, BacktestReport, BacktestTrade, EquityPoint, RiskConfig


# ── Pandas indicator helpers ──────────────────────────────────────────────────

def _session_vwap(df: pd.DataFrame) -> pd.Series:
    """Session-anchored VWAP that resets each calendar day.
    Falls back to typical price when volume is zero (e.g. index tickers).
    """
    tp = (df["High"] + df["Low"] + df["Close"]) / 3.0
    vol = df["Volume"].fillna(0.0)

    vwap_parts: List[pd.Series] = []
    for _, grp_idx in df.groupby(df.index.date).groups.items():
        g_tp = tp.loc[grp_idx]
        g_vol = vol.loc[grp_idx]
        cum_vol = g_vol.cumsum()
        cum_pv = (g_tp * g_vol).cumsum()
        # Where cumulative volume is zero, use typical price
        vwap = cum_pv / cum_vol.replace(0.0, float("nan"))
        vwap = vwap.fillna(g_tp)
        vwap_parts.append(vwap)

    return pd.concat(vwap_parts).sort_index()


def _atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Exponential ATR (same as Wilder's smoothing via EWM)."""
    high, low, prev_close = df["High"], df["Low"], df["Close"].shift(1)
    tr = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


# ── Backtrader custom data feed ───────────────────────────────────────────────

if bt is not None:

    class ExtendedPandasData(bt.feeds.PandasData):
        """Standard OHLCV + session VWAP + ATR14 as extra lines."""
        lines = ("vwap", "atr14")
        params = (("vwap", -1), ("atr14", -1))

    # ── Analyzers ────────────────────────────────────────────────────────────

    class EquityCurveAnalyzer(bt.Analyzer):
        def start(self):
            self.points = []

        def next(self):
            dt = self.strategy.data.datetime.datetime(0)
            self.points.append((dt, float(self.strategy.broker.getvalue())))

        def get_analysis(self):
            return self.points

    class TradeCaptureAnalyzer(bt.Analyzer):
        """Captures closed trades with correct side (BUY/SELL) and exit price."""

        def start(self):
            self.closed: List[dict] = []
            self._sides: dict = {}   # id(trade) → "BUY" | "SELL"
            self._qtys:  dict = {}   # id(trade) → int qty

        def notify_trade(self, trade):
            tid = id(trade)
            if trade.isopen and not trade.isclosed:
                # First open notification — capture direction and qty
                self._sides[tid] = "BUY" if trade.size > 0 else "SELL"
                self._qtys[tid] = int(abs(trade.size))
            if trade.isclosed:
                side = self._sides.pop(tid, None)
                qty  = self._qtys.pop(tid, 1) or 1
                if side is None:
                    # Fallback (shouldn't happen, but be safe)
                    side = "BUY" if trade.pnl >= 0 else "SELL"
                entry = float(trade.price)
                pnl   = float(trade.pnl)
                # Reconstruct exit price from P&L:
                #   long:  pnl = (exit - entry) * qty  → exit = entry + pnl/qty
                #   short: pnl = (entry - exit) * qty  → exit = entry - pnl/qty
                if side == "BUY":
                    exit_price = entry + pnl / qty
                else:
                    exit_price = entry - pnl / qty
                self.closed.append(
                    {
                        "side":        side,
                        "entry_time":  bt.num2date(trade.dtopen),
                        "exit_time":   bt.num2date(trade.dtclose),
                        "entry_price": entry,
                        "exit_price":  exit_price,
                        "size":        qty,
                        "pnl":         pnl,
                    }
                )

        def get_analysis(self):
            return self.closed

    # ── Strategy ─────────────────────────────────────────────────────────────

    class IndiaORBStrategy(bt.Strategy):
        """
        India Intraday Opening Range Breakout — enhanced with VWAP + RSI + ATR.

        Entry conditions (BUY):
          1. Price closes above morning high (ORB breakout)
          2. EMA(fast) > EMA(slow)              ← trend alignment
          3. Price > session VWAP               ← institutional bias is bullish
          4. RSI(14) < rsi_overbought (default 70) ← not chasing an exhausted move
          5. Volume > 20-bar avg × volume_mult   ← real participation (skipped for indices)

        Entry conditions (SELL):
          Mirror of above with all conditions reversed.

        Stop-loss:  entry ± atr_stop_mult × ATR(14)   (default 1.5× ATR)
        Target:     entry ∓ stop_dist × target_rr      (default 2×)
        Max trades: 3 per day; force-close at session_end.
        """
        params = dict(
            session_start   = time(9, 30),
            session_end     = time(15, 0),
            opening_end     = time(9, 30),   # ORB capture window end
            target_rr       = 2.0,
            volume_mult     = 1.0,
            max_trades      = 3,
            ema_fast_period = 9,
            ema_slow_period = 21,
            rsi_period      = 14,
            rsi_overbought  = 70,
            rsi_oversold    = 30,
            atr_stop_mult   = 1.5,
        )

        def __init__(self):
            self.ema_fast = bt.ind.EMA(self.data.close, period=self.p.ema_fast_period)
            self.ema_slow = bt.ind.EMA(self.data.close, period=self.p.ema_slow_period)
            self.rsi      = bt.ind.RSI(self.data.close, period=self.p.rsi_period)
            self.vol_sma  = bt.ind.SMA(self.data.volume, period=20)

            self.current_day      = None
            self.day_opening_high = None
            self.day_opening_low  = None
            self.trades_today     = 0
            self.entry_price      = None
            self.stop_price       = None
            self.target_price     = None
            self._entry_side      = None  # "BUY" | "SELL"

        def _reset_day(self, d):
            self.current_day      = d
            self.day_opening_high = None
            self.day_opening_low  = None
            self.trades_today     = 0

        def _safe_atr(self) -> float:
            v = float(self.data.atr14[0])
            return v if (not math.isnan(v) and v > 0) else float(self.data.close[0]) * 0.005

        def _safe_vwap(self) -> float:
            v = float(self.data.vwap[0])
            return v if (not math.isnan(v) and v > 0) else float(self.data.close[0])

        def next(self):
            dt = self.data.datetime.datetime(0)
            t  = dt.time()

            # Day rollover
            if self.current_day != dt.date():
                self._reset_day(dt.date())

            # ── Opening range capture ────────────────────────────────────────
            if t <= self.p.opening_end:
                h, l = float(self.data.high[0]), float(self.data.low[0])
                self.day_opening_high = h if self.day_opening_high is None else max(self.day_opening_high, h)
                self.day_opening_low  = l if self.day_opening_low  is None else min(self.day_opening_low, l)
                return

            # ── Force-close outside session ──────────────────────────────────
            if t < self.p.session_start or t >= self.p.session_end:
                if self.position:
                    self.close()
                return

            close = float(self.data.close[0])
            vwap  = self._safe_vwap()
            atr   = self._safe_atr()
            rsi   = float(self.rsi[0])

            # ── Manage open position ─────────────────────────────────────────
            if self.position:
                if self._entry_side == "BUY":
                    if close <= self.stop_price or close >= self.target_price:
                        self.close()
                else:
                    if close >= self.stop_price or close <= self.target_price:
                        self.close()
                return

            # ── Look for new entry ───────────────────────────────────────────
            if self.trades_today >= self.p.max_trades:
                return

            if self.day_opening_high is None or self.day_opening_low is None:
                return

            trend_up   = float(self.ema_fast[0]) > float(self.ema_slow[0])
            trend_down = float(self.ema_fast[0]) < float(self.ema_slow[0])

            vol_sma_val = float(self.vol_sma[0])
            if vol_sma_val > 0:
                volume_ok = float(self.data.volume[0]) > vol_sma_val * float(self.p.volume_mult)
            else:
                volume_ok = True  # index tickers (^NSEI) carry zero volume from yfinance

            stop_dist = self.p.atr_stop_mult * atr

            # BUY: breakout above ORH + trend up + above VWAP + RSI not overbought + volume
            if (
                close > self.day_opening_high
                and trend_up
                and close > vwap
                and rsi < self.p.rsi_overbought
                and volume_ok
                and stop_dist > 0
            ):
                self.entry_price  = close
                self.stop_price   = close - stop_dist
                self.target_price = close + stop_dist * float(self.p.target_rr)
                self._entry_side  = "BUY"
                self.buy(size=1)
                self.trades_today += 1

            # SELL: breakdown below ORL + trend down + below VWAP + RSI not oversold + volume
            elif (
                close < self.day_opening_low
                and trend_down
                and close < vwap
                and rsi > self.p.rsi_oversold
                and volume_ok
                and stop_dist > 0
            ):
                self.entry_price  = close
                self.stop_price   = close + stop_dist
                self.target_price = close - stop_dist * float(self.p.target_rr)
                self._entry_side  = "SELL"
                self.sell(size=1)
                self.trades_today += 1


# ── BacktestEngine ────────────────────────────────────────────────────────────

@dataclass
class BacktestArtifacts:
    report: BacktestReport
    trades: List[BacktestTrade]
    equity: List[EquityPoint]
    data_quality: Dict[str, bool]


class BacktestEngine:
    def __init__(self):
        self.adapter = default_data_adapter()

    def run(
        self,
        config: BacktestConfig,
        risk: RiskConfig,
        run_id: Optional[str] = None,
    ) -> BacktestArtifacts:
        df = self.adapter.fetch_intraday(
            symbol=config.symbol,
            start=config.start_date,
            end=config.end_date,
            interval=config.timeframe,
        )
        if df.empty:
            raise ValueError("No market data returned for the requested period")
        self.adapter.persist_csv(config.symbol, config.timeframe, df)
        return self.run_from_dataframe(config=config, risk=risk, df=df, run_id=run_id)

    def run_from_dataframe(
        self,
        config: BacktestConfig,
        risk: RiskConfig,
        df: pd.DataFrame,
        run_id: Optional[str] = None,
    ) -> BacktestArtifacts:
        if bt is None:
            raise RuntimeError("backtrader is not installed. Run pip install -r requirements.txt")

        run_id = run_id or f"BT-{uuid.uuid4().hex[:10]}"
        data_quality = self.adapter.quality_flags(df)

        # ── Prepare DataFrame ────────────────────────────────────────────────
        bt_df = df.copy()
        bt_df.columns = [c.lower() for c in bt_df.columns]
        bt_df.index = bt_df.index.tz_localize(None)

        # Compute VWAP and ATR14 and attach as columns
        vwap_series = _session_vwap(df)
        atr_series  = _atr(df, period=14)
        # Re-align index (tz-naive) to match bt_df
        vwap_series.index = vwap_series.index.tz_localize(None)
        atr_series.index  = atr_series.index.tz_localize(None)
        bt_df["vwap"]  = vwap_series.reindex(bt_df.index)
        bt_df["atr14"] = atr_series.reindex(bt_df.index)
        bt_df[["vwap", "atr14"]] = bt_df[["vwap", "atr14"]].ffill()

        # ── Risk / expiry adjustments ────────────────────────────────────────
        risk_mgr = RiskManager(risk)
        has_expiry = any(
            risk_mgr.is_expiry_day(ts.to_pydatetime()) for ts in bt_df.index.unique()
        )
        max_trades = (
            max(1, int(risk.max_trades_per_day * risk.expiry_position_size_multiplier))
            if has_expiry else risk.max_trades_per_day
        )

        # ── Parse time strings ───────────────────────────────────────────────
        def _parse_time(s: str, default: time) -> time:
            try:
                h, m = map(int, s.split(":"))
                return time(h, m)
            except Exception:
                return default

        session_start_t    = _parse_time(config.session_start,    time(9, 30))
        session_end_t      = _parse_time(config.session_end,      time(15, 0))
        opening_range_end_t = _parse_time(config.opening_range_end, session_start_t)

        # ── Build cerebro ────────────────────────────────────────────────────
        data_feed = ExtendedPandasData(dataname=bt_df)
        cerebro = bt.Cerebro(stdstats=False)
        cerebro.adddata(data_feed)
        cerebro.broker.setcash(config.initial_capital)
        cerebro.broker.setcommission(commission=config.commission_pct / 100.0)
        cerebro.broker.set_slippage_perc(config.slippage_pct / 100.0)

        cerebro.addstrategy(
            IndiaORBStrategy,
            session_start    = session_start_t,
            session_end      = session_end_t,
            opening_end      = opening_range_end_t,
            target_rr        = float(config.target_rr),
            volume_mult      = float(config.volume_mult),
            max_trades       = int(max_trades),
            ema_fast_period  = int(config.ema_fast),
            ema_slow_period  = int(config.ema_slow),
        )
        cerebro.addanalyzer(EquityCurveAnalyzer, _name="equity_curve")
        cerebro.addanalyzer(TradeCaptureAnalyzer, _name="trade_capture")

        strat = cerebro.run()[0]
        trade_data  = strat.analyzers.trade_capture.get_analysis()
        equity_data = strat.analyzers.equity_curve.get_analysis()

        # ── Build result objects ─────────────────────────────────────────────
        trades: List[BacktestTrade] = []
        for t in trade_data:
            qty   = int(t["size"]) if t["size"] else 1
            entry = float(t["entry_price"])
            pnl   = float(t["pnl"])
            trades.append(
                BacktestTrade(
                    run_id      = run_id,
                    symbol      = config.symbol,
                    side        = t["side"],          # correctly set by TradeCaptureAnalyzer
                    entry_time  = t["entry_time"],
                    entry_price = entry,
                    exit_time   = t["exit_time"],
                    exit_price  = float(t["exit_price"]),
                    qty         = qty,
                    pnl         = pnl,
                    pnl_pct     = ((pnl / max(entry * qty, 1e-9)) * 100.0),
                )
            )

        equity = [
            EquityPoint(run_id=run_id, timestamp=ts, equity=val)
            for ts, val in equity_data
        ]

        report = self._build_report(run_id, config, trades, equity)
        return BacktestArtifacts(
            report=report, trades=trades, equity=equity, data_quality=data_quality
        )

    def _build_report(
        self,
        run_id: str,
        config: BacktestConfig,
        trades: List[BacktestTrade],
        equity: List[EquityPoint],
    ) -> BacktestReport:
        total_trades = len(trades)
        wins   = [t for t in trades if t.pnl > 0]
        losses = [t for t in trades if t.pnl < 0]
        win_rate = (len(wins) / total_trades * 100.0) if total_trades else 0.0
        net_pnl  = float(sum(t.pnl for t in trades))

        equity_vals = np.array([p.equity for p in equity]) if equity else np.array([config.initial_capital])
        returns     = (np.diff(equity_vals) / np.maximum(equity_vals[:-1], 1e-9)) if len(equity_vals) > 1 else np.array([])
        downside    = returns[returns < 0] if returns.size else np.array([])

        sharpe  = float(np.sqrt(252) * returns.mean() / returns.std()) if returns.size > 1 and returns.std() > 0 else 0.0
        sortino = float(np.sqrt(252) * returns.mean() / downside.std()) if downside.size > 1 and downside.std() > 0 else 0.0

        peaks          = np.maximum.accumulate(equity_vals)
        drawdowns      = (equity_vals - peaks) / np.maximum(peaks, 1e-9)
        max_drawdown_pct = float(abs(drawdowns.min()) * 100.0) if drawdowns.size else 0.0

        gross_profit = float(sum(t.pnl for t in wins))
        gross_loss   = abs(float(sum(t.pnl for t in losses)))
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (math.inf if gross_profit > 0 else 0.0)

        total_days  = max((config.end_date - config.start_date).days, 1)
        final_equity = float(equity_vals[-1])
        cagr = ((final_equity / max(config.initial_capital, 1e-9)) ** (365.0 / total_days) - 1) * 100

        # ── Promotion thresholds (scaled to test window length) ──────────────
        min_trades = max(5, min(20, total_days // 3))  # realistic for window length
        promo = (
            total_trades >= min_trades
            and max_drawdown_pct <= 15.0
            and profit_factor >= 1.3
            and win_rate >= 45.0
        )

        notes_parts = []
        if total_trades < min_trades:
            notes_parts.append(f"need ≥{min_trades} trades (got {total_trades})")
        if max_drawdown_pct > 15.0:
            notes_parts.append(f"drawdown {max_drawdown_pct:.1f}% > 15% limit")
        if profit_factor < 1.3:
            notes_parts.append(f"profit factor {profit_factor:.2f} < 1.3 minimum")
        if win_rate < 45.0:
            notes_parts.append(f"win rate {win_rate:.0f}% < 45% minimum")
        notes = "PASS — strategy meets all thresholds" if promo else "FAIL: " + "; ".join(notes_parts)

        return BacktestReport(
            run_id           = run_id,
            strategy_id      = config.strategy_id,
            symbol           = config.symbol,
            start_date       = config.start_date,
            end_date         = config.end_date,
            total_trades     = total_trades,
            win_rate         = round(win_rate, 2),
            net_pnl          = round(net_pnl, 2),
            max_drawdown_pct = round(max_drawdown_pct, 2),
            sharpe           = round(float(sharpe), 4),
            sortino          = round(float(sortino), 4),
            profit_factor    = round(float(profit_factor), 4) if math.isfinite(profit_factor) else 99.0,
            cagr_pct         = round(float(cagr), 2),
            promotion_pass   = promo,
            promotion_notes  = notes,
        )
