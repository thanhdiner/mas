from fastapi import APIRouter, Query

from app.errors import NotFoundError
from app.models.agent import AgentCreate, AgentResponse, AgentUpdate
from app.services.agent_service import AgentService
from app.utils.object_id import validate_object_id, validate_object_id_list

router = APIRouter(prefix="/agents", tags=["Agents"])


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    active_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    return await AgentService.list_agents(active_only=active_only, skip=skip, limit=limit)


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str):
    validate_object_id(agent_id, "agent_id")
    agent = await AgentService.get_agent(agent_id)
    if not agent:
        raise NotFoundError("agent_not_found", "Agent not found")
    return agent


@router.post("", response_model=AgentResponse, status_code=201)
async def create_agent(data: AgentCreate):
    validate_object_id_list(data.allowedSubAgents, "allowedSubAgents")
    return await AgentService.create_agent(data)


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, data: AgentUpdate):
    validate_object_id(agent_id, "agent_id")
    validate_object_id_list(data.allowedSubAgents, "allowedSubAgents")
    agent = await AgentService.update_agent(agent_id, data)
    if not agent:
        raise NotFoundError("agent_not_found", "Agent not found")
    return agent


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    validate_object_id(agent_id, "agent_id")
    deleted = await AgentService.delete_agent(agent_id)
    if not deleted:
        raise NotFoundError("agent_not_found", "Agent not found")
    return {"message": "Agent deleted"}
