"""
app/agents/question_enhancer_agent.py

Improves/completes a single question in the lecturer's editor and reviews a whole draft
paper for gaps. Both return proposals only; nothing is saved here.
"""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field

from app.agents.assessment_generator_agent import (
    GeneratedQuestionOption,
    completeness_issues,
)
from app.agents.base import BaseAgent
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.core.exceptions import ValidationError
from app.db.enums import AIActionType
from app.schemas.question_ai import (
    EnhanceAction,
    EnhanceQuestionResponse,
    PaperFinding,
    QuestionSnapshot,
    ReviewPaperResponse,
    SnapshotOption,
    BlueprintSectionSummary,
)

ACTION_INSTRUCTIONS: dict[str, str] = {
    "improve_wording": "Rewrite the question so it is clear, concise and unambiguous. Keep the meaning, difficulty, answer and marks the same.",
    "add_explanation": "Write the missing explanation / model answer / marking guidance for this question. Do not change the question or the answer.",
    "add_distractors": "Add plausible but clearly incorrect options (misconceptions) until there are 4 options in total. Keep existing options and the correct answer unchanged.",
    "complete_missing": "Fill in everything that is missing or empty so the question is complete and usable (stem, options, correct answer, model answer, sub-questions as applicable). Do not change parts that are already good.",
    "add_sub_questions": "Write 2 to 4 analytical sub-questions for the case-study scenario, each with answer guidance and a marks value. The marks must add up to the question's total marks.",
    "make_easier": "Make this question easier (simpler wording, more direct) while testing the same concept. Keep marks and question type.",
    "make_harder": "Make this question harder (require more application or analysis) while testing the same concept. Keep marks and question type.",
    "fix_ambiguity": "Find and remove ambiguity, double meanings, or more than one defensible answer. Keep the intended answer.",
}

ENHANCE_SYSTEM = """You are an expert exam-writing assistant helping a university lecturer improve ONE draft question.

Rules:
- Apply ONLY the requested action: {action_text}
- Question type is "{qtype}". Do not change the question type.
- Never invent facts you are not confident about. If you cannot complete something reliably, leave it empty and say so in "summary".
- For multiple-choice: exactly one option is correct. For true/false: exactly two options, one correct.
- For case studies: put the scenario in "case_study_context"; each sub-question is an item in "options" with "text" (the sub-question), "explanation" (answer guidance) and "match_key" (marks as a string); every sub-question has is_correct=true.
- For matching: each option is a pair, "text" = left side, "explanation" = right side, is_correct=true.
- Open-ended types (short_answer, essay, computational, practical): options stay [] and the model answer goes in "explanation".
- Keep the language of the original question.
- If the question contains code, keep it inside the "text" string: escape every double quote as \\" and every line break as \\n so the JSON stays valid. Never output code as its own JSON array.
- Return ONLY a JSON object with this shape and no other text:
{{"question": {{"text": str, "options": [{{"text": str, "explanation": str|null, "is_correct": bool, "match_key": str|null}}], "explanation": str|null, "case_study_context": str|null}},
  "summary": "one sentence on what you changed", "changes": ["short bullet", ...]}}
"""

REVIEW_SYSTEM = """You are an experienced exam moderator reviewing a lecturer's DRAFT paper before it is submitted.
You receive a compact list of questions (numbered from 1) and the planned blueprint. Report real problems only; do not praise.

Fields that are null were simply not provided by the editor (for example per-question difficulty); never report them as missing.
Look for: topics in the blueprint that no question covers; difficulty that does not match the plan; near-duplicate questions;
ambiguous or double-barrelled wording; questions testing recall when the section asks for application; answers that look wrong;
missing question counts per section; marks that look unbalanced.

Return ONLY a JSON object, no other text:
{"summary": "2 sentences max", "findings": [{"severity": "warning"|"suggestion", "code": "SHORT_UPPER_SNAKE", "message": "what is wrong and how to fix it", "question": <number or null>, "section": <section name or null>}]}
At most 12 findings, most important first. Use "warning" only for things that would likely draw a moderator's objection."""


class _EnhancedQuestion(BaseModel):
    text: str = ""
    options: list[GeneratedQuestionOption] = Field(default_factory=list)
    explanation: str | None = None
    case_study_context: str | None = None


class _EnhanceOutput(BaseModel):
    question: _EnhancedQuestion
    summary: str = ""
    changes: list[str] = Field(default_factory=list)


class _Finding(BaseModel):
    severity: str = "suggestion"
    code: str = "REVIEW_NOTE"
    message: str
    question: int | None = None
    section: str | None = None


class _ReviewOutput(BaseModel):
    summary: str = ""
    findings: list[_Finding] = Field(default_factory=list)


def _backend_type(frontend_type: str) -> str:
    t = (frontend_type or "").lower().replace("-", "_")
    return {
        "truefalse": "true_false",
        "shortanswer": "short_answer",
        "fillblank": "fill_blank",
        "casestudy": "case_study",
    }.get(t, t)


class QuestionEnhancerAgent(BaseAgent):
    prompt_name = "question_enhancer"
    prompt_version = "v1"

    async def _ask_json(
        self,
        request: AICompletionRequest,
        model: type[BaseModel],
        *,
        lecturer_id: uuid.UUID,
        subject_entity_type: str,
        prompt_summary: str,
        prompt_version: str,
    ) -> BaseModel:
        """Ask for one JSON object; if the reply is not a readable object, ask once more.

        Models occasionally answer with a bare array (for example when the question contains
        code with unescaped quotes), which cannot be validated. A single follow-up that names the
        problem fixes almost all of those; if it fails again the lecturer gets a plain message
        instead of a raw validation dump.
        """
        for attempt in range(2):
            response = await self.gateway.complete(
                request,
                action_type=AIActionType.ASSESSMENT_AI_SUPPORT,
                actor_id=lecturer_id,
                actor_role="lecturer",
                subject_entity_type=subject_entity_type,
                subject_entity_id=None,
                prompt_summary=prompt_summary + (" (retry)" if attempt else ""),
                prompt_version=prompt_version,
            )
            try:
                return self._parse_json_output(response.content, model)
            except ValidationError:
                if attempt == 1:
                    raise ValidationError(
                        "The AI's answer could not be read this time. Please try again; it usually works on a second attempt.",
                        code="AI_OUTPUT_VALIDATION_FAILED",
                    )
                request.messages.append(AIMessage(role="assistant", content=(response.content or "")[:1500]))
                request.messages.append(
                    AIMessage(
                        role="user",
                        content=(
                            "That reply was not a single valid JSON object. Reply again with ONLY one JSON object "
                            "in the exact shape requested. Escape every double quote and line break inside string "
                            "values (use \\n), and keep any code inside the text string."
                        ),
                    )
                )
                request.temperature = 0.1
        raise AssertionError("unreachable")  # pragma: no cover

    async def enhance(
        self,
        *,
        lecturer_id: uuid.UUID,
        question: QuestionSnapshot,
        action: EnhanceAction,
        instructions: str | None,
        subject: str | None,
        topic: str | None,
    ) -> EnhanceQuestionResponse:
        qtype = _backend_type(question.type)
        system = ENHANCE_SYSTEM.format(action_text=ACTION_INSTRUCTIONS[action], qtype=qtype)
        payload = {
            "subject": subject,
            "topic": topic,
            "difficulty": question.difficulty,
            "marks": question.marks,
            "text": question.text,
            "case_study_context": question.case_study_context,
            "options": [o.model_dump() for o in question.options],
            "explanation": question.explanation,
        }
        import json

        user = "Current question (JSON):\n" + json.dumps(payload, ensure_ascii=False)
        if instructions and instructions.strip():
            user += f"\n\nLecturer's note: {instructions.strip()}"

        request = AICompletionRequest(
            messages=[AIMessage(role="system", content=system), AIMessage(role="user", content=user)],
            temperature=0.3,
            max_tokens=2200 if qtype == "case_study" else 1400,
        )
        out: _EnhanceOutput = await self._ask_json(  # type: ignore[assignment]
            request,
            _EnhanceOutput,
            lecturer_id=lecturer_id,
            subject_entity_type="question",
            prompt_summary=f"Question enhancement: {action} ({qtype})",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}",
        )

        proposed = question.model_copy(deep=True)
        if out.question.text.strip():
            proposed.text = out.question.text.strip()
        if qtype in ("short_answer", "essay", "computational", "practical", "case_study"):
            proposed.explanation = (out.question.explanation or "").strip() or (
                None if qtype == "case_study" else proposed.explanation
            )
        else:
            proposed.explanation = out.question.explanation or proposed.explanation
        if qtype == "case_study" and out.question.case_study_context:
            proposed.case_study_context = out.question.case_study_context.strip()
        if out.question.options or action in ("add_distractors", "add_sub_questions", "complete_missing"):
            proposed.options = [
                SnapshotOption(
                    text=o.text,
                    explanation=o.explanation,
                    is_correct=True if qtype in ("case_study", "matching", "ordering") else o.is_correct,
                    match_key=o.match_key,
                )
                for o in out.question.options
            ] or proposed.options

        if qtype == "case_study" and proposed.options:
            self._balance_case_study_marks(proposed)

        issues, _ = completeness_issues(
            qtype,
            proposed.text,
            [o.model_dump() for o in proposed.options],
            proposed.explanation,
        )
        return EnhanceQuestionResponse(
            question=proposed,
            summary=out.summary.strip() or "Suggested changes ready to review.",
            changes=[c for c in out.changes if c.strip()][:8],
            remaining_issues=issues,
        )

    @staticmethod
    def _balance_case_study_marks(q: QuestionSnapshot) -> None:
        """Sub-question marks must add up to the question's marks (shared evenly)."""
        total = q.marks or 0
        n = len(q.options)
        if total >= n and n:
            base, extra = divmod(total, n)
            for i, opt in enumerate(q.options):
                opt.match_key = str(base + (1 if i < extra else 0))
        else:
            for opt in q.options:
                if not (opt.match_key or "").strip():
                    opt.match_key = "5"

    async def review_paper(
        self,
        *,
        lecturer_id: uuid.UUID,
        questions: list[QuestionSnapshot],
        blueprint: list[BlueprintSectionSummary],
        assessment_type: str | None,
        policy_total: int | None,
        subject: str | None,
    ) -> ReviewPaperResponse:
        import json

        compact: list[dict[str, Any]] = []
        for i, q in enumerate(questions, start=1):
            compact.append(
                {
                    "n": i,
                    "section": q.section,
                    "type": q.type,
                    "marks": q.marks,
                    "difficulty": q.difficulty,
                    "text": (q.text or "")[:280],
                    "options": len(q.options),
                    "has_correct_answer": any(o.is_correct for o in q.options) if q.options else None,
                    "has_model_answer": bool((q.explanation or "").strip()) if not q.options else None,
                }
            )
        user = json.dumps(
            {
                "subject": subject,
                "assessment_type": assessment_type,
                "policy_total_marks": policy_total,
                "blueprint": [b.model_dump() for b in blueprint],
                "questions": compact,
            },
            ensure_ascii=False,
        )
        request = AICompletionRequest(
            messages=[AIMessage(role="system", content=REVIEW_SYSTEM), AIMessage(role="user", content=user)],
            temperature=0.2,
            max_tokens=1600,
        )
        out: _ReviewOutput = await self._ask_json(  # type: ignore[assignment]
            request,
            _ReviewOutput,
            lecturer_id=lecturer_id,
            subject_entity_type="assessment_draft",
            prompt_summary=f"Draft paper review ({len(questions)} questions)",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}_review",
        )

        findings: list[PaperFinding] = []
        for f in out.findings[:12]:
            qid = None
            if f.question and 1 <= f.question <= len(questions):
                qid = questions[f.question - 1].id
            findings.append(
                PaperFinding(
                    severity="warning" if f.severity == "warning" else "suggestion",
                    code=(f.code or "REVIEW_NOTE")[:60],
                    message=f.message[:600],
                    question_id=qid,
                    section=f.section,
                )
            )
        return ReviewPaperResponse(summary=out.summary.strip(), findings=findings)
