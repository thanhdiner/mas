from __future__ import annotations

import asyncio
import csv
import io
import json
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from fastapi.responses import Response

from app.config import get_settings
from app.dependencies import ValidObjectId
from app.errors import BadRequestError, NotFoundError
from app.models.task import TaskCreate
from app.models.user import UserInDB
from app.models.webhook import (
    WebhookCreate,
    WebhookRuntimeHealthResponse,
    WebhookDeliveryListResponse,
    WebhookDeliveryStatus,
    WebhookResponse,
    WebhookSecretResponse,
    WebhookTestNotificationKind,
    WebhookTestNotificationPreviewResponse,
    WebhookTestNotificationResponse,
    WebhookTriggerResponse,
    WebhookUpdate,
)
from app.routes.auth import get_current_active_user
from app.services.agent_service import AgentService
from app.services.orchestrator import Orchestrator
from app.services.scheduler import get_webhook_cleanup_job_snapshot
from app.services.task_service import TaskService
from app.services.webhook_service import WebhookService
from app.utils.object_id import validate_object_id

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])
settings = get_settings()
IDEMPOTENCY_HEADER_NAMES = (
    "x-idempotency-key",
    "idempotency-key",
    "x-webhook-event-id",
)
IDEMPOTENCY_PAYLOAD_KEYS = (
    "idempotencyKey",
    "idempotency_key",
    "eventId",
    "event_id",
)
IDEMPOTENCY_TASK_WAIT_ATTEMPTS = 10
IDEMPOTENCY_TASK_WAIT_SECONDS = 0.05


async def _get_active_agent_or_raise(agent_id: str):
    validate_object_id(agent_id, "agentId")
    agent = await AgentService.get_agent(agent_id)
    if not agent:
        raise NotFoundError("agent_not_found", "Assigned agent not found")
    if not agent.active:
        raise BadRequestError("agent_inactive", "Assigned agent is inactive")
    return agent


def _validate_delivery_range(
    from_time: datetime | None,
    to_time: datetime | None,
) -> None:
    if from_time and to_time and from_time > to_time:
        raise BadRequestError(
            "invalid_delivery_range",
            "The 'from' timestamp must be earlier than or equal to 'to'.",
        )


def _build_trigger_url(request: Request, token: str) -> str:
    return str(request.url_for("trigger_agent_webhook", token=token))


async def _read_webhook_payload(request: Request) -> tuple[bytes, object | None, str]:
    raw_body = await request.body()
    content_type = request.headers.get("content-type", "")
    parsed_payload: object | None = None

    if raw_body:
        try:
            parsed_payload = json.loads(raw_body)
        except json.JSONDecodeError:
            parsed_payload = None

    return raw_body, parsed_payload, content_type


def _slugify_filename(value: str) -> str:
    return "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-") or "webhook"


def _extract_idempotency_key(
    request: Request,
    parsed_payload: object | None,
) -> str | None:
    for header_name in IDEMPOTENCY_HEADER_NAMES:
        header_value = request.headers.get(header_name)
        if header_value and header_value.strip():
            return header_value.strip()

    if isinstance(parsed_payload, dict):
        for key in IDEMPOTENCY_PAYLOAD_KEYS:
            value = parsed_payload.get(key)
            if value not in (None, ""):
                return str(value)

        if parsed_payload.get("object") == "event" and parsed_payload.get("id"):
            return str(parsed_payload["id"])

    return None


def _format_webhook_task_input(
    webhook_name: str,
    payload_text: str,
    content_type: str,
) -> str:
    parts = [f"Webhook '{webhook_name}' triggered."]
    if content_type:
        parts.append(f"Content-Type: {content_type}")
    parts.append("Payload:")
    parts.append(payload_text)
    return "\n\n".join(parts)


def _serialize_webhook_payload(raw_body: bytes, parsed_payload: object | None) -> str:
    if not raw_body:
        return "Webhook triggered without a request body."
    if isinstance(parsed_payload, str):
        return parsed_payload
    if parsed_payload is not None:
        return json.dumps(
            parsed_payload,
            indent=2,
            ensure_ascii=False,
        )
    return raw_body.decode("utf-8", errors="replace")


def _build_payload_preview(payload_text: str) -> tuple[str, bool]:
    limit = settings.WEBHOOK_DELIVERY_PAYLOAD_PREVIEW_CHARS
    if len(payload_text) <= limit:
        return payload_text, False
    truncated = payload_text[:limit].rstrip()
    return f"{truncated}...", True


async def _wait_for_existing_task_id(
    webhook_id: str,
    idempotency_key: str,
    existing_claim: dict | None,
) -> str | None:
    claim = existing_claim
    for _ in range(IDEMPOTENCY_TASK_WAIT_ATTEMPTS):
        if claim and isinstance(claim.get("taskId"), str) and claim["taskId"]:
            return claim["taskId"]
        await asyncio.sleep(IDEMPOTENCY_TASK_WAIT_SECONDS)
        claim = await WebhookService.get_idempotency_claim(webhook_id, idempotency_key)

    if claim and isinstance(claim.get("taskId"), str) and claim["taskId"]:
        return claim["taskId"]
    return None


@router.get(
    "",
    response_model=list[WebhookResponse],
    dependencies=[Depends(get_current_active_user)],
)
async def list_webhooks():
    return await WebhookService.list_webhooks()


@router.get(
    "/{webhook_id}/deliveries",
    response_model=WebhookDeliveryListResponse,
)
async def list_webhook_deliveries(
    webhook_id: ValidObjectId,
    status: WebhookDeliveryStatus | None = Query(None),
    from_time: datetime | None = Query(None, alias="from"),
    to_time: datetime | None = Query(None, alias="to"),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    current_user: UserInDB = Depends(get_current_active_user),
):
    del current_user
    _validate_delivery_range(from_time, to_time)
    webhook = await WebhookService.get_webhook(webhook_id)
    if not webhook:
        raise NotFoundError("webhook_not_found", "Webhook not found")
    return await WebhookService.list_delivery_logs(
        webhook_id,
        status=status,
        from_time=from_time,
        to_time=to_time,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/{webhook_id}/deliveries/export",
    dependencies=[Depends(get_current_active_user)],
)
async def export_webhook_deliveries(
    webhook_id: ValidObjectId,
    status: WebhookDeliveryStatus | None = Query(None),
    from_time: datetime | None = Query(None, alias="from"),
    to_time: datetime | None = Query(None, alias="to"),
):
    _validate_delivery_range(from_time, to_time)
    webhook = await WebhookService.get_webhook(webhook_id)
    if not webhook:
        raise NotFoundError("webhook_not_found", "Webhook not found")

    try:
        deliveries = await WebhookService.export_delivery_logs(
            webhook_id,
            status=status,
            from_time=from_time,
            to_time=to_time,
        )
    except ValueError as exc:
        raise BadRequestError(
            "webhook_delivery_export_too_large",
            str(exc),
        ) from exc

    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer)
    writer.writerow(
        [
            "deliveryId",
            "webhookId",
            "status",
            "receivedAt",
            "updatedAt",
            "taskId",
            "duplicate",
            "idempotencyKey",
            "requestMethod",
            "contentType",
            "payloadSizeBytes",
            "payloadTruncated",
            "error",
            "payloadPreview",
        ]
    )
    for delivery in deliveries:
        writer.writerow(
            [
                delivery.id,
                delivery.webhookId,
                delivery.status.value,
                delivery.receivedAt.isoformat(),
                delivery.updatedAt.isoformat() if delivery.updatedAt else "",
                delivery.taskId or "",
                str(delivery.duplicate).lower(),
                delivery.idempotencyKey or "",
                delivery.requestMethod,
                delivery.contentType or "",
                delivery.payloadSizeBytes,
                str(delivery.payloadTruncated).lower(),
                delivery.error or "",
                delivery.payloadPreview or "",
            ]
        )

    timestamp_suffix = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"{_slugify_filename(webhook.name)}-deliveries-{timestamp_suffix}.csv"
    return Response(
        content=csv_buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/runtime-health",
    response_model=WebhookRuntimeHealthResponse,
    dependencies=[Depends(get_current_active_user)],
)
async def get_webhook_runtime_health():
    job_snapshot = get_webhook_cleanup_job_snapshot()
    return await WebhookService.get_runtime_health(
        job_scheduled=bool(job_snapshot["jobScheduled"]),
        next_scheduled_run_at=job_snapshot["nextScheduledRunAt"],
    )


@router.get(
    "/runtime-health/test-notification-preview",
    response_model=WebhookTestNotificationPreviewResponse,
    dependencies=[Depends(get_current_active_user)],
)
async def get_webhook_runtime_health_test_notification_preview(
    kind: WebhookTestNotificationKind = Query(...),
):
    job_snapshot = get_webhook_cleanup_job_snapshot()
    return await WebhookService.build_test_notification_preview(
        kind,
        job_scheduled=bool(job_snapshot["jobScheduled"]),
        next_scheduled_run_at=job_snapshot["nextScheduledRunAt"],
    )


@router.post(
    "/runtime-health/test-notification",
    response_model=WebhookTestNotificationResponse,
    dependencies=[Depends(get_current_active_user)],
)
async def send_webhook_runtime_health_test_notification(
    kind: WebhookTestNotificationKind = Query(...),
):
    job_snapshot = get_webhook_cleanup_job_snapshot()
    try:
        return await WebhookService.send_test_notification(
            kind,
            job_scheduled=bool(job_snapshot["jobScheduled"]),
            next_scheduled_run_at=job_snapshot["nextScheduledRunAt"],
        )
    except ValueError as exc:
        raise BadRequestError(
            "webhook_alert_hook_not_configured",
            str(exc),
        ) from exc


@router.post("", response_model=WebhookSecretResponse, status_code=201)
async def create_webhook(
    data: WebhookCreate,
    request: Request,
    current_user: UserInDB = Depends(get_current_active_user),
):
    await _get_active_agent_or_raise(data.agentId)
    webhook, token = await WebhookService.create_webhook(
        data,
        created_by=current_user.id,
    )
    return WebhookSecretResponse(
        **webhook.model_dump(),
        token=token,
        triggerUrl=_build_trigger_url(request, token),
    )


@router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: ValidObjectId,
    data: WebhookUpdate,
    current_user: UserInDB = Depends(get_current_active_user),
):
    if data.agentId is not None:
        await _get_active_agent_or_raise(data.agentId)

    webhook = await WebhookService.update_webhook(
        webhook_id,
        data,
        updated_by=current_user.id,
    )
    if not webhook:
        raise NotFoundError("webhook_not_found", "Webhook not found")
    return webhook


@router.delete("/{webhook_id}")
async def delete_webhook(
    webhook_id: ValidObjectId,
    current_user: UserInDB = Depends(get_current_active_user),
):
    deleted = await WebhookService.delete_webhook(webhook_id)
    if not deleted:
        raise NotFoundError("webhook_not_found", "Webhook not found")
    return {"message": "Webhook deleted", "webhookId": webhook_id}


@router.post("/{webhook_id}/rotate-token", response_model=WebhookSecretResponse)
async def rotate_webhook_token(
    webhook_id: ValidObjectId,
    request: Request,
    current_user: UserInDB = Depends(get_current_active_user),
):
    webhook, token = await WebhookService.rotate_webhook_token(
        webhook_id,
        updated_by=current_user.id,
    )
    if not webhook:
        raise NotFoundError("webhook_not_found", "Webhook not found")
    return WebhookSecretResponse(
        **webhook.model_dump(),
        token=token,
        triggerUrl=_build_trigger_url(request, token),
    )


@router.post(
    "/agent/{token}",
    response_model=WebhookTriggerResponse,
    name="trigger_agent_webhook",
)
async def trigger_webhook(
    token: str,
    request: Request,
    background_tasks: BackgroundTasks,
):
    webhook = await WebhookService.get_webhook_by_token(token)
    if not webhook or not webhook.active:
        raise NotFoundError("webhook_not_found", "Webhook not found")

    raw_body, parsed_payload, content_type = await _read_webhook_payload(request)
    payload_text = _serialize_webhook_payload(raw_body, parsed_payload)
    payload_preview, payload_truncated = _build_payload_preview(payload_text)
    idempotency_key = _extract_idempotency_key(request, parsed_payload)
    delivery_id = await WebhookService.create_delivery_log(
        webhook.id,
        idempotency_key=idempotency_key,
        request_method=request.method,
        content_type=content_type or None,
        payload_preview=payload_preview,
        payload_size_bytes=len(raw_body),
        payload_truncated=payload_truncated,
    )

    if idempotency_key:
        claimed, existing_claim = await WebhookService.claim_idempotency_key(
            webhook.id,
            idempotency_key,
        )
        if not claimed:
            task_id = await _wait_for_existing_task_id(
                webhook.id,
                idempotency_key,
                existing_claim,
            )
            if task_id is None:
                await WebhookService.update_delivery_log(
                    delivery_id,
                    status=WebhookDeliveryStatus.FAILED,
                    duplicate=True,
                    error=(
                        "Webhook event has already been accepted and is still being processed."
                    ),
                )
                raise BadRequestError(
                    "webhook_duplicate_processing",
                    "Webhook event has already been accepted and is still being processed.",
                )
            await WebhookService.update_delivery_log(
                delivery_id,
                status=WebhookDeliveryStatus.DUPLICATE,
                task_id=task_id,
                duplicate=True,
            )
            return WebhookTriggerResponse(
                message="Duplicate webhook delivery ignored; existing task returned",
                webhookId=webhook.id,
                taskId=task_id,
                duplicate=True,
                idempotencyKey=idempotency_key,
            )

    agent = await AgentService.get_agent(webhook.agentId)
    if not agent or not agent.active:
        await WebhookService.update_delivery_log(
            delivery_id,
            status=WebhookDeliveryStatus.FAILED,
            error="Webhook agent is unavailable.",
        )
        raise BadRequestError(
            "webhook_agent_unavailable",
            "Webhook agent is unavailable.",
        )

    try:
        task = await TaskService.create_task(
            TaskCreate(
                title=webhook.taskTitle,
                input=_format_webhook_task_input(
                    webhook.name,
                    payload_text,
                    content_type,
                ),
                assignedAgentId=webhook.agentId,
                createdBy=f"webhook:{webhook.id}",
                allowDelegation=webhook.allowDelegation,
                requiresApproval=webhook.requiresApproval,
            )
        )
    except Exception as exc:
        if idempotency_key:
            await WebhookService.release_idempotency_claim(
                webhook.id,
                idempotency_key,
            )
        await WebhookService.update_delivery_log(
            delivery_id,
            status=WebhookDeliveryStatus.FAILED,
            error=str(exc),
        )
        raise

    if idempotency_key:
        await WebhookService.complete_idempotency_claim(
            webhook.id,
            idempotency_key,
            task.id,
        )
    await WebhookService.update_delivery_log(
        delivery_id,
        status=WebhookDeliveryStatus.ACCEPTED,
        task_id=task.id,
        duplicate=False,
    )
    await WebhookService.mark_triggered(webhook.id)
    background_tasks.add_task(Orchestrator.execute_task, task.id)

    return WebhookTriggerResponse(
        message="Webhook accepted and task execution started",
        webhookId=webhook.id,
        taskId=task.id,
        duplicate=False,
        idempotencyKey=idempotency_key,
    )
