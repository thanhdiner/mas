"""
Tool: read_website — fetch and extract text content from a URL.

Uses httpx + a simple HTML-to-text approach.
"""

import re
from app.tools.registry import tool_registry

PARAMS = {
    "type": "object",
    "properties": {
        "url": {
            "type": "string",
            "description": "The URL of the webpage to read.",
        },
        "max_chars": {
            "type": "integer",
            "description": "Maximum characters to return (default 5000, max 15000).",
        },
    },
    "required": ["url"],
}


def _html_to_text(html: str) -> str:
    """Crude but effective HTML → plain text."""
    # Remove script/style
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
    # Remove tags
    text = re.sub(r"<[^>]+>", " ", html)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


async def _handle(url: str, max_chars: int = 5000, **_) -> str:
    max_chars = min(max(max_chars, 500), 15000)

    try:
        import httpx

        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "MAS-Agent/1.0"})
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            if "text/html" in content_type or "text/plain" in content_type:
                text = _html_to_text(resp.text)
            else:
                text = resp.text

            if len(text) > max_chars:
                text = text[:max_chars] + "\n...[truncated]"

            return text or "Page returned empty content."
    except Exception as e:
        return f"Failed to read website: {e}"


tool_registry.register(
    name="read_website",
    description="Fetch and extract the text content of a webpage given its URL. Useful for reading articles, documentation, or any public web page.",
    parameters=PARAMS,
    handler=_handle,
)
