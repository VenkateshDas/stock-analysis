from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, List

import httpx

from app.config import settings
from app.models.bot import (
    BacktestReport,
    BacktestTrade,
    StrategyBlueprintRequest,
    StrategyBlueprintResponse,
    StrategySuggestion,
    StrategyImprovementResponse,
)

logger = logging.getLogger(__name__)

# Human-readable labels for each tunable parameter
PARAM_LABELS: Dict[str, str] = {
    "session_start":       "Start looking for trades at",
    "session_end":         "Stop looking for trades at",
    "opening_range_end":   "Morning range window ends at",
    "target_rr":           "Target profit / risk ratio",
    "ema_fast":            "Fast trend period (bars)",
    "ema_slow":            "Slow trend period (bars)",
    "volume_mult":         "Minimum volume multiplier",
}

VALID_PARAMS = set(PARAM_LABELS.keys())
DEFAULT_PARAMS: Dict[str, Any] = {
    "session_start": "09:30",
    "session_end": "15:00",
    "opening_range_end": "09:30",
    "target_rr": 2.0,
    "ema_fast": 9,
    "ema_slow": 21,
    "volume_mult": 1.0,
}


# ── LLM helpers ──────────────────────────────────────────────────────────────

def _extract_content(message: dict) -> str:
    """Extract text from LLM response, falling back to reasoning for thinking models."""
    content = (message.get("content") or "").strip()
    if content:
        return content
    reasoning = (message.get("reasoning") or "").strip()
    if not reasoning:
        return ""
    paragraphs = [p.strip() for p in reasoning.split("\n\n") if p.strip()]
    if paragraphs:
        return paragraphs[-1]
    lines = [ln.strip() for ln in reasoning.splitlines() if ln.strip()]
    return lines[-1] if lines else ""


def _parse_json(raw: str) -> dict:
    """Parse LLM JSON, stripping markdown fences if present."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        lines = lines[1:]  # drop opening ```json or ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object inside larger text
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
        logger.warning("Could not parse LLM JSON: %s", text[:300])
        return {"assessment": text[:500] or "Analysis complete.", "confidence": "low", "suggestions": []}


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(
    report: BacktestReport,
    trades: List[BacktestTrade],
    params: dict,
    symbol: str,
) -> tuple[str, str]:
    wins = [t for t in trades if t.pnl > 0]
    losses = [t for t in trades if t.pnl < 0]
    avg_win = sum(t.pnl for t in wins) / len(wins) if wins else 0
    avg_loss = sum(t.pnl for t in losses) / len(losses) if losses else 0
    buy_trades = [t for t in trades if t.side == "BUY"]
    sell_trades = [t for t in trades if t.side == "SELL"]

    trade_lines = []
    for t in trades[:25]:
        d = str(t.entry_time)[:10]
        sign = "+" if t.pnl >= 0 else ""
        trade_lines.append(
            f"  {d}: {t.side} {t.entry_price:.0f}→{t.exit_price:.0f}  P&L {sign}{t.pnl:.0f} ({sign}{t.pnl_pct:.2f}%)"
        )
    trades_text = "\n".join(trade_lines) if trade_lines else "  No trades were made."

    system_msg = (
        "You are an expert algorithmic trading strategy analyst. "
        "Your job: analyse backtest results from an Opening Range Breakout (ORB) intraday strategy "
        "and suggest specific, concrete parameter changes that could improve performance.\n\n"
        "The strategy logic:\n"
        "1. Records the high/low of the first N minutes (morning range window)\n"
        "2. Enters BUY when price breaks above the morning high, SELL when below the morning low\n"
        "3. Trend filter: EMA(fast) must be above EMA(slow) for BUY (and below for SELL)\n"
        "4. Volume filter: volume > 20-bar average × volume_mult\n"
        "5. Stop-loss at 0.4% of entry; profit target = stop × target_rr; exits at session_end\n\n"
        "Respond with ONLY a valid JSON object in this exact format — no other text:\n"
        "{\n"
        '  "assessment": "<2-3 sentence plain-English summary of what went wrong and why>",\n'
        '  "confidence": "<low|medium|high>",\n'
        '  "suggestions": [\n'
        "    {\n"
        '      "parameter": "<exact name from: session_start, session_end, opening_range_end, target_rr, ema_fast, ema_slow, volume_mult>",\n'
        '      "current_value": <current value as-is>,\n'
        '      "suggested_value": <new recommended value>,\n'
        '      "plain_reason": "<one plain-English sentence explaining why this change helps>"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        "- Only suggest changes with a clear data-backed reason\n"
        "- suggestions can be an empty array [] if the strategy is already well-configured\n"
        "- Use exact parameter names listed above\n"
        "- Time values must be in HH:MM format (e.g. \"09:25\")\n"
        "- Plain English only — no jargon\n"
        "- Output ONLY the JSON object, nothing else"
    )

    user_msg = (
        f"Analyse this backtest and suggest parameter improvements.\n\n"
        f"SYMBOL: {symbol}\n"
        f"PERIOD: {report.start_date} to {report.end_date}\n\n"
        f"RESULTS:\n"
        f"  Total trades:   {report.total_trades}\n"
        f"  Win rate:       {report.win_rate:.1f}%\n"
        f"  Net P&L:        {'+' if report.net_pnl >= 0 else ''}{report.net_pnl:.2f}\n"
        f"  Max drawdown:   {report.max_drawdown_pct:.2f}%\n"
        f"  Sharpe:         {report.sharpe:.3f}\n"
        f"  Sortino:        {report.sortino:.3f}\n"
        f"  Profit factor:  {report.profit_factor:.3f}\n"
        f"  Annual growth:  {report.cagr_pct:.1f}%\n"
        f"  Passed checks:  {'YES' if report.promotion_pass else 'NO'} — {report.promotion_notes}\n\n"
        f"TRADE BREAKDOWN:\n"
        f"  Wins: {len(wins)} (avg +{avg_win:.0f})   Losses: {len(losses)} (avg {avg_loss:.0f})\n"
        f"  BUY trades: {len(buy_trades)}   SELL trades: {len(sell_trades)}\n\n"
        f"INDIVIDUAL TRADES:\n{trades_text}\n\n"
        f"CURRENT PARAMETERS:\n"
        f"  session_start:     {params.get('session_start', '09:30')}  — when bot starts looking\n"
        f"  session_end:       {params.get('session_end', '15:00')}  — when bot stops entering trades\n"
        f"  opening_range_end: {params.get('opening_range_end', '09:30')}  — end of morning high/low capture\n"
        f"  target_rr:         {params.get('target_rr', 2)}  — profit target = stop × this\n"
        f"  ema_fast:          {params.get('ema_fast', 9)}  — fast EMA bars\n"
        f"  ema_slow:          {params.get('ema_slow', 21)}  — slow EMA bars\n"
        f"  volume_mult:       {params.get('volume_mult', 1.0)}  — volume filter multiplier\n\n"
        f"Look for patterns in the individual trades "
        f"(e.g. consistent losses at a particular time, SELL trades all losing, small win/loss ratio) "
        f"and suggest targeted parameter changes. Output ONLY the JSON."
    )

    return system_msg, user_msg


# ── Service ───────────────────────────────────────────────────────────────────

class StrategyAdvisorService:
    """Calls the LLM to analyse backtest results and suggest strategy improvements."""

    def improve(
        self,
        report: BacktestReport,
        trades: List[BacktestTrade],
        current_params: dict,
        symbol: str,
    ) -> StrategyImprovementResponse:
        if not settings.openrouter_api_key:
            return StrategyImprovementResponse(
                run_id=report.run_id,
                assessment=(
                    "AI improvement requires an OpenRouter API key. "
                    "Add OPENROUTER_API_KEY to your .env file to enable this feature."
                ),
                confidence="low",
                suggestions=[],
                improved_params=current_params,
                model_used="none",
                generated_at=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            )

        system_msg, user_msg = _build_prompt(report, trades, current_params, symbol)

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
                    "max_tokens": 2000,
                    "temperature": 0.2,
                },
                timeout=90.0,
            )
            response.raise_for_status()
            data = response.json()

            message = data["choices"][0]["message"]
            raw_text = _extract_content(message)

            if not raw_text:
                logger.warning("Strategy advisor: empty LLM response for run %s", report.run_id)
                return self._error_response(report.run_id, current_params, "The AI model returned an empty response. Please try again.")

            parsed = _parse_json(raw_text)
            return self._build_response(report.run_id, parsed, current_params)

        except httpx.HTTPStatusError as e:
            logger.error("OpenRouter API error %s: %s", e.response.status_code, e.response.text)
            return self._error_response(
                report.run_id, current_params,
                f"Could not reach the AI model (error {e.response.status_code}). Check your OpenRouter API key.",
            )
        except Exception as exc:
            logger.error("Strategy advisor error for run %s: %s", report.run_id, exc, exc_info=True)
            return self._error_response(report.run_id, current_params, "AI analysis temporarily unavailable. Please try again.")

    def build_blueprint(self, req: StrategyBlueprintRequest) -> StrategyBlueprintResponse:
        fallback = self._fallback_blueprint(req)

        if not settings.openrouter_api_key:
            return fallback

        system_msg = (
            "You are an expert intraday strategy coach for retail traders.\n"
            "Create beginner-friendly Opening Range Breakout parameter suggestions.\n"
            "Return only strict JSON with keys:\n"
            "summary, confidence, suggested_name, suggested_description, suggested_params, notes.\n"
            "suggested_params must only include these keys: "
            "session_start, session_end, opening_range_end, target_rr, ema_fast, ema_slow, volume_mult.\n"
            "Use plain language in summary/notes.\n"
            "Important constraints for this platform:\n"
            "- Do NOT suggest changing timeframe/candle interval (engine runs fixed intraday settings).\n"
            "- Do NOT suggest lot-size or broker-specific execution tweaks.\n"
            "- Keep notes short and actionable (max 5 bullets)."
        )
        user_msg = (
            f"Build a strategy starter pack for:\n"
            f"- Symbol: {req.symbol}\n"
            f"- Experience: {req.experience_level}\n"
            f"- Risk: {req.risk_level}\n"
            f"- Objective: {req.objective or 'Not provided'}\n"
            "Keep it practical for paper trading first."
        )

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
                    "max_tokens": 900,
                    "temperature": 0.25,
                },
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            message = data["choices"][0]["message"]
            raw_text = _extract_content(message)
            if not raw_text:
                return fallback

            parsed = _parse_json(raw_text)
            params = self._sanitize_params(parsed.get("suggested_params", {}), fallback.suggested_params)

            return StrategyBlueprintResponse(
                summary=parsed.get("summary", fallback.summary),
                confidence=self._normalize_confidence(parsed.get("confidence"), fallback.confidence),
                suggested_name=parsed.get("suggested_name", fallback.suggested_name),
                suggested_description=parsed.get("suggested_description", fallback.suggested_description),
                suggested_params=params,
                notes=self._normalize_notes(parsed.get("notes"), fallback.notes),
                model_used=settings.openrouter_model,
                generated_at=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            )
        except Exception:
            return fallback

    def _build_response(
        self,
        run_id: str,
        parsed: dict,
        current_params: dict,
    ) -> StrategyImprovementResponse:
        improved_params = dict(current_params)
        suggestions: List[StrategySuggestion] = []

        for s in parsed.get("suggestions", []):
            param = s.get("parameter", "")
            if param not in VALID_PARAMS:
                continue
            sugg = StrategySuggestion(
                parameter=param,
                label=PARAM_LABELS.get(param, param),
                current_value=s.get("current_value", current_params.get(param)),
                suggested_value=s.get("suggested_value"),
                plain_reason=s.get("plain_reason", ""),
            )
            suggestions.append(sugg)
            improved_params[param] = s.get("suggested_value")

        return StrategyImprovementResponse(
            run_id=run_id,
            assessment=parsed.get("assessment", "Analysis complete."),
            confidence=parsed.get("confidence", "medium"),
            suggestions=suggestions,
            improved_params=improved_params,
            model_used=settings.openrouter_model,
            generated_at=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        )

    def _error_response(
        self, run_id: str, current_params: dict, message: str
    ) -> StrategyImprovementResponse:
        return StrategyImprovementResponse(
            run_id=run_id,
            assessment=message,
            confidence="low",
            suggestions=[],
            improved_params=current_params,
            model_used=settings.openrouter_model,
            generated_at=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        )

    def _sanitize_params(self, raw: dict, base: dict) -> Dict[str, Any]:
        out = dict(DEFAULT_PARAMS)
        out.update(base or {})
        for key in VALID_PARAMS:
            if key not in raw:
                continue
            out[key] = raw.get(key)

        out["session_start"] = str(out.get("session_start", DEFAULT_PARAMS["session_start"]))
        out["session_end"] = str(out.get("session_end", DEFAULT_PARAMS["session_end"]))
        out["opening_range_end"] = str(out.get("opening_range_end", DEFAULT_PARAMS["opening_range_end"]))
        out["target_rr"] = float(out.get("target_rr", DEFAULT_PARAMS["target_rr"]))
        out["ema_fast"] = int(out.get("ema_fast", DEFAULT_PARAMS["ema_fast"]))
        out["ema_slow"] = int(out.get("ema_slow", DEFAULT_PARAMS["ema_slow"]))
        out["volume_mult"] = float(out.get("volume_mult", DEFAULT_PARAMS["volume_mult"]))

        # Keep params sensible
        out["ema_fast"] = max(3, min(out["ema_fast"], 50))
        out["ema_slow"] = max(out["ema_fast"] + 1, min(out["ema_slow"], 200))
        out["target_rr"] = max(0.8, min(out["target_rr"], 4.0))
        out["volume_mult"] = max(0.5, min(out["volume_mult"], 3.0))
        return out

    def _normalize_confidence(self, value: Any, fallback: str) -> str:
        v = str(value or "").strip().lower()
        if v in {"low", "medium", "high"}:
            return v
        return fallback

    def _normalize_notes(self, raw: Any, fallback: List[str]) -> List[str]:
        if raw is None:
            return list(fallback)

        items: List[str]
        if isinstance(raw, str):
            lines = [ln.strip(" -\t") for ln in raw.splitlines() if ln.strip()]
            items = lines if lines else [raw.strip()]
        elif isinstance(raw, list):
            tokens = [str(x).strip() for x in raw if str(x).strip()]
            # Recover from character-level tokenization like ["U", "s", "e", ...]
            if len(tokens) >= 20 and sum(1 for t in tokens if len(t) <= 2) / max(len(tokens), 1) >= 0.8:
                joined = "".join(tokens).replace(" .", ".").replace(" ,", ",").strip()
                items = [joined] if joined else []
            else:
                items = tokens
        else:
            items = [str(raw).strip()]

        cleaned = [x for x in items if x]
        return cleaned[:5] if cleaned else list(fallback)

    def _fallback_blueprint(self, req: StrategyBlueprintRequest) -> StrategyBlueprintResponse:
        params = dict(DEFAULT_PARAMS)
        notes = [
            "Run paper trades for at least 2 weeks before moving to live mode.",
            "Change one parameter at a time, then retest.",
        ]
        confidence = "medium"

        risk = (req.risk_level or "medium").lower()
        exp = (req.experience_level or "beginner").lower()
        if risk == "low":
            params.update({"target_rr": 1.6, "volume_mult": 1.15, "ema_fast": 10, "ema_slow": 30})
            notes.append("Low-risk setup: stricter filters and smaller target.")
            confidence = "high"
        elif risk == "high":
            params.update({"target_rr": 2.4, "volume_mult": 0.95, "ema_fast": 7, "ema_slow": 18})
            notes.append("High-risk setup: faster entries and wider target, expect higher drawdowns.")
        else:
            params.update({"target_rr": 2.0, "volume_mult": 1.0, "ema_fast": 9, "ema_slow": 21})

        if exp in {"beginner", "new"}:
            params.update({"session_start": "09:35", "opening_range_end": "09:35"})
            notes.append("Beginner guardrail: wait a little longer after open to reduce noise.")
        elif exp in {"advanced", "pro"}:
            params.update({"session_start": "09:25", "opening_range_end": "09:25"})
            notes.append("Advanced setup starts earlier to capture faster moves.")

        objective_text = req.objective.strip() if req.objective else "Balanced intraday breakout"
        return StrategyBlueprintResponse(
            summary=(
                f"Starter strategy for {req.symbol}: tuned for {risk} risk and {exp} experience. "
                "Use this as a baseline and refine after backtests."
            ),
            confidence=confidence,
            suggested_name=f"{req.symbol.upper()} ORB {risk.title()}",
            suggested_description=f"{objective_text}. ORB setup tailored by AI assistant profile.",
            suggested_params=params,
            notes=notes,
            model_used="rule-based-fallback",
            generated_at=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        )


strategy_advisor_service = StrategyAdvisorService()
