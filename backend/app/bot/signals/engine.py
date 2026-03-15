"""
Real-time signal engine — mirrors the backtest strategy logic.
Uses the same ORB + VWAP + RSI + EMA filters as IndiaORBStrategy in the backtest engine.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional

import numpy as np
import pandas as pd

from app.bot.data.market_data import IndiaMarketDataAdapter, default_data_adapter


class SignalEngine:
    def __init__(self, data_adapter: Optional[IndiaMarketDataAdapter] = None):
        self.adapter = data_adapter or default_data_adapter()

    def generate(
        self,
        symbol: str,
        strategy_id: str,
        risk_config: Optional[dict] = None,
        strategy_params: Optional[dict] = None,
    ) -> dict:
        params = strategy_params or {}
        ema_fast         = int(params.get("ema_fast", 9))
        ema_slow         = int(params.get("ema_slow", 21))
        volume_multiplier = float(params.get("volume_mult", 1.0))
        rsi_overbought   = float(params.get("rsi_overbought", 70))
        rsi_oversold     = float(params.get("rsi_oversold", 30))

        opening_range_end_str = str(params.get("opening_range_end", "09:30"))
        try:
            orh, orm = map(int, opening_range_end_str.split(":"))
            opening_range_end = time(orh, orm)
        except Exception:
            opening_range_end = time(9, 30)

        today = date.today()
        start = today - timedelta(days=7)
        df = self.adapter.fetch_intraday(symbol, start, today, interval="1m")

        if df.empty:
            return self._no_signal(symbol, "No market data available for analysis")

        # Use most recent available session
        today_df = df[df.index.date == today]
        if today_df.empty:
            available_dates = sorted(df.index.normalize().unique())
            if not available_dates:
                return self._no_signal(symbol, "No recent session data found")
            latest_date = available_dates[-1]
            today_df = df[df.index.normalize() == latest_date]

        market_df = today_df.between_time(time(9, 15), time(15, 30))
        if len(market_df) < 10:
            return self._no_signal(symbol, "Insufficient data (market may not have opened yet)")

        # ── Opening range ────────────────────────────────────────────────────
        opening_df = today_df.between_time(time(9, 15), opening_range_end)
        if opening_df.empty:
            opening_df = market_df.iloc[:5]
        opening_range_high = float(opening_df["High"].max())
        opening_range_low  = float(opening_df["Low"].min())

        latest_close = float(market_df["Close"].iloc[-1])
        closes       = market_df["Close"]

        # ── EMA ──────────────────────────────────────────────────────────────
        ema_fast_val = float(closes.ewm(span=ema_fast, adjust=False).mean().iloc[-1])
        ema_slow_val = float(closes.ewm(span=ema_slow, adjust=False).mean().iloc[-1])

        # ── RSI(14) ──────────────────────────────────────────────────────────
        rsi_val = self._calc_rsi(closes, period=14)

        # ── Session VWAP ─────────────────────────────────────────────────────
        vwap_val = self._calc_vwap(market_df)

        # ── Volume filter ─────────────────────────────────────────────────────
        volumes  = market_df["Volume"]
        vol_sma  = float(volumes.rolling(20).mean().iloc[-1]) if len(volumes) >= 20 else float(volumes.mean())
        if pd.isna(vol_sma) or vol_sma == 0:
            vol_sma = float(volumes.mean()) or 1.0
        current_vol = float(volumes.iloc[-1])
        volume_ok   = current_vol > vol_sma * volume_multiplier if vol_sma > 0 else True

        # ── Signal conditions ─────────────────────────────────────────────────
        trend_up        = ema_fast_val > ema_slow_val
        trend_down      = ema_fast_val < ema_slow_val
        above_vwap      = latest_close > vwap_val
        below_vwap      = latest_close < vwap_val
        rsi_not_overbought = rsi_val < rsi_overbought
        rsi_not_oversold   = rsi_val > rsi_oversold
        broke_above     = latest_close > opening_range_high
        broke_below     = latest_close < opening_range_low

        if broke_above and trend_up and above_vwap and rsi_not_overbought and volume_ok:
            filters_met = 5
            signal_type = "BUY"
            confidence  = self._calc_confidence(filters_met, latest_close, opening_range_high, vol_sma, current_vol)
            reason = (
                f"{symbol} broke above its morning high of ₹{opening_range_high:,.0f} "
                f"(now ₹{latest_close:,.0f}). Trend is UP, price is above VWAP (₹{vwap_val:,.0f}), "
                f"RSI is {rsi_val:.0f} (not overbought), volume confirming. "
                f"All 5 filters passed — strong BUY setup."
            )
        elif broke_below and trend_down and below_vwap and rsi_not_oversold and volume_ok:
            filters_met = 5
            signal_type = "SELL"
            confidence  = self._calc_confidence(filters_met, opening_range_low, latest_close, vol_sma, current_vol)
            reason = (
                f"{symbol} broke below its morning low of ₹{opening_range_low:,.0f} "
                f"(now ₹{latest_close:,.0f}). Trend is DOWN, price is below VWAP (₹{vwap_val:,.0f}), "
                f"RSI is {rsi_val:.0f} (not oversold), volume confirming. "
                f"All 5 filters passed — strong SELL setup."
            )
        elif broke_above and trend_up and above_vwap and rsi_not_overbought:
            filters_met = 4
            signal_type = "BUY"
            confidence  = self._calc_confidence(filters_met, latest_close, opening_range_high, vol_sma, current_vol)
            reason = (
                f"{symbol} broke above ₹{opening_range_high:,.0f}, trend up, above VWAP. "
                f"RSI {rsi_val:.0f}. Volume is below average — weaker signal (4/5 filters)."
            )
        elif broke_below and trend_down and below_vwap and rsi_not_oversold:
            filters_met = 4
            signal_type = "SELL"
            confidence  = self._calc_confidence(filters_met, opening_range_low, latest_close, vol_sma, current_vol)
            reason = (
                f"{symbol} broke below ₹{opening_range_low:,.0f}, trend down, below VWAP. "
                f"RSI {rsi_val:.0f}. Volume is below average — weaker signal (4/5 filters)."
            )
        else:
            trend_label = "UP" if trend_up else "DOWN"
            vwap_pos    = "above" if above_vwap else "below"
            return self._no_signal(
                symbol,
                f"{symbol} at ₹{latest_close:,.0f} is within morning range "
                f"(₹{opening_range_low:,.0f}–₹{opening_range_high:,.0f}). "
                f"Trend: {trend_label} · VWAP: ₹{vwap_val:,.0f} (price is {vwap_pos}) · RSI: {rsi_val:.0f}. "
                f"No breakout yet.",
            )

        return {
            "signal_type":          signal_type,
            "confidence":           round(confidence, 3),
            "price":                round(latest_close, 2),
            "reason":               reason,
            "opening_range_high":   round(opening_range_high, 2),
            "opening_range_low":    round(opening_range_low, 2),
            "ema_fast":             round(ema_fast_val, 2),
            "ema_slow":             round(ema_slow_val, 2),
            "vwap":                 round(vwap_val, 2),
            "rsi":                  round(rsi_val, 1),
            "volume_vs_avg":        round(current_vol / vol_sma, 2) if vol_sma > 0 else 1.0,
        }

    # ── Indicator helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _calc_vwap(df: pd.DataFrame) -> float:
        """Session-anchored VWAP from the provided DataFrame."""
        tp  = (df["High"] + df["Low"] + df["Close"]) / 3.0
        vol = df["Volume"].fillna(0.0)
        cum_vol = vol.cumsum()
        cum_pv  = (tp * vol).cumsum()
        total_vol = float(cum_vol.iloc[-1])
        if total_vol <= 0:
            return float(df["Close"].iloc[-1])
        return float(cum_pv.iloc[-1] / total_vol)

    @staticmethod
    def _calc_rsi(closes: pd.Series, period: int = 14) -> float:
        """Wilder RSI via EWM smoothing."""
        if len(closes) < period + 1:
            return 50.0
        delta = closes.diff()
        gain  = delta.clip(lower=0).ewm(com=period - 1, adjust=False).mean()
        loss  = (-delta.clip(upper=0)).ewm(com=period - 1, adjust=False).mean()
        last_loss = float(loss.iloc[-1])
        if last_loss == 0:
            return 100.0
        rs = float(gain.iloc[-1]) / last_loss
        return 100.0 - (100.0 / (1.0 + rs))

    @staticmethod
    def _calc_confidence(
        filters_passed: int,
        price: float,
        key_level: float,
        vol_sma: float,
        current_vol: float,
    ) -> float:
        base = filters_passed / 5.0
        breakout_strength = abs(price - key_level) / max(key_level, 1.0)
        breakout_bonus = min(breakout_strength * 10, 0.1)
        vol_ratio  = current_vol / vol_sma if vol_sma > 0 else 1.0
        vol_bonus  = min((vol_ratio - 1.0) * 0.05, 0.05)
        return min(base + breakout_bonus + vol_bonus, 0.95)

    @staticmethod
    def _no_signal(symbol: str, reason: str) -> dict:
        return {
            "signal_type": "NONE",
            "confidence":  0.0,
            "price":       0.0,
            "reason":      reason,
        }


_engine: Optional[SignalEngine] = None


def get_signal_engine() -> SignalEngine:
    global _engine
    if _engine is None:
        _engine = SignalEngine()
    return _engine
