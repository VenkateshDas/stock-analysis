from __future__ import annotations

from dataclasses import dataclass


@dataclass
class StrategyDefinition:
    strategy_id: str
    name: str
    description: str
    version: str


IN_BREAKOUT_V1 = StrategyDefinition(
    strategy_id="IN_BREAKOUT_V1",
    name="India Intraday Breakout",
    description="Opening range breakout with trend and volume confirmation.",
    version="v1",
)
