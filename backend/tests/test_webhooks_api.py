from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

import app.main as main_module
import app.routes.webhooks as webhooks_route_module
import app.services.agent_service as agent_service_module
import app.services.task_service as task_service_module
import app.services.webhook_service as webhook_service_module
from app.routes.auth import get_current_active_user
from app.services.orchestrator import Orchestrator


class FakeCursor:
    def __init__(self, documents: list[dict]):
        self._documents = list(documents)
        self._skip = 0
        self._limit: int | None = None

    def skip(self, count: int):
        self._skip = count
        return self

    def limit(self, count: int):
        self._limit = count
        return self

    def sort(self, field: str, direction: int):
        reverse = direction == -1
        self._documents.sort(key=lambda doc: doc.get(field), reverse=reverse)
        return self

    async def to_list(self, length: int | None = None):
        docs = self._documents[self._skip :]
        max_length = self._limit if self._limit is not None else length
        if max_length is not None:
            docs = docs[:max_length]
        return list(docs)


class FakeCollection:
    def __init__(self, unique_fields: tuple[str, ...] | None = None):
        self.documents: list[dict] = []
        self._unique_fields = unique_fields or ()
        self._indexes: dict[str, dict] = {
            "_id_": {"key": [("_id", 1)], "unique": True}
        }

    async def insert_one(self, document: dict):
        if self._unique_fields:
            for existing in self.documents:
                if all(
                    existing.get(field) == document.get(field)
                    for field in self._unique_fields
                ):
                    raise DuplicateKeyError("duplicate key")
        inserted_id = ObjectId()
        stored = {**document, "_id": inserted_id}
        self.documents.append(stored)
        return SimpleNamespace(inserted_id=inserted_id)

    def find(self, query: dict | None = None):
        query = query or {}
        filtered = [doc for doc in self.documents if self._matches(doc, query)]
        return FakeCursor(filtered)

    async def find_one(self, query: dict):
        return next((doc for doc in self.documents if self._matches(doc, query)), None)

    async def update_one(self, query: dict, update: dict, upsert: bool = False):
        target = await self.find_one(query)
        if not target and not upsert:
            return SimpleNamespace(modified_count=0)
        if not target and upsert:
            target = {**query}
            self.documents.append(target)
        for key, value in update.get("$set", {}).items():
            target[key] = value
        return SimpleNamespace(modified_count=1)

    async def delete_one(self, query: dict):
        before = len(self.documents)
        self.documents = [doc for doc in self.documents if not self._matches(doc, query)]
        return SimpleNamespace(deleted_count=before - len(self.documents))

    async def delete_many(self, query: dict):
        before = len(self.documents)
        self.documents = [doc for doc in self.documents if not self._matches(doc, query)]
        return SimpleNamespace(deleted_count=before - len(self.documents))

    async def count_documents(self, query: dict):
        return sum(1 for doc in self.documents if self._matches(doc, query))

    async def index_information(self):
        return self._indexes

    async def create_index(self, keys, unique: bool = False):
        if isinstance(keys, str):
            normalized_keys = [(keys, 1)]
            name = f"{keys}_1"
        else:
            normalized_keys = list(keys)
            name = "_".join(f"{field}_{direction}" for field, direction in normalized_keys)
        self._indexes[name] = {"key": normalized_keys, "unique": unique}
        return name

    def create_index_sync(self, keys, unique: bool = False):
        if isinstance(keys, str):
            normalized_keys = [(keys, 1)]
            name = f"{keys}_1"
        else:
            normalized_keys = list(keys)
            name = "_".join(f"{field}_{direction}" for field, direction in normalized_keys)
        self._indexes[name] = {"key": normalized_keys, "unique": unique}
        return name

    @staticmethod
    def _matches(document: dict, query: dict) -> bool:
        for key, value in query.items():
            current = document.get(key)
            if isinstance(value, dict):
                if "$lt" in value and not (current is not None and current < value["$lt"]):
                    return False
                if "$lte" in value and not (current is not None and current <= value["$lte"]):
                    return False
                if "$gt" in value and not (current is not None and current > value["$gt"]):
                    return False
                if "$gte" in value and not (current is not None and current >= value["$gte"]):
                    return False
                continue
            if current != value:
                return False
        return True


class FakeDB:
    def __init__(self):
        self.agents = FakeCollection()
        self.tasks = FakeCollection()
        self.webhooks = FakeCollection()
        self.webhook_idempotency = FakeCollection(
            unique_fields=("webhookId", "idempotencyKeyHash")
        )
        self.webhook_deliveries = FakeCollection()
        self.webhook_runtime_state = FakeCollection()
        self._seed_indexes()

    def __getitem__(self, name: str):
        return getattr(self, name)

    def _seed_indexes(self):
        self.webhook_idempotency.create_index_sync(
            [("webhookId", 1), ("idempotencyKeyHash", 1)],
            unique=True,
        )
        self.webhook_idempotency.create_index_sync("updatedAt")
        self.webhook_deliveries.create_index_sync(
            [("webhookId", 1), ("status", 1), ("receivedAt", -1)]
        )
        self.webhook_deliveries.create_index_sync("receivedAt")


def _seed_agent(fake_db: FakeDB) -> str:
    agent_id = ObjectId()
    fake_db.agents.documents.append(
        {
            "_id": agent_id,
            "name": "Webhook Agent",
            "role": "Responds to webhook events",
            "description": "Demo agent",
            "systemPrompt": "Handle webhooks",
            "allowedTools": [],
            "toolConfig": {},
            "allowedSubAgents": [],
            "maxSteps": 5,
            "active": True,
            "createdAt": datetime.now(timezone.utc),
            "updatedAt": None,
        }
    )
    return str(agent_id)


def _override_auth():
    main_module.app.dependency_overrides[get_current_active_user] = (
        lambda: SimpleNamespace(id="user-1", is_active=True)
    )


def _clear_auth_override():
    main_module.app.dependency_overrides.pop(get_current_active_user, None)


def test_webhooks_api_create_list_and_rotate_token(client, monkeypatch):
    fake_db = FakeDB()
    agent_id = _seed_agent(fake_db)

    monkeypatch.setattr(agent_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(task_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    _override_auth()

    try:
        create_response = client.post(
            "/api/webhooks",
            json={
                "name": "Stripe Paid",
                "description": "Accept checkout session events",
                "agentId": agent_id,
                "taskTitle": "Process Stripe payment event",
                "allowDelegation": True,
                "requiresApproval": False,
                "active": True,
            },
        )

        assert create_response.status_code == 201
        create_payload = create_response.json()
        assert create_payload["name"] == "Stripe Paid"
        assert create_payload["agentName"] == "Webhook Agent"
        assert create_payload["token"]
        assert create_payload["triggerUrl"].endswith(
            f"/api/webhooks/agent/{create_payload['token']}"
        )
        assert "tokenHash" not in create_payload

        list_response = client.get("/api/webhooks")

        assert list_response.status_code == 200
        list_payload = list_response.json()
        assert list_payload["page"] == 1
        assert list_payload["total"] == 1
        assert list_payload["data"] == [
            {
                "id": create_payload["id"],
                "name": "Stripe Paid",
                "description": "Accept checkout session events",
                "agentId": agent_id,
                "agentName": "Webhook Agent",
                "taskTitle": "Process Stripe payment event",
                "allowDelegation": True,
                "requiresApproval": False,
                "active": True,
                "lastTriggeredAt": None,
                "createdAt": create_payload["createdAt"],
                "updatedAt": None,
            }
        ]

        rotate_response = client.post(
            f"/api/webhooks/{create_payload['id']}/rotate-token"
        )

        assert rotate_response.status_code == 200
        rotate_payload = rotate_response.json()
        assert rotate_payload["id"] == create_payload["id"]
        assert rotate_payload["token"] != create_payload["token"]
        assert rotate_payload["triggerUrl"].endswith(
            f"/api/webhooks/agent/{rotate_payload['token']}"
        )
    finally:
        _clear_auth_override()


def test_webhook_trigger_creates_task_and_marks_last_triggered(client, monkeypatch):
    fake_db = FakeDB()
    agent_id = _seed_agent(fake_db)
    executed_task_ids: list[str] = []

    async def fake_execute_task(task_id: str, depth: int = 0):
        executed_task_ids.append(task_id)

    monkeypatch.setattr(agent_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(task_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(Orchestrator, "execute_task", fake_execute_task)
    _override_auth()

    try:
        create_response = client.post(
            "/api/webhooks",
            json={
                "name": "CRM Intake",
                "description": "New lead payloads",
                "agentId": agent_id,
                "taskTitle": "Process CRM lead",
            },
        )
        assert create_response.status_code == 201
        webhook = create_response.json()

        trigger_response = client.post(
            f"/api/webhooks/agent/{webhook['token']}",
            json={
                "leadId": 123,
                "company": "ACME",
                "contact": {"name": "Jane Doe"},
            },
        )

        assert trigger_response.status_code == 200
        trigger_payload = trigger_response.json()
        assert trigger_payload["message"] == "Webhook accepted and task execution started"
        assert trigger_payload["webhookId"] == webhook["id"]
        assert trigger_payload["duplicate"] is False
        assert trigger_payload["idempotencyKey"] is None
        assert executed_task_ids == [trigger_payload["taskId"]]
        assert len(fake_db.tasks.documents) == 1

        task_doc = fake_db.tasks.documents[0]
        assert str(task_doc["_id"]) == trigger_payload["taskId"]
        assert task_doc["title"] == "Process CRM lead"
        assert task_doc["assignedAgentId"] == agent_id
        assert task_doc["createdBy"] == f"webhook:{webhook['id']}"
        assert "Webhook 'CRM Intake' triggered." in task_doc["input"]
        assert '"leadId": 123' in task_doc["input"]
        assert '"company": "ACME"' in task_doc["input"]

        webhook_doc = fake_db.webhooks.documents[0]
        assert webhook_doc["lastTriggeredAt"] is not None
        assert webhook_doc["updatedAt"] is not None
    finally:
        _clear_auth_override()


def test_webhook_trigger_reuses_existing_task_for_duplicate_idempotency_key(
    client,
    monkeypatch,
):
    fake_db = FakeDB()
    agent_id = _seed_agent(fake_db)
    executed_task_ids: list[str] = []

    async def fake_execute_task(task_id: str, depth: int = 0):
        executed_task_ids.append(task_id)

    monkeypatch.setattr(agent_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(task_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(Orchestrator, "execute_task", fake_execute_task)
    _override_auth()

    try:
        create_response = client.post(
            "/api/webhooks",
            json={
                "name": "Stripe Event",
                "description": "Idempotent payment event",
                "agentId": agent_id,
                "taskTitle": "Process Stripe event",
            },
        )
        webhook = create_response.json()
        headers = {"X-Idempotency-Key": "evt_123"}

        first_response = client.post(
            f"/api/webhooks/agent/{webhook['token']}",
            headers=headers,
            json={"eventId": "evt_123", "status": "paid"},
        )
        second_response = client.post(
            f"/api/webhooks/agent/{webhook['token']}",
            headers=headers,
            json={"eventId": "evt_123", "status": "paid"},
        )

        assert first_response.status_code == 200
        first_payload = first_response.json()
        assert first_payload["duplicate"] is False
        assert first_payload["idempotencyKey"] == "evt_123"

        assert second_response.status_code == 200
        second_payload = second_response.json()
        assert second_payload["duplicate"] is True
        assert second_payload["idempotencyKey"] == "evt_123"
        assert second_payload["taskId"] == first_payload["taskId"]
        assert len(fake_db.tasks.documents) == 1
        assert executed_task_ids == [first_payload["taskId"]]
        assert len(fake_db.webhook_idempotency.documents) == 1
        assert fake_db.webhook_idempotency.documents[0]["status"] == "accepted"
        assert fake_db.webhook_idempotency.documents[0]["taskId"] == first_payload["taskId"]
        assert len(fake_db.webhook_deliveries.documents) == 2
        assert fake_db.webhook_deliveries.documents[0]["status"] == "accepted"
        assert fake_db.webhook_deliveries.documents[0]["taskId"] == first_payload["taskId"]
        assert fake_db.webhook_deliveries.documents[1]["status"] == "duplicate"
        assert fake_db.webhook_deliveries.documents[1]["taskId"] == first_payload["taskId"]
        assert fake_db.webhook_deliveries.documents[1]["duplicate"] is True
        assert fake_db.webhook_deliveries.documents[0]["requestMethod"] == "POST"
        assert fake_db.webhook_deliveries.documents[0]["contentType"] == "application/json"
        assert '"status": "paid"' in fake_db.webhook_deliveries.documents[0]["payloadPreview"]
        assert fake_db.webhook_deliveries.documents[0]["payloadSizeBytes"] > 0
        assert fake_db.webhook_deliveries.documents[0]["payloadTruncated"] is False

        deliveries_response = client.get(
            f"/api/webhooks/{webhook['id']}/deliveries?status=duplicate&limit=1"
        )

        assert deliveries_response.status_code == 200
        deliveries_payload = deliveries_response.json()
        assert deliveries_payload["total"] == 1
        assert deliveries_payload["skip"] == 0
        assert deliveries_payload["limit"] == 1
        assert deliveries_payload["hasMore"] is False
        assert len(deliveries_payload["items"]) == 1
        assert deliveries_payload["items"][0]["status"] == "duplicate"
        assert deliveries_payload["items"][0]["duplicate"] is True
        assert deliveries_payload["items"][0]["taskId"] == first_payload["taskId"]
    finally:
        _clear_auth_override()


def test_webhook_runtime_cleanup_removes_expired_records(monkeypatch):
    fake_db = FakeDB()
    now = datetime.now(timezone.utc)
    fake_db.webhook_deliveries.documents.extend(
        [
            {
                "_id": ObjectId(),
                "webhookId": "webhook-1",
                "status": "accepted",
                "receivedAt": now.replace(year=2025),
                "updatedAt": now.replace(year=2025),
            },
            {
                "_id": ObjectId(),
                "webhookId": "webhook-1",
                "status": "accepted",
                "receivedAt": now,
                "updatedAt": now,
            },
        ]
    )
    fake_db.webhook_idempotency.documents.extend(
        [
            {
                "_id": ObjectId(),
                "webhookId": "webhook-1",
                "idempotencyKeyHash": "old",
                "updatedAt": now.replace(year=2025),
            },
            {
                "_id": ObjectId(),
                "webhookId": "webhook-1",
                "idempotencyKeyHash": "fresh",
                "updatedAt": now,
            },
        ]
    )

    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)

    result = asyncio.run(
        webhook_service_module.WebhookService.cleanup_expired_runtime_data()
    )

    assert result == {"deliveriesDeleted": 1, "idempotencyDeleted": 1}
    assert len(fake_db.webhook_deliveries.documents) == 1
    assert len(fake_db.webhook_idempotency.documents) == 1


def test_webhook_deliveries_support_time_range_filters(client, monkeypatch):
    fake_db = FakeDB()
    agent_id = _seed_agent(fake_db)
    webhook_id = ObjectId()
    now = datetime.now(timezone.utc)
    older_time = now - timedelta(hours=1)
    newer_time = now

    fake_db.webhooks.documents.append(
        {
            "_id": webhook_id,
            "name": "Range Filter",
            "description": "",
            "agentId": agent_id,
            "taskTitle": "Process events",
            "allowDelegation": True,
            "requiresApproval": False,
            "active": True,
            "createdAt": now,
            "updatedAt": None,
        }
    )
    fake_db.webhook_deliveries.documents.extend(
        [
            {
                "_id": ObjectId(),
                "webhookId": str(webhook_id),
                "status": "accepted",
                "duplicate": False,
                "receivedAt": older_time,
                "updatedAt": older_time,
            },
            {
                "_id": ObjectId(),
                "webhookId": str(webhook_id),
                "status": "failed",
                "duplicate": False,
                "receivedAt": newer_time,
                "updatedAt": newer_time,
            },
        ]
    )

    monkeypatch.setattr(agent_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(task_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    _override_auth()

    try:
        from_iso = older_time.isoformat()
        to_iso = older_time.isoformat()
        response = client.get(
            f"/api/webhooks/{webhook_id}/deliveries",
            params={"from": from_iso, "to": to_iso},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert len(payload["items"]) == 1
        assert payload["items"][0]["status"] == "accepted"
        assert payload["fromTime"] is not None
        assert payload["toTime"] is not None

        invalid_range = client.get(
            f"/api/webhooks/{webhook_id}/deliveries",
            params={"from": newer_time.isoformat(), "to": older_time.isoformat()},
        )
        assert invalid_range.status_code == 400
        assert invalid_range.json()["code"] == "invalid_delivery_range"
    finally:
        _clear_auth_override()


def test_webhook_delivery_export_returns_csv_for_filtered_range(client, monkeypatch):
    fake_db = FakeDB()
    agent_id = _seed_agent(fake_db)
    webhook_id = ObjectId()
    now = datetime.now(timezone.utc)
    included_time = now - timedelta(minutes=10)
    excluded_time = now - timedelta(days=2)

    fake_db.webhooks.documents.append(
        {
            "_id": webhook_id,
            "name": "CSV Export",
            "description": "",
            "agentId": agent_id,
            "taskTitle": "Process events",
            "allowDelegation": True,
            "requiresApproval": False,
            "active": True,
            "createdAt": now,
            "updatedAt": None,
        }
    )
    fake_db.webhook_deliveries.documents.extend(
        [
            {
                "_id": ObjectId(),
                "webhookId": str(webhook_id),
                "status": "failed",
                "taskId": "task-1",
                "duplicate": False,
                "idempotencyKey": "evt_export",
                "requestMethod": "POST",
                "contentType": "application/json",
                "payloadPreview": "{\"status\":\"failed\"}",
                "payloadSizeBytes": 19,
                "payloadTruncated": False,
                "error": "Validation failed",
                "receivedAt": included_time,
                "updatedAt": included_time,
            },
            {
                "_id": ObjectId(),
                "webhookId": str(webhook_id),
                "status": "accepted",
                "duplicate": False,
                "receivedAt": excluded_time,
                "updatedAt": excluded_time,
            },
        ]
    )

    monkeypatch.setattr(agent_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(task_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    _override_auth()

    try:
        response = client.get(
            f"/api/webhooks/{webhook_id}/deliveries/export",
            params={
                "status": "failed",
                "from": (now - timedelta(hours=1)).isoformat(),
                "to": now.isoformat(),
            },
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/csv")
        assert "attachment;" in response.headers["content-disposition"]
        lines = response.text.strip().splitlines()
        assert len(lines) == 2
        assert lines[0].startswith("deliveryId,webhookId,status")
        assert "failed" in lines[1]
        assert "Validation failed" in lines[1]
        assert "task-1" in lines[1]
    finally:
        _clear_auth_override()


def test_webhook_runtime_health_exposes_retention_and_cleanup_status(client, monkeypatch):
    fake_db = FakeDB()
    now = datetime.now(timezone.utc)
    expired_delivery_time = now.replace(year=2025)
    expired_idempotency_time = now.replace(year=2025)
    fake_db.webhook_deliveries.documents.append(
        {
            "_id": ObjectId(),
            "webhookId": "webhook-1",
            "status": "accepted",
            "receivedAt": expired_delivery_time,
            "updatedAt": expired_delivery_time,
        }
    )
    fake_db.webhook_idempotency.documents.append(
        {
            "_id": ObjectId(),
            "webhookId": "webhook-1",
            "idempotencyKeyHash": "old",
            "updatedAt": expired_idempotency_time,
        }
    )
    fake_db.webhook_runtime_state.documents.append(
        {
            "_id": webhook_service_module.WEBHOOK_RUNTIME_STATE_ID,
            "type": webhook_service_module.WEBHOOK_RUNTIME_STATE_ID,
            "lastRunAt": now,
            "lastSuccessAt": now,
            "lastStatus": "success",
            "lastDurationMs": 42,
            "deliveriesDeleted": 3,
            "idempotencyDeleted": 1,
            "lastError": None,
            "updatedAt": now,
        }
    )

    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        webhooks_route_module,
        "get_webhook_cleanup_job_snapshot",
        lambda: {
            "jobScheduled": True,
            "nextScheduledRunAt": now,
        },
    )
    _override_auth()

    try:
        response = client.get("/api/webhooks/runtime-health")

        assert response.status_code == 200
        payload = response.json()
        assert payload["jobScheduled"] is True
        assert payload["cleanup"]["lastStatus"] == "success"
        assert payload["cleanup"]["deliveriesDeleted"] == 3
        assert payload["expiredDeliveriesPending"] == 1
        assert payload["expiredIdempotencyPending"] == 1
        assert payload["deliveryBacklogAlert"] is False
        assert payload["oldestExpiredDeliveryAt"] is not None
        assert payload["alerting"]["configured"] is False
        assert payload["alerting"]["incidentOpen"] is False
        assert payload["alerting"]["lastStatus"] == "disabled"
        assert payload["alerting"]["lastResolvedStatus"] == "disabled"
        assert payload["deliveryRetentionIndexReady"] is True
        assert payload["idempotencyRetentionIndexReady"] is True
        assert payload["deliveryListIndexReady"] is True
    finally:
        _clear_auth_override()


def test_webhook_runtime_health_raises_alert_when_expired_backlog_is_stale(
    client, monkeypatch
):
    fake_db = FakeDB()
    now = datetime.now(timezone.utc)
    expired_delivery_time = now.replace(year=2025)
    fake_db.webhook_deliveries.documents.append(
        {
            "_id": ObjectId(),
            "webhookId": "webhook-1",
            "status": "accepted",
            "receivedAt": expired_delivery_time,
            "updatedAt": expired_delivery_time,
        }
    )
    fake_db.webhook_runtime_state.documents.append(
        {
            "_id": webhook_service_module.WEBHOOK_RUNTIME_STATE_ID,
            "type": webhook_service_module.WEBHOOK_RUNTIME_STATE_ID,
            "lastRunAt": now - timedelta(days=2),
            "lastSuccessAt": now - timedelta(days=2),
            "lastStatus": "success",
            "lastDurationMs": 42,
            "deliveriesDeleted": 0,
            "idempotencyDeleted": 0,
            "lastError": None,
            "updatedAt": now - timedelta(days=2),
        }
    )

    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        webhooks_route_module,
        "get_webhook_cleanup_job_snapshot",
        lambda: {
            "jobScheduled": True,
            "nextScheduledRunAt": now,
        },
    )
    _override_auth()

    try:
        response = client.get("/api/webhooks/runtime-health")

        assert response.status_code == 200
        payload = response.json()
        assert payload["deliveryBacklogAlert"] is True
        assert "last successful cleanup" in payload["deliveryBacklogAlertMessage"]
        assert payload["deliveryBacklogAlertThresholdHours"] == 24
    finally:
        _clear_auth_override()


def test_webhook_backlog_alert_dispatch_posts_to_configured_webhook(monkeypatch):
    fake_db = FakeDB()
    now = datetime.now(timezone.utc)
    expired_delivery_time = now.replace(year=2025)
    fake_db.webhook_deliveries.documents.append(
        {
            "_id": ObjectId(),
            "webhookId": "webhook-1",
            "status": "accepted",
            "receivedAt": expired_delivery_time,
            "updatedAt": expired_delivery_time,
        }
    )
    fake_db.webhook_runtime_state.documents.append(
        {
            "_id": webhook_service_module.WEBHOOK_RUNTIME_STATE_ID,
            "type": webhook_service_module.WEBHOOK_RUNTIME_STATE_ID,
            "lastRunAt": now - timedelta(days=2),
            "lastSuccessAt": now - timedelta(days=2),
            "lastStatus": "success",
            "lastDurationMs": 42,
            "deliveriesDeleted": 0,
            "idempotencyDeleted": 0,
            "lastError": None,
            "updatedAt": now - timedelta(days=2),
        }
    )
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

    class FakeAsyncClient:
        def __init__(self, timeout: int):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url: str, json: dict):
            captured["url"] = url
            captured["payload"] = json
            return FakeResponse()

    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        webhook_service_module.settings,
        "WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL",
        "https://hooks.example.test/mas-alerts",
    )
    monkeypatch.setattr(
        webhook_service_module.settings,
        "WEBHOOK_DELIVERY_BACKLOG_ALERT_TIMEOUT_SECONDS",
        9,
    )
    monkeypatch.setattr(
        webhook_service_module,
        "httpx",
        SimpleNamespace(AsyncClient=FakeAsyncClient),
    )

    dispatched = asyncio.run(
        webhook_service_module.WebhookService.maybe_dispatch_backlog_alert(
            job_scheduled=True,
            next_scheduled_run_at=now,
        )
    )

    assert dispatched is True
    assert captured["url"] == "https://hooks.example.test/mas-alerts"
    assert captured["timeout"] == 9
    assert captured["payload"]["event"] == "webhook_delivery_backlog_alert"
    assert captured["payload"]["runtimeHealth"]["deliveryBacklogAlert"] is True
    state_doc = fake_db.webhook_runtime_state.documents[0]
    assert state_doc["lastAlertStatus"] == "sent"
    assert state_doc["lastAlertSentAt"] is not None
    assert state_doc["backlogAlertOpen"] is True


def test_webhook_backlog_resolved_dispatch_posts_when_backlog_clears(monkeypatch):
    fake_db = FakeDB()
    now = datetime.now(timezone.utc)
    fake_db.webhook_runtime_state.documents.append(
        {
            "_id": webhook_service_module.WEBHOOK_RUNTIME_STATE_ID,
            "type": webhook_service_module.WEBHOOK_RUNTIME_STATE_ID,
            "lastRunAt": now,
            "lastSuccessAt": now,
            "lastStatus": "success",
            "lastDurationMs": 42,
            "deliveriesDeleted": 5,
            "idempotencyDeleted": 2,
            "lastError": None,
            "lastAlertAttemptAt": now - timedelta(hours=2),
            "lastAlertSentAt": now - timedelta(hours=2),
            "lastAlertStatus": "sent",
            "backlogAlertOpen": True,
            "updatedAt": now,
        }
    )
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

    class FakeAsyncClient:
        def __init__(self, timeout: int):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url: str, json: dict):
            captured["url"] = url
            captured["payload"] = json
            return FakeResponse()

    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        webhook_service_module.settings,
        "WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL",
        "https://hooks.example.test/mas-alerts",
    )
    monkeypatch.setattr(
        webhook_service_module,
        "httpx",
        SimpleNamespace(AsyncClient=FakeAsyncClient),
    )

    dispatched = asyncio.run(
        webhook_service_module.WebhookService.maybe_dispatch_backlog_resolved(
            job_scheduled=True,
            next_scheduled_run_at=now,
        )
    )

    assert dispatched is True
    assert captured["url"] == "https://hooks.example.test/mas-alerts"
    assert captured["payload"]["event"] == "webhook_delivery_backlog_resolved"
    assert captured["payload"]["runtimeHealth"]["deliveryBacklogAlert"] is False
    state_doc = fake_db.webhook_runtime_state.documents[0]
    assert state_doc["lastResolvedStatus"] == "sent"
    assert state_doc["lastResolvedSentAt"] is not None
    assert state_doc["backlogAlertOpen"] is False


def test_webhook_runtime_test_notification_posts_without_mutating_state(
    client, monkeypatch
):
    fake_db = FakeDB()
    now = datetime.now(timezone.utc)
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

    class FakeAsyncClient:
        def __init__(self, timeout: int):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url: str, json: dict):
            captured["url"] = url
            captured["payload"] = json
            return FakeResponse()

    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        webhook_service_module.settings,
        "WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL",
        "https://hooks.example.test/mas-alerts",
    )
    monkeypatch.setattr(
        webhook_service_module.settings,
        "WEBHOOK_DELIVERY_BACKLOG_ALERT_TIMEOUT_SECONDS",
        7,
    )
    monkeypatch.setattr(
        webhook_service_module,
        "httpx",
        SimpleNamespace(AsyncClient=FakeAsyncClient),
    )
    monkeypatch.setattr(
        webhooks_route_module,
        "get_webhook_cleanup_job_snapshot",
        lambda: {
            "jobScheduled": True,
            "nextScheduledRunAt": now,
        },
    )
    _override_auth()

    try:
        response = client.post(
            "/api/webhooks/runtime-health/test-notification?kind=alert"
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["kind"] == "alert"
        assert payload["event"] == "webhook_delivery_backlog_alert_test"
        assert payload["test"] is True
        assert captured["url"] == "https://hooks.example.test/mas-alerts"
        assert captured["timeout"] == 7
        assert captured["payload"]["event"] == "webhook_delivery_backlog_alert_test"
        assert captured["payload"]["test"] is True
        assert "runtimeHealth" in captured["payload"]
        assert fake_db.webhook_runtime_state.documents == []
    finally:
        _clear_auth_override()


def test_webhook_runtime_test_notification_requires_configured_hook(
    client, monkeypatch
):
    fake_db = FakeDB()
    now = datetime.now(timezone.utc)

    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        webhook_service_module.settings,
        "WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL",
        "",
    )
    monkeypatch.setattr(
        webhooks_route_module,
        "get_webhook_cleanup_job_snapshot",
        lambda: {
            "jobScheduled": True,
            "nextScheduledRunAt": now,
        },
    )
    _override_auth()

    try:
        response = client.post(
            "/api/webhooks/runtime-health/test-notification?kind=resolved"
        )

        assert response.status_code == 400
        payload = response.json()
        assert payload["code"] == "webhook_alert_hook_not_configured"
        assert "not configured" in payload["message"]
    finally:
        _clear_auth_override()


def test_webhook_runtime_test_notification_preview_returns_server_payload(
    client, monkeypatch
):
    fake_db = FakeDB()
    now = datetime.now(timezone.utc)

    monkeypatch.setattr(webhook_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        webhooks_route_module,
        "get_webhook_cleanup_job_snapshot",
        lambda: {
            "jobScheduled": True,
            "nextScheduledRunAt": now,
        },
    )
    _override_auth()

    try:
        response = client.get(
            "/api/webhooks/runtime-health/test-notification-preview?kind=resolved"
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["kind"] == "resolved"
        assert payload["event"] == "webhook_delivery_backlog_resolved_test"
        assert payload["test"] is True
        assert payload["payload"]["event"] == "webhook_delivery_backlog_resolved_test"
        assert payload["payload"]["test"] is True
        assert "runtimeHealth" in payload["payload"]
        assert fake_db.webhook_runtime_state.documents == []
    finally:
        _clear_auth_override()
