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
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
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
    assert "STUDENT HIGHLIGHTED EXCERPT (Page 5)" in prompt
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

    mock_res = MagicMock()
    mock_res.scalars.return_value.first.return_value = mock_resource
    mock_db.execute = AsyncMock(return_value=mock_res)

    # Student B attempts to access it
    student_b_id = uuid.uuid4()
    with pytest.raises(AuthorizationError):
        await service.assert_access(student_b_id, "student_resource", mock_resource.id)


@pytest.mark.asyncio
async def test_study_reader_export_revision_sheet_formatting():
    mock_db = AsyncMock()
    service = StudyReaderService(mock_db)

    source_id = uuid.uuid4()
    student_id = uuid.uuid4()
    service.assert_access = AsyncMock(return_value=("CS101 Intro to AI.pdf", {}))

    from datetime import datetime, timezone
    from app.db.models.study_reader import StudentMaterialKeyPoint, StudentMaterialAnnotation

    now = datetime.now(timezone.utc)

    # Mock key points
    mock_kps = [
        StudentMaterialKeyPoint(
            id=uuid.uuid4(),
            student_id=student_id,
            source_kind="lecturer_material",
            source_id=source_id,
            title="Definition of Heuristic Search",
            quote="An informed search strategy using problem-specific knowledge.",
            page_number=4,
            tag="definition",
            confidence="got_it",
            annotation_id=None,
            next_review_at=None,
            created_at=now,
            updated_at=now,
        ),
        StudentMaterialKeyPoint(
            id=uuid.uuid4(),
            student_id=student_id,
            source_kind="lecturer_material",
            source_id=source_id,
            title="A* Admissibility Theorem",
            quote="h(n) <= h*(n) ensures optimality.",
            page_number=7,
            tag="formula",
            confidence="fuzzy",
            annotation_id=None,
            next_review_at=None,
            created_at=now,
            updated_at=now,
        ),
    ]
    service.repo.list_key_points = AsyncMock(return_value=mock_kps)

    # Mock annotations
    mock_annos = [
        StudentMaterialAnnotation(
            id=uuid.uuid4(),
            student_id=student_id,
            source_kind="lecturer_material",
            source_id=source_id,
            page_number=4,
            color="key_idea",
            selected_text="Heuristic search expands nodes according to an evaluation function.",
            rects_json=[],
            note_text="Important for midterm exam question 2",
            created_at=now,
            updated_at=now,
        )
    ]
    service.repo.list_annotations = AsyncMock(return_value=mock_annos)

    export = await service.export_revision_sheet(student_id, "lecturer_material", source_id)

    assert "# Revision Sheet: CS101 Intro to AI.pdf" in export.markdown
    assert "Key Concepts & Takeaways" in export.markdown
    assert "Definition of Heuristic Search" in export.markdown
    assert "A* Admissibility Theorem" in export.markdown
    assert "Highlights & Study Notes" in export.markdown
    assert "Important for midterm exam question 2" in export.markdown


@pytest.mark.asyncio
async def test_personal_resource_focus_no_exam_mapping():
    """Focus engine on student's personal uploaded PDF must NOT map to course exams."""
    mock_db = AsyncMock()
    service = StudyReaderService(mock_db)

    source_id = uuid.uuid4()
    student_id = uuid.uuid4()
    service.assert_access = AsyncMock(return_value=("My Personal Summary.pdf", {}))

    from datetime import datetime, timezone
    from app.db.models.study_reader import StudentMaterialKeyPoint

    now = datetime.now(timezone.utc)

    # Mock key points with 1 fuzzy and 1 got_it
    kps = [
        StudentMaterialKeyPoint(
            id=uuid.uuid4(),
            student_id=student_id,
            source_kind="student_resource",
            source_id=source_id,
            title="Gradient Descent",
            quote="Alpha learning rate step",
            page_number=2,
            tag="formula",
            confidence="lost",
            annotation_id=None,
            next_review_at=None,
            created_at=now,
            updated_at=now,
        ),
    ]
    service.repo.list_key_points = AsyncMock(return_value=kps)
    service.repo.list_annotations = AsyncMock(return_value=[])
    service.repo.list_due_spaced_reviews = AsyncMock(return_value=[kps[0]])

    focus = await service.get_focus(student_id, "student_resource", source_id)

    assert focus.exam_mapping is False
    assert len(focus.heatmap) == 1
    assert focus.heatmap[0].page_number == 2
    assert focus.heatmap[0].heat > 0
    assert len(focus.spaced_reviews) == 1
    assert focus.spaced_reviews[0].title == "Gradient Descent"


@pytest.mark.asyncio
async def test_page_check_submission_and_scoring():
    mock_db = AsyncMock()
    service = StudyReaderService(mock_db)

    source_id = uuid.uuid4()
    student_id = uuid.uuid4()
    service.assert_access = AsyncMock(return_value=("Chapter 1.pdf", {}))

    import time
    from app.schemas.study_reader import (
        PageCheckAnswerItem,
        PageCheckQuestion,
        PageCheckSubmitRequest,
    )
    from app.db.models.study_reader import StudentMaterialKeyPoint

    mock_questions = [
        PageCheckQuestion(
            id="q1",
            question="Question 1?",
            options=["A", "B", "C", "D"],
            correct_option_index=0,
            explanation="Exp 1",
        ),
        PageCheckQuestion(
            id="q2",
            question="Question 2?",
            options=["A", "B", "C", "D"],
            correct_option_index=1,
            explanation="Exp 2",
        ),
    ]
    service._page_check_cache[(student_id, "lecturer_material", source_id, 3)] = (
        time.monotonic() + 300.0,
        mock_questions,
    )

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


# ── B1 & B2 Audit Tests ──────────────────────────────────────────────────────

from app.agents.study_reader_agent import StudyReaderAgent
from app.db.enums import AIActionType
from app.db.repositories.study_reader_repo import StudyReaderRepository


@pytest.mark.asyncio
async def test_study_reader_agent_skim_audited():
    """Verify StudyReaderAgent.skim routes through AIGateway with correct audit fields."""
    mock_gateway = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.content = '{"summary": "Core overview.", "bullets": [{"bullet": "Point 1", "page_number": 1}]}'
    mock_gateway.complete.return_value = mock_resp

    agent = StudyReaderAgent(mock_gateway)
    student_id = uuid.uuid4()
    source_id = uuid.uuid4()

    res = await agent.skim(
        title="Lecture 1 - Operating Systems.pdf",
        chunks_text=["Memory virtualization is essential.", "Process scheduling."],
        student_id=student_id,
        source_id=source_id,
        source_kind="lecturer_material",
    )

    assert res.title == "Lecture 1 - Operating Systems.pdf"
    assert res.summary == "Core overview."
    assert len(res.bullets) == 1
    assert res.bullets[0].bullet == "Point 1"
    assert res.bullets[0].page_number == 1

    # Verify AIGateway.complete arguments
    mock_gateway.complete.assert_called_once()
    call_kwargs = mock_gateway.complete.call_args.kwargs
    assert call_kwargs["action_type"] == AIActionType.DOCUMENT_SUMMARY
    assert call_kwargs["actor_id"] == student_id
    assert call_kwargs["actor_role"] == "student"
    assert call_kwargs["subject_entity_type"] == "lecturer_material"
    assert call_kwargs["subject_entity_id"] == source_id
    assert call_kwargs["prompt_version"] == "v1"


@pytest.mark.asyncio
async def test_study_reader_agent_page_check_audited():
    """Verify StudyReaderAgent.generate_page_check routes through AIGateway with correct audit fields."""
    mock_gateway = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.content = (
        '{"questions": [{"id": "q1", "question": "What is page paging?", '
        '"options": ["Memory mapping", "Disk swap", "Cache", "Thread"], '
        '"correct_option_index": 0, "explanation": "Page text explanation."}]}'
    )
    mock_gateway.complete.return_value = mock_resp

    agent = StudyReaderAgent(mock_gateway)
    student_id = uuid.uuid4()
    source_id = uuid.uuid4()

    res = await agent.generate_page_check(
        title="Lecture 2 - Concurrency.pdf",
        page_number=4,
        page_context="Concurrency is the execution of multiple instruction sequences.",
        student_id=student_id,
        source_id=source_id,
        source_kind="lecturer_material",
        selected_text="instruction sequences",
    )

    assert res.page_number == 4
    assert len(res.questions) == 1
    assert res.questions[0].question == "What is page paging?"
    assert res.questions[0].options[res.questions[0].correct_option_index] == "Memory mapping"
    assert 0 <= res.questions[0].correct_option_index < len(res.questions[0].options)

    # Verify AIGateway.complete arguments
    mock_gateway.complete.assert_called_once()
    call_kwargs = mock_gateway.complete.call_args.kwargs
    assert call_kwargs["action_type"] == AIActionType.GENERATE_KNOWLEDGE_CHECK
    assert call_kwargs["actor_id"] == student_id
    assert call_kwargs["actor_role"] == "student"
    assert call_kwargs["subject_entity_type"] == "lecturer_material"
    assert call_kwargs["subject_entity_id"] == source_id
    assert call_kwargs["prompt_version"] == "v1"


@pytest.mark.asyncio
async def test_study_support_agent_audits_subject_resource_when_provided():
    """Verify StudySupportAgent records subject_entity_id and subject_entity_type for resource queries."""
    mock_gateway = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.content = "Answer content"
    mock_gateway.complete.return_value = mock_resp

    agent = StudySupportAgent(mock_gateway)
    student_id = uuid.uuid4()
    res_id = uuid.uuid4()

    ans = await agent._call_llm(
        system_prompt="System instructions",
        user_prompt="Explain section 3",
        history=[],
        student_id=student_id,
        selected_resource_id=res_id,
    )

    assert ans == "Answer content"
    mock_gateway.complete.assert_called_once()
    call_kwargs = mock_gateway.complete.call_args.kwargs
    assert call_kwargs["action_type"] == AIActionType.STUDY_SUPPORT
    assert call_kwargs["actor_id"] == student_id
    assert call_kwargs["subject_entity_id"] == res_id
    assert call_kwargs["subject_entity_type"] == "resource"


@pytest.mark.asyncio
async def test_on_write_orphan_validation_raises_not_found():
    """Verify StudyReaderRepository rejects writes when target material/resource does not exist."""
    mock_db = AsyncMock()
    # Mock validate_source_exists returning False
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=mock_res)

    repo = StudyReaderRepository(mock_db)
    student_id = uuid.uuid4()
    dead_source_id = uuid.uuid4()

    # 1. Create Annotation
    with pytest.raises(NotFoundError):
        await repo.create_annotation(
            student_id=student_id,
            kind="lecturer_material",
            source_id=dead_source_id,
            data=AnnotationCreate(
                page_number=1,
                color="key_idea",
                selected_text="Text",
                rects=[],
            ),
        )

    # 2. Create Key Point
    with pytest.raises(NotFoundError):
        await repo.create_key_point(
            student_id=student_id,
            kind="lecturer_material",
            source_id=dead_source_id,
            data=KeyPointCreate(title="Key Point", page_number=1),
        )

    # 3. Upsert Progress
    with pytest.raises(NotFoundError):
        await repo.upsert_progress(
            student_id=student_id,
            kind="lecturer_material",
            source_id=dead_source_id,
            data=ReadingProgressUpdate(last_page=2, last_scale=100.0, page_count_seen=2),
        )


@pytest.mark.asyncio
async def test_copy_forward_material_study_data():
    """Verify copying forward annotations, key points with mapped annotation_id, and progress."""
    mock_db = AsyncMock()

    old_mat_id = uuid.uuid4()
    new_mat_id = uuid.uuid4()
    student_id = uuid.uuid4()
    old_ann_id = uuid.uuid4()

    from app.db.models.study_reader import (
        StudentMaterialAnnotation,
        StudentMaterialKeyPoint,
        StudentReadingProgress,
    )

    old_prog = StudentReadingProgress(
        id=uuid.uuid4(),
        student_id=student_id,
        source_kind="lecturer_material",
        source_id=old_mat_id,
        last_page=5,
        last_scale=120.0,
        page_count_seen=5,
    )
    old_ann = StudentMaterialAnnotation(
        id=old_ann_id,
        student_id=student_id,
        source_kind="lecturer_material",
        source_id=old_mat_id,
        page_number=5,
        color="definition",
        selected_text="Paging algorithm",
        rects_json=[],
        note_text="Midterm note",
    )
    old_kp = StudentMaterialKeyPoint(
        id=uuid.uuid4(),
        student_id=student_id,
        source_kind="lecturer_material",
        source_id=old_mat_id,
        title="Paging",
        page_number=5,
        annotation_id=old_ann_id,
    )

    # Return progress, then annotations, then key points
    res_prog = MagicMock()
    res_prog.scalars.return_value.all.return_value = [old_prog]

    res_ann = MagicMock()
    res_ann.scalars.return_value.all.return_value = [old_ann]

    res_kp = MagicMock()
    res_kp.scalars.return_value.all.return_value = [old_kp]

    res_existing_prog = MagicMock()
    res_existing_prog.scalars.return_value.first.return_value = None

    mock_db.execute = AsyncMock(side_effect=[res_prog, res_existing_prog, res_ann, res_kp])

    repo = StudyReaderRepository(mock_db)
    summary = await repo.copy_forward_material_study_data(
        previous_material_ids=[old_mat_id],
        new_material_id=new_mat_id,
        kind="lecturer_material",
    )

    assert summary["copied_annotations"] == 1
    assert summary["copied_key_points"] == 1
    assert summary["copied_progress"] == 1

    # Verify entities added to DB session
    assert mock_db.add.call_count == 3


# ── B3 & B4 Language Policy and Page-Text Grounding Tests ───────────────────

from app.core.exceptions import AILanguageBlockedError
from app.db.enums import LanguageEnum
from app.schemas.student_ai import StudentSupportRequest
from app.services.student_ai_service import StudentAIService


@pytest.mark.asyncio
async def test_reader_ai_blocked_for_kinyarwanda_material():
    """Verify Quick Skim and Page Check are blocked with AILanguageBlockedError for Kinyarwanda course materials."""
    mock_db = AsyncMock()
    service = StudyReaderService(mock_db)

    student_id = uuid.uuid4()
    material_id = uuid.uuid4()
    ws_id = uuid.uuid4()

    # Mock assert_access success
    service.assert_access = AsyncMock(return_value=("Amateka y'u Rwanda.pdf", {}))

    # Mock db.execute returning TeachingWorkspace with LanguageEnum.RW
    mock_res = MagicMock()
    mock_res.first.return_value = (LanguageEnum.RW, ws_id)
    mock_db.execute = AsyncMock(return_value=mock_res)

    # 1. Skim document must raise AILanguageBlockedError
    with pytest.raises(AILanguageBlockedError):
        await service.skim_document(student_id, "lecturer_material", material_id)

    # 2. Generate page check must raise AILanguageBlockedError
    with pytest.raises(AILanguageBlockedError):
        await service.generate_page_check(student_id, "lecturer_material", material_id, page_number=1)


@pytest.mark.asyncio
async def test_student_ai_support_blocks_kinyarwanda_via_selected_resource():
    """Verify StudentAIService.support resolves workspace from selected_resource_id and blocks Kinyarwanda."""
    mock_db = AsyncMock()
    service = StudentAIService(mock_db)

    resource_id = uuid.uuid4()
    ws_id = uuid.uuid4()

    # Mock _assert_student_support_allowed
    service._assert_student_support_allowed = AsyncMock()

    # Mock material lookup returning ws_id
    mock_res_mat = MagicMock()
    mock_res_mat.scalar_one_or_none.return_value = ws_id
    mock_db.execute = AsyncMock(return_value=mock_res_mat)

    # Mock workspace lookup returning TeachingWorkspace with language=RW
    mock_ws = MagicMock()
    mock_ws.language = LanguageEnum.RW
    mock_db.get = AsyncMock(return_value=mock_ws)

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()

    req = StudentSupportRequest(
        question="Mbisobanurire birambuye",
        selected_resource_id=resource_id,
        teaching_workspace_id=None, # Missing in request, must be resolved from material
    )

    with pytest.raises(AILanguageBlockedError):
        await service.support(req, mock_user)


@pytest.mark.asyncio
async def test_extract_exact_page_text_uses_redis_cache(monkeypatch):
    """Verify extract_exact_page_text returns cached page text from Redis without DB/disk access."""
    mock_db = AsyncMock()
    service = StudyReaderService(mock_db)

    material_id = uuid.uuid4()
    page_num = 3
    cached_content = "This is exact cached page 3 text from PyMuPDF."

    from app.core.cache import cache
    monkeypatch.setattr(cache, "get", AsyncMock(return_value=cached_content))

    result = await service.extract_exact_page_text("lecturer_material", material_id, page_num)

    assert result == cached_content
    # DB was not queried because cache hit succeeded
    mock_db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_extract_exact_page_text_strict_chunk_fallback(monkeypatch):
    """Verify chunk fallback uses strict source_page equality and caches result."""
    mock_db = AsyncMock()
    service = StudyReaderService(mock_db)

    material_id = uuid.uuid4()
    page_num = 4

    from app.core.cache import cache
    monkeypatch.setattr(cache, "get", AsyncMock(return_value=None))
    mock_cache_set = AsyncMock()
    monkeypatch.setattr(cache, "set", mock_cache_set)

    # 1. Mock file_path lookup returning None (no PDF file on disk)
    mock_res_file = MagicMock()
    mock_res_file.scalar_one_or_none.return_value = None

    # 2. Mock chunk query returning strictly matched page chunk
    from app.db.models.resource import LecturerMaterialChunk
    mock_chunk = LecturerMaterialChunk(
        id=uuid.uuid4(),
        lecturer_material_id=material_id,
        chunk_index=0,
        content="Strictly page 4 content.",
        source_page=4,
    )
    mock_res_chunks = MagicMock()
    mock_res_chunks.scalars.return_value.all.return_value = [mock_chunk]

    mock_db.execute = AsyncMock(side_effect=[mock_res_file, mock_res_chunks])

    result = await service.extract_exact_page_text("lecturer_material", material_id, page_num)

    assert result == "Strictly page 4 content."
    # Verify cached in Redis for fast future retrieval
    mock_cache_set.assert_called_once()
    assert mock_cache_set.call_args[0][0] == "study_page_text"
    assert mock_cache_set.call_args[0][1] == f"{material_id}:{page_num}"
    assert mock_cache_set.call_args[0][2] == "Strictly page 4 content."


# ── B5 & B6 Layout Fields and Furthest Page Semantics ────────────────────────

def test_reading_progress_schema_layout_and_furthest_page():
    """Verify ReadingProgressUpdate and ReadingProgressResponse handle rotation, zoom_mode, two_page_view, furthest_page_reached."""
    from app.schemas.study_reader import ReadingProgressResponse, ReadingProgressUpdate

    update = ReadingProgressUpdate(
        last_page=5,
        last_scale=125.0,
        rotation=90,
        zoom_mode="fit-page",
        two_page_view=True,
        furthest_page_reached=8,
    )
    assert update.last_page == 5
    assert update.last_scale == 125.0
    assert update.rotation == 90
    assert update.zoom_mode == "fit-page"
    assert update.two_page_view is True
    assert update.furthest_page_reached == 8

    from datetime import datetime, timezone
    resp = ReadingProgressResponse(
        id=uuid.uuid4(),
        student_id=uuid.uuid4(),
        source_kind="lecturer_material",
        source_id=uuid.uuid4(),
        last_page=5,
        last_scale=125.0,
        rotation=90,
        zoom_mode="fit-page",
        two_page_view=True,
        furthest_page_reached=8,
        page_count_seen=8,
        updated_at=datetime.now(timezone.utc),
    )
    assert resp.rotation == 90
    assert resp.zoom_mode == "fit-page"
    assert resp.two_page_view is True
    assert resp.furthest_page_reached == 8


@pytest.mark.asyncio
async def test_upsert_progress_persists_layout_and_furthest_page():
    """Verify StudyReaderRepository.upsert_progress stores layout fields and calculates furthest_page_reached."""
    mock_db = AsyncMock()
    repo = StudyReaderRepository(mock_db)

    student_id = uuid.uuid4()
    material_id = uuid.uuid4()

    # Mock validate_source_exists returning True
    mock_res_valid = MagicMock()
    mock_res_valid.scalar_one_or_none.return_value = material_id

    from app.db.models.study_reader import StudentReadingProgress

    mock_srp = StudentReadingProgress(
        id=uuid.uuid4(),
        student_id=student_id,
        source_kind="lecturer_material",
        source_id=material_id,
        last_page=3,
        last_scale=150.0,
        rotation=180,
        zoom_mode="fit-page",
        two_page_view=True,
        furthest_page_reached=7,
        page_count_seen=7,
    )
    mock_res_insert = MagicMock()
    mock_res_insert.scalar_one.return_value = mock_srp

    mock_db.execute = AsyncMock(side_effect=[mock_res_valid, mock_res_insert])

    data = ReadingProgressUpdate(
        last_page=3,
        last_scale=150.0,
        rotation=180,
        zoom_mode="fit-page",
        two_page_view=True,
        furthest_page_reached=7,
    )

    result = await repo.upsert_progress(student_id, "lecturer_material", material_id, data)

    assert result.last_page == 3
    assert result.rotation == 180
    assert result.zoom_mode == "fit-page"
    assert result.two_page_view is True
    assert result.furthest_page_reached == 7


# ── B8 Pagination and B9 Guards Tests ────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_annotations_and_key_points_pagination():
    """Verify repo list_annotations and list_key_points support pagination and filtering."""
    mock_db = AsyncMock()
    repo = StudyReaderRepository(mock_db)

    student_id = uuid.uuid4()
    material_id = uuid.uuid4()

    mock_res_ann = MagicMock()
    mock_res_ann.scalars.return_value.all.return_value = []
    mock_res_kp = MagicMock()
    mock_res_kp.scalars.return_value.all.return_value = []

    mock_db.execute = AsyncMock(side_effect=[mock_res_ann, mock_res_kp])

    annotations = await repo.list_annotations(
        student_id, "lecturer_material", material_id, page_number=2, limit=50, offset=10
    )
    assert annotations == []

    key_points = await repo.list_key_points(
        student_id, "lecturer_material", material_id, page_number=2, tag="definition", limit=50, offset=10
    )
    assert key_points == []
    assert mock_db.execute.call_count == 2


@pytest.mark.asyncio
async def test_generate_page_check_page_bounds_guard():
    """Verify generate_page_check rejects invalid page numbers (< 1 or > 5000)."""
    mock_db = AsyncMock()
    service = StudyReaderService(mock_db)

    student_id = uuid.uuid4()
    material_id = uuid.uuid4()

    with pytest.raises(ValidationError) as excinfo_low:
        await service.generate_page_check(student_id, "lecturer_material", material_id, page_number=0)
    assert "Invalid page number" in str(excinfo_low.value)

    with pytest.raises(ValidationError) as excinfo_high:
        await service.generate_page_check(student_id, "lecturer_material", material_id, page_number=5001)
    assert "Invalid page number" in str(excinfo_high.value)






