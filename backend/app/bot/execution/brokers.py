from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict

from app.models.bot import OrderIntent


class Broker(ABC):
    @abstractmethod
    def place_order(self, symbol: str, side: str, quantity: int, order_type: str = "MARKET") -> Dict[str, Any]:
        raise NotImplementedError


class PaperBroker(Broker):
    def place_order(self, symbol: str, side: str, quantity: int, order_type: str = "MARKET") -> Dict[str, Any]:
        return {
            "order_id": f"PAPER-{uuid.uuid4().hex[:12]}",
            "symbol": symbol,
            "side": side,
            "quantity": quantity,
            "order_type": order_type,
            "status": "FILLED",
            "filled_at": datetime.utcnow().isoformat(),
        }


class KiteBroker(Broker):
    def __init__(self, api_key: str | None = None, access_token: str | None = None):
        self.api_key = api_key
        self.access_token = access_token
        self.client = None

    def init_client(self):
        try:
            from kiteconnect import KiteConnect
        except Exception as exc:
            raise RuntimeError("kiteconnect dependency missing; install and configure before live use") from exc

        if not self.api_key or not self.access_token:
            raise RuntimeError("Kite API key/access token not configured")

        self.client = KiteConnect(api_key=self.api_key)
        self.client.set_access_token(self.access_token)

    def place_order(self, symbol: str, side: str, quantity: int, order_type: str = "MARKET") -> Dict[str, Any]:
        # Manual approval workflow only in this phase. No unattended live execution.
        if self.client is None:
            self.init_client()

        transaction_type = "BUY" if side.upper() == "BUY" else "SELL"

        order_id = self.client.place_order(
            variety="regular",
            exchange="NSE",
            tradingsymbol=symbol,
            transaction_type=transaction_type,
            quantity=quantity,
            order_type=order_type,
            product="MIS",
        )
        return {
            "order_id": order_id,
            "symbol": symbol,
            "side": side,
            "quantity": quantity,
            "order_type": order_type,
            "status": "PLACED",
            "placed_at": datetime.utcnow().isoformat(),
        }


def build_order_intent(
    algo_id: str,
    strategy_version: str,
    signal_id: str,
    symbol: str,
    side: str,
    quantity: int,
) -> OrderIntent:
    return OrderIntent(
        intent_id=f"INT-{uuid.uuid4().hex[:12]}",
        algo_id=algo_id,
        strategy_version=strategy_version,
        signal_id=signal_id,
        symbol=symbol,
        side=side,
        quantity=quantity,
    )
