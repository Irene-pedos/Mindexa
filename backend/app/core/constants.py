"""
app/core/constants.py

Shared enums and constants for Mindexa Platform.
Aligned with database ENUM values (UPPERCASE).

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
    """Primary user role."""
    STUDENT = "STUDENT"
    LECTURER = "LECTURER"
    ADMIN = "ADMIN"


class UserStatus(str, Enum):
    """Account lifecycle status."""
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    INACTIVE = "INACTIVE"
    GRADUATED = "GRADUATED"


class TokenType(str, Enum):
    """JWT token type claim."""
    ACCESS = "ACCESS"
    REFRESH = "REFRESH"
    EMAIL_VERIFICATION = "EMAIL_VERIFICATION"
    PASSWORD_RESET = "PASSWORD_RESET"


class SecurityEventType(str, Enum):
    """Types of security events recorded in the audit log."""
    FAILED_LOGIN = "FAILED_LOGIN"
    ACCOUNT_LOCKED = "ACCOUNT_LOCKED"
    TOKEN_REVOKED = "TOKEN_REVOKED"
    SUSPICIOUS_IP = "SUSPICIOUS_IP"
    PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED"
    ROLE_CHANGED = "ROLE_CHANGED"
    ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED"
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILED = "LOGIN_FAILED"
    LOGIN_LOCKED = "LOGIN_LOCKED"
    LOGOUT = "LOGOUT"
    LOGOUT_ALL = "LOGOUT_ALL"
    TOKEN_REFRESHED = "TOKEN_REFRESHED"
    ACCOUNT_CREATED = "ACCOUNT_CREATED"
    ACCOUNT_REACTIVATED = "ACCOUNT_REACTIVATED"
    EMAIL_VERIFIED = "EMAIL_VERIFIED"
    VERIFICATION_EMAIL_RESENT = "VERIFICATION_EMAIL_RESENT"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"
    PASSWORD_RESET_COMPLETED = "PASSWORD_RESET_COMPLETED"
    SUSPICIOUS_LOGIN = "SUSPICIOUS_LOGIN"
    TOKEN_THEFT_DETECTED = "TOKEN_THEFT_DETECTED"
    TAB_SWITCH = "TAB_SWITCH"
    FULLSCREEN_EXIT = "FULLSCREEN_EXIT"
    COPY_ATTEMPT = "COPY_ATTEMPT"
    PASTE_ATTEMPT = "PASTE_ATTEMPT"


class SecurityEventSeverity(str, Enum):
    """Severity classification for security events."""
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"


class AssessmentType(str, Enum):
    """Assessment type classifications."""
    FORMATIVE = "FORMATIVE"
    CAT = "CAT"
    SUMMATIVE = "SUMMATIVE"
    HOMEWORK = "HOMEWORK"
    GROUP_WORK = "GROUP_WORK"
    REASSESSMENT = "REASSESSMENT"


class AssessmentStatus(str, Enum):
    """Assessment lifecycle status."""
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"
    ARCHIVED = "ARCHIVED"


class QuestionType(str, Enum):
    """Question type classifications."""
    MCQ = "MCQ"
    TRUE_FALSE = "TRUE_FALSE"
    SHORT_ANSWER = "SHORT_ANSWER"
    ESSAY = "ESSAY"
    MATCHING = "MATCHING"
    FILL_BLANK = "FILL_BLANK"
    COMPUTATIONAL = "COMPUTATIONAL"
    CASE_STUDY = "CASE_STUDY"
    ORDERING = "ORDERING"


class GradingMode(str, Enum):
    """How a question or assessment will be graded."""
    AUTO = "AUTO"
    SEMI = "SEMI"
    MANUAL = "MANUAL"
    RUBRIC = "RUBRIC"
    AI_ASSISTED = "AI_ASSISTED"


class SubmissionStatus(str, Enum):
    """Assessment attempt / submission status."""
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    AUTO_SUBMITTED = "AUTO_SUBMITTED"
    PENDING_GRADING = "PENDING_GRADING"
    AUTO_GRADED = "AUTO_GRADED"
    AI_SUGGESTED = "AI_SUGGESTED"
    LECTURER_REVIEWED = "LECTURER_REVIEWED"
    FINAL = "FINAL"
    GRADED = "GRADED"
    UNDER_REVIEW = "UNDER_REVIEW"
    RELEASED = "RELEASED"


class GradeStatus(str, Enum):
    """Grade/result release lifecycle status."""
    PENDING = "PENDING"
    AUTO_GRADED = "AUTO_GRADED"
    AI_SUGGESTED = "AI_SUGGESTED"
    AWAITING_REVIEW = "AWAITING_REVIEW"
    LECTURER_REVIEWED = "LECTURER_REVIEWED"
    FINAL = "FINAL"
    RELEASED = "RELEASED"
    UNDER_APPEAL = "UNDER_APPEAL"


class AppealStatus(str, Enum):
    """Appeal request status."""
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    REVISED = "REVISED"
    WITHDRAWN = "WITHDRAWN"


class NotificationChannel(str, Enum):
    """Supported notification delivery channels."""
    IN_APP = "IN_APP"
    EMAIL = "EMAIL"
    PUSH = "PUSH"
    BOTH = "BOTH"


class IntegrityEventType(str, Enum):
    """Browser-level integrity event types from the exam client."""
    FULLSCREEN_EXIT = "FULLSCREEN_EXIT"
    FULLSCREEN_ENTER = "FULLSCREEN_ENTER"
    TAB_SWITCH = "TAB_SWITCH"
    WINDOW_BLUR = "WINDOW_BLUR"
    WINDOW_FOCUS = "WINDOW_FOCUS"
    PAGE_HIDDEN = "PAGE_HIDDEN"
    COPY_ATTEMPT = "COPY_ATTEMPT"
    PASTE_ATTEMPT = "PASTE_ATTEMPT"
    RIGHT_CLICK = "RIGHT_CLICK"
    EXTENDED_INACTIVITY = "EXTENDED_INACTIVITY"
    RECONNECT = "RECONNECT"
    UNUSUAL_KEYPRESS = "UNUSUAL_KEYPRESS"


class RiskLevel(str, Enum):
    """Risk level for integrity events and student sessions."""
    NONE = "NONE"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AIAgentType(str, Enum):
    """AI agent type identifiers."""
    ASSESSMENT_GENERATOR = "ASSESSMENT_GENERATOR"
    GRADING_ASSISTANT = "GRADING_ASSISTANT"
    STUDY_SUPPORT = "STUDY_SUPPORT"
    INTEGRITY_ANALYZER = "INTEGRITY_ANALYZER"


class AIOutputStatus(str, Enum):
    """Status of an AI-generated output."""
    DRAFT = "DRAFT"
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EDITED_AND_APPROVED = "EDITED_AND_APPROVED"
