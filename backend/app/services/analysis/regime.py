"""Market regime computation — pure math, no network calls."""
from typing import Optional

from app.models.analysis import MarketRegimeResult, StatisticalMetrics, TechnicalIndicators


class RegimeService:
    def compute(
        self,
        technical: TechnicalIndicators,
        statistical: StatisticalMetrics,
        last_close: float,
    ) -> MarketRegimeResult:
        t = technical
        s = statistical

        monthly = s.monthly_return_pct or 0.0
        yearly = s.yearly_return_pct or 0.0
        rsi = t.rsi or 50.0
        adx = t.adx or 0.0
        atr_pct = t.atr_pct or 0.0

        # ── Bull / Bear signal counts ───────────────────────────────────────
        bull_signals: list[str] = []
        bear_signals: list[str] = []

        if t.price_vs_sma20 == "above":
            bull_signals.append("sma20")
        else:
            bear_signals.append("sma20")

        if t.price_vs_sma50 == "above":
            bull_signals.append("sma50")
        else:
            bear_signals.append("sma50")

        if t.price_vs_sma200 == "above":
            bull_signals.append("sma200")
        else:
            bear_signals.append("sma200")

        if t.macd_signal == "bullish":
            bull_signals.append("macd")
        elif t.macd_signal == "bearish":
            bear_signals.append("macd")

        if adx >= 20 and t.plus_di is not None and t.minus_di is not None and t.plus_di > t.minus_di:
            bull_signals.append("adx_di")
        elif adx >= 20 and t.plus_di is not None and t.minus_di is not None and t.minus_di > t.plus_di:
            bear_signals.append("adx_di")

        if monthly > 2.0:
            bull_signals.append("monthly_return")
        elif monthly < -2.0:
            bear_signals.append("monthly_return")

        if yearly > 8.0:
            bull_signals.append("yearly_return")
        elif yearly < -8.0:
            bear_signals.append("yearly_return")

        total_signals = len(bull_signals) + len(bear_signals)
        bull_count = len(bull_signals)
        bear_count = len(bear_signals)
        score = bull_count - bear_count

        # ── Regime classification ───────────────────────────────────────────
        if bull_count >= 4 and score > 0:
            regime = "bull_trending"
            action_bias = "buy_dips"
            daily_bias = "bullish"
        elif bear_count >= 4 and score < 0:
            regime = "bear_trending"
            action_bias = "sell_rallies"
            daily_bias = "bearish"
        elif atr_pct > 1.5 and abs(score) < 3:
            regime = "volatile"
            action_bias = "wait"
            daily_bias = "neutral"
        elif adx < 20 and abs(monthly) < 2.0:
            regime = "consolidating"
            action_bias = "breakout_watch"
            daily_bias = "neutral"
        elif score > 0:
            regime = "bull_trending"
            action_bias = "buy_dips"
            daily_bias = "bullish"
        elif score < 0:
            regime = "bear_trending"
            action_bias = "sell_rallies"
            daily_bias = "bearish"
        else:
            regime = "consolidating"
            action_bias = "breakout_watch"
            daily_bias = "neutral"

        # ── Phase ───────────────────────────────────────────────────────────
        sma50 = t.sma50
        in_early = sma50 is not None and abs(last_close - sma50) / sma50 < 0.05
        if regime == "bull_trending":
            if in_early or t.macd_signal == "bullish" and (t.macd.histogram or 0) < 0:
                phase = "early"
            elif rsi > 65 or t.bb_signal in ("above_upper", "near_upper"):
                phase = "late"
            else:
                phase = "mid"
        elif regime == "bear_trending":
            if in_early or t.macd_signal == "bearish" and (t.macd.histogram or 0) > 0:
                phase = "early"
            elif rsi < 35:
                phase = "late"
            else:
                phase = "mid"
        else:
            phase = "mid"

        # ── Confidence ──────────────────────────────────────────────────────
        if total_signals > 0:
            confirming = bull_count if score >= 0 else bear_count
            confidence = round(confirming / total_signals, 2)
        else:
            confidence = 0.5

        # ── Key levels ──────────────────────────────────────────────────────
        key_support: Optional[float] = None
        levels_below = []
        if t.sma20 and t.sma20 < last_close:
            levels_below.append(t.sma20)
        if t.sma50 and t.sma50 < last_close:
            levels_below.append(t.sma50)
        if t.sma200 and t.sma200 < last_close:
            levels_below.append(t.sma200)
        if levels_below:
            key_support = round(max(levels_below), 2)

        key_resistance: Optional[float] = None
        bb_upper = t.bollinger.upper
        week52_high = s.week52_high
        candidates = []
        if bb_upper and bb_upper > last_close:
            candidates.append(bb_upper)
        if week52_high and week52_high > last_close:
            candidates.append(week52_high)
        if candidates:
            key_resistance = round(min(candidates), 2)

        # ── Plain-English drivers ────────────────────────────────────────────
        drivers: list[str] = []
        if monthly != 0:
            sign = "+" if monthly >= 0 else ""
            drivers.append(f"Monthly return is {sign}{monthly:.1f}% — {'sustained uptrend' if monthly > 2 else 'sustained downtrend' if monthly < -2 else 'muted move'}")
        if adx >= 20:
            di_desc = "buyers in control" if (t.plus_di or 0) > (t.minus_di or 0) else "sellers in control"
            drivers.append(f"Trend strength is strong (ADX {adx:.0f}) — {di_desc}")
        else:
            drivers.append(f"Trend strength is weak (ADX {adx:.0f}) — market lacks directional conviction")
        if t.price_vs_sma200 == "above":
            drivers.append(f"Price trading above its long-term average — structurally bullish backdrop")
        else:
            drivers.append(f"Price below its long-term average — structural downtrend in place")
        drivers = drivers[:3]

        # ── Caution factors ─────────────────────────────────────────────────
        caution: list[str] = []
        if rsi > 65:
            caution.append(f"Momentum at {rsi:.0f} — approaching overbought, consider waiting for a pullback")
        elif rsi < 35:
            caution.append(f"Momentum at {rsi:.0f} — oversold, potential for a relief bounce before resuming")
        if atr_pct > 1.0:
            caution.append(f"Daily price swings averaging {atr_pct:.1f}% — position sizing should reflect elevated volatility")
        if not caution and score == 0:
            caution.append("Mixed signals — reduce position size until a clearer direction emerges")
        caution = caution[:2]

        return MarketRegimeResult(
            regime=regime,
            phase=phase,
            daily_bias=daily_bias,
            confidence=confidence,
            action_bias=action_bias,
            key_support=key_support,
            key_resistance=key_resistance,
            drivers=drivers,
            caution=caution,
        )


regime_service = RegimeService()
