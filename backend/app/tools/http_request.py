"""
Tool: http_request - make outbound HTTP requests with basic SSRF guardrails.

Supports common REST patterns:
  - GET/POST/PUT/PATCH/DELETE
  - Query params
  - JSON payloads
  - Custom headers

Safety constraints:
  - Only http/https URLs
  - Blocks localhost, loopback, link-local, multicast, reserved, and private IPs
  - Optional domain allowlist via tool settings
  - Response size is capped before returning to the agent
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from app.services.tool_credential_service import ToolCredentialService
from app.tools.registry import tool_registry

ALLOWED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
DEFAULT_TIMEOUT_SECONDS = 20
MAX_TIMEOUT_SECONDS = 60
DEFAULT_MAX_RESPONSE_CHARS = 8000
MAX_RESPONSE_CHARS_LIMIT = 20000
BLOCKED_REQUEST_HEADERS = {"host", "content-length", "transfer-encoding", "connection"}

PARAMS = {
    "type": "object",
    "properties": {
        "url": {
            "type": "string",
            "description": "Absolute URL to call, or a relative path if base_url is configured for this tool.",
        },
        "method": {
            "type": "string",
            "description": "HTTP method to use. Allowed values: GET, POST, PUT, PATCH, DELETE. Default GET.",
        },
        "headers": {
            "type": "object",
            "description": "Optional HTTP headers to include in the request.",
            "additionalProperties": {
                "type": "string",
            },
        },
        "query": {
            "type": "object",
            "description": "Optional query parameters to append to the URL.",
            "additionalProperties": True,
        },
        "json_body": {
            "type": "object",
            "description": "Optional JSON request body for POST/PUT/PATCH requests.",
            "additionalProperties": True,
        },
        "body": {
            "type": "string",
            "description": "Optional raw text body for POST/PUT/PATCH requests.",
        },
        "timeout_seconds": {
            "type": "integer",
            "description": "Request timeout in seconds. Default 20, max 60.",
        },
        "max_response_chars": {
            "type": "integer",
            "description": "Maximum number of response characters to return. Default 8000, max 20000.",
        },
    },
    "required": ["url"],
}


def _coerce_string_map(value: Any) -> dict[str, str]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("Expected an object of string values.")

    coerced: dict[str, str] = {}
    for key, item in value.items():
        if item is None:
            continue
        coerced[str(key)] = str(item)
    return coerced


def _coerce_query_params(value: Any) -> dict[str, str]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("Expected an object of query parameters.")

    params: dict[str, str] = {}
    for key, item in value.items():
        if item is None:
            continue
        if isinstance(item, bool):
            params[str(key)] = "true" if item else "false"
        else:
            params[str(key)] = str(item)
    return params


def _parse_allowed_domains(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        parts = value.split(",")
    elif isinstance(value, list):
        parts = value
    else:
        raise ValueError("allowed_domains must be a comma-separated string or list of strings.")

    domains: list[str] = []
    for part in parts:
        normalized = str(part).strip().lower()
        if normalized:
            domains.append(normalized.lstrip("."))
    return domains


def _hostname_matches_allowed_domain(hostname: str, allowed_domains: list[str]) -> bool:
    normalized_host = hostname.lower().rstrip(".")
    for allowed_domain in allowed_domains:
        if normalized_host == allowed_domain or normalized_host.endswith(f".{allowed_domain}"):
            return True
    return False


def _parse_ip_address(
    value: str,
) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(value)
    except ValueError:
        return None


def _is_blocked_ip(ip_str: str) -> bool:
    ip = ipaddress.ip_address(ip_str)
    return any(
        [
            ip.is_private,
            ip.is_loopback,
            ip.is_link_local,
            ip.is_multicast,
            ip.is_reserved,
            ip.is_unspecified,
        ]
    )


async def _resolve_hostname_ips(hostname: str) -> set[str]:
    loop = asyncio.get_running_loop()
    addrinfo = await loop.getaddrinfo(hostname, None, type=0, proto=0)
    ips: set[str] = set()
    for entry in addrinfo:
        sockaddr = entry[4]
        if sockaddr:
            ips.add(sockaddr[0])
    return ips


async def _validate_request_url(
    raw_url: str,
    base_url: str | None,
    allowed_domains: list[str],
) -> str:
    candidate = (raw_url or "").strip()
    if not candidate:
        raise ValueError("URL is required.")

    if base_url and not urlparse(candidate).scheme:
        candidate = urljoin(base_url.rstrip("/") + "/", candidate.lstrip("/"))

    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http and https URLs are allowed.")
    if not parsed.hostname:
        raise ValueError("URL must include a valid hostname.")
    if parsed.username or parsed.password:
        raise ValueError("Credentials in the URL are not allowed.")

    hostname = parsed.hostname.strip().lower()
    if hostname in {"localhost", "127.0.0.1", "::1", "0.0.0.0"}:
        raise ValueError("Requests to localhost are not allowed.")

    if allowed_domains and not _hostname_matches_allowed_domain(hostname, allowed_domains):
        raise ValueError(
            f"Hostname '{hostname}' is not in the allowed domains list."
        )

    parsed_ip = _parse_ip_address(hostname)
    if parsed_ip and _is_blocked_ip(str(parsed_ip)):
        raise ValueError("Requests to private or reserved IP ranges are not allowed.")

    resolved_ips = await _resolve_hostname_ips(hostname)
    if not resolved_ips:
        raise ValueError(f"Could not resolve hostname '{hostname}'.")

    blocked_ips = sorted(ip for ip in resolved_ips if _is_blocked_ip(ip))
    if blocked_ips:
        raise ValueError(
            "Requests to private or reserved IP ranges are not allowed."
        )

    return candidate


def _merge_headers(default_headers: Any, headers: Any) -> dict[str, str]:
    merged = _coerce_string_map(default_headers)
    merged.update(_coerce_string_map(headers))

    invalid_headers = [
        name for name in merged if name.strip().lower() in BLOCKED_REQUEST_HEADERS
    ]
    if invalid_headers:
        raise ValueError(
            f"Blocked request headers are not allowed: {', '.join(sorted(invalid_headers))}."
        )

    merged.setdefault("User-Agent", "MAS-Agent/1.0")
    return merged


def _format_response_content(response: httpx.Response, max_response_chars: int) -> str:
    content_type = response.headers.get("content-type", "").lower()

    parsed_body: Any
    if "application/json" in content_type:
        try:
            parsed_body = response.json()
        except ValueError:
            parsed_body = response.text
    else:
        parsed_body = response.text

    if isinstance(parsed_body, (dict, list)):
        body_text = json.dumps(parsed_body, ensure_ascii=False, indent=2)
    else:
        body_text = str(parsed_body)

    truncated = len(body_text) > max_response_chars
    if truncated:
        body_text = body_text[:max_response_chars] + "\n...[truncated]"

    response_payload = {
        "url": str(response.url),
        "status_code": response.status_code,
        "reason_phrase": response.reason_phrase,
        "content_type": response.headers.get("content-type", ""),
        "headers": {
            "content-type": response.headers.get("content-type", ""),
            "cache-control": response.headers.get("cache-control", ""),
        },
        "body": body_text,
        "truncated": truncated,
    }
    return json.dumps(response_payload, ensure_ascii=False)


async def _handle(
    url: str,
    method: str = "GET",
    headers: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    body: str | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    max_response_chars: int = DEFAULT_MAX_RESPONSE_CHARS,
    **kwargs,
) -> str:
    try:
        normalized_method = (method or "GET").upper()
        if normalized_method not in ALLOWED_METHODS:
            return (
                "ERROR: Unsupported HTTP method. Allowed values are "
                + ", ".join(sorted(ALLOWED_METHODS))
                + "."
            )

        effective_timeout = kwargs.get("default_timeout_seconds", timeout_seconds)
        effective_timeout = min(max(int(effective_timeout), 1), MAX_TIMEOUT_SECONDS)

        effective_max_response_chars = kwargs.get(
            "default_max_response_chars",
            max_response_chars,
        )
        effective_max_response_chars = min(
            max(int(effective_max_response_chars), 250),
            MAX_RESPONSE_CHARS_LIMIT,
        )

        allowed_domains = _parse_allowed_domains(kwargs.get("allowed_domains"))
        base_url = kwargs.get("base_url")
        final_url = await _validate_request_url(url, base_url, allowed_domains)

        credential_headers = await ToolCredentialService.resolve_headers(
            kwargs.get("credential_ref")
        )
        merged_headers = _merge_headers(kwargs.get("default_headers"), credential_headers)
        merged_headers.update(_coerce_string_map(headers))
        merged_headers = _merge_headers({}, merged_headers)
        params = _coerce_query_params(query)

        request_kwargs: dict[str, Any] = {
            "method": normalized_method,
            "url": final_url,
            "headers": merged_headers,
            "params": params,
        }
        if json_body is not None and body is not None:
            return "ERROR: Provide either json_body or body, not both."
        if json_body is not None:
            request_kwargs["json"] = json_body
        elif body is not None:
            request_kwargs["content"] = body

        async with httpx.AsyncClient(
            timeout=effective_timeout,
            follow_redirects=True,
        ) as client:
            response = await client.request(**request_kwargs)

        return _format_response_content(response, effective_max_response_chars)
    except ValueError as exc:
        return f"ERROR: {exc}"
    except httpx.TimeoutException:
        return f"ERROR: Request timed out after {effective_timeout} seconds."
    except httpx.HTTPError as exc:
        return f"ERROR: HTTP request failed: {exc}"
    except Exception as exc:
        return f"ERROR: Unexpected HTTP tool failure: {exc}"


tool_registry.register(
    name="http_request",
    description=(
        "Make an HTTP request to an external API or website. Supports GET, POST, PUT, PATCH, "
        "and DELETE with headers, query parameters, and JSON bodies. Use this to integrate "
        "with REST APIs when a specialized tool does not exist."
    ),
    parameters=PARAMS,
    handler=_handle,
    config_schema=[
        {
            "name": "credential_ref",
            "type": "string",
            "label": "Credential Reference",
            "description": "Optional credential name from the vault. Its secret headers will be injected into every request.",
            "default": "",
        },
        {
            "name": "base_url",
            "type": "string",
            "label": "Base URL",
            "description": "Optional base URL used when the agent passes a relative path instead of a full URL.",
            "default": "",
        },
        {
            "name": "allowed_domains",
            "type": "string",
            "label": "Allowed Domains",
            "description": "Comma-separated allowlist of domains the tool may call. Leave empty to allow any public domain.",
            "default": "",
        },
        {
            "name": "default_timeout_seconds",
            "type": "number",
            "label": "Default Timeout (seconds)",
            "description": "Default request timeout applied when the agent does not specify one.",
            "default": DEFAULT_TIMEOUT_SECONDS,
        },
        {
            "name": "default_max_response_chars",
            "type": "number",
            "label": "Default Max Response Characters",
            "description": "Default maximum number of response characters returned to the agent.",
            "default": DEFAULT_MAX_RESPONSE_CHARS,
        },
    ],
)
