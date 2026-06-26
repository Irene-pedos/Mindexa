import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlmodel import Field, Relationship, Column as SMColumn
from app.db.base import BaseModel
from typing import TYPE_CHECKING, Optional, List

if TYPE_CHECKING:
    from app.db.models.academic_resource import AcademicResource

class ResourceChunk(BaseModel, table=True):
    __tablename__ = "resource_chunks"

    resource_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_resources.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    chunk_index: int = Field(nullable=False)
    content: str = Field(sa_column=Column(Text, nullable=False))
    token_count: int = Field(default=0)
    
    # pgvector column
    embedding: Optional[List[float]] = Field(
        default=None,
        sa_column=SMColumn(
            "embedding",
            __import__("pgvector.sqlalchemy", fromlist=["Vector"]).Vector(768),
            nullable=True,
        ),
    )
    
    metadata_json: dict = Field(default_factory=dict, sa_column=Column(JSONB))

    # Relationships
    resource: Optional["AcademicResource"] = Relationship(back_populates="chunks")
