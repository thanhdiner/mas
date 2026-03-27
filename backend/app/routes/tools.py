"""
Route: /api/tools — list available tools for the frontend catalog.
"""

from fastapi import APIRouter
from app.tools.registry import tool_registry

router = APIRouter(prefix="/tools", tags=["Tools"])


@router.get("")
async def list_tools():
    """Return all registered tools (name + description) for frontend tool picker."""
    return tool_registry.list_all()
