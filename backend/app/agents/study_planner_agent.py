from __future__ import annotations

import json
import uuid
from typing import Any, List, Optional
from pydantic import BaseModel, Field

from app.agents.base import BaseAgent
from app.core.ai.gateway import AIGateway
from app.core.ai.prompt_registry import get_prompt
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.db.enums import AIActionType
from app.db.models.study_plan import StudySession


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


class LessonPlanOutput(BaseModel):
    """Structured AI output for a full guided study session lesson."""
    title: str
    topic: str
    estimated_duration_minutes: int = 60
    objectives: List[str] = Field(default_factory=list)
    introduction: str
    sections: List[LessonSection] = Field(default_factory=list)
    lecturer_references: List[str] = Field(default_factory=list)
    summary: str


class KnowledgeCheckQuestion(BaseModel):
    """Schema for an individual non-academic self-evaluation question."""
    id: str
    question_text: str
    question_type: str = Field(default="MCQ")  # MCQ, TRUE_FALSE, SHORT_ANSWER, FILL_BLANK, MATCHING, ORDERING
    options: List[str] = Field(default_factory=list)
    correct_option_index: Optional[int] = None
    correct_answer: Optional[str] = None
    explanation: str


class KnowledgeCheckQuestionGrade(BaseModel):
    """Grade detail for a single knowledge check question."""
    question_id: str
    is_correct: bool
    score: float = 0.0
    student_answer: str
    correct_answer: str
    explanation: str


class KnowledgeCheckReport(BaseModel):
    """Aggregated self-improvement report after completing a session knowledge check."""
    total_questions: int
    score_percentage: float
    question_grades: List[KnowledgeCheckQuestionGrade] = Field(default_factory=list)
    mastered_concepts: List[str] = Field(default_factory=list)
    weak_concepts: List[str] = Field(default_factory=list)
    estimated_confidence_level: int = 70
    recommendations: List[str] = Field(default_factory=list)


class SessionSummaryOutput(BaseModel):
    """Concise AI-generated session summary."""
    topic: str
    concepts_covered: List[str] = Field(default_factory=list)
    key_takeaways: List[str] = Field(default_factory=list)
    common_mistakes_to_avoid: List[str] = Field(default_factory=list)
    recommendations_for_future_revision: List[str] = Field(default_factory=list)


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
    ) -> List[SessionTopicPlan]:
        """Generate ordered list of study topics tailored to target assessment and materials."""
        template = get_prompt("study_topics", "v1")
        mats_str = ", ".join(material_titles) if material_titles else "None specified"
        system_content = (
            template.replace("{{assessment_title}}", assessment_title)
            .replace("{{course_context}}", course_context or "General Academic Course")
            .replace("{{material_titles}}", mats_str)
            .replace("{{session_count}}", str(session_count))
            .replace("{{difficulty_pace}}", difficulty_pace)
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
        template = get_prompt("study_lesson", "v1")
        profile_str = json.dumps(learning_profile or {})
        system_content = (
            template.replace("{{topic}}", session.topic)
            .replace("{{session_title}}", session.title)
            .replace("{{learning_profile}}", profile_str)
            .replace("{{rag_context}}", rag_context or "No additional lecturer materials retrieved.")
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(role="user", content=f"Teach me today's lesson on '{session.topic}' in a clear, structured way."),
            ],
            temperature=0.4,
            max_tokens=2500,
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

        for q in questions:
            q_id = str(q.get("id"))
            st_ans = str(student_answers.get(q_id, "")).strip()
            corr_ans = str(q.get("correct_answer") or "").strip()
            corr_idx = q.get("correct_option_index")
            opts = q.get("options", [])

            is_correct = False
            if corr_idx is not None and 0 <= corr_idx < len(opts):
                target_opt = opts[corr_idx].strip()
                if st_ans.lower() == target_opt.lower() or st_ans == str(corr_idx):
                    is_correct = True
            elif corr_ans and st_ans.lower() == corr_ans.lower():
                is_correct = True
            elif st_ans and corr_ans and (st_ans.lower() in corr_ans.lower() or corr_ans.lower() in st_ans.lower()):
                is_correct = True

            score = 1.0 if is_correct else 0.0
            if is_correct:
                correct_count += 1
                mastered.append(q.get("question_text", f"Question {q_id}"))
            else:
                weak.append(q.get("question_text", f"Question {q_id}"))

            question_grades.append(
                KnowledgeCheckQuestionGrade(
                    question_id=q_id,
                    is_correct=is_correct,
                    score=score,
                    student_answer=st_ans or "No answer provided",
                    correct_answer=corr_ans or (opts[corr_idx] if corr_idx is not None and corr_idx < len(opts) else "N/A"),
                    explanation=q.get("explanation", "Review core concept for details."),
                )
            )

        total = len(questions) or 1
        pct = round((correct_count / total) * 100, 1)

        # Log AI action audit trail
        req = AICompletionRequest(
            messages=[
                AIMessage(role="system", content="Knowledge check self-evaluation processor."),
                AIMessage(role="user", content=f"Process self-grading for {total} questions."),
            ],
            max_tokens=100,
        )
        await self.gateway.complete(
            req,
            action_type=AIActionType.GRADE_KNOWLEDGE_CHECK,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session_id,
            prompt_summary=f"Grade knowledge check for session {session_id}",
            prompt_version="study_knowledge_check_v1",
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
