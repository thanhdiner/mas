from fastapi import APIRouter, HTTPException
from app.models.execution import ExecutionResponse, ExecutionStepResponse
from app.services.execution_service import ExecutionService

router = APIRouter(prefix="/executions", tags=["Executions"])


@router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(execution_id: str):
    execution = await ExecutionService.get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


@router.get("/{execution_id}/steps", response_model=list[ExecutionStepResponse])
async def get_execution_steps(execution_id: str):
    return await ExecutionService.get_steps(execution_id)


@router.get("/task/{task_id}", response_model=ExecutionResponse)
async def get_execution_by_task(task_id: str):
    execution = await ExecutionService.get_execution_by_task(task_id)
    if not execution:
        raise HTTPException(status_code=404, detail="No execution found for this task")
    return execution
