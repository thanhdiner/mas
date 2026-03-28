"""
Celery Application — distributed task queue for MAS.

When USE_CELERY=true in .env, task execution is dispatched to Celery workers
instead of FastAPI BackgroundTasks. This allows horizontal scaling of 
agent workloads across multiple worker processes/machines.

Usage:
    # Start worker:
    celery -A app.worker.celery_app worker --loglevel=info --pool=solo
    
    # With concurrency:
    celery -A app.worker.celery_app worker --loglevel=info -c 4
"""

import asyncio
import logging
from celery import Celery

from app.config import get_settings

logger = logging.getLogger("celery_worker")
settings = get_settings()

# Create Celery app
celery_app = Celery(
    "mas_worker",
    broker=settings.CELERY_BROKER_URL or settings.REDIS_URL,
    backend=settings.CELERY_RESULT_BACKEND or settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Retry settings
    task_default_retry_delay=30,
    task_max_retries=3,
    # Result expiration
    result_expires=3600,
)


def _run_async(coro):
    """Run an async function in a sync context (Celery worker)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If there's already a running loop, use run_coroutine_threadsafe
            future = asyncio.run_coroutine_threadsafe(coro, loop)
            return future.result(timeout=600)
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        # No event loop exists, create a new one
        return asyncio.run(coro)


async def _ensure_db():
    """Ensure database is connected for the worker process."""
    from app.database import get_db, connect_db
    if get_db() is None:
        await connect_db()


@celery_app.task(bind=True, name="mas.execute_task", max_retries=2)
def celery_execute_task(self, task_id: str, depth: int = 0):
    """
    Celery task that runs the Orchestrator.
    This is the distributed equivalent of BackgroundTasks.add_task().
    """
    async def _run():
        await _ensure_db()
        from app.services.orchestrator import Orchestrator
        await Orchestrator.execute_task(task_id, depth=depth)

    try:
        logger.info(f"[Celery] Executing task {task_id} at depth {depth}")
        _run_async(_run())
        logger.info(f"[Celery] Task {task_id} completed")
    except Exception as exc:
        logger.error(f"[Celery] Task {task_id} failed: {exc}")
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(bind=True, name="mas.execute_scheduled_task", max_retries=1)
def celery_execute_scheduled_task(self, task_id: str):
    """Celery task for scheduled executions."""
    async def _run():
        await _ensure_db()
        from app.services.orchestrator import Orchestrator
        await Orchestrator.execute_task(task_id)

    try:
        logger.info(f"[Celery] Executing scheduled task {task_id}")
        _run_async(_run())
    except Exception as exc:
        logger.error(f"[Celery] Scheduled task {task_id} failed: {exc}")
        raise self.retry(exc=exc, countdown=60)
