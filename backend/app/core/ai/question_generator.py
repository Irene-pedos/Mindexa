"""
app/core/ai/question_generator.py

AI Question Generator module for Mindexa Platform.
Integrated with AssessmentGeneratorAgent for audited, validated generation.
"""

import logging
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.assessment_generator_agent import AssessmentGeneratorAgent
from app.core.ai.gateway import AIGateway
from app.core.ai.provider_factory import get_ai_provider

logger = logging.getLogger(__name__)


# ─── Data Classes ─────────────────────────────────────────────────────────────


@dataclass
class GenerationContext:
    """Structured input to the question generator."""
    question_type: str
    difficulty: str
    count: int
    subject: str | None = None
    topic: str | None = None
    bloom_level: str | None = None
    additional_context: str | None = None
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    lecturer_id: uuid.UUID | None = None


@dataclass
class GeneratedQuestionRaw:
    """Raw output for a single AI-generated question (before DB storage)."""
    question_type: str
    difficulty: str
    raw_content: str
    parsed_successfully: bool
    question_text: str | None = None
    options: list[dict[str, Any]] | None = None
    explanation: str | None = None
    parse_error: str | None = None
    bloom_level: str | None = None


@dataclass
class GenerationResult:
    """Final result of a generation batch call."""
    request_id: str
    context: GenerationContext
    questions: list[GeneratedQuestionRaw]
    total_generated: int
    total_failed: int
    provider: str
    model_used: str
    full_prompt: str | None = None
    tokens_used: int | None = None
    error: str | None = None


# ─── Main Generator ───────────────────────────────────────────────────────────


async def generate_questions(
    context: GenerationContext, 
    db: AsyncSession | None = None
) -> GenerationResult:
    """
    Generate questions for the given context using AssessmentGeneratorAgent.
    
    Args:
        context: Structured generation context.
        db: AsyncSession for auditing (required for AIGateway).

    Returns:
        GenerationResult with parsed questions and metadata.
    """
    if not db:
        return GenerationResult(
            request_id=context.request_id,
            context=context,
            questions=[],
            total_generated=0,
            total_failed=context.count,
            provider="system",
            model_used="none",
            error="AsyncSession is required for audited generation.",
        )

    provider = get_ai_provider()
    gateway = AIGateway(db, provider)
    agent = AssessmentGeneratorAgent(gateway)

    try:
        # ── Agent call ────────────────────────────────────────────────────────
        questions, full_prompt = await agent.generate(
            lecturer_id=context.lecturer_id or uuid.uuid4(),
            question_type=context.question_type,
            difficulty=context.difficulty,
            count=context.count,
            subject=context.subject,
            topic=context.topic,
            bloom_level=context.bloom_level,
            additional_context=context.additional_context,
            batch_id=uuid.UUID(context.request_id) if context.request_id else None,
        )

        # ── Map to Legacy Output ──────────────────────────────────────────────
        raw_questions = []
        for q in questions:
            raw_questions.append(
                GeneratedQuestionRaw(
                    question_type=context.question_type,
                    difficulty=context.difficulty,
                    raw_content=q.model_dump_json(),
                    parsed_successfully=True,
                    question_text=q.question,
                    options=[opt.model_dump() for opt in q.options],
                    explanation=q.explanation,
                    bloom_level=q.bloom_level or context.bloom_level,
                )
            )

        return GenerationResult(
            request_id=context.request_id,
            context=context,
            questions=raw_questions,
            total_generated=len(raw_questions),
            total_failed=0,
            provider=provider.name,
            model_used=provider.default_model,
            full_prompt=full_prompt,
        )

    except Exception as e:
        err_msg = str(e)
        logger.error(
            "Generation failed for request %s: %s",
            context.request_id,
            err_msg,
            exc_info=True,
        )
        return GenerationResult(
            request_id=context.request_id,
            context=context,
            questions=[],
            total_generated=0,
            total_failed=context.count,
            provider="unknown",
            model_used="unknown",
            error=err_msg,
        )
