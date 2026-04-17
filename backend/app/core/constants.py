"""
app/core/constants.py

Shared enums and constants for Mindexa Platform.

These are Python-level enums used in application code.
Database-level enums are in app/db/enums.py and should mirror these.

IMPORTANT:
    The values here must match the corresponding SQLAlchemy Enum values
    in app/db/enums.py exactly. If you change a value here, update the
    DB enum and generate a migration.
"""

from enum import Enum

# ---------------------------------------------------------------------------
# PAGINATION CONSTANTS
# ---------------------------------------------------------------------------

DEFAULT_PAGE_SIZE = 20
MIN_PAGE_SIZE = 1
MAX_PAGE_SIZE = 100


class UserRole(str, Enum):
    """
    Primary user role.

    Used in:
        - JWT claims (convenience, not trusted for authorization)
        - DB User.role column
        - Role guards in dependencies
        - Permission checks in services
    """

    STUDENT = "student"
    LECTURER = "lecturer"
    ADMIN = "admin"


class UserStatus(str, Enum):
    """
    Account lifecycle status.

    State transitions:
        PENDING_VERIFICATION → ACTIVE (after email verified)
        ACTIVE → SUSPENDED (admin action)
        ACTIVE → INACTIVE (user deactivated or admin action)
        SUSPENDED → ACTIVE (admin reinstates)
        INACTIVE → ACTIVE (admin reinstates)

    Login behavior:
        ACTIVE                → Allowed
        PENDING_VERIFICATION  → Allowed (but some features gated)
        SUSPENDED             → Blocked (AccountSuspendedError)
        INACTIVE              → Blocked (AccountInactiveError)
    """

    PENDING_VERIFICATION = "pending_verification"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    INACTIVE = "inactive"


class TokenType(str, Enum):
    """
    JWT token type claim.

    Used in JWT payload to differentiate access and refresh tokens.
    Prevents a refresh token being used as an access token.
    """

    ACCESS = "access"
    REFRESH = "refresh"
    EMAIL_VERIFICATION = "email_verification"
    PASSWORD_RESET = "password_reset"


class SecurityEventType(str, Enum):
    """
    Types of security events recorded in the audit log.

    These values map to the SecurityEvent.event_type DB column.
    """

    # Auth events
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILED = "login_failed"
    LOGIN_LOCKED = "login_locked"
    LOGOUT = "logout"
    LOGOUT_ALL = "logout_all"
    TOKEN_REFRESHED = "token_refreshed"

    # Account events
    ACCOUNT_CREATED = "account_created"
    ACCOUNT_SUSPENDED = "account_suspended"
    ACCOUNT_REACTIVATED = "account_reactivated"
    EMAIL_VERIFIED = "email_verified"
    VERIFICATION_EMAIL_RESENT = "verification_email_resent"

    # Password events
    PASSWORD_CHANGED = "password_changed"
    PASSWORD_RESET_REQUESTED = "password_reset_requested"
    PASSWORD_RESET_COMPLETED = "password_reset_completed"

    # Integrity events (auth layer)
    SUSPICIOUS_LOGIN = "suspicious_login"
    TOKEN_THEFT_DETECTED = "token_theft_detected"

    # Assessment integrity (recorded by integrity service later)
    TAB_SWITCH = "tab_switch"
    FULLSCREEN_EXIT = "fullscreen_exit"
    COPY_ATTEMPT = "copy_attempt"
    PASTE_ATTEMPT = "paste_attempt"


class SecurityEventSeverity(str, Enum):
    """
    Severity classification for security events.

    Used to prioritize alerts in the admin security dashboard.
    """

    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AssessmentType(str, Enum):
    """Assessment type classifications."""

    FORMATIVE = "formative"
    CAT = "cat"  # Continuous Assessment Test
    SUMMATIVE = "summative"
    HOMEWORK = "homework"
    GROUP_WORK = "group_work"
    REASSESSMENT = "reassessment"


class AssessmentStatus(str, Enum):
    """Assessment lifecycle status."""

    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"
    CANCELLED = "cancelled"


class QuestionType(str, Enum):
    """Question type classifications."""

    MCQ = "mcq"
    TRUE_FALSE = "true_false"
    SHORT_ANSWER = "short_answer"
    ESSAY = "essay"
    MATCHING = "matching"
    FILL_BLANK = "fill_blank"
    COMPUTATIONAL = "computational"
    CASE_STUDY = "case_study"
    ORDERING = "ordering"


class GradingMode(str, Enum):
    """
    How a question or assessment will be graded.

    AUTO: Fully auto-gradable (MCQ, True/False, Matching, Ordering, Fill-blank)
    SEMI_AUTO: AI-assisted, lecturer confirms (Short Answer, Computational)
    MANUAL: Human grading required (Essay, Case Study)
    AI_ASSISTED: AI suggests, lecturer approves (open-ended)
    """

    AUTO = "auto"
    SEMI_AUTO = "semi_auto"
    MANUAL = "manual"
    AI_ASSISTED = "ai_assisted"


class SubmissionStatus(str, Enum):
    """Assessment attempt / submission status."""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    AUTO_SUBMITTED = "auto_submitted"
    GRADED = "graded"
    UNDER_REVIEW = "under_review"
    RELEASED = "released"


class GradeStatus(str, Enum):
    """Grade/result release lifecycle status."""

    PENDING = "pending"
    AUTO_GRADED = "auto_graded"
    AI_SUGGESTED = "ai_suggested"
    AWAITING_REVIEW = "awaiting_review"
    LECTURER_REVIEWED = "lecturer_reviewed"
    FINAL = "final"
    RELEASED = "released"
    UNDER_APPEAL = "under_appeal"


class AppealStatus(str, Enum):
    """Appeal request status."""

    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    RESOLVED_UPHELD = "resolved_upheld"
    RESOLVED_REJECTED = "resolved_rejected"
    WITHDRAWN = "withdrawn"


class NotificationChannel(str, Enum):
    """Supported notification delivery channels."""

    IN_APP = "in_app"
    EMAIL = "email"
    PUSH = "push"


class IntegrityEventType(str, Enum):
    """Browser-level integrity event types from the exam client."""

    FULLSCREEN_EXIT = "fullscreen_exit"
    TAB_SWITCH = "tab_switch"
    WINDOW_BLUR = "window_blur"
    WINDOW_FOCUS = "window_focus"
    PAGE_HIDDEN = "page_hidden"
    COPY_ATTEMPT = "copy_attempt"
    PASTE_ATTEMPT = "paste_attempt"
    RIGHT_CLICK_ATTEMPT = "right_click_attempt"
    SUSPICIOUS_INACTIVITY = "suspicious_inactivity"
    RECONNECT = "reconnect"
    DEVTOOLS_DETECTED = "devtools_detected"
    MULTIPLE_MONITORS = "multiple_monitors"


class RiskLevel(str, Enum):
    """Risk level for integrity events and student sessions."""

    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AIAgentType(str, Enum):
    """AI agent type identifiers."""

    ASSESSMENT_GENERATOR = "assessment_generator"
    GRADING_ASSISTANT = "grading_assistant"
    STUDY_SUPPORT = "study_support"
    INTEGRITY_ANALYZER = "integrity_analyzer"


class AIOutputStatus(str, Enum):
    """Status of an AI-generated output."""

    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    EDITED_AND_APPROVED = "edited_and_approved"
