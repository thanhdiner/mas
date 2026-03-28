from typing import Any
from fastapi import WebSocket


class WebSocketManager:
    """Manages WebSocket connections for real-time execution updates."""

    def __init__(self):
        # execution_id -> list of websocket connections
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, execution_id: str, websocket: WebSocket):
        await websocket.accept()
        if execution_id not in self.connections:
            self.connections[execution_id] = []
        self.connections[execution_id].append(websocket)

    def disconnect(self, execution_id: str, websocket: WebSocket):
        if execution_id in self.connections:
            self.connections[execution_id] = [
                ws for ws in self.connections[execution_id] if ws != websocket
            ]
            if not self.connections[execution_id]:
                del self.connections[execution_id]

    async def broadcast(self, execution_id: str, data: dict[str, Any]):
        if execution_id not in self.connections:
            return
        dead = []
        for ws in self.connections[execution_id]:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(execution_id, ws)


ws_manager = WebSocketManager()
