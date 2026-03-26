from fastapi import APIRouter
from app.models.task import TaskStatus
from app.services.agent_service import AgentService
from app.services.task_service import TaskService
from app.services.execution_service import ExecutionService
from app.database import get_db

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def get_dashboard_stats():
    total_agents = await AgentService.count_agents()
    active_agents = await AgentService.count_agents(active_only=True)

    running_tasks = await TaskService.count_tasks(TaskStatus.RUNNING)
    queued_tasks = await TaskService.count_tasks(TaskStatus.QUEUED)
    failed_today = await TaskService.count_failed_today()

    db = get_db()
    waiting_approvals = await db.tasks.count_documents(
        {"status": TaskStatus.WAITING_APPROVAL.value}
    )
    active_runs = await ExecutionService.count_active()

    total_tasks = await TaskService.count_tasks()

    return {
        "totalAgents": total_agents,
        "activeAgents": active_agents,
        "runningTasks": running_tasks,
        "queuedTasks": queued_tasks,
        "failedToday": failed_today,
        "waitingApprovals": waiting_approvals,
        "activeRuns": active_runs,
        "totalTasks": total_tasks,
    }


@router.get("/activity")
async def get_recent_activity(limit: int = 20):
    return await TaskService.get_recent_activity(limit=limit)


@router.get("/top-agents")
async def get_top_agents(limit: int = 5):
    return await TaskService.get_top_agents(limit=limit)
