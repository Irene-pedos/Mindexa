"""
app/core/ai/question_generator.py

AI Question Generator module for Mindexa Platform.

This module is the interface between the AI Generation Service and the
underlying AI provider (OpenAI, Anthropic, or other LLM).

DESIGN:
    - Accepts a structured GenerationContext input
    - Builds a structured prompt from that context
    - Calls the AI provider (mocked cleanly for now)
    - Returns a list of GeneratedQuestionRaw objects (raw AI output per question)
    - Does NOT interact with the database

MOCK STRATEGY:
    The mock provider returns realistic structured JSON that the parser
    can process correctly. The mock:
        - Respects the requested question type
        - Respects the difficulty level
        - Returns properly structured MCQ / essay / other types
        - Simulates a realistic AI response format

    To swap in a real provider, replace _call_mock_provider() with
    _call_openai_provider() or _call_anthropic_provider().

PROMPT ENGINEERING:
    The prompt instructs the AI to return a JSON array.
    Each array element has:
        {
            "question": "<stem>",
            "options": [
                {"text": "<option>", "is_correct": true/false, "explanation": "<why>"}
            ],
            "explanation": "<model answer / rationale>",
            "difficulty": "easy|medium|hard",
            "bloom_level": "<level>"
        }

    For essay/short_answer/computational/case_study:
        options = [] (empty array)
        explanation = model answer guidance

    For ordering:
        options = list of items in correct order
        Each option has is_correct=true (ordering is the correct sequence)
"""

import json
import logging
import random
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ─── Data Classes ─────────────────────────────────────────────────────────────


@dataclass
class GenerationContext:
    """
    Structured input to the question generator.

    All fields guide the prompt construction and AI generation.
    """

    question_type: str
    difficulty: str
    count: int
    subject: Optional[str] = None
    topic: Optional[str] = None
    bloom_level: Optional[str] = None
    additional_context: Optional[str] = None
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))


@dataclass
class GeneratedQuestionRaw:
    """
    Raw output for a single AI-generated question (before DB storage).
    """

    question_type: str
    difficulty: str
    raw_content: str             # The full raw AI output for this question
    parsed_successfully: bool
    question_text: Optional[str] = None
    options: Optional[List[Dict[str, Any]]] = None   # List of option dicts
    explanation: Optional[str] = None
    parse_error: Optional[str] = None
    bloom_level: Optional[str] = None


@dataclass
class GenerationResult:
    """
    Final result of a generation batch call.
    """

    request_id: str
    context: GenerationContext
    questions: List[GeneratedQuestionRaw]
    total_generated: int
    total_failed: int
    provider: str
    model_used: str
    tokens_used: Optional[int] = None
    error: Optional[str] = None


# ─── Prompt Builder ───────────────────────────────────────────────────────────


def build_prompt(context: GenerationContext) -> str:
    """
    Build a structured LLM prompt from the generation context.

    Returns a prompt string that instructs the AI to produce
    a JSON array of question objects.
    """
    type_instructions = _type_specific_instructions(context.question_type)

    subject_line = f"Subject: {context.subject}" if context.subject else ""
    topic_line = f"Topic / Focus Area: {context.topic}" if context.topic else ""
    bloom_line = (
        f"Target Bloom's Taxonomy Level: {context.bloom_level}"
        if context.bloom_level
        else ""
    )
    context_line = (
        f"\nAdditional Context:\n{context.additional_context}"
        if context.additional_context
        else ""
    )

    meta_lines = "\n".join(
        line for line in [subject_line, topic_line, bloom_line] if line
    )

    prompt = f"""You are an expert academic question writer for a higher education assessment platform.
Generate exactly {context.count} {context.question_type.upper().replace("_", " ")} question(s) at {context.difficulty.upper()} difficulty level.

{meta_lines}{context_line}

{type_instructions}

RESPONSE FORMAT:
Return ONLY a valid JSON array. No preamble, no explanation outside the JSON.
Each element must follow this exact structure:
{{
    "question": "<complete question stem>",
    "options": [
        {{"text": "<option text>", "is_correct": true/false, "explanation": "<brief rationale>"}}
    ],
    "explanation": "<model answer or grading guidance>",
    "difficulty": "{context.difficulty}",
    "bloom_level": "<bloom taxonomy level>"
}}

For question types without options (essay, short_answer, computational, case_study):
    Set "options" to an empty array [].
    Set "explanation" to the model answer guidance.

Ensure questions are:
- Academically rigorous and appropriate for university level
- Unambiguous and clearly written
- Free of cultural bias
- Factually correct
- At the specified difficulty level

Return the JSON array now:"""

    return prompt


def _type_specific_instructions(question_type: str) -> str:
    instructions = {
        "mcq": (
            "For MCQ: Provide exactly 4 options. Mark exactly 1 as is_correct=true. "
            "All distractors must be plausible but clearly incorrect."
        ),
        "true_false": (
            "For True/False: Provide exactly 2 options: {text: 'True', ...} and {text: 'False', ...}. "
            "Mark the correct one as is_correct=true."
        ),
        "short_answer": (
            "For Short Answer: Set options to []. "
            "Write a clear question that can be answered in 2-4 sentences. "
            "Provide a model answer in explanation."
        ),
        "essay": (
            "For Essay: Set options to []. "
            "Write an open-ended question requiring analytical thinking. "
            "Provide grading guidance in explanation (key points to award marks for)."
        ),
        "matching": (
            "For Matching: Provide 4-6 option pairs. "
            "Each option has: text (left side item), is_correct=true, "
            "and explanation (the matching right side item). "
            "All options are is_correct=true since all pairs are correct matches."
        ),
        "fill_blank": (
            "For Fill-in-the-Blank: Write the question with blanks indicated as '___'. "
            "Each option represents one correct answer for one blank, in order."
        ),
        "computational": (
            "For Computational: Write a problem requiring mathematical or logical computation. "
            "Set options to []. Provide step-by-step solution in explanation."
        ),
        "case_study": (
            "For Case Study: Write a scenario followed by 2-3 sub-questions. "
            "Set options to []. Provide comprehensive model answers in explanation."
        ),
        "ordering": (
            "For Ordering: Provide 4-6 items that must be arranged in a specific sequence. "
            "List them in the CORRECT ORDER in the options array. "
            "All options are is_correct=true (they form the correct sequence)."
        ),
    }
    return instructions.get(
        question_type,
        "Generate a well-structured academic question with complete options and explanation.",
    )


# ─── Mock Provider ────────────────────────────────────────────────────────────


def _call_mock_provider(prompt: str, context: GenerationContext) -> Dict[str, Any]:
    """
    Mock AI provider that returns realistic structured question JSON.

    Returns the same structure that a real OpenAI/Anthropic call would return.
    The mock generates type-appropriate content based on the context.
    """
    questions = []

    for i in range(context.count):
        question = _generate_mock_question(context, index=i)
        questions.append(question)

    return {
        "content": json.dumps(questions, indent=2),
        "model": "mock-gpt-4o",
        "provider": "mock",
        "tokens_used": random.randint(500, 2000) * context.count,
    }


def _generate_mock_question(
    context: GenerationContext, index: int
) -> Dict[str, Any]:
    """Generate a single realistic mock question for the given context."""

    subject = context.subject or "General Knowledge"
    topic = context.topic or "core concepts"
    difficulty = context.difficulty
    qtype = context.question_type

    # Difficulty-appropriate language complexity
    complexity_hint = {
        "easy": "basic recall of",
        "medium": "application of",
        "hard": "critical analysis of",
    }.get(difficulty, "understanding of")

    bloom_level = context.bloom_level or {
        "easy": "remember",
        "medium": "apply",
        "hard": "analyze",
    }.get(difficulty, "understand")

    question_num = index + 1

    if qtype == "mcq":
        return {
            "question": (
                f"Question {question_num}: Which of the following best describes "
                f"the {complexity_hint} {topic} in {subject}?"
            ),
            "options": [
                {
                    "text": f"The {topic} principle involves systematic organization and logical structure.",
                    "is_correct": True,
                    "explanation": "This is correct because it captures the fundamental definition.",
                },
                {
                    "text": f"The {topic} principle involves random selection of components.",
                    "is_correct": False,
                    "explanation": "Incorrect — randomness is not a defining characteristic here.",
                },
                {
                    "text": f"The {topic} principle is only applicable in theoretical contexts.",
                    "is_correct": False,
                    "explanation": "Incorrect — it has practical applications.",
                },
                {
                    "text": f"The {topic} principle depends entirely on external factors.",
                    "is_correct": False,
                    "explanation": "Incorrect — internal factors are equally significant.",
                },
            ],
            "explanation": (
                f"The {topic} principle in {subject} involves systematic organization "
                f"and logical structure. Students should understand its core definition "
                f"and be able to distinguish it from related concepts."
            ),
            "difficulty": difficulty,
            "bloom_level": bloom_level,
        }

    elif qtype == "true_false":
        is_true = random.choice([True, False])
        statement = (
            f"{topic.capitalize()} in {subject} always requires explicit documentation."
            if is_true
            else f"{topic.capitalize()} in {subject} is independent of all external constraints."
        )
        return {
            "question": f"Question {question_num}: True or False — {statement}",
            "options": [
                {
                    "text": "True",
                    "is_correct": is_true,
                    "explanation": "This statement is accurate based on standard definitions.",
                },
                {
                    "text": "False",
                    "is_correct": not is_true,
                    "explanation": "This statement contradicts established principles.",
                },
            ],
            "explanation": (
                f"The statement is {'True' if is_true else 'False'}. "
                f"Understanding this distinction is essential for mastery of {topic} in {subject}."
            ),
            "difficulty": difficulty,
            "bloom_level": bloom_level,
        }

    elif qtype in ("short_answer", "essay", "computational", "case_study"):
        question_stems = {
            "short_answer": (
                f"Question {question_num}: Briefly explain the role of {topic} "
                f"in {subject} and provide one practical example."
            ),
            "essay": (
                f"Question {question_num}: Critically evaluate the significance of "
                f"{topic} within the broader context of {subject}. "
                f"Support your argument with relevant examples and evidence."
            ),
            "computational": (
                f"Question {question_num}: Given the following scenario involving "
                f"{topic} in {subject}, calculate the required output and show all working."
            ),
            "case_study": (
                f"Question {question_num}: Read the following scenario and answer "
                f"the sub-questions:\n\n"
                f"[Case Scenario: A real-world application of {topic} in {subject} "
                f"presents the following challenge...]\n\n"
                f"(a) Identify the key issues present in this scenario.\n"
                f"(b) Recommend appropriate solutions and justify your choices."
            ),
        }
        explanations = {
            "short_answer": (
                f"Model Answer: {topic.capitalize()} plays a critical role in {subject} "
                f"by ensuring consistency and accuracy. Award marks for: correct definition (2), "
                f"practical example (2), clarity of expression (1)."
            ),
            "essay": (
                f"Marking Guidance: Award marks for: clear thesis (5), critical analysis (10), "
                f"use of examples (10), logical structure (5), conclusion (5). "
                f"Total: 35 marks. Deduct for unsupported assertions."
            ),
            "computational": (
                f"Step-by-step solution: [Step 1] Identify variables. "
                f"[Step 2] Apply the {topic} formula. "
                f"[Step 3] Compute and verify. Award partial marks for correct method."
            ),
            "case_study": (
                f"Model Answer Guidance: (a) Key issues — look for identification of 3+ "
                f"core problems with justification. (b) Solutions — must be feasible, "
                f"evidence-based, and linked directly to the identified issues."
            ),
        }
        return {
            "question": question_stems.get(qtype, f"Question {question_num}: Explain {topic} in {subject}."),
            "options": [],
            "explanation": explanations.get(qtype, f"Model answer for {topic}."),
            "difficulty": difficulty,
            "bloom_level": bloom_level,
        }

    elif qtype == "ordering":
        items = [
            f"Step {j+1}: {['Initialize', 'Process', 'Validate', 'Execute', 'Finalize'][j % 5]} the {topic} component"
            for j in range(4)
        ]
        return {
            "question": f"Question {question_num}: Arrange the following steps in the correct order for {topic} in {subject}.",
            "options": [
                {"text": item, "is_correct": True, "explanation": f"This is step {j+1} in the correct sequence."}
                for j, item in enumerate(items)
            ],
            "explanation": f"The correct order follows the standard {topic} lifecycle: {' → '.join(items)}",
            "difficulty": difficulty,
            "bloom_level": bloom_level,
        }

    elif qtype == "matching":
        pairs = [
            (f"Term {j+1} ({topic})", f"Definition {j+1} of {topic} concept")
            for j in range(4)
        ]
        return {
            "question": f"Question {question_num}: Match each term on the left with its correct definition on the right.",
            "options": [
                {
                    "text": left,
                    "is_correct": True,
                    "explanation": right,
                }
                for left, right in pairs
            ],
            "explanation": f"Each term maps to its precise definition within {topic} ({subject}).",
            "difficulty": difficulty,
            "bloom_level": bloom_level,
        }

    elif qtype == "fill_blank":
        return {
            "question": (
                f"Question {question_num}: Complete the following statement about {topic} in {subject}:\n"
                f"The ___ process in {topic} ensures that ___ is maintained throughout the system lifecycle."
            ),
            "options": [
                {"text": "validation", "is_correct": True, "explanation": "First blank: validation"},
                {"text": "integrity", "is_correct": True, "explanation": "Second blank: integrity"},
            ],
            "explanation": f"The validation process in {topic} ensures that integrity is maintained throughout the system lifecycle.",
            "difficulty": difficulty,
            "bloom_level": bloom_level,
        }

    # Fallback for any unhandled type
    return {
        "question": f"Question {question_num}: Describe the key aspects of {topic} in {subject}.",
        "options": [],
        "explanation": f"A comprehensive answer should address all major aspects of {topic}.",
        "difficulty": difficulty,
        "bloom_level": bloom_level,
    }


# ─── Response Parser ──────────────────────────────────────────────────────────


def parse_ai_response(
    raw_content: str,
    question_type: str,
    difficulty: str,
) -> List[GeneratedQuestionRaw]:
    """
    Parse the raw AI provider response into a list of GeneratedQuestionRaw objects.

    Handles:
        - Valid JSON array responses
        - Partially malformed JSON (attempts recovery)
        - Complete parse failures (stores raw for manual recovery)

    Args:
        raw_content: Raw string response from the AI provider.
        question_type: Expected question type (for validation).
        difficulty: Expected difficulty level.

    Returns:
        List of GeneratedQuestionRaw (some may have parsed_successfully=False).
    """
    results: List[GeneratedQuestionRaw] = []

    # Attempt to extract JSON array from response
    try:
        # Strip common AI preamble/postamble
        content = raw_content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        parsed = json.loads(content)

        if not isinstance(parsed, list):
            # Sometimes AI wraps in {"questions": [...]}
            if isinstance(parsed, dict):
                for key in ("questions", "items", "data", "results"):
                    if key in parsed and isinstance(parsed[key], list):
                        parsed = parsed[key]
                        break
                else:
                    raise ValueError("Response is a dict but contains no question array.")
            else:
                raise ValueError("Response is not a JSON array.")

        for item in parsed:
            result = _parse_single_question(item, question_type, difficulty)
            results.append(result)

    except (json.JSONDecodeError, ValueError, TypeError) as e:
        # Complete parse failure — store raw for manual recovery
        logger.warning("Failed to parse AI response: %s", str(e))
        results.append(
            GeneratedQuestionRaw(
                question_type=question_type,
                difficulty=difficulty,
                raw_content=raw_content,
                parsed_successfully=False,
                parse_error=f"JSON parse error: {str(e)}",
            )
        )

    return results


def _parse_single_question(
    item: Any,
    question_type: str,
    difficulty: str,
) -> GeneratedQuestionRaw:
    """Parse a single question dict from the AI response."""
    try:
        if not isinstance(item, dict):
            raise ValueError("Question item is not a dict.")

        question_text = item.get("question", "").strip()
        if not question_text or len(question_text) < 5:
            raise ValueError("Question text is missing or too short.")

        options_raw = item.get("options", [])
        options_json = None
        if options_raw:
            # Validate and normalize options
            normalized_options = []
            for opt in options_raw:
                if not isinstance(opt, dict):
                    raise ValueError("Option is not a dict.")
                normalized_options.append(
                    {
                        "text": str(opt.get("text", "")).strip(),
                        "is_correct": bool(opt.get("is_correct", False)),
                        "explanation": str(opt.get("explanation", "")).strip(),
                    }
                )
            options_json = json.dumps(normalized_options)

        explanation = str(item.get("explanation", "")).strip() or None
        bloom_level = str(item.get("bloom_level", "")).strip() or None

        raw_content = json.dumps(item)

        return GeneratedQuestionRaw(
            question_type=question_type,
            difficulty=difficulty,
            raw_content=raw_content,
            parsed_successfully=True,
            question_text=question_text,
            options=normalized_options if options_raw else [],
            explanation=explanation,
            bloom_level=bloom_level,
        )

    except (ValueError, TypeError, KeyError) as e:
        return GeneratedQuestionRaw(
            question_type=question_type,
            difficulty=difficulty,
            raw_content=json.dumps(item) if isinstance(item, dict) else str(item),
            parsed_successfully=False,
            parse_error=str(e),
        )


# ─── Main Generator ───────────────────────────────────────────────────────────


async def generate_questions(context: GenerationContext) -> GenerationResult:
    """
    Generate questions for the given context.

    This is the primary entry point called by AIGenerationService.
    Builds the prompt, calls the provider, parses the response.

    Args:
        context: Structured generation context.

    Returns:
        GenerationResult with parsed questions and metadata.
    """
    prompt = build_prompt(context)

    try:
        # ── Provider call ──────────────────────────────────────────────────────
        # Currently uses mock. Swap this for real provider when ready:
        # if settings.DEFAULT_LLM_PROVIDER == "openai":
        #     provider_result = await _call_openai_provider(prompt, context)
        # elif settings.DEFAULT_LLM_PROVIDER == "anthropic":
        #     provider_result = await _call_anthropic_provider(prompt, context)
        # else:
        #     provider_result = _call_mock_provider(prompt, context)

        provider_result = _call_mock_provider(prompt, context)

        raw_content = provider_result["content"]
        model_used = provider_result["model"]
        provider = provider_result["provider"]
        tokens_used = provider_result.get("tokens_used")

        # ── Parse response ─────────────────────────────────────────────────────
        parsed_questions = parse_ai_response(
            raw_content=raw_content,
            question_type=context.question_type,
            difficulty=context.difficulty,
        )

        total_generated = sum(1 for q in parsed_questions if q.parsed_successfully)
        total_failed = sum(1 for q in parsed_questions if not q.parsed_successfully)

        logger.info(
            "Generation complete for request %s: %d generated, %d failed",
            context.request_id,
            total_generated,
            total_failed,
        )

        return GenerationResult(
            request_id=context.request_id,
            context=context,
            questions=parsed_questions,
            total_generated=total_generated,
            total_failed=total_failed,
            provider=provider,
            model_used=model_used,
            tokens_used=tokens_used,
        )

    except Exception as e:
        logger.error(
            "Generation failed for request %s: %s",
            context.request_id,
            str(e),
        )
        return GenerationResult(
            request_id=context.request_id,
            context=context,
            questions=[],
            total_generated=0,
            total_failed=context.count,
            provider="unknown",
            model_used="unknown",
            error=str(e),
        )
