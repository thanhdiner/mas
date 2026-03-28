from __future__ import annotations

import base64
from email.message import EmailMessage
from typing import Any

from app.tools.integration_common import execute_integration_request
from app.tools.registry import tool_registry

BASE_URL = "https://gmail.googleapis.com"
ALLOWED_DOMAINS = ["gmail.googleapis.com"]

PARAMS = {
    "type": "object",
    "properties": {
        "action": {
            "type": "string",
            "description": (
                "Gmail action to execute. Supported actions: send_email, "
                "list_messages, get_message."
            ),
        },
        "to": {
            "type": "string",
            "description": "Recipient email address for send_email. Use comma-separated values for multiple recipients.",
        },
        "cc": {
            "type": "string",
            "description": "Optional CC recipients for send_email.",
        },
        "bcc": {
            "type": "string",
            "description": "Optional BCC recipients for send_email.",
        },
        "subject": {
            "type": "string",
            "description": "Email subject for send_email.",
        },
        "body_text": {
            "type": "string",
            "description": "Plain-text email body for send_email.",
        },
        "body_html": {
            "type": "string",
            "description": "Optional HTML email body for send_email.",
        },
        "query": {
            "type": "string",
            "description": "Gmail search query for list_messages.",
        },
        "max_results": {
            "type": "integer",
            "description": "Maximum messages to return for list_messages. Default 10.",
        },
        "message_id": {
            "type": "string",
            "description": "Gmail message ID for get_message.",
        },
        "format": {
            "type": "string",
            "description": "Message format for get_message. Supported values: full, metadata, minimal, raw.",
        },
    },
    "required": ["action"],
}


def _build_gmail_raw_message(
    *,
    to: str,
    subject: str,
    body_text: str | None,
    body_html: str | None,
    cc: str | None,
    bcc: str | None,
) -> str:
    message = EmailMessage()
    message["To"] = to
    message["Subject"] = subject
    if cc:
        message["Cc"] = cc
    if bcc:
        message["Bcc"] = bcc

    plain_text_body = (body_text or "").strip()
    html_body = (body_html or "").strip()
    if not plain_text_body and not html_body:
        raise ValueError("body_text or body_html is required for Gmail send_email.")

    if plain_text_body:
        message.set_content(plain_text_body)
    else:
        message.set_content("This email contains HTML content.", subtype="plain")

    if html_body:
        message.add_alternative(html_body, subtype="html")

    return base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")


def _extract_gmail_error(body: Any) -> str | None:
    if isinstance(body, dict):
        error_value = body.get("error")
        if isinstance(error_value, dict):
            message_value = error_value.get("message")
            if isinstance(message_value, str) and message_value.strip():
                return message_value
        message = body.get("message")
        if isinstance(message, str) and message.strip():
            return message
    return None


async def _handle(
    action: str,
    to: str | None = None,
    cc: str | None = None,
    bcc: str | None = None,
    subject: str | None = None,
    body_text: str | None = None,
    body_html: str | None = None,
    query: str | None = None,
    max_results: int = 10,
    message_id: str | None = None,
    format: str = "full",
    **kwargs,
) -> str:
    normalized_action = (action or "").strip().lower()
    resolved_user_id = str(kwargs.get("user_id") or "me").strip() or "me"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    if normalized_action == "send_email":
        if not to:
            return "ERROR: to is required for Gmail send_email."
        if not subject:
            return "ERROR: subject is required for Gmail send_email."

        try:
            raw_message = _build_gmail_raw_message(
                to=to,
                subject=subject,
                body_text=body_text,
                body_html=body_html,
                cc=cc,
                bcc=bcc,
            )
        except ValueError as exc:
            return f"ERROR: {exc}"

        return await execute_integration_request(
            service_name="Gmail",
            method="POST",
            url=f"/gmail/v1/users/{resolved_user_id}/messages/send",
            json_body={"raw": raw_message},
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_gmail_error,
        )

    if normalized_action == "list_messages":
        return await execute_integration_request(
            service_name="Gmail",
            method="GET",
            url=f"/gmail/v1/users/{resolved_user_id}/messages",
            query={
                "q": query,
                "maxResults": max_results,
            },
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_gmail_error,
        )

    if normalized_action == "get_message":
        if not message_id:
            return "ERROR: message_id is required for Gmail get_message."

        return await execute_integration_request(
            service_name="Gmail",
            method="GET",
            url=f"/gmail/v1/users/{resolved_user_id}/messages/{message_id}",
            query={"format": format or "full"},
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_gmail_error,
        )

    return "ERROR: Unsupported Gmail action. Use send_email, list_messages, or get_message."


tool_registry.register(
    name="gmail",
    description=(
        "Interact with Gmail for sending email and reading messages through "
        "the Gmail API."
    ),
    parameters=PARAMS,
    handler=_handle,
    config_schema=[
        {
            "name": "credential_ref",
            "type": "string",
            "label": "Credential Reference",
            "description": "Credential vault entry containing the Gmail Authorization header.",
            "default": "",
        },
        {
            "name": "user_id",
            "type": "string",
            "label": "User ID",
            "description": "Gmail user ID. Leave as 'me' for the authenticated account.",
            "default": "me",
        },
        {
            "name": "default_timeout_seconds",
            "type": "number",
            "label": "Default Timeout (seconds)",
            "description": "Default request timeout applied to Gmail API calls.",
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
