from __future__ import annotations

from typing import Any

from app.tools.integration_common import execute_integration_request
from app.tools.registry import tool_registry

BASE_URL = "https://api.github.com"
ALLOWED_DOMAINS = ["api.github.com"]
DEFAULT_GITHUB_API_VERSION = "2022-11-28"

PARAMS = {
    "type": "object",
    "properties": {
        "action": {
            "type": "string",
            "description": (
                "GitHub action to execute. Supported actions: get_issue, "
                "list_issues, create_issue, add_issue_comment, list_pull_requests."
            ),
        },
        "owner": {
            "type": "string",
            "description": "GitHub repository owner. Falls back to default_owner if configured.",
        },
        "repo": {
            "type": "string",
            "description": "GitHub repository name. Falls back to default_repo if configured.",
        },
        "issue_number": {
            "type": "integer",
            "description": "Issue number for get_issue or add_issue_comment.",
        },
        "title": {
            "type": "string",
            "description": "Issue title for create_issue.",
        },
        "body": {
            "type": "string",
            "description": "Issue body, comment body, or pull request description text.",
        },
        "labels": {
            "type": "array",
            "description": "Optional issue labels for create_issue.",
            "items": {"type": "string"},
        },
        "state": {
            "type": "string",
            "description": "State filter for list_issues or list_pull_requests. Example: open, closed, all.",
        },
        "per_page": {
            "type": "integer",
            "description": "Maximum items to return for list actions. Default 20.",
        },
        "page": {
            "type": "integer",
            "description": "Page number for list actions.",
        },
        "sort": {
            "type": "string",
            "description": "Optional GitHub sort field for list_issues.",
        },
        "direction": {
            "type": "string",
            "description": "Optional GitHub sort direction for list actions.",
        },
    },
    "required": ["action"],
}


def _extract_github_error(body: Any) -> str | None:
    if isinstance(body, dict):
        message = body.get("message")
        if isinstance(message, str) and message.strip():
            return message
    return None


async def _handle(
    action: str,
    owner: str | None = None,
    repo: str | None = None,
    issue_number: int | None = None,
    title: str | None = None,
    body: str | None = None,
    labels: list[str] | None = None,
    state: str | None = None,
    per_page: int = 20,
    page: int | None = None,
    sort: str | None = None,
    direction: str | None = None,
    **kwargs,
) -> str:
    normalized_action = (action or "").strip().lower()
    resolved_owner = str(owner or kwargs.get("default_owner") or "").strip()
    resolved_repo = str(repo or kwargs.get("default_repo") or "").strip()
    if normalized_action not in {"list_pull_requests"} and (
        not resolved_owner or not resolved_repo
    ):
        return (
            "ERROR: owner and repo are required for GitHub actions. "
            "Configure default_owner/default_repo or pass them in the tool call."
        )

    api_version = str(
        kwargs.get("github_api_version") or DEFAULT_GITHUB_API_VERSION
    ).strip()
    headers = {
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": api_version,
    }

    if normalized_action == "get_issue":
        if issue_number is None:
            return "ERROR: issue_number is required for GitHub get_issue."

        return await execute_integration_request(
            service_name="GitHub",
            method="GET",
            url=f"/repos/{resolved_owner}/{resolved_repo}/issues/{issue_number}",
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_github_error,
        )

    if normalized_action == "list_issues":
        return await execute_integration_request(
            service_name="GitHub",
            method="GET",
            url=f"/repos/{resolved_owner}/{resolved_repo}/issues",
            query={
                "state": state or "open",
                "per_page": per_page,
                "page": page,
                "sort": sort,
                "direction": direction,
            },
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_github_error,
        )

    if normalized_action == "create_issue":
        if not title:
            return "ERROR: title is required for GitHub create_issue."

        payload: dict[str, Any] = {
            "title": title,
        }
        if body:
            payload["body"] = body
        if labels:
            payload["labels"] = labels

        return await execute_integration_request(
            service_name="GitHub",
            method="POST",
            url=f"/repos/{resolved_owner}/{resolved_repo}/issues",
            json_body=payload,
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_github_error,
        )

    if normalized_action == "add_issue_comment":
        if issue_number is None:
            return "ERROR: issue_number is required for GitHub add_issue_comment."
        if not body:
            return "ERROR: body is required for GitHub add_issue_comment."

        return await execute_integration_request(
            service_name="GitHub",
            method="POST",
            url=f"/repos/{resolved_owner}/{resolved_repo}/issues/{issue_number}/comments",
            json_body={"body": body},
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_github_error,
        )

    if normalized_action == "list_pull_requests":
        if not resolved_owner or not resolved_repo:
            return "ERROR: owner and repo are required for GitHub list_pull_requests."

        return await execute_integration_request(
            service_name="GitHub",
            method="GET",
            url=f"/repos/{resolved_owner}/{resolved_repo}/pulls",
            query={
                "state": state or "open",
                "per_page": per_page,
                "page": page,
                "sort": sort,
                "direction": direction,
            },
            headers=headers,
            credential_ref=kwargs.get("credential_ref"),
            base_url=BASE_URL,
            allowed_domains=ALLOWED_DOMAINS,
            default_timeout_seconds=kwargs.get("default_timeout_seconds"),
            default_max_response_chars=kwargs.get("default_max_response_chars"),
            api_error_extractor=_extract_github_error,
        )

    return (
        "ERROR: Unsupported GitHub action. Use get_issue, list_issues, "
        "create_issue, add_issue_comment, or list_pull_requests."
    )


tool_registry.register(
    name="github",
    description=(
        "Interact with GitHub repositories for issues and pull requests. "
        "Use this to read issues, create issues, comment on issues, or "
        "inspect pull requests."
    ),
    parameters=PARAMS,
    handler=_handle,
    config_schema=[
        {
            "name": "credential_ref",
            "type": "string",
            "label": "Credential Reference",
            "description": "Credential vault entry containing the GitHub Authorization header.",
            "default": "",
        },
        {
            "name": "default_owner",
            "type": "string",
            "label": "Default Owner",
            "description": "Optional GitHub owner used when the agent omits owner.",
            "default": "",
        },
        {
            "name": "default_repo",
            "type": "string",
            "label": "Default Repo",
            "description": "Optional GitHub repository used when the agent omits repo.",
            "default": "",
        },
        {
            "name": "github_api_version",
            "type": "string",
            "label": "GitHub API Version",
            "description": "GitHub API version header value.",
            "default": DEFAULT_GITHUB_API_VERSION,
        },
        {
            "name": "default_timeout_seconds",
            "type": "number",
            "label": "Default Timeout (seconds)",
            "description": "Default request timeout applied to GitHub API calls.",
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
