from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ApprovalCreate(BaseModel):
    taskId: str
    executionId: str
    requestedBy: str


class ApprovalResponse(BaseModel):
    id: str
    taskId: str
    executionId: str
    requestedBy: str
    status: ApprovalStatus
    reviewedBy: Optional[str] = None
    reviewedAt: Optional[datetime] = None
    createdAt: datetime


class ApprovalAction(BaseModel):
    status: ApprovalStatus
    reviewedBy: str = "admin"
