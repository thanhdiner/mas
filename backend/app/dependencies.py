"""
Reusable FastAPI dependencies for route-level validation.

Usage in routers:

    from app.dependencies import ValidObjectId

    @router.get("/{agent_id}")
    async def get_agent(agent_id: ValidObjectId): ...

    # For non-path params (query / body field), use the dependency directly:
    from app.dependencies import valid_object_id
    agent_id: str = Depends(valid_object_id("agent_id"))
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Path

from app.utils.object_id import validate_object_id


def _validate_path_id(value: str, field_name: str) -> str:
    """Validate a string as a MongoDB ObjectId, returning it unchanged."""
    validate_object_id(value, field_name)
    return value


# ── Annotated types for common path parameters ────────────────────────
# Drop these into function signatures and FastAPI will run the validation
# automatically via Depends(). No manual validate_object_id() needed.

ValidObjectId = Annotated[
    str,
    Path(
        min_length=24,
        max_length=24,
        pattern=r"^[0-9a-fA-F]{24}$",
        description="A 24-character hexadecimal MongoDB ObjectId.",
    ),
]
"""
A path parameter pre-validated as a valid MongoDB ObjectId.

FastAPI enforces the regex at the OpenAPI / request-parsing layer,
so invalid IDs never reach your route handler.

Example:
    @router.get("/{agent_id}")
    async def get_agent(agent_id: ValidObjectId): ...
"""
