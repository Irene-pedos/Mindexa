from __future__ import annotations
import uuid
from pydantic import BaseModel, Field, computed_field
from typing import List, Optional

class SourceCitation(BaseModel):
    resource_name: str
    resource_id: uuid.UUID
    page_number: Optional[int] = None
    chunk_index: int
    excerpt: str  # first 120 chars of the chunk for display

    @computed_field
    @property
    def title(self) -> str:
        return self.resource_name

    @computed_field
    @property
    def snippet(self) -> str:
        return self.excerpt

class RAGRetrievalResult(BaseModel):
    context_string: str
    citations: List[SourceCitation]
    chunk_ids_used: List[uuid.UUID]
    retrieval_score: float  # average cosine similarity of returned chunks
    fallback_used: bool  # True if no relevant chunks found (low score threshold)
