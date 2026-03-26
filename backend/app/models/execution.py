from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from enum import Enum


class ExecutionStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StepType(str, Enum):
    THINKING = "thinking"
    ACTION = "action"
    DELEGATION = "delegation"
    RESULT = "result"
    ERROR = "error"
    WAITING = "waiting"


class ExecutionResponse(BaseModel):
    id: str
    taskId: str
    agentId: str
    status: ExecutionStatus
    startedAt: datetime
    endedAt: Optional[datetime] = None


class ExecutionStepResponse(BaseModel):
    id: str
    executionId: str
    taskId: str
    agentId: str
    stepType: StepType
    content: str
    meta: Optional[dict[str, Any]] = None
    createdAt: datetime
