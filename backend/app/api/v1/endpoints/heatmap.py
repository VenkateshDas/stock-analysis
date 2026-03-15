import asyncio

from fastapi import APIRouter, HTTPException

from app.models.heatmap import HeatmapData
from app.services.heatmap_service import get_heatmap_data

router = APIRouter()


@router.get("/indices/{symbol}/heatmap", response_model=HeatmapData)
async def get_heatmap(symbol: str):
    """
    Constituent heatmap for the given index.
    Returns all index members grouped by sector with their latest % change.
    Results are cached for 15 minutes.

    Supported: NSEI, CNX100, NSEBANK, DJI, NDX, GSPC
    """
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_heatmap_data, symbol.upper())
    if data is None:
        raise HTTPException(
            status_code=404,
            detail=f"Heatmap not available for '{symbol}'. "
                   f"Supported indices: NSEI, DJI, NDX, GSPC",
        )
    return data
