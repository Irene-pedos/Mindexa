from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.agents.base import BaseAgent
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.db.enums import AIActionType


class GeneratedQuestionOption(BaseModel):
    """A single option for a generated question."""
    text: str = Field(..., min_length=1, max_length=1000)
    is_correct: bool
    explanation: str | None = Field(default=None, max_length=2000)


class GeneratedQuestion(BaseModel):
    """Validated structure for a single AI-generated question."""
    question: str = Field(..., min_length=10, max_length=5000)
    options: list[GeneratedQuestionOption] = Field(default_factory=list, max_length=20)
    explanation: str | None = Field(default=None, max_length=5000)
    difficulty: str | None = None
    bloom_level: str | None = None


class AssessmentGeneratorAgent(BaseAgent):
    """Agent responsible for generating structured question drafts."""

    prompt_name = "assessment_generator"
    prompt_version = "v1"

    async def generate(
        self,
        *,
        lecturer_id: uuid.UUID,
        question_type: str,
        difficulty: str,
        count: int,
        subject: str | None = None,
        topic: str | None = None,
        bloom_level: str | None = None,
        additional_context: str | None = None,
        batch_id: uuid.UUID | None = None,
    ) -> tuple[list[GeneratedQuestion], str]:
        """
        Generate a batch of questions using the AI gateway.
        Returns (questions, full_prompt).
        """
        prompt_template = self._get_prompt()
        
        type_instructions = self._get_type_instructions(question_type)
        
        system_content = (
            prompt_template.replace("{{question_type}}", question_type)
            .replace("{{difficulty}}", difficulty)
            .replace("{{count}}", str(count))
            .replace("{{subject}}", subject or "General")
            .replace("{{topic}}", topic or "General")
            .replace("{{bloom_level}}", bloom_level or "Understand")
            .replace("{{additional_context}}", additional_context or "None")
            .replace("{{type_instructions}}", type_instructions)
        )

        # Cap max_tokens: Groq hard-limits completion tokens (free tier: 4096).
        # Allow 800 tokens per question but never exceed 4096 total.
        max_tokens = min(800 * count, 4096)
        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(
                    role="user", 
                    content=f"Generate {count} {question_type} questions for {subject}/{topic} at {difficulty} level."
                ),
            ],
            temperature=0.7,
            max_tokens=max_tokens,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.QUESTION_GENERATION,
            actor_id=lecturer_id,
            actor_role="lecturer",
            subject_entity_type="ai_generation_batch",
            subject_entity_id=batch_id,
            prompt_summary=f"Generating {count} {question_type} questions for {topic}",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}",
        )

        parsed_questions = self._parse_json_output(response.content, GeneratedQuestion, extract_list=True)
        return parsed_questions, system_content

    def _get_type_instructions(self, question_type: str) -> str:
        """Get specific guidance for each question type."""
        instructions = {
            "mcq": (
                "Provide exactly 4 options. Mark exactly 1 as is_correct=true. "
                "Distractors must be plausible but clearly wrong."
            ),
            "true_false": (
                "Provide exactly 2 options: True and False. Mark the correct one."
            ),
            "short_answer": (
                "Set options to []. Provide a model answer (2-4 sentences) in the explanation field."
            ),
            "essay": (
                "Set options to []. Provide detailed grading rubrics and key points in the explanation field."
            ),
            "matching": (
                "Provide matching pairs. In each option: 'text' is the left-side item, "
                "'explanation' is the correct right-side match. All 'is_correct' should be true."
            ),
            "fill_blank": (
                "Use '___' in the question text. Each option is a correct answer for one blank."
            ),
        }
        return instructions.get(question_type, "Provide a well-structured academic question.")
