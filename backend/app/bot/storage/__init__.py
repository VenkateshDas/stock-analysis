from pathlib import Path

from app.bot.storage.repository import BotRepository


BOT_DB_PATH = Path(__file__).resolve().parents[3] / "data" / "bot" / "bot.db"
repo = BotRepository(BOT_DB_PATH)
