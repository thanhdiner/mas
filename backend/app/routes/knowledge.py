"""
Route: /api/knowledge — Knowledge Base management.
Stores uploaded documents for RAG context.
Files stored to disk, metadata in MongoDB, embeddings in ChromaDB.
"""

import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query

from app.database import get_db
from app.config import get_settings
from app.services import vector_store
from app.services.text_extractor import extract_text

router = APIRouter(prefix="/knowledge", tags=["Knowledge Base"])
settings = get_settings()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "knowledge")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("")
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
):
    """List knowledge documents with pagination."""
    db = get_db()
    total = await db.knowledge.count_documents({})
    skip = (page - 1) * page_size
    docs = []
    async for doc in db.knowledge.find().sort("uploadedAt", -1).skip(skip).limit(page_size):
        docs.append({
            "id": str(doc["_id"]),
            "name": doc["name"],
            "filename": doc["filename"],
            "description": doc.get("description", ""),
            "fileSize": doc.get("fileSize", 0),
            "fileType": doc.get("fileType", ""),
            "tags": doc.get("tags", []),
            "chunkCount": doc.get("chunkCount", 0),
            "vectorized": doc.get("vectorized", False),
            "uploadedAt": doc["uploadedAt"].isoformat() if doc.get("uploadedAt") else None,
        })
    return {
        "items": docs,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    name: str = Form(""),
    description: str = Form(""),
    tags: str = Form(""),
):
    """Upload a file to knowledge base. Automatically chunks and embeds for RAG."""
    db = get_db()
    
    # Validate file type
    allowed_types = [".txt", ".md", ".pdf", ".csv", ".json", ".py", ".js", ".ts", ".html", ".css", ".yaml", ".yml", ".xml", ".log"]
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed_types:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not supported. Allowed: {', '.join(allowed_types)}")
    
    # Read file contents
    content = await file.read()
    file_size = len(content)
    
    # Save file to disk
    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, safe_filename)
    
    with open(filepath, "wb") as f:
        f.write(content)
    
    # Extract text content for search (handles PDF, CSV, JSON, plain text)
    text_content = extract_text(content, file.filename or f"document{ext}")
    
    doc_name = name or os.path.splitext(file.filename or "")[0]
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    
    doc = {
        "name": doc_name,
        "filename": file.filename,
        "storedFilename": safe_filename,
        "filepath": filepath,
        "description": description,
        "fileSize": file_size,
        "fileType": ext,
        "tags": tag_list,
        "textContent": text_content[:50000],  # Store first 50k chars for fallback search
        "chunkCount": 0,
        "vectorized": False,
        "uploadedAt": datetime.now(timezone.utc),
    }
    
    result = await db.knowledge.insert_one(doc)
    doc_id = str(result.inserted_id)

    # Embed document in vector store (ChromaDB)
    chunk_count = 0
    if text_content and vector_store.is_available():
        chunk_count = await vector_store.add_document(
            doc_id=doc_id,
            text=text_content,
            metadata={
                "name": doc_name,
                "filename": file.filename or "",
                "fileType": ext,
            },
        )
        await db.knowledge.update_one(
            {"_id": result.inserted_id},
            {"$set": {"chunkCount": chunk_count, "vectorized": True}},
        )
    
    return {
        "id": doc_id,
        "name": doc_name,
        "filename": file.filename,
        "fileSize": file_size,
        "chunkCount": chunk_count,
        "vectorized": chunk_count > 0,
        "message": "Document uploaded successfully",
    }


@router.get("/{doc_id}")
async def get_document(doc_id: str):
    """Get document details."""
    from bson import ObjectId
    db = get_db()
    doc = await db.knowledge.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "filename": doc["filename"],
        "description": doc.get("description", ""),
        "fileSize": doc.get("fileSize", 0),
        "fileType": doc.get("fileType", ""),
        "tags": doc.get("tags", []),
        "chunkCount": doc.get("chunkCount", 0),
        "vectorized": doc.get("vectorized", False),
        "textPreview": (doc.get("textContent", ""))[:2000],
        "uploadedAt": doc["uploadedAt"].isoformat() if doc.get("uploadedAt") else None,
    }


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document from knowledge base (file + DB + vector store)."""
    from bson import ObjectId
    db = get_db()
    doc = await db.knowledge.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete file from disk
    filepath = doc.get("filepath", "")
    if filepath and os.path.exists(filepath):
        os.remove(filepath)

    # Remove from vector store
    await vector_store.remove_document(doc_id)
    
    await db.knowledge.delete_one({"_id": ObjectId(doc_id)})
    return {"message": "Document deleted"}


@router.get("/search/query")
async def search_knowledge(q: str = "", limit: int = 5):
    """
    Semantic search across knowledge documents.
    Uses ChromaDB vector search if available, falls back to regex.
    """
    db = get_db()
    if not q:
        return []

    # Try vector search first
    if vector_store.is_available():
        vector_results = await vector_store.search(query=q, limit=limit)
        if vector_results:
            results = []
            seen_docs = set()
            for vr in vector_results:
                doc_id = vr["doc_id"]
                if doc_id in seen_docs:
                    continue
                seen_docs.add(doc_id)
                results.append({
                    "id": doc_id,
                    "name": vr["doc_name"],
                    "snippet": f"...{vr['content'][:400]}...",
                    "relevance": vr["similarity"],
                    "searchType": "vector",
                })
            return results

    # Fallback: MongoDB regex search
    results = []
    async for doc in db.knowledge.find(
        {"textContent": {"$regex": q, "$options": "i"}}
    ).limit(limit):
        text = doc.get("textContent", "")
        idx = text.lower().find(q.lower())
        start = max(0, idx - 200)
        end = min(len(text), idx + len(q) + 200)
        snippet = text[start:end]
        
        results.append({
            "id": str(doc["_id"]),
            "name": doc["name"],
            "snippet": f"...{snippet}...",
            "relevance": 1.0,
            "searchType": "regex",
        })
    
    return results


@router.post("/{doc_id}/reindex")
async def reindex_document(doc_id: str):
    """Re-extract text from the original file, then re-embed in the vector store."""
    from bson import ObjectId
    db = get_db()
    doc = await db.knowledge.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Re-extract text from the original file on disk
    filepath = doc.get("filepath", "")
    filename = doc.get("filename", "document.txt")
    text_content = doc.get("textContent", "")

    if filepath and os.path.exists(filepath):
        with open(filepath, "rb") as f:
            file_bytes = f.read()
        text_content = extract_text(file_bytes, filename)

        # Update text content in database
        await db.knowledge.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"textContent": text_content[:50000]}},
        )

    if not text_content:
        raise HTTPException(status_code=400, detail="Could not extract text from document")

    # Re-embed in vector store
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

    return {
        "message": "Document re-extracted and re-indexed",
        "chunkCount": chunk_count,
        "textPreview": text_content[:500],
    }


@router.get("/stats/overview")
async def knowledge_stats():
    """Get knowledge base statistics."""
    db = get_db()
    total_docs = await db.knowledge.count_documents({})
    vectorized = await db.knowledge.count_documents({"vectorized": True})
    
    pipeline = [
        {"$group": {
            "_id": None,
            "totalSize": {"$sum": "$fileSize"},
            "totalChunks": {"$sum": "$chunkCount"},
        }}
    ]
    agg = await db.knowledge.aggregate(pipeline).to_list(1)
    stats = agg[0] if agg else {"totalSize": 0, "totalChunks": 0}

    return {
        "totalDocuments": total_docs,
        "vectorizedDocuments": vectorized,
        "totalSizeBytes": stats.get("totalSize", 0),
        "totalChunks": stats.get("totalChunks", 0),
        "vectorStoreAvailable": vector_store.is_available(),
    }
