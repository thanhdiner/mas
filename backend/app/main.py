from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import connect_db, close_db
from app.errors import register_error_handlers
from app.routes import (
    agents_router,
    tasks_router,
    executions_router,
    dashboard_router,
    ws_router,
    auth_router,
    tools_router,
    webhooks_router,
    schedules_router,
    playground_router,
    knowledge_router,
)
from app.services.scheduler import start_scheduler, stop_scheduler
from app.services.vector_store import init_vector_store

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    await init_vector_store(settings.CHROMADB_PATH)
    await start_scheduler()
    yield
    stop_scheduler()
    await close_db()


app = FastAPI(
    title=settings.APP_NAME,
    description="Multi-Agent System - Orchestration & Management Platform",
    version="0.1.0",
    lifespan=lifespan,
)
register_error_handlers(app)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(agents_router, prefix=settings.API_PREFIX)
app.include_router(tasks_router, prefix=settings.API_PREFIX)
app.include_router(executions_router, prefix=settings.API_PREFIX)
app.include_router(auth_router, prefix=settings.API_PREFIX + "/auth")
app.include_router(dashboard_router, prefix=settings.API_PREFIX)
app.include_router(tools_router, prefix=settings.API_PREFIX)
app.include_router(webhooks_router, prefix=settings.API_PREFIX)
app.include_router(schedules_router, prefix=settings.API_PREFIX)
app.include_router(playground_router, prefix=settings.API_PREFIX)
app.include_router(knowledge_router, prefix=settings.API_PREFIX)
app.include_router(ws_router)


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": "0.1.0",
        "status": "running",
    }


@app.get("/health")
async def health():
    from app.services.vector_store import is_available as vector_available
    return {
        "status": "ok",
        "celery": settings.USE_CELERY,
        "vectorStore": vector_available(),
        "llmProvider": settings.LLM_PROVIDER,
        "llmModel": settings.LLM_MODEL,
    }
