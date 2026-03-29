from app.routes.agents import router as agents_router
from app.routes.tasks import router as tasks_router
from app.routes.executions import router as executions_router
from app.routes.dashboard import router as dashboard_router
from app.routes.ws import router as ws_router
from app.routes.auth import router as auth_router
from app.routes.tools import router as tools_router
from app.routes.webhooks import router as webhooks_router
from app.routes.schedules import router as schedules_router
from app.routes.playground import router as playground_router
from app.routes.knowledge import router as knowledge_router
from app.routes.settings import router as settings_router

__all__ = [
    "agents_router",
    "tasks_router",
    "executions_router",
    "dashboard_router",
    "ws_router",
    "auth_router",
    "tools_router",
    "webhooks_router",
    "schedules_router",
    "playground_router",
    "knowledge_router",
    "settings_router",
]
