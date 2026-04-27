"""
app/db/models/assessment.py

Assessment management models for Mindexa.

Tables defined here:
    assessment                   — Core assessment entity (all configuration)
    assessment_target_section    — Junction: assessment ↔ class_section
    assessment_supervisor        — Junction: assessment ↔ supervising lecturer
    assessment_section           — Blueprint sections within an assessment
    assessment_blueprint_rule    — Structured rules for question distribution
    assessment_draft_progress    — Wizard step completion tracking (1:1 per assessment)
    assessment_autosave           — Serialised form-state snapshots for crash recovery
    assessment_publish_validation — Results of the publish readiness check
    rubric                       — Grading rubric definition
    rubric_criterion             — Individual criterion within a rubric
    rubric_criterion_level       — Performance descriptor for a criterion level

Import order safety:
    This file imports from:
        app.db.base    → AuditedBaseModel, BaseModel, AppendOnlyModel, utcnow
        app.db.enums   → AssessmentType, AssessmentStatus, GradingMode,
                         ResultReleaseMode, SupervisorRole, BlueprintRuleType,
                         QuestionType, DifficultyLevel, ASSESSMENT_WIZARD_STEPS
        app.db.mixins  → fk_uuid, optional_fk_uuid, composite_index,
                         unique_composite_index, positive_int, bool_field

    This file references (via TYPE_CHECKING only):
        app.db.models.auth       → User
        app.db.models.academic   → Course, ClassSection, Subject

Cascade rules:
    assessment_section            → CASCADE from assessment (sections have no
                                    independent existence without assessment)
    assessment_target_section     → CASCADE from assessment
    assessment_supervisor         → CASCADE from assessment
    assessment_draft_progress     → CASCADE from assessment
    assessment_autosave           → CASCADE from assessment
    assessment_publish_validation → CASCADE from assessment
    rubric_criterion               → CASCADE from rubric
    rubric_criterion_level        → CASCADE from rubric_criterion
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, Relationship

from app.db.base import AuditedBaseModel, BaseModel, utcnow
from app.db.enums import (
    AssessmentStatus,
    AssessmentType,
    BlueprintRuleType,
    DifficultyLevel,
    GradingMode,
    QuestionType,
    ResultReleaseMode,
    SupervisorRole,
)
from app.db.mixins import (
    composite_index,
)
from app.db.models.integrity import SupervisionSession

# Constants from mixins (not enums — they are integers)
ASSESSMENT_WIZARD_STEPS: int = 6

if TYPE_CHECKING:
    from app.db.models.academic import ClassSection, Course
    from app.db.models.attempt import AssessmentAttempt
    from app.db.models.integrity import (
        SupervisionSession,
    )
    from app.db.models.question import AIGenerationBatch, AssessmentQuestion


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT
# ─────────────────────────────────────────────────────────────────────────────

class Assessment(AuditedBaseModel, table=True):
    """
    Core assessment entity — every configuration decision lives here.

    Inherits AuditedBaseModel because:
        - created_by_id → the lecturer who created the assessment
        - updated_by_id → the last lecturer or admin to modify it
        Academic integrity requires knowing who authored and last changed
        an assessment at all times.

    subject_id:
        Selected by the lecturer from a dropdown. Populated by querying
        subjects linked to the lecturer's assigned courses via course_subject.

    class_section_id is NOT on this table — assessments target sections via
    the assessment_target_section junction table (supports multi-section targeting).

    draft_step:
        Tracks which wizard step the lecturer last completed.
        NULL when the assessment is published (wizard is no longer relevant).
        Values: 1–6 matching ASSESSMENT_WIZARD_STEPS.

    access_password_hash:
        bcrypt hash of the access code. Only populated when
        is_password_protected = True. Never stored in plain text.

    reassessment_of_id:
        Self-referential FK. NULL for normal assessments. Set for
        reassessments to link back to the original assessment.
        Depth is limited to 1 at the service layer (no reassessment
        of a reassessment).

    autosave_token:
        A UUID generated when a lecturer opens a draft assessment.
        Used to detect stale autosave snapshots when the same draft
        is opened in multiple browser tabs simultaneously.
    """

    __tablename__ = "assessment"

    __table_args__ = (
        composite_index("assessment", "course_id", "status"),
        composite_index("assessment", "course_id", "assessment_type"),
        composite_index("assessment", "subject_id", "status"),
        composite_index("assessment", "status", "window_start"),
        composite_index("assessment", "created_by_id", "status"),
        composite_index("assessment", "draft_is_complete", "status"),
    )

    # ── Core references ───────────────────────────────────────────────────────

    course_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("course.id", ondelete="RESTRICT"),
            nullable=True,
        )
    )
    subject_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("subject.id", ondelete="SET NULL"),
            nullable=True,
        )
    )

    # Self-referential: NULL for normal, set for reassessments
    reassessment_of_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="SET NULL"),
            nullable=True,
        )
    )

    # ── Identity ──────────────────────────────────────────────────────────────

    title: str = Field(nullable=False, max_length=255)
    description: Optional[str] = Field(default=None, nullable=True)
    instructions: Optional[str] = Field(default=None, nullable=True)
    subject: Optional[str] = Field(default=None, nullable=True, max_length=200)
    target_class: Optional[str] = Field(default=None, nullable=True, max_length=200)
    assessment_type: AssessmentType = Field(nullable=False, index=True)
    status: AssessmentStatus = Field(
        default=AssessmentStatus.DRAFT,
        nullable=False,
    )

    # ── Scoring ───────────────────────────────────────────────────────────────

    total_marks: int = Field(default=100, nullable=False)
    passing_marks: Optional[int] = Field(default=None, nullable=True)

    # ── Timing ────────────────────────────────────────────────────────────────

    duration_minutes: Optional[int] = Field(default=None, nullable=True)
    window_start: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
    )
    window_end: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
    )
    max_attempts: int = Field(default=1, nullable=False)

    # ── Grading & result release ──────────────────────────────────────────────

    grading_mode: GradingMode = Field(
        default=GradingMode.AUTO,
        nullable=False,
    )
    result_release_mode: ResultReleaseMode = Field(
        default=ResultReleaseMode.DELAYED,
        nullable=False,
    )
    result_release_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
        # Only populated when result_release_mode = SCHEDULED
    )

    # ── Security & access settings ────────────────────────────────────────────

    is_password_protected: bool = Field(default=False, nullable=False)
    access_password_hash: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=255,
    )

    # ── Assessment mode flags ─────────────────────────────────────────────────

    ai_assistance_allowed: bool = Field(default=False, nullable=False)
    is_open_book: bool = Field(default=False, nullable=False)
    fullscreen_required: bool = Field(default=True, nullable=False)
    integrity_monitoring_enabled: bool = Field(default=True, nullable=False)
    randomize_questions: bool = Field(default=False, nullable=False)
    randomize_options: bool = Field(default=False, nullable=False)
    is_group_assessment: bool = Field(default=False, nullable=False)

    # ── UI & AI flags ─────────────────────────────────────────────────────────

    is_ai_generation_enabled: bool = Field(default=False, nullable=False)
    show_marks_per_question: bool = Field(default=True, nullable=False)
    show_feedback_after_submit: bool = Field(default=True, nullable=False)

    # ── Late submission ───────────────────────────────────────────────────────

    late_submission_allowed: bool = Field(default=False, nullable=False)
    late_penalty_percent: Optional[float] = Field(default=None, nullable=True)
    grace_period_minutes: Optional[int] = Field(default=None, nullable=True)

    # ── Draft wizard tracking ─────────────────────────────────────────────────

    draft_step: Optional[int] = Field(
        default=1,
        nullable=True,
        # NULL after publish; 1–6 while in draft
    )
    draft_is_complete: bool = Field(default=False, nullable=False)
    autosave_token: Optional[uuid.UUID] = Field(default=None, nullable=True)

    # ── Publish timestamps ────────────────────────────────────────────────────

    publish_validated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    published_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    course: Optional["Course"] = Relationship(back_populates="assessments")

    target_sections: List["AssessmentTargetSection"] = Relationship(
        back_populates="assessment"
    )
    supervisors: List["AssessmentSupervisor"] = Relationship(
        back_populates="assessment"
    )
    sections: List["AssessmentSection"] = Relationship(
        back_populates="assessment"
    )
    blueprint_rules: List["AssessmentBlueprintRule"] = Relationship(
        back_populates="assessment"
    )
    draft_progress: Optional["AssessmentDraftProgress"] = Relationship(
        back_populates="assessment"
    )
    autosaves: List["AssessmentAutosave"] = Relationship(
        back_populates="assessment"
    )
    publish_validations: List["AssessmentPublishValidation"] = Relationship(
        back_populates="assessment"
    )
    assessment_questions: List["AssessmentQuestion"] = Relationship(
        back_populates="assessment"
    )
    attempts: List["AssessmentAttempt"] = Relationship(
        back_populates="assessment"
    )
    ai_generation_batches: List["AIGenerationBatch"] = Relationship(
        back_populates="assessment"
    )

    supervision_sessions: List["SupervisionSession"] = Relationship(
    back_populates="assessment"
)


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT TARGET SECTION (junction)
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentTargetSection(BaseModel, table=True):
    """
    Junction table: Assessment ↔ ClassSection (many-to-many).

    An assessment can target multiple class sections (e.g. both Section A
    and Section B of the same course take the same CAT).

    Only students enrolled in one of these sections can access the assessment.
    This is enforced at the service layer during attempt creation.

    added_by_id:
        Plain UUID reference to the lecturer who added this section target.
        Not a declared FK to avoid importing User here. Validated at service layer.
    """

    __tablename__ = "assessment_target_section"

    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "class_section_id",
            name="uq_assessment_target_section_assessment_section",
        ),
        composite_index("assessment_target_section", "assessment_id"),
        composite_index("assessment_target_section", "class_section_id"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    class_section_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("class_section.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    # Plain UUID — validated at service layer
    added_by_id: Optional[uuid.UUID] = Field(default=None, nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    assessment: Optional["Assessment"] = Relationship(
        back_populates="target_sections"
    )
    class_section: Optional["ClassSection"] = Relationship(
        back_populates="assessment_targets"
    )


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT SUPERVISOR (junction)
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentSupervisor(BaseModel, table=True):
    """
    Junction table: Assessment ↔ Supervising Lecturer.

    An assessment can have multiple supervisors:
        PRIMARY   — The creating lecturer or a designated lead supervisor.
        ASSISTANT — Can view live integrity events and issue warnings but
                    cannot modify the assessment or release results.

    assigned_by_id:
        Plain UUID reference to the admin or primary supervisor who assigned
        this supervisor. Not a declared FK. Validated at service layer.
    """

    __tablename__ = "assessment_supervisor"

    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "supervisor_id",
            name="uq_assessment_supervisor_assessment_supervisor",
        ),
        composite_index("assessment_supervisor", "assessment_id"),
        composite_index("assessment_supervisor", "supervisor_id"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    supervisor_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    supervisor_role: SupervisorRole = Field(
        default=SupervisorRole.ASSISTANT,
        nullable=False,
    )
    assigned_at: datetime = Field(default_factory=utcnow, nullable=False)
    # Plain UUID — validated at service layer
    assigned_by_id: Optional[uuid.UUID] = Field(default=None, nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    assessment: Optional["Assessment"] = Relationship(
        back_populates="supervisors"
    )


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT SECTION
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentSection(BaseModel, table=True):
    """
    A named section within an assessment blueprint.

    Examples: "Section A – Multiple Choice", "Section B – Essay Questions".

    Blueprint distribution fields:
        question_count_target:
            How many questions this section should contain.
            Used by publish validation to check the blueprint is satisfied.

        allowed_question_types:
            JSONB array of QuestionType enum values.
            Example: ["mcq", "true_false"]
            NULL means any question type is allowed.

        difficulty_distribution:
            JSONB object defining the target percentage split by difficulty.
            Example: {"easy": 30, "medium": 50, "hard": 20}
            Values should sum to 100. Enforced at service layer.

        ai_generation_prompt_hint:
            Optional free-text guidance added to the AI prompt when generating
            questions for this section. Example: "Focus on SQL JOIN operations."

    order_index:
        Controls display order in the assessment UI. Lower = displayed first.
        Unique per assessment to prevent ordering ambiguity.
    """

    __tablename__ = "assessment_section"

    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "order_index",
            name="uq_assessment_section_assessment_order",
        ),
        composite_index("assessment_section", "assessment_id"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    title: str = Field(nullable=False, max_length=255)
    instructions: Optional[str] = Field(default=None, nullable=True)
    order_index: int = Field(nullable=False)
    marks_allocated: int = Field(default=0, nullable=False)

    # Blueprint distribution fields
    question_count_target: Optional[int] = Field(default=None, nullable=True)
    # Stored as native JSONB
    allowed_question_types: Optional[dict] = Field(
    default=None,
    sa_column=Column(JSONB, nullable=True),
)
    difficulty_distribution: Optional[dict] = Field(
    default=None,
    sa_column=Column(JSONB, nullable=True),
)
    ai_generation_prompt_hint: Optional[str] = Field(default=None, nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    assessment: Optional["Assessment"] = Relationship(back_populates="sections")
    blueprint_rules: List["AssessmentBlueprintRule"] = Relationship(
        back_populates="assessment_section"
    )
    assessment_questions: List["AssessmentQuestion"] = Relationship(
        back_populates="assessment_section"
    )


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT BLUEPRINT RULE
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentBlueprintRule(BaseModel, table=True):
    """
    A structured rule that governs the composition of an assessment or section.

    Rules serve two purposes:
        1. Publish validation — is_enforced=True rules block publish if violated.
        2. AI generation guidance — all rules are included in the AI prompt
            context when generating questions.

    rule_type / numeric_value examples:
        EXACT_QUESTIONS    → numeric_value=20  "This section must have exactly 20 questions"
        MARKS_TOTAL        → numeric_value=100 "Total marks must equal 100"
        DIFFICULTY_RATIO   → difficulty=easy, numeric_value=30 "30% of questions must be easy"
        QUESTION_TYPE_REQUIRED → question_type=mcq, numeric_value=5 "Must have 5 MCQs"
        QUESTION_TYPE_EXCLUDED → question_type=essay "No essay questions allowed"

    assessment_section_id nullable:
        NULL → rule applies to the whole assessment.
        Set  → rule applies only to that section.

    Uniqueness:
        The combination of (assessment_id, assessment_section_id, rule_type,
        question_type, difficulty) should be unique to prevent duplicate rules.
        This is enforced at the service layer because the combination involves
        NULLable columns, and PostgreSQL treats NULLs as non-equal in UNIQUE
        constraints, making a standard unique constraint insufficient.
    """

    __tablename__ = "assessment_blueprint_rule"

    __table_args__ = (
        composite_index("assessment_blueprint_rule", "assessment_id"),
        composite_index(
            "assessment_blueprint_rule", "assessment_id", "is_enforced"
        ),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    assessment_section_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_section.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        )
    )
    rule_type: BlueprintRuleType = Field(nullable=False, index=True)
    question_type: Optional[QuestionType] = Field(default=None, nullable=True)
    difficulty: Optional[DifficultyLevel] = Field(default=None, nullable=True)
    numeric_value: Optional[float] = Field(default=None, nullable=True)
    value_json: Optional[str] = Field(default=None, nullable=True)
    priority: int = Field(default=100, nullable=False)
    is_blocking: bool = Field(default=True, nullable=False)
    description: Optional[str] = Field(default=None, nullable=True)
    is_enforced: bool = Field(default=True, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    assessment: Optional["Assessment"] = Relationship(
        back_populates="blueprint_rules"
    )
    assessment_section: Optional["AssessmentSection"] = Relationship(
        back_populates="blueprint_rules"
    )


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT DRAFT PROGRESS
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentDraftProgress(BaseModel, table=True):
    """
    Tracks wizard step completion state for a draft assessment.

    One row per assessment, created when the assessment is first saved (Step 1).
    Deleted when the assessment is published (the wizard is no longer relevant).

    step_N_complete:
        Set to True when the lecturer completes and validates step N.
        Set back to False if the lecturer goes back and makes changes
        that invalidate a previously-completed step.

    last_active_step:
        The step the lecturer was last on when they left the wizard.
        Used to restore the wizard to the correct step on re-entry.

    step_N_validated_at:
        Timestamp of the last successful validation for step N.
        Used to detect whether validation is stale after edits.

    Unique constraint enforces 1:1 with assessment at the DB level.
    """

    __tablename__ = "assessment_draft_progress"

    __table_args__ = (
        UniqueConstraint(
            "assessment_id",
            name="uq_assessment_draft_progress_assessment",
        ),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        )
    )

    # Step completion flags
    step_1_complete: bool = Field(default=False, nullable=False)
    step_2_complete: bool = Field(default=False, nullable=False)
    step_3_complete: bool = Field(default=False, nullable=False)
    step_4_complete: bool = Field(default=False, nullable=False)
    step_5_complete: bool = Field(
        default=True,
        nullable=False,
        # Defaults to True — if AI generation is never used, step 5 is skipped
    )
    step_6_complete: bool = Field(default=False, nullable=False)

    last_active_step: int = Field(default=1, nullable=False)

    # Step validation timestamps
    step_1_validated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    step_2_validated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    step_3_validated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    step_4_validated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    step_5_validated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    step_6_validated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    assessment: Optional["Assessment"] = Relationship(
        back_populates="draft_progress"
    )


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT AUTOSAVE
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentAutosave(BaseModel, table=True):
    """
    Serialised form-state snapshot for crash recovery.

    This table does NOT replace the real assessment/question data.
    It stores a lightweight JSONB snapshot of the form state for a
    specific step, used only if the browser crashes mid-edit.

    On successful step completion:
        1. The real tables are updated (assessment, assessment_section, etc.)
        2. A new autosave snapshot is written (superseding the old one)
        3. Snapshots older than expires_at are purged by a Celery task

    client_version:
        Monotonically increasing integer set by the frontend.
        If two autosaves arrive for the same (assessment_id, step_number),
        the one with the higher client_version wins. This prevents a stale
        network response from overwriting a newer save.

    lecturer_id:
        The lecturer who was editing. Stored to prevent one lecturer's
        autosave from being restored by a different lecturer on the same assessment.
    """

    __tablename__ = "assessment_autosave"

    __table_args__ = (
        composite_index(
            "assessment_autosave",
            "assessment_id", "lecturer_id", "step_number",
        ),
        composite_index("assessment_autosave", "expires_at"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    # Plain UUID — validated at service layer
    lecturer_id: uuid.UUID = Field(nullable=False, index=True)

    step_number: int = Field(nullable=False)
    snapshot: dict = Field(
    sa_column=Column(JSONB, nullable=False),
)
    client_version: int = Field(default=1, nullable=False)
    saved_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    assessment: Optional["Assessment"] = Relationship(back_populates="autosaves")


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT PUBLISH VALIDATION
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentPublishValidation(BaseModel, table=True):
    """
    Records the result of a publish readiness check.

    A new row is inserted every time validation runs — this is an
    append-style table for this entity (though not using AppendOnlyModel
    because it inherits from BaseModel for structural consistency and
    to allow soft-delete of stale validation records by admin).

    The publish action reads the most recent row WHERE overall_passed = True.
    If no such row exists, or the most recent row has overall_passed = False,
    the assessment cannot be published.

    validation_results:
        JSONB array of objects:
        [
          {"rule": "EXACT_QUESTIONS", "passed": true, "reason": null},
          {"rule": "MARKS_TOTAL", "passed": false, "reason": "Total is 95, expected 100"}
        ]

    checked_by_id:
        Plain UUID reference to the lecturer who triggered validation.
        Not a declared FK. Validated at service layer.
    """

    __tablename__ = "assessment_publish_validation"

    __table_args__ = (
        composite_index(
            "assessment_publish_validation",
            "assessment_id", "checked_at",
        ),
        composite_index(
            "assessment_publish_validation",
            "assessment_id", "overall_passed",
        ),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    # Plain UUID — validated at service layer
    checked_by_id: Optional[uuid.UUID] = Field(default=None, nullable=True)
    checked_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )
    overall_passed: bool = Field(default=False, nullable=False, index=True)
    validation_results: list = Field(
    sa_column=Column(JSONB, nullable=False),
)

    # ── Relationships ─────────────────────────────────────────────────────────
    assessment: Optional["Assessment"] = Relationship(
        back_populates="publish_validations"
    )


# ─────────────────────────────────────────────────────────────────────────────
# RUBRIC
# ─────────────────────────────────────────────────────────────────────────────

class Rubric(AuditedBaseModel, table=True):
    """
    A lecturer-defined grading rubric.

    Inherits AuditedBaseModel because:
        - created_by_id → the lecturer who defined the rubric
        - updated_by_id → who last modified it
        Rubric changes affect how students are graded — full audit is required.

    is_shared:
        True → the rubric is visible to all lecturers in the institution.
        False → private to the creating lecturer.

    A rubric can be attached to:
        - An entire assessment (via assessment.rubric_id — added in queries)
        - A specific question (via question.rubric_id — defined in question module)
    """

    __tablename__ = "rubric"

    __table_args__ = (
        composite_index("rubric", "created_by_id", "is_shared"),
    )

    title: str = Field(nullable=False, max_length=255)
    description: Optional[str] = Field(default=None, nullable=True)
    is_shared: bool = Field(default=False, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    criteria: List["RubricCriterion"] = Relationship(back_populates="rubric")


# ─────────────────────────────────────────────────────────────────────────────
# RUBRIC CRITERION
# ─────────────────────────────────────────────────────────────────────────────

class RubricCriterion(BaseModel, table=True):
    """
    An individual criterion within a rubric.

    Example criteria for an essay rubric:
        - "Depth of Analysis" (max 8 marks)
        - "Clarity of Argument" (max 6 marks)
        - "Use of Evidence" (max 6 marks)

    order_index:
        Controls display order. Unique per rubric.
    """

    __tablename__ = "rubric_criterion"

    __table_args__ = (
        UniqueConstraint(
            "rubric_id", "order_index",
            name="uq_rubric_criterion_rubric_order",
        ),
        composite_index("rubric_criterion", "rubric_id"),
    )

    rubric_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("rubric.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    title: str = Field(nullable=False, max_length=255)
    description: Optional[str] = Field(default=None, nullable=True)
    max_marks: int = Field(nullable=False)
    order_index: int = Field(nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    rubric: Optional["Rubric"] = Relationship(back_populates="criteria")
    levels: List["RubricCriterionLevel"] = Relationship(
        back_populates="criterion"
    )


# ─────────────────────────────────────────────────────────────────────────────
# RUBRIC CRITERION LEVEL
# ─────────────────────────────────────────────────────────────────────────────

class RubricCriterionLevel(BaseModel, table=True):
    """
    A performance descriptor for one level of a rubric criterion.

    Example levels for "Depth of Analysis" criterion (max 8 marks):
        Excellent    → marks=8  → "Demonstrates deep, original analysis..."
        Good         → marks=6  → "Demonstrates adequate analysis..."
        Satisfactory → marks=4  → "Some analysis evident but superficial..."
        Poor         → marks=2  → "Little evidence of analysis..."

    order_index:
        Controls display order within the criterion. Lower = better performance.
        Unique per criterion.

    marks:
        The actual marks awarded when a lecturer selects this level.
        Must be ≤ criterion.max_marks. Enforced at service layer.
    """

    __tablename__ = "rubric_criterion_level"

    __table_args__ = (
        UniqueConstraint(
            "criterion_id", "order_index",
            name="uq_rubric_criterion_level_criterion_order",
        ),
        composite_index("rubric_criterion_level", "criterion_id"),
    )

    criterion_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("rubric_criterion.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    label: str = Field(nullable=False, max_length=100)
    description: Optional[str] = Field(default=None, nullable=True)
    marks: int = Field(nullable=False)
    order_index: int = Field(nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    criterion: Optional["RubricCriterion"] = Relationship(back_populates="levels")
