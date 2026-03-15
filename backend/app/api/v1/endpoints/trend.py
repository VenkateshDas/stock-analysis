import logging

from fastapi import APIRouter, HTTPException

from app.config import INDICES, settings
from app.models.analysis import MultiTimeframeTrend
from app.services.cache import trend_cache
from app.services.data_providers.yahoo import yahoo_provider
from app.services.analysis.trend import trend_service

logger = logging.getLogger(__name__)
router = APIRouter()
TREND_TTL_SECONDS = 900


@router.get("/indices/{symbol}/trend", response_model=MultiTimeframeTrend)
async def get_trend(symbol: str):
    """
    Multi-timeframe trend analysis (daily / weekly / monthly / yearly).

    Methods: Theil-Sen regression, Mann-Kendall test, OLS R²,
             Holt's Linear Exponential Smoothing forecast,
             Hurst exponent (yearly only).
    """
    symbol = symbol.upper()
    config = INDICES.get(symbol)
    if config is None:
        raise HTTPException(status_code=404, detail=f"Index '{symbol}' not found")

    cache_key = f"trend:{symbol}"
    cached = trend_cache.get(cache_key)
    if cached is not None:
        return cached

    # Short history (252 days) — daily, weekly, monthly timeframes
    df_short = yahoo_provider.get_history(config.ticker, period_days=settings.analysis_lookback_days)
    if df_short.empty or len(df_short) < 10:
        raise HTTPException(status_code=503, detail=f"Insufficient data for {symbol}")

    # Long history (5 years) — yearly timeframe; failure is non-fatal
    df_long = None
    try:
        df_long = yahoo_provider.get_history(config.ticker, period_days=settings.trend_lookback_days)
    except Exception as exc:
        logger.warning(f"Long history fetch failed for {symbol}: {exc}. Falling back to 252-day data.")

    result = trend_service.compute(symbol, df_short, df_long)
    trend_cache.set(cache_key, result, ttl=TREND_TTL_SECONDS)
    return result


@router.get("/stocks/{ticker}/trend", response_model=MultiTimeframeTrend)
async def get_stock_trend(ticker: str):
    """Multi-timeframe trend analysis for an arbitrary stock ticker."""
    symbol = ticker.upper()
    cache_key = f"trend:stock:{symbol}"
    cached = trend_cache.get(cache_key)
    if cached is not None:
        return cached

    df_short = yahoo_provider.get_history(symbol, period_days=settings.analysis_lookback_days)
    if df_short.empty or len(df_short) < 10:
        raise HTTPException(status_code=503, detail=f"Insufficient data for {symbol}")

    df_long = None
    try:
        df_long = yahoo_provider.get_history(symbol, period_days=settings.trend_lookback_days)
    except Exception as exc:
        logger.warning(f"Long history fetch failed for {symbol}: {exc}. Falling back to short history.")

    result = trend_service.compute(symbol, df_short, df_long)
    trend_cache.set(cache_key, result, ttl=TREND_TTL_SECONDS)
    return result
