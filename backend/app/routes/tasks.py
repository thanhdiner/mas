import asyncio
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from typing import Optional
from app.models.task import TaskCreate, TaskUpdate, TaskResponse, TaskDetailResponse, TaskStatus
from app.services.task_service import TaskService
from app.services.agent_service import AgentService
from app.services.orchestrator import Orchestrator

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    status: Optional[TaskStatus] = Query(None),
    agent_id: Optional[str] = Query(None),
    parent_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    return await TaskService.list_tasks(
        status=status, agent_id=agent_id,
        parent_only=parent_only, skip=skip, limit=limit,
    )


@router.get("/{task_id}", response_model=TaskDetailResponse)
async def get_task(task_id: str):
    task = await TaskService.get_task_detail(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(data: TaskCreate):
    agent = await AgentService.get_agent(data.assignedAgentId)
    if not agent:
        raise HTTPException(status_code=404, detail="Assigned agent not found")
    if not agent.active:
        raise HTTPException(status_code=400, detail="Assigned agent is inactive")
    return await TaskService.create_task(data)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, data: TaskUpdate):
    task = await TaskService.update_task(task_id, data)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/{task_id}/execute")
async def execute_task(task_id: str, background_tasks: BackgroundTasks):
    task = await TaskService.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in [TaskStatus.QUEUED, TaskStatus.FAILED]:
        raise HTTPException(
            status_code=400,
            detail=f"Task cannot be executed in '{task.status}' status",
        )

    # Run execution in background
    background_tasks.add_task(Orchestrator.execute_task, task_id)
    return {"message": "Task execution started", "taskId": task_id}


@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str):
    task = await TaskService.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status in [TaskStatus.DONE, TaskStatus.CANCELLED]:
        raise HTTPException(
            status_code=400,
            detail=f"Task cannot be cancelled in '{task.status}' status",
        )

    await TaskService.update_task_status(task_id, TaskStatus.CANCELLED)
    return {"message": "Task cancelled"}
