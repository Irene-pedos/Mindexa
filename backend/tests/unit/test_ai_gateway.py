from unittest.mock import AsyncMock, MagicMock
import pytest
from app.core.ai.gateway import AIGateway
from app.core.ai.providers import AICompletionRequest, AICompletionResponse, BaseProvider, AIMessage
from app.core.exceptions import RateLimitError, ServiceUnavailableError

@pytest.mark.asyncio
async def test_gateway_compiles_errors_on_all_fail():
    # Arrange
    db_mock = MagicMock()
    db_mock.add = MagicMock()
    db_mock.flush = AsyncMock()
    db_mock.commit = AsyncMock()

    # Create two failing providers
    provider1 = MagicMock(spec=BaseProvider)
    provider1.name = "groq"
    provider1.default_model = "model1"
    provider1.complete = AsyncMock(side_effect=ServiceUnavailableError("Failed because key is invalid"))

    provider2 = MagicMock(spec=BaseProvider)
    provider2.name = "gemini"
    provider2.default_model = "model2"
    provider2.complete = AsyncMock(side_effect=Exception("Timeout exception"))

    gateway = AIGateway(db=db_mock, chat_providers=[provider1, provider2], embedding_providers=[])

    request = AICompletionRequest(
        messages=[AIMessage(role="user", content="hi")],
        temperature=0.7,
        max_tokens=10
    )

    # Act & Assert
    with pytest.raises(ServiceUnavailableError) as exc_info:
        await gateway.complete(request, action_type="QUESTION_GENERATION", actor_id=None, actor_role=None)
    
    # Assert errors are compiled
    assert "All configured AI providers failed" in str(exc_info.value)
    assert "groq: Failed because key is invalid" in str(exc_info.value)
    assert "gemini: Exception (Timeout exception)" in str(exc_info.value)


@pytest.mark.asyncio
async def test_gateway_fallback_success():
    # Arrange
    db_mock = MagicMock()
    db_mock.add = MagicMock()
    db_mock.flush = AsyncMock()
    db_mock.commit = MagicMock() # commit is synchronous or async depending on usage, gateway does await self.db.commit(), so it must be AsyncMock
    db_mock.commit = AsyncMock()

    # First provider fails, second succeeds
    provider1 = MagicMock(spec=BaseProvider)
    provider1.name = "groq"
    provider1.default_model = "model1"
    provider1.complete = AsyncMock(side_effect=ServiceUnavailableError("Down"))

    expected_response = AICompletionResponse(
        content="Success content",
        provider="gemini",
        model="model2",
        finish_reason="stop",
        prompt_tokens=10,
        completion_tokens=5,
        total_tokens=15,
        raw={}
    )
    provider2 = MagicMock(spec=BaseProvider)
    provider2.name = "gemini"
    provider2.default_model = "model2"
    provider2.complete = AsyncMock(return_value=expected_response)

    gateway = AIGateway(db=db_mock, chat_providers=[provider1, provider2], embedding_providers=[])

    request = AICompletionRequest(
        messages=[AIMessage(role="user", content="hi")],
        temperature=0.7,
        max_tokens=10
    )

    # Act
    result = await gateway.complete(request, action_type="QUESTION_GENERATION", actor_id=None, actor_role=None)

    # Assert
    assert result == expected_response
    provider1.complete.assert_called_once()
    provider2.complete.assert_called_once()
