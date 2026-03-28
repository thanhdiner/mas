"""
Route: /api/tools - list tools, update tool settings, and manage credentials.
"""

from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.database import get_db
from app.models.tool_credential import (
    ToolCredentialCreate,
    ToolCredentialResponse,
    ToolCredentialUpdate,
)
from app.models.tool_preset import (
    ToolPresetCreate,
    ToolPresetResponse,
    ToolPresetUpdate,
)
from app.routes.auth import get_current_active_user
from app.services.tool_credential_service import ToolCredentialService
from app.services.tool_preset_service import ToolPresetService
from app.tools.registry import tool_registry

router = APIRouter(prefix="/tools", tags=["Tools"])


@router.get("")
async def list_tools():
    """Return all registered tools (name + description) and their global settings."""
    db = get_db()

    global_settings = {}
    if db is not None:
        cursor = db.tool_settings.find({})
        async for doc in cursor:
            global_settings[doc["name"]] = doc.get("settings", {})

    presets_by_tool: dict[str, list[dict]] = {}
    if db is not None:
        cursor = db.tool_presets.find({}, sort=[("toolName", 1), ("name", 1)])
        async for doc in cursor:
            preset = ToolPresetService._to_response(doc).model_dump(mode="json")
            presets_by_tool.setdefault(doc["toolName"], []).append(preset)

    tools = tool_registry.list_all()

    for tool in tools:
        tool["globalSettings"] = global_settings.get(tool["name"], {})
        tool["presets"] = presets_by_tool.get(tool["name"], [])

    return tools


@router.patch("/{tool_name}/settings")
async def update_tool_settings(tool_name: str, settings: dict = Body(...)):
    """Update global settings for a specific tool."""
    db = get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not configured",
        )

    await db.tool_settings.update_one(
        {"name": tool_name},
        {"$set": {"settings": settings}},
        upsert=True,
    )

    return {"message": "Settings updated", "tool": tool_name, "settings": settings}


@router.get("/credentials", response_model=list[ToolCredentialResponse])
async def list_tool_credentials(
    _current_user=Depends(get_current_active_user),
):
    return await ToolCredentialService.list_credentials()


@router.post("/credentials", response_model=ToolCredentialResponse, status_code=201)
async def create_tool_credential(
    credential_in: ToolCredentialCreate,
    current_user=Depends(get_current_active_user),
):
    return await ToolCredentialService.create_credential(
        credential_in,
        actor_user_id=current_user.id,
    )


@router.patch("/credentials/{credential_id}", response_model=ToolCredentialResponse)
async def update_tool_credential(
    credential_id: str,
    update_in: ToolCredentialUpdate,
    current_user=Depends(get_current_active_user),
):
    return await ToolCredentialService.update_credential(
        credential_id,
        update_in,
        actor_user_id=current_user.id,
    )


@router.delete("/credentials/{credential_id}")
async def delete_tool_credential(
    credential_id: str,
    _current_user=Depends(get_current_active_user),
):
    await ToolCredentialService.delete_credential(credential_id)
    return {"message": "Credential deleted", "credentialId": credential_id}


@router.get("/presets", response_model=list[ToolPresetResponse])
async def list_tool_presets(
    tool_name: str | None = None,
    _current_user=Depends(get_current_active_user),
):
    return await ToolPresetService.list_presets(tool_name)


@router.post("/presets", response_model=ToolPresetResponse, status_code=201)
async def create_tool_preset(
    preset_in: ToolPresetCreate,
    current_user=Depends(get_current_active_user),
):
    return await ToolPresetService.create_preset(
        preset_in,
        actor_user_id=current_user.id,
    )


@router.patch("/presets/{preset_id}", response_model=ToolPresetResponse)
async def update_tool_preset(
    preset_id: str,
    update_in: ToolPresetUpdate,
    current_user=Depends(get_current_active_user),
):
    return await ToolPresetService.update_preset(
        preset_id,
        update_in,
        actor_user_id=current_user.id,
    )


@router.delete("/presets/{preset_id}")
async def delete_tool_preset(
    preset_id: str,
    _current_user=Depends(get_current_active_user),
):
    await ToolPresetService.delete_preset(preset_id)
    return {"message": "Preset deleted", "presetId": preset_id}
