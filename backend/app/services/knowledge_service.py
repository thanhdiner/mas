"""
Service: KnowledgeService — Business logic for Knowledge Base.

Handles file I/O, MongoDB operations, text extraction, and vector store
embedding.  Routes should delegate all heavy work here.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from app.config import get_settings
from app.database import get_db
from app.models.knowledge import (
    KnowledgeDocumentDetailResponse,
    KnowledgeDocumentResponse,
    KnowledgeListResponse,
    KnowledgeReindexResponse,
    KnowledgeSearchResult,
    KnowledgeStatsResponse,
    KnowledgeUploadResponse,
)
from app.services import vector_store
from app.services.text_extractor import extract_text

settings = get_settings()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "uploads",
    "knowledge",
)
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {
    ".txt", ".md", ".pdf", ".csv", ".json",
    ".py", ".js", ".ts", ".html", ".css",
    ".yaml", ".yml", ".xml", ".log",
}


def _doc_to_response(doc: dict) -> KnowledgeDocumentResponse:
    return KnowledgeDocumentResponse(
        id=str(doc["_id"]),
        name=doc["name"],
        filename=doc["filename"],
        description=doc.get("description", ""),
        fileSize=doc.get("fileSize", 0),
        fileType=doc.get("fileType", ""),
        tags=doc.get("tags", []),
        chunkCount=doc.get("chunkCount", 0),
        vectorized=doc.get("vectorized", False),
        uploadedAt=doc.get("uploadedAt"),
    )


def _doc_to_detail(doc: dict) -> KnowledgeDocumentDetailResponse:
    return KnowledgeDocumentDetailResponse(
        id=str(doc["_id"]),
        name=doc["name"],
        filename=doc["filename"],
        description=doc.get("description", ""),
        fileSize=doc.get("fileSize", 0),
        fileType=doc.get("fileType", ""),
        tags=doc.get("tags", []),
        chunkCount=doc.get("chunkCount", 0),
        vectorized=doc.get("vectorized", False),
        textPreview=(doc.get("textContent", ""))[:2000],
        uploadedAt=doc.get("uploadedAt"),
    )


class KnowledgeService:
    """Encapsulates all Knowledge Base business logic."""

    # ------------------------------------------------------------------
    # Validation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def validate_extension(filename: str) -> str:
        """Return the lowercase extension if allowed, else raise ValueError."""
        ext = os.path.splitext(filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(
                f"File type '{ext}' not supported. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )
        return ext

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @staticmethod
    async def list_documents(
        page: int = 1,
        page_size: int = 15,
    ) -> KnowledgeListResponse:
        db = get_db()
        total = await db.knowledge.count_documents({})
        skip = (page - 1) * page_size
        cursor = (
            db.knowledge.find()
            .sort("uploadedAt", -1)
            .skip(skip)
            .limit(page_size)
        )
        docs = await cursor.to_list(length=page_size)
        return KnowledgeListResponse(
            items=[_doc_to_response(d) for d in docs],
            total=total,
            page=page,
            pageSize=page_size,
        )

    @staticmethod
    async def get_document(doc_id: str) -> Optional[KnowledgeDocumentDetailResponse]:
        db = get_db()
        doc = await db.knowledge.find_one({"_id": ObjectId(doc_id)})
        if not doc:
            return None
        return _doc_to_detail(doc)

    @staticmethod
    async def upload_document(
        *,
        filename: str,
        content: bytes,
        name: str = "",
        description: str = "",
        tags: str = "",
    ) -> KnowledgeUploadResponse:
        """Save file to disk, extract text, store in DB, and embed in vector store."""
        db = get_db()
        ext = KnowledgeService.validate_extension(filename)
        file_size = len(content)

        # Persist file --------------------------------------------------
        file_id = str(uuid.uuid4())
        safe_filename = f"{file_id}{ext}"
        filepath = os.path.join(UPLOAD_DIR, safe_filename)
        with open(filepath, "wb") as f:
            f.write(content)

        # Extract text ---------------------------------------------------
        text_content = extract_text(content, filename or f"document{ext}")

        doc_name = name or os.path.splitext(filename or "")[0]
        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

        doc = {
            "name": doc_name,
            "filename": filename,
            "storedFilename": safe_filename,
            "filepath": filepath,
            "description": description,
            "fileSize": file_size,
            "fileType": ext,
            "tags": tag_list,
            "textContent": text_content[:50_000],
            "chunkCount": 0,
            "vectorized": False,
            "uploadedAt": datetime.now(timezone.utc),
        }

        result = await db.knowledge.insert_one(doc)
        doc_id = str(result.inserted_id)

        # Embed in vector store ------------------------------------------
        chunk_count = 0
        if text_content and vector_store.is_available():
            chunk_count = await vector_store.add_document(
                doc_id=doc_id,
                text=text_content,
                metadata={
                    "name": doc_name,
                    "filename": filename or "",
                    "fileType": ext,
                },
            )
            await db.knowledge.update_one(
                {"_id": result.inserted_id},
                {"$set": {"chunkCount": chunk_count, "vectorized": True}},
            )

        return KnowledgeUploadResponse(
            id=doc_id,
            name=doc_name,
            filename=filename,
            fileSize=file_size,
            chunkCount=chunk_count,
            vectorized=chunk_count > 0,
        )

    @staticmethod
    async def delete_document(doc_id: str) -> bool:
        """Remove document from disk, vector store, and database."""
        db = get_db()
        doc = await db.knowledge.find_one({"_id": ObjectId(doc_id)})
        if not doc:
            return False

        # Delete file from disk
        filepath = doc.get("filepath", "")
        if filepath and os.path.exists(filepath):
            os.remove(filepath)

        # Remove from vector store
        await vector_store.remove_document(doc_id)

        await db.knowledge.delete_one({"_id": ObjectId(doc_id)})
        return True

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    @staticmethod
    async def search(query: str, limit: int = 5) -> list[KnowledgeSearchResult]:
        """Semantic vector search with regex fallback."""
        if not query:
            return []

        # Try vector search first
        if vector_store.is_available():
            vector_results = await vector_store.search(query=query, limit=limit)
            if vector_results:
                results: list[KnowledgeSearchResult] = []
                seen_docs: set[str] = set()
                for vr in vector_results:
                    doc_id = vr["doc_id"]
                    if doc_id in seen_docs:
                        continue
                    seen_docs.add(doc_id)
                    results.append(
                        KnowledgeSearchResult(
                            id=doc_id,
                            name=vr["doc_name"],
                            snippet=f"...{vr['content'][:400]}...",
                            relevance=vr["similarity"],
                            searchType="vector",
                        )
                    )
                return results

        # Fallback: MongoDB regex search
        db = get_db()
        results = []
        async for doc in db.knowledge.find(
            {"textContent": {"$regex": query, "$options": "i"}}
        ).limit(limit):
            text = doc.get("textContent", "")
            idx = text.lower().find(query.lower())
            start = max(0, idx - 200)
            end = min(len(text), idx + len(query) + 200)
            snippet = text[start:end]
            results.append(
                KnowledgeSearchResult(
                    id=str(doc["_id"]),
                    name=doc["name"],
                    snippet=f"...{snippet}...",
                    relevance=1.0,
                    searchType="regex",
                )
            )
        return results

    # ------------------------------------------------------------------
    # Re-index
    # ------------------------------------------------------------------

    @staticmethod
    async def reindex_document(doc_id: str) -> Optional[KnowledgeReindexResponse]:
        """Re-extract text from the original file and re-embed in vector store."""
        db = get_db()
        doc = await db.knowledge.find_one({"_id": ObjectId(doc_id)})
        if not doc:
            return None

        filepath = doc.get("filepath", "")
        filename = doc.get("filename", "document.txt")
        text_content = doc.get("textContent", "")

        if filepath and os.path.exists(filepath):
            with open(filepath, "rb") as f:
                file_bytes = f.read()
            text_content = extract_text(file_bytes, filename)
            await db.knowledge.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {"textContent": text_content[:50_000]}},
            )

        if not text_content:
            raise ValueError("Could not extract text from document")

        chunk_count = 0
        if vector_store.is_available():
            await vector_store.remove_document(doc_id)
            chunk_count = await vector_store.add_document(
                doc_id=doc_id,
                text=text_content,
                metadata={
                    "name": doc["name"],
                    "filename": filename,
                    "fileType": doc.get("fileType", ""),
                },
            )
            await db.knowledge.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {"chunkCount": chunk_count, "vectorized": True}},
            )

        return KnowledgeReindexResponse(
            chunkCount=chunk_count,
            textPreview=text_content[:500],
        )

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    @staticmethod
    async def get_stats() -> KnowledgeStatsResponse:
        db = get_db()
        total_docs = await db.knowledge.count_documents({})
        vectorized = await db.knowledge.count_documents({"vectorized": True})

        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "totalSize": {"$sum": "$fileSize"},
                    "totalChunks": {"$sum": "$chunkCount"},
                }
            }
        ]
        agg = await db.knowledge.aggregate(pipeline).to_list(1)
        stats = agg[0] if agg else {"totalSize": 0, "totalChunks": 0}

        return KnowledgeStatsResponse(
            totalDocuments=total_docs,
            vectorizedDocuments=vectorized,
            totalSizeBytes=stats.get("totalSize", 0),
            totalChunks=stats.get("totalChunks", 0),
            vectorStoreAvailable=vector_store.is_available(),
        )
