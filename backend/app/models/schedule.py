"""
Pydantic models for Schedule Triggers.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ScheduleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    agentId: str = Field(..., description="The agent to trigger")
    promptPayload: str = Field(..., min_length=1, description="The prompt/instruction to send to the agent")
    scheduleType: str = Field(
        default="cron",
        description="Type of schedule: 'cron', 'interval', or 'once'"
    )
    cronExpression: Optional[str] = Field(
        default=None,
        description="Cron expression for 'cron' type, e.g. '0 8 * * 1-5'"
    )
    intervalSeconds: Optional[int] = Field(
        default=None, ge=60,
        description="Interval in seconds for 'interval' type (min 60s)"
    )
    runAt: Optional[str] = Field(
        default=None,
        description="ISO datetime string for 'once' type"
    )
    timezone: str = Field(default="Asia/Ho_Chi_Minh")
    isActive: bool = Field(default=True)


class ScheduleUpdate(BaseModel):
    name: Optional[str] = None
    agentId: Optional[str] = None
    promptPayload: Optional[str] = None
    scheduleType: Optional[str] = None
    cronExpression: Optional[str] = None
    intervalSeconds: Optional[int] = None
    runAt: Optional[str] = None
    timezone: Optional[str] = None
    isActive: Optional[bool] = None


class ScheduleResponse(BaseModel):
    id: str
    name: str
    agentId: str
    agentName: Optional[str] = None
    promptPayload: str
    scheduleType: str
    cronExpression: Optional[str] = None
    intervalSeconds: Optional[int] = None
    runAt: Optional[str] = None
    timezone: str
    isActive: bool
    lastRunAt: Optional[datetime] = None
    nextRunAt: Optional[datetime] = None
    totalRuns: int = 0
    createdAt: datetime
    updatedAt: Optional[datetime] = None
