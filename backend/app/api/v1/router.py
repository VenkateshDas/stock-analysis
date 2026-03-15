from fastapi import APIRouter

from app.api.v1 import auth as auth_module
from app.api.v1.endpoints import market_data, analysis, llm_summary, trend, sector, opening_range, heatmap, bot, pcr, opportunities, screener, paper_trades, macro, valuation

api_router = APIRouter()

api_router.include_router(auth_module.router, tags=["Auth"])
api_router.include_router(market_data.router, tags=["Market Data"])
api_router.include_router(analysis.router, tags=["Analysis"])
api_router.include_router(llm_summary.router, tags=["LLM Summary"])
api_router.include_router(trend.router, tags=["Trend Analysis"])
api_router.include_router(sector.router, tags=["Sector Analysis"])
api_router.include_router(opening_range.router, tags=["Opening Range"])
api_router.include_router(heatmap.router, tags=["Heatmap"])
api_router.include_router(bot.router, tags=["Bot Trading"])
api_router.include_router(pcr.router, tags=["PCR"])
api_router.include_router(opportunities.router, tags=["Opportunities"])
api_router.include_router(screener.router, tags=["Screener"])
api_router.include_router(paper_trades.router, tags=["Paper Trades"])
api_router.include_router(macro.router, tags=["Macro"])
api_router.include_router(valuation.router, tags=["Valuation"])


@api_router.get("/overview", tags=["Overview"])
async def get_overview():
    """Cross-index sentiment summary."""
    from app.config import INDICES
    from app.services.analysis.previous_day import analysis_orchestrator
    from datetime import date

    sentiments = {}
    bullish = bearish = neutral = 0

    for symbol in INDICES:
        try:
            result = analysis_orchestrator.get_analysis(symbol)
            if result:
                sentiments[symbol] = result.overall_sentiment
                if result.overall_sentiment == "bullish":
                    bullish += 1
                elif result.overall_sentiment == "bearish":
                    bearish += 1
                else:
                    neutral += 1
        except Exception:
            sentiments[symbol] = "unknown"

    if bullish > bearish + neutral:
        overall = "risk-on"
    elif bearish > bullish + neutral:
        overall = "risk-off"
    else:
        overall = "mixed"

    return {
        "trade_date": str(date.today()),
        "bullish_count": bullish,
        "bearish_count": bearish,
        "neutral_count": neutral,
        "overall_sentiment": overall,
        "indices_sentiment": sentiments,
    }


@api_router.get("/refresh", tags=["Cache"])
async def refresh_cache():
    """Force-clear all caches so next request re-fetches live data."""
    from app.services.cache import market_cache, analysis_cache, llm_cache, trend_cache, opening_range_cache, heatmap_cache
    from app.services.macro.macro_service import _macro_cache
    from app.services.analysis.valuation import _cache as valuation_cache
    from app.services.analysis.fundamentals import _cache as fundamentals_cache
    market_cache.clear()
    analysis_cache.clear()
    llm_cache.clear()
    trend_cache.clear()
    opening_range_cache.clear()
    heatmap_cache.clear()
    _macro_cache.clear()
    valuation_cache.clear()
    fundamentals_cache.clear()
    return {"status": "ok", "message": "All caches cleared. Next requests will fetch fresh data."}
