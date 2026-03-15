from pydantic import BaseModel
from typing import List, Optional


class MACDData(BaseModel):
    macd: Optional[float]
    signal: Optional[float]
    histogram: Optional[float]


class BollingerData(BaseModel):
    upper: Optional[float]
    middle: Optional[float]  # SMA20
    lower: Optional[float]
    percent_b: Optional[float]  # position within bands 0-1


class TechnicalIndicators(BaseModel):
    # RSI
    rsi: Optional[float]
    rsi_signal: str  # "overbought" | "oversold" | "neutral"

    # MACD
    macd: MACDData
    macd_signal: str  # "bullish" | "bearish" | "neutral"

    # Bollinger Bands
    bollinger: BollingerData
    bb_signal: str  # "above_upper" | "below_lower" | "near_upper" | "near_lower" | "middle"

    # ADX
    adx: Optional[float]
    adx_signal: str  # "strong_trend" | "moderate_trend" | "weak_trend" | "no_trend"
    plus_di: Optional[float]
    minus_di: Optional[float]

    # Moving Averages
    sma20: Optional[float]
    sma50: Optional[float]
    sma200: Optional[float]
    price_vs_sma20: str   # "above" | "below"
    price_vs_sma50: str
    price_vs_sma200: str

    # Exponential Moving Averages
    ema20: Optional[float] = None
    ema50: Optional[float] = None
    ema200: Optional[float] = None
    ema_cross: str = "neutral"  # "bullish" (ema20>ema50) | "bearish" | "neutral"

    # ATR
    atr: Optional[float]
    atr_pct: Optional[float]  # ATR as % of price

    # OBV
    obv: Optional[float]
    obv_trend: str  # "rising" | "falling" | "flat"

    # Volume
    rvol: Optional[float]  # relative volume vs 30-day avg
    rvol_signal: str  # "high" | "normal" | "low"


class MonthlyContribution(BaseModel):
    month: str          # "Jan", "Feb", etc.
    year: int
    overnight_pct: float  # cumulative overnight (gap) contribution for the month
    intraday_pct: float   # cumulative intraday contribution for the month


class StatisticalMetrics(BaseModel):
    # Returns
    daily_return_pct: Optional[float]
    weekly_return_pct: Optional[float]    # 5-day
    monthly_return_pct: Optional[float]   # 20-day
    roc_3m_pct: Optional[float] = None    # 60-day rate of change
    roc_6m_pct: Optional[float] = None    # 126-day rate of change
    yearly_return_pct: Optional[float]    # 252-day
    ytd_return_pct: Optional[float]

    # 52-week range
    week52_high: Optional[float]
    week52_low: Optional[float]
    pct_from_52w_high: Optional[float]
    pct_from_52w_low: Optional[float]

    # Drawdown
    current_drawdown_pct: Optional[float] = None  # drop from rolling 3M peak
    max_drawdown_ytd_pct: Optional[float] = None  # worst peak-to-trough since Jan 1

    # Volatility
    volatility_20d: Optional[float]  # annualized 20-day vol

    # Range analysis
    daily_range: Optional[float]           # today's High - Low
    daily_range_pct: Optional[float]       # as % of prev close
    atr_ratio: Optional[float]             # daily range / ATR
    avg_daily_range_pts: Optional[float] = None   # 20-day avg of H-L
    avg_daily_range_pct: Optional[float] = None   # 20-day avg as % of close
    avg_weekly_range_pts: Optional[float] = None  # 12-week avg of weekly H-L
    avg_weekly_range_pct: Optional[float] = None  # 12-week avg as % of close

    # Overnight vs Intraday contribution (last 6 months)
    overnight_intraday: Optional[List[MonthlyContribution]] = None


class MarketRegimeResult(BaseModel):
    regime: str        # "bull_trending" | "bear_trending" | "consolidating" | "volatile"
    phase: str         # "early" | "mid" | "late"
    daily_bias: str    # "bullish" | "bearish" | "neutral"
    confidence: float  # 0.0–1.0
    action_bias: str   # "buy_dips" | "sell_rallies" | "wait" | "breakout_watch"
    key_support: Optional[float]
    key_resistance: Optional[float]
    drivers: List[str]  # max 3 plain-English evidence bullets
    caution: List[str]  # max 2 risk factors


class TradeSetup(BaseModel):
    symbol: str
    name: str
    direction: str      # "long" | "short"
    setup_type: str     # "momentum" | "pullback" | "breakout"
    quality: str        # "A" | "B" | "C"
    entry_price: float
    stop_loss: float
    target: float
    risk_reward: float
    reasons: List[str]  # max 3 evidence bullets
    risks: List[str]    # max 2 caution bullets
    weight_in_index: float
    sector: str
    relative_return_1m: float  # vs index (alpha)


class AnalysisResult(BaseModel):
    symbol: str
    trade_date: str
    last_close: float
    last_open: Optional[float] = None
    last_volume: Optional[float] = None
    currency: str

    technical: TechnicalIndicators
    statistical: StatisticalMetrics

    # Overall sentiment derived from indicators
    overall_sentiment: str  # "bullish" | "bearish" | "neutral"
    sentiment_score: float  # -1.0 to 1.0

    regime: Optional[MarketRegimeResult] = None


class TimeframeTrend(BaseModel):
    """Trend metrics for a single timeframe (daily / weekly / monthly / yearly)."""
    timeframe: str           # "daily" | "weekly" | "monthly" | "yearly"
    window_label: str        # Human-readable window, e.g. "20 trading days"
    window_bars: int         # Number of bars actually used

    # Direction & classification
    direction: str           # "up" | "down" | "flat"
    strength: str            # "strong" | "moderate" | "weak"
    trend_label: str         # "strong_uptrend" | "uptrend" | "weak_uptrend" | "flat" | ...
    trend_score: float       # Composite [-1.0, +1.0]

    # Theil-Sen regression (robust — resistant to outlier price shocks)
    slope_pct_per_bar: Optional[float]   # % of mean price per bar
    regression_start: Optional[float]    # Regression line value at bar 0
    regression_end: Optional[float]      # Regression line value at last bar

    # Trend quality
    r_squared: Optional[float]           # OLS R² [0, 1] — how linear is the move
    total_return_pct: Optional[float]    # Raw % change start→end of window

    # Mann-Kendall non-parametric significance test
    mk_tau: Optional[float]              # Kendall's tau [-1, +1]
    mk_pvalue: Optional[float]           # Two-sided p-value
    trend_significant: bool              # p < 0.05

    # Persistence (yearly timeframe only, None otherwise)
    hurst_exponent: Optional[float]      # [0, 1]  H>0.55 = trending, <0.45 = mean-reverting
    persistence: Optional[str]           # "trending" | "random" | "mean_reverting"

    # Holt's Linear Exponential Smoothing forecast
    next_period_forecast: Optional[float]   # Projected next-bar price
    forecast_change_pct: Optional[float]    # % change vs last close
    forecast_reliability: str               # "high" | "moderate" | "low" | "unavailable"


class MultiTimeframeTrend(BaseModel):
    symbol: str
    trade_date: str
    daily: TimeframeTrend
    weekly: TimeframeTrend
    monthly: TimeframeTrend
    yearly: TimeframeTrend


class LLMSummary(BaseModel):
    symbol: str
    trade_date: str
    commentary: str
    model_used: str
    generated_at: str


class OverviewResponse(BaseModel):
    trade_date: str
    bullish_count: int
    bearish_count: int
    neutral_count: int
    overall_sentiment: str
    indices_sentiment: dict  # symbol -> sentiment
