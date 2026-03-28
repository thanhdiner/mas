"""
Route: /api/schedules — CRUD for scheduled triggers.
"""

from fastapi import APIRouter, HTTPException

from app.models.schedule import ScheduleCreate, ScheduleUpdate
from app.services.scheduler import (
    create_schedule,
    update_schedule,
    delete_schedule,
    toggle_schedule,
    list_schedules,
    get_schedule,
)

router = APIRouter(prefix="/schedules", tags=["Schedules"])


def _doc_to_response(doc: dict) -> dict:
    """Convert a MongoDB document to a JSON-serialisable response."""
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.get("")
async def list_all():
    docs = await list_schedules()
    return [_doc_to_response(d) for d in docs]


@router.get("/{schedule_id}")
async def get_one(schedule_id: str):
    doc = await get_schedule(schedule_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return _doc_to_response(doc)


@router.post("", status_code=201)
async def create(payload: ScheduleCreate):
    data = payload.model_dump()
    doc = await create_schedule(data)
    return _doc_to_response(doc)


@router.patch("/{schedule_id}")
async def update(schedule_id: str, payload: ScheduleUpdate):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    doc = await update_schedule(schedule_id, data)
    if doc is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return _doc_to_response(doc)


@router.delete("/{schedule_id}")
async def remove(schedule_id: str):
    ok = await delete_schedule(schedule_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"message": "Schedule deleted"}


@router.post("/{schedule_id}/toggle")
async def toggle(schedule_id: str, active: bool = True):
    doc = await toggle_schedule(schedule_id, active)
    if doc is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return _doc_to_response(doc)
