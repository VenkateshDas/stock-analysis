from __future__ import annotations

from datetime import timedelta
from typing import Dict, List

from app.bot.backtest.engine import BacktestEngine
from app.models.bot import BacktestConfig, RiskConfig


class WalkForwardRunner:
    def __init__(self):
        self.engine = BacktestEngine()

    def run(self, config: BacktestConfig, risk: RiskConfig, train_days: int, test_days: int, steps: int) -> Dict:
        reports: List[Dict] = []
        start = config.start_date

        for i in range(steps):
            train_start = start + timedelta(days=i * test_days)
            test_start = train_start + timedelta(days=train_days)
            test_end = test_start + timedelta(days=test_days)
            step_cfg = config.model_copy(update={"start_date": test_start, "end_date": test_end})
            artifacts = self.engine.run(step_cfg, risk)
            reports.append(artifacts.report.model_dump())

        return {
            "steps": steps,
            "reports": reports,
        }
