"""
Route: /api/settings — system configuration management.

Provides endpoints for:
  - LLM API keys (encrypted at rest in MongoDB)
  - General application settings
"""

from fastapi import APIRouter, Depends

from app.models.system_settings import (
    GeneralSettingsResponse,
    GeneralSettingsUpdate,
    LLMSettingsResponse,
    LLMSettingsUpdate,
)
from app.routes.auth import get_current_active_user
from app.services.system_settings_service import SystemSettingsService

router = APIRouter(prefix="/settings", tags=["Settings"])


# ─── LLM Settings ────────────────────────────────────────────────────────

@router.get("/llm", response_model=LLMSettingsResponse)
async def get_llm_settings(
    _current_user=Depends(get_current_active_user),
):
    """Get LLM provider settings. API keys are returned masked."""
    return await SystemSettingsService.get_llm_settings_masked()


@router.put("/llm", response_model=LLMSettingsResponse)
async def update_llm_settings(
    body: LLMSettingsUpdate,
    _current_user=Depends(get_current_active_user),
):
    """
    Update LLM provider settings.

    - Send `null` for a field to leave it unchanged.
    - Send `""` (empty string) for an API key to clear it.
    """
    return await SystemSettingsService.update_llm_settings(
        default_provider=body.default_provider,
        default_model=body.default_model,
        openai_api_key=body.openai_api_key,
        anthropic_api_key=body.anthropic_api_key,
        gemini_api_key=body.gemini_api_key,
        deepseek_api_key=body.deepseek_api_key,
        groq_api_key=body.groq_api_key,
        together_api_key=body.together_api_key,
    )


# ─── General Settings ────────────────────────────────────────────────────

@router.get("/general", response_model=GeneralSettingsResponse)
async def get_general_settings(
    _current_user=Depends(get_current_active_user),
):
    """Get general application settings."""
    return await SystemSettingsService.get_general_settings()


@router.put("/general", response_model=GeneralSettingsResponse)
async def update_general_settings(
    body: GeneralSettingsUpdate,
    _current_user=Depends(get_current_active_user),
):
    """Update general application settings."""
    return await SystemSettingsService.update_general_settings(
        app_name=body.app_name,
        max_delegation_depth=body.max_delegation_depth,
        max_steps_default=body.max_steps_default,
    )
