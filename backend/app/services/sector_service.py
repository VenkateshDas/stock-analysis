"""
Sector analysis service.

Flow for get_index_sector_analysis():
  1. Fetch constituents
       - NSE indices:    NSE equity-stockIndices API  (symbol, industry, weightage, live prices)
       - Other indices:  proxy ETF top_holdings via yfinance
  2. Normalise weights
  3. Enrich price data for stocks that don't have it yet (batch yf.download)
  4. Enrich sector / company-name info for stocks that don't have it yet
       (parallel yf.Ticker.info, cached 24 h per symbol)
  5. Build StockBreakdown → group by sector → IndexSectorAnalysis
"""

import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FutureTimeoutError
from datetime import date
import io
from typing import Any, Dict, List, Optional, Tuple

import httpx
import pandas as pd
import yfinance as yf

from app.config import INDEX_PROXY_ETFS, INDEX_REGION_MAP, INDICES, SECTOR_ETFS, VALID_REGIONS
from app.models.sector import (
    GlobalSectorSummary,
    IndexSectorAnalysis,
    SectorBreakdown,
    SectorPerformance,
    StockBreakdown,
)
from app.services.cache import market_cache, stock_info_cache

logger = logging.getLogger(__name__)


class SectorService:
    """Service for fetching and analysing sector performance data for indices."""

    # NSE API index name mapping
    _NSE_INDEX_NAME_MAP: Dict[str, str] = {
        "NSEI":    "NIFTY 50",
        "CNX100":  "NIFTY 100",
        "CNX200":  "NIFTY 200",
        "CNX500":  "NIFTY 500",
        "NSEBANK": "NIFTY BANK",
    }

    # US index → Wikipedia URL for pd.read_html
    _US_WIKI_URLS: Dict[str, str] = {
        "SP500":  "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
        "NDX100": "https://en.wikipedia.org/wiki/Nasdaq-100",
    }

    # Dow Jones 30 — hardcoded (stable, rarely changes)
    _DJI30_STOCKS: List[Tuple[str, str, str]] = [
        ("AAPL",  "Apple Inc.",                             "Technology"),
        ("AMGN",  "Amgen Inc.",                             "Healthcare"),
        ("AXP",   "American Express Co.",                   "Financial Services"),
        ("AMZN",  "Amazon.com Inc.",                        "Consumer Discretionary"),
        ("BA",    "Boeing Co.",                             "Industrials"),
        ("CAT",   "Caterpillar Inc.",                       "Industrials"),
        ("CRM",   "Salesforce Inc.",                        "Technology"),
        ("CSCO",  "Cisco Systems Inc.",                     "Technology"),
        ("CVX",   "Chevron Corp.",                          "Energy"),
        ("DIS",   "Walt Disney Co.",                        "Communication Services"),
        ("DOW",   "Dow Inc.",                               "Materials"),
        ("GS",    "Goldman Sachs Group Inc.",               "Financial Services"),
        ("HD",    "Home Depot Inc.",                        "Consumer Discretionary"),
        ("HON",   "Honeywell International Inc.",           "Industrials"),
        ("IBM",   "International Business Machines Corp.",  "Technology"),
        ("JNJ",   "Johnson & Johnson",                      "Healthcare"),
        ("JPM",   "JPMorgan Chase & Co.",                   "Financial Services"),
        ("KO",    "Coca-Cola Co.",                          "Consumer Staples"),
        ("MCD",   "McDonald's Corp.",                       "Consumer Discretionary"),
        ("MMM",   "3M Co.",                                 "Industrials"),
        ("MRK",   "Merck & Co. Inc.",                       "Healthcare"),
        ("MSFT",  "Microsoft Corp.",                        "Technology"),
        ("NKE",   "Nike Inc.",                              "Consumer Discretionary"),
        ("PG",    "Procter & Gamble Co.",                   "Consumer Staples"),
        ("SHW",   "Sherwin-Williams Co.",                   "Materials"),
        ("TRV",   "Travelers Companies Inc.",               "Financial Services"),
        ("UNH",   "UnitedHealth Group Inc.",                "Healthcare"),
        ("V",     "Visa Inc.",                              "Financial Services"),
        ("VZ",    "Verizon Communications Inc.",            "Communication Services"),
        ("WMT",   "Walmart Inc.",                           "Consumer Staples"),
    ]

    _US_INDEX_SYMBOLS = {"SP500", "NDX100", "DJI30"}

    def __init__(self) -> None:
        self._sector_cache_ttl = 600  # 10 minutes

    # ── Public API ────────────────────────────────────────────────────────────

    def get_global_sectors(self, region: str) -> GlobalSectorSummary:
        """Fetch sector performance for a region using sector-tracking ETFs."""
        if region not in VALID_REGIONS:
            raise ValueError(f"Invalid region: {region}. Must be one of {VALID_REGIONS}")

        cache_key = f"sector:global:{region}"
        cached = market_cache.get(cache_key)
        if cached is not None:
            return cached

        sector_etfs = SECTOR_ETFS.get(region, {})
        sectors_data: List[SectorPerformance] = []

        for sector_name, ticker in sector_etfs.items():
            try:
                perf = self._get_etf_performance(ticker, sector_name)
                if perf:
                    sectors_data.append(perf)
            except Exception as exc:
                logger.warning("Failed to fetch sector %s (%s): %s", sector_name, ticker, exc)

        positive = sorted(
            [s for s in sectors_data if s.is_positive],
            key=lambda x: x.change_pct,
            reverse=True,
        )
        negative = sorted(
            [s for s in sectors_data if not s.is_positive and s.change_pct < 0],
            key=lambda x: x.change_pct,
        )
        neutral = [s for s in sectors_data if s.change_pct == 0 or (0 < s.change_pct < 0.1)]

        result = GlobalSectorSummary(
            trade_date=str(date.today()),
            region=region,
            positive_sectors=positive,
            negative_sectors=negative,
            neutral_sectors=neutral,
        )
        market_cache.set(cache_key, result, ttl=self._sector_cache_ttl)
        return result

    def get_screener_constituents(self, index_symbol: str) -> List[Dict[str, Any]]:
        """
        Lightweight constituent list for the screener.

        Uses NSE API for India indices and Wikipedia/hardcoded for US indices.
        Results cached 30 min.  Returns list of dicts with: symbol, name, sector, weight.
        """
        cache_key = f"screener_constituents:{index_symbol}"
        cached = market_cache.get(cache_key)
        if cached is not None:
            return cached

        if index_symbol in self._US_INDEX_SYMBOLS:
            result = self._get_us_screener_constituents(index_symbol)
        else:
            proxy_etf = INDEX_PROXY_ETFS.get(index_symbol, "")
            constituents, _ = self._get_index_constituents(index_symbol, proxy_etf)
            if constituents:
                constituents = self._normalise_constituent_weights(constituents)
            result = [
                {
                    "symbol":   c.get("symbol", ""),
                    "name":     c.get("name", c.get("symbol", "")),
                    "sector":   c.get("sector") or "Unknown",
                    "industry": c.get("industry", ""),
                    "weight":   c.get("weight") or 0.0,
                }
                for c in constituents
                if c.get("symbol")
            ]

        market_cache.set(cache_key, result, ttl=1800)  # 30-min TTL
        logger.info("Screener constituents cached: %d stocks for %s", len(result), index_symbol)
        return result

    def _get_us_screener_constituents(self, index_symbol: str) -> List[Dict[str, Any]]:
        """Fetch US index constituents from Wikipedia (S&P 500 / NASDAQ 100) or hardcoded list (DJI30)."""
        if index_symbol == "DJI30":
            return [
                {"symbol": sym, "name": name, "sector": sector, "industry": "", "weight": 0.0}
                for sym, name, sector in self._DJI30_STOCKS
            ]

        url = self._US_WIKI_URLS.get(index_symbol)
        if not url:
            return []

        try:
            headers = {"User-Agent": "Mozilla/5.0 (compatible; StockScreener/1.0)"}
            with httpx.Client(timeout=20.0, verify=False, headers=headers) as client:
                resp = client.get(url)
                resp.raise_for_status()
            tables = pd.read_html(io.StringIO(resp.text), flavor="lxml")
        except Exception as exc:
            logger.warning("Failed to read Wikipedia table for %s: %s", index_symbol, exc)
            return []

        try:
            if index_symbol == "SP500":
                df = tables[0]
                sym_col    = "Symbol"
                name_col   = "Security"
                sector_col = "GICS Sector"
            else:  # NDX100
                # Find the table that has a "Ticker" column (ignore tables with int column names)
                df = next(
                    (t for t in tables
                     if all(isinstance(c, str) for c in t.columns)
                     and any(c.lower() == "ticker" for c in t.columns)),
                    None,
                )
                if df is None:
                    return []
                sym_col    = next(c for c in df.columns if c.lower() == "ticker")
                name_col   = next((c for c in df.columns if c.lower() == "company"), sym_col)
                # NDX100 Wikipedia uses "ICB Industry" not "GICS Sector"
                sector_col = next(
                    (c for c in df.columns if "sector" in c.lower() or "industry" in c.lower()),
                    None,
                )

            result: List[Dict[str, Any]] = []
            for _, row in df.iterrows():
                sym = str(row.get(sym_col, "") or "").strip().upper()
                if not sym:
                    continue
                # yfinance uses BRK-B, not BRK.B
                sym = sym.replace(".", "-")
                name   = str(row.get(name_col, sym) or sym).strip()
                sector = str(row.get(sector_col, "Unknown") or "Unknown").strip() if sector_col else "Unknown"
                result.append({"symbol": sym, "name": name, "sector": sector, "industry": "", "weight": 0.0})

            logger.info("Wikipedia returned %d constituents for %s", len(result), index_symbol)
            return result

        except Exception as exc:
            logger.warning("Failed to parse Wikipedia constituents for %s: %s", index_symbol, exc)
            return []

    def get_index_sector_analysis(self, index_symbol: str) -> IndexSectorAnalysis:
        """
        Full sector + constituent analysis for a single index.

        Returns sector breakdowns with individual stock details, weights,
        daily changes, and index-point contributions.
        """
        if index_symbol not in INDICES:
            raise ValueError(f"Unknown index: {index_symbol}")

        cache_key = f"sector_analysis_v2:{index_symbol}"
        cached = market_cache.get(cache_key)
        if cached is not None:
            return cached

        proxy_etf = INDEX_PROXY_ETFS.get(index_symbol)
        if not proxy_etf:
            raise ValueError(f"No proxy ETF configured for index: {index_symbol}")

        # Step 1 – constituents
        constituents, source = self._get_index_constituents(index_symbol, proxy_etf)
        if not constituents:
            return self._empty_analysis(index_symbol, proxy_etf, source="unavailable")

        # Step 2 – normalise weights
        constituents = self._normalise_constituent_weights(constituents)

        # Step 3 – price data (for stocks that don't already have it from the NSE API)
        needs_price = [
            c["symbol"]
            for c in constituents
            if c.get("change_pct") is None and c.get("symbol")
        ]
        if needs_price:
            price_data = self._get_daily_price_data(needs_price)
            for c in constituents:
                sym = c.get("symbol")
                if sym and sym in price_data and c.get("change_pct") is None:
                    pd_entry = price_data[sym]
                    c["change_pct"] = pd_entry["change_pct"]
                    c["last_close"] = pd_entry["last_close"]
                    c["prev_close"] = pd_entry["prev_close"]

        # Step 4 – sector + name enrichment (only for stocks missing sector)
        needs_info = [
            c["symbol"]
            for c in constituents
            if c.get("sector") in (None, "Unknown", "")
            and c.get("change_pct") is not None
            and c.get("symbol")
        ]
        if needs_info:
            info_map = self._get_stock_info_batch(needs_info)
            for c in constituents:
                sym = c.get("symbol")
                if sym not in info_map:
                    continue
                info = info_map[sym]
                if c.get("sector") in (None, "Unknown", ""):
                    c["sector"] = info["sector"]
                if not c.get("name") or c["name"] == sym:
                    c["name"] = info["name"]
                if not c.get("industry"):
                    c["industry"] = info.get("industry", "")
                if info.get("sma200") is not None:
                    c["sma200"] = info["sma200"]

        # Step 5 – build StockBreakdown list
        all_stocks: List[StockBreakdown] = []
        analyzed_count = 0

        for c in constituents:
            sym = c.get("symbol")
            if not sym or c.get("change_pct") is None:
                continue

            analyzed_count += 1
            weight = float(c.get("weight") or 0.0)
            change_pct = float(c["change_pct"])
            contribution = round(weight * change_pct / 100.0, 4)

            last_close_val = round(float(c.get("last_close") or 0.0), 2)
            sma200_val = c.get("sma200")
            above_sma200: Optional[bool] = (
                bool(last_close_val > sma200_val)
                if sma200_val and last_close_val > 0
                else None
            )
            all_stocks.append(
                StockBreakdown(
                    symbol=sym,
                    name=str(c.get("name") or sym),
                    sector=str(c.get("sector") or "Unknown"),
                    industry=str(c.get("industry") or ""),
                    weight=round(weight, 4),
                    daily_change_pct=round(change_pct, 4),
                    contribution_pct=contribution,
                    last_close=last_close_val,
                    prev_close=round(float(c.get("prev_close") or 0.0), 2),
                    is_positive=change_pct >= 0,
                    above_sma200=above_sma200,
                )
            )

        # Step 6 – group by sector
        sectors = self._group_by_sector(all_stocks)

        # Step 7 – top movers across all sectors
        top_gainers = sorted(all_stocks, key=lambda x: x.daily_change_pct, reverse=True)[:5]
        top_losers = sorted(all_stocks, key=lambda x: x.daily_change_pct)[:5]

        positive_sector_count = sum(1 for s in sectors if s.daily_change_pct > 0)
        negative_sector_count = sum(1 for s in sectors if s.daily_change_pct < 0)

        # Breadth: % of stocks trading above their 200-day moving average
        sma200_known = [s for s in all_stocks if s.above_sma200 is not None]
        pct_above_sma200: Optional[float] = (
            round(sum(1 for s in sma200_known if s.above_sma200) / len(sma200_known) * 100, 1)
            if sma200_known
            else None
        )

        result = IndexSectorAnalysis(
            index_symbol=index_symbol,
            index_name=INDICES[index_symbol].name,
            proxy_etf=proxy_etf,
            trade_date=str(date.today()),
            data_source=source,
            total_constituents=len(constituents),
            analyzed_constituents=analyzed_count,
            sectors=sectors,
            sector_count=len(sectors),
            top_gainers=top_gainers,
            top_losers=top_losers,
            positive_sector_count=positive_sector_count,
            negative_sector_count=negative_sector_count,
            pct_above_sma200=pct_above_sma200,
        )
        market_cache.set(cache_key, result, ttl=self._sector_cache_ttl)
        return result

    def get_all_index_sectors(self) -> List[IndexSectorAnalysis]:
        """Get full sector analysis for all tracked indices."""
        results: List[IndexSectorAnalysis] = []
        for symbol in INDICES:
            try:
                results.append(self.get_index_sector_analysis(symbol))
            except Exception as exc:
                logger.warning("Failed to get sector analysis for %s: %s", symbol, exc)
        return results

    # ── Sector grouping ───────────────────────────────────────────────────────

    def _group_by_sector(self, stocks: List[StockBreakdown]) -> List[SectorBreakdown]:
        """Aggregate a flat stock list into SectorBreakdown objects, sorted by weight."""
        sector_map: Dict[str, List[StockBreakdown]] = {}
        for stock in stocks:
            sector_map.setdefault(stock.sector or "Unknown", []).append(stock)

        sectors: List[SectorBreakdown] = []
        for sector_name, sector_stocks in sector_map.items():
            total_weight = sum(s.weight for s in sector_stocks)
            total_contribution = sum(s.contribution_pct for s in sector_stocks)
            weighted_avg_change = (
                sum(s.daily_change_pct * s.weight for s in sector_stocks) / total_weight
                if total_weight > 0
                else 0.0
            )

            sorted_by_weight = sorted(sector_stocks, key=lambda x: x.weight, reverse=True)
            gainers = sorted(sector_stocks, key=lambda x: x.daily_change_pct, reverse=True)[:3]
            losers = sorted(sector_stocks, key=lambda x: x.daily_change_pct)[:3]

            sectors.append(
                SectorBreakdown(
                    sector=sector_name,
                    weight=round(total_weight, 4),
                    daily_change_pct=round(weighted_avg_change, 4),
                    contribution_pct=round(total_contribution, 4),
                    stock_count=len(sector_stocks),
                    analyzed_count=len(sector_stocks),
                    top_gainers=gainers,
                    top_losers=losers,
                    stocks=sorted_by_weight,
                )
            )

        sectors.sort(key=lambda x: x.weight, reverse=True)
        return sectors

    # ── Constituent fetching ──────────────────────────────────────────────────

    def _get_index_constituents(
        self, index_symbol: str, proxy_etf: str
    ) -> Tuple[List[Dict[str, Any]], str]:
        """Fetch constituents using the best available source for this index."""
        if index_symbol in self._NSE_INDEX_NAME_MAP:
            nse = self._get_nse_index_constituents(index_symbol)
            if nse:
                return nse, "nse_index_constituents"

        etf = self._get_proxy_etf_top_holdings(index_symbol, proxy_etf)
        if etf:
            return etf, "proxy_etf_top_holdings"

        return [], "unavailable"

    def _get_nse_index_constituents(self, index_symbol: str) -> List[Dict[str, Any]]:
        """
        Fetch NSE index constituents via the NSE live-data API.

        The response includes symbol, industry, weightage, lastPrice,
        previousClose, and pChange — so no yfinance calls are needed for
        NSE stocks.
        """
        index_name = self._NSE_INDEX_NAME_MAP.get(index_symbol)
        if not index_name:
            return []

        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json, text/plain, */*",
                "Referer": "https://www.nseindia.com/",
                "Accept-Language": "en-US,en;q=0.9",
            }
            with httpx.Client(timeout=15.0, headers=headers, follow_redirects=True) as client:
                # Seed cookies first
                client.get("https://www.nseindia.com")
                response = client.get(
                    "https://www.nseindia.com/api/equity-stockIndices",
                    params={"index": index_name},
                )
                response.raise_for_status()

            payload = response.json()
            rows = payload.get("data", []) if isinstance(payload, dict) else []

            constituents: List[Dict[str, Any]] = []
            for row in rows:
                if not isinstance(row, dict):
                    continue

                symbol = str(row.get("symbol") or "").strip()
                series = str(row.get("series") or "").strip().upper()
                if not symbol:
                    continue
                if series and series not in {"EQ", "BE"}:
                    continue
                if not self._is_valid_exchange_symbol(symbol):
                    continue

                ticker = f"{symbol}.NS" if not symbol.endswith(".NS") else symbol

                # Extract live price data from the NSE API response
                last_price = self._to_float(row.get("lastPrice"))
                prev_close = self._to_float(row.get("previousClose"))
                change_pct = self._to_float(row.get("pChange"))

                # Compute change if not directly provided
                if change_pct is None and last_price and prev_close and prev_close != 0:
                    change_pct = round((last_price - prev_close) / prev_close * 100, 4)

                # Company name: prefer meta.companyName, fall back to identifier
                meta = row.get("meta")
                company_name = (
                    meta.get("companyName")
                    if isinstance(meta, dict)
                    else None
                ) or row.get("identifier") or symbol

                constituents.append(
                    {
                        "symbol": ticker,
                        "name": str(company_name),
                        "sector": str(row.get("industry") or "Unknown"),
                        "weight": self._to_float(row.get("weightage") or row.get("weight")),
                        "last_close": last_price,
                        "prev_close": prev_close,
                        "change_pct": change_pct,
                    }
                )

            logger.info(
                "NSE API returned %d constituents for %s", len(constituents), index_symbol
            )
            return constituents

        except Exception as exc:
            logger.warning("Failed to fetch NSE constituents for %s: %s", index_symbol, exc)
            return []

    def _get_proxy_etf_top_holdings(
        self, index_symbol: str, proxy_etf: str
    ) -> List[Dict[str, Any]]:
        """Fallback: derive constituents from a proxy ETF's top-holdings list."""
        try:
            etf = yf.Ticker(proxy_etf)
            funds_data = etf.funds_data
            if not funds_data:
                return []

            top_holdings = funds_data.top_holdings
            if top_holdings is None or top_holdings.empty:
                return []

            lower_cols = {str(c).strip().lower(): c for c in top_holdings.columns}
            symbol_col = lower_cols.get("symbol")
            name_col = lower_cols.get("name")
            weight_col = (
                lower_cols.get("holding percent")
                or lower_cols.get("holding_pct")
                or lower_cols.get("holding percentage")
                or lower_cols.get("weight")
            )

            constituents: List[Dict[str, Any]] = []
            for idx, row in top_holdings.iterrows():
                symbol = row.get(symbol_col) if symbol_col else idx
                if not isinstance(symbol, str) or not symbol.strip():
                    continue

                normalized = self._normalize_symbol_for_index(symbol.strip(), index_symbol)
                if not normalized:
                    continue

                name = row.get(name_col) if name_col else None
                weight = self._to_float(row.get(weight_col)) if weight_col else None

                constituents.append(
                    {
                        "symbol": normalized,
                        "name": str(name or normalized),
                        "sector": "Unknown",  # enriched later via _get_stock_info_batch
                        "weight": weight,
                        "last_close": None,
                        "prev_close": None,
                        "change_pct": None,
                    }
                )

            logger.info(
                "ETF top_holdings returned %d holdings for %s via %s",
                len(constituents),
                index_symbol,
                proxy_etf,
            )
            return constituents

        except Exception as exc:
            logger.warning("Failed to get top holdings for %s: %s", proxy_etf, exc)
            return []

    # ── Price data ────────────────────────────────────────────────────────────

    def _get_daily_price_data(self, tickers: List[str]) -> Dict[str, Dict[str, float]]:
        """
        Batch download the latest daily close prices.

        Returns: {symbol: {change_pct, last_close, prev_close}}
        """
        unique = list(dict.fromkeys(t for t in tickers if isinstance(t, str) and t))
        if not unique:
            return {}

        result: Dict[str, Dict[str, float]] = {}
        batch_size = 100

        for i in range(0, len(unique), batch_size):
            batch = unique[i : i + batch_size]
            try:
                df = yf.download(
                    tickers=batch,
                    period="5d",
                    auto_adjust=True,
                    group_by="ticker",
                    progress=False,
                    threads=True,
                )
            except Exception as exc:
                logger.warning("Batch download failed (%s…): %s", batch[:3], exc)
                continue

            if df is None or df.empty:
                continue

            if isinstance(df.columns, pd.MultiIndex):
                level0 = set(df.columns.get_level_values(0))
                for sym in batch:
                    if sym not in level0:
                        continue
                    sym_df = df[sym]
                    if "Close" not in sym_df.columns:
                        continue
                    close = sym_df["Close"].dropna()
                    if len(close) < 2:
                        continue
                    prev = float(close.iloc[-2])
                    last = float(close.iloc[-1])
                    if prev == 0:
                        continue
                    result[sym] = {
                        "last_close": round(last, 4),
                        "prev_close": round(prev, 4),
                        "change_pct": round((last - prev) / prev * 100, 4),
                    }
            else:
                # Single-ticker download returns a flat DataFrame
                if "Close" in df.columns and len(batch) == 1:
                    close = df["Close"].dropna()
                    if len(close) >= 2:
                        prev = float(close.iloc[-2])
                        last = float(close.iloc[-1])
                        if prev != 0:
                            result[batch[0]] = {
                                "last_close": round(last, 4),
                                "prev_close": round(prev, 4),
                                "change_pct": round((last - prev) / prev * 100, 4),
                            }

        logger.info(
            "Price data fetched for %d / %d tickers", len(result), len(unique)
        )
        return result

    # ── Stock sector / name enrichment ────────────────────────────────────────

    def _get_stock_info_batch(self, symbols: List[str]) -> Dict[str, Dict[str, str]]:
        """
        Fetch company name and GICS sector for a list of symbols in parallel.

        Results are cached per symbol for 24 hours to avoid repeated slow
        yf.Ticker.info calls.
        """
        result: Dict[str, Dict[str, str]] = {}
        to_fetch: List[str] = []

        for sym in symbols:
            cached = stock_info_cache.get(f"info:{sym}")
            if cached is not None:
                result[sym] = cached
            else:
                to_fetch.append(sym)

        if not to_fetch:
            return result

        def _fetch_one(sym: str) -> Tuple[str, Dict]:
            try:
                info = yf.Ticker(sym).info
                data = {
                    "name": info.get("longName") or info.get("shortName") or sym,
                    "sector": info.get("sector") or "Unknown",
                    "industry": info.get("industry") or "",
                    "sma200": info.get("twoHundredDayAverage"),
                }
            except Exception:
                data = {"name": sym, "sector": "Unknown", "industry": "", "sma200": None}
            return sym, data

        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = {executor.submit(_fetch_one, sym): sym for sym in to_fetch}
            try:
                for future in as_completed(futures, timeout=60):
                    try:
                        sym, data = future.result(timeout=15)
                        result[sym] = data
                        stock_info_cache.set(f"info:{sym}", data)
                    except Exception as exc:
                        sym_key = futures[future]
                        logger.debug("Failed to get info for %s: %s", sym_key, exc)
                        result[sym_key] = {"name": sym_key, "sector": "Unknown", "industry": ""}
            except FutureTimeoutError:
                logger.warning(
                    "Timed out fetching stock info for %d symbols", len(to_fetch)
                )
                for future, sym in futures.items():
                    if sym not in result:
                        result[sym] = {"name": sym, "sector": "Unknown", "industry": ""}

        logger.info(
            "Stock info enriched for %d / %d symbols", len(result), len(to_fetch)
        )
        return result

    # ── Global-sector ETF helper ──────────────────────────────────────────────

    def _get_etf_performance(self, ticker: str, sector_name: str) -> Optional[SectorPerformance]:
        """Get daily performance for a single sector ETF."""
        try:
            hist = yf.Ticker(ticker).history(period="5d", auto_adjust=True)
            if hist.empty or len(hist) < 2:
                return None
            last = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2])
            change_pts = round(last - prev, 4)
            change_pct = round((last - prev) / prev * 100, 4) if prev else 0.0
            return SectorPerformance(
                sector_name=sector_name,
                ticker=ticker,
                change_pct=change_pct,
                change_pts=change_pts,
                is_positive=change_pct >= 0,
            )
        except Exception as exc:
            logger.debug("Failed to get ETF performance for %s: %s", ticker, exc)
            return None

    # ── Weight normalisation ──────────────────────────────────────────────────

    def _normalise_constituent_weights(
        self, constituents: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Ensure all constituent weights are expressed as percentages (0–100).

        Handles:
          - Fraction-form weights (0–1) → multiply by 100
          - Missing weights → equal-weight fallback
        """
        cleaned = [c for c in constituents if isinstance(c, dict) and c.get("symbol")]
        if not cleaned:
            return []

        known_sum = 0.0
        known_max = 0.0
        unknown_count = 0

        for c in cleaned:
            w = self._to_float(c.get("weight"))
            if w is None or w <= 0:
                c["weight"] = None
                unknown_count += 1
            else:
                known_sum += w
                known_max = max(known_max, w)
                c["weight"] = w

        # Convert from fraction to percentage if values look like 0–1
        if known_sum > 0 and known_max <= 1.0:
            known_sum = 0.0
            for c in cleaned:
                w = c.get("weight")
                if isinstance(w, (int, float)):
                    c["weight"] = float(w) * 100.0
                    known_sum += c["weight"]

        if known_sum <= 0:
            # Total fallback: equal weights
            equal = 100.0 / len(cleaned)
            for c in cleaned:
                c["weight"] = equal
            return cleaned

        if unknown_count > 0:
            remaining = max(0.0, 100.0 - known_sum)
            fill = remaining / unknown_count if unknown_count else 0.0
            for c in cleaned:
                if c.get("weight") is None:
                    c["weight"] = fill

        return cleaned

    # ── Symbol helpers ────────────────────────────────────────────────────────

    def _normalize_symbol_for_index(self, symbol: str, index_symbol: str) -> Optional[str]:
        symbol = symbol.strip().upper()
        if not symbol:
            return None
        if not self._is_valid_exchange_symbol(symbol):
            return None
        if index_symbol in self._NSE_INDEX_NAME_MAP and "." not in symbol:
            return f"{symbol}.NS"
        return symbol

    def _is_valid_exchange_symbol(self, symbol: str) -> bool:
        """Accept equity tickers; reject index labels like 'NIFTY 50'."""
        cleaned = symbol.strip().upper()
        if not cleaned or " " in cleaned:
            return False
        if cleaned in {"NIFTY", "NIFTY50", "NIFTY 50", "NIFTY100", "NIFTY 100", "NIFTY200", "NIFTY 200", "NIFTY500", "NIFTY 500", "BANKNIFTY"}:
            return False
        return bool(re.fullmatch(r"[A-Z0-9][A-Z0-9.&-]*", cleaned))

    def _to_float(self, value: Any) -> Optional[float]:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(str(value).replace("%", "").replace(",", "").strip())
        except Exception:
            return None

    # ── Empty result helper ───────────────────────────────────────────────────

    def _empty_analysis(
        self, index_symbol: str, proxy_etf: str, source: str = "unavailable"
    ) -> IndexSectorAnalysis:
        return IndexSectorAnalysis(
            index_symbol=index_symbol,
            index_name=INDICES[index_symbol].name,
            proxy_etf=proxy_etf,
            trade_date=str(date.today()),
            data_source=source,
            total_constituents=0,
            analyzed_constituents=0,
            sectors=[],
            sector_count=0,
            top_gainers=[],
            top_losers=[],
            positive_sector_count=0,
            negative_sector_count=0,
        )


# Singleton
sector_service = SectorService()
