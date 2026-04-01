"""
Tool: knowledge_search — search the internal Knowledge Base (RAG).

Allows agents to retrieve relevant passages from documents previously
uploaded to the Knowledge Base.  Uses ChromaDB vector search when available,
with a MongoDB text-search fallback.
"""

import json
from app.tools.registry import tool_registry

PARAMS = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "The search query to find relevant knowledge documents.",
        },
        "max_results": {
            "type": "integer",
            "description": "Maximum number of relevant passages to return (default 5, max 10).",
        },
    },
    "required": ["query"],
}


async def _handle(query: str, max_results: int = 5, **_) -> str:
    """
    Search the Knowledge Base.

    1. Try ChromaDB vector (semantic) search first.
    2. Fall back to MongoDB text search if ChromaDB is unavailable.
    """
    max_results = min(max(max_results, 1), 10)

    # ── 1. Semantic search via ChromaDB ──────────────────────
    try:
        from app.services.vector_store import search as vector_search, is_available

        if is_available():
            results = await vector_search(query=query, limit=max_results)
            if results:
                formatted = []
                for r in results:
                    formatted.append({
                        "source": r.get("doc_name", "Unknown"),
                        "relevance": r.get("similarity", 0),
                        "content": r.get("content", ""),
                    })
                return json.dumps(formatted, ensure_ascii=False)
    except ImportError:
        pass
    except Exception:
        pass  # fall through to MongoDB fallback

    # ── 2. Fallback: MongoDB text / regex search ─────────────
    try:
        from app.database import get_db

        db = get_db()
        if db is None:
            return "Knowledge Base is unavailable (database not connected)."

        # First try $text index search (requires a text index on 'textContent')
        cursor = None
        try:
            cursor = db.knowledge.find(
                {"$text": {"$search": query}},
                {"score": {"$meta": "textScore"}, "name": 1, "textContent": 1},
            ).sort([("score", {"$meta": "textScore"})]).limit(max_results)
        except Exception:
            # No text index — fall back to regex
            import re
            safe_query = re.escape(query)
            cursor = db.knowledge.find(
                {
                    "$or": [
                        {"name": {"$regex": safe_query, "$options": "i"}},
                        {"textContent": {"$regex": safe_query, "$options": "i"}},
                        {"description": {"$regex": safe_query, "$options": "i"}},
                        {"tags": {"$regex": safe_query, "$options": "i"}},
                    ]
                },
                {"name": 1, "textContent": 1, "description": 1},
            ).limit(max_results)

        results = []
        async for doc in cursor:
            text = doc.get("textContent", "") or doc.get("description", "")
            # Return a meaningful snippet (first 600 chars around the match)
            snippet = _extract_snippet(text, query, window=600)
            results.append({
                "source": doc.get("name", "Unknown"),
                "content": snippet,
            })

        if results:
            return json.dumps(results, ensure_ascii=False)
        return "No relevant documents found in the Knowledge Base."

    except Exception as e:
        return f"Knowledge search failed: {e}"


def _extract_snippet(text: str, query: str, window: int = 600) -> str:
    """Return a snippet of *text* centered around the first occurrence of *query*."""
    if not text:
        return ""
    lower = text.lower()
    idx = lower.find(query.lower())
    if idx == -1:
        # No exact match — return the beginning of the document
        return text[:window].strip()

    start = max(0, idx - window // 2)
    end = min(len(text), idx + window // 2)
    snippet = text[start:end].strip()
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet = snippet + "..."
    return snippet


tool_registry.register(
    name="knowledge_search",
    description=(
        "Search the internal Knowledge Base for relevant information. "
        "Use this tool when the task mentions internal documents, company policies, "
        "uploaded files, or any domain-specific knowledge that was previously provided. "
        "Returns matching passages from uploaded documents."
    ),
    parameters=PARAMS,
    handler=_handle,
    config_schema=[
        {
            "name": "max_results_limit",
            "type": "number",
            "label": "Max Results Limit",
            "description": "Hard limit on how many passages the agent can retrieve per search.",
            "default": 10,
        }
    ],
)
