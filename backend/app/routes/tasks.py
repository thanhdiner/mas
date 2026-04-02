from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Query

from app.dependencies import ValidObjectId
from app.errors import BadRequestError, NotFoundError
from app.models.task import (
    TaskCreate,
    TaskDetailResponse,
    TaskResponse,
    TaskStatus,
    TaskUpdate,
)
from app.services.agent_service import AgentService
from app.services.task_service import TaskService
from app.utils.object_id import validate_object_id
from app.utils.task_dispatcher import dispatch_task_execution

router = APIRouter(prefix="/tasks", tags=["Tasks"])


async def _get_active_agent_or_raise(agent_id: str):
    validate_object_id(agent_id, "assignedAgentId")
    agent = await AgentService.get_agent(agent_id)
    if not agent:
        raise NotFoundError("assigned_agent_not_found", "Assigned agent not found")
    if not agent.active:
        raise BadRequestError("assigned_agent_inactive", "Assigned agent is inactive")
    return agent


@router.get("")
async def list_tasks(
    status: Optional[TaskStatus] = Query(None),
    agent_id: Optional[str] = Query(None),
    parent_only: bool = Query(False),
    is_archived: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    if agent_id is not None:
        validate_object_id(agent_id, "agent_id")

    skip = (page - 1) * page_size
    items = await TaskService.list_tasks(
        status=status,
        agent_id=agent_id,
        parent_only=parent_only,
        is_archived=is_archived,
        skip=skip,
        limit=page_size,
    )
    total = await TaskService.count_tasks(
        status=status,
        agent_id=agent_id,
        parent_only=parent_only,
        is_archived=is_archived,
    )
    return {
        "items": [item.model_dump() for item in items],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


@router.get("/{task_id}", response_model=TaskDetailResponse)
async def get_task(task_id: ValidObjectId):
    task = await TaskService.get_task_detail(task_id)
    if not task:
        raise NotFoundError("task_not_found", "Task not found")
    return task


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(data: TaskCreate):
    validate_object_id(data.assignedAgentId, "assignedAgentId")
    if data.parentTaskId:
        validate_object_id(data.parentTaskId, "parentTaskId")

    await _get_active_agent_or_raise(data.assignedAgentId)
    return await TaskService.create_task(data)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: ValidObjectId, data: TaskUpdate):
    if data.assignedAgentId is not None:
        await _get_active_agent_or_raise(data.assignedAgentId)

    task = await TaskService.update_task(task_id, data)
    if not task:
        raise NotFoundError("task_not_found", "Task not found")
    return task


@router.delete("/{task_id}")
async def delete_task(task_id: ValidObjectId, hard: bool = Query(False)):
    """Soft delete (archive) a task by default, or hard delete if hard=True."""
    task = await TaskService.get_task(task_id)
    if not task:
        raise NotFoundError("task_not_found", "Task not found")

    if hard:
        await TaskService.delete_task_hard(task_id)
        return {"message": "Task permanently deleted"}
    else:
        await TaskService.archive_task(task_id)
        return {"message": "Task moved to trash"}


@router.post("/{task_id}/restore")
async def restore_task(task_id: ValidObjectId):
    """Restore an archived task from trash."""
    task = await TaskService.get_task(task_id)
    if not task:
        raise NotFoundError("task_not_found", "Task not found")

    await TaskService.restore_task(task_id)
    return {"message": "Task restored"}


@router.post("/{task_id}/execute")
async def execute_task(
    task_id: ValidObjectId,
    background_tasks: BackgroundTasks,
    smart_retry: bool = Query(False, description="If true, reuse completed subtask results instead of re-running everything"),
):
    task = await TaskService.get_task(task_id)
    if not task:
        raise NotFoundError("task_not_found", "Task not found")
    if task.status not in [TaskStatus.QUEUED, TaskStatus.FAILED, TaskStatus.DONE]:
        raise BadRequestError(
            "task_invalid_status",
            f"Task cannot be executed in '{task.status}' status",
        )

    await dispatch_task_execution(task_id, background_tasks=background_tasks, smart_retry=smart_retry)
    return {"message": "Task execution started", "taskId": task_id, "smartRetry": smart_retry}


@router.post("/{task_id}/cancel")
async def cancel_task(task_id: ValidObjectId):
    task = await TaskService.get_task(task_id)
    if not task:
        raise NotFoundError("task_not_found", "Task not found")
    if task.status in [TaskStatus.DONE, TaskStatus.CANCELLED]:
        raise BadRequestError(
            "task_invalid_status",
            f"Task cannot be cancelled in '{task.status}' status",
        )

    await TaskService.update_task_status(task_id, TaskStatus.CANCELLED)
    return {"message": "Task cancelled"}


@router.post("/{task_id}/approve")
async def approve_task(task_id: ValidObjectId):
    """Approve a task that is waiting for human approval."""
    task = await TaskService.get_task(task_id)
    if not task:
        raise NotFoundError("task_not_found", "Task not found")
    if task.status != TaskStatus.WAITING_APPROVAL:
        raise BadRequestError(
            "task_invalid_status",
            f"Task is not waiting for approval (current: '{task.status}')",
        )

    await TaskService.update_task_status(task_id, TaskStatus.DONE)

    # Complete the execution object if it exists
    from app.services.execution_service import ExecutionService
    from app.models.execution import ExecutionStatus
    exec_obj = await ExecutionService.get_execution_by_task(task_id)
    if exec_obj and exec_obj.status == ExecutionStatus.RUNNING.value:
        await ExecutionService.complete_execution(exec_obj.id, ExecutionStatus.COMPLETED)

    # Log the approval
    from app.database import get_db
    from datetime import datetime, timezone
    db = get_db()
    await db.approvals.insert_one({
        "taskId": task_id,
        "action": "approved",
        "reviewedAt": datetime.now(timezone.utc),
    })

    return {"message": "Task approved", "taskId": task_id}


@router.post("/{task_id}/reject")
async def reject_task(task_id: ValidObjectId, background_tasks: BackgroundTasks):
    """Reject a task and optionally re-execute with feedback."""
    task = await TaskService.get_task(task_id)
    if not task:
        raise NotFoundError("task_not_found", "Task not found")
    if task.status != TaskStatus.WAITING_APPROVAL:
        raise BadRequestError(
            "task_invalid_status",
            f"Task is not waiting for approval (current: '{task.status}')",
        )

    await TaskService.update_task_status(
        task_id, TaskStatus.FAILED, error="Rejected by human reviewer"
    )

    from app.services.execution_service import ExecutionService
    from app.models.execution import ExecutionStatus
    exec_obj = await ExecutionService.get_execution_by_task(task_id)
    if exec_obj and exec_obj.status == ExecutionStatus.RUNNING.value:
        await ExecutionService.complete_execution(exec_obj.id, ExecutionStatus.FAILED)

    from app.database import get_db
    from datetime import datetime, timezone
    db = get_db()
    await db.approvals.insert_one({
        "taskId": task_id,
        "action": "rejected",
        "reviewedAt": datetime.now(timezone.utc),
    })

    return {"message": "Task rejected", "taskId": task_id}
