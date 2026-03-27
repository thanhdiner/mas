from datetime import datetime, timezone
from typing import Any, Optional

from app.database import get_db
from app.models.execution import (
    ExecutionResponse,
    ExecutionStatus,
    ExecutionStepResponse,
    StepType,
)
from app.utils.object_id import to_object_id


class ExecutionService:
    @staticmethod
    async def create_execution(task_id: str, agent_id: str) -> ExecutionResponse:
        db = get_db()
        now = datetime.now(timezone.utc)
        doc = {
            "taskId": task_id,
            "agentId": agent_id,
            "status": ExecutionStatus.RUNNING.value,
            "startedAt": now,
            "endedAt": None,
        }
        result = await db.executions.insert_one(doc)
        doc["_id"] = result.inserted_id
        return ExecutionResponse(
            id=str(doc["_id"]),
            taskId=doc["taskId"],
            agentId=doc["agentId"],
            status=ExecutionStatus.RUNNING,
            startedAt=now,
        )

    @staticmethod
    async def get_execution(execution_id: str) -> Optional[ExecutionResponse]:
        db = get_db()
        doc = await db.executions.find_one(
            {"_id": to_object_id(execution_id, "execution_id")}
        )
        if not doc:
            return None
        return ExecutionResponse(
            id=str(doc["_id"]),
            taskId=doc["taskId"],
            agentId=doc["agentId"],
            status=doc["status"],
            startedAt=doc["startedAt"],
            endedAt=doc.get("endedAt"),
        )

    @staticmethod
    async def get_execution_by_task(task_id: str) -> Optional[ExecutionResponse]:
        db = get_db()
        doc = await db.executions.find_one(
            {"taskId": task_id},
            sort=[("startedAt", -1)],
        )
        if not doc:
            return None
        return ExecutionResponse(
            id=str(doc["_id"]),
            taskId=doc["taskId"],
            agentId=doc["agentId"],
            status=doc["status"],
            startedAt=doc["startedAt"],
            endedAt=doc.get("endedAt"),
        )

    @staticmethod
    async def complete_execution(
        execution_id: str,
        status: ExecutionStatus,
    ) -> Optional[ExecutionResponse]:
        db = get_db()
        now = datetime.now(timezone.utc)
        await db.executions.update_one(
            {"_id": to_object_id(execution_id, "execution_id")},
            {"$set": {"status": status.value, "endedAt": now}},
        )
        return await ExecutionService.get_execution(execution_id)

    @staticmethod
    async def add_step(
        execution_id: str,
        task_id: str,
        agent_id: str,
        step_type: StepType,
        content: str,
        meta: Optional[dict[str, Any]] = None,
    ) -> ExecutionStepResponse:
        db = get_db()
        now = datetime.now(timezone.utc)
        doc = {
            "executionId": execution_id,
            "taskId": task_id,
            "agentId": agent_id,
            "stepType": step_type.value,
            "content": content,
            "meta": meta or {},
            "createdAt": now,
        }
        result = await db.execution_steps.insert_one(doc)
        doc["_id"] = result.inserted_id
        return ExecutionStepResponse(
            id=str(doc["_id"]),
            executionId=doc["executionId"],
            taskId=doc["taskId"],
            agentId=doc["agentId"],
            stepType=step_type,
            content=doc["content"],
            meta=doc["meta"],
            createdAt=now,
        )

    @staticmethod
    async def get_steps(execution_id: str) -> list[ExecutionStepResponse]:
        db = get_db()
        cursor = db.execution_steps.find({"executionId": execution_id}).sort(
            "createdAt", 1
        )
        docs = await cursor.to_list(length=500)
        return [
            ExecutionStepResponse(
                id=str(doc["_id"]),
                executionId=doc["executionId"],
                taskId=doc["taskId"],
                agentId=doc["agentId"],
                stepType=doc["stepType"],
                content=doc["content"],
                meta=doc.get("meta", {}),
                createdAt=doc["createdAt"],
            )
            for doc in docs
        ]

    @staticmethod
    async def count_active() -> int:
        db = get_db()
        return await db.executions.count_documents(
            {"status": ExecutionStatus.RUNNING.value}
        )
