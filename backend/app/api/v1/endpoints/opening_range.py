from fastapi import APIRouter, HTTPException

from app.config import INDICES
from app.models.opening_range import OpeningRangeResult
from app.services.analysis.opening_range import opening_range_service
from app.services.data_providers.yahoo import yahoo_provider

router = APIRouter()


@router.get("/indices/{symbol}/opening-range", response_model=OpeningRangeResult)
async def get_opening_range(symbol: str):
    """Return gap analysis and OHOL signal for the opening range of an index."""
    symbol = symbol.upper()
    if symbol not in INDICES:
        raise HTTPException(status_code=404, detail=f"Index '{symbol}' not found")

    result = opening_range_service.get_opening_range(symbol)
    if result is None:
        raise HTTPException(
            status_code=503,
            detail=f"Opening range data unavailable for {symbol}",
        )
    return result


@router.get("/stocks/{ticker}/opening-range", response_model=OpeningRangeResult)
async def get_stock_opening_range(ticker: str):
    """Return gap and opening-range signal for an arbitrary stock ticker."""
    symbol = ticker.upper()
    meta = yahoo_provider.get_asset_metadata(symbol)
    result = opening_range_service.get_opening_range_for_asset(
        symbol=f"stock:{symbol}",
        ticker=symbol,
        timezone=meta.get("timezone", "America/New_York"),
    )
    if result is None:
        raise HTTPException(
            status_code=503,
            detail=f"Opening range data unavailable for {symbol}",
        )
    # Keep response symbol clean for frontend display
    result.symbol = symbol
    return result
