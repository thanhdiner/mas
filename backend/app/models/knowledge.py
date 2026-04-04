"""Pydantic models for the Knowledge Base module."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class KnowledgeDocumentResponse(BaseModel):
    id: str
    name: str
    filename: str
    description: str = ""
    fileSize: int = 0
    fileType: str = ""
    tags: list[str] = Field(default_factory=list)
    chunkCount: int = 0
    vectorized: bool = False
    uploadedAt: Optional[datetime] = None


class KnowledgeDocumentDetailResponse(KnowledgeDocumentResponse):
    textPreview: str = ""


class KnowledgeUploadResponse(BaseModel):
    id: str
    name: str
    filename: str
    fileSize: int
    chunkCount: int
    vectorized: bool
    message: str = "Document uploaded successfully"


class KnowledgeSearchResult(BaseModel):
    id: str
    name: str
    snippet: str
    relevance: float
    searchType: str


class KnowledgeReindexResponse(BaseModel):
    message: str = "Document re-extracted and re-indexed"
    chunkCount: int = 0
    textPreview: str = ""


class KnowledgeStatsResponse(BaseModel):
    totalDocuments: int = 0
    vectorizedDocuments: int = 0
    totalSizeBytes: int = 0
    totalChunks: int = 0
    vectorStoreAvailable: bool = False


class KnowledgeListResponse(BaseModel):
    items: list[KnowledgeDocumentResponse]
    total: int
    page: int
    pageSize: int
