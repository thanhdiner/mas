"""
LLM Provider — unified interface for multiple AI model providers.

Supports:
  - OpenAI (GPT-4o, GPT-4o-mini, etc.)
  - Anthropic (Claude 3.5 Sonnet, Claude 3 Opus, etc.)
  - Groq (Llama 3, Mixtral, etc.)
  - Together AI (open-source models)

Each provider normalizes responses to a common format compatible
with OpenAI's function-calling interface.
"""

import json
import logging
from typing import Any, Optional
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger("llm_provider")


class LLMProviderType(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GROQ = "groq"
    TOGETHER = "together"


@dataclass
class ToolCall:
    """Normalized tool call across providers."""
    id: str
    name: str
    arguments: str  # JSON string


@dataclass
class LLMMessage:
    """Normalized LLM response message."""
    content: Optional[str] = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    finish_reason: str = "stop"


@dataclass
class LLMResponse:
    """Normalized LLM response."""
    message: LLMMessage = field(default_factory=LLMMessage)
    usage: dict[str, int] = field(default_factory=lambda: {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
    })


def _resolve_provider(model: str) -> LLMProviderType:
    """Infer provider from model name if not explicitly set."""
    model_lower = model.lower()
    if model_lower.startswith(("gpt-", "o1", "o3", "o4")):
        return LLMProviderType.OPENAI
    if model_lower.startswith(("claude",)):
        return LLMProviderType.ANTHROPIC
    if model_lower.startswith(("llama", "mixtral", "gemma", "grok")):
        return LLMProviderType.GROQ
    # Default to OpenAI  
    return LLMProviderType.OPENAI


class LLMProvider:
    """
    Unified LLM provider that routes requests to the correct backend.
    
    Usage:
        provider = LLMProvider(settings)
        response = await provider.chat(
            model="gpt-4o-mini",
            messages=[...],
            tools=[...],
        )
    """

    def __init__(self, settings):
        self._settings = settings
        self._clients: dict[LLMProviderType, Any] = {}

    def _get_openai_client(self):
        if LLMProviderType.OPENAI not in self._clients:
            from openai import AsyncOpenAI
            api_key = (self._settings.OPENAI_API_KEY or "").strip()
            if not api_key or api_key == "sk-your-openai-api-key-here":
                raise RuntimeError("OPENAI_API_KEY is not configured")
            self._clients[LLMProviderType.OPENAI] = AsyncOpenAI(api_key=api_key)
        return self._clients[LLMProviderType.OPENAI]

    def _get_anthropic_client(self):
        if LLMProviderType.ANTHROPIC not in self._clients:
            try:
                from anthropic import AsyncAnthropic
            except ImportError:
                raise RuntimeError(
                    "anthropic package not installed. Run: pip install anthropic"
                )
            api_key = (self._settings.ANTHROPIC_API_KEY or "").strip()
            if not api_key:
                raise RuntimeError("ANTHROPIC_API_KEY is not configured")
            self._clients[LLMProviderType.ANTHROPIC] = AsyncAnthropic(api_key=api_key)
        return self._clients[LLMProviderType.ANTHROPIC]

    def _get_groq_client(self):
        if LLMProviderType.GROQ not in self._clients:
            try:
                from groq import AsyncGroq
            except ImportError:
                raise RuntimeError(
                    "groq package not installed. Run: pip install groq"
                )
            api_key = (self._settings.GROQ_API_KEY or "").strip()
            if not api_key:
                raise RuntimeError("GROQ_API_KEY is not configured")
            self._clients[LLMProviderType.GROQ] = AsyncGroq(api_key=api_key)
        return self._clients[LLMProviderType.GROQ]

    def _get_together_client(self):
        """Together AI uses an OpenAI-compatible API."""
        if LLMProviderType.TOGETHER not in self._clients:
            from openai import AsyncOpenAI
            api_key = (self._settings.TOGETHER_API_KEY or "").strip()
            if not api_key:
                raise RuntimeError("TOGETHER_API_KEY is not configured")
            self._clients[LLMProviderType.TOGETHER] = AsyncOpenAI(
                api_key=api_key,
                base_url="https://api.together.xyz/v1",
            )
        return self._clients[LLMProviderType.TOGETHER]

    async def chat(
        self,
        model: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        provider: Optional[str] = None,
    ) -> LLMResponse:
        """
        Send a chat completion request to the appropriate provider.
        
        Args:
            model: Model name (e.g., "gpt-4o-mini", "claude-3-5-sonnet-20241022")
            messages: Chat messages in OpenAI format
            tools: Tool definitions in OpenAI format
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            provider: Explicit provider override (otherwise inferred from model)
        """
        if provider:
            provider_type = LLMProviderType(provider)
        else:
            provider_type = _resolve_provider(model)

        logger.info(f"LLM request: provider={provider_type.value} model={model}")

        if provider_type == LLMProviderType.OPENAI:
            return await self._chat_openai(model, messages, tools, temperature, max_tokens)
        elif provider_type == LLMProviderType.ANTHROPIC:
            return await self._chat_anthropic(model, messages, tools, temperature, max_tokens)
        elif provider_type == LLMProviderType.GROQ:
            return await self._chat_groq(model, messages, tools, temperature, max_tokens)
        elif provider_type == LLMProviderType.TOGETHER:
            return await self._chat_together(model, messages, tools, temperature, max_tokens)
        else:
            raise ValueError(f"Unsupported provider: {provider_type}")

    # ─── OpenAI ──────────────────────────────────────────────────────────

    async def _chat_openai(
        self, model: str, messages: list[dict],
        tools: list[dict] | None, temperature: float, max_tokens: int,
    ) -> LLMResponse:
        client = self._get_openai_client()
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        response = await client.chat.completions.create(**kwargs)
        choice = response.choices[0]

        tool_calls = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                tool_calls.append(ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    arguments=tc.function.arguments,
                ))

        return LLMResponse(
            message=LLMMessage(
                content=choice.message.content,
                tool_calls=tool_calls,
                finish_reason=choice.finish_reason or "stop",
            ),
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
        )

    # ─── Anthropic ───────────────────────────────────────────────────────

    def _convert_tools_to_anthropic(self, tools: list[dict]) -> list[dict]:
        """Convert OpenAI tool format to Anthropic tool format."""
        anthropic_tools = []
        for tool in tools:
            if tool.get("type") == "function":
                fn = tool["function"]
                anthropic_tools.append({
                    "name": fn["name"],
                    "description": fn.get("description", ""),
                    "input_schema": fn.get("parameters", {"type": "object", "properties": {}}),
                })
        return anthropic_tools

    def _convert_messages_for_anthropic(self, messages: list[dict]) -> tuple[str, list[dict]]:
        """
        Anthropic uses a separate system parameter.
        Extract system message and convert tool messages.
        """
        system_prompt = ""
        anthropic_messages = []

        for msg in messages:
            if msg["role"] == "system":
                system_prompt += msg["content"] + "\n"
            elif msg["role"] == "tool":
                # Anthropic uses tool_result blocks inside user messages
                anthropic_messages.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": msg.get("tool_call_id", ""),
                        "content": msg.get("content", ""),
                    }],
                })
            elif msg["role"] == "assistant" and "tool_calls" in msg:
                # Convert assistant tool_calls to Anthropic format
                content = []
                if msg.get("content"):
                    content.append({"type": "text", "text": msg["content"]})
                for tc in msg["tool_calls"]:
                    try:
                        input_data = json.loads(tc["function"]["arguments"])
                    except (json.JSONDecodeError, KeyError):
                        input_data = {}
                    content.append({
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": tc["function"]["name"],
                        "input": input_data,
                    })
                anthropic_messages.append({"role": "assistant", "content": content})
            else:
                anthropic_messages.append({
                    "role": msg["role"],
                    "content": msg.get("content", ""),
                })

        return system_prompt.strip(), anthropic_messages

    async def _chat_anthropic(
        self, model: str, messages: list[dict],
        tools: list[dict] | None, temperature: float, max_tokens: int,
    ) -> LLMResponse:
        client = self._get_anthropic_client()
        system_prompt, anthropic_messages = self._convert_messages_for_anthropic(messages)

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": anthropic_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system_prompt:
            kwargs["system"] = system_prompt
        if tools:
            kwargs["tools"] = self._convert_tools_to_anthropic(tools)

        response = await client.messages.create(**kwargs)

        # Parse Anthropic response
        content_text = ""
        tool_calls = []
        for block in response.content:
            if block.type == "text":
                content_text += block.text
            elif block.type == "tool_use":
                tool_calls.append(ToolCall(
                    id=block.id,
                    name=block.name,
                    arguments=json.dumps(block.input),
                ))

        return LLMResponse(
            message=LLMMessage(
                content=content_text or None,
                tool_calls=tool_calls,
                finish_reason="tool_use" if tool_calls else "stop",
            ),
            usage={
                "prompt_tokens": response.usage.input_tokens if response.usage else 0,
                "completion_tokens": response.usage.output_tokens if response.usage else 0,
                "total_tokens": (
                    (response.usage.input_tokens + response.usage.output_tokens)
                    if response.usage else 0
                ),
            },
        )

    # ─── Groq ────────────────────────────────────────────────────────────

    async def _chat_groq(
        self, model: str, messages: list[dict],
        tools: list[dict] | None, temperature: float, max_tokens: int,
    ) -> LLMResponse:
        """Groq uses OpenAI-compatible API."""
        client = self._get_groq_client()
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        response = await client.chat.completions.create(**kwargs)
        choice = response.choices[0]

        tool_calls = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                tool_calls.append(ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    arguments=tc.function.arguments,
                ))

        return LLMResponse(
            message=LLMMessage(
                content=choice.message.content,
                tool_calls=tool_calls,
                finish_reason=choice.finish_reason or "stop",
            ),
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
        )

    # ─── Together AI ─────────────────────────────────────────────────────

    async def _chat_together(
        self, model: str, messages: list[dict],
        tools: list[dict] | None, temperature: float, max_tokens: int,
    ) -> LLMResponse:
        """Together AI uses OpenAI-compatible API."""
        client = self._get_together_client()
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        response = await client.chat.completions.create(**kwargs)
        choice = response.choices[0]

        tool_calls = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                tool_calls.append(ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    arguments=tc.function.arguments,
                ))

        return LLMResponse(
            message=LLMMessage(
                content=choice.message.content,
                tool_calls=tool_calls,
                finish_reason=choice.finish_reason or "stop",
            ),
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
        )


# ─── Available Models Catalog ────────────────────────────────────────────

AVAILABLE_MODELS = [
    # OpenAI
    {"id": "gpt-5.4-mini", "name": "GPT-5.4 Mini", "provider": "openai", "description": "Fast & affordable. Best for most tasks."},
    {"id": "gpt-5.4", "name": "GPT-5.4", "provider": "openai", "description": "Most capable OpenAI model."},
    {"id": "gpt-5.4-nano", "name": "GPT-5.4 Nano", "provider": "openai", "description": "Latest ultra-compact model suitable for edge or simple routing."},
    {"id": "o4-preview", "name": "O4 Preview", "provider": "openai", "description": "Latest reasoning frontier model."},
    # Anthropic
    {"id": "claude-4.6-sonnet-20260215", "name": "Claude Sonnet 4.6", "provider": "anthropic", "description": "Excellent at coding and complex reasoning."},
    {"id": "claude-4.6-opus-20260301", "name": "Claude Opus 4.6", "provider": "anthropic", "description": "Anthropic's most powerful frontier model."},
    {"id": "claude-4.5-haiku-20251101", "name": "Claude 4.5 Haiku", "provider": "anthropic", "description": "Fast and cost-effective."},
    # Groq (xAI & Fast Inference)
    {"id": "grok-4.20", "name": "Grok 4.20", "provider": "groq", "description": "xAI's latest model with maximum wit."},
    {"id": "grok-4.1-fast", "name": "Grok 4.1 Fast", "provider": "groq", "description": "Fast inference version of Grok 4.1."},
    {"id": "grok-code", "name": "Grok Code", "provider": "groq", "description": "xAI's optimized coding model."},
    # Together AI (Open Source)
    {"id": "meta-llama/Llama-4-Scout", "name": "Llama 4 Scout", "provider": "together", "description": "Llama 4 base model."},
    {"id": "meta-llama/Llama-4-Maverick", "name": "Llama 4 Maverick", "provider": "together", "description": "Llama 4 agile coding model."},
    {"id": "deepseek-ai/DeepSeek-V4", "name": "DeepSeek V4", "provider": "together", "description": "The latest V4 offering from DeepSeek."},
]


# ─── Singleton ───────────────────────────────────────────────────────────

_llm_provider: Optional[LLMProvider] = None


def get_llm_provider() -> LLMProvider:
    """Get the singleton LLM provider."""
    global _llm_provider
    if _llm_provider is None:
        from app.config import get_settings
        _llm_provider = LLMProvider(get_settings())
    return _llm_provider
