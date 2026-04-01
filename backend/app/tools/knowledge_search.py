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
    Hybrid search: always runs BOTH vector + keyword search, then merges results.
    This compensates for the English-only embedding model on Vietnamese content.
    """
    import logging
    import re
    logger = logging.getLogger("knowledge_search")

    max_results = min(max(max_results, 1), 10)
    logger.warning(f"[KS] query='{query}', max_results={max_results}")

    all_results = []  # Collect results from all strategies

    # ── Strategy 1: ChromaDB vector search ───────────────────
    try:
        from app.services.vector_store import search as vector_search, is_available
        if is_available():
            vr = await vector_search(query=query, limit=max_results)
            logger.warning(f"[KS] ChromaDB: {len(vr)} results")
            for r in vr:
                all_results.append({
                    "source": r.get("doc_name", "Unknown"),
                    "relevance": round(r.get("similarity", 0), 4),
                    "content": r.get("content", ""),
                    "_strategy": "vector",
                })
    except Exception as e:
        logger.warning(f"[KS] ChromaDB error: {e}")

    # ── Strategy 2: MongoDB keyword search (split into words) ─
    try:
        from app.database import get_db
        db = get_db()
        if db is not None:
            # Split query into individual words (min 2 chars each)
            words = [w.strip() for w in query.split() if len(w.strip()) >= 2]
            logger.warning(f"[KS] MongoDB keyword search with words: {words}")

            if words:
                # Build OR conditions: match ANY word in textContent
                or_conditions = []
                for word in words:
                    safe = re.escape(word)
                    or_conditions.append({"textContent": {"$regex": safe, "$options": "i"}})
                    or_conditions.append({"name": {"$regex": safe, "$options": "i"}})
                    or_conditions.append({"description": {"$regex": safe, "$options": "i"}})

                cursor = db.knowledge.find(
                    {"$or": or_conditions},
                    {"name": 1, "textContent": 1, "description": 1},
                ).limit(5)

                async for doc in cursor:
                    text = doc.get("textContent", "") or ""
                    # Extract snippets around EACH matched word
                    snippets = []
                    seen_positions = set()
                    for word in words:
                        positions = _find_all_positions(text.lower(), word.lower())
                        for pos in positions[:2]:  # Max 2 matches per word
                            # Skip if too close to a previous snippet
                            if any(abs(pos - sp) < 300 for sp in seen_positions):
                                continue
                            seen_positions.add(pos)
                            snippet = _extract_snippet(text, word, window=400)
                            if snippet and snippet not in snippets:
                                snippets.append(snippet)
                            if len(snippets) >= 3:
                                break

                    if not snippets:
                        snippets = [text[:600]]

                    for snippet in snippets:
                        all_results.append({
                            "source": doc.get("name", "Unknown"),
                            "relevance": 0.7,  # keyword match confidence
                            "content": snippet,
                            "_strategy": "keyword",
                        })

                logger.warning(f"[KS] MongoDB: {len([r for r in all_results if r['_strategy'] == 'keyword'])} keyword results")
    except Exception as e:
        logger.warning(f"[KS] MongoDB error: {e}")

    # ── Merge & Deduplicate ───────────────────────────────────
    if not all_results:
        return "No relevant documents found in the Knowledge Base."

    # Remove duplicate content (keep highest relevance)
    unique = {}
    for r in all_results:
        key = r["content"][:100]  # Deduplicate by first 100 chars
        if key not in unique or r["relevance"] > unique[key]["relevance"]:
            unique[key] = r

    # Sort by relevance, take top N
    final = sorted(unique.values(), key=lambda x: x["relevance"], reverse=True)[:max_results]

    # Clean internal fields
    for r in final:
        r.pop("_strategy", None)

    logger.warning(f"[KS] Returning {len(final)} merged results")
    return json.dumps(final, ensure_ascii=False)


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


def _find_all_positions(text: str, word: str) -> list[int]:
    """Find all starting positions of *word* in *text*."""
    positions = []
    start = 0
    while True:
        idx = text.find(word, start)
        if idx == -1:
            break
        positions.append(idx)
        start = idx + 1
    return positions

tool_registry.register(
    name="knowledge_search",
    description=(
        "Search the internal Knowledge Base for relevant information from uploaded documents. "
        "IMPORTANT QUERY TIPS: Use specific Vietnamese keywords, not vague questions. "
        "For example, instead of 'ai dạy môn này', search for 'giảng viên' or 'giáo viên' or 'PGS TS'. "
        "Instead of 'nội dung gì', search for the actual topic keywords. "
        "You can call this tool multiple times with different keywords to find relevant passages. "
        "The search works best with concrete nouns and proper names."
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
