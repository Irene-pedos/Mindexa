"""
app/db/models/__init__.py

Central model registry — Mindexa Platform.

This is the single import that guarantees every SQLModel table class
is registered with SQLModel.metadata before any of these run:
    - Alembic autogenerate  (alembic/env.py imports this module)
    - FastAPI app lifespan  (app/main.py imports this at startup)
    - Test suite setup      (tests/conftest.py imports this)

IMPORT ORDER
============
The order follows the FK dependency chain strictly.
Each module can safely reference all previously imported modules.

    1. audit      — AppendOnlyModel only, zero FK declarations.
                    Always import first — can never have import errors.

    2. auth       — Defines `user` table. Every module with FK → user
                    must come after this.

    3. academic   — Depends on user (lecturer_id, student_id FKs on
                    junction tables).

    4. assessment — Depends on user (AuditedBaseModel created_by_id)
                    and academic (course_id, subject_id FKs).

    5. question   — Depends on assessment (assessment_id FKs on
                    assessment_question, ai_question_generation_batch).

    6. attempt    — Depends on question (question_id FK on student_response),
                    assessment (assessment_id FKs), user (student_id FKs).

    7. integrity  — Depends on attempt (attempt_id FKs on all integrity
                    tables) and assessment (assessment_id FKs).

    8. ai         — Depends on attempt and assessment (both via plain UUIDs
                    on AIActionLog; declared FKs on AIGradeReview).

    9. notification — Depends on user (recipient_id FK) and assessment
                      (assessment_id FK on reminder). No other model deps.

   10. resource   — Depends on user, academic (course_id on
                    lecturer_material), assessment (assessment_id on
                    lecturer_material). Last because pgvector import
                    in resource_chunk is the most fragile dependency.

RE-EXPORTS
==========
All 54 model classes are re-exported so consumers can write:
    from app.db.models import User, Assessment
instead of:
    from app.db.models.auth import User
    from app.db.models.assessment import Assessment
"""

from app.db.models.academic import (
    AcademicPeriod,
    ClassSection,
    Course,
    CourseSubject,
    Department,
    Institution,
    LecturerCourseAssignment,
    StudentEnrollment,
    Subject,
)
from app.db.models.ai import AIActionLog, AIGradeReview
from app.db.models.assessment import (
    Assessment,
    AssessmentAutosave,
    AssessmentBlueprintRule,
    AssessmentDraftProgress,
    AssessmentPublishValidation,
    AssessmentSection,
    AssessmentSupervisor,
    AssessmentTargetSection,
    Rubric,
    RubricCriterion,
    RubricCriterionLevel,
)
from app.db.models.attempt import (
    AssessmentAttempt,
    GroupActivityLog,
    GroupAppeal,
    GroupAppealApproval,
    GroupAssessmentMaterial,
    GroupSubmission,
    GroupSubmissionAnswer,
    GroupSubmissionApproval,
    GroupSubmissionComment,
    ResultAppeal,
    RubricGrade,
    GradingQueueItem,
    StudentGroup,
    StudentGroupMember,
    StudentResponse,
    SubmissionGrade,
)
from app.db.models.audit import AuditLog, SecurityEvent
from app.db.models.auth import PasswordResetToken, RefreshToken, User, UserProfile
from app.db.models.integrity import (
    IntegrityEvent,
    IntegrityFlag,
    IntegrityWarning,
    SupervisionSession,
)
from app.db.models.notification import Notification, Reminder, ScheduledEvent
from app.db.models.question import (
    AIGeneratedQuestion,
    AIGenerationBatch,
    AIQuestionReview,
    AssessmentQuestion,
    Question,
    QuestionBankEntry,
    QuestionBlank,
    QuestionOption,
)
from app.db.models.resource import LecturerMaterial, LecturerMaterialChunk, StudentResourceChunk, StudentResource
from app.db.models.academic_resource import AcademicResource
from app.db.models.resource_chunk import ResourceChunk
from app.db.models.study_support_session import StudySupportSession
from app.db.models.result import AssessmentResult, ResultBreakdown

__all__: list[str] = [
    # ── Audit ──────────────────────────────────────────────────────────────────
    "AuditLog",
    "SecurityEvent",
    # ── Auth ───────────────────────────────────────────────────────────────────
    "User",
    "UserProfile",
    "RefreshToken",
    "PasswordResetToken",
    # ── Academic ───────────────────────────────────────────────────────────────
    "Institution",
    "Department",
    "AcademicPeriod",
    "Subject",
    "Course",
    "CourseSubject",
    "ClassSection",
    "LecturerCourseAssignment",
    "StudentEnrollment",
    # ── Assessment ─────────────────────────────────────────────────────────────
    "Assessment",
    "AssessmentTargetSection",
    "AssessmentSupervisor",
    "AssessmentSection",
    "AssessmentBlueprintRule",
    "AssessmentDraftProgress",
    "AssessmentAutosave",
    "AssessmentPublishValidation",
    "Rubric",
    "RubricCriterion",
    "RubricCriterionLevel",
    # ── Question bank ──────────────────────────────────────────────────────────
    "Question",
    "QuestionOption",
    "QuestionBlank",
    "AssessmentQuestion",
    "AIGenerationBatch",
    "AIGeneratedQuestion",
    "AIQuestionReview",
    "QuestionBankEntry",
    # ── Attempt & submission ───────────────────────────────────────────────────
    "AssessmentAttempt",
    "StudentGroup",
    "StudentGroupMember",
    "GroupSubmission",
    "GroupSubmissionAnswer",
    "GroupSubmissionComment",
    "GroupSubmissionApproval",
    "GroupActivityLog",
    "GroupAppeal",
    "GroupAppealApproval",
    "GroupAssessmentMaterial",
    "StudentResponse",
    "SubmissionGrade",
    "RubricGrade",
    "ResultAppeal",
    "GradingQueueItem",
    # ── Integrity ──────────────────────────────────────────────────────────────
    "IntegrityEvent",
    "IntegrityWarning",
    "IntegrityFlag",
    "SupervisionSession",
    # ── AI traceability ────────────────────────────────────────────────────────
    "AIActionLog",
    "AIGradeReview",
    # ── Notifications ──────────────────────────────────────────────────────────
    "Notification",
    "ScheduledEvent",
    "Reminder",
    # ── Resources ──────────────────────────────────────────────────────────────
    "StudentResource",
    "StudentResourceChunk",
    "LecturerMaterial",
    "LecturerMaterialChunk",
    "AcademicResource",
    "ResourceChunk",
    "StudySupportSession",
    # —— Results ————————————————————————————————————————————————————————————————————————————
    "AssessmentResult",
    "ResultBreakdown",
]
