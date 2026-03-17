from fastapi import APIRouter, HTTPException

from app.models.macro import MacroSnapshot, MacroTickerDetail
from app.services.macro.macro_service import get_macro_snapshot, get_macro_ticker_detail

router = APIRouter()


@router.get("/macro", response_model=MacroSnapshot)
async def get_macro():
    """Global macro context: VIX, bond yields, currencies, commodities."""
    return get_macro_snapshot()


@router.get("/macro/{key}", response_model=MacroTickerDetail)
async def get_macro_detail(key: str):
    """Detailed view of a single macro indicator with 90-day price history."""
    detail = get_macro_ticker_detail(key)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Macro indicator '{key}' not found")
    return detail
