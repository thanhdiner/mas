from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.utils.websocket_manager import ws_manager

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/executions/{execution_id}")
async def websocket_execution(websocket: WebSocket, execution_id: str):
    await ws_manager.connect(execution_id, websocket)
    try:
        while True:
            # Keep connection alive; client can also send messages
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(execution_id, websocket)
