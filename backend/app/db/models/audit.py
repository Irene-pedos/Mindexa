"""
app/db/models/audit.py

Audit log and security event models for Mindexa.

Tables defined here:
    audit_log       — Immutable record of every significant platform action
    security_event  — Immutable record of authentication and security incidents

Both tables use AppendOnlyModel. They are the permanent compliance backbone
of the platform. No row is ever deleted from either table.

Architectural principles:

    1. AUDIT LOG captures WHAT happened to ACADEMIC DATA.
       Every create, update, or delete on a sensitive academic object
       (assessment, grade, enrollment, user role) writes an audit_log row.
       The audit log answers: "Who changed this, when, and what did they change?"

    2. SECURITY EVENT captures WHAT happened to AUTHENTICATION.
       Login attempts, token invalidations, role changes, password resets,
       and suspicious auth patterns write security_event rows.
       The security log answers: "Was this account compromised, and when?"

    3. BOTH are completely separate from the application data model.
       They do not reference other tables via declared foreign keys.
       All references are plain UUIDs. This means:
           - They can never block deletion of other records via FK constraints
           - They can be queried independently of application table state
           - They survive even if the referenced rows are soft-deleted
           - They can be archived to cold storage without breaking the app

    4. BOTH are written by the service layer, not by route handlers.
       Route handlers call services. Services write audit rows as part of
       their operation (within the same transaction for audit_log, or
       as a fire-and-forget for security_event via Celery).

Import order safety:
    This file imports from:
        app.db.base    → AppendOnlyModel
        app.db.enums   → SecurityEventType, SecurityEventSeverity
        app.db.mixins  → composite_index

    NO TYPE_CHECKING imports. NO foreign keys. Maximum import safety.
    This file can be imported first in alembic/env.py with zero risk.
"""

import uuid
from typing import Optional

from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field

from app.db.base import AppendOnlyModel
from app.db.enums import SecurityEventSeverity, SecurityEventType
from app.db.mixins import composite_index

# ─────────────────────────────────────────────────────────────────────────────
# AUDIT LOG
# ─────────────────────────────────────────────────────────────────────────────

class AuditLog(AppendOnlyModel, table=True):
    """
    Immutable record of every significant platform action.

    Written by service layer methods whenever a sensitive operation succeeds.
    Never written on read-only operations.

    Inherits AppendOnlyModel:
        - id (UUID PK) + created_at only
        - NO updated_at, NO soft delete, NO mutations ever

    Coverage targets (non-exhaustive):
        Academic data mutations:
            - Assessment created / published / cancelled
            - Question added to / removed from assessment
            - Grade created / modified / released
            - Grade appeal opened / resolved
            - Rubric created / modified
            - Student enrollment created / withdrawn

        Administrative mutations:
            - User created / deactivated
            - Role assignment changed
            - Lecturer assigned to / removed from course
            - Institution or department modified

        AI-relevant decisions:
            - AI question accepted / rejected by lecturer
            - AI grade accepted / modified / rejected
            - Assessment published after AI review complete

    actor_id:
        The user who performed the action. NULL for system-triggered events.

    entity_type / entity_id:
        What was affected. Polymorphic — no FK declared.
        Examples:
            entity_type = "assessment", entity_id = <uuid>
            entity_type = "submission_grade", entity_id = <uuid>
            entity_type = "student_enrollment", entity_id = <uuid>

    action:
        A short verb-noun string describing the operation.
        Use a consistent vocabulary: "created", "updated", "deleted",
        "published", "released", "approved", "rejected", "enrolled",
        "withdrawn", "flagged", "resolved".

    before_state / after_state (JSONB):
        Snapshots of the entity's relevant fields before and after the change.
        NOT the full row dump — only the fields that changed.
        NULL for create operations (no before_state).
        NULL for delete operations (no after_state).
        Example for a grade change:
            before_state: {"final_marks": 72, "submission_status": "ai_suggested"}
            after_state:  {"final_marks": 78, "submission_status": "lecturer_reviewed"}

    ip_address:
        The IP address of the actor's request. NULL for Celery task actions.

    request_id:
        The unique request ID from the request context middleware.
        Allows correlating audit rows with application logs.
    """

    __tablename__ = "audit_log"

    __table_args__ = (
        # Primary: all actions on a specific entity
        composite_index("audit_log", "entity_type", "entity_id"),
        # Actor history: everything a user has done
        composite_index("audit_log", "actor_id", "created_at"),
        # Action type analysis
        composite_index("audit_log", "action", "created_at"),
        # Time-range queries for compliance reports
        composite_index("audit_log", "created_at"),
    )

    # ── Actor ─────────────────────────────────────────────────────────────────

    actor_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    actor_role: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=20,
    )

    # ── Subject ───────────────────────────────────────────────────────────────

    entity_type: str = Field(nullable=False, max_length=50, index=True)
    entity_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )

    # ── Action ────────────────────────────────────────────────────────────────

    action: str = Field(nullable=False, max_length=50, index=True)
    description: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
        # Human-readable description for audit reports.
    )

    # ── State snapshots ───────────────────────────────────────────────────────

    before_state: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    after_state: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )

    # ── Request context ───────────────────────────────────────────────────────

    ip_address: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=45,
    )
    request_id: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=36,
        # UUID string of the request (from X-Request-ID header or generated).
    )
    user_agent: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=300,
    )


# ─────────────────────────────────────────────────────────────────────────────
# SECURITY EVENT
# ─────────────────────────────────────────────────────────────────────────────

class SecurityEvent(AppendOnlyModel, table=True):
    """
    Immutable record of authentication and security incidents.

    Covers all security-relevant events on the platform:
        - Successful and failed login attempts
        - Token issuance, rotation, and revocation
        - Password changes and reset flows
        - Account lockout triggers and unlocks
        - Role assignment changes
        - Suspicious activity patterns

    Inherits AppendOnlyModel.

    event_type (SecurityEventType enum):
        LOGIN_SUCCESS       → Successful login
        LOGIN_FAILED        → Failed login (wrong password)
        LOGIN_LOCKED        → Account locked after max failed attempts
        LOGOUT              → Explicit logout
        TOKEN_ISSUED        → New access/refresh token pair issued
        TOKEN_REFRESHED     → Access token refreshed using refresh token
        TOKEN_REVOKED       → Refresh token explicitly revoked
        TOKEN_EXPIRED       → Token used after expiry (rejected)
        TOKEN_INVALID       → Malformed or tampered token detected
        PASSWORD_CHANGED    → User changed their password
        PASSWORD_RESET_REQUESTED → Password reset email triggered
        PASSWORD_RESET_USED → Password reset link used successfully
        ROLE_CHANGED        → User's role was modified by an admin
        ACCOUNT_CREATED     → New user account registered
        ACCOUNT_DEACTIVATED → Account soft-deleted or suspended
        SUSPICIOUS_ACTIVITY → Pattern-based security alert

    severity (SecurityEventSeverity enum):
        INFO     → Normal security flow (login, token refresh)
        WARNING  → Potentially suspicious (failed login, expired token)
        CRITICAL → Definite security concern (account locked, invalid token)

    user_id:
        The user the event relates to. NULL for events where the user is
        not yet known (e.g. failed login with unknown email).

    ip_address / user_agent:
        Captured from every security-relevant request.
        Used for geolocation analysis and device fingerprinting.

    details (JSONB):
        Structured supplementary data specific to the event type.
        Examples:
            LOGIN_FAILED:    {"attempt_count": 3, "email_used": "x@y.com"}
            ROLE_CHANGED:    {"old_role": "student", "new_role": "lecturer",
                              "changed_by": "<admin_uuid>"}
            TOKEN_INVALID:   {"reason": "signature_mismatch", "jti": "..."}
        NULL for simple events with no supplementary data.
    """

    __tablename__ = "security_event"

    __table_args__ = (
        # Primary: all security events for a user
        composite_index("security_event", "user_id", "created_at"),
        # Event type monitoring
        composite_index("security_event", "event_type", "created_at"),
        # Severity alerts
        composite_index("security_event", "severity", "created_at"),
        # IP-based analysis (geolocation, rate limiting detection)
        composite_index("security_event", "ip_address", "event_type"),
    )

    # ── Event identity ────────────────────────────────────────────────────────

    event_type: SecurityEventType = Field(nullable=False, index=True)
    severity: SecurityEventSeverity = Field(nullable=False, index=True)

    # ── Subject ───────────────────────────────────────────────────────────────

    # Plain UUID — NULL for unknown-user events
    user_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )

    # ── Request context ───────────────────────────────────────────────────────

    ip_address: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=45,
        index=True,
    )
    user_agent: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=300,
    )
    request_id: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=36,
    )

    # ── Details ───────────────────────────────────────────────────────────────

    details: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    description: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
    )
