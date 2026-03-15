from fastapi import APIRouter, HTTPException

from app.config import INDICES, INDIA_SYMBOLS, VALUATION_ETF_PROXY
from app.models.valuation import ValuationMetrics
from app.services.analysis.valuation import get_valuation

router = APIRouter()


@router.get("/indices/{symbol}/valuation", response_model=ValuationMetrics)
async def index_valuation(symbol: str):
    """Return valuation multiples (PE, P/B, yield, ERP) for an index."""
    sym = symbol.upper()
    if sym not in INDICES:
        raise HTTPException(status_code=404, detail=f"Unknown index: {sym}")

    if sym not in INDIA_SYMBOLS and sym not in VALUATION_ETF_PROXY:
        raise HTTPException(status_code=404, detail=f"No valuation data available for {sym}")

    result = get_valuation(sym)
    if result is None:
        raise HTTPException(status_code=503, detail="Valuation data temporarily unavailable")
    return result
