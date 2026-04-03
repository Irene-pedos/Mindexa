"""
app/core/constants.py

All platform-wide enumerations and constants.
Using str Enum means values are JSON-serialisable and database-safe.
"""

from enum import Enum

# ── User & Auth ───────────────────────────────────────────────────────────────

class UserRole(str, Enum):
    STUDENT = "student"
    LECTURER = "lecturer"
    ADMIN = "admin"


class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING_VERIFICATION = "pending_verification"


class TokenType(str, Enum):
    ACCESS = "access"
    REFRESH = "refresh"
    PASSWORD_RESET = "password_reset"
    EMAIL_VERIFICATION = "email_verification"


# ── Academic Structure ────────────────────────────────────────────────────────

class AcademicPeriodType(str, Enum):
    SEMESTER = "semester"
    TRIMESTER = "trimester"
    QUARTER = "quarter"
    YEAR = "year"


class EnrollmentStatus(str, Enum):
    ACTIVE = "active"
    WITHDRAWN = "withdrawn"
    COMPLETED = "completed"
    DEFERRED = "deferred"


class LecturerAssignmentRole(str, Enum):
    PRIMARY = "primary"
    ASSISTANT = "assistant"
    SUPERVISOR = "supervisor"


# ── Assessment ────────────────────────────────────────────────────────────────

class AssessmentType(str, Enum):
    FORMATIVE = "formative"
    CAT = "cat"
    SUMMATIVE = "summative"
    HOMEWORK = "homework"
    GROUP_WORK = "group_work"
    REASSESSMENT = "reassessment"


class AssessmentStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ACTIVE = "active"
    CLOSED = "closed"
    ARCHIVED = "archived"


class QuestionType(str, Enum):
    MCQ = "mcq"
    TRUE_FALSE = "true_false"
    SHORT_ANSWER = "short_answer"
    ESSAY = "essay"
    MATCHING = "matching"
    FILL_BLANK = "fill_blank"
    COMPUTATIONAL = "computational"
    CASE_STUDY = "case_study"
    ORDERING = "ordering"


class DifficultyLevel(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class GradingMode(str, Enum):
    AUTO = "auto"
    SEMI = "semi"
    MANUAL = "manual"
    RUBRIC = "rubric"


class ResultReleaseMode(str, Enum):
    IMMEDIATE = "immediate"
    DELAYED = "delayed"
    SCHEDULED = "scheduled"


# ── Assessment Attempt ────────────────────────────────────────────────────────

class AttemptStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    AUTO_SUBMITTED = "auto_submitted"
    ABANDONED = "abandoned"


class SubmissionStatus(str, Enum):
    SUBMITTED = "submitted"
    GRADING_QUEUED = "grading_queued"
    AUTO_GRADED = "auto_graded"
    AI_SUGGESTED = "ai_suggested"
    AWAITING_REVIEW = "awaiting_review"
    LECTURER_REVIEWED = "lecturer_reviewed"
    FINAL_RELEASED = "final_released"
    UNDER_APPEAL = "under_appeal"


class ReviewStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    REVISED = "revised"


# ── Integrity ─────────────────────────────────────────────────────────────────

class IntegrityEventType(str, Enum):
    FULLSCREEN_EXIT = "fullscreen_exit"
    FULLSCREEN_ENTER = "fullscreen_enter"
    TAB_SWITCH = "tab_switch"
    WINDOW_BLUR = "window_blur"
    WINDOW_FOCUS = "window_focus"
    VISIBILITY_HIDDEN = "visibility_hidden"
    COPY_ATTEMPT = "copy_attempt"
    PASTE_ATTEMPT = "paste_attempt"
    RIGHT_CLICK = "right_click"
    EXTENDED_INACTIVITY = "extended_inactivity"
    RECONNECT = "reconnect"
    UNUSUAL_KEYPRESS = "unusual_keypress"


class IntegrityRiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WarningLevel(int, Enum):
    NONE = 0
    WARNING_1 = 1
    WARNING_2 = 2
    WARNING_3 = 3


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationType(str, Enum):
    ASSESSMENT_PUBLISHED = "assessment_published"
    ASSESSMENT_REMINDER = "assessment_reminder"
    RESULT_RELEASED = "result_released"
    FEEDBACK_RELEASED = "feedback_released"
    SUBMISSION_RECEIVED = "submission_received"
    GRADING_REQUIRED = "grading_required"
    INTEGRITY_ALERT = "integrity_alert"
    APPEAL_SUBMITTED = "appeal_submitted"
    APPEAL_RESOLVED = "appeal_resolved"
    DEADLINE_EXTENDED = "deadline_extended"
    REASSESSMENT_SCHEDULED = "reassessment_scheduled"


class NotificationChannel(str, Enum):
    IN_APP = "in_app"
    EMAIL = "email"
    BOTH = "both"


# ── AI ────────────────────────────────────────────────────────────────────────

class AIActionType(str, Enum):
    GENERATE_QUESTIONS = "generate_questions"
    GENERATE_RUBRIC = "generate_rubric"
    GENERATE_ASSESSMENT_DRAFT = "generate_assessment_draft"
    GRADE_RESPONSE = "grade_response"
    SUGGEST_FEEDBACK = "suggest_feedback"
    ANALYZE_INTEGRITY = "analyze_integrity"
    STUDY_SUPPORT = "study_support"
    DOCUMENT_SUMMARY = "document_summary"
    ANSWER_KEY_GENERATION = "answer_key_generation"


class AIActionStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


# ── File Management ───────────────────────────────────────────────────────────

class FileCategory(str, Enum):
    ASSESSMENT_ATTACHMENT = "assessment_attachment"
    SUBMISSION_FILE = "submission_file"
    STUDY_RESOURCE = "study_resource"
    LECTURE_MATERIAL = "lecture_material"
    RUBRIC_DOCUMENT = "rubric_document"
    PROFILE_AVATAR = "profile_avatar"


# ── Pagination ────────────────────────────────────────────────────────────────

DEFAULT_PAGE_SIZE: int = 20
MAX_PAGE_SIZE: int = 100
MIN_PAGE_SIZE: int = 1
