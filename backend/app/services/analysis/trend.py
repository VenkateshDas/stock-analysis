"""
Multi-timeframe trend analysis service.

Methods used per timeframe:
  • Theil-Sen regression   — robust slope, immune to outlier shock days
  • OLS via scipy          — R² (linearity/consistency of trend)
  • Mann-Kendall test      — non-parametric significance (no normality assumption)
  • Holt's Linear ES       — next-period forecast (O(n), no training pipeline)
  • Hurst exponent (R/S)   — trend persistence (yearly timeframe only, ≥50 bars)

Timeframes:
  daily   → last 20 daily closes      (short-term momentum)
  weekly  → last 26 weekly closes     (medium-term, 6 months)
  monthly → last 12 monthly closes    (macro trend, 1 year)
  yearly  → weekly closes over 5 yrs  (secular trend, needs trend_lookback_days data)
"""

import logging
import warnings
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats

logger = logging.getLogger(__name__)


# ── Statistical helpers ──────────────────────────────────────────────────────

def _mann_kendall(x: np.ndarray) -> tuple[float, float]:
    """
    Mann-Kendall trend test.
    Returns (tau, two-sided p-value).
    tau is normalised to [-1, +1]; p < 0.05 → statistically significant trend.
    """
    n = len(x)
    if n < 4:
        return 0.0, 1.0

    s = 0
    for k in range(n - 1):
        for j in range(k + 1, n):
            diff = x[j] - x[k]
            if diff > 0:
                s += 1
            elif diff < 0:
                s -= 1

    # Variance with ties correction
    from collections import Counter
    counts = Counter(x)
    tie_corr = sum(t * (t - 1) * (2 * t + 5) for t in counts.values() if t > 1)
    var_s = max((n * (n - 1) * (2 * n + 5) - tie_corr) / 18, 1e-10)

    if s > 0:
        z = (s - 1) / np.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / np.sqrt(var_s)
    else:
        z = 0.0

    p_value = float(2 * (1 - stats.norm.cdf(abs(z))))
    tau = float(s / (n * (n - 1) / 2))
    return tau, p_value


def _hurst_rs(y: np.ndarray) -> Optional[float]:
    """
    Hurst exponent via rescaled range (R/S) analysis.
    Requires ≥ 50 points; returns None otherwise.
    H > 0.55 → trending  |  H ≈ 0.5 → random walk  |  H < 0.45 → mean-reverting
    """
    n = len(y)
    if n < 50:
        return None

    log_ret = np.diff(np.log(np.maximum(y, 1e-10)))

    # Use power-of-2 lags for numerical stability
    max_power = int(np.floor(np.log2(len(log_ret) / 2)))
    if max_power < 2:
        return None
    lags = [2 ** i for i in range(1, max_power + 1)]

    rs_vals, lag_vals = [], []
    for lag in lags:
        n_segs = len(log_ret) // lag
        if n_segs < 1:
            continue
        seg_rs = []
        for i in range(n_segs):
            seg = log_ret[i * lag:(i + 1) * lag]
            dev = np.cumsum(seg - seg.mean())
            R = dev.max() - dev.min()
            S = seg.std(ddof=1)
            if S > 0:
                seg_rs.append(R / S)
        if seg_rs:
            rs_vals.append(np.mean(seg_rs))
            lag_vals.append(lag)

    if len(rs_vals) < 3:
        return None

    valid = [(l, r) for l, r in zip(lag_vals, rs_vals) if r > 0]
    if len(valid) < 3:
        return None

    log_lags = np.log([v[0] for v in valid])
    log_rs = np.log([v[1] for v in valid])
    slope, *_ = stats.linregress(log_lags, log_rs)
    return float(np.clip(slope, 0.0, 1.0))


def _holt_forecast(y: np.ndarray) -> tuple[Optional[float], str]:
    """
    Holt's Linear Exponential Smoothing — next-period point forecast.
    Returns (forecast_value, reliability_label).
    """
    if len(y) < 8:
        return None, "unavailable"
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = ExponentialSmoothing(
                y, trend="add", seasonal=None, initialization_method="estimated"
            )
            fit = model.fit(optimized=True, disp=False)
        return float(fit.forecast(1)[0]), "computed"
    except Exception as exc:
        logger.debug(f"Holt-ES forecast failed: {exc}")
        return None, "unavailable"


# ── Core per-timeframe computation ───────────────────────────────────────────

def _analyze_series(
    series: pd.Series,
    timeframe: str,
    sig_threshold: float = 0.05,
) -> "TimeframeTrend":  # noqa: F821 — forward ref resolved at import
    from app.models.analysis import TimeframeTrend

    y = series.dropna().values.astype(float)
    n = len(y)

    # Minimum bars per timeframe
    min_bars = {"daily": 5, "weekly": 5, "monthly": 4, "yearly": 8}
    if n < min_bars.get(timeframe, 5):
        return _empty_trend(timeframe, n)

    x = np.arange(n, dtype=float)

    # ── 1. OLS — R² and p-value ───────────────────────────────────────────
    try:
        ols = stats.linregress(x, y)
        r_squared = float(ols.rvalue ** 2)
    except Exception:
        r_squared = None

    # ── 2. Theil-Sen — robust slope ───────────────────────────────────────
    slope = intercept = reg_start = reg_end = slope_pct = None
    try:
        ts = stats.theilslopes(y, x, alpha=0.95)
        slope = float(ts.slope)
        intercept = float(ts.intercept)
        reg_start = round(intercept, 4)
        reg_end = round(intercept + slope * (n - 1), 4)
        # Normalize slope by the first price in the window — standard financial
        # convention: "% gain per bar relative to period start price".
        slope_pct = round((slope / y[0]) * 100, 4) if y[0] != 0 else None
    except Exception:
        pass

    # ── 3. Total return ───────────────────────────────────────────────────
    total_return_pct: Optional[float] = None
    if n >= 2 and y[0] != 0:
        total_return_pct = round(float((y[-1] - y[0]) / y[0] * 100), 2)

    # ── 4. Mann-Kendall ───────────────────────────────────────────────────
    try:
        mk_tau, mk_pvalue = _mann_kendall(y)
        trend_significant = mk_pvalue < sig_threshold
    except Exception:
        mk_tau, mk_pvalue, trend_significant = None, None, False

    # ── 5. Hurst exponent (yearly only) ───────────────────────────────────
    hurst: Optional[float] = None
    persistence: Optional[str] = None
    if timeframe == "yearly":
        hurst = _hurst_rs(y)
        if hurst is not None:
            if hurst > 0.55:
                persistence = "trending"
            elif hurst < 0.45:
                persistence = "mean_reverting"
            else:
                persistence = "random"

    # ── 6. Holt-ES forecast ───────────────────────────────────────────────
    raw_forecast, _fc_status = _holt_forecast(y)
    next_period_forecast: Optional[float] = None
    forecast_change_pct: Optional[float] = None
    forecast_reliability = "unavailable"

    if raw_forecast is not None and np.isfinite(raw_forecast) and raw_forecast > 0:
        next_period_forecast = round(raw_forecast, 2)
        if y[-1] != 0:
            forecast_change_pct = round(float((raw_forecast - y[-1]) / y[-1] * 100), 2)

        r2 = r_squared if r_squared is not None else 0.0
        if trend_significant and r2 > 0.6:
            forecast_reliability = "high"
        elif trend_significant and r2 > 0.3:
            forecast_reliability = "moderate"
        else:
            forecast_reliability = "low"

    # ── 7. Direction ──────────────────────────────────────────────────────
    # Gated on statistical significance: without a significant trend (p < 0.05)
    # we cannot distinguish the direction from random noise → "flat".
    # Once significant, |tau| is always >> 0.05 (minimum 0.277 for n=26,
    # 0.323 for n=20, 0.449 for n=12), so we use the sign of tau directly.
    if not trend_significant:
        direction = "flat"
    elif mk_tau is not None and mk_tau > 0:
        direction = "up"
    elif mk_tau is not None and mk_tau < 0:
        direction = "down"
    else:
        direction = "flat"

    # ── 8. Strength ───────────────────────────────────────────────────────
    # Requires statistical significance for "moderate" or "strong".
    # A trend that didn't pass the MK significance test is always "weak" —
    # it may exist but cannot be confirmed with the available data, so
    # reporting "strong" alongside direction="flat" would be contradictory.
    abs_tau = abs(mk_tau) if mk_tau is not None else 0.0
    r2_val = r_squared if r_squared is not None else 0.0
    if trend_significant and abs_tau >= 0.6 and r2_val >= 0.6:
        strength = "strong"
    elif trend_significant and abs_tau >= 0.3 and r2_val >= 0.3:
        strength = "moderate"
    else:
        strength = "weak"

    # ── 9. Composite trend score ──────────────────────────────────────────
    if not trend_significant or mk_tau is None or mk_pvalue is None:
        trend_score = 0.0
    else:
        # Significance weight: grades from 0 (p=0.1) to 1 (p≤0.01)
        sig_weight = float(np.clip((0.1 - mk_pvalue) / 0.09, 0.0, 1.0))
        lin_weight = r2_val
        trend_score = float(np.clip(mk_tau * sig_weight * (0.5 + 0.5 * lin_weight), -1.0, 1.0))

    # ── 10. Trend label ───────────────────────────────────────────────────
    if direction == "flat":
        trend_label = "flat"
    elif direction == "up":
        trend_label = {"strong": "strong_uptrend", "moderate": "uptrend", "weak": "weak_uptrend"}[strength]
    else:
        trend_label = {"strong": "strong_downtrend", "moderate": "downtrend", "weak": "weak_downtrend"}[strength]

    # ── 11. Window label ──────────────────────────────────────────────────
    window_label_map = {
        "daily":   f"{n} trading days",
        "weekly":  f"{n} weeks",
        "monthly": f"{n} months",
        "yearly":  f"{round(n / 52, 1)} years (weekly bars)",
    }
    window_label = window_label_map.get(timeframe, f"{n} bars")

    return TimeframeTrend(
        timeframe=timeframe,
        window_label=window_label,
        window_bars=n,
        direction=direction,
        strength=strength,
        trend_label=trend_label,
        trend_score=round(trend_score, 4),
        slope_pct_per_bar=slope_pct,
        regression_start=reg_start,
        regression_end=reg_end,
        r_squared=round(r_squared, 4) if r_squared is not None else None,
        total_return_pct=total_return_pct,
        mk_tau=round(mk_tau, 4) if mk_tau is not None else None,
        mk_pvalue=round(mk_pvalue, 4) if mk_pvalue is not None else None,
        trend_significant=trend_significant,
        hurst_exponent=round(hurst, 4) if hurst is not None else None,
        persistence=persistence,
        next_period_forecast=next_period_forecast,
        forecast_change_pct=forecast_change_pct,
        forecast_reliability=forecast_reliability,
    )


def _empty_trend(timeframe: str, n: int = 0) -> "TimeframeTrend":  # noqa: F821
    from app.models.analysis import TimeframeTrend
    return TimeframeTrend(
        timeframe=timeframe,
        window_label=f"{n} bars (insufficient data)",
        window_bars=n,
        direction="flat",
        strength="weak",
        trend_label="flat",
        trend_score=0.0,
        slope_pct_per_bar=None,
        regression_start=None,
        regression_end=None,
        r_squared=None,
        total_return_pct=None,
        mk_tau=None,
        mk_pvalue=None,
        trend_significant=False,
        hurst_exponent=None,
        persistence=None,
        next_period_forecast=None,
        forecast_change_pct=None,
        forecast_reliability="unavailable",
    )


# ── Service ───────────────────────────────────────────────────────────────────

class TrendAnalysisService:
    """
    Computes multi-timeframe trend analysis for a price series.

    df_short : 252-day daily OHLCV  → used for daily, weekly, monthly timeframes
    df_long  : 1260-day daily OHLCV → resampled to weekly for the yearly timeframe
               (falls back to df_short if not provided)
    """

    def compute(
        self,
        symbol: str,
        df_short: pd.DataFrame,
        df_long: Optional[pd.DataFrame] = None,
    ) -> "MultiTimeframeTrend":  # noqa: F821
        from app.models.analysis import MultiTimeframeTrend

        trade_date = df_short.index[-1].strftime("%Y-%m-%d")
        close = df_short["Close"]

        # ── Daily: last 20 trading-day closes ─────────────────────────────
        daily_series = close.tail(20)

        # ── Weekly: resample to weekly (Friday) close, last 26 weeks ──────
        weekly_series = close.resample("W").last().dropna().tail(26)

        # ── Monthly: resample to month-end close, last 12 months ──────────
        monthly_series = close.resample("ME").last().dropna().tail(12)

        # ── Yearly: weekly bars from 5-year fetch (or df_short fallback) ──
        base_df = df_long if (df_long is not None and len(df_long) > len(df_short)) else df_short
        yearly_series = base_df["Close"].resample("W").last().dropna()

        return MultiTimeframeTrend(
            symbol=symbol,
            trade_date=trade_date,
            daily=_analyze_series(daily_series, "daily"),
            weekly=_analyze_series(weekly_series, "weekly"),
            monthly=_analyze_series(monthly_series, "monthly"),
            yearly=_analyze_series(yearly_series, "yearly"),
        )


trend_service = TrendAnalysisService()
