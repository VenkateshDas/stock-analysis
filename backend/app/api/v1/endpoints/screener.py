from fastapi import APIRouter
from typing import List

from app.models.screener import ScreenerCriteria, ScreenerFieldsResponse, ScreenerPreset, ScreenerResult
from app.services.analysis.screener import get_fields, get_presets, run_scan

router = APIRouter(prefix="/screener")


@router.get("/presets", response_model=List[ScreenerPreset])
async def list_presets():
    """Return all built-in strategy presets."""
    return get_presets()


@router.get("/fields", response_model=ScreenerFieldsResponse)
async def available_fields():
    """Return all available fields and operators for building conditions."""
    return get_fields()


@router.post("/scan", response_model=ScreenerResult)
async def scan(criteria: ScreenerCriteria):
    """Scan index constituents against condition-based criteria."""
    return run_scan(criteria)
