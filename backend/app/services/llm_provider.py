"""
LLM Provider — unified interface for multiple AI model providers via LiteLLM.

LiteLLM provides a single OpenAI-compatible API for 100+ providers.
This module wraps it to:
  - Resolve API keys from DB (web UI) → .env fallback
  - Normalise responses to our internal LLMResponse dataclass
  - Manage the available-models catalogue for the playground

Supports (via LiteLLM):
  - OpenAI, Anthropic, Google Gemini, Groq, Together AI, and many more.
"""

import logging
import os
import re
from typing import Any, Optional
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger("llm_provider")


def _try_recover_groq_tool_use_failed(error: Exception) -> Optional["LLMResponse"]:
    """
    Groq/Llama sometimes generates tool calls in XML format like:
        <function=gmail>{"action":"send_email",...}</function>
    instead of the proper JSON tool_call format. Groq rejects this with
    a 'tool_use_failed' error but includes the intended call in
    'failed_generation'. We parse it out and build a valid LLMResponse.
    """
    error_str = str(error)
    if "tool_use_failed" not in error_str or "failed_generation" not in error_str:
        return None

    try:
        # Extract the failed_generation content
        # Pattern: <function=TOOL_NAME>{...JSON...}</function>
        match = re.search(
            r'<function=(\w+)>\s*(\{.*?\})\s*</function>',
            error_str,
            re.DOTALL,
        )
        if not match:
            return None

        tool_name = match.group(1)
        import json
        tool_args = json.loads(match.group(2))

        logger.warning(
            f"Recovered tool call from Groq failed_generation: {tool_name}({list(tool_args.keys())})"
        )

        return LLMResponse(
            message=LLMMessage(
                content=None,
                tool_calls=[
                    ToolCall(
                        id=f"recovered_{tool_name}",
                        name=tool_name,
                        arguments=json.dumps(tool_args, ensure_ascii=False),
                    )
                ],
                finish_reason="tool_calls",
            ),
        )
    except Exception as parse_err:
        logger.warning(f"Failed to recover Groq tool_use_failed: {parse_err}")
        return None


class LLMProviderType(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    DEEPSEEK = "deepseek"
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
    if model_lower.startswith(("gpt-", "o1", "o3", "o4", "chatgpt")):
        return LLMProviderType.OPENAI
    if model_lower.startswith(("claude",)):
        return LLMProviderType.ANTHROPIC
    if model_lower.startswith(("gemini",)):
        return LLMProviderType.GEMINI
    if model_lower.startswith(("deepseek",)):
        return LLMProviderType.DEEPSEEK
    if model_lower.startswith(("llama", "mixtral", "gemma", "grok")):
        return LLMProviderType.GROQ
    # Default to OpenAI  
    return LLMProviderType.OPENAI


# ─── LiteLLM model prefix mapping ───────────────────────────────────────
# LiteLLM requires a provider prefix for non-OpenAI models.
# See https://docs.litellm.ai/docs/providers

_LITELLM_PREFIX: dict[LLMProviderType, str] = {
    LLMProviderType.OPENAI: "",             # No prefix needed
    LLMProviderType.ANTHROPIC: "",          # anthropic/ prefix handled by litellm auto-detect
    LLMProviderType.GEMINI: "gemini/",      # Google AI Studio
    LLMProviderType.DEEPSEEK: "deepseek/",  # DeepSeek API
    LLMProviderType.GROQ: "groq/",
    LLMProviderType.TOGETHER: "together_ai/",
}

# Map our provider name → LiteLLM env var name
_LITELLM_ENV_KEY: dict[str, str] = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "groq": "GROQ_API_KEY",
    "together": "TOGETHERAI_API_KEY",
}


class LLMProvider:
    """
    Unified LLM provider that uses LiteLLM under the hood.

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
        self._keys_injected = False

    async def _inject_api_keys(self):
        """
        Resolve API keys from DB/env and inject them as environment variables
        so LiteLLM can pick them up automatically.
        """
        if self._keys_injected:
            return

        try:
            from app.services.system_settings_service import get_effective_api_key

            for provider, env_var in _LITELLM_ENV_KEY.items():
                key = await get_effective_api_key(provider)
                if key:
                    os.environ[env_var] = key
        except Exception:
            # Fallback: inject from .env settings directly
            env_map = {
                "OPENAI_API_KEY": self._settings.OPENAI_API_KEY,
                "ANTHROPIC_API_KEY": self._settings.ANTHROPIC_API_KEY,
                "GEMINI_API_KEY": self._settings.GEMINI_API_KEY,
                "GROQ_API_KEY": self._settings.GROQ_API_KEY,
                "TOGETHERAI_API_KEY": self._settings.TOGETHER_API_KEY,
            }
            for env_var, value in env_map.items():
                if value:
                    os.environ[env_var] = value

        self._keys_injected = True

    def _clear_cache(self):
        """Clear cached state (called when settings change)."""
        self._keys_injected = False
        # Clear env vars so they get re-resolved
        for env_var in _LITELLM_ENV_KEY.values():
            os.environ.pop(env_var, None)

    def _get_litellm_model(self, model: str, provider_type: LLMProviderType) -> str:
        """
        Prepend the LiteLLM provider prefix if needed.
        e.g. "gemini-2.5-pro" → "gemini/gemini-2.5-pro"
        """
        prefix = _LITELLM_PREFIX.get(provider_type, "")
        if prefix and not model.startswith(prefix):
            return f"{prefix}{model}"
        return model

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
        Send a chat completion request via LiteLLM.

        Args:
            model: Model name (e.g., "gpt-4o-mini", "claude-3-5-sonnet-20241022")
            messages: Chat messages in OpenAI format
            tools: Tool definitions in OpenAI format
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            provider: Explicit provider override (otherwise inferred from model)
        """
        import litellm

        # Suppress LiteLLM's noisy logging
        litellm.suppress_debug_info = True

        # Ensure keys are injected
        await self._inject_api_keys()

        # Resolve provider
        if provider:
            provider_type = LLMProviderType(provider)
        else:
            provider_type = _resolve_provider(model)

        litellm_model = self._get_litellm_model(model, provider_type)

        logger.info(f"LLM request: provider={provider_type.value} model={litellm_model}")

        # Build kwargs
        kwargs: dict[str, Any] = {
            "model": litellm_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        try:
            response = await litellm.acompletion(**kwargs)
        except Exception as e:
            # Attempt to recover from Groq's tool_use_failed error
            recovered = _try_recover_groq_tool_use_failed(e)
            if recovered:
                logger.info("Successfully recovered tool call from Groq failed_generation")
                return recovered

            logger.error(f"LiteLLM error for {litellm_model}: {e}")
            raise RuntimeError(
                f"LLM call failed ({provider_type.value}/{model}): {e}"
            ) from e

        # Parse response — LiteLLM returns OpenAI-compatible format
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
    # ── OpenAI / ChatGPT ─────────────────────────────────────────────
    # ChatGPT (Responses API — auto-translated by LiteLLM)
    {"id": "chatgpt/gpt-5.4",              "name": "GPT-5.4",              "provider": "openai", "description": "Flagship model. 1M context window."},
    {"id": "chatgpt/gpt-5.4-pro",          "name": "GPT-5.4 Pro",          "provider": "openai", "description": "Premium flagship. Maximum capability."},
    {"id": "chatgpt/gpt-5.3-chat-latest",  "name": "GPT-5.3 Chat",         "provider": "openai", "description": "Latest 5.3 chat model. 128K context."},
    {"id": "chatgpt/gpt-5.3-instant",      "name": "GPT-5.3 Instant",      "provider": "openai", "description": "Ultra-fast responses. 128K context."},
    {"id": "chatgpt/gpt-5.3-codex",        "name": "GPT-5.3 Codex",        "provider": "openai", "description": "Optimized for coding tasks. 128K."},
    {"id": "chatgpt/gpt-5.3-codex-spark",  "name": "GPT-5.3 Codex Spark",  "provider": "openai", "description": "Lightweight coding assistant. 128K."},
    {"id": "chatgpt/gpt-5.2",              "name": "GPT-5.2",              "provider": "openai", "description": "Previous gen. Stable & reliable. 128K."},
    {"id": "chatgpt/gpt-5.2-codex",        "name": "GPT-5.2 Codex",        "provider": "openai", "description": "Previous gen coding model. 128K."},
    {"id": "chatgpt/gpt-5.1-codex-max",    "name": "GPT-5.1 Codex Max",    "provider": "openai", "description": "High-capability coding. 128K."},
    {"id": "chatgpt/gpt-5.1-codex-mini",   "name": "GPT-5.1 Codex Mini",   "provider": "openai", "description": "Compact coding model. 128K."},
    # Standard OpenAI Chat Completions
    {"id": "chatgpt-4o-latest",            "name": "ChatGPT-4o Latest",    "provider": "openai", "description": "Affordable workhorse. 128K. $5/$15."},
    # ── Anthropic ────────────────────────────────────────────────────
    {"id": "claude-4.6-sonnet-20260215",   "name": "Claude Sonnet 4.6",    "provider": "anthropic", "description": "Excellent at coding and complex reasoning."},
    {"id": "claude-4.6-opus-20260301",     "name": "Claude Opus 4.6",      "provider": "anthropic", "description": "Anthropic's most powerful frontier model."},
    {"id": "claude-4.5-haiku-20251101",    "name": "Claude 4.5 Haiku",     "provider": "anthropic", "description": "Fast and cost-effective."},
    # ── Google Gemini ────────────────────────────────────────────────
    {"id": "gemini-3.1-pro",               "name": "Gemini 3.1 Pro",       "provider": "gemini", "description": "Mạnh nhất cho agent phức tạp (planning, coding)."},
    {"id": "gemini-2.5-pro",               "name": "Gemini 2.5 Pro",       "provider": "gemini", "description": "Cân bằng tốt (production), workflow phức tạp."},
    {"id": "gemini-3.0-flash",             "name": "Gemini 3 Flash",       "provider": "gemini", "description": "Nhanh, rẻ, cho agent scale lớn / realtime."},
    {"id": "gemini-2.5-flash",             "name": "Gemini 2.5 Flash",     "provider": "gemini", "description": "Model flash giá rẻ, ổn định."},
    {"id": "gemini-3.1-flash-live",        "name": "Gemini 3.1 Flash Live","provider": "gemini", "description": "Audio-to-audio realtime dùng cho voice agent."},
    {"id": "gemini-deep-research",         "name": "Gemini Deep Research", "provider": "gemini", "description": "Research agent (tự tìm thông tin, lập kế hoạch)."},
    {"id": "gemini-computer-use",          "name": "Gemini Computer Use",  "provider": "gemini", "description": "Automation điều khiển UI (click, type, navigate)."},
    # ── DeepSeek ─────────────────────────────────────────────────────
    {"id": "deepseek-chat",                "name": "DeepSeek V3.2",        "provider": "deepseek", "description": "Flagship conversational model. Auto-updates to latest V3.x."},
    {"id": "deepseek-reasoner",            "name": "DeepSeek R1",          "provider": "deepseek", "description": "Thinking mode. Advanced multi-step reasoning."},
    # ── Groq (Siêu Tốc / High-Speed Inference) ───────────────────────
    {"id": "deepseek-r1-distill-llama-70b", "name": "DeepSeek R1 Distill (70B)", "provider": "groq", "description": "Reasoning model chạy siêu nhanh trên Groq."},
    {"id": "llama-3.3-70b-versatile",       "name": "Llama 3.3 (70B)",           "provider": "groq", "description": "Meta Llama đa dụng, xử lý mượt và thông minh."},
    {"id": "llama-3.1-8b-instant",          "name": "Llama 3.1 8B Instant",      "provider": "groq", "description": "Model nhỏ gọn, tốc độ trả về (latency) đỉnh cao."},
    {"id": "mixtral-8x7b-32768",            "name": "Mixtral 8x7B",              "provider": "groq", "description": "MoE model nổi tiếng của Mistral."},
    {"id": "gemma2-9b-it",                  "name": "Gemma 2 9B",                "provider": "groq", "description": "Model cực tốt của Google cho instruction tuning."},
    # ── Together AI (Open Source) ────────────────────────────────────
    {"id": "meta-llama/Llama-4-Scout",     "name": "Llama 4 Scout",        "provider": "together", "description": "Llama 4 base model."},
    {"id": "meta-llama/Llama-4-Maverick",  "name": "Llama 4 Maverick",     "provider": "together", "description": "Llama 4 agile coding model."},
    {"id": "deepseek-ai/DeepSeek-V4",      "name": "DeepSeek V4",          "provider": "together", "description": "The latest V4 offering from DeepSeek."},
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
