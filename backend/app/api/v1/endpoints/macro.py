from fastapi import APIRouter

from app.models.macro import MacroSnapshot
from app.services.macro.macro_service import get_macro_snapshot

router = APIRouter()


@router.get("/macro", response_model=MacroSnapshot)
async def get_macro():
    """Global macro context: VIX, bond yields, currencies, commodities."""
    return get_macro_snapshot()
