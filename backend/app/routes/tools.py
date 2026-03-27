"""
Route: /api/tools — list available tools for the frontend catalog.
"""

from fastapi import APIRouter, Body
from app.tools.registry import tool_registry
from app.database import get_db

router = APIRouter(prefix="/tools", tags=["Tools"])


@router.get("")
async def list_tools():
    """Return all registered tools (name + description) and their global settings."""
    db = get_db()
    
    # Fetch global settings from DB
    global_settings = {}
    if db is not None:
        cursor = db.tool_settings.find({})
        async for doc in cursor:
            global_settings[doc["name"]] = doc.get("settings", {})

    tools = tool_registry.list_all()
    
    for tool in tools:
        tool["globalSettings"] = global_settings.get(tool["name"], {})
        
    return tools


@router.patch("/{tool_name}/settings")
async def update_tool_settings(tool_name: str, settings: dict = Body(...)):
    """Update global settings for a specific tool."""
    db = get_db()
    if db is None:
        return {"error": "Database not configured"}
        
    await db.tool_settings.update_one(
        {"name": tool_name},
        {"$set": {"settings": settings}},
        upsert=True
    )
    
    return {"message": "Settings updated", "tool": tool_name, "settings": settings}

