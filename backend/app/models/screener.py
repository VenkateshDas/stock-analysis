from pydantic import BaseModel
from typing import Any, Dict, List, Optional


# ── Field catalog ────────────────────────────────────────────────────────────

SCREENER_FIELDS: Dict[str, Dict[str, Any]] = {
    # Price/volume
    "close":             {"label": "Close Price",       "group": "Price",      "price_like": True},
    "open":              {"label": "Open Price",        "group": "Price",      "price_like": True},
    "change_pct":        {"label": "Change %",          "group": "Price",      "price_like": False},
    "volume":            {"label": "Volume",             "group": "Price",      "price_like": False},
    "rvol":              {"label": "Relative Volume",   "group": "Price",      "price_like": False},
    # Moving averages
    "ema20":             {"label": "EMA (20)",           "group": "MA",         "price_like": True},
    "ema50":             {"label": "EMA (50)",           "group": "MA",         "price_like": True},
    "ema200":            {"label": "EMA (200)",          "group": "MA",         "price_like": True},
    "sma20":             {"label": "SMA (20)",           "group": "MA",         "price_like": True},
    "sma50":             {"label": "SMA (50)",           "group": "MA",         "price_like": True},
    "sma200":            {"label": "SMA (200)",          "group": "MA",         "price_like": True},
    # Bollinger Bands
    "bb_upper":          {"label": "BB Upper",           "group": "Bollinger",  "price_like": True},
    "bb_middle":         {"label": "BB Middle",          "group": "Bollinger",  "price_like": True},
    "bb_lower":          {"label": "BB Lower",           "group": "Bollinger",  "price_like": True},
    "bb_pctb":           {"label": "BB %B",              "group": "Bollinger",  "price_like": False},
    # Momentum
    "rsi":               {"label": "RSI (14)",           "group": "Momentum",   "price_like": False},
    "macd":              {"label": "MACD Line",          "group": "Momentum",   "price_like": False},
    "macd_hist":         {"label": "MACD Histogram",    "group": "Momentum",   "price_like": False},
    # Trend
    "adx":               {"label": "ADX (14)",           "group": "Trend",      "price_like": False},
    "plus_di":           {"label": "+DI (14)",           "group": "Trend",      "price_like": False},
    "minus_di":          {"label": "-DI (14)",           "group": "Trend",      "price_like": False},
    # Volatility
    "atr":               {"label": "ATR (14)",           "group": "Volatility", "price_like": True},
    "atr_pct":           {"label": "ATR % of Price",     "group": "Volatility", "price_like": False},
    # Fundamental
    "market_cap_cr":     {"label": "Market Cap (Cr.)",  "group": "Fundamental","price_like": False},
    "market_cap_b":      {"label": "Market Cap (USD B)","group": "Fundamental","price_like": False},
    "pe_ratio":          {"label": "P/E Ratio",          "group": "Fundamental","price_like": False},
    "yearly_return_pct": {"label": "1Y Return %",        "group": "Fundamental","price_like": False},
    # Price structure
    "hi52w_pct":         {"label": "Distance from 52W High %", "group": "Price Structure", "price_like": False},
    "consec_red":        {"label": "Consecutive Down Days",     "group": "Price Structure", "price_like": False},
}

OP_LABELS = {
    "gt":  ">",
    "lt":  "<",
    "gte": "≥",
    "lte": "≤",
    "eq":  "=",
}


def condition_display_label(lhs: str, op: str, rhs_value: Optional[float], rhs_field: Optional[str]) -> str:
    lhs_label = SCREENER_FIELDS.get(lhs, {}).get("label", lhs)
    op_label   = OP_LABELS.get(op, op)
    if rhs_field:
        rhs_label = SCREENER_FIELDS.get(rhs_field, {}).get("label", rhs_field)
        return f"{lhs_label} {op_label} {rhs_label}"
    if rhs_value is not None:
        return f"{lhs_label} {op_label} {rhs_value:,.2f}"
    return f"{lhs_label} {op_label} ?"


# ── Request / Response models ────────────────────────────────────────────────

class ScreenerCondition(BaseModel):
    id: Optional[str] = None          # client-side UUID for React key (ignored by backend)
    lhs: str                           # field name, e.g. "ema20"
    op: str                            # "gt" | "lt" | "gte" | "lte" | "eq"
    rhs_value: Optional[float] = None  # compare to constant
    rhs_field: Optional[str] = None    # compare to another field


class ScreenerCriteria(BaseModel):
    index_symbol: str                             # "NSEI" | "CNX100" | "NSEBANK"
    preset_id: Optional[str] = None
    conditions: List[ScreenerCondition] = []
    interval: str = "1d"                          # "15m" | "1h" | "1d"


class ScreenerRow(BaseModel):
    symbol: str
    name: str
    sector: str
    # Price
    price: float
    open_price: Optional[float]
    change: Optional[float]       # absolute day change
    change_pct: Optional[float]   # % day change
    # Volume / fundamental
    volume: Optional[float]
    market_cap_cr: Optional[float]
    market_cap_b: Optional[float]
    pe_ratio: Optional[float]
    # Technical
    ema20: Optional[float]
    ema50: Optional[float]
    ema200: Optional[float]
    sma50: Optional[float]
    sma200: Optional[float]
    rsi: Optional[float]
    adx: Optional[float]
    macd: Optional[float]
    rvol: Optional[float]
    atr: Optional[float]
    atr_pct: Optional[float]
    # Screener score
    score: int                   # filters passed
    total_conditions: int
    matched: List[str]           # plain-English reason per passed condition
    quality: str                 # "A" | "B" | "C"


class ScreenerResult(BaseModel):
    index_symbol: str
    preset_id: Optional[str]
    total_scanned: int
    total_matched: int
    rows: List[ScreenerRow]
    scanned_at: str


class ScreenerPreset(BaseModel):
    id: str
    name: str
    timeframe: str            # "intraday" | "swing" | "medium" | "long" | "short"
    category: str = "Trend Following"  # "Trend Following" | "Mean Reversion" | "Hybrid"
    description: str
    conditions: List[ScreenerCondition]
    filter_chips: List[str]   # pre-computed display labels for each condition


class AvailableField(BaseModel):
    id: str
    label: str
    group: str
    price_like: bool


class ScreenerFieldsResponse(BaseModel):
    fields: List[AvailableField]
    operators: Dict[str, str]   # op_id → symbol
