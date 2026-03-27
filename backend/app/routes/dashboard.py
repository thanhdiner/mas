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


@router.get("/analytics")
async def get_analytics():
    """Get analytics data: task outcomes and daily task counts."""
    db = get_db()
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)

    # Task status breakdown
    pipeline_status = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_counts = {}
    async for doc in db.tasks.aggregate(pipeline_status):
        status_counts[doc["_id"]] = doc["count"]

    # Daily task counts for last 7 days
    pipeline_daily = [
        {"$match": {"createdAt": {"$gte": seven_days_ago}}},
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt"}
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    daily = []
    async for doc in db.tasks.aggregate(pipeline_daily):
        daily.append({"date": doc["_id"], "count": doc["count"]})

    # Fill in missing days
    daily_map = {d["date"]: d["count"] for d in daily}
    filled_daily = []
    for i in range(7):
        day = (seven_days_ago + timedelta(days=i)).strftime("%Y-%m-%d")
        filled_daily.append({"date": day, "count": daily_map.get(day, 0)})

    # Agent performance
    pipeline_agents = [
        {"$group": {
            "_id": "$assignedAgentId",
            "total": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
        }},
        {"$sort": {"total": -1}},
        {"$limit": 10},
    ]
    agent_perf = []
    async for doc in db.tasks.aggregate(pipeline_agents):
        agent_id = doc["_id"]
        agent = await db.agents.find_one({"_id": __import__("bson").ObjectId(agent_id)}) if agent_id else None
        agent_perf.append({
            "agentId": agent_id,
            "agentName": agent.get("name", "Unknown") if agent else "Unknown",
            "total": doc["total"],
            "completed": doc["completed"],
            "failed": doc["failed"],
            "successRate": round(doc["completed"] / doc["total"] * 100, 1) if doc["total"] > 0 else 0,
        })

    # Schedule stats
    total_schedules = await db.schedules.count_documents({})
    active_schedules = await db.schedules.count_documents({"isActive": True})

    return {
        "statusBreakdown": status_counts,
        "dailyTasks": filled_daily,
        "agentPerformance": agent_perf,
        "schedules": {
            "total": total_schedules,
            "active": active_schedules,
        },
    }
