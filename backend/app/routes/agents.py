from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.models.agent import AgentCreate, AgentUpdate, AgentResponse
from app.services.agent_service import AgentService

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
    agent = await AgentService.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.post("", response_model=AgentResponse, status_code=201)
async def create_agent(data: AgentCreate):
    existing = await AgentService.get_agent_by_name(data.name)
    if existing:
        raise HTTPException(status_code=409, detail="Agent with this name already exists")
    return await AgentService.create_agent(data)


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, data: AgentUpdate):
    agent = await AgentService.update_agent(agent_id, data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    deleted = await AgentService.delete_agent(agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"message": "Agent deleted"}
