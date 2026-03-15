from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.bot.storage import repo


class LiveTradingService:
    def execute_approved_intent(
        self,
        intent_id: str,
        mode: str,
        kite_client: Any = None,
    ) -> Dict[str, Any]:
        """Execute an approved order intent in paper or live mode."""
        intent = repo.get_order_intent(intent_id)
        if intent is None:
            raise ValueError(f"Order intent {intent_id} not found")

        if intent["status"] != "APPROVED":
            raise ValueError(f"Intent {intent_id} is not in APPROVED status (got {intent['status']})")

        if mode == "live" and kite_client is not None:
            return self._execute_live(intent, kite_client)
        else:
            return self._execute_paper(intent)

    def _execute_paper(self, intent: Dict[str, Any]) -> Dict[str, Any]:
        order_id = f"PAPER-{uuid.uuid4().hex[:12]}"
        trade_id = f"LT-{uuid.uuid4().hex[:10]}"
        entry_time = datetime.utcnow()

        # Fetch a simulated fill price (use last known price from signals or 0)
        entry_price = intent.get("signal_price", 0.0)

        repo.save_live_trade(
            trade_id=trade_id,
            intent_id=intent["intent_id"],
            symbol=intent["symbol"],
            side=intent["side"],
            qty=intent["quantity"],
            entry_price=entry_price,
            entry_time=entry_time,
            mode="paper",
            kite_order_id=order_id,
            status="OPEN",
        )

        repo.mark_intent_executed(intent["intent_id"], order_id)

        return {
            "trade_id": trade_id,
            "order_id": order_id,
            "symbol": intent["symbol"],
            "side": intent["side"],
            "quantity": intent["quantity"],
            "mode": "paper",
            "status": "FILLED",
            "filled_at": entry_time.isoformat(),
        }

    def _execute_live(self, intent: Dict[str, Any], kite_client: Any) -> Dict[str, Any]:
        transaction_type = "BUY" if intent["side"].upper() == "BUY" else "SELL"
        order_id = kite_client.place_order(
            variety="regular",
            exchange="NSE",
            tradingsymbol=intent["symbol"],
            transaction_type=transaction_type,
            quantity=intent["quantity"],
            order_type=intent.get("order_type", "MARKET"),
            product="MIS",
        )
        trade_id = f"LT-{uuid.uuid4().hex[:10]}"
        entry_time = datetime.utcnow()

        repo.save_live_trade(
            trade_id=trade_id,
            intent_id=intent["intent_id"],
            symbol=intent["symbol"],
            side=intent["side"],
            qty=intent["quantity"],
            entry_price=0.0,
            entry_time=entry_time,
            mode="live",
            kite_order_id=str(order_id),
            status="PLACED",
        )

        repo.mark_intent_executed(intent["intent_id"], str(order_id))

        return {
            "trade_id": trade_id,
            "order_id": str(order_id),
            "symbol": intent["symbol"],
            "side": intent["side"],
            "quantity": intent["quantity"],
            "mode": "live",
            "status": "PLACED",
            "placed_at": entry_time.isoformat(),
        }

    def get_live_positions(self, mode: str, kite_client: Any = None) -> List[Dict[str, Any]]:
        if mode == "live" and kite_client is not None:
            try:
                positions = kite_client.positions()
                net = positions.get("net", [])
                return [
                    {
                        "symbol": p.get("tradingsymbol", ""),
                        "qty": p.get("quantity", 0),
                        "avg_price": float(p.get("average_price", 0)),
                        "last_price": float(p.get("last_price", 0)),
                        "unrealized_pnl": float(p.get("unrealised", 0)),
                        "product": p.get("product", "MIS"),
                    }
                    for p in net
                    if p.get("quantity", 0) != 0
                ]
            except Exception:
                return []
        else:
            return repo.get_open_paper_positions()

    def get_live_orders_today(self, mode: str, kite_client: Any = None) -> List[Dict[str, Any]]:
        if mode == "live" and kite_client is not None:
            try:
                orders = kite_client.orders()
                return [
                    {
                        "order_id": o.get("order_id", ""),
                        "symbol": o.get("tradingsymbol", ""),
                        "side": o.get("transaction_type", ""),
                        "qty": o.get("quantity", 0),
                        "order_type": o.get("order_type", ""),
                        "status": o.get("status", ""),
                        "placed_at": str(o.get("order_timestamp", "")),
                    }
                    for o in orders
                ]
            except Exception:
                return []
        else:
            return repo.get_live_trades_today()


live_trading = LiveTradingService()
