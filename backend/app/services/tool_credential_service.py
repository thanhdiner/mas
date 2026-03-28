from __future__ import annotations

from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from app.database import get_db
from app.errors import BadRequestError, NotFoundError
from app.models.tool_credential import (
    ToolCredentialCreate,
    ToolCredentialResponse,
    ToolCredentialUpdate,
)
from app.utils.credential_crypto import decrypt_secret_map, encrypt_secret_map
from app.utils.doc_parser import doc_to_model
from app.utils.object_id import to_object_id

BLOCKED_SECRET_HEADER_NAMES = {
    "host",
    "content-length",
    "transfer-encoding",
    "connection",
}


class DuplicateToolCredentialNameError(BadRequestError):
    def __init__(self, credential_name: str | None = None) -> None:
        suffix = f" '{credential_name}'" if credential_name else ""
        super().__init__(
            "tool_credential_exists",
            f"Credential{suffix} already exists.",
            field="name",
        )


class ToolCredentialService:
    collection = "tool_credentials"

    @staticmethod
    def _normalize_headers(headers: dict[str, str]) -> dict[str, str]:
        normalized: dict[str, str] = {}
        for raw_name, raw_value in (headers or {}).items():
            name = str(raw_name).strip()
            value = str(raw_value).strip()

            if not name or not value:
                continue

            if name.lower() in BLOCKED_SECRET_HEADER_NAMES:
                raise BadRequestError(
                    "invalid_credential_header",
                    f"Credential headers cannot contain '{name}'.",
                    field="headers",
                )

            normalized[name] = value

        return normalized

    @classmethod
    def _to_response(cls, doc: dict) -> ToolCredentialResponse:
        return doc_to_model(doc, ToolCredentialResponse)

    @classmethod
    async def list_credentials(cls) -> list[ToolCredentialResponse]:
        db = get_db()
        credentials: list[ToolCredentialResponse] = []
        cursor = db[cls.collection].find({}, sort=[("createdAt", -1)])
        async for doc in cursor:
            credentials.append(cls._to_response(doc))
        return credentials

    @classmethod
    async def create_credential(
        cls,
        credential_in: ToolCredentialCreate,
        *,
        actor_user_id: str | None = None,
    ) -> ToolCredentialResponse:
        db = get_db()
        now = datetime.now(timezone.utc)
        credential_name = credential_in.name.strip()
        if not credential_name:
            raise BadRequestError(
                "invalid_credential_name",
                "Credential name cannot be empty.",
                field="name",
            )
        normalized_headers = cls._normalize_headers(credential_in.headers)
        document = {
            "name": credential_name,
            "description": credential_in.description.strip(),
            "encryptedHeaders": encrypt_secret_map(normalized_headers),
            "headerKeys": sorted(normalized_headers.keys()),
            "createdAt": now,
            "updatedAt": now,
            "createdBy": actor_user_id,
            "updatedBy": actor_user_id,
        }

        try:
            result = await db[cls.collection].insert_one(document)
        except DuplicateKeyError as exc:
            raise DuplicateToolCredentialNameError(credential_name) from exc

        document["_id"] = result.inserted_id
        return cls._to_response(document)

    @classmethod
    async def update_credential(
        cls,
        credential_id: str,
        update_in: ToolCredentialUpdate,
        *,
        actor_user_id: str | None = None,
    ) -> ToolCredentialResponse:
        db = get_db()
        object_id = to_object_id(credential_id, "credential_id")
        existing = await db[cls.collection].find_one({"_id": object_id})
        if not existing:
            raise NotFoundError(
                "tool_credential_not_found",
                "Credential not found.",
            )

        updates: dict = {
            "updatedAt": datetime.now(timezone.utc),
            "updatedBy": actor_user_id,
        }
        if update_in.name is not None:
            credential_name = update_in.name.strip()
            if not credential_name:
                raise BadRequestError(
                    "invalid_credential_name",
                    "Credential name cannot be empty.",
                    field="name",
                )
            updates["name"] = credential_name
        if update_in.description is not None:
            updates["description"] = update_in.description.strip()
        if update_in.headers is not None:
            normalized_headers = cls._normalize_headers(update_in.headers)
            updates["encryptedHeaders"] = encrypt_secret_map(normalized_headers)
            updates["headerKeys"] = sorted(normalized_headers.keys())

        try:
            await db[cls.collection].update_one(
                {"_id": object_id},
                {"$set": updates},
            )
        except DuplicateKeyError as exc:
            raise DuplicateToolCredentialNameError(update_in.name) from exc

        updated = await db[cls.collection].find_one({"_id": object_id})
        if not updated:
            raise NotFoundError(
                "tool_credential_not_found",
                "Credential not found.",
            )

        return cls._to_response(updated)

    @classmethod
    async def delete_credential(cls, credential_id: str) -> None:
        db = get_db()
        object_id = to_object_id(credential_id, "credential_id")
        result = await db[cls.collection].delete_one({"_id": object_id})
        if result.deleted_count == 0:
            raise NotFoundError(
                "tool_credential_not_found",
                "Credential not found.",
            )

    @classmethod
    async def resolve_headers(cls, credential_ref: str | None) -> dict[str, str]:
        reference = (credential_ref or "").strip()
        if not reference:
            return {}

        db = get_db()
        query = {"name": reference}
        document = await db[cls.collection].find_one(query)

        if not document:
            raise BadRequestError(
                "tool_credential_not_found",
                f"Credential '{reference}' was not found.",
                field="credential_ref",
            )

        encrypted_headers = document.get("encryptedHeaders")
        if not encrypted_headers:
            return {}

        return decrypt_secret_map(encrypted_headers)
