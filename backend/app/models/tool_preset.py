from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ToolPresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    toolName: str = Field(..., min_length=1, max_length=100)
    values: dict[str, str | int | float] = Field(default_factory=dict)


class ToolPresetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    values: Optional[dict[str, str | int | float]] = None


class ToolPresetResponse(BaseModel):
    id: str
    name: str
    description: str
    toolName: str
    values: dict[str, str | int | float] = Field(default_factory=dict)
    createdAt: datetime
    updatedAt: Optional[datetime] = None
