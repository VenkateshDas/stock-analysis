"""Opportunities endpoint — top long/short setups for India indices."""
from typing import List

from fastapi import APIRouter, HTTPException

from app.models.analysis import TradeSetup
from app.services.analysis.opportunities import scan_opportunities
from app.services.cache import opportunities_cache

router = APIRouter()

_INDIA_SYMBOLS = {"NSEI", "CNX100", "CNX200", "NSEBANK"}


@router.get("/indices/{symbol}/opportunities", response_model=List[TradeSetup])
async def get_opportunities(symbol: str):
    """Return top long/short trade setups for an India index constituent scan."""
    sym = symbol.upper()
    if sym not in _INDIA_SYMBOLS:
        raise HTTPException(status_code=404, detail=f"Opportunities only available for India indices: {sorted(_INDIA_SYMBOLS)}")

    cache_key = f"opportunities:{sym}"
    cached = opportunities_cache.get(cache_key)
    if cached is not None:
        return cached

    setups = scan_opportunities(sym)
    opportunities_cache.set(cache_key, setups)
    return setups
