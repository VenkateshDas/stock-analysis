import pytz
from datetime import datetime, date
from typing import Optional
import pandas as pd


def get_local_date(timezone: str) -> date:
    """Return today's date in the given timezone."""
    tz = pytz.timezone(timezone)
    return datetime.now(tz).date()


def safe_float(value) -> Optional[float]:
    """Convert to float safely, returning None for NaN/inf."""
    try:
        v = float(value)
        if v != v or v == float('inf') or v == float('-inf'):  # NaN or inf check
            return None
        return round(v, 4)
    except (TypeError, ValueError):
        return None


def pct_change(new: float, old: float) -> Optional[float]:
    """Calculate percentage change."""
    if old == 0:
        return None
    return round((new - old) / old * 100, 4)


def format_large_number(n: float) -> str:
    """Format large numbers with B/M suffix."""
    if n >= 1e9:
        return f"{n / 1e9:.2f}B"
    elif n >= 1e6:
        return f"{n / 1e6:.2f}M"
    return f"{n:,.0f}"


def utc_now_str() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
