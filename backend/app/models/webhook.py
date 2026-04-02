from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field
from enum import Enum


class WebhookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="")
    agentId: str
    taskTitle: str = Field(default="Webhook Trigger", min_length=1, max_length=200)
    allowDelegation: bool = Field(default=True)
    requiresApproval: bool = Field(default=False)
    active: bool = Field(default=True)


class WebhookUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    agentId: Optional[str] = None
    taskTitle: Optional[str] = Field(default=None, min_length=1, max_length=200)
    allowDelegation: Optional[bool] = None
    requiresApproval: Optional[bool] = None
    active: Optional[bool] = None


class WebhookResponse(BaseModel):
    id: str
    name: str
    description: str
    agentId: str
    agentName: Optional[str] = None
    taskTitle: str
    allowDelegation: bool
    requiresApproval: bool
    active: bool
    isArchived: bool = False
    archivedAt: Optional[datetime] = None
    lastTriggeredAt: Optional[datetime] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None


class WebhookSecretResponse(WebhookResponse):
    token: str
    triggerUrl: str


class WebhookTriggerResponse(BaseModel):
    message: str
    webhookId: str
    taskId: str
    duplicate: bool = False
    idempotencyKey: Optional[str] = None


class WebhookDeliveryStatus(str, Enum):
    PROCESSING = "processing"
    ACCEPTED = "accepted"
    DUPLICATE = "duplicate"
    FAILED = "failed"


class WebhookDeliveryResponse(BaseModel):
    id: str
    webhookId: str
    status: WebhookDeliveryStatus
    taskId: Optional[str] = None
    duplicate: bool = False
    idempotencyKey: Optional[str] = None
    requestMethod: str = "POST"
    contentType: Optional[str] = None
    payloadPreview: Optional[str] = None
    payloadSizeBytes: int = 0
    payloadTruncated: bool = False
    error: Optional[str] = None
    receivedAt: datetime
    updatedAt: Optional[datetime] = None


class WebhookDeliveryListResponse(BaseModel):
    items: list[WebhookDeliveryResponse]
    total: int
    skip: int
    limit: int
    hasMore: bool
    status: Optional[WebhookDeliveryStatus] = None
    fromTime: Optional[datetime] = None
    toTime: Optional[datetime] = None


class WebhookCleanupStatusResponse(BaseModel):
    lastRunAt: Optional[datetime] = None
    lastSuccessAt: Optional[datetime] = None
    lastStatus: str = "never_run"
    lastDurationMs: Optional[int] = None
    deliveriesDeleted: int = 0
    idempotencyDeleted: int = 0
    lastError: Optional[str] = None


class WebhookAlertingStatusResponse(BaseModel):
    configured: bool = False
    transport: str = "webhook"
    cooldownMinutes: int = 0
    timeoutSeconds: int = 0
    incidentOpen: bool = False
    lastAttemptAt: Optional[datetime] = None
    lastSentAt: Optional[datetime] = None
    lastStatus: str = "disabled"
    lastError: Optional[str] = None
    lastResolvedAttemptAt: Optional[datetime] = None
    lastResolvedSentAt: Optional[datetime] = None
    lastResolvedStatus: str = "idle"
    lastResolvedError: Optional[str] = None


class WebhookRuntimeHealthResponse(BaseModel):
    deliveryRetentionDays: int
    idempotencyRetentionDays: int
    cleanupIntervalHours: int
    deliveryBacklogAlertThresholdHours: int
    deliveryCutoff: datetime
    idempotencyCutoff: datetime
    expiredDeliveriesPending: int
    expiredIdempotencyPending: int
    oldestExpiredDeliveryAt: Optional[datetime] = None
    deliveryBacklogAlert: bool = False
    deliveryBacklogAlertMessage: Optional[str] = None
    deliveryRetentionIndexReady: bool
    idempotencyRetentionIndexReady: bool
    deliveryListIndexReady: bool
    jobScheduled: bool
    nextScheduledRunAt: Optional[datetime] = None
    cleanup: WebhookCleanupStatusResponse
    alerting: WebhookAlertingStatusResponse


class WebhookTestNotificationKind(str, Enum):
    ALERT = "alert"
    RESOLVED = "resolved"


class WebhookTestNotificationResponse(BaseModel):
    message: str
    kind: WebhookTestNotificationKind
    event: str
    sentAt: datetime
    test: bool = True


class WebhookTestNotificationPreviewResponse(BaseModel):
    message: str
    kind: WebhookTestNotificationKind
    event: str
    payload: dict[str, Any]
    test: bool = True
