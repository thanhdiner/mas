"""
Scheduler Service — manages APScheduler lifecycle and trigger CRUD.

Uses an in-memory scheduler with MongoDB as the persistence layer for
schedule metadata. When a job fires, it creates a Task and runs the
Orchestrator against the assigned agent.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from bson import ObjectId

from app.database import get_db

logger = logging.getLogger("scheduler")

scheduler: Optional[AsyncIOScheduler] = None


def get_scheduler() -> AsyncIOScheduler:
    global scheduler
    if scheduler is None:
        scheduler = AsyncIOScheduler(timezone="UTC")
    return scheduler


async def start_scheduler():
    """Start the scheduler and restore persisted schedules from MongoDB."""
    sched = get_scheduler()
    if sched.running:
        return

    sched.start()
    logger.info("APScheduler started")

    # Restore active schedules from DB
    db = get_db()
    if db is None:
        return

    cursor = db.schedules.find({"isActive": True})
    restored = 0
    async for doc in cursor:
        try:
            _add_job_from_doc(sched, doc)
            restored += 1
        except Exception as exc:
            logger.warning(f"Failed to restore schedule {doc.get('name')}: {exc}")

    logger.info(f"Restored {restored} active schedule(s)")


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
    scheduler = None


# ─── Job lifecycle helpers ───────────────────────────────────────────

def _make_job_id(schedule_id: str) -> str:
    return f"schedule_{schedule_id}"


def _add_job_from_doc(sched: AsyncIOScheduler, doc: dict):
    """Add an APScheduler job based on a MongoDB schedule document."""
    schedule_id = str(doc["_id"])
    job_id = _make_job_id(schedule_id)
    schedule_type = doc.get("scheduleType", "cron")
    tz = doc.get("timezone", "Asia/Ho_Chi_Minh")

    if schedule_type == "cron" and doc.get("cronExpression"):
        parts = doc["cronExpression"].strip().split()
        if len(parts) == 5:
            trigger = CronTrigger(
                minute=parts[0], hour=parts[1],
                day=parts[2], month=parts[3],
                day_of_week=parts[4],
                timezone=tz,
            )
        else:
            trigger = CronTrigger.from_crontab(doc["cronExpression"], timezone=tz)
    elif schedule_type == "interval" and doc.get("intervalSeconds"):
        trigger = IntervalTrigger(seconds=doc["intervalSeconds"])
    elif schedule_type == "once" and doc.get("runAt"):
        trigger = DateTrigger(run_date=doc["runAt"], timezone=tz)
    else:
        logger.warning(f"Schedule {schedule_id} has invalid config, skipping")
        return

    sched.add_job(
        _execute_schedule,
        trigger=trigger,
        id=job_id,
        name=doc.get("name", schedule_id),
        kwargs={"schedule_id": schedule_id},
        replace_existing=True,
    )


async def _execute_schedule(schedule_id: str):
    """Callback fired by APScheduler — creates a Task and runs the Orchestrator."""
    db = get_db()
    if db is None:
        logger.error("DB not available for scheduled execution")
        return

    doc = await db.schedules.find_one({"_id": ObjectId(schedule_id)})
    if not doc or not doc.get("isActive"):
        return

    agent_id = doc["agentId"]
    prompt = doc["promptPayload"]
    name = doc.get("name", "Scheduled Task")

    # Create a task
    now = datetime.now(timezone.utc)
    task_doc = {
        "title": f"[Scheduled] {name}",
        "input": prompt,
        "status": "pending",
        "assignedAgentId": agent_id,
        "parentTaskId": None,
        "createdBy": "scheduler",
        "allowDelegation": True,
        "requiresApproval": False,
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db.tasks.insert_one(task_doc)
    task_id = str(result.inserted_id)

    # Update schedule stats
    await db.schedules.update_one(
        {"_id": ObjectId(schedule_id)},
        {"$set": {"lastRunAt": now}, "$inc": {"totalRuns": 1}},
    )

    logger.info(f"Schedule '{name}' fired → Task {task_id} for Agent {agent_id}")

    # Run the orchestrator in background
    try:
        from app.services.orchestrator import Orchestrator
        orchestrator = Orchestrator()
        asyncio.create_task(orchestrator.execute_task(task_id))
    except Exception as exc:
        logger.error(f"Orchestrator launch failed for schedule {schedule_id}: {exc}")


# ─── CRUD helpers (called by the route layer) ────────────────────────

async def create_schedule(data: dict) -> dict:
    db = get_db()
    now = datetime.now(timezone.utc)
    data["totalRuns"] = 0
    data["lastRunAt"] = None
    data["createdAt"] = now
    data["updatedAt"] = now

    result = await db.schedules.insert_one(data)
    doc = await db.schedules.find_one({"_id": result.inserted_id})

    if data.get("isActive", True):
        sched = get_scheduler()
        if sched.running:
            _add_job_from_doc(sched, doc)

    return doc


async def update_schedule(schedule_id: str, data: dict) -> Optional[dict]:
    db = get_db()
    data["updatedAt"] = datetime.now(timezone.utc)

    await db.schedules.update_one(
        {"_id": ObjectId(schedule_id)},
        {"$set": data},
    )

    doc = await db.schedules.find_one({"_id": ObjectId(schedule_id)})
    if doc is None:
        return None

    sched = get_scheduler()
    job_id = _make_job_id(schedule_id)

    # Remove old job
    if sched.running:
        try:
            sched.remove_job(job_id)
        except Exception:
            pass

    # Re-add if active
    if doc.get("isActive"):
        if sched.running:
            _add_job_from_doc(sched, doc)

    return doc


async def delete_schedule(schedule_id: str) -> bool:
    db = get_db()
    result = await db.schedules.delete_one({"_id": ObjectId(schedule_id)})

    sched = get_scheduler()
    job_id = _make_job_id(schedule_id)
    if sched.running:
        try:
            sched.remove_job(job_id)
        except Exception:
            pass

    return result.deleted_count > 0


async def toggle_schedule(schedule_id: str, is_active: bool) -> Optional[dict]:
    return await update_schedule(schedule_id, {"isActive": is_active})


async def list_schedules() -> list[dict]:
    db = get_db()
    cursor = db.schedules.find({}).sort("createdAt", -1)
    docs = []
    async for doc in cursor:
        # Enrich with agent name
        agent = await db.agents.find_one({"_id": ObjectId(doc["agentId"])}) if doc.get("agentId") else None
        doc["agentName"] = agent.get("name", "Unknown") if agent else "Unknown"

        # Get next run time from APScheduler
        sched = get_scheduler()
        job_id = _make_job_id(str(doc["_id"]))
        try:
            job = sched.get_job(job_id) if sched.running else None
            doc["nextRunAt"] = job.next_run_time if job else None
        except Exception:
            doc["nextRunAt"] = None

        docs.append(doc)
    return docs


async def get_schedule(schedule_id: str) -> Optional[dict]:
    db = get_db()
    doc = await db.schedules.find_one({"_id": ObjectId(schedule_id)})
    if doc:
        agent = await db.agents.find_one({"_id": ObjectId(doc["agentId"])}) if doc.get("agentId") else None
        doc["agentName"] = agent.get("name", "Unknown") if agent else "Unknown"
    return doc
