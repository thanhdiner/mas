from __future__ import annotations

from types import SimpleNamespace

import app.main as main_module
import app.services.tool_credential_service as tool_credential_service_module
from app.routes.auth import get_current_active_user


class FakeCursor:
    def __init__(self, documents: list[dict]):
        self._documents = documents

    def __aiter__(self):
        self._iterator = iter(self._documents)
        return self

    async def __anext__(self):
        try:
            return next(self._iterator)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class FakeCredentialsCollection:
    def __init__(self):
        self.documents: list[dict] = []

    async def insert_one(self, document: dict):
        inserted_id = str(len(self.documents) + 1).zfill(24)
        stored = {**document, "_id": inserted_id}
        self.documents.append(stored)
        return SimpleNamespace(inserted_id=inserted_id)

    def find(self, *_args, **_kwargs):
        return FakeCursor(list(reversed(self.documents)))

    async def find_one(self, query: dict):
        if "_id" in query:
            return next(
                (doc for doc in self.documents if doc["_id"] == str(query["_id"])),
                None,
            )
        if "name" in query:
            return next(
                (doc for doc in self.documents if doc["name"] == query["name"]),
                None,
            )
        return None

    async def update_one(self, *_args, **_kwargs):
        query = _args[0]
        update = _args[1]
        target = await self.find_one(query)
        if not target:
            return SimpleNamespace(modified_count=0)
        for key, value in update.get("$set", {}).items():
            target[key] = value
        return SimpleNamespace(modified_count=1)

    async def delete_one(self, query: dict):
        before = len(self.documents)
        self.documents = [
            doc for doc in self.documents if doc["_id"] != str(query["_id"])
        ]
        return SimpleNamespace(deleted_count=before - len(self.documents))


class FakeDB:
    def __init__(self):
        self.tool_credentials = FakeCredentialsCollection()

    def __getitem__(self, name: str):
        return getattr(self, name)


def test_tool_credentials_api_returns_public_metadata_only(
    client,
    monkeypatch,
):
    fake_db = FakeDB()

    monkeypatch.setattr(tool_credential_service_module, "get_db", lambda: fake_db)
    main_module.app.dependency_overrides[get_current_active_user] = (
        lambda: SimpleNamespace(id="user-1", is_active=True)
    )

    try:
        create_response = client.post(
            "/api/tools/credentials",
            json={
                "name": "slack-prod",
                "description": "Slack bot token",
                "headers": {
                    "Authorization": "Bearer secret-token",
                    "X-Workspace": "mas",
                },
            },
        )

        assert create_response.status_code == 201
        assert create_response.json()["headerKeys"] == [
            "Authorization",
            "X-Workspace",
        ]
        assert "headers" not in create_response.json()

        list_response = client.get("/api/tools/credentials")

        assert list_response.status_code == 200
        created_at = fake_db.tool_credentials.documents[0]["createdAt"].isoformat().replace(
            "+00:00", "Z"
        )
        updated_at = fake_db.tool_credentials.documents[0]["updatedAt"].isoformat().replace(
            "+00:00", "Z"
        )
        assert list_response.json() == [
            {
                "id": "000000000000000000000001",
                "name": "slack-prod",
                "description": "Slack bot token",
                "headerKeys": ["Authorization", "X-Workspace"],
                "createdAt": created_at,
                "updatedAt": updated_at,
            }
        ]
        assert "encryptedHeaders" in fake_db.tool_credentials.documents[0]
        assert "secret-token" not in list_response.text
    finally:
        main_module.app.dependency_overrides.pop(get_current_active_user, None)


def test_tool_credentials_api_updates_metadata_and_rotates_headers(
    client,
    monkeypatch,
):
    fake_db = FakeDB()

    monkeypatch.setattr(tool_credential_service_module, "get_db", lambda: fake_db)
    main_module.app.dependency_overrides[get_current_active_user] = (
        lambda: SimpleNamespace(id="user-1", is_active=True)
    )

    try:
        create_response = client.post(
            "/api/tools/credentials",
            json={
                "name": "slack-prod",
                "description": "Slack bot token",
                "headers": {
                    "Authorization": "Bearer secret-token",
                },
            },
        )

        credential_id = create_response.json()["id"]

        update_response = client.patch(
            f"/api/tools/credentials/{credential_id}",
            json={
                "name": "slack-primary",
                "description": "Primary Slack bot token",
                "headers": {
                    "Authorization": "Bearer rotated-token",
                    "X-Workspace": "mas",
                },
            },
        )

        assert update_response.status_code == 200
        assert update_response.json()["name"] == "slack-primary"
        assert update_response.json()["description"] == "Primary Slack bot token"
        assert update_response.json()["headerKeys"] == [
            "Authorization",
            "X-Workspace",
        ]
        assert "headers" not in update_response.json()
        assert "rotated-token" not in update_response.text
        assert fake_db.tool_credentials.documents[0]["name"] == "slack-primary"
        assert fake_db.tool_credentials.documents[0]["description"] == "Primary Slack bot token"
        assert fake_db.tool_credentials.documents[0]["headerKeys"] == [
            "Authorization",
            "X-Workspace",
        ]
        assert "rotated-token" not in fake_db.tool_credentials.documents[0]["encryptedHeaders"]
    finally:
        main_module.app.dependency_overrides.pop(get_current_active_user, None)
