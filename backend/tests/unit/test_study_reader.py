"""
tests/unit/test_study_reader.py

Unit tests for Study Reader:
- Annotation rect normalization & schema
- Study Support Agent prompt inclusion of selected_text
- Service authorization and export logic
"""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.agents.student_support_agent import StudySupportAgent
from app.core.ai.gateway import AIGateway
from app.core.exceptions import AuthorizationError, NotFoundError
from app.schemas.study_reader import (
    AnnotationCreate,
    AnnotationRect,
    AnnotationUpdate,
    KeyPointCreate,
    ReadingProgressUpdate,
)
from app.services.study_reader_service import StudyReaderService


class FakeGateway:
    def __init__(self, answer: str = "Test answer"):
        self.answer = answer
        self.called_with_messages = []

    async def complete(self, request, **kwargs):
        self.called_with_messages.append(request.messages)
        mock_resp = MagicMock()
        mock_resp.content = self.answer
        return mock_resp


def test_annotation_rect_schema_validation():
    rect = AnnotationRect(x=0.1, y=0.2, w=0.5, h=0.05, page=1)
    assert rect.x == 0.1
    assert rect.y == 0.2
    assert rect.w == 0.5
    assert rect.h == 0.05
    assert rect.page == 1

    ann_create = AnnotationCreate(
        page_number=1,
        color="key_idea",
        selected_text="Normalized database architecture",
        rects=[rect],
        note_text="Important concept",
    )
    assert ann_create.page_number == 1
    assert ann_create.color == "key_idea"
    assert len(ann_create.rects) == 1


def test_study_support_agent_includes_selected_text_in_prompt():
    gateway = FakeGateway("Sample response")
    agent = StudySupportAgent(gateway)

    prompt = agent._build_user_prompt(
        question="Explain this concept",
        context="Database normalization is the process of structuring a relational database...",
        fallback=False,
        selected_text="relational database normalization",
        current_page=5,
    )

    assert "Student Question:\nExplain this concept" in prompt
    assert "[STUDENT HIGHLIGHTED EXCERPT (Page 5)]:" in prompt
    assert "relational database normalization" in prompt
    assert "address that excerpt first" in prompt


@pytest.mark.asyncio
async def test_study_reader_assert_access_unauthorized_personal_resource():
    mock_db = AsyncMock()
    service = StudyReaderService(mock_db)

    # Mock finding a resource owned by student A
    mock_resource = MagicMock()
    mock_resource.id = uuid.uuid4()
    mock_resource.student_id = uuid.uuid4() # Student A
    mock_resource.is_deleted = False

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_resource
    mock_db.execute.return_value = mock_result

    # Student B attempts to access
    student_b_id = uuid.uuid4()
    with pytest.raises(AuthorizationError):
        await service.assert_access(student_b_id, "student_resource", mock_resource.id)


@pytest.mark.asyncio
async def test_study_reader_export_revision_sheet_formatting():
    mock_db = AsyncMock()
    service = StudyReaderService(mock_db)

    # Mock assert_access
    source_id = uuid.uuid4()
    student_id = uuid.uuid4()
    service.assert_access = AsyncMock(return_value=("Distributed Systems Lecture 1", {}))

    from datetime import datetime, UTC
    from app.schemas.study_reader import KeyPointResponse, AnnotationResponse

    kp_mock = KeyPointResponse(
        id=uuid.uuid4(),
        student_id=student_id,
        source_kind="lecturer_material",
        source_id=source_id,
        title="CAP Theorem",
        quote="Consistency, Availability, Partition tolerance",
        page_number=4,
        tag="definition",
        confidence="got_it",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    ann_mock = AnnotationResponse(
        id=uuid.uuid4(),
        student_id=student_id,
        source_kind="lecturer_material",
        source_id=source_id,
        page_number=4,
        color="key_idea",
        selected_text="A distributed system can only provide two of the three guarantees.",
        rects=[],
        note_text="Crucial for midterms",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    service.list_key_points = AsyncMock(return_value=[kp_mock])
    service.list_annotations = AsyncMock(return_value=[ann_mock])

    export = await service.export_revision_sheet(student_id, "lecturer_material", source_id)
    assert "Revision Sheet: Distributed Systems Lecture 1" in export.markdown
    assert "CAP Theorem" in export.markdown
    assert "Crucial for midterms" in export.markdown
    assert "p. 4" in export.markdown


@pytest.mark.asyncio
async def test_personal_resource_focus_no_exam_mapping():
    mock_db = AsyncMock()
    service = StudyReaderService(mock_db)

    source_id = uuid.uuid4()
    student_id = uuid.uuid4()
    service.assert_access = AsyncMock(return_value=("My Notes.pdf", {"workspace_id": None}))

    # Personal resource has 1 lost key point on page 2
    from app.db.models.study_reader import StudentMaterialKeyPoint
    lost_kp = StudentMaterialKeyPoint(
        id=uuid.uuid4(),
        student_id=student_id,
        source_kind="student_resource",
        source_id=source_id,
        title="Complex Formula",
        page_number=2,
        tag="formula",
        confidence="lost",
    )
    service.repo.list_key_points = AsyncMock(return_value=[lost_kp])
    service.repo.list_annotations = AsyncMock(return_value=[])
    service.repo.list_due_spaced_reviews = AsyncMock(return_value=[lost_kp])

    focus = await service.get_focus(student_id, "student_resource", source_id)

    assert focus.exam_mapping is False
    assert len(focus.heatmap) == 1
    assert focus.heatmap[0].page_number == 2
    assert focus.heatmap[0].heat > 0.0
    assert len(focus.spaced_reviews) == 1


@pytest.mark.asyncio
async def test_page_check_submission_and_scoring():
    mock_db = AsyncMock()
    service = StudyReaderService(mock_db)

    source_id = uuid.uuid4()
    student_id = uuid.uuid4()
    service.assert_access = AsyncMock(return_value=("Chapter 1.pdf", {}))

    from app.schemas.study_reader import PageCheckSubmitRequest, PageCheckAnswerItem
    from app.db.models.study_reader import StudentMaterialKeyPoint

    mock_kp = StudentMaterialKeyPoint(
        id=uuid.uuid4(),
        student_id=student_id,
        source_kind="lecturer_material",
        source_id=source_id,
        title="Page Check Review: Page 3",
        page_number=3,
        tag="exam_likely",
        confidence="lost",
    )
    service.repo.create_key_point = AsyncMock(return_value=mock_kp)

    # Student answers 1 correctly out of 2 (50% < 70% passing)
    req = PageCheckSubmitRequest(
        page_number=3,
        answers=[
            PageCheckAnswerItem(question_id="q1", selected_option_index=0),
            PageCheckAnswerItem(question_id="q2", selected_option_index=2), # incorrect
        ],
    )

    result = await service.submit_page_check(student_id, "lecturer_material", source_id, req)

    assert result.score == 1
    assert result.max_score == 2
    assert result.percentage == 50.0
    assert result.passed is False
    assert result.created_key_point_id is not None


@pytest.mark.asyncio
async def test_generate_page_check_student_resource():
    mock_db = AsyncMock()
    # Mock db.execute returning empty chunks
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute = AsyncMock(return_value=mock_result)

    service = StudyReaderService(mock_db)
    source_id = uuid.uuid4()
    student_id = uuid.uuid4()
    service.assert_access = AsyncMock(return_value=("My Uploaded Notes.pdf", {}))

    resp = await service.generate_page_check(
        student_id=student_id,
        kind="student_resource",
        source_id=source_id,
        page_number=2,
    )

    assert resp.page_number == 2
    assert len(resp.questions) >= 1
    assert len(resp.questions[0].options) == 4


