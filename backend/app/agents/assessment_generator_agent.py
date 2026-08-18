from __future__ import annotations

import json
import re
import uuid
from typing import Any

from app.agents.base import BaseAgent
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.core.exceptions import ValidationError
from app.db.enums import AIActionType
from pydantic import BaseModel, Field


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
    source_reference: str | None = Field(default=None, max_length=500)


class AssessmentGeneratorAgent(BaseAgent):
    """Agent responsible for generating structured, RAG-grounded question drafts."""

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
        # RAG & blueprint context
        course_material_context: str | None = None,
        blueprint_constraints: str | None = None,
        learning_outcomes: str | None = None,
        marks_per_question: int | None = None,
        batch_id: uuid.UUID | None = None,
    ) -> tuple[list[GeneratedQuestion], str]:
        """
        Generate a batch of questions using the AI gateway.

        The prompt is grounded in:
        - course_material_context: retrieved chunks from lecturer's uploaded materials (RAG)
        - blueprint_constraints: marks allocation and difficulty distribution rules
        - learning_outcomes: outcomes the questions must address
        - additional_context: any extra notes from the lecturer

        Returns (questions, full_prompt).
        """
        prompt_template = self._get_prompt()
        is_rag = bool(course_material_context and course_material_context.strip())
        type_instructions = self._get_type_instructions(question_type, is_rag)

        # Format context blocks — use clear "None provided" fallbacks so the AI
        # knows what's missing rather than hallucinating phantom content.
        material_context_block = (
            course_material_context.strip()
            if course_material_context and course_material_context.strip()
            else (
                "⚠️ No course material has been retrieved. Generate questions based on the "
                "subject/topic parameters only. Flag this in source_reference as 'No material context available'."
            )
        )

        blueprint_block = (
            blueprint_constraints.strip()
            if blueprint_constraints and blueprint_constraints.strip()
            else "No blueprint constraints specified — follow standard academic assessment practices."
        )

        outcomes_block = (
            learning_outcomes.strip()
            if learning_outcomes and learning_outcomes.strip()
            else "No specific learning outcomes provided — address general subject competencies."
        )

        # Additional context from the lecturer's free-text field
        extra_context_block = additional_context.strip() if additional_context else "None"

        # Combine lecturer extra context into the material block if both are present
        if additional_context and additional_context.strip() and course_material_context:
            material_context_block += f"\n\n[Lecturer's Additional Notes]\n{additional_context.strip()}"
        elif additional_context and additional_context.strip() and not course_material_context:
            material_context_block = (
                f"[Lecturer's Additional Notes — No uploaded material retrieved]\n"
                f"{additional_context.strip()}\n\n"
                "⚠️ Flag source_reference as 'Lecturer notes only — no uploaded material retrieved'."
            )

        marks_str = str(marks_per_question) if marks_per_question else "Not specified"

        if not is_rag:
            prompt_template = (
                prompt_template
                .replace(
                    "You MUST ground every question in the course material excerpts provided below.",
                    "Since no course material has been uploaded, you MUST generate questions using your general academic and subject knowledge."
                )
                .replace(
                    "Do NOT invent facts. If the course material does not cover a sub-topic sufficiently, say so in your explanation.",
                    "Ensure all questions and answers are factually correct and accurate based on standard academic consensus."
                )
                .replace(
                    "- Every question MUST be directly traceable to the course material above.",
                    "- Every question must be academically accurate and aligned with standard curriculum standards."
                )
                .replace(
                    "- Factually correct — never contradict the course material.",
                    "- Factually correct according to standard academic consensus."
                )
                .replace(
                    "Generate the questions now. Base them on the course material context provided.",
                    "Generate the questions now. Base them on your general knowledge for the specified subject and topic."
                )
                .replace(
                    '"source_reference": "<which part of the course material this question draws from>"',
                    '"source_reference": "Set this to \'AI Knowledge\'"'
                )
                .replace(
                    "grounded in the course material.",
                    "grounded in the specified topic."
                )
            )

        system_content = (
            prompt_template
            .replace("{{question_type}}", question_type)
            .replace("{{difficulty}}", difficulty)
            .replace("{{count}}", str(count))
            .replace("{{subject}}", subject or "General")
            .replace("{{topic}}", topic or "General")
            .replace("{{bloom_level}}", bloom_level or "Understand")
            .replace("{{type_instructions}}", type_instructions)
            .replace("{{course_material_context}}", material_context_block)
            .replace("{{blueprint_constraints}}", blueprint_block)
            .replace("{{learning_outcomes}}", outcomes_block)
            .replace("{{marks_per_question}}", marks_str)
        )

        # Token budget: Provide ample room for multi-question options, explanations, and rubrics
        max_tokens = min(1000 * count + 1000, 4000)

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(
                    role="user",
                    content=(
                        f"Generate exactly {count} {question_type} question(s) for the course "
                        f"'{subject or 'General'}', topic '{topic or 'General'}', at {difficulty} "
                        f"difficulty, Bloom's level: {bloom_level or 'Understand'}. "
                        + (
                            "Ground every question in the course material context provided. "
                            if is_rag else
                            "Generate questions using your general academic and subject knowledge. "
                        )
                        + "Return ONLY a valid JSON array."
                    ),
                ),
            ],
            temperature=0.5,  # Lower temp for more grounded, less random output
            max_tokens=max_tokens,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.QUESTION_GENERATION,
            actor_id=lecturer_id,
            actor_role="lecturer",
            subject_entity_type="ai_generation_batch",
            subject_entity_id=batch_id,
            prompt_summary=f"Generating {count} {question_type} questions for {topic} [RAG: {'yes' if course_material_context else 'no'}]",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}",
        )

        parsed_questions = self._parse_generated_questions(response.content, expected_question_type=question_type)
        return parsed_questions, system_content

    def _parse_generated_questions(
        self,
        content: str,
        expected_question_type: str | None = None,
    ) -> list[GeneratedQuestion]:
        """Parse and normalize common AI response payload variants."""
        import structlog
        logger = structlog.get_logger(__name__)
        try:
            content_str = content.strip()
            match = re.search(r"```json\s*(.*?)\s*```", content_str, re.DOTALL)
            if not match:
                match = re.search(r"```\s*(.*?)\s*```", content_str, re.DOTALL)

            if match:
                clean_content = match.group(1).strip()
            else:
                first_curly = content_str.find("{")
                first_square = content_str.find("[")

                start = -1
                if first_curly != -1 and first_square != -1:
                    start = min(first_curly, first_square)
                elif first_curly != -1:
                    start = first_curly
                elif first_square != -1:
                    start = first_square

                last_curly = content_str.rfind("}")
                last_square = content_str.rfind("]")
                end = max(last_curly, last_square)

                if start != -1 and end != -1 and start < end:
                    clean_content = content_str[start:end + 1].strip()
                else:
                    clean_content = content_str

            import json_repair
            data = json_repair.loads(clean_content)
            if data is None:
                data = json.loads(clean_content, strict=False)

            normalized_items = self._coerce_payload_to_question_items(data, expected_question_type=expected_question_type)
            
            questions = []
            for item in normalized_items:
                try:
                    questions.append(GeneratedQuestion.model_validate(item))
                except Exception as exc:
                    logger.warning("Skipped invalid generated question item", item=item, error=str(exc))

            if not questions:
                raise ValidationError(
                    "No valid questions could be parsed or validated from the AI response.",
                    code="AI_OUTPUT_VALIDATION_FAILED"
                )

            return questions
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            logger.error("Failed parsing generated questions", raw_content=content, error=str(exc))
            raise ValidationError(
                f"The AI returned an invalid response: {str(exc)}",
                code="AI_OUTPUT_VALIDATION_FAILED",
            ) from exc
        except ValidationError:
            raise

    def _coerce_payload_to_question_items(
        self,
        data: Any,
        expected_question_type: str | None = None,
    ) -> list[dict[str, Any]]:
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            for key in ("questions", "items", "data", "results"):
                value = data.get(key)
                if isinstance(value, list):
                    items = value
                    break
            else:
                if any(key in data for key in ("question", "stem", "prompt", "question_text", "text")):
                    items = [data]
                else:
                    raise ValueError("AI response is a dict but no question list was found.")
        else:
            raise ValueError("AI response must be a JSON array or object.")

        normalized_items: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                raise ValueError("Each AI question entry must be an object.")
            normalized_items.append(self._normalize_question_item(item, question_type=expected_question_type))

        if not normalized_items:
            raise ValueError("AI response did not contain any question entries.")

        return normalized_items

    def _normalize_question_item(
        self,
        item: dict[str, Any],
        question_type: str | None = None,
    ) -> dict[str, Any]:
        question_text = (
            item.get("question")
            or item.get("stem")
            or item.get("prompt")
            or item.get("question_text")
            or item.get("text")
        )
        if not question_text:
            raise ValueError("A generated question is missing its text/stem.")

        raw_options = item.get("options")
        if raw_options is None:
            raw_options = item.get("choices")
        if raw_options is None:
            raw_options = item.get("answers") or []

        normalized_options: list[dict[str, Any]] = []
        if isinstance(raw_options, list):
            for opt in raw_options:
                if isinstance(opt, dict):
                    option_text = (
                        opt.get("text")
                        or opt.get("option_text")
                        or opt.get("content")
                        or opt.get("label")
                    )
                    if option_text or opt.get("explanation") is not None:
                        normalized_options.append(
                            {
                                "text": str(option_text or ""),
                                "is_correct": bool(opt.get("is_correct", False)),
                                "explanation": opt.get("explanation") or opt.get("reason"),
                            }
                        )
                elif isinstance(opt, str):
                    normalized_options.append({"text": opt, "is_correct": False, "explanation": None})

        # Defensively normalize True/False questions so they always contain both options
        q_type_str = str(question_type or item.get("question_type") or "").lower()
        if q_type_str in ("true_false", "truefalse") or (
            normalized_options
            and len(normalized_options) <= 2
            and any(opt.get("text", "").strip().lower() in ("true", "false") for opt in normalized_options)
        ):
            true_opt = next((opt for opt in normalized_options if opt.get("text", "").strip().lower() == "true"), None)
            false_opt = next((opt for opt in normalized_options if opt.get("text", "").strip().lower() == "false"), None)
            if true_opt and not false_opt:
                is_true_correct = true_opt.get("is_correct", False)
                normalized_options = [
                    true_opt,
                    {
                        "text": "False",
                        "is_correct": not is_true_correct,
                        "explanation": None if is_true_correct else (true_opt.get("explanation") or "The statement is false."),
                    },
                ]
            elif false_opt and not true_opt:
                is_false_correct = false_opt.get("is_correct", False)
                normalized_options = [
                    {
                        "text": "True",
                        "is_correct": not is_false_correct,
                        "explanation": None if is_false_correct else (false_opt.get("explanation") or "The statement is true."),
                    },
                    false_opt,
                ]
            elif not true_opt and not false_opt and normalized_options:
                first = normalized_options[0]
                is_correct = first.get("is_correct", True)
                normalized_options = [
                    {"text": "True", "is_correct": is_correct, "explanation": first.get("explanation")},
                    {"text": "False", "is_correct": not is_correct, "explanation": None},
                ]
            elif not normalized_options:
                normalized_options = [
                    {"text": "True", "is_correct": True, "explanation": "The statement is true."},
                    {"text": "False", "is_correct": False, "explanation": "The statement is false."},
                ]

        explanation = (
            item.get("explanation")
            or item.get("model_answer")
            or item.get("answer")
            or item.get("rubric")
            or item.get("solution")
        )

        return {
            "question": str(question_text),
            "options": normalized_options,
            "explanation": explanation,
            "difficulty": item.get("difficulty") or item.get("level"),
            "bloom_level": item.get("bloom_level") or item.get("bloom") or item.get("taxonomy"),
            "source_reference": item.get("source_reference") or item.get("source"),
        }

    def _get_type_instructions(self, question_type: str, is_rag: bool = True) -> str:
        """Get specific guidance for each question type."""
        instructions = {
            "mcq": (
                "In the 'options' array, provide EXACTLY 4 options (A, B, C, D). "
                "Mark exactly 1 as is_correct=true and the remaining 3 as is_correct=false. "
                "Distractors must be plausible but definitively incorrect. "
                + (
                    "Each distractor should address a common misconception drawn from the course material."
                    if is_rag else
                    "Each distractor should address a common misconception related to this topic."
                )
            ),
            "true_false": (
                "In the 'options' array, provide EXACTLY 2 options: "
                '[{"text": "True", "is_correct": true/false, "explanation": "..."}, '
                '{"text": "False", "is_correct": true/false, "explanation": "..."}]. '
                "Exactly ONE of the two options MUST have is_correct: true, and the other MUST have is_correct: false. "
                + (
                    "The statement must be directly verifiable from the course material."
                    if is_rag else
                    "The statement must be factually correct and verifiable."
                )
            ),
            "short_answer": (
                "Set options to []. "
                "In the 'explanation' field, you MUST format the content exactly as: "
                "'Model Answer: <insert detailed model answer of 3-6 sentences>\\n\\nRubric: <insert 2-point marking guide: 1 mark for core concept, 1 mark for detail>'."
            ),
            "essay": (
                "Set options to []. "
                "In the 'explanation' field, you MUST format the content exactly as: "
                "'Model Answer: <insert key points that must appear in a full-mark answer>\\n\\nRubric: <insert detailed rubric: marks for argument, evidence, structure, conclusion>\\n\\nWord Limit: <insert expected number, e.g. 500> words'."
            ),
            "matching": (
                "In the 'options' array, provide 4 to 6 matching pairs. "
                "For EACH option object: "
                "- 'text' MUST be the left-column concept/term (e.g. '<header> element'). "
                "- 'explanation' MUST be the right-column matching definition/target (e.g. 'Introductory content or navigation links'). "
                "- 'is_correct' MUST be true for all pairs. "
                + (
                    "All terms must come from the course material."
                    if is_rag else
                    "All terms must be relevant to the topic."
                )
            ),
            "fill_blank": (
                "Use '___' in the question text for each blank. "
                "In the 'options' array, provide the correct answer for each blank in order. All options should have is_correct: true. "
                + (
                    "Blanks must target key terms, definitions, or values from the course material."
                    if is_rag else
                    "Blanks must target key terms, definitions, or values related to this topic."
                )
            ),
            "case_study": (
                "Write a realistic, detailed scenario (150-250 words) in the question stem. "
                "In the options array, generate 1 to 3 specific analytical sub-questions. "
                "For each option (sub-question): "
                "- 'text' is the sub-question text. "
                "- 'explanation' is the answer guidance / grading criteria for this sub-question. "
                "- 'is_correct' should be true. "
                "- 'match_key' should be the point allocation for this sub-question (e.g. 5). "
                "Set the top-level 'explanation' field to null or empty string — do not summarize an answer at the top level."
            ),
            "computational": (
                "Set options to []. "
                "In the 'explanation' field, you MUST format the content exactly as: "
                "'Solution Steps: <insert step-by-step worked solution and formula details>\\n\\nNumerical Answer: <insert exact numerical answer value>\\n\\nTolerance: <insert tolerance value, e.g. 0.05>'."
            ),
            "ordering": (
                "In the 'options' array, provide 3 to 6 items in their CORRECT chronological or logical sequence. "
                "All ordering options should have is_correct: true. "
                + (
                    "Items must represent a meaningful process or sequence from the course material."
                    if is_rag else
                    "Items must represent a meaningful process or sequence related to this topic."
                )
            ),
            "practical": (
                "Set options to []. "
                "Describe the practical task clearly in the question stem: equipment needed, procedure to follow, expected output. "
                "In the 'explanation' field, provide expected results, marking rubric, and safety guidelines."
            ),
        }
        return instructions.get(question_type, "Provide a well-structured academic question grounded in the course material.")
