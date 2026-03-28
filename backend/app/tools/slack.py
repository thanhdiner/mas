from __future__ import annotations

from typing import Any

from app.tools.integration_common import execute_integration_request
from app.tools.registry import tool_registry

BASE_URL = "https://slack.com/api"
ALLOWED_DOMAINS = ["slack.com"]

PARAMS = {
    "type": "object",
    "properties": {
        "action": {
            "type": "string",
            "description": (
                "Slack action to execute. Supported actions: post_message, "
                "reply_in_thread, list_channels, channel_history, thread_replies."
            ),
        },
        "channel_id": {
            "type": "string",
            "description": "Slack channel ID, for example C0123456789. Falls back to default_channel_id if configured.",
        },
        "text": {
            "type": "string",
            "description": "Message text for post_message or reply_in_thread.",
        },
        "thread_ts": {
            "type": "string",
            "description": "Thread timestamp for reply_in_thread or thread_replies.",
        },
        "limit": {
            "type": "integer",
            "description": "Maximum number of channels or messages to return. Default 20.",
        },
        "cursor": {
            "type": "string",
            "description": "Pagination cursor from a previous Slack response.",
        },
        "include_archived": {
            "type": "boolean",
            "description": "Whether archived channels should be included when listing channels.",
        },
        "oldest": {
            "type": "string",
            "description": "Optional oldest message timestamp when fetching history.",
        },
        "latest": {
            "type": "string",
            "description": "Optional latest message timestamp when fetching history.",
        },
        "blocks": {
            "type": "array",
            "description": "Optional Slack Block Kit payload for rich messages.",
            "items": {"type": "object", "additionalProperties": True},
        },
    },
    "required": ["action"],
}


def _extract_slack_error(body: Any) -> str | None:
    if isinstance(body, dict) and body.get("ok") is False:
        error_value = body.get("error") or body.get("message") or "unknown_error"
        return str(error_value)
    return None


async def _handle(
    action: str,
    channel_id: str | None = None,
    text: str | None = None,
    thread_ts: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
    include_archived: bool = False,
    oldest: str | None = None,
    latest: str | None = None,
    blocks: list[dict[str, Any]] | None = None,
    **kwargs,
) -> str:
    normalized_action = (action or "").strip().lower()
    resolved_channel_id = (
        str(channel_id or kwargs.get("default_channel_id") or "").strip()
    )
    headers = {
        "Accept": "application/json; charset=utf-8",
        "Content-Type": "application/json; charset=utf-8",
    }

    if normalized_action == "post_message":
        if not resolved_channel_id:
            return "ERROR: channel_id is required for Slack post_message."
        if not text:
            return "ERROR: text is required for Slack post_message."

        payload: dict[str, Any] = {
            "channel": resolved_channel_id,
            "text": text,
        }
        if blocks:
            payload["blocks"] = blocks

        return await execute_integration_request(
            service_name="Slack",
            method="POST",
            url="/chat.postMessage",
            json_body=payload,
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_slack_error,
        )

    if normalized_action == "reply_in_thread":
        if not resolved_channel_id:
            return "ERROR: channel_id is required for Slack reply_in_thread."
        if not text:
            return "ERROR: text is required for Slack reply_in_thread."
        if not thread_ts:
            return "ERROR: thread_ts is required for Slack reply_in_thread."

        payload = {
            "channel": resolved_channel_id,
            "text": text,
            "thread_ts": thread_ts,
        }
        if blocks:
            payload["blocks"] = blocks

        return await execute_integration_request(
            service_name="Slack",
            method="POST",
            url="/chat.postMessage",
            json_body=payload,
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_slack_error,
        )

    if normalized_action == "list_channels":
        return await execute_integration_request(
            service_name="Slack",
            method="GET",
            url="/conversations.list",
            query={
                "limit": limit,
                "cursor": cursor,
                "exclude_archived": include_archived is False,
                "types": "public_channel,private_channel",
            },
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_slack_error,
        )

    if normalized_action == "channel_history":
        if not resolved_channel_id:
            return "ERROR: channel_id is required for Slack channel_history."

        return await execute_integration_request(
            service_name="Slack",
            method="GET",
            url="/conversations.history",
            query={
                "channel": resolved_channel_id,
                "limit": limit,
                "cursor": cursor,
                "oldest": oldest,
                "latest": latest,
            },
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_slack_error,
        )

    if normalized_action == "thread_replies":
        if not resolved_channel_id:
            return "ERROR: channel_id is required for Slack thread_replies."
        if not thread_ts:
            return "ERROR: thread_ts is required for Slack thread_replies."

        return await execute_integration_request(
            service_name="Slack",
            method="GET",
            url="/conversations.replies",
            query={
                "channel": resolved_channel_id,
                "ts": thread_ts,
                "limit": limit,
                "cursor": cursor,
            },
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_slack_error,
        )

    return (
        "ERROR: Unsupported Slack action. Use post_message, reply_in_thread, "
        "list_channels, channel_history, or thread_replies."
    )


tool_registry.register(
    name="slack",
    description=(
        "Interact with Slack channels and messages using the Slack Web API. "
        "Use this for posting updates, replying in threads, listing channels, "
        "or reading channel history."
    ),
    parameters=PARAMS,
    handler=_handle,
    config_schema=[
        {
            "name": "credential_ref",
            "type": "string",
            "label": "Credential Reference",
            "description": "Credential vault entry containing the Slack Authorization header.",
            "default": "",
        },
        {
            "name": "default_channel_id",
            "type": "string",
            "label": "Default Channel ID",
            "description": "Optional Slack channel ID used when the agent omits channel_id.",
            "default": "",
        },
        {
            "name": "default_timeout_seconds",
            "type": "number",
            "label": "Default Timeout (seconds)",
            "description": "Default request timeout applied to Slack API calls.",
            "default": 20,
        },
        {
            "name": "default_max_response_chars",
            "type": "number",
            "label": "Default Max Response Characters",
            "description": "Default maximum number of response characters returned to the agent.",
            "default": 8000,
        },
    ],
)
