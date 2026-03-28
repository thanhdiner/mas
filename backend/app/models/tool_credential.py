from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ToolCredentialCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    headers: dict[str, str] = Field(default_factory=dict)


class ToolCredentialUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    headers: Optional[dict[str, str]] = None


class ToolCredentialResponse(BaseModel):
    id: str
    name: str
    description: str
    headerKeys: list[str] = Field(default_factory=list)
    createdAt: datetime
    updatedAt: Optional[datetime] = None
