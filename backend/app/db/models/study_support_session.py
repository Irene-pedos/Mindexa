from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlmodel import Field, Relationship, Column as SMColumn
from app.db.base import BaseModel
from typing import List, Optional

class StudySupportSession(BaseModel, table=True):
    __tablename__ = "study_support_sessions"

    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id"),
            nullable=False,
        )
    )
    conversation_id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(
            UUID(as_uuid=True),
            nullable=False,
            index=True,
        )
    )
    question: str = Field(sa_column=Column(Text, nullable=False))
    retrieved_chunk_ids: List[uuid.UUID] = Field(
        default_factory=list,
        sa_column=SMColumn(ARRAY(UUID(as_uuid=True)))
    )
    context_used: str = Field(sa_column=Column(Text, nullable=False))
    llm_response: str = Field(sa_column=Column(Text, nullable=False))
    source_citations: List[dict] = Field(
        default_factory=list,
        sa_column=SMColumn(JSONB)
    )
