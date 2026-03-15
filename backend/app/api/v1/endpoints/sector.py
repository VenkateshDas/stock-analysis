from datetime import date
import logging

from fastapi import APIRouter, HTTPException
from typing import List

from app.config import INDICES, VALID_REGIONS
from app.models.sector import GlobalSectorSummary, IndexSectorAnalysis
from app.services.sector_service import sector_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/sectors/global/{region}", response_model=GlobalSectorSummary)
async def get_global_sectors(region: str):
    """
    Get regional sector performance tracked via sector ETFs.

    - **region**: One of ``americas``, ``asia-pacific``, ``europe``
    """
    if region not in VALID_REGIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid region. Must be one of: {VALID_REGIONS}",
        )
    try:
        return sector_service.get_global_sectors(region)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch sector data: {exc}")


@router.get("/sectors/index/{symbol}", response_model=IndexSectorAnalysis)
async def get_index_sectors(symbol: str):
    """
    Full sector + constituent breakdown for a specific index.

    Returns every tracked stock grouped by sector, with:
    - Individual weights and daily price changes
    - Each stock's contribution to the index move
    - Sector-level aggregates (weighted-average change, total contribution)
    - Top 5 gainers and losers across all sectors
    """
    symbol = symbol.upper()
    if symbol not in INDICES:
        raise HTTPException(
            status_code=404,
            detail=f"Index '{symbol}' not found. Available: {list(INDICES.keys())}",
        )
    try:
        return sector_service.get_index_sector_analysis(symbol)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch sector data: {exc}")


@router.get("/sectors/all", response_model=List[IndexSectorAnalysis])
async def get_all_index_sectors():
    """
    Full sector breakdown for every tracked index.

    Useful for the dashboard overview — returns the same rich data as
    ``/sectors/index/{symbol}`` but for all indices in one call.
    """
    try:
        return sector_service.get_all_index_sectors()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch sector data: {exc}")


@router.get("/overview/sectors")
async def get_sector_overview():
    """
    Combined sector overview:
    - Global sector performance by region (ETF proxies)
    - Full per-index sector breakdowns
    - Overall market sentiment score
    """
    try:
        global_sectors: dict = {}
        for region in VALID_REGIONS:
            try:
                global_sectors[region] = sector_service.get_global_sectors(region)
            except Exception as exc:
                logger.warning("Failed to get global sectors for %s: %s", region, exc)
                global_sectors[region] = None

        index_breakdowns = sector_service.get_all_index_sectors()

        total_positive = sum(
            len(s.positive_sectors) for s in global_sectors.values() if s
        )
        total_negative = sum(
            len(s.negative_sectors) for s in global_sectors.values() if s
        )

        if total_positive > total_negative:
            sentiment = "risk-on"
        elif total_negative > total_positive:
            sentiment = "risk-off"
        else:
            sentiment = "neutral"

        return {
            "trade_date": str(date.today()),
            "global_sectors": global_sectors,
            "index_breakdowns": index_breakdowns,
            "overall_market_sentiment": sentiment,
            "summary": {
                "positive_sectors_count": total_positive,
                "negative_sectors_count": total_negative,
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch sector overview: {exc}")
