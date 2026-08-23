"""
app/schemas/study_reader.py

Pydantic schemas for Study Reader API:
- Progress tracking
- Material annotations (highlights, notes, normalized coordinates)
- Key points & spaced review scheduling
- Revision sheet exports & skims
- Phase 3: Focus weakness engine, page-check quiz, and exam lens
"""

import uuid
from datetime import datetime
from typing import Any, List, Literal, Optional
from pydantic import BaseModel, Field


SourceKind = Literal["lecturer_material", "student_resource"]
AnnotationColor = Literal["key_idea", "definition", "example", "confused"]
KeyPointTag = Literal["definition", "formula", "process", "exam_likely", "other"]
KeyPointConfidence = Literal["got_it", "fuzzy", "lost"]


# ── Metadata ─────────────────────────────────────────────────────────────────

class ReaderMetadataResponse(BaseModel):
    id: uuid.UUID
    kind: SourceKind
    title: str
    extension: str
    mime_type: str
    page_count: Optional[int] = None
    processing_status: str
    workspace_id: Optional[uuid.UUID] = None
    course_code: Optional[str] = None
    course_title: Optional[str] = None


# ── Progress ─────────────────────────────────────────────────────────────────

class ReadingProgressUpdate(BaseModel):
    last_page: int = Field(ge=1, description="1-based last viewed page")
    last_scale: float = Field(default=100.0, ge=10.0, le=500.0, description="Zoom scale percentage")
    page_count_seen: int = Field(default=1, ge=1, description="Total unique pages viewed")


class ReadingProgressResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    source_kind: str
    source_id: uuid.UUID
    last_page: int
    last_scale: float
    page_count_seen: int
    updated_at: datetime


# ── Annotations ──────────────────────────────────────────────────────────────

class AnnotationRect(BaseModel):
    x: float = Field(..., description="Normalized 0..1 left offset")
    y: float = Field(..., description="Normalized 0..1 top offset")
    w: float = Field(..., description="Normalized 0..1 width")
    h: float = Field(..., description="Normalized 0..1 height")
    page: int = Field(..., ge=1, description="1-based page number")


class AnnotationCreate(BaseModel):
    page_number: int = Field(..., ge=1)
    color: AnnotationColor = Field(default="key_idea")
    selected_text: str = Field(..., min_length=1, max_length=10000)
    rects: List[AnnotationRect] = Field(default_factory=list)
    note_text: Optional[str] = Field(default=None, max_length=5000)


class AnnotationUpdate(BaseModel):
    color: Optional[AnnotationColor] = None
    note_text: Optional[str] = Field(default=None, max_length=5000)


class AnnotationResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    source_kind: str
    source_id: uuid.UUID
    page_number: int
    color: str
    selected_text: str
    rects: List[dict[str, Any]]
    note_text: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ── Key Points ───────────────────────────────────────────────────────────────

class KeyPointCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    quote: Optional[str] = Field(default=None, max_length=5000)
    page_number: int = Field(default=1, ge=1)
    tag: KeyPointTag = Field(default="other")
    confidence: KeyPointConfidence = Field(default="got_it")
    annotation_id: Optional[uuid.UUID] = None
    next_review_at: Optional[datetime] = None


class KeyPointUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    quote: Optional[str] = Field(default=None, max_length=5000)
    page_number: Optional[int] = Field(default=None, ge=1)
    tag: Optional[KeyPointTag] = None
    confidence: Optional[KeyPointConfidence] = None
    next_review_at: Optional[datetime] = None


class KeyPointResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    source_kind: str
    source_id: uuid.UUID
    title: str
    quote: Optional[str] = None
    page_number: int
    tag: str
    confidence: str
    annotation_id: Optional[uuid.UUID] = None
    next_review_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


# ── Export & Skim ────────────────────────────────────────────────────────────

class RevisionSheetExportResponse(BaseModel):
    source_id: uuid.UUID
    source_kind: str
    title: str
    key_points: List[KeyPointResponse]
    annotations: List[AnnotationResponse]
    markdown: str


class SkimBullet(BaseModel):
    bullet: str
    page_number: Optional[int] = None


class SkimResponse(BaseModel):
    title: str
    summary: str
    bullets: List[SkimBullet]


# ── Phase 3: Focus & Weakness Engine ─────────────────────────────────────────

class WeakQuestionContext(BaseModel):
    question_id: uuid.UUID
    assessment_id: uuid.UUID
    assessment_title: str
    score: Optional[float] = None
    max_score: float
    stem_preview: str
    feedback: Optional[str] = None
    similarity: float = 0.0


class PageHeatItem(BaseModel):
    page_number: int
    heat: float = Field(ge=0.0, le=1.0, description="Normalized weakness score 0..1")
    heat_level: Literal["high", "medium", "low", "none"]
    weak_question_count: int = 0
    weak_questions: List[WeakQuestionContext] = Field(default_factory=list)
    key_point_count: int = 0
    annotation_count: int = 0
    summary_reason: Optional[str] = None


class FocusNextRecommendation(BaseModel):
    start_page: int
    end_page: int
    title: str
    reason: str
    heat_level: Literal["high", "medium", "low"]
    question_id: Optional[uuid.UUID] = None
    assessment_title: Optional[str] = None


class FocusResponse(BaseModel):
    exam_mapping: bool
    source_kind: str
    source_id: uuid.UUID
    heatmap: List[PageHeatItem]
    focus_next: List[FocusNextRecommendation]
    spaced_reviews: List[KeyPointResponse]
    total_weak_points: int = 0


# ── Page-Check Quiz ──────────────────────────────────────────────────────────

class PageCheckQuestion(BaseModel):
    id: str
    question: str
    options: List[str]
    correct_option_index: int
    explanation: str


class PageCheckRequest(BaseModel):
    page_number: int = Field(ge=1)
    selected_text: Optional[str] = Field(default=None, max_length=4000)


class PageCheckResponse(BaseModel):
    page_number: int
    questions: List[PageCheckQuestion]


class PageCheckAnswerItem(BaseModel):
    question_id: str
    selected_option_index: int = Field(ge=0, le=3)
    selected_option_text: Optional[str] = None


class PageCheckSubmitRequest(BaseModel):
    page_number: int = Field(ge=1)
    answers: List[PageCheckAnswerItem]


class PageCheckFeedbackItem(BaseModel):
    question_id: str
    is_correct: bool
    selected_option_index: int
    correct_option_index: int
    explanation: str


class PageCheckSubmitResponse(BaseModel):
    page_number: int
    score: int
    max_score: int
    percentage: float
    passed: bool
    feedback: List[PageCheckFeedbackItem]
    created_key_point_id: Optional[uuid.UUID] = None


class ExamLensResponse(BaseModel):
    assessment_id: uuid.UUID
    assessment_title: str
    pages: List[PageHeatItem]
