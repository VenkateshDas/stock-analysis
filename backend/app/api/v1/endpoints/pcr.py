from fastapi import APIRouter
from fastapi.responses import Response

from app.models.pcr import PCRResult
from app.services.analysis.pcr import pcr_service

router = APIRouter()


@router.get("/indices/{symbol}/pcr", response_model=PCRResult)
async def get_index_pcr(symbol: str):
    """Get Put-Call Ratio for an index via its proxy ETF. Returns 204 if unavailable."""
    result = pcr_service.get_pcr(symbol.upper())
    if result is None:
        return Response(status_code=204)
    return result


@router.get("/stocks/{ticker}/pcr", response_model=PCRResult)
async def get_stock_pcr(ticker: str):
    """Get Put-Call Ratio directly for a stock ticker. Returns 204 if unavailable."""
    result = pcr_service.get_stock_pcr(ticker.upper())
    if result is None:
        return Response(status_code=204)
    return result
