"""
Route: /api/playground — Agent chat playground.
Allows users to test-drive an agent with a simple chat interface.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from openai import AsyncOpenAI

from app.config import get_settings
from app.services.agent_service import AgentService
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


@router.post("/chat")
async def chat(req: PlaygroundRequest):
    agent = await AgentService.get_agent(req.agentId)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    api_key = (settings.OPENAI_API_KEY or "").strip()
    if not api_key or api_key == "sk-your-openai-api-key-here":
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    client = AsyncOpenAI(api_key=api_key)

    # Build tool definitions for this agent
    tools_defs = []
    for tool_name in agent.allowedTools:
        tool_meta = tool_registry.get_tool(tool_name)
        if tool_meta:
            tools_defs.append({
                "type": "function",
                "function": {
                    "name": tool_meta["name"],
                    "description": tool_meta["description"],
                    "parameters": tool_meta.get("parameters", {"type": "object", "properties": {}}),
                },
            })

    messages = [{"role": "system", "content": agent.systemPrompt}]
    for m in req.messages:
        messages.append({"role": m.role, "content": m.content})

    kwargs = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 2048,
    }
    if tools_defs:
        kwargs["tools"] = tools_defs

    try:
        response = await client.chat.completions.create(**kwargs)
        choice = response.choices[0]

        # If a tool call is requested, simulate tool execution
        if choice.message.tool_calls:
            tool_results = []
            for tc in choice.message.tool_calls:
                tool_results.append({
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                    "id": tc.id,
                })
            return {
                "role": "assistant",
                "content": choice.message.content or "",
                "toolCalls": tool_results,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                    "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                    "total_tokens": response.usage.total_tokens if response.usage else 0,
                },
            }

        return {
            "role": "assistant",
            "content": choice.message.content or "",
            "toolCalls": [],
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
