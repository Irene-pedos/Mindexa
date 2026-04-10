"""
app/db/repositories/base.py

Generic async repository base class.

Every model-specific repository inherits from BaseRepository and gets
standard CRUD operations for free. Additional queries are added in subclasses.

Rules:
  - All queries filter is_deleted == False by default
  - Pagination is enforced — no unbounded queries
  - Repositories never call commit() — that belongs to get_db or Celery tasks
  - soft_delete() is the only permitted deletion operation
"""

from __future__ import annotations

import uuid
from typing import Any, Generic, TypeVar

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.core.exceptions import NotFoundError
from app.db.base import BaseModel

ModelType = TypeVar("ModelType", bound=BaseModel)


class PaginatedResult(Generic[ModelType]):
    """Typed container for paginated query results."""

    __slots__ = ("items", "total", "page", "page_size", "total_pages")

    def __init__(
        self,
        items: list[ModelType],
        total: int,
        page: int,
        page_size: int,
    ) -> None:
        self.items = items
        self.total = total
        self.page = page
        self.page_size = page_size
        self.total_pages = max(1, (total + page_size - 1) // page_size)

    @property
    def has_next(self) -> bool:
        return self.page < self.total_pages

    @property
    def has_previous(self) -> bool:
        return self.page > 1


class BaseRepository(Generic[ModelType]):
    """
    Generic async repository.

    Usage:
        class UserRepository(BaseRepository[User]):
            def __init__(self, db: AsyncSession) -> None:
                super().__init__(User, db)

            async def get_by_email(self, email: str) -> User | None:
                result = await self.db.execute(
                    select(User).where(
                        User.email == email,
                        User.is_deleted == False,
                    )
                )
                return result.scalar_one_or_none()
    """

    def __init__(self, model: type[ModelType], db: AsyncSession) -> None:
        self.model = model
        self.db = db

    # ── Read ──────────────────────────────────────────────────────────────────

    async def get_by_id(
        self,
        record_id: uuid.UUID,
        *,
        include_deleted: bool = False,
    ) -> ModelType | None:
        """Return a single record by PK, or None if not found."""
        query = select(self.model).where(self.model.id == record_id)
        if not include_deleted:
            query = query.where(self.model.is_deleted == False)  # noqa: E712
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_id_or_raise(
        self,
        record_id: uuid.UUID,
        *,
        include_deleted: bool = False,
    ) -> ModelType:
        """Return a single record by PK, or raise NotFoundError."""
        record = await self.get_by_id(record_id, include_deleted=include_deleted)
        if record is None:
            raise NotFoundError(
                resource=self.model.__name__,
                resource_id=str(record_id),
            )
        return record

    async def get_all(
        self,
        *,
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
        order_by: Any = None,
    ) -> PaginatedResult[ModelType]:
        """Fetch all non-deleted records with mandatory pagination."""
        page_size = min(page_size, MAX_PAGE_SIZE)
        offset = (page - 1) * page_size

        count_result = await self.db.execute(
            select(func.count())
            .select_from(self.model)
            .where(self.model.is_deleted == False)  # noqa: E712
        )
        total = count_result.scalar_one()

        data_query = (
            select(self.model)
            .where(self.model.is_deleted == False)  # noqa: E712
            .offset(offset)
            .limit(page_size)
        )
        if order_by is not None:
            data_query = data_query.order_by(order_by)
        else:
            data_query = data_query.order_by(self.model.created_at.desc())

        data_result = await self.db.execute(data_query)
        items = list(data_result.scalars().all())

        return PaginatedResult(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
        )

    async def exists(self, record_id: uuid.UUID) -> bool:
        """Return True if a non-deleted record with this ID exists."""
        result = await self.db.execute(
            select(func.count())
            .select_from(self.model)
            .where(
                self.model.id == record_id,
                self.model.is_deleted == False,  # noqa: E712
            )
        )
        return (result.scalar_one() or 0) > 0

    async def count(self, *, include_deleted: bool = False) -> int:
        """Return total row count."""
        query = select(func.count()).select_from(self.model)
        if not include_deleted:
            query = query.where(self.model.is_deleted == False)  # noqa: E712
        result = await self.db.execute(query)
        return result.scalar_one() or 0

    # ── Write ─────────────────────────────────────────────────────────────────

    async def create(self, obj_in: ModelType) -> ModelType:
        """
        Persist a new record.
        Does NOT commit — the caller's session handles that.
        """
        self.db.add(obj_in)
        await self.db.flush()
        await self.db.refresh(obj_in)
        return obj_in

    async def update(
        self,
        record: ModelType,
        update_data: dict[str, Any],
    ) -> ModelType:
        """
        Apply a partial update. Only fields in update_data are changed.
        Does NOT commit.
        """
        for field, value in update_data.items():
            if hasattr(record, field):
                setattr(record, field, value)
        self.db.add(record)
        await self.db.flush()
        await self.db.refresh(record)
        return record

    async def soft_delete(self, record: ModelType) -> ModelType:
        """
        Mark a record as deleted.
        This is the ONLY permitted deletion on this platform.
        Does NOT commit.
        """
        record.soft_delete()
        self.db.add(record)
        await self.db.flush()
        return record

    async def bulk_create(self, objects: list[ModelType]) -> list[ModelType]:
        """Persist multiple records in a single flush."""
        for obj in objects:
            self.db.add(obj)
        await self.db.flush()
        for obj in objects:
            await self.db.refresh(obj)
        return objects
