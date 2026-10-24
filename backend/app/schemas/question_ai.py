"""
app/schemas/question_ai.py

Request/response models for the lecturer "improve / complete this question" and
"review my paper" AI helpers used while building an assessment.

The client sends a snapshot of the question as it is in the editor (not yet saved), and
gets back a *proposal* it can show as a before/after and accept or discard. Nothing here
writes to the database: AI output only becomes part of an assessment when the lecturer
accepts it (AGENTS.md human-review rule).
"""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

EnhanceAction = Literal[
    "improve_wording",
    "add_explanation",
    "add_distractors",
    "complete_missing",
    "add_sub_questions",
    "make_easier",
    "make_harder",
    "fix_ambiguity",
]


class SnapshotOption(BaseModel):
    text: str = Field(default="", max_length=2000)
    # Right-hand side of a matching pair / guidance for a case-study part
    explanation: str | None = Field(default=None, max_length=2000)
    is_correct: bool = False
    # Marks of a case-study part, as a string (the storage convention)
    match_key: str | None = Field(default=None, max_length=50)


class QuestionSnapshot(BaseModel):
    id: str | None = Field(default=None, max_length=100)
    type: str = Field(..., max_length=40)
    text: str = Field(default="", max_length=6000)
    marks: int | None = Field(default=None, ge=0, le=1000)
    options: list[SnapshotOption] = Field(default_factory=list, max_length=30)
    case_study_context: str | None = Field(default=None, max_length=8000)
    # Model answer / solution / grading guidance for open-ended questions
    explanation: str | None = Field(default=None, max_length=6000)
    difficulty: str | None = Field(default=None, max_length=20)
    section: str | None = Field(default=None, max_length=200)


class EnhanceQuestionRequest(BaseModel):
    question: QuestionSnapshot
    action: EnhanceAction
    instructions: str | None = Field(default=None, max_length=500, description="Optional extra guidance")
    subject: str | None = Field(default=None, max_length=200)
    topic: str | None = Field(default=None, max_length=200)
    workspace_id: uuid.UUID | None = Field(default=None, description="Teaching workspace, for the language policy")


class EnhanceQuestionResponse(BaseModel):
    question: QuestionSnapshot
    summary: str
    changes: list[str] = Field(default_factory=list)
    # What is still missing after the change; empty when the question is complete
    remaining_issues: list[str] = Field(default_factory=list)


class BlueprintSectionSummary(BaseModel):
    section: str = Field(..., max_length=200)
    expected_questions: int = Field(default=0, ge=0)
    expected_marks: int = Field(default=0, ge=0)
    topics: str | None = Field(default=None, max_length=500)
    difficulty: str | None = Field(default=None, max_length=20)


class ReviewPaperRequest(BaseModel):
    questions: list[QuestionSnapshot] = Field(..., min_length=1, max_length=80)
    blueprint: list[BlueprintSectionSummary] = Field(default_factory=list, max_length=30)
    assessment_type: str | None = Field(default=None, max_length=40)
    policy_total: int | None = Field(default=None, ge=0)
    subject: str | None = Field(default=None, max_length=200)
    workspace_id: uuid.UUID | None = None


class PaperFinding(BaseModel):
    severity: Literal["warning", "suggestion"] = "suggestion"
    code: str = Field(..., max_length=60)
    message: str = Field(..., max_length=600)
    # Position (1-based) in the submitted list, resolved to an id for the client
    question_id: str | None = None
    section: str | None = None


class ReviewPaperResponse(BaseModel):
    summary: str
    findings: list[PaperFinding] = Field(default_factory=list)
