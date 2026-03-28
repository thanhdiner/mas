from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


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
    # Multi-model support
    model: Optional[str] = Field(default=None, description="LLM model override (e.g. gpt-5.4-mini, claude-4.6-sonnet-20260215)")
    provider: Optional[str] = Field(default=None, description="LLM provider override (openai, anthropic, groq, together)")


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
    model: Optional[str] = None
    provider: Optional[str] = None


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
    model: Optional[str] = None
    provider: Optional[str] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None
