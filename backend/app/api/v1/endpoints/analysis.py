from fastapi import APIRouter, HTTPException

from app.config import INDICES
from app.models.analysis import AnalysisResult
from app.models.fundamentals import StockFundamentals
from app.services.analysis.previous_day import analysis_orchestrator
from app.services.analysis.fundamentals import get_stock_fundamentals
from app.services.data_providers.yahoo import yahoo_provider

router = APIRouter()


@router.get("/indices/{symbol}/analysis", response_model=AnalysisResult)
async def get_analysis(symbol: str):
    """Return full technical + statistical analysis for an index."""
    symbol = symbol.upper()
    if symbol not in INDICES:
        raise HTTPException(status_code=404, detail=f"Index '{symbol}' not found")

    result = analysis_orchestrator.get_analysis(symbol)
    if result is None:
        raise HTTPException(status_code=503, detail=f"Analysis unavailable for {symbol}")
    return result


@router.get("/stocks/{ticker}/analysis", response_model=AnalysisResult)
async def get_stock_analysis(ticker: str):
    """Return technical + statistical analysis for an arbitrary stock ticker."""
    symbol = ticker.upper()
    meta = yahoo_provider.get_asset_metadata(symbol)
    result = analysis_orchestrator.get_analysis_for_ticker(
        symbol=symbol,
        ticker=symbol,
        currency=meta.get("currency", "USD"),
    )
    if result is None:
        raise HTTPException(status_code=503, detail=f"Analysis unavailable for {symbol}")
    return result


@router.get("/stocks/{ticker}/fundamentals", response_model=StockFundamentals)
async def get_fundamentals(ticker: str):
    """Return key fundamental metrics (PE, P/B, debt, growth, yield) for a stock."""
    symbol = ticker.upper()
    result = get_stock_fundamentals(symbol)
    if result is None:
        raise HTTPException(status_code=503, detail=f"Fundamentals unavailable for {symbol}")
    return result
