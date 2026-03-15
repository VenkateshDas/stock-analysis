"""Stock opportunity scanner for India indices."""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Optional

from app.models.analysis import TradeSetup
from app.services.analysis.previous_day import analysis_orchestrator
from app.services.sector_service import sector_service

logger = logging.getLogger(__name__)

# Bank stocks for NSEBANK filtering
_BANK_INDUSTRIES = {"Banks - Regional", "Banks - Diversified"}

# Minimum weight to include (focus on meaningful index members)
_MIN_WEIGHT = 0.5


def _score_long(analysis) -> int:
    t = analysis.technical
    score = 0
    if t.price_vs_sma20 == "above":
        score += 1
    if t.price_vs_sma50 == "above":
        score += 1
    rsi = t.rsi or 50
    if 40 <= rsi <= 65:
        score += 1
    if t.obv_trend == "rising":
        score += 1
    adx = t.adx or 0
    plus_di = t.plus_di or 0
    minus_di = t.minus_di or 0
    if adx >= 20 and plus_di > minus_di:
        score += 1
    return score


def _score_short(analysis) -> int:
    t = analysis.technical
    score = 0
    if t.price_vs_sma20 == "below":
        score += 1
    if t.price_vs_sma50 == "below":
        score += 1
    rsi = t.rsi or 50
    if 35 <= rsi <= 60:
        score += 1
    if t.obv_trend == "falling":
        score += 1
    adx = t.adx or 0
    plus_di = t.plus_di or 0
    minus_di = t.minus_di or 0
    if adx >= 20 and minus_di > plus_di:
        score += 1
    return score


def _quality(score: int) -> str:
    if score >= 5:
        return "A"
    if score >= 3:
        return "B"
    return "C"


def _long_setup(constituent, analysis, index_monthly: float) -> Optional[TradeSetup]:
    score = _score_long(analysis)
    if score < 3:
        return None
    t = analysis.technical
    entry = analysis.last_close
    atr = t.atr or (entry * 0.01)

    # Stop: highest SMA below price, pushed down by 0.3×ATR
    levels_below = []
    if t.sma20 and t.sma20 < entry:
        levels_below.append(t.sma20)
    if t.sma50 and t.sma50 < entry:
        levels_below.append(t.sma50)
    if levels_below:
        raw_stop = max(levels_below) - 0.3 * atr
    else:
        raw_stop = entry * 0.95
    stop = max(raw_stop, entry * 0.95)

    risk = entry - stop
    if risk <= 0:
        return None
    target = entry + 2.0 * risk
    rr = round((target - entry) / risk, 2)

    stock_monthly = analysis.statistical.monthly_return_pct or 0.0
    alpha = round(stock_monthly - index_monthly, 2)

    # Evidence bullets
    reasons: list[str] = []
    if t.price_vs_sma20 == "above" and t.price_vs_sma50 == "above":
        reasons.append("Price above both 20-day and 50-day averages — short and medium-term trend aligned upward")
    elif t.price_vs_sma20 == "above":
        reasons.append("Price above 20-day average — short-term momentum turning positive")
    if t.obv_trend == "rising":
        reasons.append("Money flow rising — accumulation visible in volume patterns")
    if (t.adx or 0) >= 20 and (t.plus_di or 0) > (t.minus_di or 0):
        reasons.append(f"Trend strength at {(t.adx or 0):.0f} with buyers dominant — directional move underway")
    if alpha > 1:
        reasons.append(f"Outperforming the index by {alpha:.1f}% this month — relative strength visible")
    reasons = reasons[:3]
    if not reasons:
        reasons.append("Multiple technical conditions align for a potential long trade")

    risks: list[str] = []
    rsi = t.rsi or 50
    if rsi > 60:
        risks.append(f"Momentum at {rsi:.0f} — if it reaches 70+, momentum may stall")
    if t.atr_pct and t.atr_pct > 1.5:
        risks.append(f"Daily volatility is {t.atr_pct:.1f}% — use smaller position size")
    if not risks:
        risks.append("Monitor for volume drop-off — low volume rallies tend to fade")
    risks = risks[:2]

    return TradeSetup(
        symbol=constituent["symbol"],
        name=constituent["name"],
        direction="long",
        setup_type="momentum",
        quality=_quality(score),
        entry_price=round(entry, 2),
        stop_loss=round(stop, 2),
        target=round(target, 2),
        risk_reward=rr,
        reasons=reasons,
        risks=risks,
        weight_in_index=constituent["weight"],
        sector=constituent["sector"],
        relative_return_1m=alpha,
    )


def _short_setup(constituent, analysis, index_monthly: float) -> Optional[TradeSetup]:
    score = _score_short(analysis)
    if score < 3:
        return None
    t = analysis.technical
    entry = analysis.last_close
    atr = t.atr or (entry * 0.01)

    # Stop: lowest SMA above price, pushed up by 0.3×ATR
    levels_above = []
    if t.sma20 and t.sma20 > entry:
        levels_above.append(t.sma20)
    if t.sma50 and t.sma50 > entry:
        levels_above.append(t.sma50)
    if levels_above:
        raw_stop = min(levels_above) + 0.3 * atr
    else:
        raw_stop = entry * 1.05
    stop = min(raw_stop, entry * 1.05)

    risk = stop - entry
    if risk <= 0:
        return None
    target = entry - 2.0 * risk
    rr = round((entry - target) / risk, 2)

    stock_monthly = analysis.statistical.monthly_return_pct or 0.0
    alpha = round(stock_monthly - index_monthly, 2)

    reasons: list[str] = []
    if t.price_vs_sma20 == "below" and t.price_vs_sma50 == "below":
        reasons.append("Price below both 20-day and 50-day averages — short and medium-term trend pointing down")
    elif t.price_vs_sma20 == "below":
        reasons.append("Price below 20-day average — short-term momentum negative")
    if t.obv_trend == "falling":
        reasons.append("Money flow falling — distribution visible in volume patterns")
    if (t.adx or 0) >= 20 and (t.minus_di or 0) > (t.plus_di or 0):
        reasons.append(f"Trend strength at {(t.adx or 0):.0f} with sellers dominant — downside pressure building")
    if alpha < -1:
        reasons.append(f"Underperforming the index by {abs(alpha):.1f}% this month — relative weakness visible")
    reasons = reasons[:3]
    if not reasons:
        reasons.append("Multiple technical conditions align for a potential short trade")

    risks: list[str] = []
    rsi = t.rsi or 50
    if rsi < 40:
        risks.append(f"Momentum at {rsi:.0f} — oversold bounce risk; use tight stop")
    if t.atr_pct and t.atr_pct > 1.5:
        risks.append(f"Daily volatility is {t.atr_pct:.1f}% — use smaller position size")
    if not risks:
        risks.append("Watch for positive news catalysts that could trigger short-covering rallies")
    risks = risks[:2]

    return TradeSetup(
        symbol=constituent["symbol"],
        name=constituent["name"],
        direction="short",
        setup_type="momentum",
        quality=_quality(score),
        entry_price=round(entry, 2),
        stop_loss=round(stop, 2),
        target=round(target, 2),
        risk_reward=rr,
        reasons=reasons,
        risks=risks,
        weight_in_index=constituent["weight"],
        sector=constituent["sector"],
        relative_return_1m=alpha,
    )


def _get_constituents(index_symbol: str) -> list:
    """Fetch constituents via sector_service (NSE API for India indices, ETF fallback otherwise)."""
    try:
        analysis = sector_service.get_index_sector_analysis(index_symbol)
        constituents = []
        for sector in analysis.sectors:
            for stock in sector.stocks:
                constituents.append({
                    "symbol": stock.symbol,
                    "name": stock.name,
                    "sector": stock.sector,
                    "industry": stock.industry,
                    "weight": stock.weight,
                })
        filtered = [c for c in constituents if c.get("weight", 0) >= _MIN_WEIGHT]
        # For NSEBANK, only include bank stocks
        if index_symbol == "NSEBANK":
            filtered = [c for c in filtered if c.get("industry") in _BANK_INDUSTRIES]
        return filtered
    except Exception as exc:
        logger.warning(f"Failed to get constituents for {index_symbol}: {exc}")
        return []


def scan_opportunities(index_symbol: str) -> List[TradeSetup]:
    """Scan index constituents for long/short setups."""
    constituents = _get_constituents(index_symbol)

    # Get index monthly return for alpha calculation
    index_analysis = analysis_orchestrator.get_analysis(index_symbol)
    index_monthly = 0.0
    if index_analysis:
        index_monthly = index_analysis.statistical.monthly_return_pct or 0.0

    results: List[TradeSetup] = []

    def _analyze_one(c):
        try:
            analysis = analysis_orchestrator.get_analysis_for_ticker(
                symbol=c["symbol"],
                ticker=c["symbol"],
                currency="INR",
            )
            if analysis is None:
                return []
            setups = []
            long_s = _long_setup(c, analysis, index_monthly)
            if long_s:
                setups.append(long_s)
            short_s = _short_setup(c, analysis, index_monthly)
            if short_s:
                setups.append(short_s)
            return setups
        except Exception as exc:
            logger.warning(f"Opportunity scan failed for {c['symbol']}: {exc}")
            return []

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(_analyze_one, c): c for c in constituents}
        for future in as_completed(futures):
            results.extend(future.result())

    longs = sorted(
        [s for s in results if s.direction == "long"],
        key=lambda s: ({"A": 0, "B": 1, "C": 2}[s.quality], -s.relative_return_1m),
    )[:5]
    shorts = sorted(
        [s for s in results if s.direction == "short"],
        key=lambda s: ({"A": 0, "B": 1, "C": 2}[s.quality], s.relative_return_1m),
    )[:3]

    return longs + shorts
