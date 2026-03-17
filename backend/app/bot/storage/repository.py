from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from app.models.bot import (
    AuditEvent,
    BacktestReport,
    BacktestTrade,
    EquityPoint,
    OrderIntent,
    SignalEvent,
    StrategyConfig,
)
from app.models.paper_trade import PaperTrade, PaperTradeCreate, TradeStatus


class BotRepository:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self):
        with self._conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS strategies (
                    strategy_id TEXT NOT NULL,
                    user_id TEXT NOT NULL DEFAULT 'default',
                    name TEXT NOT NULL,
                    version TEXT NOT NULL,
                    description TEXT,
                    instrument TEXT,
                    parameters_json TEXT,
                    enabled INTEGER NOT NULL,
                    algo_id TEXT,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (strategy_id, user_id)
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS backtest_runs (
                    run_id TEXT NOT NULL,
                    user_id TEXT NOT NULL DEFAULT 'default',
                    strategy_id TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    completed_at TEXT,
                    report_json TEXT,
                    PRIMARY KEY (run_id, user_id)
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS backtest_trades (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    side TEXT NOT NULL,
                    entry_time TEXT NOT NULL,
                    entry_price REAL NOT NULL,
                    exit_time TEXT NOT NULL,
                    exit_price REAL NOT NULL,
                    qty INTEGER NOT NULL,
                    pnl REAL NOT NULL,
                    pnl_pct REAL NOT NULL
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS backtest_equity (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    equity REAL NOT NULL
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS signals (
                    signal_id TEXT NOT NULL,
                    user_id TEXT NOT NULL DEFAULT 'default',
                    strategy_id TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    signal_type TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    price REAL NOT NULL,
                    timestamp TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    PRIMARY KEY (signal_id, user_id)
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS order_intents (
                    intent_id TEXT NOT NULL,
                    user_id TEXT NOT NULL DEFAULT 'default',
                    algo_id TEXT NOT NULL,
                    strategy_version TEXT NOT NULL,
                    signal_id TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    side TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    order_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    approved_at TEXT,
                    PRIMARY KEY (intent_id, user_id)
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_date TEXT NOT NULL,
                    event_time TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    run_id TEXT,
                    strategy_id TEXT,
                    algo_id TEXT,
                    payload_json TEXT
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS live_trades (
                    trade_id TEXT NOT NULL,
                    user_id TEXT NOT NULL DEFAULT 'default',
                    intent_id TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    side TEXT NOT NULL,
                    qty INTEGER NOT NULL,
                    entry_price REAL NOT NULL,
                    entry_time TEXT NOT NULL,
                    exit_price REAL,
                    exit_time TEXT,
                    pnl REAL,
                    mode TEXT NOT NULL,
                    kite_order_id TEXT,
                    status TEXT NOT NULL,
                    PRIMARY KEY (trade_id, user_id)
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS bot_settings (
                    user_id TEXT NOT NULL DEFAULT 'default',
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    PRIMARY KEY (user_id, key)
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS paper_trades (
                    id TEXT NOT NULL,
                    user_id TEXT NOT NULL DEFAULT 'default',
                    symbol TEXT NOT NULL,
                    company_name TEXT NOT NULL,
                    sector TEXT NOT NULL DEFAULT '',
                    strategy TEXT NOT NULL DEFAULT 'pullback',
                    entry_price REAL NOT NULL,
                    stop_price REAL NOT NULL,
                    target_price REAL NOT NULL,
                    atr REAL NOT NULL DEFAULT 0,
                    shares REAL NOT NULL DEFAULT 1,
                    virtual_capital REAL NOT NULL DEFAULT 100000,
                    entry_date TEXT NOT NULL,
                    notes TEXT,
                    status TEXT NOT NULL DEFAULT 'OPEN',
                    exit_price REAL,
                    exit_date TEXT,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (id, user_id)
                )
                """
            )

    def register_strategy(self, strategy: StrategyConfig, user_id: str = "default") -> None:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO strategies (strategy_id, user_id, name, version, description, instrument, parameters_json, enabled, algo_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    strategy.strategy_id,
                    user_id,
                    strategy.name,
                    strategy.version,
                    strategy.description,
                    strategy.instrument,
                    json.dumps(strategy.parameters),
                    1 if strategy.enabled else 0,
                    strategy.algo_id,
                    strategy.created_at.isoformat(),
                ),
            )

    def list_strategies(self, user_id: str = "default") -> List[StrategyConfig]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM strategies WHERE user_id=? ORDER BY created_at DESC", (user_id,)
            ).fetchall()
        out: List[StrategyConfig] = []
        for row in rows:
            out.append(
                StrategyConfig(
                    strategy_id=row["strategy_id"],
                    name=row["name"],
                    version=row["version"],
                    description=row["description"] or "",
                    instrument=row["instrument"] or "NIFTY",
                    parameters=json.loads(row["parameters_json"] or "{}"),
                    enabled=bool(row["enabled"]),
                    algo_id=row["algo_id"] or "ALG-IN-BREAKOUT-V1",
                    created_at=datetime.fromisoformat(row["created_at"]),
                )
            )
        return out

    def create_backtest_run(self, run_id: str, strategy_id: str, symbol: str, user_id: str = "default") -> None:
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO backtest_runs (run_id, user_id, strategy_id, symbol, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (run_id, user_id, strategy_id, symbol, "RUNNING", datetime.utcnow().isoformat()),
            )

    def finish_backtest_run(self, run_id: str, status: str, report: Optional[BacktestReport], user_id: str = "default") -> None:
        with self._conn() as conn:
            conn.execute(
                "UPDATE backtest_runs SET status=?, completed_at=?, report_json=? WHERE run_id=? AND user_id=?",
                (
                    status,
                    datetime.utcnow().isoformat(),
                    report.model_dump_json() if report else None,
                    run_id,
                    user_id,
                ),
            )

    def save_backtest_trades(self, trades: Iterable[BacktestTrade]) -> None:
        with self._conn() as conn:
            conn.executemany(
                """
                INSERT INTO backtest_trades (run_id, symbol, side, entry_time, entry_price, exit_time, exit_price, qty, pnl, pnl_pct)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        t.run_id,
                        t.symbol,
                        t.side,
                        t.entry_time.isoformat(),
                        t.entry_price,
                        t.exit_time.isoformat(),
                        t.exit_price,
                        t.qty,
                        t.pnl,
                        t.pnl_pct,
                    )
                    for t in trades
                ],
            )

    def save_backtest_equity(self, points: Iterable[EquityPoint]) -> None:
        with self._conn() as conn:
            conn.executemany(
                "INSERT INTO backtest_equity (run_id, timestamp, equity) VALUES (?, ?, ?)",
                [(p.run_id, p.timestamp.isoformat(), p.equity) for p in points],
            )

    def get_backtest_run(self, run_id: str, user_id: str = "default") -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM backtest_runs WHERE run_id=? AND user_id=?", (run_id, user_id)
            ).fetchone()
        if row is None:
            return None
        report = BacktestReport.model_validate_json(row["report_json"]) if row["report_json"] else None
        return {
            "run_id": row["run_id"],
            "status": row["status"],
            "created_at": datetime.fromisoformat(row["created_at"]),
            "completed_at": datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
            "report": report,
        }

    def get_backtest_trades(self, run_id: str) -> List[BacktestTrade]:
        with self._conn() as conn:
            rows = conn.execute("SELECT * FROM backtest_trades WHERE run_id=? ORDER BY entry_time", (run_id,)).fetchall()
        return [
            BacktestTrade(
                run_id=row["run_id"],
                symbol=row["symbol"],
                side=row["side"],
                entry_time=datetime.fromisoformat(row["entry_time"]),
                entry_price=row["entry_price"],
                exit_time=datetime.fromisoformat(row["exit_time"]),
                exit_price=row["exit_price"],
                qty=row["qty"],
                pnl=row["pnl"],
                pnl_pct=row["pnl_pct"],
            )
            for row in rows
        ]

    def get_backtest_equity(self, run_id: str) -> List[EquityPoint]:
        with self._conn() as conn:
            rows = conn.execute("SELECT * FROM backtest_equity WHERE run_id=? ORDER BY timestamp", (run_id,)).fetchall()
        return [
            EquityPoint(
                run_id=row["run_id"],
                timestamp=datetime.fromisoformat(row["timestamp"]),
                equity=row["equity"],
            )
            for row in rows
        ]

    def save_signal(self, signal: SignalEvent, user_id: str = "default") -> None:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO signals (signal_id, user_id, strategy_id, symbol, signal_type, confidence, price, timestamp, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    signal.signal_id,
                    user_id,
                    signal.strategy_id,
                    signal.symbol,
                    signal.signal_type,
                    signal.confidence,
                    signal.price,
                    signal.timestamp.isoformat(),
                    signal.reason,
                ),
            )

    def list_signals(self, on_date: date, user_id: str = "default") -> List[SignalEvent]:
        prefix = on_date.isoformat()
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM signals WHERE user_id=? AND timestamp LIKE ? ORDER BY timestamp DESC",
                (user_id, f"{prefix}%"),
            ).fetchall()
        return [
            SignalEvent(
                signal_id=row["signal_id"],
                strategy_id=row["strategy_id"],
                symbol=row["symbol"],
                signal_type=row["signal_type"],
                confidence=row["confidence"],
                price=row["price"],
                timestamp=datetime.fromisoformat(row["timestamp"]),
                reason=row["reason"],
            )
            for row in rows
        ]

    def create_order_intent(self, intent: OrderIntent, user_id: str = "default") -> None:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO order_intents (intent_id, user_id, algo_id, strategy_version, signal_id, symbol, side, quantity, order_type, status, created_at, approved_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    intent.intent_id,
                    user_id,
                    intent.algo_id,
                    intent.strategy_version,
                    intent.signal_id,
                    intent.symbol,
                    intent.side,
                    intent.quantity,
                    intent.order_type,
                    intent.status,
                    intent.created_at.isoformat(),
                    intent.approved_at.isoformat() if intent.approved_at else None,
                ),
            )

    def approve_order_intent(self, intent_id: str, approved: bool, user_id: str = "default") -> bool:
        status = "APPROVED" if approved else "REJECTED"
        with self._conn() as conn:
            cur = conn.execute(
                "UPDATE order_intents SET status=?, approved_at=? WHERE intent_id=? AND user_id=?",
                (status, datetime.utcnow().isoformat(), intent_id, user_id),
            )
        return cur.rowcount > 0

    def save_audit_event(self, event: AuditEvent) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO audit_events (event_date, event_time, event_type, run_id, strategy_id, algo_id, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event.event_date.isoformat(),
                    event.event_time.isoformat(),
                    event.event_type,
                    event.run_id,
                    event.strategy_id,
                    event.algo_id,
                    json.dumps(event.payload),
                ),
            )

    def get_audit_events(self, event_date: date) -> List[AuditEvent]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_events WHERE event_date=? ORDER BY event_time ASC",
                (event_date.isoformat(),),
            ).fetchall()
        out: List[AuditEvent] = []
        for row in rows:
            out.append(
                AuditEvent(
                    id=row["id"],
                    event_date=date.fromisoformat(row["event_date"]),
                    event_time=datetime.fromisoformat(row["event_time"]),
                    event_type=row["event_type"],
                    run_id=row["run_id"],
                    strategy_id=row["strategy_id"],
                    algo_id=row["algo_id"],
                    payload=json.loads(row["payload_json"] or "{}"),
                )
            )
        return out

    # ---- live_trades ----

    def save_live_trade(
        self,
        trade_id: str,
        intent_id: str,
        symbol: str,
        side: str,
        qty: int,
        entry_price: float,
        entry_time: datetime,
        mode: str,
        user_id: str = "default",
        kite_order_id: Optional[str] = None,
        status: str = "OPEN",
    ) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO live_trades
                    (trade_id, user_id, intent_id, symbol, side, qty, entry_price, entry_time, mode, kite_order_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (trade_id, user_id, intent_id, symbol, side, qty, entry_price,
                 entry_time.isoformat(), mode, kite_order_id, status),
            )

    def get_live_trades_today(self, user_id: str = "default") -> List[Dict[str, Any]]:
        prefix = date.today().isoformat()
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM live_trades WHERE user_id=? AND entry_time LIKE ? ORDER BY entry_time DESC",
                (user_id, f"{prefix}%"),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_open_paper_positions(self, user_id: str = "default") -> List[Dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM live_trades WHERE user_id=? AND status='OPEN' AND mode='paper' ORDER BY entry_time DESC",
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_today_trade_count(self, user_id: str = "default") -> int:
        prefix = date.today().isoformat()
        with self._conn() as conn:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM live_trades WHERE user_id=? AND entry_time LIKE ?",
                (user_id, f"{prefix}%"),
            ).fetchone()
        return int(row["cnt"]) if row else 0

    def get_today_pnl(self, user_id: str = "default") -> float:
        prefix = date.today().isoformat()
        with self._conn() as conn:
            row = conn.execute(
                "SELECT SUM(COALESCE(pnl, 0)) as total FROM live_trades WHERE user_id=? AND entry_time LIKE ? AND pnl IS NOT NULL",
                (user_id, f"{prefix}%"),
            ).fetchone()
        return float(row["total"] or 0.0)

    def get_order_intent(self, intent_id: str, user_id: str = "default") -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM order_intents WHERE intent_id=? AND user_id=?", (intent_id, user_id)
            ).fetchone()
        return dict(row) if row else None

    def get_pending_intents(self, user_id: str = "default") -> List[Dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM order_intents WHERE user_id=? AND status='PENDING_APPROVAL' ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def mark_intent_executed(self, intent_id: str, order_id: str, user_id: str = "default") -> None:
        with self._conn() as conn:
            conn.execute(
                "UPDATE order_intents SET status='EXECUTED', approved_at=? WHERE intent_id=? AND user_id=?",
                (datetime.utcnow().isoformat(), intent_id, user_id),
            )

    # ---- bot_settings ----

    def get_setting(self, key: str, user_id: str = "default") -> Optional[str]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT value FROM bot_settings WHERE user_id=? AND key=?", (user_id, key)
            ).fetchone()
        return row["value"] if row else None

    def save_setting(self, key: str, value: str, user_id: str = "default") -> None:
        with self._conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO bot_settings (user_id, key, value) VALUES (?, ?, ?)",
                (user_id, key, value),
            )

    # ---- paper_trades ----

    def _row_to_paper_trade(self, row: Any) -> PaperTrade:
        return PaperTrade(
            id=row["id"],
            symbol=row["symbol"],
            company_name=row["company_name"],
            sector=row["sector"] or "",
            strategy=row["strategy"] or "pullback",
            entry_price=row["entry_price"],
            stop_price=row["stop_price"],
            target_price=row["target_price"],
            atr=row["atr"],
            shares=row["shares"],
            virtual_capital=row["virtual_capital"],
            entry_date=row["entry_date"],
            notes=row["notes"],
            status=TradeStatus(row["status"]),
            exit_price=row["exit_price"],
            exit_date=row["exit_date"],
            created_at=row["created_at"],
        )

    def create_paper_trade(self, trade: PaperTradeCreate, trade_id: str, shares: float, entry_date: str, user_id: str = "default") -> str:
        now = datetime.utcnow().isoformat()
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO paper_trades
                    (id, user_id, symbol, company_name, sector, strategy, entry_price, stop_price,
                     target_price, atr, shares, virtual_capital, entry_date, notes, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
                """,
                (
                    trade_id, user_id, trade.symbol, trade.company_name, trade.sector, trade.strategy,
                    trade.entry_price, trade.stop_price, trade.target_price, trade.atr,
                    shares, trade.virtual_capital, entry_date, trade.notes, now,
                ),
            )
        return trade_id

    def list_paper_trades(self, open_only: bool = False, user_id: str = "default") -> List[PaperTrade]:
        with self._conn() as conn:
            if open_only:
                rows = conn.execute(
                    "SELECT * FROM paper_trades WHERE user_id=? AND status='OPEN' ORDER BY created_at DESC",
                    (user_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM paper_trades WHERE user_id=? ORDER BY created_at DESC",
                    (user_id,),
                ).fetchall()
        return [self._row_to_paper_trade(r) for r in rows]

    def get_paper_trade(self, trade_id: str, user_id: str = "default") -> Optional[PaperTrade]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM paper_trades WHERE id=? AND user_id=?", (trade_id, user_id)
            ).fetchone()
        return self._row_to_paper_trade(row) if row else None

    def close_paper_trade(self, trade_id: str, status: TradeStatus, exit_price: float, user_id: str = "default") -> bool:
        today = date.today().isoformat()
        with self._conn() as conn:
            cur = conn.execute(
                "UPDATE paper_trades SET status=?, exit_price=?, exit_date=? WHERE id=? AND user_id=?",
                (status.value, exit_price, today, trade_id, user_id),
            )
        return cur.rowcount > 0

    def delete_paper_trade(self, trade_id: str, user_id: str = "default") -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "DELETE FROM paper_trades WHERE id=? AND user_id=?", (trade_id, user_id)
            )
        return cur.rowcount > 0
