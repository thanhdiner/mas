from __future__ import annotations

from types import SimpleNamespace

import app.main as main_module
import app.routes.tools as tools_route_module
import app.services.tool_preset_service as tool_preset_service_module
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


class FakeToolPresetsCollection:
    def __init__(self):
        self.documents: list[dict] = []

    async def insert_one(self, document: dict):
        inserted_id = str(len(self.documents) + 1).zfill(24)
        stored = {**document, "_id": inserted_id}
        self.documents.append(stored)
        return SimpleNamespace(inserted_id=inserted_id)

    def find(self, query: dict | None = None, sort=None):
        documents = list(self.documents)
        if query and query.get("toolName"):
            documents = [
                doc for doc in documents if doc["toolName"] == query["toolName"]
            ]
        if sort:
            for field_name, direction in reversed(sort):
                reverse = direction < 0
                documents.sort(key=lambda item: item[field_name], reverse=reverse)
        return FakeCursor(documents)

    async def find_one(self, query: dict):
        if "_id" in query:
            return next(
                (doc for doc in self.documents if doc["_id"] == str(query["_id"])),
                None,
            )
        return None

    async def update_one(self, query: dict, update: dict):
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


class FakeToolSettingsCollection:
    def __init__(self):
        self.documents: list[dict] = []

    def find(self, *_args, **_kwargs):
        return FakeCursor(self.documents)


class FakeDB:
    def __init__(self):
        self.tool_presets = FakeToolPresetsCollection()
        self.tool_settings = FakeToolSettingsCollection()

    def __getitem__(self, name: str):
        return getattr(self, name)


def test_tool_presets_api_crud_and_catalog_embedding(client, monkeypatch):
    fake_db = FakeDB()

    monkeypatch.setattr(tool_preset_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(tools_route_module, "get_db", lambda: fake_db)
    main_module.app.dependency_overrides[get_current_active_user] = (
        lambda: SimpleNamespace(id="user-1", is_active=True)
    )

    try:
        create_response = client.post(
            "/api/tools/presets",
            json={
                "name": "Workspace Repo",
                "description": "Default GitHub repo for triage",
                "toolName": "github",
                "values": {
                    "default_owner": "mas-labs",
                    "default_repo": "mas",
                },
            },
        )

        assert create_response.status_code == 201
        created = create_response.json()
        assert created["toolName"] == "github"
        assert created["values"] == {
            "default_owner": "mas-labs",
            "default_repo": "mas",
        }

        preset_id = created["id"]

        update_response = client.patch(
            f"/api/tools/presets/{preset_id}",
            json={
                "description": "Primary GitHub repo preset",
                "values": {
                    "default_owner": "mas-platform",
                    "default_repo": "mas-app",
                },
            },
        )

        assert update_response.status_code == 200
        assert update_response.json()["description"] == "Primary GitHub repo preset"
        assert update_response.json()["values"] == {
            "default_owner": "mas-platform",
            "default_repo": "mas-app",
        }

        list_response = client.get("/api/tools/presets?tool_name=github")

        assert list_response.status_code == 200
        assert len(list_response.json()) == 1
        assert list_response.json()[0]["name"] == "Workspace Repo"

        catalog_response = client.get("/api/tools")
        assert catalog_response.status_code == 200
        github_tool = next(
            tool for tool in catalog_response.json() if tool["name"] == "github"
        )
        assert github_tool["presets"] == list_response.json()

        delete_response = client.delete(f"/api/tools/presets/{preset_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["presetId"] == preset_id
    finally:
        main_module.app.dependency_overrides.pop(get_current_active_user, None)


def test_tool_presets_api_rejects_invalid_fields(client, monkeypatch):
    fake_db = FakeDB()

    monkeypatch.setattr(tool_preset_service_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(tools_route_module, "get_db", lambda: fake_db)
    main_module.app.dependency_overrides[get_current_active_user] = (
        lambda: SimpleNamespace(id="user-1", is_active=True)
    )

    try:
        response = client.post(
            "/api/tools/presets",
            json={
                "name": "Invalid Slack Preset",
                "toolName": "slack",
                "values": {
                    "repo": "should-not-exist",
                },
            },
        )

        assert response.status_code == 400
        assert response.json()["code"] == "invalid_tool_preset_field"
        assert response.json()["field"] == "repo"
    finally:
        main_module.app.dependency_overrides.pop(get_current_active_user, None)
