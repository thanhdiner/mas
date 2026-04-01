from fastapi import APIRouter, Query

from app.dependencies import ValidObjectId
from app.errors import NotFoundError
from app.models.execution import ExecutionResponse
from app.services.execution_service import ExecutionService

router = APIRouter(prefix="/executions", tags=["Executions"])


@router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(execution_id: ValidObjectId):
    execution = await ExecutionService.get_execution(execution_id)
    if not execution:
        raise NotFoundError("execution_not_found", "Execution not found")
    return execution


@router.get("/{execution_id}/steps")
async def get_execution_steps(
    execution_id: ValidObjectId,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    skip = (page - 1) * page_size
    items, total = await ExecutionService.get_steps(
        execution_id, skip=skip, limit=page_size
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


@router.get("/task/{task_id}", response_model=ExecutionResponse)
async def get_execution_by_task(task_id: ValidObjectId):
    execution = await ExecutionService.get_execution_by_task(task_id)
    if not execution:
        raise NotFoundError(
            "execution_not_found",
            "No execution found for this task",
        )
    return execution


@router.get("/task/{task_id}/history")
async def list_executions_by_task(
    task_id: ValidObjectId,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List executions for a task with pagination (newest first)."""
    skip = (page - 1) * page_size
    items, total = await ExecutionService.list_executions_by_task(
        task_id, skip=skip, limit=page_size
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }
