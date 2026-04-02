from __future__ import annotations

from typing import Any

import httpx

from app.tools.registry import tool_registry

BASE_URL = "https://graph.facebook.com"

PARAMS = {
    "type": "object",
    "properties": {
        "action": {
            "type": "string",
            "description": (
                "Facebook action to execute. Only supported action: post_feed. "
                "Do NOT provide page_id — it is auto-configured."
            ),
        },
        "message": {
            "type": "string",
            "description": "The full text content of the Facebook post.",
        },
        "link": {
            "type": "string",
            "description": "Optional URL to attach to the post.",
        },
    },
    "required": ["action", "message"],
}


def _extract_token(credential_ref: str) -> str | None:
    """Extract raw token string from credential_ref."""
    ref = (credential_ref or "").strip()
    if ref.startswith("Bearer "):
        return ref[7:].strip()
    if ref.startswith("EAA"):
        return ref
    return None


async def _get_page_token(user_token: str, page_id: str) -> str | None:
    """Exchange a User/System-User token for a Page Access Token."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"{BASE_URL}/v19.0/{page_id}",
                params={"fields": "access_token", "access_token": user_token},
            )
            if res.status_code == 200:
                data = res.json()
                return data.get("access_token")
    except Exception:
        pass
    return None


async def _handle(
    action: str,
    message: str | None = None,
    link: str | None = None,
    **kwargs,
) -> str:
    normalized_action = (action or "").strip().lower()
    page_id = str(kwargs.get("default_page_id") or "").strip()
    credential_ref = str(kwargs.get("credential_ref") or "").strip()

    if normalized_action != "post_feed":
        return "ERROR: Unsupported action. Only post_feed is supported."

    if not page_id:
        return "ERROR: default_page_id is not configured in tool settings."
    if not message:
        return "ERROR: message is required."
    if not credential_ref:
        return "ERROR: credential_ref (Access Token) is not configured in tool settings."

    # Extract raw token
    raw_token = _extract_token(credential_ref)
    if not raw_token:
        return "ERROR: credential_ref must be a Facebook access token starting with EAA or 'Bearer EAA...'."

    # Exchange User Token → Page Token
    page_token = await _get_page_token(raw_token, page_id)
    if not page_token:
        # Fall back to using the raw token directly
        page_token = raw_token

    # Post to Facebook using access_token as query parameter (Facebook's required format)
    payload: dict[str, Any] = {"message": message}
    if link:
        payload["link"] = link

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                f"{BASE_URL}/v19.0/{page_id}/feed",
                params={"access_token": page_token},
                json=payload,
            )
            data = res.json()

            if "error" in data:
                err_msg = data["error"].get("message", str(data["error"]))
                return f"ERROR: Facebook API error: {err_msg}"

            post_id = data.get("id", "unknown")
            return f"SUCCESS: Post published to Facebook! Post ID: {post_id}"

    except httpx.TimeoutException:
        return "ERROR: Request to Facebook timed out."
    except Exception as exc:
        return f"ERROR: Unexpected failure posting to Facebook: {exc}"


tool_registry.register(
    name="facebook_page",
    description=(
        "Post content to a Facebook Fanpage. The page_id and access_token are "
        "pre-configured — just call with action='post_feed' and message='your content'. "
        "Do NOT guess or provide page_id yourself."
    ),
    parameters=PARAMS,
    handler=_handle,
    config_schema=[
        {
            "name": "credential_ref",
            "type": "string",
            "label": "Access Token",
            "description": (
                "Facebook Page or System-User Access Token. "
                "Paste the raw token starting with EAA... or prefix with 'Bearer '."
            ),
            "default": "",
        },
        {
            "name": "default_page_id",
            "type": "string",
            "label": "Page ID",
            "description": "Numeric Facebook Page ID (find it in Page Settings → About).",
            "default": "",
        },
    ],
)

