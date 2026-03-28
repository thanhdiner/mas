"""
Vector Store Service — ChromaDB-powered semantic search for Knowledge Base.

Handles:
  - Document chunking (split large docs into overlapping passages)
  - Embedding generation (using sentence-transformers locally or OpenAI)
  - Similarity search for RAG
  
ChromaDB provides persistent local vector storage without external dependency.
"""

import os
import logging
import uuid
from typing import Optional

logger = logging.getLogger("vector_store")

# Track whether ChromaDB is available
_CHROMA_AVAILABLE = False
_chroma_client = None
_collection = None

try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings
    _CHROMA_AVAILABLE = True
except ImportError:
    logger.warning(
        "chromadb not installed. Knowledge Base will use fallback text search. "
        "Install with: pip install chromadb"
    )


def _chunk_text(
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 100,
) -> list[str]:
    """
    Split text into overlapping chunks for better retrieval.
    
    Args:
        text: Full document text
        chunk_size: Target number of characters per chunk
        chunk_overlap: Number of characters to overlap between chunks
    """
    if not text or len(text) <= chunk_size:
        return [text] if text else []

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size

        # Try to break at a sentence boundary
        if end < len(text):
            # Look for sentence boundary within last 20% of chunk
            search_start = max(start, end - chunk_size // 5)
            last_period = text.rfind('. ', search_start, end)
            last_newline = text.rfind('\n', search_start, end)
            break_pos = max(last_period, last_newline)
            if break_pos > start:
                end = break_pos + 1

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end - chunk_overlap
        if start >= len(text):
            break

    return chunks


async def init_vector_store(persist_dir: str = "./chroma_data"):
    """Initialize ChromaDB client and collection."""
    global _chroma_client, _collection

    if not _CHROMA_AVAILABLE:
        logger.info("ChromaDB not available, using fallback search")
        return

    try:
        os.makedirs(persist_dir, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(
            path=persist_dir,
            settings=ChromaSettings(
                anonymized_telemetry=False,
            ),
        )
        _collection = _chroma_client.get_or_create_collection(
            name="knowledge_base",
            metadata={"hnsw:space": "cosine"},
        )
        count = _collection.count()
        logger.info(f"ChromaDB initialized: {count} embeddings in collection")
    except Exception as exc:
        logger.error(f"Failed to initialize ChromaDB: {exc}")
        _chroma_client = None
        _collection = None


async def add_document(
    doc_id: str,
    text: str,
    metadata: Optional[dict] = None,
) -> int:
    """
    Chunk and embed a document into the vector store.
    
    Returns the number of chunks created.
    """
    if not _CHROMA_AVAILABLE or _collection is None:
        return 0

    chunks = _chunk_text(text)
    if not chunks:
        return 0

    ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "doc_id": doc_id,
            "chunk_index": i,
            "doc_name": (metadata or {}).get("name", ""),
            **(metadata or {}),
        }
        for i in range(len(chunks))
    ]

    try:
        _collection.add(
            ids=ids,
            documents=chunks,
            metadatas=metadatas,
        )
        logger.info(f"Added {len(chunks)} chunks for document {doc_id}")
        return len(chunks)
    except Exception as exc:
        logger.error(f"Failed to add document to vector store: {exc}")
        return 0


async def remove_document(doc_id: str):
    """Remove all chunks for a document from the vector store."""
    if not _CHROMA_AVAILABLE or _collection is None:
        return

    try:
        # Get all chunk IDs for this document
        results = _collection.get(
            where={"doc_id": doc_id},
        )
        if results and results["ids"]:
            _collection.delete(ids=results["ids"])
            logger.info(f"Removed {len(results['ids'])} chunks for document {doc_id}")
    except Exception as exc:
        logger.error(f"Failed to remove document from vector store: {exc}")


async def search(
    query: str,
    limit: int = 5,
    doc_id: Optional[str] = None,
) -> list[dict]:
    """
    Semantic search across the knowledge base.
    
    Args:
        query: Search query text
        limit: Maximum number of results
        doc_id: Optional filter to search within a specific document
        
    Returns:
        List of results with score, content, and metadata
    """
    if not _CHROMA_AVAILABLE or _collection is None:
        return []

    try:
        kwargs = {
            "query_texts": [query],
            "n_results": limit,
        }
        if doc_id:
            kwargs["where"] = {"doc_id": doc_id}

        results = _collection.query(**kwargs)

        search_results = []
        if results and results["documents"]:
            for i, doc in enumerate(results["documents"][0]):
                distance = results["distances"][0][i] if results.get("distances") else 0
                # Convert cosine distance to similarity score (0-1)
                similarity = max(0, 1 - distance)
                metadata = results["metadatas"][0][i] if results.get("metadatas") else {}

                search_results.append({
                    "content": doc,
                    "similarity": round(similarity, 4),
                    "doc_id": metadata.get("doc_id", ""),
                    "doc_name": metadata.get("doc_name", ""),
                    "chunk_index": metadata.get("chunk_index", 0),
                })

        return search_results
    except Exception as exc:
        logger.error(f"Vector search failed: {exc}")
        return []


def is_available() -> bool:
    """Check if vector store is initialized and available."""
    return _CHROMA_AVAILABLE and _collection is not None
