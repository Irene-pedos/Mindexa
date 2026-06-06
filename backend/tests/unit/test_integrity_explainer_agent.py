import pytest
import uuid
import json
from unittest.mock import AsyncMock, MagicMock, patch
from app.agents.integrity_explainer_agent import IntegrityExplainerAgent, IntegrityExplainerOutput
from app.core.ai.gateway import AIGateway
from app.core.ai.providers import AICompletionResponse
from app.core.exceptions import ValidationError
from app.services.integrity_service import IntegrityService
from app.db.enums import IntegrityFlagStatus

@pytest.mark.asyncio
async def test_integrity_explainer_returns_validated_output():
    # Mock Gateway
    gateway = AsyncMock(spec=AIGateway)
    
    # Mock successful response
    mock_explainer = {
        "explanation": "The system recorded multiple tab switches within a short time.",
        "timeline_summary": "At 10:01, the student switched tabs. At 10:05, another switch occurred.",
        "escalation_rationale": "Three tab switches triggered WARNING_1. Five triggered WARNING_2.",
        "risk_level_context": "Medium risk based on standard thresholds."
    }
    
    gateway.complete.return_value = AICompletionResponse(
        content=json.dumps(mock_explainer),
        provider="groq",
        model="llama3-8b",
    )
    
    agent = IntegrityExplainerAgent(gateway)
    output = await agent.explain_flag(
        lecturer_id=uuid.uuid4(),
        attempt_id=uuid.uuid4(),
        assessment_title="Math 101 Exam",
        total_warnings=2,
        flag_description="Repeated tab switching",
        event_counts={"TAB_SWITCH": 5},
        events=[{"event_type": "TAB_SWITCH", "created_at": "2023-10-27T10:00:00Z"}]
    )
    
    assert isinstance(output, IntegrityExplainerOutput)
    assert "tab switches" in output.explanation
    assert output.risk_level_context is not None

@pytest.mark.asyncio
async def test_integrity_explainer_rejects_malformed_json():
    gateway = AsyncMock(spec=AIGateway)
    gateway.complete.return_value = AICompletionResponse(
        content="Invalid JSON",
        provider="groq",
        model="llama3-8b",
    )
    
    agent = IntegrityExplainerAgent(gateway)
    with pytest.raises(ValidationError) as exc_info:
        await agent.explain_flag(
            lecturer_id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            assessment_title="Math 101 Exam",
            total_warnings=0,
            flag_description="Test",
            event_counts={},
            events=[]
        )
    
    assert exc_info.value.code == "AI_OUTPUT_VALIDATION_FAILED"

@pytest.mark.asyncio
async def test_integrity_service_does_not_use_ai_for_flag_decisions():
    # This test verifies that the resolve_flag method in IntegrityService
    # does NOT call the AI agent. The AI agent is strictly for explaining
    # existing flags, not making decisions.
    
    db = AsyncMock()
    service = IntegrityService(db)
    
    # Mock flag
    mock_flag = MagicMock()
    mock_flag.status = IntegrityFlagStatus.OPEN
    mock_flag.attempt_id = uuid.uuid4()
    
    service.integrity_repo = AsyncMock()
    service.integrity_repo.get_flag_by_id.return_value = mock_flag
    service.attempt_repo = AsyncMock()
    service.result_repo = AsyncMock()
    
    # Patch the agent to ensure it's NEVER called during flag resolution
    with patch("app.agents.integrity_explainer_agent.IntegrityExplainerAgent.explain_flag", new_callable=AsyncMock) as mock_explain:
        
        await service.resolve_flag(
            flag_id=uuid.uuid4(),
            new_status=IntegrityFlagStatus.CONFIRMED,
            resolved_by_id=uuid.uuid4(),
            resolution_notes="Manual review confirmed."
        )
        
        # Verify the AI was NOT involved in the decision
        mock_explain.assert_not_called()
        
        # Verify normal DB operations occurred
        service.integrity_repo.resolve_flag.assert_called_once()
        service.attempt_repo.set_flagged.assert_called_once()
