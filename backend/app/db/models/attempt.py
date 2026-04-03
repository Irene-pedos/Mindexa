"""
app/db/models/attempt.py

Attempt, Submission, Grading, and Appeals models for Mindexa.

Tables defined here:
    assessment_attempt       — A student's single timed session within an assessment
    student_group            — A named group for group-work assessments
    student_group_member     — Junction: student ↔ group (with role)
    student_response         — A student's answer to a single question within an attempt
    submission_grade         — The final resolved grade record for a submission
    rubric_grade             — Per-criterion rubric scoring record (open-ended grading)
    result_appeal            — Student request for result re-evaluation

Import order safety:
    This file imports from:
        app.db.base    → AuditedBaseModel, BaseModel, AppendOnlyModel, utcnow
        app.db.enums   → AttemptStatus, SubmissionGradingMode, SubmissionStatus,
                         AppealStatus, QuestionType, GradingMode, AIGradeDecision
        app.db.mixins  → composite_index, unique_composite_index

    This file references via TYPE_CHECKING only:
        app.db.models.assessment → Assessment
        app.db.models.question   → Question, AssessmentQuestion
        app.db.models.academic   → ClassSection

Cascade rules:
    student_response      → CASCADE from assessment_attempt (if attempt is purged,
                            responses go with it — academic records are never purged
                            in production; cascade is for admin test data cleanup only)
    student_group_member  → CASCADE from student_group
    submission_grade      → RESTRICT on assessment_attempt (grade cannot exist without
                            the attempt it grades; but the attempt cannot be deleted
                            while a grade row exists — mutual RESTRICT)
    rubric_grade          → CASCADE from submission_grade

Immutability rules:
    student_response.submitted_content is append-only in intent.
    Autosaved intermediate states are stored as a separate autosave field;
    submitted_content is only written once at final submission.

    submission_grade rows are never deleted in production.
    New rows supersede old ones via is_current flag + superseded_at timestamp.
    This preserves the complete grading history for appeals and audits.

JSONB fields (all use Column(JSONB, ...) — not Field sa_column_kwargs strings):
    student_response.submitted_content
    student_response.autosave_content
    student_response.ai_grade_breakdown
    submission_grade.score_breakdown
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from app.db.base import AuditedBaseModel, BaseModel, utcnow
from app.db.enums import (AIGradeDecision, AppealStatus, AttemptStatus,
                          GradingMode, QuestionType, SubmissionGradingMode,
                          SubmissionStatus)
from app.db.mixins import composite_index, unique_composite_index
from sqlalchemy import UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, Relationship

if TYPE_CHECKING:
    from app.db.models.assessment import Assessment, AssessmentSection
    from app.db.models.integrity import (IntegrityEvent, IntegrityFlag,
                                         IntegrityWarning, SupervisionSession)
    from app.db.models.question import (AssessmentQuestion, Question,
                                        RubricCriterion, RubricCriterionLevel)


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT ATTEMPT
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentAttempt(BaseModel, table=True):
    """
    A student's single timed session within an assessment.

    One attempt row is created when a student passes the pre-flight
    checks and the backend issues them a session token to begin.

    Multiple attempts are allowed when assessment.max_attempts > 1.
    The attempt_number field tracks which attempt this is (1-based).

    Lifecycle states (AttemptStatus enum):
        PENDING          → Row created; student on the intro/password screen.
                          Not yet counted against max_attempts until ACTIVE.
        ACTIVE           → Student is answering questions; timer is running.
        SUBMITTED        → Student clicked Submit; responses are locked.
        AUTO_SUBMITTED   → Timer expired; backend forced submission.
        TIMED_OUT        → Student lost connection and never reconnected within
                          the reconnect grace window. Treated as submitted with
                          whatever answers were autosaved.
        ABANDONED        → Student navigated away during PENDING state.
                          Not counted against max_attempts.
        FLAGGED          → Attempt has active integrity flags under review.
                          Grading is paused until flags are resolved.

    score_percentage:
        Populated after grading. NULL while the attempt is ungraded.
        Stored as a float (0.0–100.0) for fast percentile calculations.

    ip_address / user_agent:
        Captured at attempt start for security logging.
        Used by the integrity monitoring system.

    reconnect_count:
        Incremented each time a student reconnects after a WebSocket drop.
        Excessive reconnects are flagged by the integrity system.

    fullscreen_exit_count:
        Cached count of fullscreen exit events for fast integrity risk scoring.
        The raw events live in integrity_event. This is a summary field.

    tab_switch_count:
        Same pattern as fullscreen_exit_count.

    is_practice:
        True for practice attempts that do not count toward grades or
        max_attempts. Populated when assessment.allows_practice = True.

    group_id:
        Only set when assessment.is_group_assessment = True.
        All members of the group share the same group_id.
        Individual attempt rows still exist for each student so that
        per-student integrity monitoring is preserved.
    """

    __tablename__ = "assessment_attempt"

    __table_args__ = (
        # Primary access pattern: all attempts for a student
        composite_index("assessment_attempt", "student_id", "status"),
        # All attempts for an assessment (supervisor view)
        composite_index("assessment_attempt", "assessment_id", "status"),
        # Combined: student + assessment (access control check)
        composite_index(
            "assessment_attempt",
            "student_id", "assessment_id", "status",
        ),
        # Grading queue queries
        composite_index(
            "assessment_attempt",
            "assessment_id", "grading_mode", "submission_status",
        ),
        # Risk score queries for live supervision
        composite_index(
            "assessment_attempt",
            "assessment_id", "integrity_risk_score",
        ),
        # Attempt number uniqueness per student per assessment
        unique_composite_index(
            "assessment_attempt",
            "student_id", "assessment_id", "attempt_number",
        ),
    )


    # ── Core references ───────────────────────────────────────────────────────

    student_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    assessment_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="assessment.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    group_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        foreign_key="student_group.id",
        index=True,
        sa_column_kwargs={"ondelete": "SET NULL"},
    )

    # ── Attempt identity ──────────────────────────────────────────────────────

    attempt_number: int = Field(default=1, nullable=False)
    is_practice: bool = Field(default=False, nullable=False, index=True)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    status: AttemptStatus = Field(
        default=AttemptStatus.PENDING,
        nullable=False,
        index=True,
    )
    submission_status: Optional[SubmissionStatus] = Field(
        default=None,
        nullable=True,
        index=True,
        # NULL until submitted; then PENDING_GRADING, GRADED, etc.
    )
    grading_mode: GradingMode = Field(
        nullable=False,
        # Copied from assessment.grading_mode at attempt creation.
        # Storing it here means grading logic does not need to
        # re-query the assessment during the grading workflow.
    )

    # ── Timing ────────────────────────────────────────────────────────────────

    started_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
        index=True,
        # Set when status transitions from PENDING → ACTIVE
    )
    submitted_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
        # Set when status transitions to SUBMITTED or AUTO_SUBMITTED
    )
    time_taken_seconds: Optional[int] = Field(
        default=None,
        nullable=True,
        # Computed at submission: submitted_at - started_at.
        # Stored explicitly to avoid recalculation in reporting queries.
    )
    server_deadline: Optional[datetime] = Field(
        default=None,
        nullable=True,
        index=True,
        # Absolute UTC deadline computed as: started_at + assessment.duration_minutes.
        # The backend auto-submit Celery task queries this field.
    )

    # ── Grading results ───────────────────────────────────────────────────────

    raw_score: Optional[float] = Field(default=None, nullable=True)
    score_percentage: Optional[float] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    is_passing: Optional[bool] = Field(default=None, nullable=True)

    # ── Integrity summary (cached from integrity_event) ───────────────────────

    integrity_risk_score: int = Field(
        default=0,
        nullable=False,
        index=True,
        # 0–100. Recalculated by the Integrity Analysis Agent after each event.
        # Cached here for fast supervisor dashboard queries without aggregating
        # the raw integrity_event table.
    )
    fullscreen_exit_count: int = Field(default=0, nullable=False)
    tab_switch_count: int = Field(default=0, nullable=False)
    copy_attempt_count: int = Field(default=0, nullable=False)
    warning_count: int = Field(default=0, nullable=False)
    reconnect_count: int = Field(default=0, nullable=False)
    is_flagged: bool = Field(default=False, nullable=False, index=True)

    # ── Security metadata ─────────────────────────────────────────────────────

    ip_address: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=45,
        # Max 45 chars supports both IPv4 (15) and IPv6 (39) + zone ID
    )
    user_agent: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    assessment: Optional["Assessment"] = Relationship(
        back_populates="attempts"
    )
    group: Optional["StudentGroup"] = Relationship(
        back_populates="attempts"
    )
    responses: List["StudentResponse"] = Relationship(
        back_populates="attempt",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "order_by": "StudentResponse.created_at",
        },
    )
    submission_grade: Optional["SubmissionGrade"] = Relationship(
        back_populates="attempt",
        sa_relationship_kwargs={"uselist": False},
    )

    # Add these relationships (after importing IntegrityEvent etc. via TYPE_CHECKING)
integrity_events: List["IntegrityEvent"] = Relationship(
    back_populates="attempt",
    sa_relationship_kwargs={"cascade": "all, delete-orphan"},
)
integrity_warnings: List["IntegrityWarning"] = Relationship(
    back_populates="attempt",
    sa_relationship_kwargs={"cascade": "all, delete-orphan"},
)
integrity_flags: List["IntegrityFlag"] = Relationship(
    back_populates="attempt",
)


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT GROUP
# ─────────────────────────────────────────────────────────────────────────────

class StudentGroup(BaseModel, table=True):
    """
    A named group for group-work assessments.

    Created either by a lecturer assigning students to groups,
    or by students self-enrolling into a group (if allowed by assessment settings).

    One group is tied to one assessment. Groups do not persist across assessments.

    max_members:
        Optional cap. The service layer blocks additions when reached.

    is_locked:
        True after the lecturer locks group membership before the assessment
        window opens. Once locked, students cannot change groups and lecturers
        cannot reassign members without unlocking first.
    """

    __tablename__ = "student_group"

    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "name",
            name="uq_student_group_assessment_name",
        ),
        composite_index("student_group", "assessment_id", "is_locked"),
    )

    assessment_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="assessment.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    name: str = Field(nullable=False, max_length=100)
    max_members: Optional[int] = Field(default=None, nullable=True)
    is_locked: bool = Field(default=False, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────

    members: List["StudentGroupMember"] = Relationship(
        back_populates="group",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    attempts: List["AssessmentAttempt"] = Relationship(
        back_populates="group"
    )


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT GROUP MEMBER (junction)
# ─────────────────────────────────────────────────────────────────────────────

class StudentGroupMember(BaseModel, table=True):
    """
    Junction table: Student ↔ StudentGroup.

    group_role:
        A free-text role label assigned by the lecturer or group leader.
        Example: "Lead Developer", "Researcher", "Presenter".
        Optional — only relevant for group work assessments with defined roles.

    is_leader:
        Flags the group leader for assessments where one student is responsible
        for submitting on behalf of the group. Exactly one leader per group
        is enforced at the service layer.

    A student may only be in one group per assessment. This is enforced via
    the unique constraint on (student_id, group_id). The service layer also
    checks that a student is not in another group for the same assessment_id.
    """

    __tablename__ = "student_group_member"

    __table_args__ = (
        UniqueConstraint(
            "student_id", "group_id",
            name="uq_student_group_member_student_group",
        ),
        composite_index("student_group_member", "group_id"),
        composite_index("student_group_member", "student_id"),
    )

    group_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="student_group.id",
        index=True,
        sa_column_kwargs={"ondelete": "CASCADE"},
    )
    student_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    group_role: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=100,
    )
    is_leader: bool = Field(default=False, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────

    group: Optional["StudentGroup"] = Relationship(back_populates="members")


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT RESPONSE
# ─────────────────────────────────────────────────────────────────────────────

class StudentResponse(BaseModel, table=True):
    """
    A student's answer to a single question within an attempt.

    One row per (attempt, question). Created when the student first
    interacts with a question. Updated as the student types (autosave).
    Locked when the attempt is submitted.

    submitted_content (JSONB):
        The final, locked answer at submission time. Structure varies by
        question type:

        MCQ / TRUE_FALSE:
            {"selected_option_ids": ["<uuid>", ...]}

        SHORT_ANSWER / ESSAY / COMPUTATIONAL / CASE_STUDY:
            {"text": "<student's written answer>"}

        MATCHING:
            {"matches": [{"left_id": "<option_uuid>", "right_id": "<option_uuid>"}, ...]}

        FILL_BLANK:
            {"blanks": [{"blank_index": 0, "answer": "Paris"}, ...]}

        ORDERING:
            {"ordered_option_ids": ["<uuid1>", "<uuid2>", "<uuid3>", ...]}

        NULL if the student never answered this question.

    autosave_content (JSONB):
        Intermediate state saved during active answering.
        Same structure as submitted_content.
        Overwritten on each autosave. Discarded at submission
        (submitted_content is the canonical record).

    is_submitted:
        False → student is still working on this response.
        True  → attempt was submitted; this response is locked.
        Once True, no further updates to submitted_content are permitted.

    time_spent_seconds:
        Time the student had this question focused/visible, computed from
        frontend timing signals. NULL if the assessment did not track per-question
        timing. Used for learning analytics only.

    Auto-grading fields (populated by the grading engine):
        auto_grade_score:
            For auto-gradable question types (MCQ, T/F, MATCHING, ORDERING,
            FILL_BLANK), the score awarded. NULL for open-ended types.
        auto_grade_is_correct:
            True/False for binary-correct question types (MCQ, T/F).
            NULL for partial-credit or open-ended types.
        ai_grade_score:
            For AI-assisted open-ended grading, the score suggested by the AI.
            Always NULL until the AI grading agent processes this response.
            NEVER used as final grade without lecturer confirmation.
        ai_grade_confidence:
            AI confidence (0.0–1.0) in the suggested score.
        ai_grade_rationale:
            AI's explanation of why it assigned the suggested score.
            Shown to the lecturer in the grading review interface.
        ai_grade_breakdown (JSONB):
            Per-criterion breakdown for rubric-based AI grading:
            [{"criterion_id": "<uuid>", "suggested_marks": 6, "rationale": "..."}]
        ai_grade_decision:
            PENDING       → AI has not processed this response yet.
            SUGGESTED     → AI has produced a suggestion; awaiting lecturer review.
            ACCEPTED      → Lecturer accepted the AI suggestion.
            MODIFIED      → Lecturer modified the AI suggestion before accepting.
            REJECTED      → Lecturer rejected the AI suggestion and graded manually.
            NOT_APPLICABLE → Auto-graded question type; AI not involved.
    """

    __tablename__ = "student_response"

    __table_args__ = (
        UniqueConstraint(
            "attempt_id", "question_id",
            name="uq_student_response_attempt_question",
        ),
        # Grading queue: all ungraded responses for an assessment
        composite_index(
            "student_response",
            "question_id", "ai_grade_decision", "is_submitted",
        ),
        # Attempt view: all responses for an attempt in order
        composite_index(
            "student_response",
            "attempt_id", "is_submitted",
        ),
        # AI processing queue
        composite_index(
            "student_response",
            "ai_grade_decision", "is_submitted",
        ),
    )

    # ── Core references ───────────────────────────────────────────────────────

    attempt_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="assessment_attempt.id",
        index=True,
        sa_column_kwargs={"ondelete": "CASCADE"},
    )
    question_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="question.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    assessment_question_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        foreign_key="assessment_question.id",
        index=True,
        sa_column_kwargs={"ondelete": "SET NULL"},
        # Denormalised for direct access to per-assessment question config
        # (marks_override, order_index) without an extra JOIN.
    )

    # ── Answer content ────────────────────────────────────────────────────────

    submitted_content: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    autosave_content: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    is_submitted: bool = Field(default=False, nullable=False, index=True)

    # ── Timing analytics ──────────────────────────────────────────────────────

    time_spent_seconds: Optional[int] = Field(default=None, nullable=True)

    # ── Auto-grading results ──────────────────────────────────────────────────

    auto_grade_score: Optional[float] = Field(default=None, nullable=True)
    auto_grade_is_correct: Optional[bool] = Field(default=None, nullable=True)

    # ── AI grading (open-ended) ───────────────────────────────────────────────

    ai_grade_score: Optional[float] = Field(default=None, nullable=True)
    ai_grade_confidence: Optional[float] = Field(default=None, nullable=True)
    ai_grade_rationale: Optional[str] = Field(default=None, nullable=True)
    ai_grade_breakdown: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    ai_grade_decision: AIGradeDecision = Field(
        default=AIGradeDecision.NOT_APPLICABLE,
        nullable=False,
        index=True,
    )

    # ── Plain UUID reference to the AI action log entry ───────────────────────
    ai_action_log_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    attempt: Optional["AssessmentAttempt"] = Relationship(
        back_populates="responses"
    )
    question: Optional["Question"] = Relationship(
        back_populates="responses"
    )
    rubric_grades: List["RubricGrade"] = Relationship(
        back_populates="student_response",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# SUBMISSION GRADE
# ─────────────────────────────────────────────────────────────────────────────

class SubmissionGrade(AuditedBaseModel, table=True):
    """
    The final resolved grade record for a single attempt.

    Inherits AuditedBaseModel because:
        - created_by_id → who issued the grade (lecturer UUID or system UUID
          for auto-graded attempts)
        - updated_by_id → who last modified it (e.g. after an appeal)
        Academic integrity requires a permanent, attributable record of who
        assigned and who modified every grade.

    Immutability design:
        SubmissionGrade rows are NEVER deleted.
        When a grade is revised (e.g. after appeal):
            1. The current row has is_current set to False and superseded_at stamped.
            2. A new row is inserted as the current grade.
        This gives a complete, auditable grading history for every attempt.
        Queries for current grades always filter: WHERE is_current = TRUE.

    grading_mode (SubmissionGradingMode):
        AUTO              → All questions were auto-graded by the system.
        AI_ASSISTED       → AI suggested grades; lecturer confirmed.
        MANUAL            → Lecturer graded without AI assistance.
        HYBRID            → Mix of auto-graded and manually graded questions.

    submission_status (SubmissionStatus):
        PENDING_GRADING   → Submitted but no grading has started.
        AUTO_GRADED       → System has auto-graded all eligible questions;
                            may still need lecturer review for open-ended parts.
        AI_SUGGESTED      → AI has suggested grades for open-ended responses;
                            awaiting lecturer review.
        LECTURER_REVIEWED → Lecturer has confirmed or modified all grades.
        FINAL             → Grade is released and locked. Cannot be changed
                            without creating a new revision row.
        UNDER_REVIEW      → An appeal is in progress; grade is locked from
                            modification until the appeal is resolved.

    score_breakdown (JSONB):
        Summary of per-section and per-question-type scoring:
        {
          "by_section": [
            {"section_id": "<uuid>", "title": "Section A", "score": 18, "max": 20}
          ],
          "by_type": [
            {"question_type": "mcq", "score": 40, "max": 40},
            {"question_type": "essay", "score": 28, "max": 60}
          ]
        }
        Built by the grading service. Stored for fast result display without
        re-aggregating all student_response rows.

    final_marks / percentage / grade_letter:
        Populated when submission_status = FINAL.
        grade_letter is computed by the grading service using the assessment's
        grading scale configuration (future feature — stored as Optional for now).

    feedback:
        Overall lecturer comment on the submission. Shown to the student
        after result release. Individual question-level feedback lives in
        student_response.ai_grade_rationale and rubric_grade.feedback.

    released_at:
        Timestamp when this grade became visible to the student.
        NULL until the assessment's result_release_mode policy triggers release.
    """

    __tablename__ = "submission_grade"

    __table_args__ = (
        # Current grade lookup
        composite_index(
            "submission_grade",
            "attempt_id", "is_current",
        ),
        # Grading queue by assessment
        composite_index(
            "submission_grade",
            "assessment_id", "submission_status", "is_current",
        ),
        # Release queue
        composite_index(
            "submission_grade",
            "assessment_id", "released_at", "is_current",
        ),
        # Student result view
        composite_index(
            "submission_grade",
            "student_id", "submission_status", "is_current",
        ),
    )

    # ── Core references ───────────────────────────────────────────────────────

    attempt_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="assessment_attempt.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    # Denormalised for fast query access without joining through attempt
    assessment_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="assessment.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    student_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )

    # ── Grade state ───────────────────────────────────────────────────────────

    submission_status: SubmissionStatus = Field(
        default=SubmissionStatus.PENDING_GRADING,
        nullable=False,
        index=True,
    )
    grading_mode: SubmissionGradingMode = Field(
        nullable=False,
        index=True,
    )

    # ── Score ─────────────────────────────────────────────────────────────────

    raw_score: Optional[float] = Field(default=None, nullable=True)
    final_marks: Optional[float] = Field(default=None, nullable=True)
    percentage: Optional[float] = Field(default=None, nullable=True)
    grade_letter: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=5,
    )
    is_passing: Optional[bool] = Field(default=None, nullable=True)
    score_breakdown: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )

    # ── Feedback ──────────────────────────────────────────────────────────────

    feedback: Optional[str] = Field(default=None, nullable=True)

    # ── Result release ────────────────────────────────────────────────────────

    released_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
        index=True,
    )

    # ── Revision tracking (immutability pattern) ──────────────────────────────

    is_current: bool = Field(
        default=True,
        nullable=False,
        index=True,
    )
    superseded_at: Optional[datetime] = Field(default=None, nullable=True)
    superseded_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        # Self-referential UUID pointing to the newer SubmissionGrade row.
        # Plain UUID to avoid circular FK at DB level.
    )
    revision_reason: Optional[str] = Field(
        default=None,
        nullable=True,
        # Mandatory when is_current transitions from True → False.
        # Enforced at service layer.
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    attempt: Optional["AssessmentAttempt"] = Relationship(
        back_populates="submission_grade"
    )
    rubric_grades: List["RubricGrade"] = Relationship(
        back_populates="submission_grade",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    appeals: List["ResultAppeal"] = Relationship(
        back_populates="submission_grade"
    )


# ─────────────────────────────────────────────────────────────────────────────
# RUBRIC GRADE
# ─────────────────────────────────────────────────────────────────────────────

class RubricGrade(BaseModel, table=True):
    """
    Per-criterion rubric scoring record for open-ended grading.

    One row per (submission_grade, rubric_criterion). Created during
    the manual or AI-assisted grading workflow for essay, case study,
    and other rubric-graded question types.

    The total submission score for rubric-graded responses is the SUM of
    all RubricGrade.marks_awarded values linked to that submission.

    selected_level_id:
        The RubricCriterionLevel the lecturer selected (or AI suggested).
        The marks_awarded value is taken from this level.
        NULL if the lecturer entered a custom marks value without selecting
        a named level.

    marks_awarded:
        Must be within 0 and rubric_criterion.max_marks.
        Enforced at service layer.

    ai_suggested_level_id / ai_suggested_marks:
        The AI's suggestion before lecturer review.
        Preserved even after the lecturer overrides the AI suggestion,
        for traceability and model improvement tracking.

    feedback:
        Per-criterion written comment from the lecturer or AI.
        Shown to the student alongside the marks for this criterion.
    """

    __tablename__ = "rubric_grade"

    __table_args__ = (
        UniqueConstraint(
            "submission_grade_id", "criterion_id",
            name="uq_rubric_grade_submission_grade_criterion",
        ),
        composite_index("rubric_grade", "submission_grade_id"),
        composite_index("rubric_grade", "criterion_id"),
        composite_index("rubric_grade", "student_response_id"),
    )

    submission_grade_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="submission_grade.id",
        index=True,
        sa_column_kwargs={"ondelete": "CASCADE"},
    )
    student_response_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        foreign_key="student_response.id",
        index=True,
        sa_column_kwargs={"ondelete": "SET NULL"},
        # Links this rubric grade to the specific question response being graded.
        # NULL for assessment-level rubric grading (entire submission graded as one).
    )
    criterion_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="rubric_criterion.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )

    # ── Selected level ────────────────────────────────────────────────────────

    selected_level_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        foreign_key="rubric_criterion_level.id",
        index=True,
        sa_column_kwargs={"ondelete": "SET NULL"},
    )
    marks_awarded: float = Field(nullable=False)
    feedback: Optional[str] = Field(default=None, nullable=True)

    # ── AI suggestion (preserved for traceability) ────────────────────────────

    ai_suggested_level_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        foreign_key="rubric_criterion_level.id",
        sa_column_kwargs={"ondelete": "SET NULL"},
    )
    ai_suggested_marks: Optional[float] = Field(default=None, nullable=True)
    ai_suggestion_rationale: Optional[str] = Field(default=None, nullable=True)

    # Plain UUID reference to the AI action log
    ai_action_log_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    submission_grade: Optional["SubmissionGrade"] = Relationship(
        back_populates="rubric_grades"
    )
    student_response: Optional["StudentResponse"] = Relationship(
        back_populates="rubric_grades"
    )


# ─────────────────────────────────────────────────────────────────────────────
# RESULT APPEAL
# ─────────────────────────────────────────────────────────────────────────────

class ResultAppeal(BaseModel, table=True):
    """
    Student request for re-evaluation of a released grade.

    An appeal can only be raised when:
        1. submission_grade.submission_status = FINAL
        2. submission_grade.released_at is not NULL
        3. The appeal window has not closed (assessment.appeal_deadline, future field)
        4. The student has not already raised an appeal for this submission_grade

    Appeal lifecycle (AppealStatus enum):
        SUBMITTED     → Student raised the appeal.
        UNDER_REVIEW  → A lecturer/admin has opened it and is reviewing.
        RESOLVED      → Decision made — grade upheld, revised, or escalated.
        CLOSED        → Closed without a decision (e.g. outside appeal window).
        ESCALATED     → Referred to department/institution level (future).

    student_statement:
        Required at appeal creation. The student's explanation of why
        they believe the grade should be reviewed.

    reviewer_id:
        The lecturer or admin assigned to review the appeal.
        Assigned by the grading lecturer or an admin.

    reviewer_decision:
        The outcome of the review. Only populated when status = RESOLVED.

    grade_changed:
        True if the review resulted in a grade change.
        If True, a new SubmissionGrade row is created (the immutable revision
        pattern) and submission_grade.superseded_at is stamped.

    One appeal per (student, submission_grade). A student cannot raise
    multiple appeals for the same grade. Enforced by unique constraint.
    """

    __tablename__ = "result_appeal"

    __table_args__ = (
        UniqueConstraint(
            "student_id", "submission_grade_id",
            name="uq_result_appeal_student_submission_grade",
        ),
        composite_index("result_appeal", "submission_grade_id", "status"),
        composite_index("result_appeal", "reviewer_id", "status"),
        composite_index("result_appeal", "student_id", "status"),
        composite_index("result_appeal", "assessment_id", "status"),
    )

    # ── Core references ───────────────────────────────────────────────────────

    student_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    submission_grade_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="submission_grade.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    # Denormalised for fast access in the lecturer review queue
    assessment_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="assessment.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )

    # ── Appeal content ────────────────────────────────────────────────────────

    student_statement: str = Field(nullable=False)
    supporting_evidence: Optional[str] = Field(
        default=None,
        nullable=True,
        # Free text or comma-separated resource IDs pointing to uploaded files.
        # Future: replace with a junction table to student_resource.
    )

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    status: AppealStatus = Field(
        default=AppealStatus.SUBMITTED,
        nullable=False,
        index=True,
    )
    submitted_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        index=True,
    )

    # ── Reviewer ──────────────────────────────────────────────────────────────

    reviewer_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "SET NULL"},
    )
    review_started_at: Optional[datetime] = Field(default=None, nullable=True)
    review_completed_at: Optional[datetime] = Field(default=None, nullable=True)
    reviewer_decision: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=2000,
    )

    # ── Outcome ───────────────────────────────────────────────────────────────

    grade_changed: Optional[bool] = Field(default=None, nullable=True)
    new_submission_grade_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        # Plain UUID pointing to the new SubmissionGrade row created if
        # grade_changed = True. Not a declared FK — circular reference
        # within submission_grade → result_appeal → submission_grade.
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    submission_grade: Optional["SubmissionGrade"] = Relationship(
        back_populates="appeals"
    )
