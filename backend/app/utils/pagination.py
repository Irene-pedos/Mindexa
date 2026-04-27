"""
app/utils/pagination.py

Reusable pagination schemas and FastAPI dependency.
All list endpoints must return paginated responses — never unbounded lists.
"""

from __future__ import annotations

from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel, Field

from app.core.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE

T = TypeVar("T")


class PaginationParams:
    """
    FastAPI dependency for pagination query parameters.

    Usage:
        @router.get("/")
        async def list_items(pagination: PaginationParams = Depends()):
            results = await repo.get_all(
                page=pagination.page,
                page_size=pagination.page_size,
            )
    """

    def __init__(
        self,
        page: int = Query(default=1, ge=1, description="Page number (1-based)"),
        page_size: int = Query(
            default=DEFAULT_PAGE_SIZE,
            ge=MIN_PAGE_SIZE,
            le=MAX_PAGE_SIZE,
            alias="pageSize",
            description=f"Items per page (max {MAX_PAGE_SIZE})",
        ),
    ) -> None:
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class PageMeta(BaseModel):
    """Metadata block included in every paginated response."""

    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., alias="pageSize")
    total: int = Field(..., description="Total matching items")
    total_pages: int = Field(..., alias="totalPages")
    has_next: bool = Field(..., alias="hasNext")
    has_previous: bool = Field(..., alias="hasPrevious")

    model_config = {"populate_by_name": True}


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Standard paginated response envelope used by all list endpoints.

    Shape:
    {
        "items": [...],
        "meta": {
            "page": 1,
            "pageSize": 20,
            "total": 150,
            "totalPages": 8,
            "hasNext": true,
            "hasPrevious": false
        }
    }
    """

    items: list[T]
    meta: PageMeta

    @classmethod
    def from_result(cls, result: object) -> PaginatedResponse[T]:
        """Build from a BaseRepository.PaginatedResult."""
        return cls(
            items=result.items,  # type: ignore[attr-defined]
            meta=PageMeta(
                page=result.page,  # type: ignore[attr-defined]
                pageSize=result.page_size,  # type: ignore[attr-defined]
                total=result.total,  # type: ignore[attr-defined]
                totalPages=result.total_pages,  # type: ignore[attr-defined]
                hasNext=result.has_next,  # type: ignore[attr-defined]
                hasPrevious=result.has_previous,  # type: ignore[attr-defined]
            ),
        )
