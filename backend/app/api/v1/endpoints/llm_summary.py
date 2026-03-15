import logging

from fastapi import APIRouter, HTTPException

from app.config import INDICES, settings
from app.models.analysis import LLMSummary
from app.services.analysis.previous_day import analysis_orchestrator
from app.services.analysis.trend import trend_service
from app.services.cache import trend_cache
from app.services.data_providers.yahoo import yahoo_provider
from app.services.llm.market_summary import market_summary_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/indices/{symbol}/summary", response_model=LLMSummary)
async def get_summary(symbol: str):
    """
    LLM-generated plain-English analysis for an index.

    Passes the full technical analysis, statistical metrics, and
    multi-timeframe trend analysis to the model so it can produce
    a comprehensive beginner-friendly explanation with actionables.
    """
    symbol = symbol.upper()
    config = INDICES.get(symbol)
    if config is None:
        raise HTTPException(status_code=404, detail=f"Index '{symbol}' not found")

    analysis = analysis_orchestrator.get_analysis(symbol)
    if analysis is None:
        raise HTTPException(status_code=503, detail=f"Analysis unavailable for {symbol}")

    # ── Trend data — try cache first, then compute (non-fatal) ─────────────
    trend_data = trend_cache.get(f"trend:{symbol}")
    if trend_data is None:
        try:
            df_short = yahoo_provider.get_history(
                config.ticker, period_days=settings.analysis_lookback_days
            )
            df_long = None
            try:
                df_long = yahoo_provider.get_history(
                    config.ticker, period_days=settings.trend_lookback_days
                )
            except Exception:
                pass

            if not df_short.empty and len(df_short) >= 10:
                trend_data = trend_service.compute(symbol, df_short, df_long)
                trend_cache.set(f"trend:{symbol}", trend_data)
        except Exception as exc:
            logger.warning(f"Trend data unavailable for LLM summary of {symbol}: {exc}")
            # trend_data remains None — the summary will still be generated
            # without the multi-timeframe section

    summary = market_summary_service.get_summary(symbol, analysis, trend_data)
    return summary


@router.get("/stocks/{ticker}/summary", response_model=LLMSummary)
async def get_stock_summary(ticker: str):
    """
    LLM-generated plain-English analysis for a stock ticker.
    """
    symbol = ticker.upper()
    meta = yahoo_provider.get_asset_metadata(symbol)

    analysis = analysis_orchestrator.get_analysis_for_ticker(
        symbol=symbol,
        ticker=symbol,
        currency=meta.get("currency", "USD"),
    )
    if analysis is None:
        raise HTTPException(status_code=503, detail=f"Analysis unavailable for {symbol}")

    trend_data = trend_cache.get(f"trend:stock:{symbol}")
    if trend_data is None:
        try:
            df_short = yahoo_provider.get_history(
                symbol, period_days=settings.analysis_lookback_days
            )
            df_long = None
            try:
                df_long = yahoo_provider.get_history(
                    symbol, period_days=settings.trend_lookback_days
                )
            except Exception:
                pass

            if not df_short.empty and len(df_short) >= 10:
                trend_data = trend_service.compute(symbol, df_short, df_long)
                trend_cache.set(f"trend:stock:{symbol}", trend_data)
        except Exception as exc:
            logger.warning(f"Trend data unavailable for LLM summary of {symbol}: {exc}")

    summary = market_summary_service.get_summary(symbol, analysis, trend_data)
    return summary
