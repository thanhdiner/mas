"""
Tool: web_search — search the internet using DuckDuckGo.

No API key required. Uses the `duckduckgo_search` library.
Falls back to a simple httpx GET if the library is missing.
"""

import json
from app.tools.registry import tool_registry

PARAMS = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "The search query to look up on the internet.",
        },
        "max_results": {
            "type": "integer",
            "description": "Maximum number of results to return (default 5, max 10).",
        },
    },
    "required": ["query"],
}


async def _handle(query: str, max_results: int = 5, **_) -> str:
    max_results = min(max(max_results, 1), 10)

    # Try duckduckgo_search library first
    try:
        from duckduckgo_search import DDGS

        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                })
        if results:
            return json.dumps(results, ensure_ascii=False)
        return "No results found."
    except ImportError:
        pass

    # Fallback: use httpx to hit DuckDuckGo Lite
    try:
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://lite.duckduckgo.com/lite",
                params={"q": query},
                headers={"User-Agent": "MAS-Agent/1.0"},
            )
            text = resp.text[:3000]
            return f"[Raw search page excerpt]\n{text}"
    except Exception as e:
        return f"Search failed: {e}"


tool_registry.register(
    name="web_search",
    description="Search the internet using DuckDuckGo. Returns titles, URLs, and snippets. Use this when you need current information, facts, or data that may not be in your training data.",
    parameters=PARAMS,
    handler=_handle,
    config_schema=[
        {
            "name": "region",
            "type": "string",
            "label": "Region",
            "description": "Region code for search results (e.g., 'wt-wt' for worldwide, 'us-en' for US English).",
            "default": "wt-wt",
        },
        {
            "name": "max_results_limit",
            "type": "number",
            "label": "Max Results Limit",
            "description": "Hard limit on how many results the agent is allowed to request.",
            "default": 10,
        }
    ]
)
