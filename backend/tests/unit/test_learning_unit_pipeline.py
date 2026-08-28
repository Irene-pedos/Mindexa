from __future__ import annotations

import uuid
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.agents.study_planner_agent import LearningUnitSegment, StudyPlannerAgent
from app.db.enums import AIActionType
from app.db.models.learning_unit import LearningUnit
from app.schemas.lecturer_ai import LearningUnitItemResponse, SlideDeckGenerateRequest
from app.schemas.study_planner import LearningUnitResponse
from app.schemas.study_reader import ReaderLearningUnitItem


def test_learning_unit_model_fields():
    """Verify LearningUnit model has outcomes, start_page, end_page fields."""
    lu = LearningUnit(
        teaching_workspace_id=uuid.uuid4(),
        source_material_id=uuid.uuid4(),
        order_index=1,
        title="Unit 1: Introduction to Algorithms",
        summary="Foundational algorithm design and complexity analysis.",
        learning_outcomes=[
            "Explain asymptotic notation Big-O, Omega, Theta",
            "Analyze time complexity of iterative algorithms",
        ],
        start_page=1,
        end_page=5,
        source_chunk_ids=["chunk-1", "chunk-2"],
        estimated_study_minutes=45,
        is_active=True,
    )
    assert lu.title == "Unit 1: Introduction to Algorithms"
    assert len(lu.learning_outcomes) == 2
    assert lu.start_page == 1
    assert lu.end_page == 5
    assert lu.order_index == 1


def test_deterministic_page_range_computation():
    """Verify page range is computed deterministically in Python from chunk metadata."""
    chunks = [
        {"id": "c1", "chunk_index": 0, "metadata_json": {"page": 1, "section": "intro"}},
        {"id": "c2", "chunk_index": 1, "metadata_json": {"page": 2, "section": "definitions"}},
        {"id": "c3", "chunk_index": 2, "metadata_json": {"page": 4, "section": "examples"}},
        {"id": "c4", "chunk_index": 3, "metadata_json": {"page": 5, "section": "summary"}},
    ]

    unit_1_indices = [0, 1]
    unit_1_chunks = [chunks[i] for i in unit_1_indices]
    u1_pages = [c["metadata_json"]["page"] for c in unit_1_chunks if "page" in c["metadata_json"]]
    u1_start = min(u1_pages) if u1_pages else None
    u1_end = max(u1_pages) if u1_pages else None

    assert u1_start == 1
    assert u1_end == 2

    unit_2_indices = [2, 3]
    unit_2_chunks = [chunks[i] for i in unit_2_indices]
    u2_pages = [c["metadata_json"]["page"] for c in unit_2_chunks if "page" in c["metadata_json"]]
    u2_start = min(u2_pages) if u2_pages else None
    u2_end = max(u2_pages) if u2_pages else None

    assert u2_start == 4
    assert u2_end == 5


@pytest.mark.asyncio
async def test_segment_into_learning_units_agent_call():
    """Verify StudyPlannerAgent.segment_into_learning_units produces valid LearningUnitSegment with outcomes."""
    mock_gateway = MagicMock()
    mock_response = MagicMock()
    mock_response.content = """
    [
        {
            "title": "Unit 1: Fundamentals",
            "summary": "Core definitions and concepts.",
            "learning_outcomes": ["Define key terminology", "Recognize base patterns"],
            "chunk_indices": [0, 1],
            "estimated_minutes": 45
        },
        {
            "title": "Unit 2: Advanced Applications",
            "summary": "Applied scenarios and evaluation.",
            "learning_outcomes": ["Synthesize complex workflows", "Evaluate trade-offs"],
            "chunk_indices": [2, 3],
            "estimated_minutes": 50
        }
    ]
    """
    mock_gateway.complete = AsyncMock(return_value=mock_response)

    agent = StudyPlannerAgent(mock_gateway)
    chunks = [
        {"chunk_index": 0, "content": "Introductory paragraph on system design."},
        {"chunk_index": 1, "content": "Basic architectural components."},
        {"chunk_index": 2, "content": "High-availability patterns and replication."},
        {"chunk_index": 3, "content": "Fault-tolerance and failover mechanisms."},
    ]

    segments = await agent.segment_into_learning_units("System Architecture", chunks)

    assert len(segments) == 2
    assert segments[0].title == "Unit 1: Fundamentals"
    assert len(segments[0].learning_outcomes) == 2
    assert segments[0].chunk_indices == [0, 1]
    assert segments[1].title == "Unit 2: Advanced Applications"
    assert len(segments[1].learning_outcomes) == 2
    assert segments[1].chunk_indices == [2, 3]

    # Verify AIActionType was SEGMENT_LEARNING_UNITS
    call_kwargs = mock_gateway.complete.call_args.kwargs
    assert call_kwargs["action_type"] == AIActionType.SEGMENT_LEARNING_UNITS


def test_schema_responses_contain_outcomes_and_pages():
    """Verify API schema response models serialize learning_outcomes and page ranges."""
    lu_id = uuid.uuid4()
    ws_id = uuid.uuid4()
    mat_id = uuid.uuid4()

    # Lecturer response schema
    lecturer_resp = LearningUnitItemResponse(
        id=lu_id,
        order_index=1,
        title="Unit 1",
        summary="Summary",
        learning_outcomes=["Outcome A", "Outcome B"],
        start_page=1,
        end_page=3,
        source_material_id=mat_id,
        estimated_study_minutes=45,
        chunk_count=2,
    )
    assert lecturer_resp.learning_outcomes == ["Outcome A", "Outcome B"]
    assert lecturer_resp.start_page == 1
    assert lecturer_resp.end_page == 3

    # Student planner response schema
    student_resp = LearningUnitResponse(
        id=lu_id,
        teaching_workspace_id=ws_id,
        source_material_id=mat_id,
        order_index=1,
        title="Unit 1",
        summary="Summary",
        learning_outcomes=["Outcome A"],
        start_page=1,
        end_page=3,
        source_chunk_ids=["c1", "c2"],
        estimated_study_minutes=45,
        is_active=True,
        status="NOT_STARTED",
    )
    assert student_resp.learning_outcomes == ["Outcome A"]
    assert student_resp.start_page == 1

    # Reader response schema
    reader_resp = ReaderLearningUnitItem(
        id=lu_id,
        order_index=1,
        title="Unit 1",
        summary="Summary",
        learning_outcomes=["Outcome A", "Outcome B"],
        start_page=1,
        end_page=3,
        chunk_count=2,
        estimated_study_minutes=45,
    )
    assert reader_resp.learning_outcomes == ["Outcome A", "Outcome B"]
    assert reader_resp.end_page == 3
