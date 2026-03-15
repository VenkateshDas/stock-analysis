import httpx
import logging
from datetime import datetime
from typing import Optional

from app.config import settings, INDICES
from app.models.analysis import AnalysisResult, LLMSummary
from app.services.cache import llm_cache

logger = logging.getLogger(__name__)


# ── Formatting helpers ────────────────────────────────────────────────────────

def _pct(v: Optional[float], sign: bool = True) -> str:
    if v is None:
        return "N/A"
    prefix = "+" if sign and v > 0 else ""
    return f"{prefix}{v:.2f}%"


def _num(v: Optional[float], decimals: int = 2) -> str:
    if v is None:
        return "N/A"
    return f"{v:.{decimals}f}"


def _price(v: Optional[float], currency: str = "") -> str:
    if v is None:
        return "N/A"
    c = f" {currency}" if currency else ""
    return f"{v:,.2f}{c}"


def _extract_content(message: dict) -> str:
    """
    Extract usable text from the LLM response message.
    Reasoning models (like minimax-m2.5) sometimes return empty 'content'
    and put everything in 'reasoning'. We fall back to reasoning in that case.
    """
    content = (message.get("content") or "").strip()
    if content:
        return content

    # Reasoning model fallback: take the final paragraph (the answer summary)
    reasoning = (message.get("reasoning") or "").strip()
    if not reasoning:
        return ""

    paragraphs = [p.strip() for p in reasoning.split("\n\n") if p.strip()]
    if paragraphs:
        return paragraphs[-1]

    lines = [ln.strip() for ln in reasoning.splitlines() if ln.strip()]
    return lines[-1] if lines else ""


# ── Plain-English signal translators ─────────────────────────────────────────

def _rsi_plain(rsi: Optional[float], signal: str) -> str:
    if rsi is None:
        return "N/A"
    v = round(rsi, 1)
    if signal == "overbought":
        return f"{v} — buyers have pushed prices very high; a pullback is possible"
    if signal == "oversold":
        return f"{v} — sellers have pushed prices very low; a bounce is possible"
    if rsi > 55:
        return f"{v} — buyers are in control, momentum is healthy"
    if rsi < 45:
        return f"{v} — sellers have the slight edge, momentum is softening"
    return f"{v} — buying and selling pressure is balanced"


def _macd_plain(signal: str) -> str:
    return {
        "bullish": "turning upward (short-term buying momentum is building)",
        "bearish": "turning downward (short-term selling pressure is increasing)",
        "neutral": "flat (no clear momentum shift in either direction)",
    }.get(signal, "flat")


def _adx_plain(adx: Optional[float], signal: str) -> str:
    if adx is None:
        return "N/A"
    v = round(adx, 1)
    return {
        "strong_trend":   f"{v} — the current move is very powerful and well-established",
        "moderate_trend": f"{v} — a clear, established trend is in place",
        "weak_trend":     f"{v} — the trend is mild, not yet strongly established",
        "no_trend":       f"{v} — market is drifting sideways with no clear direction",
    }.get(signal, f"{v}")


def _bb_plain(signal: str, pct_b: Optional[float]) -> str:
    pos = f" (position score: {pct_b:.2f} out of 1.0)" if pct_b is not None else ""
    return {
        "above_upper": f"above upper band{pos} — price has stretched well beyond its normal range; a pullback is common here",
        "near_upper":  f"near upper band{pos} — price is approaching the top of its normal range",
        "middle":      f"in the middle of the band{pos} — price is within its normal trading range",
        "near_lower":  f"near lower band{pos} — price is approaching the bottom of its normal range",
        "below_lower": f"below lower band{pos} — price has fallen outside its normal range; a bounce is common here",
    }.get(signal, f"within normal range{pos}")


def _trend_label_plain(label: str) -> str:
    return {
        "strong_uptrend":   "STRONG UPTREND — prices are consistently and powerfully rising",
        "uptrend":          "UPTREND — prices are clearly moving higher",
        "weak_uptrend":     "mild uptrend — prices are slowly moving higher",
        "flat":             "no clear trend — prices are moving sideways",
        "weak_downtrend":   "mild downtrend — prices are slowly drifting lower",
        "downtrend":        "DOWNTREND — prices are clearly moving lower",
        "strong_downtrend": "STRONG DOWNTREND — prices are consistently and powerfully falling",
    }.get(label, label)


def _sma_phrase(vs: str, val: Optional[float], price: float, currency: str) -> str:
    if val is None:
        return "not available (insufficient data)"
    diff_pct = (price - val) / val * 100
    sign = "+" if diff_pct > 0 else ""
    above_below = "ABOVE" if vs == "above" else "BELOW"
    return f"{above_below} it ({_price(val, currency)}) by {sign}{diff_pct:.1f}%"


def _significance_plain(significant: bool, pvalue: Optional[float]) -> str:
    if significant:
        p = f" (p={pvalue:.3f})" if pvalue is not None else ""
        return f"statistically confirmed{p}"
    p = f" (p={pvalue:.3f})" if pvalue is not None else ""
    return f"not yet confirmed statistically{p} — treat as early signal only"


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(
    symbol: str,
    a: AnalysisResult,
    trend: Optional["MultiTimeframeTrend"],  # noqa: F821
) -> tuple[str, str]:
    """Returns (system_message, user_message) for the LLM API call."""
    config = INDICES.get(symbol)
    index_name = config.name if config else symbol

    t = a.technical
    s = a.statistical
    price = a.last_close
    ccy = a.currency

    # ── Volume description ──────────────────────────────────────────────────
    rvol_desc = {
        "high":   f"{_num(t.rvol)}× the 30-day average — unusually heavy trading activity",
        "low":    f"{_num(t.rvol)}× the 30-day average — unusually light trading activity",
        "normal": f"{_num(t.rvol)}× the 30-day average — normal trading activity",
    }.get(t.rvol_signal, f"{_num(t.rvol)}× average")

    # ── SMA positions ───────────────────────────────────────────────────────
    sma20_phrase  = _sma_phrase(t.price_vs_sma20,  t.sma20,  price, ccy)
    sma50_phrase  = _sma_phrase(t.price_vs_sma50,  t.sma50,  price, ccy)
    sma200_phrase = _sma_phrase(t.price_vs_sma200, t.sma200, price, ccy)

    # ── Trend section (conditional on availability) ─────────────────────────
    trend_section = ""
    if trend is not None:

        def _tf_line(tf, label: str) -> str:
            sig = _significance_plain(tf.trend_significant, tf.mk_pvalue)
            ret = f", {_pct(tf.total_return_pct)} total return over window" if tf.total_return_pct is not None else ""
            score = f"{tf.trend_score:+.2f}" if tf.trend_score != 0.0 else "0.00"
            fc_line = ""
            if tf.next_period_forecast is not None and tf.forecast_change_pct is not None:
                fc_line = (
                    f"\n      Forecast for next period: {_price(tf.next_period_forecast, ccy)}"
                    f" ({_pct(tf.forecast_change_pct)}) — reliability: {tf.forecast_reliability}"
                )
            return (
                f"  {label}:\n"
                f"      Label: {_trend_label_plain(tf.trend_label)}\n"
                f"      Trend score: {score} (range -1.0 to +1.0; positive = up, negative = down)\n"
                f"      Significance: {sig}{ret}"
                f"{fc_line}"
            )

        hurst_line = ""
        if trend.yearly.hurst_exponent is not None:
            h = trend.yearly.hurst_exponent
            hurst_line = (
                f"\n      Trend persistence (Hurst exponent H={h:.2f}): {trend.yearly.persistence or 'N/A'}"
                f"\n      (H>0.55 = trending market, H≈0.5 = random walk, H<0.45 = mean-reverting)"
            )

        trend_section = (
            "\n═══ MULTI-TIMEFRAME TREND ANALYSIS ═══\n"
            "(These are computed using rigorous statistics — Theil-Sen regression + Mann-Kendall test)\n\n"
            + _tf_line(
                trend.daily,
                f"SHORT-TERM  — last {trend.daily.window_bars} trading days"
            ) + "\n\n"
            + _tf_line(
                trend.weekly,
                f"MEDIUM-TERM — last {trend.weekly.window_bars} weeks (~{trend.weekly.window_bars // 4} months)"
            ) + "\n\n"
            + _tf_line(
                trend.monthly,
                f"LONG-TERM   — last {trend.monthly.window_bars} months"
            ) + "\n\n"
            + _tf_line(
                trend.yearly,
                f"SECULAR     — {trend.yearly.window_label}"
            )
            + hurst_line
            + "\n"
        )

    # ── System message ──────────────────────────────────────────────────────
    system_msg = (
        "You are a financial educator writing for complete beginners — people who have never "
        "invested before and do not know any finance terminology.\n\n"
        "Your job: translate the raw market data provided into exactly 6 clear, actionable "
        "bullet points. Each bullet must:\n"
        "  • Start with its TOPIC LABEL in all caps, followed by a colon\n"
        "  • Be written in plain, everyday English — no abbreviations, no jargon\n"
        "  • If you must use a technical term, immediately explain it in plain words after it\n"
        "  • Be 1 to 3 sentences maximum\n"
        "  • Be factual and calm — not sensationalist\n\n"
        "The 6 topics in order: TODAY, MOMENTUM, TREND PICTURE, KEY LEVELS, "
        "RISKS & CAUTIONS, WHAT TO WATCH\n\n"
        "The WHAT TO WATCH bullet must name 2 specific, concrete price levels or events "
        "the reader should monitor over the coming week."
    )

    # ── User message ────────────────────────────────────────────────────────
    user_msg = f"""Analyse {index_name} ({symbol}) for {a.trade_date}.
Current price: {_price(price, ccy)}

═══ TODAY'S SESSION ═══
Price move:   {_pct(s.daily_return_pct)} ({"rose" if (s.daily_return_pct or 0) >= 0 else "fell"})
Day range:    {_pct(s.daily_range_pct)} ({_price(s.daily_range, ccy)} points) vs ATR ratio {_num(s.atr_ratio)}x
Volume:       {rvol_desc}
OBV (volume trend): {t.obv_trend} — shows whether trading volume is confirming the price move

═══ MOMENTUM INDICATORS ═══
RSI-14 (momentum gauge, 0–100):  {_rsi_plain(t.rsi, t.rsi_signal)}
MACD (momentum direction):       {_macd_plain(t.macd_signal)}
  MACD line: {_num(t.macd.macd)} | Signal line: {_num(t.macd.signal)} | Histogram: {_num(t.macd.histogram)}
ADX-14 (trend strength, 0–100):  {_adx_plain(t.adx, t.adx_signal)}
  DI+ (buying force): {_num(t.plus_di)} | DI− (selling force): {_num(t.minus_di)}

═══ PRICE LEVELS ═══
vs 20-day moving average:    {sma20_phrase}
vs 50-day moving average:    {sma50_phrase}
vs 200-day moving average:   {sma200_phrase}
  (200-day is the most important: above = healthy long-term, below = caution)
Bollinger band position:     {_bb_plain(t.bb_signal, t.bollinger.percent_b)}
  Upper band: {_price(t.bollinger.upper, ccy)} | Middle: {_price(t.bollinger.middle, ccy)} | Lower: {_price(t.bollinger.lower, ccy)}

═══ VOLATILITY ═══
Average daily price swing (ATR): {_pct(t.atr_pct)} of current price
20-day annualised volatility:    {_num(s.volatility_20d)}%
Today's range vs ATR:            {_num(s.atr_ratio)}x  (>1 = wider than normal day, <1 = quieter than normal)

═══ RETURNS ═══
1-day:        {_pct(s.daily_return_pct)}
5-day:        {_pct(s.weekly_return_pct)}
20-day:       {_pct(s.monthly_return_pct)}
1-year:       {_pct(s.yearly_return_pct)}
Year-to-date: {_pct(s.ytd_return_pct)}

═══ 52-WEEK CONTEXT ═══
52-week high: {_price(s.week52_high, ccy)}  — currently {_pct(s.pct_from_52w_high)} from that high
52-week low:  {_price(s.week52_low,  ccy)}  — currently {_pct(s.pct_from_52w_low)} from that low
{trend_section}
═══ OVERALL ASSESSMENT ═══
Sentiment score: {a.sentiment_score:+.2f} out of ±1.0  → {a.overall_sentiment.upper()}
(+0.2 to +1.0 = leaning bullish/positive | −0.2 to −1.0 = leaning bearish/negative | in between = neutral)

---
Now write the analysis as exactly 6 bullet points using this exact format:

• TODAY: [what happened in today's session — price move and volume in plain words]
• MOMENTUM: [what the buying/selling pressure looks like right now]
• TREND PICTURE: [what the short, medium, and long-term trends show]
• KEY LEVELS: [important price levels to be aware of — use the actual numbers from the data]
• RISKS & CAUTIONS: [specific warning signs or reasons to be careful — be concrete]
• WHAT TO WATCH: [name 2 specific price levels or events to monitor this week]

Plain English only. No abbreviations. 1–3 sentences per bullet. Start each bullet with the • character."""

    return system_msg, user_msg


# ── Service class ─────────────────────────────────────────────────────────────

class MarketSummaryService:
    """Generates beginner-friendly LLM commentary via OpenRouter API."""

    def get_summary(
        self,
        symbol: str,
        analysis: AnalysisResult,
        trend: Optional["MultiTimeframeTrend"] = None,  # noqa: F821
    ) -> LLMSummary:
        # Cache key includes whether trend data was available — avoids serving
        # a trend-less summary from cache once trend data becomes available.
        has_trend = "t" if trend is not None else "n"
        cache_key = f"llm:{symbol}:{analysis.trade_date}:{has_trend}"
        cached = llm_cache.get(cache_key)
        if cached is not None:
            return cached

        commentary = self._generate(symbol, analysis, trend)
        result = LLMSummary(
            symbol=symbol,
            trade_date=analysis.trade_date,
            commentary=commentary,
            model_used=settings.openrouter_model,
            generated_at=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        llm_cache.set(cache_key, result)
        return result

    def _generate(
        self,
        symbol: str,
        a: AnalysisResult,
        trend: Optional["MultiTimeframeTrend"] = None,  # noqa: F821
    ) -> str:
        if not settings.openrouter_api_key:
            return (
                "AI commentary is not enabled. Add your OPENROUTER_API_KEY to the .env file "
                "to get plain-English market analysis."
            )

        system_msg, user_msg = _build_prompt(symbol, a, trend)

        try:
            response = httpx.post(
                f"{settings.openrouter_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "Stock Market Analysis Dashboard",
                },
                json={
                    "model": settings.openrouter_model,
                    "messages": [
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": user_msg},
                    ],
                    # minimax-m2.5 is a reasoning model: it spends tokens on
                    # internal chain-of-thought BEFORE writing the response.
                    # Observed: ~800–1500 reasoning tokens + ~600 response tokens.
                    # Setting 900 starved the model — content came back empty and
                    # _extract_content fell back to the last reasoning paragraph.
                    # 3500 gives ample room for both thinking and full output.
                    "max_tokens": 3500,
                    "temperature": 0.3,
                },
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()

            choice = data["choices"][0]
            finish_reason = choice.get("finish_reason")
            message = choice["message"]

            # Warn immediately if the model was cut off — makes truncation
            # visible in logs rather than silently returning partial output.
            if finish_reason == "length":
                usage = data.get("usage", {})
                reasoning_tokens = (
                    usage.get("completion_tokens_details", {}).get("reasoning_tokens", "?")
                )
                logger.warning(
                    f"LLM hit max_tokens for {symbol} — response truncated. "
                    f"finish_reason=length | completion_tokens={usage.get('completion_tokens')} "
                    f"| reasoning_tokens={reasoning_tokens}. Increase max_tokens if this recurs."
                )

            commentary = _extract_content(message)

            if not commentary:
                logger.warning(
                    f"LLM returned empty content for {symbol}. "
                    f"finish_reason={finish_reason}. "
                    f"Full message keys: {list(message.keys())}"
                )
                return "Summary could not be generated — the AI model did not produce a response. Please try again."

            usage = data.get("usage", {})
            reasoning_tokens = usage.get("completion_tokens_details", {}).get("reasoning_tokens", "?")
            logger.info(
                f"LLM summary for {symbol}: {len(commentary)} chars | "
                f"finish_reason={finish_reason} | "
                f"tokens: prompt={usage.get('prompt_tokens')} "
                f"completion={usage.get('completion_tokens')} "
                f"reasoning={reasoning_tokens}"
            )
            return commentary

        except httpx.HTTPStatusError as e:
            logger.error(f"OpenRouter API error {e.response.status_code}: {e.response.text}")
            return f"Could not generate commentary (error {e.response.status_code}). Please check your OpenRouter API key."
        except Exception as exc:
            logger.error(f"LLM generation error for {symbol}: {exc}", exc_info=True)
            return "Commentary temporarily unavailable. The technical data above shows the full picture."


market_summary_service = MarketSummaryService()
