from __future__ import annotations

from typing import Any

from app.tools.integration_common import execute_integration_request
from app.tools.registry import tool_registry

BASE_URL = "https://api.notion.com/v1"
ALLOWED_DOMAINS = ["api.notion.com"]
DEFAULT_NOTION_VERSION = "2022-06-28"

PARAMS = {
    "type": "object",
    "properties": {
        "action": {
            "type": "string",
            "description": (
                "Notion action to execute. Supported actions: search, "
                "query_database, create_page, append_block_children."
            ),
        },
        "query": {
            "type": "string",
            "description": "Search query for the search action.",
        },
        "database_id": {
            "type": "string",
            "description": "Notion database ID. Falls back to default_database_id if configured.",
        },
        "parent_page_id": {
            "type": "string",
            "description": "Parent page ID for create_page. Falls back to default_parent_page_id if configured.",
        },
        "block_id": {
            "type": "string",
            "description": "Block ID for append_block_children.",
        },
        "page_size": {
            "type": "integer",
            "description": "Maximum number of results to return. Default 20.",
        },
        "start_cursor": {
            "type": "string",
            "description": "Cursor from a previous Notion response.",
        },
        "filter": {
            "type": "object",
            "description": "Optional Notion filter object for query_database.",
            "additionalProperties": True,
        },
        "sorts": {
            "type": "array",
            "description": "Optional Notion sorts array for query_database.",
            "items": {"type": "object", "additionalProperties": True},
        },
        "properties": {
            "type": "object",
            "description": "Properties payload for create_page.",
            "additionalProperties": True,
        },
        "children": {
            "type": "array",
            "description": "Notion child blocks for create_page or append_block_children.",
            "items": {"type": "object", "additionalProperties": True},
        },
        "title": {
            "type": "string",
            "description": "Simple page title helper when creating a page under a parent page.",
        },
    },
    "required": ["action"],
}


async def _handle(
    action: str,
    query: str | None = None,
    database_id: str | None = None,
    parent_page_id: str | None = None,
    block_id: str | None = None,
    page_size: int = 20,
    start_cursor: str | None = None,
    filter: dict[str, Any] | None = None,
    sorts: list[dict[str, Any]] | None = None,
    properties: dict[str, Any] | None = None,
    children: list[dict[str, Any]] | None = None,
    title: str | None = None,
    **kwargs,
) -> str:
    normalized_action = (action or "").strip().lower()
    notion_version = str(
        kwargs.get("notion_version") or DEFAULT_NOTION_VERSION
    ).strip()
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Notion-Version": notion_version,
    }

    if normalized_action == "search":
        payload: dict[str, Any] = {"page_size": page_size}
        if query:
            payload["query"] = query
        if start_cursor:
            payload["start_cursor"] = start_cursor

        return await execute_integration_request(
            service_name="Notion",
            method="POST",
            url="/search",
            json_body=payload,
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
        )

    if normalized_action == "query_database":
        resolved_database_id = str(
            database_id or kwargs.get("default_database_id") or ""
        ).strip()
        if not resolved_database_id:
            return "ERROR: database_id is required for Notion query_database."

        payload = {
            "page_size": page_size,
            "start_cursor": start_cursor,
            "filter": filter,
            "sorts": sorts,
        }

        return await execute_integration_request(
            service_name="Notion",
            method="POST",
            url=f"/databases/{resolved_database_id}/query",
            json_body={key: value for key, value in payload.items() if value is not None},
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
        )

    if normalized_action == "create_page":
        resolved_database_id = str(
            database_id or kwargs.get("default_database_id") or ""
        ).strip()
        resolved_parent_page_id = str(
            parent_page_id or kwargs.get("default_parent_page_id") or ""
        ).strip()
        if not resolved_database_id and not resolved_parent_page_id:
            return (
                "ERROR: database_id or parent_page_id is required for Notion "
                "create_page."
            )

        if properties:
            page_properties = properties
        elif resolved_parent_page_id and title:
            page_properties = {
                "title": {
                    "title": [
                        {
                            "text": {
                                "content": title,
                            }
                        }
                    ]
                }
            }
        else:
            return (
                "ERROR: properties are required for Notion create_page. "
                "For parent pages, you may also provide a simple title."
            )

        parent: dict[str, str]
        if resolved_database_id:
            parent = {"database_id": resolved_database_id}
        else:
            parent = {"page_id": resolved_parent_page_id}

        payload = {
            "parent": parent,
            "properties": page_properties,
        }
        if children:
            payload["children"] = children

        return await execute_integration_request(
            service_name="Notion",
            method="POST",
            url="/pages",
            json_body=payload,
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
        )

    if normalized_action == "append_block_children":
        resolved_block_id = str(block_id or "").strip()
        if not resolved_block_id:
            return "ERROR: block_id is required for Notion append_block_children."
        if not children:
            return "ERROR: children are required for Notion append_block_children."

        return await execute_integration_request(
            service_name="Notion",
            method="PATCH",
            url=f"/blocks/{resolved_block_id}/children",
            json_body={"children": children},
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
        )

    return (
        "ERROR: Unsupported Notion action. Use search, query_database, "
        "create_page, or append_block_children."
    )


tool_registry.register(
    name="notion",
    description=(
        "Interact with Notion workspaces for search, database queries, page "
        "creation, and block updates."
    ),
    parameters=PARAMS,
    handler=_handle,
    config_schema=[
        {
            "name": "credential_ref",
            "type": "string",
            "label": "Credential Reference",
            "description": "Credential vault entry containing the Notion Authorization header.",
            "default": "",
        },
        {
            "name": "default_database_id",
            "type": "string",
            "label": "Default Database ID",
            "description": "Optional default database used when the agent omits database_id.",
            "default": "",
        },
        {
            "name": "default_parent_page_id",
            "type": "string",
            "label": "Default Parent Page ID",
            "description": "Optional parent page used when the agent creates a page without parent_page_id.",
            "default": "",
        },
        {
            "name": "notion_version",
            "type": "string",
            "label": "Notion Version",
            "description": "Notion API version header value.",
            "default": DEFAULT_NOTION_VERSION,
        },
        {
            "name": "default_timeout_seconds",
            "type": "number",
            "label": "Default Timeout (seconds)",
            "description": "Default request timeout applied to Notion API calls.",
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
