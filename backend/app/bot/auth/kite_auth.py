from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

SESSION_FILE = Path(__file__).resolve().parents[4] / "data" / "bot" / "kite_session.json"


class KiteAuthManager:
    def get_login_url(self, api_key: str) -> str:
        return f"https://kite.zerodha.com/connect/login?api_key={api_key}&v=3"

    def complete_login(self, api_key: str, api_secret: str, request_token: str) -> dict:
        try:
            from kiteconnect import KiteConnect
        except ImportError as exc:
            raise RuntimeError("kiteconnect package not installed. Run: pip install kiteconnect") from exc

        kite = KiteConnect(api_key=api_key)
        data = kite.generate_session(request_token, api_secret=api_secret)
        session = {
            "api_key": api_key,
            "api_secret": api_secret,
            "access_token": data["access_token"],
            "user_id": data.get("user_id", ""),
            "user_name": data.get("user_name", ""),
        }
        SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
        SESSION_FILE.write_text(json.dumps(session))
        return session

    def load_session(self) -> Optional[dict]:
        if not SESSION_FILE.exists():
            return None
        try:
            return json.loads(SESSION_FILE.read_text())
        except Exception:
            return None

    def is_connected(self) -> bool:
        session = self.load_session()
        return session is not None and bool(session.get("access_token"))

    def has_credentials(self) -> bool:
        session = self.load_session()
        return session is not None and bool(session.get("api_key"))

    def get_kite_client(self):
        session = self.load_session()
        if not session or not session.get("access_token"):
            return None
        try:
            from kiteconnect import KiteConnect
        except ImportError:
            return None
        kite = KiteConnect(api_key=session["api_key"])
        kite.set_access_token(session["access_token"])
        return kite

    def get_profile(self) -> Optional[dict]:
        session = self.load_session()
        if not session:
            return None
        return {
            "user_name": session.get("user_name", ""),
            "user_id": session.get("user_id", ""),
        }

    def save_credentials(self, api_key: str, api_secret: str) -> None:
        existing = self.load_session() or {}
        existing["api_key"] = api_key
        existing["api_secret"] = api_secret
        SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
        SESSION_FILE.write_text(json.dumps(existing))

    def get_masked_api_key(self) -> Optional[str]:
        session = self.load_session()
        if not session or not session.get("api_key"):
            return None
        key = session["api_key"]
        return key[:4] + "****" + key[-4:] if len(key) > 8 else "****"

    def get_available_margin(self) -> Optional[float]:
        client = self.get_kite_client()
        if client is None:
            return None
        try:
            margins = client.margins("equity")
            return float(margins.get("available", {}).get("live_balance", 0.0))
        except Exception:
            return None

    def disconnect(self) -> None:
        if SESSION_FILE.exists():
            session = self.load_session() or {}
            session.pop("access_token", None)
            SESSION_FILE.write_text(json.dumps(session))


kite_auth = KiteAuthManager()
