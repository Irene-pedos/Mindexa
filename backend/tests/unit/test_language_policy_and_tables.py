import pytest
from app.core.ai.language_policy import is_ai_allowed, assert_ai_allowed
from app.core.exceptions import AILanguageBlockedError
from app.agents.review_agent import _format_student_answer
from app.services.question_service import infer_grading_mode
from app.core.constants import GradingMode


def test_language_policy_allowed():
    assert is_ai_allowed("EN") is True
    assert is_ai_allowed("FR") is True
    assert is_ai_allowed("SW") is True
    assert is_ai_allowed(None) is True


def test_language_policy_rwanda_blocked():
    assert is_ai_allowed("RW") is False
    assert is_ai_allowed("rw") is False

    with pytest.raises(AILanguageBlockedError) as exc_info:
        assert_ai_allowed("RW", action="generate_questions")
    assert "AI assistance is disabled for Kinyarwanda-language academic content" in str(exc_info.value)


def test_infer_grading_mode_with_tables():
    # Normal auto-gradable type defaults to AUTO
    assert infer_grading_mode("mcq") == GradingMode.AUTO.value
    
    # Table-requiring question forces SEMI grading mode
    assert infer_grading_mode("mcq", requires_table_answer=True) == GradingMode.SEMI.value
    assert infer_grading_mode("short_answer", requires_table_answer=True) == GradingMode.SEMI.value


def test_review_agent_format_student_table_answer():
    # Non-table answer remains unchanged
    plain = "This is a plain text answer."
    assert _format_student_answer(plain) == plain

    # JSON table answer converts to Markdown table
    json_table = '{"type": "table", "title": "Trial Balance", "headers": ["Account", "Debit", "Credit"], "rows": [["Cash", "1000", ""], ["Revenue", "", "1000"]]}'
    formatted = _format_student_answer(json_table)
    
    assert "**Table: Trial Balance**" in formatted
    assert "| Account | Debit | Credit |" in formatted
    assert "| Cash | 1000 |  |" in formatted
    assert "| Revenue |  | 1000 |" in formatted
