import asyncio
import json

import app.tools.http_request as http_request_module


def test_http_request_blocks_private_network_targets():
    result = asyncio.run(
        http_request_module._handle(url="http://127.0.0.1:8000/internal")
    )

    assert result == "ERROR: Requests to localhost are not allowed."


def test_http_request_supports_base_url_and_formats_json_response(
    monkeypatch,
):
    captured_request: dict = {}

    async def fake_resolve_hostname_ips(_: str) -> set[str]:
        return {"93.184.216.34"}

    class FakeResponse:
        def __init__(self):
            self.url = "https://api.example.com/v1/resources?page=2"
            self.status_code = 200
            self.reason_phrase = "OK"
            self.headers = {
                "content-type": "application/json",
                "cache-control": "no-cache",
            }
            self._payload = {"ok": True, "items": [{"id": 1, "name": "Alpha"}]}
            self.text = json.dumps(self._payload)

        def json(self):
            return self._payload

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            captured_request["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def request(self, **kwargs):
            captured_request["request_kwargs"] = kwargs
            return FakeResponse()

    monkeypatch.setattr(
        http_request_module,
        "_resolve_hostname_ips",
        fake_resolve_hostname_ips,
    )
    monkeypatch.setattr(http_request_module.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(
        http_request_module._handle(
            url="/v1/resources",
            method="POST",
            headers={"X-Test": "1"},
            query={"page": 2, "published": True},
            json_body={"name": "Alpha"},
            base_url="https://api.example.com",
            allowed_domains="api.example.com",
            default_timeout_seconds=12,
            default_max_response_chars=4000,
        )
    )

    payload = json.loads(result)

    assert payload["status_code"] == 200
    assert payload["content_type"] == "application/json"
    assert '"name": "Alpha"' in payload["body"]
    assert payload["truncated"] is False

    assert captured_request["client_kwargs"] == {
        "timeout": 12,
        "follow_redirects": True,
    }
    assert captured_request["request_kwargs"] == {
        "method": "POST",
        "url": "https://api.example.com/v1/resources",
        "headers": {
            "X-Test": "1",
            "User-Agent": "MAS-Agent/1.0",
        },
        "params": {
            "page": "2",
            "published": "true",
        },
        "json": {
            "name": "Alpha",
        },
    }


def test_http_request_injects_headers_from_credential_reference(
    monkeypatch,
):
    captured_request: dict = {}

    async def fake_resolve_hostname_ips(_: str) -> set[str]:
        return {"93.184.216.34"}

    async def fake_resolve_headers(reference: str | None) -> dict[str, str]:
        assert reference == "slack-prod"
        return {
            "Authorization": "Bearer secret-token",
            "X-Workspace": "mas",
        }

    class FakeResponse:
        def __init__(self):
            self.url = "https://api.example.com/v1/messages"
            self.status_code = 202
            self.reason_phrase = "Accepted"
            self.headers = {
                "content-type": "application/json",
                "cache-control": "private",
            }
            self._payload = {"queued": True}
            self.text = json.dumps(self._payload)

        def json(self):
            return self._payload

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            captured_request["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def request(self, **kwargs):
            captured_request["request_kwargs"] = kwargs
            return FakeResponse()

    monkeypatch.setattr(
        http_request_module,
        "_resolve_hostname_ips",
        fake_resolve_hostname_ips,
    )
    monkeypatch.setattr(
        http_request_module.ToolCredentialService,
        "resolve_headers",
        fake_resolve_headers,
    )
    monkeypatch.setattr(http_request_module.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(
        http_request_module._handle(
            url="https://api.example.com/v1/messages",
            method="POST",
            headers={"X-Trace": "trace-1"},
            json_body={"message": "hello"},
            credential_ref="slack-prod",
        )
    )

    payload = json.loads(result)

    assert payload["status_code"] == 202
    assert payload["body"].startswith("{")
    assert captured_request["request_kwargs"]["headers"] == {
        "Authorization": "Bearer secret-token",
        "X-Workspace": "mas",
        "X-Trace": "trace-1",
        "User-Agent": "MAS-Agent/1.0",
    }
