from datetime import datetime, timezone
from typing import Optional

from pymongo.errors import DuplicateKeyError

from app.database import get_db
from app.errors import DuplicateAgentNameError
from app.models.agent import AgentCreate, AgentResponse, AgentUpdate
from app.utils.doc_parser import doc_to_model
from app.utils.object_id import to_object_id


def _doc_to_response(doc: dict) -> AgentResponse:
    return doc_to_model(doc, AgentResponse)


class AgentService:
    @staticmethod
    async def list_agents(
        active_only: bool = False,
        skip: int = 0,
        limit: int = 50,
    ) -> list[AgentResponse]:
        db = get_db()
        query = {"active": True} if active_only else {}
        cursor = db.agents.find(query).skip(skip).limit(limit).sort("createdAt", -1)
        docs = await cursor.to_list(length=limit)
        return [_doc_to_response(d) for d in docs]

    @staticmethod
    async def get_agent(agent_id: str) -> Optional[AgentResponse]:
        db = get_db()
        doc = await db.agents.find_one({"_id": to_object_id(agent_id, "agent_id")})
        if not doc:
            return None
        return _doc_to_response(doc)

    @staticmethod
    async def get_agent_by_name(name: str) -> Optional[AgentResponse]:
        db = get_db()
        doc = await db.agents.find_one({"name": name})
        if not doc:
            return None
        return _doc_to_response(doc)

    @staticmethod
    async def create_agent(data: AgentCreate) -> AgentResponse:
        db = get_db()
        now = datetime.now(timezone.utc)
        doc = {
            **data.model_dump(),
            "createdAt": now,
            "updatedAt": None,
        }
        try:
            result = await db.agents.insert_one(doc)
        except DuplicateKeyError as exc:
            raise DuplicateAgentNameError(data.name) from exc
        doc["_id"] = result.inserted_id
        return _doc_to_response(doc)

    @staticmethod
    async def update_agent(agent_id: str, data: AgentUpdate) -> Optional[AgentResponse]:
        db = get_db()
        update_data = {
            key: value for key, value in data.model_dump().items() if value is not None
        }
        if not update_data:
            return await AgentService.get_agent(agent_id)

        update_data["updatedAt"] = datetime.now(timezone.utc)
        try:
            await db.agents.update_one(
                {"_id": to_object_id(agent_id, "agent_id")},
                {"$set": update_data},
            )
        except DuplicateKeyError as exc:
            raise DuplicateAgentNameError(update_data.get("name")) from exc
        return await AgentService.get_agent(agent_id)

    @staticmethod
    async def delete_agent(agent_id: str) -> bool:
        db = get_db()
        result = await db.agents.delete_one(
            {"_id": to_object_id(agent_id, "agent_id")}
        )
        return result.deleted_count > 0

    @staticmethod
    async def count_agents(active_only: bool = False) -> int:
        db = get_db()
        query = {"active": True} if active_only else {}
        return await db.agents.count_documents(query)
