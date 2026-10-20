"""Phase 4: Authoring, delegation, and post-approval edits

Revision ID: 20261014_p4_authoring
Revises: 20261013_p3_moderation
Create Date: 2026-10-14 09:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261014_p4_authoring"
down_revision: Union[str, None] = "20261013_p3_moderation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        for n_type in [
            "COLLABORATOR_ADDED",
            "DELEGATION_CREATED",
            "POST_APPROVAL_EDIT",
            "SEAL_SUPERSEDED",
            "ASSESSMENT_UPDATE_NOTICE",
        ]:
            op.execute(f"ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS '{n_type}'")

    # 1. Native PostgreSQL enums for Phase 4
    collaborator_role = postgresql.ENUM(
        "OWNER", "CO_AUTHOR", name="collaboratorrole", create_type=False
    )
    collaborator_role.create(bind, checkfirst=True)

    delegation_status = postgresql.ENUM(
        "ACTIVE", "REVOKED", "EXPIRED", name="delegationstatus", create_type=False
    )
    delegation_status.create(bind, checkfirst=True)

    # 2. assessment_collaborator table
    op.create_table(
        "assessment_collaborator",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "assessment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "lecturer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "role",
            collaborator_role,
            nullable=False,
            server_default="CO_AUTHOR",
        ),
        sa.Column(
            "added_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.UniqueConstraint(
            "assessment_id",
            "lecturer_id",
            name="uq_assessment_collaborator_assessment_lecturer",
        ),
    )
    op.create_index(
        "ix_assessment_collaborator_assessment_id_is_active",
        "assessment_collaborator",
        ["assessment_id", "is_active"],
    )
    op.create_index(
        "ix_assessment_collaborator_lecturer_id_is_active",
        "assessment_collaborator",
        ["lecturer_id", "is_active"],
    )

    # 3. author_delegation table
    op.create_table(
        "author_delegation",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "assessment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "delegator_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "delegate_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            delegation_status,
            nullable=False,
            server_default="ACTIVE",
            index=True,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "revoked_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        "ix_author_delegation_assessment_id_status",
        "author_delegation",
        ["assessment_id", "status"],
    )
    op.create_index(
        "ix_author_delegation_delegate_id_status",
        "author_delegation",
        ["delegate_id", "status"],
    )
    op.create_index(
        "ix_author_delegation_valid_from_valid_to",
        "author_delegation",
        ["valid_from", "valid_to"],
    )

    # 4. Add post-approval edit superseding columns to assessment_seal
    op.add_column(
        "assessment_seal",
        sa.Column("is_superseded", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "assessment_seal",
        sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "assessment_seal",
        sa.Column("superseded_by_version_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "assessment_seal",
        sa.Column("reprint_required", sa.Boolean(), nullable=True),
    )
    op.create_index(
        "ix_assessment_seal_superseded_at",
        "assessment_seal",
        ["superseded_at"],
    )

    # 5. Add acting_under_delegation_id to audit_log
    op.add_column(
        "audit_log",
        sa.Column("acting_under_delegation_id", postgresql.UUID(as_uuid=True), nullable=True),
    )


def downgrade() -> None:
    # 1. Remove column from audit_log
    op.drop_column("audit_log", "acting_under_delegation_id")

    # 2. Remove columns from assessment_seal
    op.drop_index("ix_assessment_seal_superseded_at", table_name="assessment_seal")
    op.drop_column("assessment_seal", "reprint_required")
    op.drop_column("assessment_seal", "superseded_by_version_id")
    op.drop_column("assessment_seal", "superseded_at")
    op.drop_column("assessment_seal", "is_superseded")

    # 3. Drop author_delegation table
    op.drop_index("ix_author_delegation_valid_from_valid_to", table_name="author_delegation")
    op.drop_index("ix_author_delegation_delegate_id_status", table_name="author_delegation")
    op.drop_index("ix_author_delegation_assessment_id_status", table_name="author_delegation")
    op.drop_table("author_delegation")

    # 4. Drop assessment_collaborator table
    op.drop_index("ix_assessment_collaborator_lecturer_id_is_active", table_name="assessment_collaborator")
    op.drop_index("ix_assessment_collaborator_assessment_id_is_active", table_name="assessment_collaborator")
    op.drop_table("assessment_collaborator")

    # 5. Drop native enums
    bind = op.get_bind()
    delegation_status = postgresql.ENUM(name="delegationstatus")
    delegation_status.drop(bind, checkfirst=True)

    collaborator_role = postgresql.ENUM(name="collaboratorrole")
    collaborator_role.drop(bind, checkfirst=True)
