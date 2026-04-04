"""
Route: /api/knowledge — Knowledge Base management.
Thin controller: validates HTTP input and delegates to KnowledgeService.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query

from app.models.knowledge import (
    KnowledgeDocumentDetailResponse,
    KnowledgeListResponse,
    KnowledgeReindexResponse,
    KnowledgeSearchResult,
    KnowledgeStatsResponse,
    KnowledgeUploadResponse,
)
from app.services.knowledge_service import KnowledgeService

router = APIRouter(prefix="/knowledge", tags=["Knowledge Base"])


@router.get("", response_model=KnowledgeListResponse)
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
):
    """List knowledge documents with pagination."""
    return await KnowledgeService.list_documents(page=page, page_size=page_size)


@router.post("/upload", response_model=KnowledgeUploadResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    name: str = Form(""),
    description: str = Form(""),
    tags: str = Form(""),
):
    """Upload a file to knowledge base. Automatically chunks and embeds for RAG."""
    try:
        content = await file.read()
        return await KnowledgeService.upload_document(
            filename=file.filename or "document",
            content=content,
            name=name,
            description=description,
            tags=tags,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/search/query", response_model=list[KnowledgeSearchResult])
async def search_knowledge(q: str = "", limit: int = 5):
    """Semantic search across knowledge documents (vector → regex fallback)."""
    return await KnowledgeService.search(query=q, limit=limit)


@router.get("/stats/overview", response_model=KnowledgeStatsResponse)
async def knowledge_stats():
    """Get knowledge base statistics."""
    return await KnowledgeService.get_stats()


@router.get("/{doc_id}", response_model=KnowledgeDocumentDetailResponse)
async def get_document(doc_id: str):
    """Get document details."""
    doc = await KnowledgeService.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document from knowledge base (file + DB + vector store)."""
    deleted = await KnowledgeService.delete_document(doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted"}


@router.post("/{doc_id}/reindex", response_model=KnowledgeReindexResponse)
async def reindex_document(doc_id: str):
    """Re-extract text from the original file, then re-embed in the vector store."""
    try:
        result = await KnowledgeService.reindex_document(doc_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")
    return result
