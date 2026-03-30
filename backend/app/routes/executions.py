from fastapi import APIRouter

from app.dependencies import ValidObjectId
from app.errors import NotFoundError
from app.models.execution import ExecutionResponse, ExecutionStepResponse
from app.services.execution_service import ExecutionService

router = APIRouter(prefix="/executions", tags=["Executions"])


@router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(execution_id: ValidObjectId):
    execution = await ExecutionService.get_execution(execution_id)
    if not execution:
        raise NotFoundError("execution_not_found", "Execution not found")
    return execution


@router.get("/{execution_id}/steps", response_model=list[ExecutionStepResponse])
async def get_execution_steps(execution_id: ValidObjectId):
    return await ExecutionService.get_steps(execution_id)


@router.get("/task/{task_id}", response_model=ExecutionResponse)
async def get_execution_by_task(task_id: ValidObjectId):
    execution = await ExecutionService.get_execution_by_task(task_id)
    if not execution:
        raise NotFoundError(
            "execution_not_found",
            "No execution found for this task",
        )
    return execution


@router.get("/task/{task_id}/history", response_model=list[ExecutionResponse])
async def list_executions_by_task(task_id: ValidObjectId):
    """List all executions for a task (newest first)."""
    return await ExecutionService.list_executions_by_task(task_id)
