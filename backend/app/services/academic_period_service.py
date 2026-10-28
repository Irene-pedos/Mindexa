"""
app/services/academic_period_service.py

Academic periods (year / semester / trimester / quarter) for the admin "Academic Periods" screen.

Rules, all enforced here so the screen only has to show the message:
  - end date after start date, also when only one of the two is edited;
  - a name is unique within an institution (ignoring case and surrounding spaces);
  - two periods of the same type cannot overlap in time (a semester may sit inside a year,
    two semesters may not share days). Only checked when the dates or the type change, so
    switching a period on or off is never blocked by old data.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AlreadyExistsError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.db.models.academic import AcademicPeriod, Institution
from app.db.repositories.academic_structure_repo import AcademicStructureRepository
from app.db.schemas.academic import AcademicPeriodCreate
from app.schemas.academic_structure import AcademicPeriodItem, AcademicPeriodUpdate

logger = get_logger(__name__)


def _type_value(period_type: Any) -> str:
    return str(getattr(period_type, "value", period_type))


def _fmt(day: date) -> str:
    return day.strftime("%d %b %Y")


class AcademicPeriodService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = AcademicStructureRepository(db)

    async def list_periods(self, institution_id: uuid.UUID | None) -> list[AcademicPeriodItem]:
        return [AcademicPeriodItem(**row) for row in await self.repo.list_periods(institution_id)]

    async def create(self, body: AcademicPeriodCreate) -> AcademicPeriod:
        institution = await self.db.get(Institution, body.institution_id)
        if institution is None or institution.is_deleted:
            raise NotFoundError("Institution not found.")

        name = body.name.strip()
        await self._check_rules(
            body.institution_id,
            name=name,
            period_type=_type_value(body.period_type),
            start=body.start_date,
            end=body.end_date,
            exclude_id=None,
            check_overlap=True,
        )
        period = AcademicPeriod(
            institution_id=body.institution_id,
            name=name,
            period_type=body.period_type,
            start_date=body.start_date,
            end_date=body.end_date,
            is_active=body.is_active,
        )
        self.db.add(period)
        await self._commit(name)
        await self.db.refresh(period)
        logger.info(
            "academic_period_created",
            id=str(period.id),
            institution_id=str(period.institution_id),
        )
        return period

    async def update(self, period_id: uuid.UUID, body: AcademicPeriodUpdate) -> AcademicPeriod:
        period = await self.db.get(AcademicPeriod, period_id)
        if period is None or period.is_deleted:
            raise NotFoundError("Academic period not found.")

        changes = body.model_dump(exclude_unset=True)
        if changes.get("name") is None:
            changes.pop("name", None)  # a name can be changed but never cleared
        else:
            changes["name"] = changes["name"].strip()
        for required in ("period_type", "start_date", "end_date", "is_active"):
            if required in changes and changes[required] is None:
                changes.pop(required)

        name = changes.get("name", period.name)
        period_type = _type_value(changes.get("period_type", period.period_type))
        start = changes.get("start_date", period.start_date)
        end = changes.get("end_date", period.end_date)
        timing_changed = any(key in changes for key in ("period_type", "start_date", "end_date"))
        await self._check_rules(
            period.institution_id,
            name=name,
            period_type=period_type,
            start=start,
            end=end,
            exclude_id=period.id,
            check_overlap=timing_changed,
        )
        for field, value in changes.items():
            setattr(period, field, value)
        await self._commit(name)
        await self.db.refresh(period)
        logger.info("academic_period_updated", id=str(period.id), fields=sorted(changes))
        return period

    # ── helpers ───────────────────────────────────────────────────────────────

    async def _check_rules(
        self,
        institution_id: uuid.UUID,
        *,
        name: str,
        period_type: str,
        start: date,
        end: date,
        exclude_id: uuid.UUID | None,
        check_overlap: bool,
    ) -> None:
        if end <= start:
            raise ValidationError("The end date must be after the start date.")

        others = [p for p in await self.repo.live_periods(institution_id) if p.id != exclude_id]
        if any(p.name.strip().lower() == name.strip().lower() for p in others):
            raise AlreadyExistsError(
                detail=f"A period named '{name}' already exists for this institution."
            )
        if not check_overlap:
            return
        for other in others:
            if not other.is_active or _type_value(other.period_type) != period_type:
                continue
            if start <= other.end_date and other.start_date <= end:
                raise ValidationError(
                    f"These dates overlap '{other.name}' ({_fmt(other.start_date)} to "
                    f"{_fmt(other.end_date)}). Periods of the same type cannot overlap."
                )

    async def _commit(self, name: str) -> None:
        try:
            await self.db.commit()
        except IntegrityError as exc:  # a concurrent request took the same name
            await self.db.rollback()
            logger.info("academic_period_duplicate", name=name, error=str(exc.orig)[:160])
            raise AlreadyExistsError(
                detail=f"A period named '{name}' already exists for this institution."
            ) from exc
