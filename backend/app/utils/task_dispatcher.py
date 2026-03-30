"""
Task Dispatcher — routes task execution to either BackgroundTasks or Celery.

Controlled by the USE_CELERY flag in settings.
"""

import logging
from fastapi import BackgroundTasks
from app.config import get_settings

logger = logging.getLogger("task_dispatcher")
settings = get_settings()


async def dispatch_task_execution(
    task_id: str,
    depth: int = 0,
    background_tasks: BackgroundTasks | None = None,
    smart_retry: bool = False,
):
    """
    Dispatch a task for execution.
    
    If USE_CELERY is True, sends to Celery queue.
    Otherwise, uses FastAPI BackgroundTasks.
    """
    if settings.USE_CELERY:
        try:
            from app.worker.celery_app import celery_execute_task
            celery_execute_task.delay(task_id, depth)
            logger.info(f"Task {task_id} dispatched to Celery queue")
        except Exception as exc:
            logger.error(f"Celery dispatch failed, falling back to BackgroundTasks: {exc}")
            # Fallback to BackgroundTasks
            if background_tasks:
                from app.services.orchestrator import Orchestrator
                background_tasks.add_task(Orchestrator.execute_task, task_id, depth, smart_retry)
            else:
                raise
    else:
        if background_tasks is None:
            raise ValueError("background_tasks is required when USE_CELERY is False")
        from app.services.orchestrator import Orchestrator
        background_tasks.add_task(Orchestrator.execute_task, task_id, depth, smart_retry)
        logger.info(f"Task {task_id} dispatched via BackgroundTasks")


def dispatch_scheduled_task(task_id: str):
    """
    Dispatch a scheduled task for execution.
    Called from the APScheduler callback (non-request context).
    """
    if settings.USE_CELERY:
        try:
            from app.worker.celery_app import celery_execute_scheduled_task
            celery_execute_scheduled_task.delay(task_id)
            logger.info(f"Scheduled task {task_id} dispatched to Celery queue")
            return
        except Exception as exc:
            logger.error(f"Celery dispatch failed for scheduled task: {exc}")

    # Fallback: use asyncio.create_task
    import asyncio
    from app.services.orchestrator import Orchestrator
    asyncio.create_task(Orchestrator.execute_task(task_id))
    logger.info(f"Scheduled task {task_id} dispatched via asyncio")
