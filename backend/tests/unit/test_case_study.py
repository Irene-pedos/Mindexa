import uuid
import pytest
from pydantic import ValidationError

from app.core.constants import QuestionType
from app.db.schemas.question import QuestionCreate, QuestionOptionCreate
from app.schemas.attempt import AttemptQuestionResponse, AttemptQuestionOption
from app.agents.assessment_generator_agent import AssessmentGeneratorAgent


def test_question_create_case_study_requires_context():
    """Case study questions must fail validation if case_study_context is empty."""
    with pytest.raises(ValidationError) as exc:
        QuestionCreate(
            question_type=QuestionType.CASE_STUDY,
            content="Analyze the following scenario:",
            case_study_context=None,
            options=[QuestionOptionCreate(content="Sub-question 1", is_correct=True, order_index=0)],
        )
    assert "case_study_context" in str(exc.value)


def test_question_create_case_study_valid():
    """Case study questions with non-empty context and options should validate."""
    q = QuestionCreate(
        question_type=QuestionType.CASE_STUDY,
        content="Analyze the following scenario:",
        case_study_context="Patient presents with symptoms of dehydration...",
        options=[QuestionOptionCreate(content="Sub-question 1", is_correct=True, order_index=0)],
    )
    assert q.case_study_context == "Patient presents with symptoms of dehydration..."
    assert len(q.options) == 1


def test_attempt_question_serialization_includes_case_study_context_and_match_key():
    """Attempt question response must serialize case_study_context and match_key."""
    opt = AttemptQuestionOption.model_validate({
        "id": uuid.uuid4(),
        "content": "What is the primary diagnosis?",
        "match_value": None,
        "match_key": "5",
        "order_index": 0,
    })
    assert opt.match_key == "5"

    q_data = {
        "id": uuid.uuid4(),
        "type": "CASE_STUDY",
        "content": "Analyze the following case scenario and answer the sub-questions below.",
        "case_study_context": "A 45-year-old male with acute symptoms...",
        "marks": 10,
        "order_index": 0,
        "options": [opt],
    }
    resp = AttemptQuestionResponse.model_validate(q_data)
    assert resp.caseStudyContext == "A 45-year-old male with acute symptoms..."
    assert resp.options[0].match_key == "5"


def test_assessment_generator_agent_case_study_instructions():
    """Agent instructions for case_study must forbid top-level explanation summaries."""
    from unittest.mock import MagicMock
    agent = AssessmentGeneratorAgent(gateway=MagicMock())
    instructions = agent._get_type_instructions("case_study")
    assert "explanation" in instructions
    assert "null or empty string" in instructions
