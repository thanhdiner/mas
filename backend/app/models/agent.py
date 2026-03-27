from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    role: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="")
    systemPrompt: str = Field(default="You are a helpful AI assistant.")
    allowedTools: list[str] = Field(default_factory=list)
    toolConfig: dict = Field(default_factory=dict)
    allowedSubAgents: list[str] = Field(default_factory=list)
    maxSteps: int = Field(default=10, ge=1, le=50)
    active: bool = Field(default=True)


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    description: Optional[str] = None
    systemPrompt: Optional[str] = None
    allowedTools: Optional[list[str]] = None
    toolConfig: Optional[dict] = None
    allowedSubAgents: Optional[list[str]] = None
    maxSteps: Optional[int] = None
    active: Optional[bool] = None


class AgentResponse(BaseModel):
    id: str
    name: str
    role: str
    description: str
    systemPrompt: str
    allowedTools: list[str] = Field(default_factory=list)
    toolConfig: dict = Field(default_factory=dict)
    allowedSubAgents: list[str] = Field(default_factory=list)
    maxSteps: int
    active: bool
    createdAt: datetime
    updatedAt: Optional[datetime] = None
