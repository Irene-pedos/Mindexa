from __future__ import annotations

import uuid
from datetime import datetime, UTC
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.core.exceptions import PermissionDeniedError
from app.services.student_ai_service import StudentAIService
from app.schemas.student_ai import StudentSupportContextRequest, StudentSupportRequest
from app.db.models.study_support_session import StudySupportSession
from app.db.models.auth import User


@pytest.mark.asyncio
async def test_student_ai_service_rejects_answer_key_context() -> None:
    service = StudentAIService(db=None)

    with pytest.raises(PermissionDeniedError) as exc_info:
        await service._assert_contexts_are_safe(
            [
                StudentSupportContextRequest(
                    title="Answer key",
                    content="Official marking guide for the CAT.",
                )
            ]
        )

    assert exc_info.value.code == "AI_CONTEXT_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_student_ai_service_get_conversations() -> None:
    student_id = uuid.uuid4()
    conv_id1 = uuid.uuid4()
    conv_id2 = uuid.uuid4()

    mock_db = AsyncMock()

    # Mock aggregation query result
    mock_row1 = MagicMock()
    mock_row1.conversation_id = conv_id1
    mock_row1.last_activity_at = datetime(2026, 8, 25, 12, 30, tzinfo=UTC)
    mock_row1.first_activity_at = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)
    mock_row1.turn_count = 3

    mock_row2 = MagicMock()
    mock_row2.conversation_id = conv_id2
    mock_row2.last_activity_at = datetime(2026, 8, 25, 11, 0, tzinfo=UTC)
    mock_row2.first_activity_at = datetime(2026, 8, 25, 11, 0, tzinfo=UTC)
    mock_row2.turn_count = 1

    mock_agg_res = MagicMock()
    mock_agg_res.all.return_value = [mock_row1, mock_row2]

    # Mock first turns query result
    session1 = StudySupportSession(
        id=uuid.uuid4(),
        student_id=student_id,
        conversation_id=conv_id1,
        question="What is 3NF database normalization?",
        context_used="Context",
        llm_response="3NF is...",
        created_at=datetime(2026, 8, 25, 12, 0, tzinfo=UTC),
    )
    session2 = StudySupportSession(
        id=uuid.uuid4(),
        student_id=student_id,
        conversation_id=conv_id2,
        question="Explain SQL outer joins with practical examples",
        context_used="Context",
        llm_response="An outer join...",
        created_at=datetime(2026, 8, 25, 11, 0, tzinfo=UTC),
    )
    mock_turns_res = MagicMock()
    mock_turns_res.scalars.return_value.all.return_value = [session1, session2]

    mock_db.execute.side_effect = [mock_agg_res, mock_turns_res]

    service = StudentAIService(mock_db)
    conversations = await service.get_conversations(student_id)

    assert len(conversations) == 2
    assert conversations[0].conversation_id == conv_id1
    assert conversations[0].preview == "What is 3NF database normalization?"
    assert conversations[0].turn_count == 3
    assert conversations[1].conversation_id == conv_id2
    assert conversations[1].preview == "Explain SQL outer joins with practical examples"
    assert conversations[1].turn_count == 1


@pytest.mark.asyncio
async def test_student_ai_service_get_conversation_turns() -> None:
    student_id = uuid.uuid4()
    conv_id = uuid.uuid4()

    mock_db = AsyncMock()

    turn1 = StudySupportSession(
        id=uuid.uuid4(),
        student_id=student_id,
        conversation_id=conv_id,
        question="Turn 1 Question",
        context_used="Context 1",
        llm_response="Turn 1 Answer",
        created_at=datetime(2026, 8, 25, 12, 0, tzinfo=UTC),
    )
    turn2 = StudySupportSession(
        id=uuid.uuid4(),
        student_id=student_id,
        conversation_id=conv_id,
        question="Turn 2 Question",
        context_used="Context 2",
        llm_response="Turn 2 Answer",
        created_at=datetime(2026, 8, 25, 12, 5, tzinfo=UTC),
    )

    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [turn1, turn2]
    mock_db.execute.return_value = mock_res

    service = StudentAIService(mock_db)
    turns = await service.get_conversation(student_id, conv_id)

    assert len(turns) == 2
    assert turns[0].question == "Turn 1 Question"
    assert turns[0].answer == "Turn 1 Answer"
    assert turns[0].conversation_id == conv_id
    assert turns[1].question == "Turn 2 Question"
    assert turns[1].answer == "Turn 2 Answer"
    assert turns[1].conversation_id == conv_id


@pytest.mark.asyncio
async def test_student_ai_service_source_surface_controls_global_history_logging() -> None:
    """Verify that reader and assessment queries do not log to global tutor history."""
    from unittest.mock import patch
    from app.agents.student_support_agent import StudySupportAgentResponse

    mock_db = AsyncMock()
    service = StudentAIService(mock_db)
    service._assert_student_support_allowed = AsyncMock()

    student = User(
        id=uuid.uuid4(),
        email="student@university.edu",
        role="student",
        full_name="Jane Doe",
    )

    mock_resp = StudySupportAgentResponse(
        answer="Explained concept",
        citations=[],
        fallback_used=False,
    )

    # 1. Test study_reader surface -> log_to_global_history MUST be False
    with patch("app.services.student_ai_service.StudySupportAgent.answer", new_callable=AsyncMock) as mock_answer:
        mock_answer.return_value = mock_resp
        req_reader = StudentSupportRequest(
            question="What is this paragraph about?",
            source_surface="study_reader",
            current_page=3,
        )
        await service.support(req_reader, current_user=student)
        assert mock_answer.call_args.kwargs["log_to_global_history"] is False

    # 2. Test study_tutor surface -> log_to_global_history MUST be True
    with patch("app.services.student_ai_service.StudySupportAgent.answer", new_callable=AsyncMock) as mock_answer:
        mock_answer.return_value = mock_resp
        req_tutor = StudentSupportRequest(
            question="Can you help me understand normalization?",
            source_surface="study_tutor",
        )
        await service.support(req_tutor, current_user=student)
        assert mock_answer.call_args.kwargs["log_to_global_history"] is True

    # 3. Test assessment_inline surface -> log_to_global_history MUST be False
    with patch("app.services.student_ai_service.StudySupportAgent.answer", new_callable=AsyncMock) as mock_answer:
        mock_answer.return_value = mock_resp
        # Mock attempt lookup
        mock_attempt = MagicMock()
        mock_attempt.student_id = student.id
        mock_attempt.assessment.ai_assistance_allowed = True
        with patch("app.db.repositories.attempt_repo.AttemptRepository.get_by_id", new_callable=AsyncMock) as mock_get_attempt:
            mock_get_attempt.return_value = mock_attempt
            req_assessment = StudentSupportRequest(
                question="Can you explain this math rule?",
                source_surface="assessment_inline",
                attempt_id=uuid.uuid4(),
            )
            await service.support(req_assessment, current_user=student)
            assert mock_answer.call_args.kwargs["log_to_global_history"] is False


@pytest.mark.asyncio
async def test_generate_revision_guide_resolves_learning_unit() -> None:
    from app.schemas.student_ai import RevisionGuideRequest, RevisionGuideOutput
    from app.db.models.learning_unit import LearningUnit

    student_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    unit_id = uuid.uuid4()

    mock_lu = LearningUnit(
        id=unit_id,
        teaching_workspace_id=workspace_id,
        order_index=0,
        title="Database Normalization & Forms",
        summary="Overview of 1NF, 2NF, 3NF, BCNF",
    )

    mock_db = AsyncMock()
    mock_db.get.return_value = mock_lu
    # Mock no active blocking exams
    mock_exec_res = MagicMock()
    mock_exec_res.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_exec_res

    service = StudentAIService(mock_db)

    expected_output = RevisionGuideOutput(
        title="Database Normalization & Forms",
        summary="Summary of normalization rules.",
        checklist=["Identify functional dependencies", "Convert to 3NF"],
        readings=["Chapter 4: Database Systems"],
        markdown="# Revision Guide: Database Normalization & Forms\n...",
    )

    with patch("app.services.student_ai_service.StudySupportAgent.generate_revision_guide", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = expected_output

        req = RevisionGuideRequest(
            topic="Custom Normalization",
            learning_unit_id=unit_id,
        )
        res = await service.generate_revision_guide(req, student_id=student_id)

        assert res.title == "Database Normalization & Forms"
        assert len(res.checklist) == 2
        assert mock_gen.call_args.kwargs["topic"] == "Database Normalization & Forms"
        assert mock_gen.call_args.kwargs["teaching_workspace_id"] == workspace_id

