from __future__ import annotations

import json
from typing import Any, Callable

import app.tools.http_request as http_request_tool

JsonBody = dict[str, Any] | list[Any]
APIErrorExtractor = Callable[[Any], str | None]


def _default_api_error_message(body: Any) -> str | None:
    if isinstance(body, dict):
        error_value = body.get("error")
        if isinstance(error_value, str) and error_value.strip():
            return error_value.strip()
        if isinstance(error_value, dict):
            nested_message = error_value.get("message")
            if isinstance(nested_message, str) and nested_message.strip():
                return nested_message.strip()
        message_value = body.get("message")
        if isinstance(message_value, str) and message_value.strip():
            return message_value.strip()
    return None


def _extract_json_body_from_result(result_payload: dict[str, Any]) -> Any | None:
    content_type = str(result_payload.get("content_type", "")).lower()
    body_text = result_payload.get("body")
    if "application/json" not in content_type or not isinstance(body_text, str):
        return None

    try:
        return json.loads(body_text)
    except ValueError:
        return None


async def execute_integration_request(
    *,
    service_name: str,
    url: str,
    method: str = "GET",
    headers: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None,
    json_body: JsonBody | None = None,
    body: str | None = None,
    credential_ref: str | None = None,
    base_url: str,
    allowed_domains: list[str],
    default_timeout_seconds: int | None = None,
    default_max_response_chars: int | None = None,
    api_error_extractor: APIErrorExtractor | None = None,
) -> str:
    result = await http_request_tool._handle(
        url=url,
        method=method,
        headers=headers,
        query=query,
        json_body=json_body,
        body=body,
        credential_ref=credential_ref,
        base_url=base_url,
        allowed_domains=allowed_domains,
        default_timeout_seconds=default_timeout_seconds
        or http_request_tool.DEFAULT_TIMEOUT_SECONDS,
        default_max_response_chars=default_max_response_chars
        or http_request_tool.DEFAULT_MAX_RESPONSE_CHARS,
    )

    if result.startswith("ERROR:"):
        return result

    try:
        result_payload = json.loads(result)
    except ValueError:
        return result

    body_payload = _extract_json_body_from_result(result_payload)
    extracted_api_error = (
        api_error_extractor(body_payload)
        if api_error_extractor is not None and body_payload is not None
        else None
    )

    if extracted_api_error:
        return f"ERROR: {service_name} API error: {extracted_api_error}"

    status_code = int(result_payload.get("status_code") or 0)
    if status_code >= 400:
        reason_phrase = result_payload.get("reason_phrase") or "Request failed"
        fallback_error = _default_api_error_message(body_payload)
        body_text = result_payload.get("body")
        detail = fallback_error
        if not detail and isinstance(body_text, str) and body_text.strip():
            detail = body_text[:300]

        if detail:
            return (
                f"ERROR: {service_name} API request failed with status "
                f"{status_code} {reason_phrase}: {detail}"
            )
        return (
            f"ERROR: {service_name} API request failed with status "
            f"{status_code} {reason_phrase}"
        )

    return result
