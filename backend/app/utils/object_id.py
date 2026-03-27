from __future__ import annotations

from collections.abc import Iterable

from bson import ObjectId

from app.errors import InvalidObjectIdError


def to_object_id(id_str: str, field_name: str = "id") -> ObjectId:
    if not isinstance(id_str, str) or not ObjectId.is_valid(id_str):
        raise InvalidObjectIdError(field_name)
    return ObjectId(id_str)


def try_to_object_id(id_str: str | None) -> ObjectId | None:
    if not isinstance(id_str, str) or not ObjectId.is_valid(id_str):
        return None
    return ObjectId(id_str)


def validate_object_id(value: str, field_name: str = "id") -> str:
    to_object_id(value, field_name)
    return value


def validate_object_id_list(
    values: Iterable[str] | None,
    field_name: str,
) -> list[str]:
    validated_values = list(values or [])
    for index, value in enumerate(validated_values):
        to_object_id(value, f"{field_name}[{index}]")
    return validated_values
