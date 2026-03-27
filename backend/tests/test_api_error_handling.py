import pytest
from pymongo.errors import DuplicateKeyError

import app.services.agent_service as agent_service_module


@pytest.mark.parametrize(
    ("method", "path", "payload", "field_name"),
    [
        ("get", "/api/agents/not-a-valid-id", None, "agent_id"),
        ("get", "/api/tasks?agent_id=not-a-valid-id", None, "agent_id"),
        (
            "post",
            "/api/tasks",
            {
                "title": "Invalid agent reference",
                "input": "Run task",
                "assignedAgentId": "not-a-valid-id",
            },
            "assignedAgentId",
        ),
    ],
)
def test_invalid_object_id_returns_consistent_bad_request(
    client,
    method: str,
    path: str,
    payload: dict | None,
    field_name: str,
):
    request_kwargs = {"json": payload} if payload is not None else {}
    response = getattr(client, method)(path, **request_kwargs)

    assert response.status_code == 400
    assert response.json() == {
        "code": "invalid_object_id",
        "message": f"Invalid '{field_name}'. Expected a 24-character hexadecimal ObjectId.",
        "detail": f"Invalid '{field_name}'. Expected a 24-character hexadecimal ObjectId.",
        "field": field_name,
    }


def test_create_agent_duplicate_name_returns_bad_request(
    client,
    monkeypatch: pytest.MonkeyPatch,
):
    class FakeAgentsCollection:
        async def insert_one(self, _: dict):
            raise DuplicateKeyError(
                'E11000 duplicate key error collection: mas_db.agents index: name_1 dup key: { name: "Planner" }'
            )

    class FakeDB:
        agents = FakeAgentsCollection()

    monkeypatch.setattr(agent_service_module, "get_db", lambda: FakeDB())

    response = client.post(
        "/api/agents",
        json={
            "name": "Planner",
            "role": "Planner agent",
            "description": "",
            "systemPrompt": "You are a planner.",
            "allowedTools": [],
            "allowedSubAgents": [],
            "maxSteps": 10,
            "active": True,
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "code": "agent_name_exists",
        "message": "Agent name 'Planner' already exists.",
        "detail": "Agent name 'Planner' already exists.",
        "field": "name",
    }
