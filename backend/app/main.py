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
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
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
    return {"status": "ok"}
