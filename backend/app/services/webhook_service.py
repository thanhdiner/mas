from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from pymongo.errors import DuplicateKeyError

from app.config import get_settings
from app.database import get_db
from app.models.webhook import (
    WebhookAlertingStatusResponse,
    WebhookCleanupStatusResponse,
    WebhookCreate,
    WebhookDeliveryListResponse,
    WebhookDeliveryResponse,
    WebhookDeliveryStatus,
    WebhookRuntimeHealthResponse,
    WebhookResponse,
    WebhookTestNotificationKind,
    WebhookUpdate,
)
from app.utils.doc_parser import doc_to_model
from app.utils.object_id import to_object_id, try_to_object_id

settings = get_settings()
WEBHOOK_RUNTIME_STATE_ID = "webhook_runtime_cleanup"


def _generate_webhook_token() -> str:
    return secrets.token_urlsafe(24)


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _hash_webhook_token(token: str) -> str:
    return _hash_value(token)


def _hash_idempotency_key(idempotency_key: str) -> str:
    return _hash_value(idempotency_key.strip())


async def _resolve_agent_name(agent_id: str | None) -> str | None:
    if not agent_id:
        return None

    db = get_db()
    object_id = try_to_object_id(agent_id)
    if object_id is None:
        return None

    agent_doc = await db.agents.find_one({"_id": object_id})
    if not agent_doc:
        return None
    return agent_doc.get("name")


def _doc_to_response(doc: dict, *, agent_name: str | None = None) -> WebhookResponse:
    return doc_to_model(doc, WebhookResponse, agentName=agent_name)


def _delivery_doc_to_response(doc: dict) -> WebhookDeliveryResponse:
    return doc_to_model(doc, WebhookDeliveryResponse)


def _extract_index_keys(index_info: dict) -> set[tuple[tuple[str, int], ...]]:
    keys: set[tuple[tuple[str, int], ...]] = set()
    for info in index_info.values():
        key_pairs = info.get("key")
        if not key_pairs:
            continue
        keys.add(tuple((str(field), int(direction)) for field, direction in key_pairs))
    return keys


def _build_delivery_query(
    webhook_id: str,
    *,
    status: WebhookDeliveryStatus | None = None,
    from_time: datetime | None = None,
    to_time: datetime | None = None,
) -> dict[str, object]:
    query: dict[str, object] = {"webhookId": webhook_id}
    if status is not None:
        query["status"] = status.value
    if from_time is not None or to_time is not None:
        received_at_query: dict[str, datetime] = {}
        if from_time is not None:
            received_at_query["$gte"] = from_time
        if to_time is not None:
            received_at_query["$lte"] = to_time
        query["receivedAt"] = received_at_query
    return query


def _build_backlog_alert_text(
    runtime_health: WebhookRuntimeHealthResponse,
) -> str:
    oldest = (
        runtime_health.oldestExpiredDeliveryAt.isoformat()
        if runtime_health.oldestExpiredDeliveryAt
        else "unknown"
    )
    last_success = (
        runtime_health.cleanup.lastSuccessAt.isoformat()
        if runtime_health.cleanup.lastSuccessAt
        else "never"
    )
    return (
        f"{settings.APP_NAME}: webhook cleanup backlog alert. "
        f"{runtime_health.expiredDeliveriesPending} expired delivery logs are pending cleanup. "
        f"Oldest expired delivery: {oldest}. "
        f"Last successful cleanup: {last_success}. "
        f"Threshold: {runtime_health.deliveryBacklogAlertThresholdHours}h."
    )


def _build_backlog_resolved_text(
    runtime_health: WebhookRuntimeHealthResponse,
) -> str:
    last_run = (
        runtime_health.cleanup.lastRunAt.isoformat()
        if runtime_health.cleanup.lastRunAt
        else "unknown"
    )
    return (
        f"{settings.APP_NAME}: webhook cleanup backlog resolved. "
        f"Expired delivery backlog has cleared. "
        f"Last cleanup run: {last_run}. "
        f"Cleanup removed {runtime_health.cleanup.deliveriesDeleted} deliveries and "
        f"{runtime_health.cleanup.idempotencyDeleted} idempotency claims."
    )


def _build_test_notification_text(
    kind: WebhookTestNotificationKind,
    runtime_health: WebhookRuntimeHealthResponse,
) -> str:
    incident_status = "open" if runtime_health.alerting.incidentOpen else "clear"
    if kind == WebhookTestNotificationKind.ALERT:
        return (
            f"{settings.APP_NAME}: manual test alert for webhook cleanup notifications. "
            f"Current expired delivery backlog: {runtime_health.expiredDeliveriesPending}. "
            f"Incident state: {incident_status}. "
            f"Threshold: {runtime_health.deliveryBacklogAlertThresholdHours}h."
        )

    return (
        f"{settings.APP_NAME}: manual test resolved notification for webhook cleanup notifications. "
        f"Current expired delivery backlog: {runtime_health.expiredDeliveriesPending}. "
        f"Incident state: {incident_status}. "
        f"Last cleanup run: "
        f"{runtime_health.cleanup.lastRunAt.isoformat() if runtime_health.cleanup.lastRunAt else 'unknown'}."
    )


def _get_test_notification_metadata(
    kind: WebhookTestNotificationKind,
) -> tuple[str, str, str]:
    if kind == WebhookTestNotificationKind.ALERT:
        return (
            "webhook_delivery_backlog_alert_test",
            "Manual test alert sent for webhook delivery backlog notifications.",
            "warning",
        )

    return (
        "webhook_delivery_backlog_resolved_test",
        "Manual test resolved notification sent for webhook delivery backlog notifications.",
        "info",
    )


class WebhookService:
    @staticmethod
    async def list_webhooks(skip: int = 0, limit: int = 100) -> list[WebhookResponse]:
        db = get_db()
        cursor = db.webhooks.find({}).skip(skip).limit(limit).sort("createdAt", -1)
        docs = await cursor.to_list(length=limit)

        responses: list[WebhookResponse] = []
        for doc in docs:
            agent_name = await _resolve_agent_name(doc.get("agentId"))
            responses.append(_doc_to_response(doc, agent_name=agent_name))
        return responses

    @staticmethod
    async def get_webhook(webhook_id: str) -> Optional[WebhookResponse]:
        db = get_db()
        doc = await db.webhooks.find_one({"_id": to_object_id(webhook_id, "webhook_id")})
        if not doc:
            return None

        agent_name = await _resolve_agent_name(doc.get("agentId"))
        return _doc_to_response(doc, agent_name=agent_name)

    @staticmethod
    async def create_webhook(
        data: WebhookCreate,
        *,
        created_by: str,
    ) -> tuple[WebhookResponse, str]:
        db = get_db()
        now = datetime.now(timezone.utc)
        token = _generate_webhook_token()
        doc = {
            **data.model_dump(),
            "tokenHash": _hash_webhook_token(token),
            "createdBy": created_by,
            "updatedBy": created_by,
            "lastTriggeredAt": None,
            "createdAt": now,
            "updatedAt": None,
        }
        result = await db.webhooks.insert_one(doc)
        doc["_id"] = result.inserted_id
        agent_name = await _resolve_agent_name(doc.get("agentId"))
        return _doc_to_response(doc, agent_name=agent_name), token

    @staticmethod
    async def update_webhook(
        webhook_id: str,
        data: WebhookUpdate,
        *,
        updated_by: str,
    ) -> Optional[WebhookResponse]:
        db = get_db()
        update_data = {
            key: value for key, value in data.model_dump().items() if value is not None
        }
        if not update_data:
            return await WebhookService.get_webhook(webhook_id)

        update_data["updatedAt"] = datetime.now(timezone.utc)
        update_data["updatedBy"] = updated_by

        await db.webhooks.update_one(
            {"_id": to_object_id(webhook_id, "webhook_id")},
            {"$set": update_data},
        )
        return await WebhookService.get_webhook(webhook_id)

    @staticmethod
    async def delete_webhook(webhook_id: str) -> bool:
        db = get_db()
        result = await db.webhooks.delete_one(
            {"_id": to_object_id(webhook_id, "webhook_id")}
        )
        return result.deleted_count > 0

    @staticmethod
    async def rotate_webhook_token(
        webhook_id: str,
        *,
        updated_by: str,
    ) -> tuple[Optional[WebhookResponse], str]:
        db = get_db()
        token = _generate_webhook_token()
        await db.webhooks.update_one(
            {"_id": to_object_id(webhook_id, "webhook_id")},
            {
                "$set": {
                    "tokenHash": _hash_webhook_token(token),
                    "updatedAt": datetime.now(timezone.utc),
                    "updatedBy": updated_by,
                }
            },
        )
        webhook = await WebhookService.get_webhook(webhook_id)
        return webhook, token

    @staticmethod
    async def get_webhook_by_token(token: str) -> Optional[WebhookResponse]:
        db = get_db()
        doc = await db.webhooks.find_one({"tokenHash": _hash_webhook_token(token)})
        if not doc:
            return None

        agent_name = await _resolve_agent_name(doc.get("agentId"))
        return _doc_to_response(doc, agent_name=agent_name)

    @staticmethod
    async def mark_triggered(webhook_id: str) -> None:
        db = get_db()
        now = datetime.now(timezone.utc)
        await db.webhooks.update_one(
            {"_id": to_object_id(webhook_id, "webhook_id")},
            {"$set": {"lastTriggeredAt": now, "updatedAt": now}},
        )

    @staticmethod
    async def list_delivery_logs(
        webhook_id: str,
        *,
        status: WebhookDeliveryStatus | None = None,
        from_time: datetime | None = None,
        to_time: datetime | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> WebhookDeliveryListResponse:
        db = get_db()
        query = _build_delivery_query(
            webhook_id,
            status=status,
            from_time=from_time,
            to_time=to_time,
        )

        cursor = (
            db.webhook_deliveries
            .find(query)
            .sort("receivedAt", -1)
            .skip(skip)
            .limit(limit)
        )
        total = await db.webhook_deliveries.count_documents(query)
        docs = await cursor.to_list(length=limit)
        items = [_delivery_doc_to_response(doc) for doc in docs]
        return WebhookDeliveryListResponse(
            items=items,
            total=total,
            skip=skip,
            limit=limit,
            hasMore=skip + len(items) < total,
            status=status,
            fromTime=from_time,
            toTime=to_time,
        )

    @staticmethod
    async def export_delivery_logs(
        webhook_id: str,
        *,
        status: WebhookDeliveryStatus | None = None,
        from_time: datetime | None = None,
        to_time: datetime | None = None,
    ) -> list[WebhookDeliveryResponse]:
        db = get_db()
        query = _build_delivery_query(
            webhook_id,
            status=status,
            from_time=from_time,
            to_time=to_time,
        )
        total = await db.webhook_deliveries.count_documents(query)
        if total > settings.WEBHOOK_DELIVERY_EXPORT_MAX_RECORDS:
            raise ValueError(
                "Too many delivery log rows match this export. Narrow the date range or filters before exporting."
            )

        cursor = (
            db.webhook_deliveries.find(query)
            .sort("receivedAt", -1)
            .limit(settings.WEBHOOK_DELIVERY_EXPORT_MAX_RECORDS)
        )
        docs = await cursor.to_list(length=settings.WEBHOOK_DELIVERY_EXPORT_MAX_RECORDS)
        return [_delivery_doc_to_response(doc) for doc in docs]

    @staticmethod
    async def create_delivery_log(
        webhook_id: str,
        *,
        idempotency_key: str | None = None,
        request_method: str = "POST",
        content_type: str | None = None,
        payload_preview: str | None = None,
        payload_size_bytes: int = 0,
        payload_truncated: bool = False,
    ) -> str:
        db = get_db()
        now = datetime.now(timezone.utc)
        doc = {
            "webhookId": webhook_id,
            "status": WebhookDeliveryStatus.PROCESSING.value,
            "taskId": None,
            "duplicate": False,
            "idempotencyKey": idempotency_key,
            "requestMethod": request_method,
            "contentType": content_type,
            "payloadPreview": payload_preview,
            "payloadSizeBytes": payload_size_bytes,
            "payloadTruncated": payload_truncated,
            "error": None,
            "receivedAt": now,
            "updatedAt": now,
        }
        result = await db.webhook_deliveries.insert_one(doc)
        return str(result.inserted_id)

    @staticmethod
    async def update_delivery_log(
        delivery_id: str,
        *,
        status: WebhookDeliveryStatus,
        task_id: str | None = None,
        duplicate: bool | None = None,
        error: str | None = None,
    ) -> None:
        db = get_db()
        update_data = {
            "status": status.value,
            "updatedAt": datetime.now(timezone.utc),
        }
        if task_id is not None:
            update_data["taskId"] = task_id
        if duplicate is not None:
            update_data["duplicate"] = duplicate
        if error is not None:
            update_data["error"] = error

        await db.webhook_deliveries.update_one(
            {"_id": to_object_id(delivery_id, "delivery_id")},
            {"$set": update_data},
        )

    @staticmethod
    async def claim_idempotency_key(
        webhook_id: str,
        idempotency_key: str,
    ) -> tuple[bool, dict | None]:
        db = get_db()
        now = datetime.now(timezone.utc)
        key_hash = _hash_idempotency_key(idempotency_key)
        query = {
            "webhookId": webhook_id,
            "idempotencyKeyHash": key_hash,
        }
        doc = {
            **query,
            "taskId": None,
            "status": "processing",
            "createdAt": now,
            "updatedAt": now,
        }

        try:
            await db.webhook_idempotency.insert_one(doc)
        except DuplicateKeyError:
            existing = await db.webhook_idempotency.find_one(query)
            return False, existing
        return True, doc

    @staticmethod
    async def get_idempotency_claim(
        webhook_id: str,
        idempotency_key: str,
    ) -> dict | None:
        db = get_db()
        return await db.webhook_idempotency.find_one(
            {
                "webhookId": webhook_id,
                "idempotencyKeyHash": _hash_idempotency_key(idempotency_key),
            }
        )

    @staticmethod
    async def complete_idempotency_claim(
        webhook_id: str,
        idempotency_key: str,
        task_id: str,
    ) -> None:
        db = get_db()
        await db.webhook_idempotency.update_one(
            {
                "webhookId": webhook_id,
                "idempotencyKeyHash": _hash_idempotency_key(idempotency_key),
            },
            {
                "$set": {
                    "taskId": task_id,
                    "status": "accepted",
                    "updatedAt": datetime.now(timezone.utc),
                }
            },
        )

    @staticmethod
    async def release_idempotency_claim(
        webhook_id: str,
        idempotency_key: str,
    ) -> None:
        db = get_db()
        await db.webhook_idempotency.delete_one(
            {
                "webhookId": webhook_id,
                "idempotencyKeyHash": _hash_idempotency_key(idempotency_key),
            }
        )

    @staticmethod
    async def cleanup_expired_runtime_data() -> dict[str, int]:
        db = get_db()
        now = datetime.now(timezone.utc)
        delivery_cutoff = now - timedelta(days=settings.WEBHOOK_DELIVERY_RETENTION_DAYS)
        idempotency_cutoff = now - timedelta(days=settings.WEBHOOK_IDEMPOTENCY_RETENTION_DAYS)

        deleted_deliveries = await db.webhook_deliveries.delete_many(
            {"receivedAt": {"$lt": delivery_cutoff}}
        )
        deleted_idempotency = await db.webhook_idempotency.delete_many(
            {"updatedAt": {"$lt": idempotency_cutoff}}
        )

        return {
            "deliveriesDeleted": deleted_deliveries.deleted_count,
            "idempotencyDeleted": deleted_idempotency.deleted_count,
        }

    @staticmethod
    async def record_cleanup_run(
        *,
        status: str,
        started_at: datetime,
        finished_at: datetime,
        deliveries_deleted: int = 0,
        idempotency_deleted: int = 0,
        error: str | None = None,
    ) -> None:
        db = get_db()
        update_data = {
            "type": WEBHOOK_RUNTIME_STATE_ID,
            "lastRunAt": finished_at,
            "lastStatus": status,
            "lastDurationMs": max(
                int((finished_at - started_at).total_seconds() * 1000),
                0,
            ),
            "deliveriesDeleted": deliveries_deleted,
            "idempotencyDeleted": idempotency_deleted,
            "lastError": error,
            "updatedAt": finished_at,
        }
        if status == "success":
            update_data["lastSuccessAt"] = finished_at

        await db.webhook_runtime_state.update_one(
            {"_id": WEBHOOK_RUNTIME_STATE_ID},
            {"$set": update_data},
            upsert=True,
        )

    @staticmethod
    async def record_alert_dispatch(
        *,
        attempted_at: datetime,
        status: str,
        sent_at: datetime | None = None,
        error: str | None = None,
    ) -> None:
        db = get_db()
        update_data = {
            "type": WEBHOOK_RUNTIME_STATE_ID,
            "lastAlertAttemptAt": attempted_at,
            "lastAlertStatus": status,
            "lastAlertError": error,
            "updatedAt": attempted_at,
        }
        if sent_at is not None:
            update_data["lastAlertSentAt"] = sent_at
        if status == "sent":
            update_data["backlogAlertOpen"] = True

        await db.webhook_runtime_state.update_one(
            {"_id": WEBHOOK_RUNTIME_STATE_ID},
            {"$set": update_data},
            upsert=True,
        )

    @staticmethod
    async def record_resolved_dispatch(
        *,
        attempted_at: datetime,
        status: str,
        sent_at: datetime | None = None,
        error: str | None = None,
    ) -> None:
        db = get_db()
        update_data = {
            "type": WEBHOOK_RUNTIME_STATE_ID,
            "lastResolvedAttemptAt": attempted_at,
            "lastResolvedStatus": status,
            "lastResolvedError": error,
            "updatedAt": attempted_at,
        }
        if sent_at is not None:
            update_data["lastResolvedSentAt"] = sent_at
        if status == "sent":
            update_data["backlogAlertOpen"] = False

        await db.webhook_runtime_state.update_one(
            {"_id": WEBHOOK_RUNTIME_STATE_ID},
            {"$set": update_data},
            upsert=True,
        )

    @staticmethod
    async def get_runtime_health(
        *,
        job_scheduled: bool = False,
        next_scheduled_run_at: datetime | None = None,
    ) -> WebhookRuntimeHealthResponse:
        db = get_db()
        now = datetime.now(timezone.utc)
        delivery_cutoff = now - timedelta(days=settings.WEBHOOK_DELIVERY_RETENTION_DAYS)
        idempotency_cutoff = now - timedelta(days=settings.WEBHOOK_IDEMPOTENCY_RETENTION_DAYS)

        expired_deliveries_pending = await db.webhook_deliveries.count_documents(
            {"receivedAt": {"$lt": delivery_cutoff}}
        )
        expired_idempotency_pending = await db.webhook_idempotency.count_documents(
            {"updatedAt": {"$lt": idempotency_cutoff}}
        )
        oldest_expired_delivery_docs = await (
            db.webhook_deliveries.find({"receivedAt": {"$lt": delivery_cutoff}})
            .sort("receivedAt", 1)
            .limit(1)
            .to_list(length=1)
        )
        oldest_expired_delivery_at = (
            oldest_expired_delivery_docs[0].get("receivedAt")
            if oldest_expired_delivery_docs
            else None
        )

        delivery_index_info = await db.webhook_deliveries.index_information()
        idempotency_index_info = await db.webhook_idempotency.index_information()
        delivery_keys = _extract_index_keys(delivery_index_info)
        idempotency_keys = _extract_index_keys(idempotency_index_info)

        state_doc = await db.webhook_runtime_state.find_one(
            {"_id": WEBHOOK_RUNTIME_STATE_ID}
        )

        cleanup = WebhookCleanupStatusResponse(
            lastRunAt=state_doc.get("lastRunAt") if state_doc else None,
            lastSuccessAt=state_doc.get("lastSuccessAt") if state_doc else None,
            lastStatus=state_doc.get("lastStatus", "never_run") if state_doc else "never_run",
            lastDurationMs=state_doc.get("lastDurationMs") if state_doc else None,
            deliveriesDeleted=state_doc.get("deliveriesDeleted", 0) if state_doc else 0,
            idempotencyDeleted=state_doc.get("idempotencyDeleted", 0) if state_doc else 0,
            lastError=state_doc.get("lastError") if state_doc else None,
        )
        alerting = WebhookAlertingStatusResponse(
            configured=bool(settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL),
            cooldownMinutes=settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_COOLDOWN_MINUTES,
            timeoutSeconds=settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_TIMEOUT_SECONDS,
            incidentOpen=state_doc.get("backlogAlertOpen", False) if state_doc else False,
            lastAttemptAt=state_doc.get("lastAlertAttemptAt") if state_doc else None,
            lastSentAt=state_doc.get("lastAlertSentAt") if state_doc else None,
            lastStatus=(
                state_doc.get("lastAlertStatus", "idle")
                if settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL
                else "disabled"
            )
            if state_doc
            else ("idle" if settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL else "disabled"),
            lastError=state_doc.get("lastAlertError") if state_doc else None,
            lastResolvedAttemptAt=(
                state_doc.get("lastResolvedAttemptAt") if state_doc else None
            ),
            lastResolvedSentAt=(
                state_doc.get("lastResolvedSentAt") if state_doc else None
            ),
            lastResolvedStatus=(
                state_doc.get("lastResolvedStatus", "idle")
                if settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL
                else "disabled"
            )
            if state_doc
            else ("idle" if settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL else "disabled"),
            lastResolvedError=(
                state_doc.get("lastResolvedError") if state_doc else None
            ),
        )
        alert_threshold_hours = settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_HOURS
        delivery_backlog_alert = False
        delivery_backlog_alert_message: str | None = None
        if expired_deliveries_pending > 0:
            if cleanup.lastSuccessAt is None:
                delivery_backlog_alert = True
                delivery_backlog_alert_message = (
                    "Expired delivery logs are pending cleanup, but the cleanup job has never completed successfully."
                )
            else:
                hours_since_success = (
                    now - cleanup.lastSuccessAt
                ).total_seconds() / 3600
                if hours_since_success >= alert_threshold_hours:
                    delivery_backlog_alert = True
                    delivery_backlog_alert_message = (
                        "Expired delivery logs are still pending cleanup. "
                        f"The last successful cleanup ran about {int(hours_since_success)} hours ago."
                    )

        return WebhookRuntimeHealthResponse(
            deliveryRetentionDays=settings.WEBHOOK_DELIVERY_RETENTION_DAYS,
            idempotencyRetentionDays=settings.WEBHOOK_IDEMPOTENCY_RETENTION_DAYS,
            cleanupIntervalHours=settings.WEBHOOK_RUNTIME_CLEANUP_INTERVAL_HOURS,
            deliveryBacklogAlertThresholdHours=alert_threshold_hours,
            deliveryCutoff=delivery_cutoff,
            idempotencyCutoff=idempotency_cutoff,
            expiredDeliveriesPending=expired_deliveries_pending,
            expiredIdempotencyPending=expired_idempotency_pending,
            oldestExpiredDeliveryAt=oldest_expired_delivery_at,
            deliveryBacklogAlert=delivery_backlog_alert,
            deliveryBacklogAlertMessage=delivery_backlog_alert_message,
            deliveryRetentionIndexReady=(("receivedAt", 1),) in delivery_keys,
            idempotencyRetentionIndexReady=(("updatedAt", 1),) in idempotency_keys,
            deliveryListIndexReady=(
                ("webhookId", 1),
                ("status", 1),
                ("receivedAt", -1),
            ) in delivery_keys,
            jobScheduled=job_scheduled,
            nextScheduledRunAt=next_scheduled_run_at,
            cleanup=cleanup,
            alerting=alerting,
        )

    @staticmethod
    async def maybe_dispatch_backlog_alert(
        *,
        job_scheduled: bool = False,
        next_scheduled_run_at: datetime | None = None,
    ) -> bool:
        if not settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL:
            return False

        db = get_db()
        state_doc = await db.webhook_runtime_state.find_one(
            {"_id": WEBHOOK_RUNTIME_STATE_ID}
        )
        now = datetime.now(timezone.utc)
        last_sent_at = state_doc.get("lastAlertSentAt") if state_doc else None
        cooldown = timedelta(
            minutes=settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_COOLDOWN_MINUTES
        )
        if last_sent_at and now - last_sent_at < cooldown:
            return False

        runtime_health = await WebhookService.get_runtime_health(
            job_scheduled=job_scheduled,
            next_scheduled_run_at=next_scheduled_run_at,
        )
        if not runtime_health.deliveryBacklogAlert:
            return False

        payload = {
            "event": "webhook_delivery_backlog_alert",
            "severity": "warning",
            "app": settings.APP_NAME,
            "message": runtime_health.deliveryBacklogAlertMessage,
            "text": _build_backlog_alert_text(runtime_health),
            "generatedAt": now.isoformat(),
            "runtimeHealth": runtime_health.model_dump(mode="json"),
        }

        try:
            async with httpx.AsyncClient(
                timeout=settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_TIMEOUT_SECONDS
            ) as client:
                response = await client.post(
                    settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL,
                    json=payload,
                )
                response.raise_for_status()
        except Exception as exc:
            await WebhookService.record_alert_dispatch(
                attempted_at=now,
                status="failed",
                error=str(exc),
            )
            raise

        sent_at = datetime.now(timezone.utc)
        await WebhookService.record_alert_dispatch(
            attempted_at=now,
            sent_at=sent_at,
            status="sent",
            error=None,
        )
        return True

    @staticmethod
    async def maybe_dispatch_backlog_resolved(
        *,
        job_scheduled: bool = False,
        next_scheduled_run_at: datetime | None = None,
    ) -> bool:
        if not settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL:
            return False

        db = get_db()
        state_doc = await db.webhook_runtime_state.find_one(
            {"_id": WEBHOOK_RUNTIME_STATE_ID}
        )
        if not state_doc or not state_doc.get("backlogAlertOpen"):
            return False

        runtime_health = await WebhookService.get_runtime_health(
            job_scheduled=job_scheduled,
            next_scheduled_run_at=next_scheduled_run_at,
        )
        if runtime_health.deliveryBacklogAlert:
            return False

        now = datetime.now(timezone.utc)
        payload = {
            "event": "webhook_delivery_backlog_resolved",
            "severity": "info",
            "app": settings.APP_NAME,
            "message": "Webhook delivery backlog has cleared.",
            "text": _build_backlog_resolved_text(runtime_health),
            "generatedAt": now.isoformat(),
            "runtimeHealth": runtime_health.model_dump(mode="json"),
        }

        try:
            async with httpx.AsyncClient(
                timeout=settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_TIMEOUT_SECONDS
            ) as client:
                response = await client.post(
                    settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL,
                    json=payload,
                )
                response.raise_for_status()
        except Exception as exc:
            await WebhookService.record_resolved_dispatch(
                attempted_at=now,
                status="failed",
                error=str(exc),
            )
            raise

        sent_at = datetime.now(timezone.utc)
        await WebhookService.record_resolved_dispatch(
            attempted_at=now,
            sent_at=sent_at,
            status="sent",
            error=None,
        )
        return True

    @staticmethod
    async def reconcile_backlog_notifications(
        *,
        job_scheduled: bool = False,
        next_scheduled_run_at: datetime | None = None,
    ) -> str | None:
        if await WebhookService.maybe_dispatch_backlog_alert(
            job_scheduled=job_scheduled,
            next_scheduled_run_at=next_scheduled_run_at,
        ):
            return "alert"
        if await WebhookService.maybe_dispatch_backlog_resolved(
            job_scheduled=job_scheduled,
            next_scheduled_run_at=next_scheduled_run_at,
        ):
            return "resolved"
        return None

    @staticmethod
    async def send_test_notification(
        kind: WebhookTestNotificationKind,
        *,
        job_scheduled: bool = False,
        next_scheduled_run_at: datetime | None = None,
    ) -> dict[str, object]:
        if not settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL:
            raise ValueError("Backlog alert webhook is not configured.")

        preview = await WebhookService.build_test_notification_preview(
            kind,
            job_scheduled=job_scheduled,
            next_scheduled_run_at=next_scheduled_run_at,
        )

        async with httpx.AsyncClient(
            timeout=settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_TIMEOUT_SECONDS
        ) as client:
            response = await client.post(
                settings.WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL,
                json=preview["payload"],
            )
            response.raise_for_status()

        return {
            "message": preview["message"],
            "kind": preview["kind"],
            "event": preview["event"],
            "sentAt": datetime.now(timezone.utc),
            "test": True,
        }

    @staticmethod
    async def build_test_notification_preview(
        kind: WebhookTestNotificationKind,
        *,
        job_scheduled: bool = False,
        next_scheduled_run_at: datetime | None = None,
    ) -> dict[str, object]:
        runtime_health = await WebhookService.get_runtime_health(
            job_scheduled=job_scheduled,
            next_scheduled_run_at=next_scheduled_run_at,
        )
        now = datetime.now(timezone.utc)
        event, message, severity = _get_test_notification_metadata(kind)
        payload = {
            "event": event,
            "severity": severity,
            "app": settings.APP_NAME,
            "message": message,
            "text": _build_test_notification_text(kind, runtime_health),
            "generatedAt": now.isoformat(),
            "test": True,
            "runtimeHealth": runtime_health.model_dump(mode="json"),
        }
        return {
            "message": message,
            "kind": kind.value,
            "event": event,
            "payload": payload,
            "test": True,
        }
