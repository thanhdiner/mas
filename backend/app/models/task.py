from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    input: str = Field(..., min_length=1)
    assignedAgentId: str
    parentTaskId: Optional[str] = None
    createdBy: str = Field(default="user")
    allowDelegation: bool = Field(default=True)
    requiresApproval: bool = Field(default=False)


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    input: Optional[str] = None
    status: Optional[TaskStatus] = None
    assignedAgentId: Optional[str] = None
    result: Optional[str] = None
    error: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    title: str
    input: str
    status: TaskStatus
    assignedAgentId: str
    parentTaskId: Optional[str] = None
    createdBy: str
    allowDelegation: bool
    requiresApproval: bool
    result: Optional[str] = None
    error: Optional[str] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None


class SubtaskInfo(BaseModel):
    id: str
    title: str
    status: TaskStatus
    assignedAgentId: str
    agentName: Optional[str] = None


class TaskDetailResponse(TaskResponse):
    agentName: Optional[str] = None
    subtasks: list[SubtaskInfo] = []
    execution: Optional[dict] = None
