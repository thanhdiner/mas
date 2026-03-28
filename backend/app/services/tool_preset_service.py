from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite

from pymongo.errors import DuplicateKeyError

from app.database import get_db
from app.errors import BadRequestError, NotFoundError
from app.models.tool_preset import ToolPresetCreate, ToolPresetResponse, ToolPresetUpdate
from app.tools.registry import tool_registry
from app.utils.doc_parser import doc_to_model
from app.utils.object_id import to_object_id


class DuplicateToolPresetNameError(BadRequestError):
    def __init__(self, tool_name: str, preset_name: str | None = None) -> None:
        suffix = f" '{preset_name}'" if preset_name else ""
        super().__init__(
            "tool_preset_exists",
            f"Preset{suffix} already exists for tool '{tool_name}'.",
            field="name",
        )


class ToolPresetService:
    collection = "tool_presets"

    @staticmethod
    def _get_tool_definition(tool_name: str) -> dict:
        tool = next(
            (item for item in tool_registry.list_all() if item["name"] == tool_name),
            None,
        )
        if tool is None:
            raise BadRequestError(
                "tool_not_found",
                f"Tool '{tool_name}' is not registered.",
                field="toolName",
            )
        if not tool.get("configSchema"):
            raise BadRequestError(
                "tool_preset_not_supported",
                f"Tool '{tool_name}' does not support saved presets.",
                field="toolName",
            )
        return tool

    @staticmethod
    def _coerce_number(value: str | int | float) -> int | float:
        if isinstance(value, bool):
            raise ValueError("Boolean values are not valid numbers.")
        if isinstance(value, (int, float)):
            numeric_value = float(value)
        else:
            numeric_value = float(str(value).strip())
        if not isfinite(numeric_value):
            raise ValueError("Numeric values must be finite.")
        return int(numeric_value) if numeric_value.is_integer() else numeric_value

    @classmethod
    def _normalize_values(
        cls,
        tool_name: str,
        values: dict[str, str | int | float],
    ) -> dict[str, str | int | float]:
        tool = cls._get_tool_definition(tool_name)
        fields = {
            field["name"]: field
            for field in tool.get("configSchema", [])
            if isinstance(field, dict) and isinstance(field.get("name"), str)
        }

        normalized: dict[str, str | int | float] = {}
        for raw_key, raw_value in (values or {}).items():
            field_name = str(raw_key).strip()
            if not field_name:
                continue
            if field_name not in fields:
                raise BadRequestError(
                    "invalid_tool_preset_field",
                    f"Field '{field_name}' is not configurable for tool '{tool_name}'.",
                    field=field_name,
                )
            if raw_value is None:
                continue

            if fields[field_name].get("type") == "number":
                try:
                    normalized[field_name] = cls._coerce_number(raw_value)
                except ValueError as exc:
                    raise BadRequestError(
                        "invalid_tool_preset_value",
                        f"Field '{field_name}' must be a valid number.",
                        field=field_name,
                    ) from exc
            else:
                string_value = str(raw_value).strip()
                if string_value:
                    normalized[field_name] = string_value

        if not normalized:
            raise BadRequestError(
                "empty_tool_preset_values",
                "Preset values cannot be empty.",
                field="values",
            )

        return normalized

    @staticmethod
    def _to_response(doc: dict) -> ToolPresetResponse:
        return doc_to_model(doc, ToolPresetResponse)

    @classmethod
    async def list_presets(
        cls,
        tool_name: str | None = None,
    ) -> list[ToolPresetResponse]:
        db = get_db()
        query = {"toolName": tool_name} if tool_name else {}
        cursor = db[cls.collection].find(query, sort=[("toolName", 1), ("name", 1)])
        presets: list[ToolPresetResponse] = []
        async for doc in cursor:
            presets.append(cls._to_response(doc))
        return presets

    @classmethod
    async def create_preset(
        cls,
        preset_in: ToolPresetCreate,
        *,
        actor_user_id: str | None = None,
    ) -> ToolPresetResponse:
        db = get_db()
        tool_name = preset_in.toolName.strip()
        preset_name = preset_in.name.strip()
        if not preset_name:
            raise BadRequestError(
                "invalid_tool_preset_name",
                "Preset name cannot be empty.",
                field="name",
            )

        normalized_values = cls._normalize_values(tool_name, preset_in.values)
        now = datetime.now(timezone.utc)
        document = {
            "name": preset_name,
            "description": preset_in.description.strip(),
            "toolName": tool_name,
            "values": normalized_values,
            "createdAt": now,
            "updatedAt": now,
            "createdBy": actor_user_id,
            "updatedBy": actor_user_id,
        }

        try:
            result = await db[cls.collection].insert_one(document)
        except DuplicateKeyError as exc:
            raise DuplicateToolPresetNameError(tool_name, preset_name) from exc

        document["_id"] = result.inserted_id
        return cls._to_response(document)

    @classmethod
    async def update_preset(
        cls,
        preset_id: str,
        update_in: ToolPresetUpdate,
        *,
        actor_user_id: str | None = None,
    ) -> ToolPresetResponse:
        db = get_db()
        object_id = to_object_id(preset_id, "preset_id")
        existing = await db[cls.collection].find_one({"_id": object_id})
        if not existing:
            raise NotFoundError(
                "tool_preset_not_found",
                "Preset not found.",
            )

        updates: dict = {
            "updatedAt": datetime.now(timezone.utc),
            "updatedBy": actor_user_id,
        }
        if update_in.name is not None:
            preset_name = update_in.name.strip()
            if not preset_name:
                raise BadRequestError(
                    "invalid_tool_preset_name",
                    "Preset name cannot be empty.",
                    field="name",
                )
            updates["name"] = preset_name
        if update_in.description is not None:
            updates["description"] = update_in.description.strip()
        if update_in.values is not None:
            updates["values"] = cls._normalize_values(
                existing["toolName"],
                update_in.values,
            )

        try:
            await db[cls.collection].update_one(
                {"_id": object_id},
                {"$set": updates},
            )
        except DuplicateKeyError as exc:
            raise DuplicateToolPresetNameError(
                existing["toolName"],
                update_in.name,
            ) from exc

        updated = await db[cls.collection].find_one({"_id": object_id})
        if not updated:
            raise NotFoundError(
                "tool_preset_not_found",
                "Preset not found.",
            )

        return cls._to_response(updated)

    @classmethod
    async def delete_preset(cls, preset_id: str) -> None:
        db = get_db()
        object_id = to_object_id(preset_id, "preset_id")
        result = await db[cls.collection].delete_one({"_id": object_id})
        if result.deleted_count == 0:
            raise NotFoundError(
                "tool_preset_not_found",
                "Preset not found.",
            )
