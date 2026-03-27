"""
Route: /api/knowledge — Knowledge Base management.
Stores uploaded documents for RAG context. Files stored to disk, metadata in MongoDB.
"""

import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.config import get_settings

router = APIRouter(prefix="/knowledge", tags=["Knowledge Base"])
settings = get_settings()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "knowledge")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("")
async def list_documents():
    """List all knowledge documents."""
    db = get_db()
    docs = []
    async for doc in db.knowledge.find().sort("uploadedAt", -1):
        docs.append({
            "id": str(doc["_id"]),
            "name": doc["name"],
            "filename": doc["filename"],
            "description": doc.get("description", ""),
            "fileSize": doc.get("fileSize", 0),
            "fileType": doc.get("fileType", ""),
            "tags": doc.get("tags", []),
            "uploadedAt": doc["uploadedAt"].isoformat() if doc.get("uploadedAt") else None,
        })
    return docs


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    name: str = Form(""),
    description: str = Form(""),
    tags: str = Form(""),
):
    """Upload a file to knowledge base."""
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
    
    # Extract text content for search
    text_content = ""
    try:
        text_content = content.decode("utf-8", errors="ignore")
    except Exception:
        text_content = ""
    
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
        "textContent": text_content[:50000],  # Store first 50k chars for search
        "uploadedAt": datetime.now(timezone.utc),
    }
    
    result = await db.knowledge.insert_one(doc)
    
    return {
        "id": str(result.inserted_id),
        "name": doc_name,
        "filename": file.filename,
        "fileSize": file_size,
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
        "textPreview": (doc.get("textContent", ""))[:2000],
        "uploadedAt": doc["uploadedAt"].isoformat() if doc.get("uploadedAt") else None,
    }


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document from knowledge base."""
    from bson import ObjectId
    db = get_db()
    doc = await db.knowledge.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete file from disk
    filepath = doc.get("filepath", "")
    if filepath and os.path.exists(filepath):
        os.remove(filepath)
    
    await db.knowledge.delete_one({"_id": ObjectId(doc_id)})
    return {"message": "Document deleted"}


@router.get("/search/query")
async def search_knowledge(q: str = "", limit: int = 5):
    """Simple text search across knowledge documents (for Agent RAG)."""
    db = get_db()
    if not q:
        return []
    
    # Use MongoDB text search or simple regex
    results = []
    async for doc in db.knowledge.find(
        {"textContent": {"$regex": q, "$options": "i"}}
    ).limit(limit):
        text = doc.get("textContent", "")
        # Find relevant snippet
        idx = text.lower().find(q.lower())
        start = max(0, idx - 200)
        end = min(len(text), idx + len(q) + 200)
        snippet = text[start:end]
        
        results.append({
            "id": str(doc["_id"]),
            "name": doc["name"],
            "snippet": f"...{snippet}...",
            "relevance": 1.0,
        })
    
    return results
