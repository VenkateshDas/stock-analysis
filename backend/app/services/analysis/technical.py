import pandas as pd
import numpy as np
from typing import Optional
import logging

import ta
import ta.momentum
import ta.trend
import ta.volatility
import ta.volume

from app.models.analysis import TechnicalIndicators, MACDData, BollingerData
from app.utils.helpers import safe_float

logger = logging.getLogger(__name__)


class TechnicalAnalysisService:
    """Computes technical indicators using the `ta` library."""

    def compute(self, df: pd.DataFrame) -> TechnicalIndicators:
        if df.empty or len(df) < 20:
            return self._empty_indicators()

        try:
            close = df["Close"]
            high = df["High"]
            low = df["Low"]
            volume = df["Volume"]
            last_close = float(close.iloc[-1])

            # ── RSI ──────────────────────────────────────────────────────
            rsi_ind = ta.momentum.RSIIndicator(close=close, window=14)
            rsi_val = safe_float(rsi_ind.rsi().iloc[-1])
            rsi_signal = self._rsi_signal(rsi_val)

            # ── MACD ─────────────────────────────────────────────────────
            macd_ind = ta.trend.MACD(close=close, window_slow=26, window_fast=12, window_sign=9)
            macd_val = safe_float(macd_ind.macd().iloc[-1])
            signal_val = safe_float(macd_ind.macd_signal().iloc[-1])
            hist_val = safe_float(macd_ind.macd_diff().iloc[-1])
            macd_signal_str = self._macd_signal(macd_val, signal_val)

            # ── Bollinger Bands ───────────────────────────────────────────
            bb_ind = ta.volatility.BollingerBands(close=close, window=20, window_dev=2)
            bb_upper = safe_float(bb_ind.bollinger_hband().iloc[-1])
            bb_mid = safe_float(bb_ind.bollinger_mavg().iloc[-1])
            bb_lower = safe_float(bb_ind.bollinger_lband().iloc[-1])
            # %B: (price - lower) / (upper - lower)
            bb_pctb = None
            if bb_upper is not None and bb_lower is not None and (bb_upper - bb_lower) > 0:
                bb_pctb = round((last_close - bb_lower) / (bb_upper - bb_lower), 4)
            bb_signal_str = self._bb_signal(last_close, bb_upper, bb_lower, bb_mid)

            # ── ADX ───────────────────────────────────────────────────────
            adx_ind = ta.trend.ADXIndicator(high=high, low=low, close=close, window=14)
            adx_val = safe_float(adx_ind.adx().iloc[-1])
            plus_di = safe_float(adx_ind.adx_pos().iloc[-1])
            minus_di = safe_float(adx_ind.adx_neg().iloc[-1])
            adx_signal_str = self._adx_signal(adx_val)

            # ── Moving Averages ───────────────────────────────────────────
            sma20_s = ta.trend.SMAIndicator(close=close, window=20).sma_indicator()
            sma20 = safe_float(sma20_s.iloc[-1])

            sma50 = None
            if len(close) >= 50:
                sma50_s = ta.trend.SMAIndicator(close=close, window=50).sma_indicator()
                sma50 = safe_float(sma50_s.iloc[-1])

            sma200 = None
            if len(close) >= 200:
                sma200_s = ta.trend.SMAIndicator(close=close, window=200).sma_indicator()
                sma200 = safe_float(sma200_s.iloc[-1])

            price_vs_sma20 = "above" if sma20 and last_close > sma20 else "below"
            price_vs_sma50 = "above" if sma50 and last_close > sma50 else "below"
            price_vs_sma200 = "above" if sma200 and last_close > sma200 else "below"

            # ── EMA 20 / 50 ────────────────────────────────────────────────
            ema20_s = ta.trend.EMAIndicator(close=close, window=20).ema_indicator()
            ema20 = safe_float(ema20_s.iloc[-1])
            ema50 = None
            if len(close) >= 50:
                ema50_s = ta.trend.EMAIndicator(close=close, window=50).ema_indicator()
                ema50 = safe_float(ema50_s.iloc[-1])
            ema200 = None
            if len(close) >= 200:
                ema200_s = ta.trend.EMAIndicator(close=close, window=200).ema_indicator()
                ema200 = safe_float(ema200_s.iloc[-1])
            if ema20 is not None and ema50 is not None:
                ema_cross = "bullish" if ema20 > ema50 else "bearish"
            else:
                ema_cross = "neutral"

            # ── ATR ────────────────────────────────────────────────────────
            atr_ind = ta.volatility.AverageTrueRange(high=high, low=low, close=close, window=14)
            atr_val = safe_float(atr_ind.average_true_range().iloc[-1])
            atr_pct = round(atr_val / last_close * 100, 4) if atr_val and last_close else None

            # ── OBV ────────────────────────────────────────────────────────
            obv_ind = ta.volume.OnBalanceVolumeIndicator(close=close, volume=volume)
            obv_series = obv_ind.on_balance_volume()
            obv_val = safe_float(obv_series.iloc[-1])
            obv_trend = self._obv_trend(obv_series)

            # ── Relative Volume ────────────────────────────────────────────
            rvol_val = rvol_signal_str = None
            if len(volume) >= 31:
                avg_30 = float(volume.iloc[-31:-1].mean())
                curr_vol = float(volume.iloc[-1])
                if avg_30 > 0:
                    rvol_val = round(curr_vol / avg_30, 4)
                    rvol_signal_str = "high" if rvol_val > 1.5 else "low" if rvol_val < 0.5 else "normal"

            return TechnicalIndicators(
                rsi=rsi_val,
                rsi_signal=rsi_signal,
                macd=MACDData(macd=macd_val, signal=signal_val, histogram=hist_val),
                macd_signal=macd_signal_str,
                bollinger=BollingerData(upper=bb_upper, middle=bb_mid, lower=bb_lower, percent_b=bb_pctb),
                bb_signal=bb_signal_str,
                adx=adx_val,
                adx_signal=adx_signal_str,
                plus_di=plus_di,
                minus_di=minus_di,
                sma20=sma20,
                sma50=sma50,
                sma200=sma200,
                price_vs_sma20=price_vs_sma20,
                price_vs_sma50=price_vs_sma50,
                price_vs_sma200=price_vs_sma200,
                ema20=ema20,
                ema50=ema50,
                ema200=ema200,
                ema_cross=ema_cross,
                atr=atr_val,
                atr_pct=atr_pct,
                obv=obv_val,
                obv_trend=obv_trend,
                rvol=rvol_val,
                rvol_signal=rvol_signal_str or "normal",
            )
        except Exception as exc:
            logger.error(f"TechnicalAnalysisService.compute error: {exc}", exc_info=True)
            return self._empty_indicators()

    # ── Signal helpers ──────────────────────────────────────────────────

    def _rsi_signal(self, rsi: Optional[float]) -> str:
        if rsi is None:
            return "neutral"
        if rsi >= 70:
            return "overbought"
        if rsi <= 30:
            return "oversold"
        return "neutral"

    def _macd_signal(self, macd: Optional[float], signal: Optional[float]) -> str:
        if macd is None or signal is None:
            return "neutral"
        if macd > signal:
            return "bullish"
        if macd < signal:
            return "bearish"
        return "neutral"

    def _bb_signal(self, price: float, upper: Optional[float], lower: Optional[float], mid: Optional[float]) -> str:
        if upper is None or lower is None or mid is None:
            return "middle"
        band_width = upper - lower
        if band_width == 0:
            return "middle"
        if price >= upper:
            return "above_upper"
        if price <= lower:
            return "below_lower"
        if price >= mid + (upper - mid) * 0.75:
            return "near_upper"
        if price <= mid - (mid - lower) * 0.75:
            return "near_lower"
        return "middle"

    def _adx_signal(self, adx: Optional[float]) -> str:
        if adx is None:
            return "no_trend"
        if adx >= 40:
            return "strong_trend"
        if adx >= 25:
            return "moderate_trend"
        if adx >= 15:
            return "weak_trend"
        return "no_trend"

    def _obv_trend(self, obv_series: pd.Series) -> str:
        if len(obv_series) < 5:
            return "flat"
        recent = obv_series.iloc[-5:]
        slope = float(recent.iloc[-1]) - float(recent.iloc[0])
        if slope > 0:
            return "rising"
        if slope < 0:
            return "falling"
        return "flat"

    def _empty_indicators(self) -> TechnicalIndicators:
        return TechnicalIndicators(
            rsi=None, rsi_signal="neutral",
            macd=MACDData(macd=None, signal=None, histogram=None), macd_signal="neutral",
            bollinger=BollingerData(upper=None, middle=None, lower=None, percent_b=None), bb_signal="middle",
            adx=None, adx_signal="no_trend", plus_di=None, minus_di=None,
            sma20=None, sma50=None, sma200=None,
            price_vs_sma20="below", price_vs_sma50="below", price_vs_sma200="below",
            atr=None, atr_pct=None, obv=None, obv_trend="flat",
            rvol=None, rvol_signal="normal",
        )


technical_service = TechnicalAnalysisService()
