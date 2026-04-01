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
    from app.services.system_settings_service import SystemSettingsService
    sys_llm = await SystemSettingsService.get_llm_settings()

    # Determine model: request override > agent setting > global default
    model = req.model or getattr(agent, "model", None) or sys_llm.get("default_model") or settings.LLM_MODEL or settings.OPENAI_MODEL
    provider = getattr(agent, "provider", None) or sys_llm.get("default_provider")

    # Build tool definitions for this agent
    tools = []
    if agent.allowedTools:
        tools = tool_registry.get_openai_tools(agent.allowedTools)

    messages = [{"role": "system", "content": agent.systemPrompt}]
    for m in req.messages:
        messages.append({"role": m.role, "content": m.content})

    import json

    step_count = 0
    max_steps = 5
    all_tool_calls_history = []
    total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    try:
        while step_count < max_steps:
            step_count += 1
            response = await llm.chat(
                model=model,
                messages=messages,
                tools=tools if tools else None,
                temperature=0.7,
                max_tokens=2048,
                provider=provider,
            )

            # Accumulate usage
            if response.usage:
                total_usage["prompt_tokens"] += response.usage.get("prompt_tokens", 0)
                total_usage["completion_tokens"] += response.usage.get("completion_tokens", 0)
                total_usage["total_tokens"] += response.usage.get("total_tokens", 0)

            if response.message.tool_calls:
                # Append assistant tool call request to history
                tool_calls_for_msg = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": tc.arguments,
                        },
                    }
                    for tc in response.message.tool_calls
                ]
                messages.append({
                    "role": "assistant",
                    "content": response.message.content or "",
                    "tool_calls": tool_calls_for_msg,
                })

                for tc in response.message.tool_calls:
                    fn_name = tc.name
                    all_tool_calls_history.append({
                        "name": tc.name,
                        "arguments": tc.arguments,
                        "id": tc.id,
                    })

                    try:
                        args = json.loads(tc.arguments or "{}")
                    except Exception:
                        args = {}

                    handler = tool_registry.get_handler(fn_name)
                    if handler is None:
                        tool_result = f"ERROR: Unknown tool '{fn_name}'."
                    else:
                        try:
                            # Apply tool config overrides from agent & global
                            from app.database import get_db
                            current_db = get_db()
                            global_cfg = await current_db.tool_settings.find_one({"name": fn_name}) if current_db else {}
                            global_settings = (global_cfg or {}).get("settings", {})
                            agent_tool_config = getattr(agent, "toolConfig", {}).get(fn_name, {})
                            combined_args = {**global_settings, **agent_tool_config, **args}

                            tool_result = await handler(**combined_args)
                        except Exception as exc:
                            tool_result = f"Error executing tool: {exc}"

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tool_result or "Tool completed but returned no result.",
                    })
                continue

            # No more tool calls, return final response
            final_content = response.message.content or ""
            # If step limit reached but still wants to loop, force stop
            return {
                "role": "assistant",
                "content": final_content,
                "toolCalls": list({tc["id"]: tc for tc in all_tool_calls_history}.values()),  # Unique
                "model": model,
                "usage": total_usage,
            }

        # Fallback if max steps reached
        return {
            "role": "assistant",
            "content": "⚠️ Exceeded maximum steps in Playground loop.",
            "toolCalls": all_tool_calls_history,
            "model": model,
            "usage": total_usage,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def list_models():
    """List all available LLM models for the playground."""
    # Check which providers have API keys configured (DB or .env)
    from app.services.system_settings_service import get_effective_api_key

    provider_keys = {}
    for provider in ["openai", "anthropic", "gemini", "deepseek", "groq", "together"]:
        try:
            key = await get_effective_api_key(provider)
            provider_keys[provider] = bool(key)
        except Exception:
            # Fallback to .env only
            env_map = {
                "openai": settings.OPENAI_API_KEY,
                "anthropic": settings.ANTHROPIC_API_KEY,
                "gemini": settings.GEMINI_API_KEY,
                "deepseek": settings.DEEPSEEK_API_KEY,
                "groq": settings.GROQ_API_KEY,
                "together": settings.TOGETHER_API_KEY,
            }
            provider_keys[provider] = bool(env_map.get(provider, ""))

    available = []
    for m in AVAILABLE_MODELS:
        has_key = provider_keys.get(m["provider"], False)
        available.append({**m, "available": has_key})
    return available
