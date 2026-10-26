from __future__ import annotations

import random
import uuid
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from app.agents.base import BaseAgent
from app.core.ai.gateway import AIGateway
from app.core.ai.prompt_registry import get_prompt
from app.core.ai.prompt_render import render_prompt, untrusted_block
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.core.exceptions import ValidationError
from app.db.enums import AIActionType
from app.schemas.study_reader import (
    PageCheckQuestion,
    PageCheckResponse,
    SkimBullet,
    SkimResponse,
)


class SkimJSONOutput(BaseModel):
    summary: str = Field(default="Document overview.")
    bullets: List[dict[str, Any]] = Field(default_factory=list)


class PageCheckJSONOutput(BaseModel):
    questions: List[dict[str, Any]] = Field(default_factory=list)


class StudyReaderAgent(BaseAgent):
    """
    Agent responsible for Study Reader AI operations:
    - Rapid document skimming with page references (DOCUMENT_SUMMARY)
    - Active recall page check quizzes grounded in page chunks (GENERATE_KNOWLEDGE_CHECK)

    All calls route through audited AIGateway and log to AIActionLog.
    """

    prompt_name = "study_reader"
    prompt_version = "v1"

    def __init__(self, gateway: AIGateway) -> None:
        super().__init__(gateway)

    async def skim(
        self,
        title: str,
        chunks_text: List[str],
        student_id: uuid.UUID,
        source_id: uuid.UUID,
        source_kind: str,
    ) -> SkimResponse:
        """
        Generate rapid skimming summary for study material.
        Audited as AIActionType.DOCUMENT_SUMMARY on the specific resource entity.
        """
        combined_context = (
            "\n---\n".join(chunks_text) if chunks_text else f"Material Title: {title}"
        )

        template = get_prompt("study_reader_skim", "v1")
        prompt = render_prompt(
            template,
            {"title": title, "chunks": untrusted_block("study_material", combined_context)},
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(
                    role="system",
                    content="You are an expert academic tutor. Analyze the study material and generate an executive summary in valid JSON.",
                ),
                AIMessage(role="user", content=prompt),
            ],
            temperature=0.2,
            max_tokens=1500,
        )

        llm_response = await self.gateway.complete(
            request,
            action_type=AIActionType.DOCUMENT_SUMMARY,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type=source_kind,
            subject_entity_id=source_id,
            prompt_summary=f"Generate quick skim for {title[:100]}",
            prompt_version="v1",
        )

        # A malformed answer is surfaced as an error (the parser raises a user-safe
        # ValidationError). Inventing generic bullets with made-up page numbers would present
        # fabricated content as if it came from the student's document.
        parsed: SkimJSONOutput = self._parse_json_output(llm_response.content, SkimJSONOutput)
        bullets = [
            SkimBullet(bullet=b.get("bullet", ""), page_number=b.get("page_number"))
            for b in parsed.bullets
            if b.get("bullet")
        ]
        if not bullets:
            raise ValidationError(
                "The AI could not produce a usable skim of this document. Please try again.",
                code="AI_OUTPUT_VALIDATION_FAILED",
            )
        return SkimResponse(
            title=title,
            summary=parsed.summary or f"Core study overview for {title}.",
            bullets=bullets,
        )

    async def generate_page_check(
        self,
        title: str,
        page_number: int,
        page_context: str,
        student_id: uuid.UUID,
        source_id: uuid.UUID,
        source_kind: str,
        selected_text: Optional[str] = None,
    ) -> PageCheckResponse:
        """
        Generate active recall multiple choice questions grounded in current page text.
        Audited as AIActionType.GENERATE_KNOWLEDGE_CHECK on the specific resource entity.
        """
        context_payload = page_context
        if selected_text:
            context_payload = (
                f"[FOCUS EXCERPT]:\n{selected_text}\n\n[PAGE CONTEXT]:\n{page_context}"
            )

        template = get_prompt("study_reader_page_check", "v1")
        prompt = render_prompt(
            template,
            {
                "title": title,
                "page_number": str(page_number),
                "page_context": untrusted_block("study_page", context_payload),
            },
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(
                    role="system",
                    content="You are an academic assessor creating a quick active recall quiz grounded strictly in the provided text.",
                ),
                AIMessage(role="user", content=prompt),
            ],
            temperature=0.3,
            max_tokens=1500,
        )

        llm_resp = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_KNOWLEDGE_CHECK,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type=source_kind,
            subject_entity_id=source_id,
            prompt_summary=f"Generate active recall page check for {title[:80]} (page {page_number})",
            prompt_version="v1",
        )

        # As with skim: a malformed answer is an error, not a made-up quiz graded as if real.
        parsed: PageCheckJSONOutput = self._parse_json_output(llm_resp.content, PageCheckJSONOutput)
        questions: List[PageCheckQuestion] = []
        for idx, q in enumerate(parsed.questions):
            if not q.get("question"):
                continue
            opts = list(q.get("options", ["Option 1", "Option 2", "Option 3", "Option 4"]))
            raw_idx = int(q.get("correct_option_index", 0))
            # Identify the correct answer text before shuffling
            correct_text = opts[raw_idx] if 0 <= raw_idx < len(opts) else (opts[0] if opts else "")

            # Shuffle options so the correct answer is never predictably first
            if len(opts) > 1:
                random.shuffle(opts)
                new_idx = opts.index(correct_text) if correct_text in opts else 0
            else:
                new_idx = 0

            questions.append(
                PageCheckQuestion(
                    id=q.get("id", f"q{idx+1}"),
                    question=q.get("question", "Recall question"),
                    options=opts,
                    correct_option_index=new_idx,
                    explanation=q.get("explanation", "Correct based on course text."),
                )
            )

        if not questions:
            raise ValidationError(
                "The AI could not produce usable questions for this page. Please try again.",
                code="AI_OUTPUT_VALIDATION_FAILED",
            )

        return PageCheckResponse(page_number=page_number, questions=questions)
