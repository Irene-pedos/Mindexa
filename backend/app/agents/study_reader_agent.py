from __future__ import annotations

import json
import logging
import random
import uuid
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from app.agents.base import BaseAgent
from app.core.ai.gateway import AIGateway
from app.core.ai.prompt_registry import get_prompt
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.db.enums import AIActionType
from app.schemas.study_reader import (
    PageCheckQuestion,
    PageCheckResponse,
    SkimBullet,
    SkimResponse,
)

logger = logging.getLogger(__name__)


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
        prompt = (
            template.replace("{{title}}", title)
            .replace("{{chunks}}", combined_context)
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

        try:
            parsed: SkimJSONOutput = self._parse_json_output(
                llm_response.content, SkimJSONOutput
            )
            bullets = [
                SkimBullet(
                    bullet=b.get("bullet", ""),
                    page_number=b.get("page_number"),
                )
                for b in parsed.bullets
                if b.get("bullet")
            ]
            if not bullets:
                bullets = [
                    SkimBullet(
                        bullet=f"Overview of key themes and objectives for {title}.",
                        page_number=1,
                    ),
                    SkimBullet(
                        bullet="Primary theoretical foundations, definitions, and formulas.",
                        page_number=2,
                    ),
                    SkimBullet(
                        bullet="Applied problem solving and exam-relevant key takeaways.",
                        page_number=3,
                    ),
                ]
            return SkimResponse(
                title=title,
                summary=parsed.summary or f"Core study overview for {title}.",
                bullets=bullets,
            )
        except Exception as exc:
            logger.warning("Failed to parse skim output: %s", exc)
            return SkimResponse(
                title=title,
                summary=f"Overview for {title}.",
                bullets=[
                    SkimBullet(
                        bullet="Review introduction and foundational concepts.",
                        page_number=1,
                    ),
                    SkimBullet(
                        bullet="Examine primary formulas and process workflows.",
                        page_number=2,
                    ),
                ],
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
        prompt = (
            template.replace("{{title}}", title)
            .replace("{{page_number}}", str(page_number))
            .replace("{{page_context}}", context_payload)
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

        try:
            parsed: PageCheckJSONOutput = self._parse_json_output(
                llm_resp.content, PageCheckJSONOutput
            )
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
                raise ValueError("No questions parsed from LLM response")

            return PageCheckResponse(page_number=page_number, questions=questions)
        except Exception as exc:
            logger.warning("Failed to parse page check questions: %s", exc)
            fallback_opts = [
                "Core definition & properties",
                "Historical backdrop only",
                "Unrelated tangent",
                "Summary notes",
            ]
            correct_val = "Core definition & properties"
            random.shuffle(fallback_opts)
            fallback_correct_idx = fallback_opts.index(correct_val)

            return PageCheckResponse(
                page_number=page_number,
                questions=[
                    PageCheckQuestion(
                        id="q1",
                        question=f"What is the primary principle discussed on page {page_number}?",
                        options=fallback_opts,
                        correct_option_index=fallback_correct_idx,
                        explanation="Page content focuses on primary core definitions and formulas.",
                    )
                ],
            )
