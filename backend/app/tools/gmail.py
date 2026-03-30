from __future__ import annotations

import base64
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


def _plain_text_to_html_newsletter(text: str, subject: str) -> str:
    """
    Convert plain-text newsletter content into a beautiful dark-themed HTML email.
    Auto-detects section headings (e.g. CÔNG NGHỆ:, AI:, CHỨNG KHOÁN:) and
    formats them as styled blocks.
    """
    import re
    import html as html_mod

    # Split text into sections by looking for uppercase heading lines
    # ending with a colon, e.g. "CÔNG NGHỆ:" or "AI:"
    lines = text.strip().split("\n")
    sections: list[tuple[str, str]] = []
    intro_lines: list[str] = []
    current_heading = ""
    current_content: list[str] = []

    for line in lines:
        stripped = line.strip()
        # Check if this line looks like a section heading: 
        # All-caps text followed by colon, e.g. "CÔNG NGHỆ: ..."
        colon_pos = stripped.find(":")
        if colon_pos > 0 and colon_pos <= 40:
            before_colon = stripped[:colon_pos].strip()
            after_colon = stripped[colon_pos + 1:].strip()
            # Check if the part before colon is uppercase-like (no lowercase)
            if before_colon and before_colon == before_colon.upper() and any(c.isalpha() for c in before_colon):
                # Save previous section
                if current_heading:
                    sections.append((current_heading, "\n".join(current_content).strip()))
                elif current_content:
                    intro_lines.extend(current_content)
                current_heading = before_colon
                current_content = [after_colon] if after_colon else []
                continue

        if current_heading:
            current_content.append(stripped)
        else:
            intro_lines.append(stripped)

    # Don't forget last section
    if current_heading:
        sections.append((current_heading, "\n".join(current_content).strip()))
    elif current_content:
        intro_lines.extend(current_content)

    # If no sections found, treat everything as one block
    if not sections:
        sections = [("", text.strip())]
        intro_lines = []

    intro_text = "\n".join(intro_lines).strip()

    # Color palette for sections
    colors = ["#7bd0ff", "#4edea3", "#f0c674", "#c792ea", "#ff7eb3", "#82aaff"]

    sections_html = ""
    for idx, (heading, content) in enumerate(sections):
        color = colors[idx % len(colors)]
        escaped_content = html_mod.escape(content).replace("\n", "<br>")

        if heading:
            sections_html += f"""
            <div style="margin-bottom: 24px; border-left: 3px solid {color}; padding-left: 16px;">
              <h2 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: {color}; text-transform: uppercase; letter-spacing: 1px;">
                {html_mod.escape(heading)}
              </h2>
              <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #d1d5db;">
                {escaped_content}
              </p>
            </div>"""
        else:
            sections_html += f"""
            <div style="margin-bottom: 24px;">
              <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #d1d5db;">
                {escaped_content}
              </p>
            </div>"""

    escaped_intro = html_mod.escape(intro_text).replace("\n", "<br>") if intro_text else ""
    intro_block = f"""<p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.7; color: #9ca3af;">{escaped_intro}</p>""" if escaped_intro else ""

    from datetime import datetime, timezone
    date_str = datetime.now(timezone.utc).strftime("%d/%m/%Y")

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0f0f1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0f0f1a; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #1a1a2e; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px 28px 24px; border-bottom: 1px solid rgba(123, 208, 255, 0.2);">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #7bd0ff;">
                {html_mod.escape(subject)}
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #8b9bb4; letter-spacing: 0.5px;">
                📅 {date_str} &nbsp;·&nbsp; Powered by MAS AI Agents
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px;">
              {intro_block}
              {sections_html}
              <!-- Footer -->
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.08); text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #6b7280; font-weight: 500;">
                  Bản tin được tạo tự động bởi <span style="color: #7bd0ff;">Multi-Agent System</span>
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _build_gmail_raw_message(
    *,
    to: str,
    subject: str,
    body_text: str | None,
    body_html: str | None,
    cc: str | None,
    bcc: str | None,
) -> str:
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    plain_text_body = (body_text or "").strip()
    html_body = (body_html or "").strip()
    if not plain_text_body and not html_body:
        raise ValueError("body_text or body_html is required for Gmail send_email.")

    # Auto-generate beautiful HTML if only plain text was provided
    if not html_body and plain_text_body:
        html_body = _plain_text_to_html_newsletter(plain_text_body, subject)

    # Build MIME message with explicit UTF-8 encoding
    message = MIMEMultipart("alternative")
    message["To"] = to
    message["Subject"] = subject
    if cc:
        message["Cc"] = cc
    if bcc:
        message["Bcc"] = bcc

    # Plain text part (fallback)
    if plain_text_body:
        part_plain = MIMEText(plain_text_body, "plain", "utf-8")
        message.attach(part_plain)

    # HTML part (preferred)
    if html_body:
        part_html = MIMEText(html_body, "html", "utf-8")
        message.attach(part_html)

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
