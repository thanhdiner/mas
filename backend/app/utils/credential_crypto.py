from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


def _build_fernet() -> Fernet:
    settings = get_settings()
    secret = (settings.CREDENTIALS_SECRET_KEY or settings.JWT_SECRET_KEY).encode(
        "utf-8"
    )
    derived_key = hashlib.sha256(secret).digest()
    return Fernet(base64.urlsafe_b64encode(derived_key))


def encrypt_secret_map(values: dict[str, str]) -> str:
    payload = json.dumps(values, ensure_ascii=False).encode("utf-8")
    return _build_fernet().encrypt(payload).decode("utf-8")


def decrypt_secret_map(token: str) -> dict[str, str]:
    try:
        payload = _build_fernet().decrypt(token.encode("utf-8"))
    except InvalidToken as exc:
        raise RuntimeError("Failed to decrypt credential secret.") from exc

    decoded: Any = json.loads(payload.decode("utf-8"))
    if not isinstance(decoded, dict):
        raise RuntimeError("Credential secret payload is invalid.")

    return {
        str(key): str(value)
        for key, value in decoded.items()
        if value is not None
    }
