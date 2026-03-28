from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from bson import ObjectId

import app.services.agent_service as agent_service_module


class FakeAgentsCollection:
    def __init__(self):
        self.documents: list[dict] = []

    async def insert_one(self, document: dict):
        inserted_id = ObjectId()
        stored = {**document, "_id": inserted_id}
        self.documents.append(stored)
        return SimpleNamespace(inserted_id=inserted_id)


class FakeDB:
    def __init__(self):
        self.agents = FakeAgentsCollection()

    def __getitem__(self, name: str):
        return getattr(self, name)


def test_create_agent_returns_tool_config(client, monkeypatch):
    fake_db = FakeDB()
    monkeypatch.setattr(agent_service_module, "get_db", lambda: fake_db)

    response = client.post(
        "/api/agents",
        json={
            "name": "HTTP Runner",
            "role": "Integration specialist",
            "description": "Uses per-agent HTTP settings",
            "systemPrompt": "Run integrations carefully.",
            "allowedTools": ["http_request"],
            "toolConfig": {
                "http_request": {
                    "credential_ref": "slack-prod",
                    "base_url": "https://api.slack.com",
                    "allowed_domains": "api.slack.com",
                }
            },
            "allowedSubAgents": [],
            "maxSteps": 8,
            "active": True,
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["allowedTools"] == ["http_request"]
    assert payload["toolConfig"] == {
        "http_request": {
            "credential_ref": "slack-prod",
            "base_url": "https://api.slack.com",
            "allowed_domains": "api.slack.com",
        }
    }
