import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, Text
from sqlmodel import Field, Relationship
from app.db.base import BaseModel
from app.db.enums import ResourceProcessingStatus, ResourceCategory
from typing import TYPE_CHECKING, List, Optional

if TYPE_CHECKING:
    from app.db.models.resource_chunk import ResourceChunk

class AcademicResource(BaseModel, table=True):
    __tablename__ = "academic_resources"

    title: str = Field(nullable=False, max_length=255)
    file_name: str = Field(nullable=False, max_length=255)
    file_path: str = Field(nullable=False, max_length=500)
    file_size: int = Field(nullable=False)
    mime_type: str = Field(nullable=False, max_length=100)
    
    resource_category: ResourceCategory = Field(
        default=ResourceCategory.GENERAL,
        nullable=False,
    )
    
    processing_status: ResourceProcessingStatus = Field(
        default=ResourceProcessingStatus.PENDING,
        nullable=False,
    )
    processing_error: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    chunk_count: int = Field(default=0)
    embedding_model: str = Field(default="jina-embeddings-v3", max_length=100)
    processed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    # Relationships
    chunks: List["ResourceChunk"] = Relationship(
        back_populates="resource",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
