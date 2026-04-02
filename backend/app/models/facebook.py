from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field
from enum import Enum


class FacebookPageTokenStatus(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"


class FacebookPageCreate(BaseModel):
    pageId: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(default="General")
    accessToken: str = Field(default="")
    followersCount: int = Field(default=0)
    avatarColor: str = Field(default="bg-blue-600")
    avatarUrl: Optional[str] = None


class FacebookPageUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    category: Optional[str] = None
    accessToken: Optional[str] = None
    followersCount: Optional[int] = None
    tokenStatus: Optional[FacebookPageTokenStatus] = None
    avatarColor: Optional[str] = None
    avatarUrl: Optional[str] = None


class FacebookPageResponse(BaseModel):
    id: str
    pageId: str
    name: str
    category: str
    followersCount: int
    tokenStatus: FacebookPageTokenStatus
    avatarColor: str
    avatarUrl: Optional[str] = None
    connectedAccountName: Optional[str] = None
    connectedAccountAvatar: Optional[str] = None
    lastPostedAt: Optional[datetime] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None


class FacebookPageListResponse(BaseModel):
    items: list[FacebookPageResponse]
    total: int
