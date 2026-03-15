"""Heatmap service: batch-fetches constituent prices and computes daily % change."""
import logging
from datetime import date, timedelta
from typing import Optional

import pandas as pd
import yfinance as yf

from app.models.heatmap import HeatmapData, HeatmapSector, HeatmapStock
from app.services.cache import heatmap_cache
from app.services.data_providers.yahoo import yahoo_provider

logger = logging.getLogger(__name__)


def _fetch_price_changes(symbols: list[str]) -> dict[str, tuple[Optional[float], Optional[float]]]:
    """
    Batch-download ~10 days of daily prices (buffer for holidays/weekends),
    then return the most-recent 1-day % change for every symbol.

    Returns: { symbol: (last_price, change_pct) }
    """
    if not symbols:
        return {}

    end = date.today() + timedelta(days=1)
    start = end - timedelta(days=10)

    try:
        raw = yf.download(
            tickers=symbols,
            start=str(start),
            end=str(end),
            auto_adjust=True,
            progress=False,
            threads=True,
        )
    except Exception as exc:
        logger.error("yfinance download failed: %s", exc)
        return {}

    if raw is None or raw.empty:
        return {}

    # Normalise to a DataFrame with one column per symbol
    if isinstance(raw.columns, pd.MultiIndex):
        close_df = raw["Close"]
    else:
        # Single-symbol download — simple column index
        close_df = pd.DataFrame({symbols[0]: raw["Close"]})

    results: dict[str, tuple[Optional[float], Optional[float]]] = {}
    for sym in symbols:
        try:
            col = close_df.get(sym)
            if col is None:
                results[sym] = (None, None)
                continue
            closes = col.dropna()
            if len(closes) >= 2:
                prev = float(closes.iloc[-2])
                curr = float(closes.iloc[-1])
                pct = round((curr - prev) / prev * 100, 2) if prev else 0.0
                results[sym] = (curr, pct)
            elif len(closes) == 1:
                results[sym] = (float(closes.iloc[-1]), 0.0)
            else:
                results[sym] = (None, None)
        except Exception as exc:
            logger.warning("Failed to process %s: %s", sym, exc)
            results[sym] = (None, None)

    return results


def get_heatmap_data(index_symbol: str) -> Optional[HeatmapData]:
    """Build and return HeatmapData for *index_symbol*, using a 15-min cache."""
    cache_key = f"heatmap:{index_symbol}"
    cached = heatmap_cache.get(cache_key)
    if cached is not None:
        return cached

    # Fetch constituents dynamically from Yahoo Finance via ETF holdings
    constituents = yahoo_provider.get_index_constituents(index_symbol)
    if not constituents:
        # Fallback: try to get from static config for non-Indian indices
        from app.services.data_providers.index_constituents import INDEX_CONSTITUENTS
        constituents = INDEX_CONSTITUENTS.get(index_symbol, [])
        if not constituents:
            return None

    symbols = [c["symbol"] for c in constituents]
    price_data = _fetch_price_changes(symbols)

    # Group stocks by sector
    sectors_map: dict[str, list[HeatmapStock]] = {}
    for c in constituents:
        sec = c["sector"]
        price, change_pct = price_data.get(c["symbol"], (None, None))
        stock = HeatmapStock(
            symbol=c["symbol"],
            name=c["name"],
            sector=sec,
            industry=c["industry"],
            weight=c["weight"],
            price=round(price, 2) if price else None,
            change_pct=change_pct,
        )
        sectors_map.setdefault(sec, []).append(stock)

    sector_list = [
        HeatmapSector(
            name=name,
            total_weight=round(sum(s.weight for s in stocks), 2),
            stocks=stocks,
        )
        for name, stocks in sorted(
            sectors_map.items(), key=lambda kv: -sum(s.weight for s in kv[1])
        )
    ]

    result = HeatmapData(
        index_symbol=index_symbol,
        timestamp=str(date.today()),
        sectors=sector_list,
    )
    heatmap_cache.set(cache_key, result)
    return result
