"""
Pydantic models for system-level settings (LLM API keys, default model, etc.).

Settings are stored in the `system_settings` MongoDB collection as a single
document keyed by `type = "llm"`.  Sensitive values (API keys) are stored
encrypted using the same Fernet envelope as tool-credentials.
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional


# ── Request / Input ──────────────────────────────────────────────────────

class LLMSettingsUpdate(BaseModel):
    """Payload accepted by PUT /api/settings/llm."""
    default_provider: Optional[str] = Field(None, description="Default LLM provider (openai|anthropic|gemini|deepseek|groq|together)")
    default_model: Optional[str] = Field(None, description="Default model id")
    openai_api_key: Optional[str] = Field(None, description="OpenAI API key (set empty string to clear)")
    anthropic_api_key: Optional[str] = Field(None, description="Anthropic API key")
    gemini_api_key: Optional[str] = Field(None, description="Google Gemini API key")
    deepseek_api_key: Optional[str] = Field(None, description="DeepSeek API key")
    groq_api_key: Optional[str] = Field(None, description="Groq API key")
    together_api_key: Optional[str] = Field(None, description="Together AI API key")


# ── Response ─────────────────────────────────────────────────────────────

class LLMSettingsResponse(BaseModel):
    """Returned by GET /api/settings/llm.  API keys are masked."""
    default_provider: str = "openai"
    default_model: str = "gpt-4o-mini"
    openai_api_key_set: bool = False
    anthropic_api_key_set: bool = False
    gemini_api_key_set: bool = False
    deepseek_api_key_set: bool = False
    groq_api_key_set: bool = False
    together_api_key_set: bool = False
    # Masked previews (last 4 chars)
    openai_api_key_hint: str = ""
    anthropic_api_key_hint: str = ""
    gemini_api_key_hint: str = ""
    deepseek_api_key_hint: str = ""
    groq_api_key_hint: str = ""
    together_api_key_hint: str = ""


class GeneralSettingsUpdate(BaseModel):
    """Payload accepted by PUT /api/settings/general."""
    app_name: Optional[str] = Field(None, min_length=1, max_length=120)
    max_delegation_depth: Optional[int] = Field(None, ge=1, le=50)
    max_steps_default: Optional[int] = Field(None, ge=1, le=100)


class GeneralSettingsResponse(BaseModel):
    """Returned by GET /api/settings/general."""
    app_name: str = "MAS - Multi-Agent System"
    max_delegation_depth: int = 5
    max_steps_default: int = 10
