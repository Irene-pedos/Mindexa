"""
app/db/schemas/__init__.py

Central schema registry — single import point for all Pydantic schemas.

Usage:
    from app.db.schemas import UserResponse, AssessmentDetailResponse, PaginatedResponse

IMPORT ORDER
============
Follows domain dependency: base first, then domain schemas in the same
order as model files. No circular schema imports possible because schemas
import from enums only, never from other schema modules.
"""

from __future__ import annotations

# ── Academic ──────────────────────────────────────────────────────────────────
from app.db.schemas.academic import (
                                     AcademicPeriodCreate,
                                     AcademicPeriodResponse,
                                     ClassSectionCreate,
                                     ClassSectionResponse,
                                     CourseCreate,
                                     CourseResponse,
                                     CourseSummaryResponse,
                                     CourseUpdate,
                                     EnrollmentStatusUpdate,
                                     InstitutionCreate,
                                     InstitutionResponse,
                                     InstitutionUpdate,
                                     LecturerAssignRequest,
                                     LecturerCourseAssignmentResponse,
                                     StudentEnrollmentResponse,
                                     StudentEnrollRequest,
                                     SubjectCreate,
                                     SubjectResponse,
)

# ── AI traceability ────────────────────────────────────────────────────────────
from app.db.schemas.ai import AIActionLogResponse, AIGradeReviewResponse

# ── Assessment ────────────────────────────────────────────────────────────────
from app.db.schemas.assessment import (
                                     AssessmentDetailResponse,
                                     AssessmentDraftProgressResponse,
                                     AssessmentPublishRequest,
                                     AssessmentPublishValidationResponse,
                                     AssessmentSectionCreate,
                                     AssessmentSectionResponse,
                                     AssessmentStep1Request,
                                     AssessmentStep2Request,
                                     AssessmentStep3Request,
                                     AssessmentStep4Request,
                                     AssessmentSummaryResponse,
                                     BlueprintRuleCreate,
                                     RubricCreate,
                                     RubricCriterionCreate,
                                     RubricCriterionLevelCreate,
                                     RubricCriterionLevelResponse,
                                     RubricCriterionResponse,
                                     RubricResponse,
                                     SupervisorAssignRequest,
)

# ── Attempt ───────────────────────────────────────────────────────────────────
from app.db.schemas.attempt import (
                                     AttemptResponse,
                                     AttemptStartRequest,
                                     AttemptSummaryResponse,
                                     BulkResponseSave,
                                     StudentGroupCreate,
                                     StudentGroupMemberAdd,
                                     StudentGroupResponse,
                                     StudentResponseReadResponse,
                                     StudentResponseSave,
                                     SubmitAttemptRequest,
)

# ── Auth ──────────────────────────────────────────────────────────────────────
from app.db.schemas.auth import (
                                     PasswordChangeRequest,
                                     PasswordResetConfirmRequest,
                                     PasswordResetRequestBody,
                                     RefreshRequest,
                                     TokenResponse,
                                     UserLoginRequest,
                                     UserProfileResponse,
                                     UserProfileUpdate,
                                     UserRegisterRequest,
                                     UserResponse,
                                     UserSummaryResponse,
)

# ── Base ──────────────────────────────────────────────────────────────────────
from app.db.schemas.base import (
                                     BaseAuditedResponse,
                                     BaseResponse,
                                     ErrorDetail,
                                     ErrorResponse,
                                     MessageResponse,
                                     MindexaSchema,
                                     PaginatedResponse,
                                     PaginationParams,
)

# ── Grading ───────────────────────────────────────────────────────────────────
from app.db.schemas.grading import (
                                     AppealReviewDecision,
                                     GradeConfirmRequest,
                                     GradeReleaseRequest,
                                     ResponseGradeOverride,
                                     ResultAppealCreate,
                                     ResultAppealResponse,
                                     RubricGradeEntry,
                                     RubricGradeResponse,
                                     RubricGradingRequest,
                                     SubmissionGradeResponse,
)

# ── Integrity ──────────────────────────────────────────────────────────────────
from app.db.schemas.integrity import (
                                     FlagResolutionRequest,
                                     IntegrityEventIngest,
                                     IntegrityEventResponse,
                                     IntegrityFlagResponse,
                                     IntegrityWarningResponse,
                                     LiveAttemptStatusResponse,
                                     ManualFlagRequest,
                                     ManualWarningRequest,
                                     SupervisionSessionResponse,
)

# ── Notifications (includes CalendarRangeRequest — belongs here) ───────────────
from app.db.schemas.notification import (
                                     CalendarRangeRequest,
                                     MarkNotificationsRead,
                                     NotificationCountResponse,
                                     NotificationResponse,
                                     ScheduledEventResponse,
)

# ── Question bank ──────────────────────────────────────────────────────────────
from app.db.schemas.question import (
                                     AddQuestionToAssessmentRequest,
                                     AIGenerationBatchResponse,
                                     AIGenerationRequest,
                                     AIQuestionReviewDecision,
                                     AIQuestionReviewResponse,
                                     AssessmentQuestionResponse,
                                     QuestionBlankCreate,
                                     QuestionBlankResponse,
                                     QuestionCreate,
                                     QuestionDetailResponse,
                                     QuestionOptionCreate,
                                     QuestionOptionResponse,
                                     QuestionSummaryResponse,
                                     QuestionUpdate,
)

# ── Resources ─────────────────────────────────────────────────────────────────
from app.db.schemas.resource import (
                                     LecturerMaterialCreate,
                                     LecturerMaterialResponse,
                                     StudentResourceCreate,
                                     StudentResourceResponse,
)

__all__: list[str] = [
    # Base
    "MindexaSchema",
    "BaseResponse",
    "BaseAuditedResponse",
    "PaginatedResponse",
    "PaginationParams",
    "MessageResponse",
    "ErrorDetail",
    "ErrorResponse",
    # Auth
    "UserRegisterRequest",
    "UserLoginRequest",
    "TokenResponse",
    "RefreshRequest",
    "PasswordChangeRequest",
    "PasswordResetRequestBody",
    "PasswordResetConfirmRequest",
    "UserProfileUpdate",
    "UserProfileResponse",
    "UserResponse",
    "UserSummaryResponse",
    # Academic
    "InstitutionCreate",
    "InstitutionUpdate",
    "InstitutionResponse",
    "AcademicPeriodCreate",
    "AcademicPeriodResponse",
    "SubjectCreate",
    "SubjectResponse",
    "CourseCreate",
    "CourseUpdate",
    "CourseResponse",
    "CourseSummaryResponse",
    "ClassSectionCreate",
    "ClassSectionResponse",
    "StudentEnrollRequest",
    "EnrollmentStatusUpdate",
    "StudentEnrollmentResponse",
    "LecturerAssignRequest",
    "LecturerCourseAssignmentResponse",
    # Assessment
    "AssessmentStep1Request",
    "AssessmentStep2Request",
    "AssessmentStep3Request",
    "AssessmentStep4Request",
    "AssessmentPublishRequest",
    "AssessmentPublishValidationResponse",
    "AssessmentSectionCreate",
    "AssessmentSectionResponse",
    "BlueprintRuleCreate",
    "SupervisorAssignRequest",
    "AssessmentSummaryResponse",
    "AssessmentDetailResponse",
    "AssessmentDraftProgressResponse",
    "RubricCreate",
    "RubricCriterionCreate",
    "RubricCriterionLevelCreate",
    "RubricResponse",
    "RubricCriterionResponse",
    "RubricCriterionLevelResponse",
    # Question
    "QuestionOptionCreate",
    "QuestionOptionResponse",
    "QuestionBlankCreate",
    "QuestionBlankResponse",
    "QuestionCreate",
    "QuestionUpdate",
    "QuestionSummaryResponse",
    "QuestionDetailResponse",
    "AddQuestionToAssessmentRequest",
    "AssessmentQuestionResponse",
    "AIGenerationRequest",
    "AIGenerationBatchResponse",
    "AIQuestionReviewDecision",
    "AIQuestionReviewResponse",
    # Attempt
    "AttemptStartRequest",
    "AttemptResponse",
    "AttemptSummaryResponse",
    "StudentResponseSave",
    "BulkResponseSave",
    "SubmitAttemptRequest",
    "StudentResponseReadResponse",
    "StudentGroupCreate",
    "StudentGroupMemberAdd",
    "StudentGroupResponse",
    # Grading
    "GradeConfirmRequest",
    "ResponseGradeOverride",
    "GradeReleaseRequest",
    "SubmissionGradeResponse",
    "RubricGradeEntry",
    "RubricGradingRequest",
    "RubricGradeResponse",
    "ResultAppealCreate",
    "AppealReviewDecision",
    "ResultAppealResponse",
    # Integrity
    "IntegrityEventIngest",
    "IntegrityEventResponse",
    "IntegrityWarningResponse",
    "ManualWarningRequest",
    "ManualFlagRequest",
    "FlagResolutionRequest",
    "IntegrityFlagResponse",
    "SupervisionSessionResponse",
    "LiveAttemptStatusResponse",
    # Notifications
    "NotificationResponse",
    "MarkNotificationsRead",
    "NotificationCountResponse",
    "ScheduledEventResponse",
    "CalendarRangeRequest",
    # Resources
    "StudentResourceCreate",
    "StudentResourceResponse",
    "LecturerMaterialCreate",
    "LecturerMaterialResponse",
    # AI
    "AIActionLogResponse",
    "AIGradeReviewResponse",
]
