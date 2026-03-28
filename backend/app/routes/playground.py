"""
Route: /api/playground — Agent chat playground.
Allows users to test-drive an agent with a simple chat interface.
Uses the unified LLM Provider for multi-model support.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.config import get_settings
from app.services.agent_service import AgentService
from app.services.llm_provider import get_llm_provider, AVAILABLE_MODELS
from app.tools.registry import tool_registry
from app.database import get_db

router = APIRouter(prefix="/playground", tags=["Playground"])
settings = get_settings()


class ChatMessage(BaseModel):
    role: str
    content: str


class PlaygroundRequest(BaseModel):
    agentId: str
    messages: list[ChatMessage]
    model: Optional[str] = None  # Optional model override for playground


@router.post("/chat")
async def chat(req: PlaygroundRequest):
    agent = await AgentService.get_agent(req.agentId)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    llm = get_llm_provider()

    # Determine model: request override > agent setting > global default
    model = req.model or getattr(agent, "model", None) or settings.LLM_MODEL or settings.OPENAI_MODEL
    provider = getattr(agent, "provider", None)

    # Build tool definitions for this agent
    tools = []
    if agent.allowedTools:
        tools = tool_registry.get_openai_tools(agent.allowedTools)

    messages = [{"role": "system", "content": agent.systemPrompt}]
    for m in req.messages:
        messages.append({"role": m.role, "content": m.content})

    try:
        response = await llm.chat(
            model=model,
            messages=messages,
            tools=tools if tools else None,
            temperature=0.7,
            max_tokens=2048,
            provider=provider,
        )

        # Convert tool calls
        tool_results = []
        if response.message.tool_calls:
            for tc in response.message.tool_calls:
                tool_results.append({
                    "name": tc.name,
                    "arguments": tc.arguments,
                    "id": tc.id,
                })

        return {
            "role": "assistant",
            "content": response.message.content or "",
            "toolCalls": tool_results,
            "model": model,
            "usage": response.usage,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def list_models():
    """List all available LLM models for the playground."""
    # Check which providers have API keys configured
    available = []
    for m in AVAILABLE_MODELS:
        provider = m["provider"]
        has_key = False
        if provider == "openai" and settings.OPENAI_API_KEY:
            has_key = True
        elif provider == "anthropic" and settings.ANTHROPIC_API_KEY:
            has_key = True
        elif provider == "groq" and settings.GROQ_API_KEY:
            has_key = True
        elif provider == "together" and settings.TOGETHER_API_KEY:
            has_key = True
        available.append({**m, "available": has_key})
    return available
