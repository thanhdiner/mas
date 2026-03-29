"""
Service layer for system settings (LLM keys, general config).

Stores settings in MongoDB `system_settings` collection.
API keys are encrypted at rest using the same Fernet crypto as tool-credentials.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.database import get_db
from app.utils.credential_crypto import encrypt_secret_map, decrypt_secret_map

logger = logging.getLogger("system_settings_service")

_COLLECTION = "system_settings"
_LLM_DOC_TYPE = "llm"
_GENERAL_DOC_TYPE = "general"

_API_KEY_FIELDS = [
    "openai_api_key",
    "anthropic_api_key",
    "gemini_api_key",
    "deepseek_api_key",
    "groq_api_key",
    "together_api_key",
]


def _mask_key(key: str) -> str:
    """Return '••••xxxx' style hint for a key."""
    if not key:
        return ""
    if len(key) <= 8:
        return "••••" + key[-2:]
    return "••••" + key[-4:]


class SystemSettingsService:
    """CRUD layer for system settings."""

    # ─── LLM Settings ────────────────────────────────────────────────

    @staticmethod
    async def get_llm_settings() -> dict:
        """Get LLM settings from DB. Returns raw dict (keys decrypted)."""
        db = get_db()
        doc = await db[_COLLECTION].find_one({"type": _LLM_DOC_TYPE})
        if not doc:
            return {
                "default_provider": "openai",
                "default_model": "gpt-4o-mini",
                "openai_api_key": "",
                "anthropic_api_key": "",
                "gemini_api_key": "",
                "deepseek_api_key": "",
                "groq_api_key": "",
                "together_api_key": "",
            }

        # Decrypt the encrypted blob
        encrypted = doc.get("encrypted_keys", "")
        keys: dict[str, str] = {}
        if encrypted:
            try:
                keys = decrypt_secret_map(encrypted)
            except Exception:
                logger.warning("Failed to decrypt LLM API keys from DB")

        return {
            "default_provider": doc.get("default_provider", "openai"),
            "default_model": doc.get("default_model", "gpt-4o-mini"),
            "openai_api_key": keys.get("openai_api_key", ""),
            "anthropic_api_key": keys.get("anthropic_api_key", ""),
            "gemini_api_key": keys.get("gemini_api_key", ""),
            "deepseek_api_key": keys.get("deepseek_api_key", ""),
            "groq_api_key": keys.get("groq_api_key", ""),
            "together_api_key": keys.get("together_api_key", ""),
        }

    @staticmethod
    async def get_llm_settings_masked() -> dict:
        """Get LLM settings with API keys masked for the frontend."""
        raw = await SystemSettingsService.get_llm_settings()
        return {
            "default_provider": raw["default_provider"],
            "default_model": raw["default_model"],
            "openai_api_key_set": bool(raw["openai_api_key"]),
            "anthropic_api_key_set": bool(raw["anthropic_api_key"]),
            "gemini_api_key_set": bool(raw["gemini_api_key"]),
            "deepseek_api_key_set": bool(raw["deepseek_api_key"]),
            "groq_api_key_set": bool(raw["groq_api_key"]),
            "together_api_key_set": bool(raw["together_api_key"]),
            "openai_api_key_hint": _mask_key(raw["openai_api_key"]),
            "anthropic_api_key_hint": _mask_key(raw["anthropic_api_key"]),
            "gemini_api_key_hint": _mask_key(raw["gemini_api_key"]),
            "deepseek_api_key_hint": _mask_key(raw["deepseek_api_key"]),
            "groq_api_key_hint": _mask_key(raw["groq_api_key"]),
            "together_api_key_hint": _mask_key(raw["together_api_key"]),
        }

    @staticmethod
    async def update_llm_settings(
        default_provider: Optional[str] = None,
        default_model: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        anthropic_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        deepseek_api_key: Optional[str] = None,
        groq_api_key: Optional[str] = None,
        together_api_key: Optional[str] = None,
    ) -> dict:
        """
        Update LLM settings.  `None` means 'don't change'.
        An empty string means 'clear the key'.
        """
        # Fetch current state
        current = await SystemSettingsService.get_llm_settings()

        # Merge non-key fields
        if default_provider is not None:
            current["default_provider"] = default_provider
        if default_model is not None:
            current["default_model"] = default_model

        # Merge API keys (None = keep current, "" = clear)
        key_updates = {
            "openai_api_key": openai_api_key,
            "anthropic_api_key": anthropic_api_key,
            "gemini_api_key": gemini_api_key,
            "deepseek_api_key": deepseek_api_key,
            "groq_api_key": groq_api_key,
            "together_api_key": together_api_key,
        }
        for field, new_val in key_updates.items():
            if new_val is not None:
                current[field] = new_val.strip()

        # Encrypt keys blob
        keys_to_encrypt = {f: current[f] for f in _API_KEY_FIELDS if current.get(f)}
        encrypted = encrypt_secret_map(keys_to_encrypt) if keys_to_encrypt else ""

        db = get_db()
        await db[_COLLECTION].update_one(
            {"type": _LLM_DOC_TYPE},
            {
                "$set": {
                    "type": _LLM_DOC_TYPE,
                    "default_provider": current["default_provider"],
                    "default_model": current["default_model"],
                    "encrypted_keys": encrypted,
                }
            },
            upsert=True,
        )

        # Invalidate the LLM provider singleton so it picks up new keys
        _invalidate_llm_provider()

        logger.info("LLM settings updated")
        return await SystemSettingsService.get_llm_settings_masked()

    # ─── General Settings ────────────────────────────────────────────

    @staticmethod
    async def get_general_settings() -> dict:
        db = get_db()
        doc = await db[_COLLECTION].find_one({"type": _GENERAL_DOC_TYPE})
        if not doc:
            from app.config import get_settings
            s = get_settings()
            return {
                "app_name": s.APP_NAME,
                "max_delegation_depth": s.MAX_DELEGATION_DEPTH,
                "max_steps_default": s.MAX_STEPS_DEFAULT,
            }
        return {
            "app_name": doc.get("app_name", "MAS - Multi-Agent System"),
            "max_delegation_depth": doc.get("max_delegation_depth", 5),
            "max_steps_default": doc.get("max_steps_default", 10),
        }

    @staticmethod
    async def update_general_settings(
        app_name: Optional[str] = None,
        max_delegation_depth: Optional[int] = None,
        max_steps_default: Optional[int] = None,
    ) -> dict:
        current = await SystemSettingsService.get_general_settings()

        if app_name is not None:
            current["app_name"] = app_name
        if max_delegation_depth is not None:
            current["max_delegation_depth"] = max_delegation_depth
        if max_steps_default is not None:
            current["max_steps_default"] = max_steps_default

        db = get_db()
        await db[_COLLECTION].update_one(
            {"type": _GENERAL_DOC_TYPE},
            {"$set": {"type": _GENERAL_DOC_TYPE, **current}},
            upsert=True,
        )

        logger.info("General settings updated")
        return current


def _invalidate_llm_provider():
    """Reset the LLM provider singleton so it re-reads keys on next use."""
    try:
        from app.services import llm_provider as _mod
        if _mod._llm_provider is not None:
            _mod._llm_provider._clear_cache()
        _mod._llm_provider = None
    except Exception:
        pass


async def get_effective_api_key(provider: str) -> str:
    """
    Resolve an API key for a provider.
    Priority: DB setting > .env setting > ""
    """
    from app.config import get_settings
    settings = get_settings()

    db_settings = await SystemSettingsService.get_llm_settings()

    key_map = {
        "openai": ("openai_api_key", settings.OPENAI_API_KEY),
        "anthropic": ("anthropic_api_key", settings.ANTHROPIC_API_KEY),
        "gemini": ("gemini_api_key", settings.GEMINI_API_KEY),
        "deepseek": ("deepseek_api_key", settings.DEEPSEEK_API_KEY),
        "groq": ("groq_api_key", settings.GROQ_API_KEY),
        "together": ("together_api_key", settings.TOGETHER_API_KEY),
    }

    field, env_fallback = key_map.get(provider, ("", ""))
    db_val = db_settings.get(field, "")
    return db_val if db_val else (env_fallback or "")
