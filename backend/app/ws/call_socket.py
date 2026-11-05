"""
WebSocket handler for live call events.
Each call has its own WebSocket room; events are broadcast to all connected clients.
"""
import asyncio
import json
import logging
from typing import Dict, Set

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# Active connections: call_id → set of WebSocket connections
_connections: Dict[str, Set[WebSocket]] = {}
# Active orchestrators: call_id → asyncio.Task
_orchestrator_tasks: Dict[str, asyncio.Task] = {}


class ConnectionManager:
    def connect(self, call_id: str, ws: WebSocket):
        _connections.setdefault(call_id, set()).add(ws)
        logger.info(f"WS connected: {call_id} ({len(_connections[call_id])} clients)")

    def disconnect(self, call_id: str, ws: WebSocket):
        if call_id in _connections:
            _connections[call_id].discard(ws)
            if not _connections[call_id]:
                del _connections[call_id]

    async def broadcast(self, call_id: str, message: dict):
        """Send a message to all WebSocket clients watching this call."""
        clients = _connections.get(call_id, set())
        dead = set()
        payload = json.dumps(message, default=str)
        for ws in clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            clients.discard(ws)

    def set_task(self, call_id: str, task: asyncio.Task):
        _orchestrator_tasks[call_id] = task

    def cancel_task(self, call_id: str):
        task = _orchestrator_tasks.get(call_id)
        if task and not task.done():
            task.cancel()


manager = ConnectionManager()


async def handle_call_websocket(websocket: WebSocket, call_id: str):
    """
    FastAPI WebSocket endpoint handler for /ws/calls/{call_id}.
    Clients receive: speech_start, processing, final, menu_pressed,
                     hold_started, promise_proposed, call_ended, error
    """
    await websocket.accept()
    manager.connect(call_id, websocket)
    try:
        # Keep connection alive; just echo pings
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # Handle client messages if needed (e.g., key press overrides or chat)
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                elif msg.get("type") in ("operator_speech", "chat_message"):
                    await manager.broadcast(call_id, msg)
            except asyncio.TimeoutError:
                # Send keepalive
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        logger.info(f"WS disconnected: {call_id}")
    except Exception as e:
        logger.warning(f"WS error {call_id}: {e}")
    finally:
        manager.disconnect(call_id, websocket)
