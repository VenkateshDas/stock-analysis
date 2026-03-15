"""Idempotent DB migrations — run at every startup via run_migrations()."""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

_DB_PATH = Path(__file__).resolve().parents[3] / "data" / "bot" / "bot.db"


def _has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row[1] == column for row in rows)


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def run_migrations() -> None:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    try:
        _migrate_add_user_id_columns(conn)
        _migrate_bot_settings(conn)
        _migrate_users_table(conn)
        conn.commit()
        logger.info("DB migrations completed successfully")
    finally:
        conn.close()


def _migrate_add_user_id_columns(conn: sqlite3.Connection) -> None:
    tables = [
        "strategies",
        "backtest_runs",
        "signals",
        "order_intents",
        "live_trades",
        "paper_trades",
    ]
    for table in tables:
        if not _table_exists(conn, table):
            continue
        if not _has_column(conn, table, "user_id"):
            conn.execute(
                f"ALTER TABLE {table} ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'"
            )
            logger.info("Added user_id column to %s", table)


def _migrate_bot_settings(conn: sqlite3.Connection) -> None:
    if not _table_exists(conn, "bot_settings"):
        return
    if _has_column(conn, "bot_settings", "user_id"):
        return  # already migrated
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS bot_settings_new (
            user_id TEXT NOT NULL DEFAULT 'default',
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (user_id, key)
        )
        """
    )
    conn.execute(
        "INSERT INTO bot_settings_new SELECT 'default', key, value FROM bot_settings"
    )
    conn.execute("DROP TABLE bot_settings")
    conn.execute("ALTER TABLE bot_settings_new RENAME TO bot_settings")
    logger.info("Migrated bot_settings to composite PK (user_id, key)")


def _migrate_users_table(conn: sqlite3.Connection) -> None:
    if _table_exists(conn, "users"):
        return
    conn.execute(
        """
        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    logger.info("Created users table")
