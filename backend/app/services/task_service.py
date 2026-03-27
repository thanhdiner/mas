from datetime import datetime, timezone
from typing import Optional

from app.database import get_db
from app.models.task import (
    SubtaskInfo,
    TaskCreate,
    TaskDetailResponse,
    TaskResponse,
    TaskStatus,
    TaskUpdate,
)
from app.utils.object_id import to_object_id, try_to_object_id


def _doc_to_response(doc: dict) -> TaskResponse:
    return TaskResponse(
        id=str(doc["_id"]),
        title=doc["title"],
        input=doc["input"],
        status=doc.get("status", TaskStatus.QUEUED),
        assignedAgentId=doc["assignedAgentId"],
        parentTaskId=doc.get("parentTaskId"),
        createdBy=doc.get("createdBy", "user"),
        allowDelegation=doc.get("allowDelegation", True),
        requiresApproval=doc.get("requiresApproval", False),
        result=doc.get("result"),
        error=doc.get("error"),
        createdAt=doc.get("createdAt", datetime.now(timezone.utc)),
        updatedAt=doc.get("updatedAt"),
    )


class TaskService:
    @staticmethod
    async def list_tasks(
        status: Optional[TaskStatus] = None,
        agent_id: Optional[str] = None,
        parent_only: bool = False,
        skip: int = 0,
        limit: int = 50,
    ) -> list[TaskResponse]:
        db = get_db()
        query = {}
        if status:
            query["status"] = status.value
        if agent_id:
            query["assignedAgentId"] = agent_id
        if parent_only:
            query["parentTaskId"] = None

        cursor = db.tasks.find(query).skip(skip).limit(limit).sort("createdAt", -1)
        docs = await cursor.to_list(length=limit)
        return [_doc_to_response(d) for d in docs]

    @staticmethod
    async def get_task(task_id: str) -> Optional[TaskResponse]:
        db = get_db()
        doc = await db.tasks.find_one({"_id": to_object_id(task_id, "task_id")})
        if not doc:
            return None
        return _doc_to_response(doc)

    @staticmethod
    async def get_task_detail(task_id: str) -> Optional[TaskDetailResponse]:
        db = get_db()
        doc = await db.tasks.find_one({"_id": to_object_id(task_id, "task_id")})
        if not doc:
            return None

        base = _doc_to_response(doc)

        # Bad legacy data should not break task detail responses.
        agent_name = None
        agent_object_id = try_to_object_id(doc.get("assignedAgentId"))
        if agent_object_id is not None:
            agent_doc = await db.agents.find_one({"_id": agent_object_id})
            if agent_doc is not None:
                agent_name = agent_doc["name"]

        subtask_cursor = db.tasks.find({"parentTaskId": task_id})
        subtask_docs = await subtask_cursor.to_list(length=100)
        subtasks = []
        for subtask_doc in subtask_docs:
            subtask_agent_name = None
            subtask_agent_object_id = try_to_object_id(
                subtask_doc.get("assignedAgentId")
            )
            if subtask_agent_object_id is not None:
                subtask_agent_doc = await db.agents.find_one(
                    {"_id": subtask_agent_object_id}
                )
                if subtask_agent_doc is not None:
                    subtask_agent_name = subtask_agent_doc["name"]

            subtasks.append(
                SubtaskInfo(
                    id=str(subtask_doc["_id"]),
                    title=subtask_doc["title"],
                    status=subtask_doc.get("status", TaskStatus.QUEUED),
                    assignedAgentId=subtask_doc["assignedAgentId"],
                    agentName=subtask_agent_name,
                )
            )

        exec_doc = await db.executions.find_one(
            {"taskId": task_id},
            sort=[("startedAt", -1)],
        )
        execution = None
        if exec_doc:
            execution = {
                "id": str(exec_doc["_id"]),
                "taskId": exec_doc["taskId"],
                "agentId": exec_doc["agentId"],
                "status": exec_doc["status"],
                "startedAt": exec_doc["startedAt"].isoformat(),
                "endedAt": (
                    exec_doc["endedAt"].isoformat()
                    if exec_doc.get("endedAt")
                    else None
                ),
            }

        return TaskDetailResponse(
            **base.model_dump(),
            agentName=agent_name,
            subtasks=subtasks,
            execution=execution,
        )

    @staticmethod
    async def create_task(data: TaskCreate) -> TaskResponse:
        db = get_db()
        now = datetime.now(timezone.utc)
        doc = {
            **data.model_dump(),
            "status": TaskStatus.QUEUED.value,
            "result": None,
            "error": None,
            "createdAt": now,
            "updatedAt": None,
        }
        result = await db.tasks.insert_one(doc)
        doc["_id"] = result.inserted_id
        return _doc_to_response(doc)

    @staticmethod
    async def update_task(task_id: str, data: TaskUpdate) -> Optional[TaskResponse]:
        db = get_db()
        update_data = {
            key: value for key, value in data.model_dump().items() if value is not None
        }
        if not update_data:
            return await TaskService.get_task(task_id)

        if "status" in update_data:
            update_data["status"] = update_data["status"].value

        update_data["updatedAt"] = datetime.now(timezone.utc)
        await db.tasks.update_one(
            {"_id": to_object_id(task_id, "task_id")},
            {"$set": update_data},
        )
        return await TaskService.get_task(task_id)

    @staticmethod
    async def update_task_status(
        task_id: str,
        status: TaskStatus,
        result: Optional[str] = None,
        error: Optional[str] = None,
    ) -> Optional[TaskResponse]:
        db = get_db()
        update = {
            "status": status.value,
            "updatedAt": datetime.now(timezone.utc),
        }
        if result is not None:
            update["result"] = result
        if error is not None:
            update["error"] = error

        await db.tasks.update_one(
            {"_id": to_object_id(task_id, "task_id")},
            {"$set": update},
        )
        return await TaskService.get_task(task_id)

    @staticmethod
    async def count_tasks(status: Optional[TaskStatus] = None) -> int:
        db = get_db()
        query = {"status": status.value} if status else {}
        return await db.tasks.count_documents(query)

    @staticmethod
    async def count_failed_today() -> int:
        db = get_db()
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return await db.tasks.count_documents(
            {
                "status": TaskStatus.FAILED.value,
                "updatedAt": {"$gte": today_start},
            }
        )

    @staticmethod
    async def get_recent_activity(limit: int = 20) -> list[dict]:
        db = get_db()
        pipeline = [
            {"$sort": {"createdAt": -1}},
            {"$limit": limit},
            {
                "$lookup": {
                    "from": "agents",
                    "let": {
                        "agentId": {
                            "$convert": {
                                "input": "$assignedAgentId",
                                "to": "objectId",
                                "onError": None,
                                "onNull": None,
                            }
                        }
                    },
                    "pipeline": [
                        {"$match": {"$expr": {"$eq": ["$_id", "$$agentId"]}}}
                    ],
                    "as": "agent",
                }
            },
            {"$unwind": {"path": "$agent", "preserveNullAndEmptyArrays": True}},
            {
                "$project": {
                    "_id": 0,
                    "id": {"$toString": "$_id"},
                    "title": 1,
                    "status": 1,
                    "agentName": "$agent.name",
                    "createdAt": 1,
                }
            },
        ]
        return await db.tasks.aggregate(pipeline).to_list(length=limit)

    @staticmethod
    async def get_top_agents(limit: int = 5) -> list[dict]:
        db = get_db()
        pipeline = [
            {"$group": {"_id": "$assignedAgentId", "taskCount": {"$sum": 1}}},
            {"$sort": {"taskCount": -1}},
            {"$limit": limit},
            {
                "$lookup": {
                    "from": "agents",
                    "let": {
                        "agentId": {
                            "$convert": {
                                "input": "$_id",
                                "to": "objectId",
                                "onError": None,
                                "onNull": None,
                            }
                        }
                    },
                    "pipeline": [
                        {"$match": {"$expr": {"$eq": ["$_id", "$$agentId"]}}}
                    ],
                    "as": "agent",
                }
            },
            {"$unwind": {"path": "$agent", "preserveNullAndEmptyArrays": True}},
            {
                "$project": {
                    "_id": 0,
                    "agentId": "$_id",
                    "agentName": "$agent.name",
                    "agentRole": "$agent.role",
                    "taskCount": 1,
                }
            },
        ]
        return await db.tasks.aggregate(pipeline).to_list(length=limit)
