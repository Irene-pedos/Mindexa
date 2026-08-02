from __future__ import annotations

import json
import re
import uuid
from typing import Any, Dict, List, Optional

from app.agents.base import BaseAgent
from app.core.ai.gateway import AIGateway
from app.core.ai.prompt_registry import get_prompt
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.db.enums import AIActionType
from app.db.models.study_plan import StudySession
from pydantic import BaseModel, Field, field_validator


class SessionTopicPlan(BaseModel):
    """Schema for AI-generated session topic breakdown."""
    topic: str = Field(..., description="Topic or module name")
    session_type: str = Field(default="STUDY", description="STUDY, PRACTICE, or REVISION")
    learning_objective: str = Field(default="", description="Specific objective for the session")
    estimated_minutes: int = Field(default=60, description="Estimated duration in minutes")


class LessonSection(BaseModel):
    """Schema for individual sections within a guided lesson."""
    section_title: str
    content: str
    key_points: List[str] = Field(default_factory=list)
    diagram_prompt: Optional[str] = None
    estimated_minutes: Optional[int] = None
    examples: List[Dict[str, Any]] = Field(default_factory=list)
    tables: List[Dict[str, Any]] = Field(default_factory=list)
    charts: List[Dict[str, Any]] = Field(default_factory=list)
    activities: List[str] = Field(default_factory=list)


class LessonPlanOutput(BaseModel):
    """Structured AI output for a full guided study session lesson."""
    title: str
    topic: str
    estimated_duration_minutes: int = 60
    objectives: List[str] = Field(default_factory=list)
    introduction: str = ""
    sections: List[LessonSection] = Field(default_factory=list)
    lecturer_references: List[str] = Field(default_factory=list)
    summary: str = ""
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    glossary: List[Dict[str, str]] = Field(default_factory=list)
    references: List[str] = Field(default_factory=list)
    generated_by: str = Field(default="ai", description="ai or fallback")


class KnowledgeCheckQuestion(BaseModel):
    """Schema for an individual self-evaluation question supporting diverse question types."""
    id: str
    question_text: str
    question_type: str = Field(default="MCQ")  # MCQ, TRUE_FALSE, MATCHING, FILL_BLANKS, SHORT_ANSWER, OPEN_QUESTION
    options: List[str] = Field(default_factory=list)
    premises: List[str] = Field(default_factory=list)
    matches: List[str] = Field(default_factory=list)
    blank_answers: Dict[str, str] = Field(default_factory=dict)
    correct_option_index: Optional[int] = None
    correct_answer: Optional[Any] = None
    explanation: str = ""
    generated_by: str = Field(default="ai", description="ai or fallback")

    @field_validator("options", "premises", "matches", mode="before")
    @classmethod
    def _coerce_lists_to_strings(cls, v: Any) -> List[str]:
        if isinstance(v, list):
            return [str(item) if not isinstance(item, str) else item for item in v]
        return v or []

    @field_validator("correct_answer", mode="before")
    @classmethod
    def _coerce_correct_answer_to_string(cls, v: Any) -> Optional[Any]:
        if isinstance(v, bool):
            return str(v)
        return v


class KnowledgeCheckQuestionGrade(BaseModel):
    """Grade detail for a single knowledge check question."""
    question_id: str
    is_correct: bool
    score: float = 0.0
    student_answer: str
    correct_answer: str
    explanation: str

    @field_validator("student_answer", "correct_answer", mode="before")
    @classmethod
    def _coerce_answer_to_string(cls, v: Any) -> str:
        if v is not None and not isinstance(v, str):
            return str(v)
        return v if isinstance(v, str) else ""


class KnowledgeCheckReport(BaseModel):
    """Aggregated self-improvement report after completing a session knowledge check."""
    total_questions: int
    score_percentage: float
    question_grades: List[KnowledgeCheckQuestionGrade] = Field(default_factory=list)
    mastered_concepts: List[str] = Field(default_factory=list)
    weak_concepts: List[str] = Field(default_factory=list)
    estimated_confidence_level: int = 70
    recommendations: List[str] = Field(default_factory=list)
    generated_by: str = Field(default="ai", description="ai or fallback")


class GuidedExerciseOutput(BaseModel):
    """Schema for an AI-generated inline guided lesson practice exercise."""
    question_text: str
    options: List[str] = Field(default_factory=list)
    correct_option_index: int = 0
    explanation: str = ""
    generated_by: str = Field(default="ai", description="ai or fallback")

    @field_validator("options", mode="before")
    @classmethod
    def _coerce_options_to_strings(cls, v: Any) -> List[str]:
        if isinstance(v, list):
            return [str(item) if not isinstance(item, str) else item for item in v]
        return v


class SessionSummaryOutput(BaseModel):
    """Concise AI-generated session summary."""
    topic: str
    concepts_covered: List[str] = Field(default_factory=list)
    key_takeaways: List[str] = Field(default_factory=list)
    common_mistakes_to_avoid: List[str] = Field(default_factory=list)
    recommendations_for_future_revision: List[str] = Field(default_factory=list)
    generated_by: str = Field(default="ai", description="ai or fallback")


def evaluate_question_response(
    q_dict: dict[str, Any],
    raw_ans: Any,
) -> tuple[bool, float, str, str]:
    """Evaluate student response against question type and answer key.

    Returns (is_correct, score_percentage, student_answer_str, correct_answer_str).
    """
    q_type = str(q_dict.get("question_type", "MCQ")).upper()
    correct_idx = q_dict.get("correct_option_index")
    options = q_dict.get("options") or []
    correct_ans = q_dict.get("correct_answer")

    st_ans_str = json.dumps(raw_ans) if isinstance(raw_ans, (dict, list)) else str(raw_ans if raw_ans is not None else "")
    corr_ans_str = json.dumps(correct_ans) if isinstance(correct_ans, (dict, list)) else str(correct_ans if correct_ans is not None else "")

    if not corr_ans_str and correct_idx is not None and 0 <= correct_idx < len(options):
        corr_ans_str = str(options[correct_idx])

    if q_type == "MATCHING":
        premises = q_dict.get("premises") or []
        matches = q_dict.get("matches") or []
        target_map = q_dict.get("blank_answers") or {}
        if not target_map and len(premises) == len(matches):
            target_map = {premises[i]: matches[i] for i in range(len(premises))}

        student_map = raw_ans if isinstance(raw_ans, dict) else {}
        if not target_map:
            return False, 0.0, json.dumps(student_map), json.dumps(target_map)

        matches_count = 0
        total_pairs = len(target_map)
        for k, v in target_map.items():
            if str(student_map.get(k, "")).strip().lower() == str(v).strip().lower():
                matches_count += 1

        score_pct = (matches_count / total_pairs) * 100.0 if total_pairs > 0 else 0.0
        return score_pct >= 80.0, score_pct, json.dumps(student_map), json.dumps(target_map)

    elif q_type == "FILL_BLANKS":
        target_blanks = q_dict.get("blank_answers") or {}
        if isinstance(target_blanks, list):
            target_blanks = {str(idx): val for idx, val in enumerate(target_blanks)}

        student_blanks = raw_ans if isinstance(raw_ans, dict) else {}
        if isinstance(raw_ans, list):
            student_blanks = {str(idx): val for idx, val in enumerate(raw_ans)}

        if not target_blanks:
            return False, 0.0, json.dumps(student_blanks), json.dumps(target_blanks)

        correct_blanks = 0
        total_blanks = len(target_blanks)
        for b_key, b_val in target_blanks.items():
            st_val = str(student_blanks.get(b_key, student_blanks.get(int(b_key) if str(b_key).isdigit() else b_key, ""))).strip().lower()
            if st_val == str(b_val).strip().lower():
                correct_blanks += 1

        score_pct = (correct_blanks / total_blanks) * 100.0 if total_blanks > 0 else 0.0
        return score_pct >= 80.0, score_pct, json.dumps(student_blanks), json.dumps(target_blanks)

    elif q_type == "TRUE_FALSE":
        st_norm = str(raw_ans).strip().lower() in ["true", "1", "t", "yes"]
        if isinstance(correct_ans, bool):
            cr_norm = correct_ans
        else:
            cr_norm = str(correct_ans).strip().lower() in ["true", "1", "t", "yes"]

        is_corr = st_norm == cr_norm
        return is_corr, (100.0 if is_corr else 0.0), str(st_norm), str(cr_norm)

    elif q_type in ["SHORT_ANSWER", "OPEN_QUESTION"]:
        st_text = str(raw_ans).strip()
        cr_text = str(correct_ans or "").strip()
        if not cr_text:
            is_valid = len(st_text) > 10
            return is_valid, (100.0 if is_valid else 0.0), st_text, "Comprehensive answer expected"

        st_lower = st_text.lower()
        cr_keywords = [w for w in re.findall(r"\b[\w'-]{4,}\b", cr_text.lower())]
        matches = 0
        for keyword in cr_keywords:
            if re.search(rf"\b{re.escape(keyword)}\b", st_lower):
                matches += 1
        pct = (matches / len(cr_keywords)) * 100.0 if cr_keywords else 100.0
        if st_lower == cr_text.lower():
            pct = 100.0
        is_pass = pct >= 40.0
        return is_pass, pct, st_text, cr_text

    else:
        is_correct = False
        if correct_idx is not None and 0 <= correct_idx < len(options):
            expected = options[correct_idx]
            if isinstance(raw_ans, int) and raw_ans == correct_idx:
                is_correct = True
            elif str(raw_ans).strip() == str(correct_idx):
                is_correct = True
            elif str(raw_ans).strip().lower() == str(expected).strip().lower():
                is_correct = True
        elif correct_ans is not None:
            if str(raw_ans).strip().lower() == str(correct_ans).strip().lower():
                is_correct = True

        return is_correct, (100.0 if is_correct else 0.0), st_ans_str, corr_ans_str


class StudyPlannerAgent(BaseAgent):
    """
    AI Agent responsible for study plan topic breakdown, guided lesson generation,
    knowledge check generation & evaluation, and post-session summaries.
    """

    prompt_name = "study_topics"
    prompt_version = "v1"

    async def generate_session_topics(
        self,
        *,
        student_id: uuid.UUID,
        assessment_title: str,
        course_context: str = "",
        material_titles: Optional[List[str]] = None,
        session_count: int = 7,
        difficulty_pace: str = "Balanced",
        weak_topics: Optional[List[str]] = None,
        topic_confidence: Optional[Dict[str, Any]] = None,
    ) -> List[SessionTopicPlan]:
        """Generate ordered list of study topics tailored to target assessment, materials, and student weak areas."""
        template = get_prompt("study_topics", "v1")
        mats_str = ", ".join(material_titles) if material_titles else "None specified"
        system_content = (
            template.replace("{{assessment_title}}", assessment_title)
            .replace("{{course_context}}", course_context or "General Academic Course")
            .replace("{{material_titles}}", mats_str)
            .replace("{{session_count}}", str(session_count))
            .replace("{{difficulty_pace}}", difficulty_pace)
        )

        if weak_topics:
            weak_str = ", ".join(weak_topics)
            system_content += (
                f"\n\nKNOWN STUDENT WEAK TOPICS: {weak_str}.\n"
                f"CRITICAL INSTRUCTION: Prioritize and front-load these weak topics into the earlier sessions "
                f"(Sessions 1-{min(3, session_count)}) so the student receives immediate reinforcement."
            )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(role="user", content=f"Generate {session_count} structured session topics for '{assessment_title}'."),
            ],
            temperature=0.4,
            max_tokens=1500,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_STUDY_PLAN,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type="study_plan",
            prompt_summary=f"Generate session topic plan for assessment '{assessment_title}'",
            prompt_version="study_topics_v1",
        )

        res = self._parse_json_output(response.content, SessionTopicPlan, extract_list=True)
        return res if isinstance(res, list) else [res]

    async def generate_lesson(
        self,
        *,
        session: StudySession,
        rag_context: str = "",
        learning_profile: Optional[dict[str, Any]] = None,
    ) -> LessonPlanOutput:
        """Generate structured lesson plan for a specific study session."""
        duration = session.duration_minutes or 60
        if duration <= 30:
            target_sections = "3 to 4"
        elif duration <= 60:
            target_sections = "5 to 7"
        else:
            target_sections = "8 to 10"

        template = get_prompt("study_lesson", "v1")
        profile_str = json.dumps(learning_profile or {})
        system_content = (
            template.replace("{{topic}}", session.topic)
            .replace("{{session_title}}", session.title)
            .replace("{{duration_minutes}}", str(duration))
            .replace("{{target_sections}}", target_sections)
            .replace("{{learning_profile}}", profile_str)
            .replace("{{rag_context}}", rag_context or "No additional lecturer materials retrieved.")
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(
                    role="user",
                    content=f"Teach me today's {duration}-minute lesson on '{session.topic}' with full depth, code examples, diagrams, and {target_sections} structured sections.",
                ),
            ],
            temperature=0.4,
            max_tokens=4000,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_STUDY_LESSON,
            actor_id=session.student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session.id,
            prompt_summary=f"Generate structured lesson for session {session.id} ({session.topic})",
            prompt_version="study_lesson_v1",
        )

        return self._parse_json_output(response.content, LessonPlanOutput)  # type: ignore

    async def generate_knowledge_check(
        self,
        *,
        session: StudySession,
        lesson_content: str = "",
        weak_topics: Optional[List[str]] = None,
        question_count: int = 5,
    ) -> List[KnowledgeCheckQuestion]:
        """Generate non-academic self-evaluation knowledge check questions."""
        template = get_prompt("study_knowledge_check", "v1")
        weak_str = ", ".join(weak_topics or []) or "None"
        system_content = (
            template.replace("{{topic}}", session.topic)
            .replace("{{lesson_content}}", lesson_content[:3000] if lesson_content else f"Session topic: {session.topic}")
            .replace("{{weak_topics}}", weak_str)
            .replace("{{question_count}}", str(question_count))
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(role="user", content=f"Generate {question_count} knowledge check questions for '{session.topic}'."),
            ],
            temperature=0.3,
            max_tokens=1800,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_KNOWLEDGE_CHECK,
            actor_id=session.student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session.id,
            prompt_summary=f"Generate knowledge check for session {session.id} ({session.topic})",
            prompt_version="study_knowledge_check_v1",
        )

        res = self._parse_json_output(response.content, KnowledgeCheckQuestion, extract_list=True)
        questions_list = res if isinstance(res, list) else [res]
        for q in questions_list:
            if session.topic and session.topic not in q.question_text:
                q.question_text = f"Regarding {session.topic}: {q.question_text}"
            if q.options and len(q.options) >= 2 and q.question_type == "MCQ":
                import random
                options_with_idx = list(enumerate(q.options))
                random.shuffle(options_with_idx)
                new_options = [opt for _, opt in options_with_idx]
                if q.correct_option_index is not None:
                    new_correct_idx = next(
                        (new_i for new_i, (old_i, _) in enumerate(options_with_idx) if old_i == q.correct_option_index),
                        0
                    )
                    q.correct_option_index = new_correct_idx
                    q.correct_answer = new_options[new_correct_idx]
                q.options = new_options
        return questions_list

    async def grade_knowledge_check(
        self,
        *,
        student_id: uuid.UUID,
        session_id: uuid.UUID,
        questions: List[dict[str, Any]],
        student_answers: dict[str, Any],
    ) -> KnowledgeCheckReport:
        """Evaluate student responses to a knowledge check and generate personal learning report."""
        question_grades: List[KnowledgeCheckQuestionGrade] = []
        correct_count = 0
        mastered: List[str] = []
        weak: List[str] = []

        for i, q in enumerate(questions):
            q_dict = q if isinstance(q, dict) else (q.model_dump() if hasattr(q, "model_dump") else {})
            q_id = str(q_dict.get("id", i))
            raw_ans = student_answers.get(q_id, student_answers.get(str(i), ""))

            is_correct, score_pct, st_ans_str, corr_ans_str = evaluate_question_response(q_dict, raw_ans)

            if is_correct:
                correct_count += 1
                mastered.append(q_dict.get("question_text", f"Question {q_id}"))
            else:
                weak.append(
                    q_dict.get("concept_tag")
                    or q_dict.get("topic_tag")
                    or q_dict.get("topic")
                    or session.topic
                    or q_dict.get("question_text", f"Question {q_id}")
                )

            question_grades.append(
                KnowledgeCheckQuestionGrade(
                    question_id=q_id,
                    is_correct=is_correct,
                    score=score_pct / 100.0,
                    student_answer=st_ans_str or "No answer provided",
                    correct_answer=corr_ans_str or "N/A",
                    explanation=q_dict.get("explanation", "Review core concept for details."),
                )
            )

        total = len(questions) or 1
        pct = round((correct_count / total) * 100, 1)

        # Log AI action audit trail directly without wasting LLM provider tokens/latency
        await self.gateway.log_action(
            action_type=AIActionType.GRADE_KNOWLEDGE_CHECK,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session_id,
            prompt_summary=f"Deterministic self-grading for session {session_id} ({total} questions)",
            prompt_version="study_knowledge_check_v1",
            raw_output={"score_percentage": pct, "total_questions": total},
        )

        return KnowledgeCheckReport(
            total_questions=total,
            score_percentage=pct,
            question_grades=question_grades,
            mastered_concepts=mastered,
            weak_concepts=weak,
            estimated_confidence_level=int(min(100, max(30, pct))),
            recommendations=[
                "Review weak concepts in your personal profile." if weak else "Great job! Keep maintaining this streak.",
            ],
        )

    async def generate_session_summary(
        self,
        *,
        student_id: uuid.UUID,
        session_id: uuid.UUID,
        topic: str,
        lesson_content: str,
        knowledge_check_report: Optional[dict[str, Any]] = None,
    ) -> SessionSummaryOutput:
        """Generate post-lesson concise learning summary."""
        template = get_prompt("study_session_summary", "v1")
        kc_str = json.dumps(knowledge_check_report or {})
        system_content = (
            template.replace("{{topic}}", topic)
            .replace("{{lesson_content}}", lesson_content[:2500] if lesson_content else topic)
            .replace("{{knowledge_check_report}}", kc_str)
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(role="user", content=f"Generate a concise post-session summary for '{topic}'."),
            ],
            temperature=0.3,
            max_tokens=1200,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_SESSION_SUMMARY,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session_id,
            prompt_summary=f"Generate session summary for session {session_id}",
            prompt_version="study_session_summary_v1",
        )

        return self._parse_json_output(response.content, SessionSummaryOutput)  # type: ignore

    async def generate_guided_exercise(
        self,
        *,
        student_id: uuid.UUID,
        session_id: uuid.UUID,
        topic: str,
        section_title: str,
        section_content: str,
        rag_context: str = "",
    ) -> GuidedExerciseOutput:
        """Generate AI/RAG-grounded inline practice activity for a specific guided lesson section."""
        template = get_prompt("study_guided_exercise", "v1")
        system_content = (
            template.replace("{{topic}}", topic)
            .replace("{{section_title}}", section_title)
            .replace("{{section_content}}", section_content[:1500] if section_content else f"Section on {section_title}")
            .replace("{{rag_context}}", rag_context[:1500] if rag_context else "None available.")
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(role="user", content=f"Generate 1 practice exercise for section '{section_title}'."),
            ],
            temperature=0.3,
            max_tokens=1000,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_KNOWLEDGE_CHECK,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session_id,
            prompt_summary=f"Generate guided exercise for section '{section_title}'",
            prompt_version="study_guided_exercise_v1",
        )

        output: GuidedExerciseOutput = self._parse_json_output(response.content, GuidedExerciseOutput)  # type: ignore
        if output.options and len(output.options) >= 2:
            import random
            options_with_idx = list(enumerate(output.options))
            random.shuffle(options_with_idx)
            new_options = [opt for _, opt in options_with_idx]
            new_correct_idx = next(
                (new_i for new_i, (old_i, _) in enumerate(options_with_idx) if old_i == output.correct_option_index),
                0
            )
            output.options = new_options
            output.correct_option_index = new_correct_idx

        return output
