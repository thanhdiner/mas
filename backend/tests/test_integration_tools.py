import asyncio
import base64

import app.tools.github as github_tool
import app.tools.gmail as gmail_tool
import app.tools.notion as notion_tool
import app.tools.slack as slack_tool
from app.tools.registry import tool_registry


def test_slack_tool_posts_to_default_channel(monkeypatch):
    captured: dict = {}

    async def fake_execute(**kwargs):
        captured.update(kwargs)
        return '{"ok":true}'

    monkeypatch.setattr(slack_tool, "execute_integration_request", fake_execute)

    result = asyncio.run(
        slack_tool._handle(
            action="post_message",
            text="Deploy complete",
            credential_ref="slack-prod",
            default_channel_id="C123456",
        )
    )

    assert result == '{"ok":true}'
    assert captured["service_name"] == "Slack"
    assert captured["url"] == "/chat.postMessage"
    assert captured["method"] == "POST"
    assert captured["json_body"] == {
        "channel": "C123456",
        "text": "Deploy complete",
    }
    assert captured["credential_ref"] == "slack-prod"


def test_notion_tool_creates_page_under_parent_page(monkeypatch):
    captured: dict = {}

    async def fake_execute(**kwargs):
        captured.update(kwargs)
        return '{"ok":true}'

    monkeypatch.setattr(notion_tool, "execute_integration_request", fake_execute)

    result = asyncio.run(
        notion_tool._handle(
            action="create_page",
            title="Daily Sync",
            parent_page_id="page-123",
            children=[{"object": "block", "type": "paragraph"}],
            credential_ref="notion-main",
        )
    )

    assert result == '{"ok":true}'
    assert captured["service_name"] == "Notion"
    assert captured["url"] == "/pages"
    assert captured["method"] == "POST"
    assert captured["json_body"]["parent"] == {"page_id": "page-123"}
    assert captured["json_body"]["properties"] == {
        "title": {
            "title": [
                {
                    "text": {
                        "content": "Daily Sync",
                    }
                }
            ]
        }
    }
    assert captured["json_body"]["children"] == [
        {"object": "block", "type": "paragraph"}
    ]


def test_github_tool_creates_issue_with_default_repo(monkeypatch):
    captured: dict = {}

    async def fake_execute(**kwargs):
        captured.update(kwargs)
        return '{"ok":true}'

    monkeypatch.setattr(github_tool, "execute_integration_request", fake_execute)

    result = asyncio.run(
        github_tool._handle(
            action="create_issue",
            title="Bug: webhook edge case",
            body="Need to handle duplicate retries",
            labels=["bug", "webhook"],
            credential_ref="github-main",
            default_owner="mas-labs",
            default_repo="mas",
        )
    )

    assert result == '{"ok":true}'
    assert captured["service_name"] == "GitHub"
    assert captured["url"] == "/repos/mas-labs/mas/issues"
    assert captured["method"] == "POST"
    assert captured["json_body"] == {
        "title": "Bug: webhook edge case",
        "body": "Need to handle duplicate retries",
        "labels": ["bug", "webhook"],
    }


def test_gmail_tool_sends_base64url_message(monkeypatch):
    captured: dict = {}

    async def fake_execute(**kwargs):
        captured.update(kwargs)
        return '{"ok":true}'

    monkeypatch.setattr(gmail_tool, "execute_integration_request", fake_execute)

    result = asyncio.run(
        gmail_tool._handle(
            action="send_email",
            to="demo@example.com",
            subject="Integration test",
            body_text="Hello from MAS",
            credential_ref="gmail-main",
        )
    )

    assert result == '{"ok":true}'
    assert captured["service_name"] == "Gmail"
    assert captured["url"] == "/gmail/v1/users/me/messages/send"
    assert captured["method"] == "POST"

    raw_message = captured["json_body"]["raw"]
    padding = "=" * ((4 - len(raw_message) % 4) % 4)
    decoded = base64.urlsafe_b64decode(f"{raw_message}{padding}").decode("utf-8")

    assert "To: demo@example.com" in decoded
    assert "Subject: Integration test" in decoded
    assert "Hello from MAS" in decoded


def test_tool_registry_lists_new_integration_tools():
    tool_names = {entry["name"] for entry in tool_registry.list_all()}

    assert {"slack", "notion", "github", "gmail"}.issubset(tool_names)
