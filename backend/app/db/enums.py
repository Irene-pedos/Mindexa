"""
app/db/enums.py

All SQLModel/SQLAlchemy-compatible enum definitions for Mindexa Platform.
"""

from enum import Enum


class UserRole(str, Enum):
    STUDENT = "student"
    LECTURER = "lecturer"
    ADMIN = "admin"


class UserStatus(str, Enum):
    PENDING_VERIFICATION = "pending_verification"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    INACTIVE = "inactive"


class TokenType(str, Enum):
    ACCESS = "access"
    REFRESH = "refresh"
    EMAIL_VERIFICATION = "email_verification"
    PASSWORD_RESET = "password_reset"


class AcademicPeriodType(str, Enum):
    SEMESTER = "semester"
    TRIMESTER = "trimester"
    QUARTER = "quarter"
    YEAR = "year"


class LecturerAssignmentRole(str, Enum):
    PRIMARY = "primary"
    ASSISTANT = "assistant"
    SUPERVISOR = "supervisor"


class EnrollmentStatus(str, Enum):
    ACTIVE = "active"
    WITHDRAWN = "withdrawn"
    COMPLETED = "completed"
    DEFERRED = "deferred"


class AssessmentType(str, Enum):
    FORMATIVE = "formative"
    CAT = "cat"
    SUMMATIVE = "summative"
    HOMEWORK = "homework"
    GROUP_WORK = "group_work"
    REASSESSMENT = "reassessment"


class AssessmentStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"
    CANCELLED = "cancelled"


class GradingMode(str, Enum):
    AUTO = "auto"
    SEMI_AUTO = "semi_auto"
    MANUAL = "manual"
    AI_ASSISTED = "ai_assisted"
    HYBRID = "hybrid"


class ResultReleaseMode(str, Enum):
    IMMEDIATE = "immediate"
    DELAYED = "delayed"
    SCHEDULED = "scheduled"


class SupervisorRole(str, Enum):
    PRIMARY = "primary"
    ASSISTANT = "assistant"


class BlueprintRuleType(str, Enum):
    TOTAL_QUESTIONS = "total_questions"
    EXACT_QUESTIONS = "exact_questions"
    MARKS_TOTAL = "marks_total"
    DIFFICULTY_RATIO = "difficulty_ratio"
    DIFFICULTY_DISTRIBUTION = "difficulty_distribution"
    QUESTION_TYPE_REQUIRED = "question_type_required"
    QUESTION_TYPE_EXCLUDED = "question_type_excluded"
    QUESTION_TYPE_DISTRIBUTION = "question_type_distribution"
    BLOOM_LEVEL_REQUIRED = "bloom_level_required"
    BLOOM_DISTRIBUTION = "bloom_distribution"
    TIME_ESTIMATE = "time_estimate"
    MARKS_DISTRIBUTION = "marks_distribution"
    SECTION_MARKS = "section_marks"
    TOPIC_COVERAGE = "topic_coverage"

    @classmethod
    def all_types(cls) -> set[str]:
        return {member.value for member in cls}


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


class QuestionSourceType(str, Enum):
    MANUAL = "manual"
    AI_GENERATED = "ai_generated"
    ASSESSMENT_AUTO_SAVED = "assessment_auto_saved"
    IMPORTED = "imported"


class QuestionAddedVia(str, Enum):
    MANUAL_WRITE = "manual_write"
    BANK_INSERT = "bank_insert"
    AI_GENERATED_ACCEPTED = "ai_generated_accepted"
    AI_GENERATED_MODIFIED = "ai_generated_modified"


class AIActionType(str, Enum):
    QUESTION_GENERATION = "question_generation"
    GRADING_SUGGESTION = "grading_suggestion"
    RUBRIC_SUGGESTION = "rubric_suggestion"
    STUDY_SUPPORT = "study_support"
    EMBEDDING = "embedding"
    INTEGRITY_ANALYSIS = "integrity_analysis"
    ASSESSMENT_DRAFT = "assessment_draft"
    FEEDBACK_DRAFT = "feedback_draft"


class AIActionStatus(str, Enum):
    INITIATED = "initiated"
    COMPLETED = "completed"
    FAILED = "failed"
    RATE_LIMITED = "rate_limited"


class AIBatchStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    PARTIAL_FAILURE = "partial_failure"
    FAILED = "failed"


class AIQuestionDecision(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    MODIFIED = "modified"
    REJECTED = "rejected"
    APPROVED = "accepted"
    EDITED = "modified"
    NEEDS_REVISION = "needs_revision"


class AIGradeDecision(str, Enum):
    PENDING = "pending"
    SUGGESTED = "suggested"
    ACCEPTED = "accepted"
    MODIFIED = "modified"
    REJECTED = "rejected"
    NOT_APPLICABLE = "not_applicable"


class SubmissionStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    AUTO_SUBMITTED = "auto_submitted"
    PENDING_GRADING = "pending_grading"
    AUTO_GRADED = "auto_graded"
    AI_SUGGESTED = "ai_suggested"
    LECTURER_REVIEWED = "lecturer_reviewed"
    FINAL = "final"
    GRADED = "graded"
    UNDER_REVIEW = "under_review"
    RELEASED = "released"


class SubmissionAnswerType(str, Enum):
    TEXT = "text"
    SINGLE_OPTION = "single_option"
    MULTI_OPTION = "multi_option"
    ORDERED_LIST = "ordered_list"
    MATCH_PAIRS = "match_pairs"
    FILL_BLANKS = "fill_blanks"
    FILE = "file"


class AttemptStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    SUBMITTED = "submitted"
    AUTO_SUBMITTED = "auto_submitted"
    TIMED_OUT = "timed_out"
    ABANDONED = "abandoned"
    FLAGGED = "flagged"


class SubmissionGradingMode(str, Enum):
    AUTO = "auto"
    AI_ASSISTED = "ai_assisted"
    MANUAL = "manual"
    HYBRID = "hybrid"


class GradeStatus(str, Enum):
    PENDING = "pending"
    AUTO_GRADED = "auto_graded"
    AI_SUGGESTED = "ai_suggested"
    AWAITING_REVIEW = "awaiting_review"
    LECTURER_REVIEWED = "lecturer_reviewed"
    FINAL = "final"
    RELEASED = "released"
    UNDER_APPEAL = "under_appeal"


class GradingQueueStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class GradingQueuePriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class AppealStatus(str, Enum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    RESOLVED_UPHELD = "resolved_upheld"
    RESOLVED_REJECTED = "resolved_rejected"
    WITHDRAWN = "withdrawn"


class IntegrityEventType(str, Enum):
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
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


IntegrityRiskLevel = RiskLevel


class WarningLevel(str, Enum):
    WARNING_1 = "warning_1"
    WARNING_2 = "warning_2"
    WARNING_3 = "warning_3"


class SecurityEventType(str, Enum):
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILED = "login_failed"
    LOGIN_LOCKED = "login_locked"
    LOGOUT = "logout"
    LOGOUT_ALL = "logout_all"
    TOKEN_REFRESHED = "token_refreshed"
    TOKEN_THEFT_DETECTED = "token_theft_detected"
    ACCOUNT_CREATED = "account_created"
    ACCOUNT_SUSPENDED = "account_suspended"
    ACCOUNT_REACTIVATED = "account_reactivated"
    EMAIL_VERIFIED = "email_verified"
    VERIFICATION_EMAIL_RESENT = "verification_email_resent"
    PASSWORD_CHANGED = "password_changed"
    PASSWORD_RESET_REQUESTED = "password_reset_requested"
    PASSWORD_RESET_COMPLETED = "password_reset_completed"
    SUSPICIOUS_LOGIN = "suspicious_login"


class SecurityEventSeverity(str, Enum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class NotificationChannel(str, Enum):
    IN_APP = "in_app"
    EMAIL = "email"
    PUSH = "push"


class NotificationType(str, Enum):
    ASSESSMENT_AVAILABLE = "assessment_available"
    RESULT_RELEASED = "result_released"
    DEADLINE_REMINDER = "deadline_reminder"
    SUBMISSION_RECEIVED = "submission_received"
    GRADING_COMPLETE = "grading_complete"
    APPEAL_UPDATE = "appeal_update"
    INTEGRITY_ALERT = "integrity_alert"
    SYSTEM_ANNOUNCEMENT = "system_announcement"


class ScheduledEventType(str, Enum):
    ASSESSMENT_WINDOW = "assessment_window"
    HOMEWORK_DEADLINE = "homework_deadline"
    RESULT_RELEASE = "result_release"
    REASSESSMENT_WINDOW = "reassessment_window"
    REVIEW_WINDOW = "review_window"


class AIAgentType(str, Enum):
    ASSESSMENT_GENERATOR = "assessment_generator"
    GRADING_ASSISTANT = "grading_assistant"
    STUDY_SUPPORT = "study_support"
    INTEGRITY_ANALYZER = "integrity_analyzer"


class AIOutputStatus(str, Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    EDITED_AND_APPROVED = "edited_and_approved"


class ResultLetterGrade(str, Enum):
    A_PLUS = "A+"
    A = "A"
    A_MINUS = "A-"
    B_PLUS = "B+"
    B = "B"
    B_MINUS = "B-"
    C_PLUS = "C+"
    C = "C"
    C_MINUS = "C-"
    D = "D"
    F = "F"


class ResourceCategory(str, Enum):
    LECTURE_NOTES = "lecture_notes"
    PAST_PAPER = "past_paper"
    TEXTBOOK_EXCERPT = "textbook_excerpt"
    ASSIGNMENT = "assignment"
    GENERAL = "general"


class ResourceProcessingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class IntegrityFlagStatus(str, Enum):
    OPEN = "open"
    UNDER_REVIEW = "under_review"
    CONFIRMED = "confirmed"
    DISMISSED = "dismissed"
    ESCALATED = "escalated"


class IntegrityFlagRaisedBy(str, Enum):
    SYSTEM = "system"
    SUPERVISOR = "supervisor"
    ADMIN = "admin"


class SupervisionSessionStatus(str, Enum):
    ACTIVE = "active"
    ENDED = "ended"
