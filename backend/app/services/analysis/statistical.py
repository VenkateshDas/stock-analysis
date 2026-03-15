import calendar
import pandas as pd
import numpy as np
from typing import List, Optional
import logging

from app.models.analysis import MonthlyContribution, StatisticalMetrics
from app.utils.helpers import safe_float, pct_change

logger = logging.getLogger(__name__)


class StatisticalAnalysisService:
    """Computes statistical/return metrics from price history."""

    def compute(self, df: pd.DataFrame, atr: Optional[float] = None) -> StatisticalMetrics:
        if df.empty or len(df) < 2:
            return self._empty_metrics()

        try:
            close = df["Close"]
            high = df["High"]
            low = df["Low"]

            last_close = float(close.iloc[-1])
            prev_close = float(close.iloc[-2])

            # ── Returns ──────────────────────────────────────────────────
            daily_return = pct_change(last_close, prev_close)

            weekly_return = None
            if len(close) >= 6:
                weekly_return = pct_change(last_close, float(close.iloc[-6]))

            monthly_return = None
            if len(close) >= 21:
                monthly_return = pct_change(last_close, float(close.iloc[-21]))

            roc_3m = None
            if len(close) >= 61:
                roc_3m = pct_change(last_close, float(close.iloc[-61]))

            roc_6m = None
            if len(close) >= 127:
                roc_6m = pct_change(last_close, float(close.iloc[-127]))

            yearly_return = None
            if len(close) >= 252:
                yearly_return = pct_change(last_close, float(close.iloc[-252]))

            # ── YTD ──────────────────────────────────────────────────────
            ytd_return = self._ytd_return(df)

            # ── 52-week range ─────────────────────────────────────────────
            lookback = min(len(close), 252)
            week52_high = safe_float(close.iloc[-lookback:].max())
            week52_low = safe_float(close.iloc[-lookback:].min())
            pct_from_high = pct_change(last_close, week52_high) if week52_high else None
            pct_from_low = pct_change(last_close, week52_low) if week52_low else None

            # ── Drawdown ──────────────────────────────────────────────────
            lookback_3m = min(60, len(close))
            peak_3m = float(close.iloc[-lookback_3m:].max())
            current_drawdown = round((last_close - peak_3m) / peak_3m * 100, 4) if peak_3m else None

            max_dd_ytd = self._max_drawdown_ytd(df)

            # ── 20-day annualised volatility ──────────────────────────────
            vol_20d = None
            if len(close) >= 21:
                log_rets = np.log(close.iloc[-21:] / close.iloc[-21:].shift(1)).dropna()
                if len(log_rets) >= 2:
                    vol_20d = round(float(log_rets.std()) * np.sqrt(252) * 100, 4)

            # ── Daily range ───────────────────────────────────────────────
            last_high = float(high.iloc[-1])
            last_low = float(low.iloc[-1])
            daily_range = safe_float(last_high - last_low)
            daily_range_pct = round((last_high - last_low) / prev_close * 100, 4) if prev_close else None

            atr_ratio = None
            if atr and daily_range:
                atr_ratio = round(daily_range / atr, 4)

            # ── Average Daily Range (ADR) ─────────────────────────────────
            adr_pts, adr_pct = None, None
            if len(df) >= 5:
                n_adr = min(20, len(df))
                ranges = (df["High"].iloc[-n_adr:] - df["Low"].iloc[-n_adr:])
                adr_pts = round(float(ranges.mean()), 4)
                adr_pct = round(adr_pts / last_close * 100, 4) if last_close else None

            # ── Average Weekly Range (AWR) ────────────────────────────────
            awr_pts, awr_pct = None, None
            try:
                df_w = df.resample("W").agg({"High": "max", "Low": "min", "Close": "last"}).dropna()
                if len(df_w) >= 4:
                    n_awr = min(12, len(df_w))
                    weekly_ranges = df_w["High"].iloc[-n_awr:] - df_w["Low"].iloc[-n_awr:]
                    awr_pts = round(float(weekly_ranges.mean()), 4)
                    awr_pct = round(awr_pts / last_close * 100, 4) if last_close else None
            except Exception:
                pass

            # ── Overnight vs Intraday breakdown ───────────────────────────
            on_intraday = self._overnight_intraday(df)

            return StatisticalMetrics(
                daily_return_pct=daily_return,
                weekly_return_pct=weekly_return,
                monthly_return_pct=monthly_return,
                roc_3m_pct=roc_3m,
                roc_6m_pct=roc_6m,
                yearly_return_pct=yearly_return,
                ytd_return_pct=ytd_return,
                week52_high=week52_high,
                week52_low=week52_low,
                pct_from_52w_high=pct_from_high,
                pct_from_52w_low=pct_from_low,
                current_drawdown_pct=current_drawdown,
                max_drawdown_ytd_pct=max_dd_ytd,
                volatility_20d=vol_20d,
                daily_range=daily_range,
                daily_range_pct=daily_range_pct,
                atr_ratio=atr_ratio,
                avg_daily_range_pts=adr_pts,
                avg_daily_range_pct=adr_pct,
                avg_weekly_range_pts=awr_pts,
                avg_weekly_range_pct=awr_pct,
                overnight_intraday=on_intraday if on_intraday else None,
            )
        except Exception as exc:
            logger.error(f"StatisticalAnalysisService.compute error: {exc}", exc_info=True)
            return self._empty_metrics()

    def _ytd_return(self, df: pd.DataFrame) -> Optional[float]:
        """Find the last trading day of previous year and compute YTD."""
        try:
            close = df["Close"]
            last_close = float(close.iloc[-1])
            current_year = df.index[-1].year
            prev_year_data = df[df.index.year < current_year]
            if prev_year_data.empty:
                return None
            year_start_close = float(prev_year_data["Close"].iloc[-1])
            return pct_change(last_close, year_start_close)
        except Exception:
            return None

    def _max_drawdown_ytd(self, df: pd.DataFrame) -> Optional[float]:
        """Worst peak-to-trough % decline since January 1 of the current year."""
        try:
            current_year = df.index[-1].year
            ytd_df = df[df.index.year == current_year]
            if len(ytd_df) < 2:
                return None
            close = ytd_df["Close"]
            rolling_max = close.cummax()
            drawdowns = (close - rolling_max) / rolling_max * 100
            return round(float(drawdowns.min()), 4)
        except Exception:
            return None

    def _overnight_intraday(self, df: pd.DataFrame) -> List[MonthlyContribution]:
        """Decompose daily returns into overnight (gap) and intraday components, grouped by month."""
        try:
            if "Open" not in df.columns or len(df) < 5:
                return []
            close = df["Close"]
            open_ = df["Open"]
            prev_close = close.shift(1)

            # Use prev_close as denominator to keep components additive
            overnight = ((open_ - prev_close) / prev_close * 100).dropna()
            intraday = ((close - open_) / prev_close * 100).dropna()

            combined = pd.DataFrame({"overnight": overnight, "intraday": intraday}).dropna()
            if combined.empty:
                return []

            # Limit to last ~6 months
            cutoff = df.index[-1] - pd.DateOffset(months=6)
            combined = combined[combined.index >= cutoff]
            if combined.empty:
                return []

            grouped = combined.groupby([combined.index.year, combined.index.month]).sum()
            result = []
            for (year, month), row in grouped.iterrows():
                result.append(MonthlyContribution(
                    month=calendar.month_abbr[int(month)],
                    year=int(year),
                    overnight_pct=round(float(row["overnight"]), 2),
                    intraday_pct=round(float(row["intraday"]), 2),
                ))
            return result[-6:]
        except Exception as exc:
            logger.debug(f"_overnight_intraday error: {exc}")
            return []

    def _empty_metrics(self) -> StatisticalMetrics:
        return StatisticalMetrics(
            daily_return_pct=None, weekly_return_pct=None,
            monthly_return_pct=None, yearly_return_pct=None, ytd_return_pct=None,
            week52_high=None, week52_low=None,
            pct_from_52w_high=None, pct_from_52w_low=None,
            volatility_20d=None, daily_range=None,
            daily_range_pct=None, atr_ratio=None,
        )


statistical_service = StatisticalAnalysisService()
