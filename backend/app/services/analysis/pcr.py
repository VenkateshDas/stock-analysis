"""PCR (Put-Call Ratio) service using yfinance options chains via ETF proxies."""
import logging
from datetime import date, timedelta
from typing import Dict, Optional, Tuple

import yfinance as yf

from app.models.pcr import PCRResult
from app.services.cache import pcr_cache

logger = logging.getLogger(__name__)

# symbol → (proxy_ticker, is_thin_market)
PCR_PROXY: Dict[str, Tuple[str, bool]] = {
    "GSPC": ("SPY", False),
    "NDX":  ("QQQ", False),
    "DJI":  ("DIA", False),
    "N225": ("EWJ", True),
    "HSI":  ("EWH", True),
}

NEAR_TERM_DAYS = 30  # expiries ≤30 days count toward vol PCR


def _classify_vol_signal(pcr_vol: Optional[float]) -> str:
    if pcr_vol is None:
        return "unavailable"
    if pcr_vol < 0.7:
        return "complacent"
    if pcr_vol > 1.2:
        return "fearful"
    return "neutral"


def _classify_oi_signal(pcr_oi: float) -> str:
    if pcr_oi < 1.2:
        return "call_dominant"
    if pcr_oi > 2.5:
        return "heavy_hedging"
    return "neutral"


def _compute_overall_signal(vol_signal: str, oi_signal: str) -> Tuple[str, str]:
    """Return (overall_signal, signal_label)."""
    if vol_signal == "fearful" and oi_signal == "heavy_hedging":
        return "contrarian_bullish", "Extreme put hedging across all expiries — a contrarian buy signal as the crowd is too bearish."
    if vol_signal == "complacent" and oi_signal == "call_dominant":
        return "contrarian_bearish", "Unusually call-heavy positioning — traders may be too complacent, a contrarian warning signal."
    if oi_signal == "heavy_hedging":
        return "contrarian_bullish", "Heavy put hedging in open interest — institutional positioning leans defensively, a contrarian buy signal."
    if vol_signal == "fearful":
        return "contrarian_bullish", "Near-term put buying is elevated — traders are fearful, which is a contrarian bullish indicator."
    if oi_signal == "call_dominant":
        return "contrarian_bearish", "Call-dominant open interest suggests complacency — watch for a potential pullback."
    if vol_signal == "complacent":
        return "contrarian_bearish", "Near-term options flow is heavily call-biased — contrarian bearish warning."
    return "neutral", "Options market positioning is balanced — no strong contrarian signal either way."


def _fetch_pcr(ticker_sym: str, is_thin: bool) -> Optional[PCRResult]:
    try:
        tk = yf.Ticker(ticker_sym)
        expirations = tk.options
        if not expirations:
            logger.warning("No options expirations for %s", ticker_sym)
            return None

        today = date.today()
        cutoff = today + timedelta(days=NEAR_TERM_DAYS)

        total_put_vol = 0.0
        total_call_vol = 0.0
        near_put_vol = 0.0
        near_call_vol = 0.0
        total_put_oi = 0.0
        total_call_oi = 0.0
        near_expiry_count = 0

        for exp_str in expirations:
            try:
                exp_date = date.fromisoformat(exp_str)
            except ValueError:
                continue

            is_near = exp_date <= cutoff
            if is_near:
                near_expiry_count += 1

            try:
                chain = tk.option_chain(exp_str)
                calls = chain.calls
                puts = chain.puts

                pv = float(puts["volume"].fillna(0).sum())
                cv = float(calls["volume"].fillna(0).sum())
                poi = float(puts["openInterest"].fillna(0).sum())
                coi = float(calls["openInterest"].fillna(0).sum())

                total_put_vol += pv
                total_call_vol += cv
                total_put_oi += poi
                total_call_oi += coi

                if is_near:
                    near_put_vol += pv
                    near_call_vol += cv
            except Exception as e:
                logger.debug("Skipping expiry %s for %s: %s", exp_str, ticker_sym, e)
                continue

        if total_call_oi == 0 and total_put_oi == 0:
            logger.warning("No OI data for %s", ticker_sym)
            return None

        pcr_oi = total_put_oi / max(total_call_oi, 1)

        # Vol PCR: only for deep markets with enough near-term data
        pcr_vol: Optional[float] = None
        put_vol_out: Optional[float] = None
        call_vol_out: Optional[float] = None
        if not is_thin and near_call_vol > 0:
            pcr_vol = near_put_vol / near_call_vol
            put_vol_out = near_put_vol
            call_vol_out = near_call_vol

        vol_signal = _classify_vol_signal(pcr_vol)
        oi_signal = _classify_oi_signal(pcr_oi)
        overall_signal, signal_label = _compute_overall_signal(vol_signal, oi_signal)

        return PCRResult(
            proxy_ticker=ticker_sym,
            is_thin_market=is_thin,
            expiry_count=len(expirations),
            near_expiry_count=near_expiry_count,
            pcr_volume=round(pcr_vol, 3) if pcr_vol is not None else None,
            put_volume=put_vol_out,
            call_volume=call_vol_out,
            vol_signal=vol_signal,
            pcr_oi=round(pcr_oi, 3),
            put_oi=total_put_oi,
            call_oi=total_call_oi,
            oi_signal=oi_signal,
            overall_signal=overall_signal,
            signal_label=signal_label,
        )
    except Exception as e:
        logger.error("PCR fetch failed for %s: %s", ticker_sym, e)
        return None


class PCRService:
    def get_pcr(self, symbol: str) -> Optional[PCRResult]:
        """Get PCR for a known index symbol via its proxy ETF."""
        proxy = PCR_PROXY.get(symbol.upper())
        if proxy is None:
            return None

        ticker_sym, is_thin = proxy
        cache_key = f"pcr:{ticker_sym}"
        cached = pcr_cache.get(cache_key)
        if cached is not None:
            return cached

        result = _fetch_pcr(ticker_sym, is_thin)
        if result is not None:
            pcr_cache.set(cache_key, result)
        return result

    def get_stock_pcr(self, ticker: str) -> Optional[PCRResult]:
        """Get PCR directly for a stock ticker."""
        cache_key = f"pcr:stock:{ticker.upper()}"
        cached = pcr_cache.get(cache_key)
        if cached is not None:
            return cached

        result = _fetch_pcr(ticker.upper(), is_thin=False)
        if result is not None:
            pcr_cache.set(cache_key, result)
        return result


pcr_service = PCRService()
