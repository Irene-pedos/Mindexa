from __future__ import annotations

import asyncio
import re
import uuid
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional, Tuple

from app.core.exceptions import (AITemporarilyUnavailableError, NotFoundError,
                                 ValidationError)
from app.core.logging import get_logger

logger = get_logger(__name__)

from sqlalchemy import or_, select

from app.db.models.resource import LecturerMaterial
from app.db.models.study_plan import DEFAULT_INITIAL_READINESS_SCORE, StudySession
from app.db.repositories.resource_repo import ResourceRepository
from app.schemas.study_planner import StudySessionResponse
from app.services.ai_exam_gate import assert_student_ai_allowed
from app.services.study_planner.base import PlannerBase


class GuidedSessionMixin(PlannerBase):
    @staticmethod
    def _sanitize_mermaid(code: Optional[str]) -> Optional[str]:
        """Sanitize and repair Mermaid syntax to ensure browser compatibility."""
        if not code or not isinstance(code, str):
            return None
        cleaned = code.strip()
        # Strip markdown fences
        cleaned = re.sub(r"^```(?:mermaid)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()
        if not cleaned:
            return None

        # Ensure it starts with a valid diagram keyword
        valid_prefixes = (
            "graph", "flowchart", "sequencediagram", "classdiagram",
            "statediagram", "erdiagram", "pie", "gantt", "gitgraph", "journey", "mindmap"
        )
        first_line = cleaned.splitlines()[0].strip().lower()
        if not any(first_line.startswith(p) for p in valid_prefixes):
            cleaned = "flowchart TD\n" + cleaned

        return cleaned

    @classmethod
    def _is_valid_mermaid(cls, code: Optional[str]) -> bool:
        """Structural sanity check for Mermaid diagram syntax.

        Sanitizes the input first (strips markdown fences, repairs missing
        diagram-type prefix) then verifies the result starts with a recognised
        Mermaid keyword *and* contains at least one node definition or edge,
        so prose and truncated AI output are rejected before persisting.
        """
        import re
        if not code or not isinstance(code, str):
            return False
        sanitized = cls._sanitize_mermaid(code)
        if not sanitized or len(sanitized) < 8:
            return False
        first_line = sanitized.splitlines()[0].strip().lower()
        valid_prefixes = (
            "graph", "flowchart", "sequencediagram", "classdiagram",
            "statediagram", "erdiagram", "pie", "gantt", "gitgraph", "journey", "mindmap"
        )
        if not any(first_line.startswith(p) for p in valid_prefixes):
            return False
        # Must contain at least one node definition (NodeId[Label]) or arrow edge
        has_node = bool(re.search(r"\w+\s*[\[\(\{]", sanitized))
        has_edge = bool(re.search(r"-->|->>|--|\.\.\.>", sanitized))
        return has_node or has_edge

    def _build_fallback_lesson_plan(
        self, session: StudySession, rag_citations: List[Dict[str, Any]]
    ) -> Any:
        from app.agents.study_planner_agent import LessonPlanOutput, LessonSection

        duration = session.duration_minutes or 60
        if duration <= 30:
            section_count = 4
        elif duration <= 60:
            section_count = 6
        else:
            section_count = 8

        sec_duration = max(5, duration // section_count)

        # ── Detect whether the topic is technical/procedural ─────────────────────────────
        _TECHNICAL_KEYWORDS = {
            "python", "java", "javascript", "typescript", "sql", "html", "css",
            "react", "algorithm", "data structure", "network", "api", "database",
            "programming", "code", "software", "machine learning", "neural",
            "statistics", "calculus", "physics", "circuit", "engineering",
            "protocol", "compiler", "runtime", "operating system", "linux",
        }
        _PROCESS_KEYWORDS = {
            "process", "flow", "pipeline", "cycle", "sequence", "hierarchy",
            "architecture", "system", "stage", "workflow", "lifecycle",
        }
        topic_lower = (session.topic or "").lower()
        is_technical = any(kw in topic_lower for kw in _TECHNICAL_KEYWORDS)

        sections = []
        diagram_added = False  # Cap: at most ONE diagram per lesson

        for i in range(1, section_count + 1):
            examples: list = []
            tables: list = []
            diagram: str | None = None
            activities: list = [
                f"In your own words, explain how the concepts in section {i} apply to {session.topic}."
            ]

            if i == 1:
                title = f"{i}. Core Concepts & Overview of {session.topic}"
                content = (
                    f"### Introduction & Definitions\n"
                    f"Welcome to today's {duration}-minute guided study session focusing on **{session.topic}**.\n\n"
                    f"In this section we cover foundational principles and structural definitions that "
                    f"will anchor everything in the sections that follow.\n\n"
                    f"#### Core Principles\n"
                    f"Begin by identifying the key actors, concepts, or mechanisms that define {session.topic}. "
                    f"Understanding these building blocks is essential before moving to applied analysis."
                )
                key_points = [
                    f"Foundational Definition: A clear understanding of the core mechanisms governing {session.topic}.",
                    "Systematic Approach: Organising concepts into coherent groups before applying them.",
                ]
                # Diagram: only if the topic has a detectable process/flow dimension
                if not diagram_added and any(kw in topic_lower for kw in _PROCESS_KEYWORDS):
                    diagram = (
                        "graph TD\n"
                        f" A[Input / Context] --> B[Core Processing: {session.topic}]\n"
                        " B --> C[Analysis & Evaluation]\n"
                        " C --> D[Output / Conclusion]"
                    )
                    diagram_added = True

            elif i == section_count:
                title = f"{i}. Review, Key Takeaways & Self-Check"
                content = (
                    f"### Session Summary & Self-Evaluation\n"
                    f"To solidify your mastery of **{session.topic}**, revisit the core principles from each section.\n\n"
                    f"Ask yourself: can you explain each concept without notes? "
                    f"If a concept feels unclear, mark it as a revision target and return to it tomorrow."
                )
                key_points = [
                    "Active Recall: Test yourself on key definitions without looking at notes.",
                    "Practical Synthesis: Combine multiple concepts into a cohesive explanation.",
                ]
                tables = [
                    {
                        "title": f"{session.topic}: Session Concept Review",
                        "headers": ["Concept Covered", "Core Principle", "Confidence Level"],
                        "rows": [
                            ["Foundational Definitions", "Core mechanisms and terminology", "Self-rate: 1–5"],
                            ["Applied Analysis", "Applying concepts to real scenarios", "Self-rate: 1–5"],
                            ["Critical Evaluation", "Comparing and contrasting approaches", "Self-rate: 1–5"],
                        ],
                    }
                ]

            else:
                title = f"{i}. Deep Dive Part {i - 1}: Analysis & Application"
                content = (
                    f"### Section {i} — Detailed Analysis ({sec_duration} Minutes)\n"
                    f"Continuing our exploration of **{session.topic}**, this section examines how "
                    f"core principles are applied in context.\n\n"
                    f"Focus on understanding **why** each mechanism works the way it does, not just "
                    f"**what** it does. Connect this material back to the foundational concepts in Section 1.\n\n"
                    f"#### Key Considerations\n"
                    f"Think critically about edge cases, exceptions, and real-world scenarios where "
                    f"{session.topic} principles are tested."
                )
                key_points = [
                    f"Contextual Application: How core {session.topic} principles manifest in practical scenarios.",
                    "Critical Thinking: Identifying exceptions and edge cases that challenge simple rules.",
                ]
                # Code example: only on the second section and only for technical topics
                if i == 2 and is_technical:
                    examples = [
                        {
                            "title": f"Illustrative Example: {session.topic}",
                            "code": (
                                f"# Pseudocode sketch for {session.topic}\n"
                                f"# Replace with a real worked example from your course notes\n"
                                f"result = process({session.topic!r})"
                            ),
                            "explanation": (
                                f"This pseudocode outlines the core operation pattern for {session.topic}. "
                                f"Adapt it using your actual course material."
                            ),
                        }
                    ]

            sections.append(
                LessonSection(
                    section_title=title,
                    content=content,
                    key_points=key_points,
                    diagram_prompt=diagram,
                    estimated_minutes=sec_duration,
                    examples=examples,
                    tables=tables,
                    charts=[],
                    activities=activities,
                )
            )

        refs = [c.get("title") or c.get("resource_name", "Lecturer Material") for c in rag_citations] if rag_citations else ["Lecturer Course Repository & Syllabus"]

        return LessonPlanOutput(
            title=session.title,
            topic=session.topic,
            estimated_duration_minutes=duration,
            objectives=[
                f"Master core concepts and principles of {session.topic}",
                f"Apply and analyse key ideas across {section_count} structured sections",
                "Evaluate comprehension with interactive self-check questions",
            ],
            introduction=f"Welcome to today's {duration}-minute comprehensive study session on {session.topic}. This guided lesson breaks down complex principles into {section_count} structured, time-allocated sections.",
            sections=sections,
            lecturer_references=refs,
            citations=rag_citations,
            summary=f"In this session on {session.topic}, you worked through {section_count} structured sections covering core definitions, applied analysis, and a final self-check review.",
            glossary=[
                {"term": session.topic, "definition": "The primary subject area covered in this study session."},
                {"term": "Active Recall", "definition": "A learning strategy involving retrieving information from memory without looking at notes."},
            ],
            references=["Institutional Course Catalog", "Mindexa AI Study Companion"],
            generated_by="fallback",
        )

    async def _get_session_rag_context(
        self,
        session: Any,
        plan: Optional[Any],
        student_id: uuid.UUID,
        topic_or_query: str,
        top_k: int = 5,
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """Retrieve grounded RAG context for a study session.

        If session.learning_unit_id is present and has source_chunk_ids, hard-scopes strictly
        to those ResourceChunk rows.
        Otherwise falls back to vector search in the teaching workspace.
        """
        rag_context = ""
        rag_citations: List[Dict[str, Any]] = []

        # 1. Hard RAG scoping if session is bound to a specific Learning Unit
        if getattr(session, "learning_unit_id", None):
            try:
                from app.db.models.learning_unit import LearningUnit
                from app.db.models.resource_chunk import ResourceChunk

                lu = await self.db.get(LearningUnit, session.learning_unit_id)
                if lu and lu.source_chunk_ids:
                    chunk_uuids = []
                    for cid in lu.source_chunk_ids:
                        try:
                            chunk_uuids.append(uuid.UUID(str(cid)))
                        except (ValueError, TypeError):
                            continue
                    if chunk_uuids:
                        chunk_stmt = select(ResourceChunk).where(
                            ResourceChunk.id.in_(chunk_uuids)
                        )
                        lu_chunks = list((await self.db.execute(chunk_stmt)).scalars().all())
                        if lu_chunks:
                            rag_context_lines = []
                            for c in lu_chunks:
                                pg = c.metadata_json.get("page") if c.metadata_json else 1
                                chunk_text = c.content or ""
                                rag_context_lines.append(
                                    f"--- Learning Unit: {lu.title} (Page {pg}) ---\n{chunk_text[:1000]}"
                                )
                                rag_citations.append({
                                    "resource_id": str(c.resource_id),
                                    "resource_name": lu.title,
                                    "title": lu.title,
                                    "snippet": chunk_text[:300],
                                    "chunk_index": c.chunk_index,
                                    "page_number": pg,
                                })
                            rag_context = "\n\n".join(rag_context_lines)
            except Exception as lu_rag_err:
                logger.warning(
                    "Learning unit hard RAG scoping error, falling back to general retrieval",
                    error=str(lu_rag_err),
                )

        # 2. General RAG vector retrieval if no LU context was loaded
        if not rag_context:
            try:
                from app.services.rag_service import RAGService

                # Student-scoped retrieval only: it enforces enrollment, student visibility and the
                # answer-key / assessment-material exclusions that lecturer retrieval does not.
                rag_service = RAGService(self.db)
                rag_res = await rag_service.retrieve_context(
                    question=topic_or_query,
                    student_id=student_id,
                    teaching_workspace_id=getattr(plan, "teaching_workspace_id", None) if plan else None,
                    top_k=top_k,
                )
                if rag_res and rag_res.context_string:
                    rag_context = rag_res.context_string
                    if hasattr(rag_res, "citations") and rag_res.citations:
                        rag_citations = [c.model_dump() for c in rag_res.citations]
            except Exception as exc:
                logger.warning("General RAG retrieval failed for study session", error=str(exc))

        # 3. Lexical matching fallback across visible LecturerMaterials if vector RAG yielded nothing
        if not rag_context and plan and getattr(plan, "teaching_workspace_id", None):
            try:
                from app.db.models.resource import LecturerMaterial
                topic_keywords = [w for w in topic_or_query.replace("-", " ").split() if len(w) > 3]
                m_stmt = select(LecturerMaterial).where(
                    LecturerMaterial.teaching_workspace_id == plan.teaching_workspace_id,
                    LecturerMaterial.is_student_visible == True,
                    LecturerMaterial.is_deleted == False,
                    LecturerMaterial.is_current == True,
                    LecturerMaterial.assessment_id.is_(None),
                )
                if topic_keywords:
                    m_stmt = m_stmt.where(
                        or_(*[LecturerMaterial.display_name.ilike(f"%{kw}%") for kw in topic_keywords] +
                            [LecturerMaterial.original_filename.ilike(f"%{kw}%") for kw in topic_keywords])
                    )
                m_stmt = m_stmt.limit(5)
                m_res = await self.db.execute(m_stmt)
                mats = list(m_res.scalars().all()) if hasattr(m_res, "scalars") else []
                if not mats:
                    m_stmt_all = select(LecturerMaterial).where(
                        LecturerMaterial.teaching_workspace_id == plan.teaching_workspace_id,
                        LecturerMaterial.is_student_visible == True,
                        LecturerMaterial.is_deleted == False,
                        LecturerMaterial.is_current == True,
                        LecturerMaterial.assessment_id.is_(None),
                    ).limit(5)
                    m_res_all = await self.db.execute(m_stmt_all)
                    mats = list(m_res_all.scalars().all()) if hasattr(m_res_all, "scalars") else []

                # The first indexed chunks (ResourceChunk, what the pipeline writes) of each material
                rag_context_lines = []
                resource_repo = ResourceRepository(self.db)
                for mat in mats:
                    if not mat.academic_resource_id:
                        continue
                    mat_name = mat.display_name or mat.original_filename or "Lecturer Material"
                    for c in await resource_repo.list_source_chunks(mat.academic_resource_id, limit=2):
                        rag_context_lines.append(
                            f"--- Document: {mat_name} (Chunk {c.chunk_index}) ---\n{c.content[:1000]}"
                        )
                        rag_citations.append({
                            "resource_id": str(mat.id),
                            "resource_name": mat_name,
                            "title": mat_name,
                            "snippet": c.content[:300],
                            "chunk_index": c.chunk_index,
                        })
                if rag_context_lines:
                    rag_context = "\n\n".join(rag_context_lines[:10])
            except Exception as lex_err:
                logger.warning("Lexical RAG fallback failed", error=str(lex_err))

        return rag_context, rag_citations

    def _apply_fallback_lesson(self, session: StudySession, rag_citations: List[Dict[str, Any]]) -> None:
        """Persist the template lesson (used when AI is blocked or fails).

        The plan carries ``generated_by="fallback"``, which the UI shows as a notice and which
        lets the student ask for a real AI lesson later via ``regenerate``.
        """
        fallback = self._build_fallback_lesson_plan(session, rag_citations)
        sections = []
        for sec in fallback.sections:
            # Never persist a diagram that fails structural Mermaid validation.
            if not self._is_valid_mermaid(sec.diagram_prompt):
                sec.diagram_prompt = None
            sections.append(sec)
        session.lesson_plan_json = fallback.model_dump()
        session.lesson_sections_json = [sec.model_dump() for sec in sections]
        session.session_summary_text = fallback.summary

    async def start_guided_session(
        self, session_id: uuid.UUID, student_id: uuid.UUID, *, regenerate: bool = False
    ) -> StudySessionResponse:
        """Start or resume a guided study session, generating structured lesson content if needed.

        ``regenerate`` replaces a *fallback* lesson with a fresh AI one. It is explicit because
        this method also runs on every page visit and must not spend AI on each of them.
        """
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise NotFoundError("Study session not found")

        is_fallback_lesson = (session.lesson_plan_json or {}).get("generated_by") == "fallback"
        needs_generation = session.lesson_status == "NOT_GENERATED" or (
            regenerate and is_fallback_lesson and session.lesson_status != "COMPLETED"
        )

        if needs_generation:
            await assert_student_ai_allowed(self.db, student_id)
            plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id) if getattr(session, "study_plan_id", None) else None
            course_id = plan.course_id if plan else None

            # Retrieve student learning profile for personalization
            profile = await self.repo.get_or_create_learning_profile(student_id, course_id)
            profile_dict = {
                "weak_topics": profile.weak_topics or [],
                "topic_confidence": profile.topic_confidence or {},
            }

            # Check language policy before AI lesson generation
            from app.core.ai.language_policy import is_ai_allowed
            ws_lang = None
            if plan and plan.teaching_workspace_id:
                from app.db.models.academic import TeachingWorkspace
                ws = await self.db.get(TeachingWorkspace, plan.teaching_workspace_id)
                if ws:
                    ws_lang = getattr(ws, "language", None)

            if not is_ai_allowed(ws_lang):
                self._apply_fallback_lesson(session, [])
                session.lesson_status = "IN_PROGRESS"
                session.lesson_generated_at = datetime.now(UTC)
                await self.repo.update_session(session)
                await self.db.commit()
                return self._format_session(session)

            # Retrieve grounded RAG context with hard Learning Unit scoping.
            # top_k=5: 5 chunks are enough context for one lesson and keeps the
            # retrieved text below ~3 000 tokens before template overhead is added.
            rag_context, rag_citations = await self._get_session_rag_context(
                session=session,
                plan=plan,
                student_id=student_id,
                topic_or_query=session.topic,
                top_k=5,
            )

            # Fix #1 — Cap RAG context to fit within provider token budgets.
            # Groq free-tier: 8 000 TPM; we reserve 2 500 for the completion,
            # ~1 600 for the prompt template, leaving ≤3 900 for RAG content.
            # trim_rag_context does accurate tiktoken counting when available and
            # falls back to a char-ratio heuristic otherwise — so this is robust
            # across environments and provider switches.
            from app.core.ai.token_budget import trim_rag_context as _trim_rag
            rag_context = _trim_rag(
                rag_context=rag_context,
                max_tokens_budget=7_500,   # conservative: 8 000 TPM with 500 safety margin
                reserved_for_completion=2_500,
            )

            try:
                from app.agents.study_planner_agent import StudyPlannerAgent

                gateway = self._build_gateway()
                agent = StudyPlannerAgent(gateway)

                lesson_output = await agent.generate_lesson(
                    session=session,
                    rag_context=rag_context,
                    learning_profile=profile_dict,
                )
                if hasattr(lesson_output, "citations") and not lesson_output.citations and rag_citations:
                    lesson_output.citations = rag_citations

                grounded_refs = list(dict.fromkeys([c.get("resource_name") or c.get("title") for c in rag_citations if c.get("resource_name") or c.get("title")]))
                if grounded_refs and hasattr(lesson_output, "lecturer_references"):
                    lesson_output.lecturer_references = grounded_refs

                session.lesson_plan_json = lesson_output.model_dump()  # a real AI lesson: no fallback flag
                # Guard: null out any diagram_prompt that doesn't pass structural Mermaid validation
                # before persisting so the frontend renderer never receives malformed syntax.
                sanitised_sections = []
                for sec in lesson_output.sections:
                    if not self._is_valid_mermaid(sec.diagram_prompt):
                        sec.diagram_prompt = None
                    sanitised_sections.append(sec)
                session.lesson_sections_json = [sec.model_dump() for sec in sanitised_sections]
                session.session_summary_text = getattr(lesson_output, "summary", "") or session.session_summary_text
            except Exception as exc:
                logger.warning("Guided lesson AI generation failed, using fallback lesson content", error=str(exc))
                self._apply_fallback_lesson(session, rag_citations)

            session.lesson_status = "IN_PROGRESS"
            session.lesson_generated_at = datetime.now(UTC)
        elif session.lesson_status != "COMPLETED":
            session.lesson_status = "IN_PROGRESS"

        await self.repo.update_session(session)
        await self.db.commit()
        return self._format_session(session)

    async def get_guided_session_detail(
        self, session_id: uuid.UUID, student_id: uuid.UUID
    ) -> StudySessionResponse:
        """Get current status and section content of a guided study session."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise NotFoundError("Study session not found")
        return self._format_session(session)

    async def ask_guided_session_question(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        question: str,
        section_context: str = "",
    ) -> Dict[str, Any]:
        """Ask AI a context-aware question during a guided study session, with chat history and citations."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise NotFoundError("Study session not found")

        await assert_student_ai_allowed(self.db, student_id)

        plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id) if getattr(session, "study_plan_id", None) else None
        teaching_ws_id = plan.teaching_workspace_id if plan else None

        # Check language policy before AI tutor Q&A
        if teaching_ws_id:
            from app.core.ai.language_policy import assert_ai_allowed
            from app.db.models.academic import TeachingWorkspace

            ws = await self.db.get(TeachingWorkspace, teaching_ws_id)
            if ws:
                assert_ai_allowed(
                    getattr(ws, "language", None),
                    action="ask_guided_session_question",
                    context={"session_id": str(session.id), "workspace_id": str(ws.id)},
                )

        from app.agents.student_support_agent import StudySupportAgent

        gateway = self._build_gateway()
        agent = StudySupportAgent(gateway)

        existing_history = list(session.tutor_chat_history or [])
        conv_history = [
            {"role": item["role"], "content": item["content"]}
            for item in existing_history
            if isinstance(item, dict) and "role" in item and "content" in item
        ]

        lu_source_material_id = None
        if getattr(session, "learning_unit_id", None):
            try:
                from app.db.models.learning_unit import LearningUnit
                lu = await self.db.get(LearningUnit, session.learning_unit_id)
                if lu:
                    lu_source_material_id = lu.source_material_id
            except Exception:
                pass

        rag_context, rag_citations = await self._get_session_rag_context(
            session=session,
            plan=plan,
            student_id=student_id,
            topic_or_query=f"{session.topic} {question}",
            top_k=4,
        )

        prompt_with_context_parts = [
            f"[CURRENT GUIDED LESSON CONTEXT: Topic='{session.topic}', Section Context='{section_context}']"
        ]
        if rag_context:
            prompt_with_context_parts.append(f"[SOURCE MATERIAL CONTEXT:\n{rag_context[:1500]}]")
        prompt_with_context_parts.append(question)
        prompt_with_context = "\n\n".join(prompt_with_context_parts)

        output = await agent.answer(
            question=prompt_with_context,
            student_id=student_id,
            conversation_history=conv_history,
            selected_resource_id=lu_source_material_id,
            teaching_workspace_id=teaching_ws_id,
            db=self.db,
            log_to_global_history=False,  # Guided-lesson panel must not pollute the global Study AI Tutor history
        )

        citations_data = [c.model_dump() for c in output.citations] if output.citations else rag_citations
        now_iso = datetime.now(UTC).isoformat()

        user_msg = {"role": "user", "content": question, "timestamp": now_iso}
        ai_msg = {
            "role": "assistant",
            "content": output.answer,
            "citations": citations_data,
            "timestamp": now_iso,
        }

        updated_history = existing_history + [user_msg, ai_msg]
        session.tutor_chat_history = updated_history
        await self.repo.update_session(session)
        await self.db.commit()

        return {
            "answer": output.answer,
            "citations": citations_data,
            "fallback_used": output.fallback_used,
            "history": updated_history,
        }

    async def generate_guided_exercise(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        section_index: int = 0,
    ) -> Dict[str, Any]:
        """Generate one inline practice activity for the current section with immediate feedback, grounded in AI and RAG."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise NotFoundError("Study session not found")

        await assert_student_ai_allowed(self.db, student_id)

        sections = session.lesson_sections_json or []
        sec_item = sections[section_index] if section_index < len(sections) else {}
        sec_title = sec_item.get("section_title", session.topic)
        sec_kp = sec_item.get("key_points") or []
        sec_kp_str = "; ".join(sec_kp) if isinstance(sec_kp, list) else str(sec_kp)
        sec_raw_content = sec_item.get("content", "")
        sec_content_parts = []
        if sec_kp_str:
            sec_content_parts.append(f"Key Points: {sec_kp_str}")
        if sec_raw_content:
            sec_content_parts.append(sec_raw_content)
        sec_content = "\n\n".join(sec_content_parts) if sec_content_parts else f"Section on {sec_title}"

        plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id) if getattr(session, "study_plan_id", None) else None

        # Check language policy before AI practice exercise generation
        if plan and plan.teaching_workspace_id:
            from app.core.ai.language_policy import assert_ai_allowed
            from app.db.models.academic import TeachingWorkspace

            ws = await self.db.get(TeachingWorkspace, plan.teaching_workspace_id)
            if ws:
                assert_ai_allowed(
                    getattr(ws, "language", None),
                    action="generate_guided_exercise",
                    context={"session_id": str(session.id), "workspace_id": str(ws.id)},
                )

        # Retrieve RAG context grounded in Learning Unit hard chunk scope or workspace
        rag_context, _ = await self._get_session_rag_context(
            session=session,
            plan=plan,
            student_id=student_id,
            topic_or_query=sec_title,
            top_k=3,
        )

        from app.agents.study_planner_agent import StudyPlannerAgent
        from app.core.exceptions import AITemporarilyUnavailableError

        gateway = self._build_gateway()
        agent = StudyPlannerAgent(gateway)

        max_attempts = 2
        last_error: Optional[Exception] = None

        for attempt in range(1, max_attempts + 1):
            try:
                ex_output = await agent.generate_guided_exercise(
                    student_id=student_id,
                    session_id=session_id,
                    topic=session.topic,
                    section_title=sec_title,
                    section_content=sec_content,
                    rag_context=rag_context,
                )
                return {
                    "id": str(uuid.uuid4()),
                    "section_index": section_index,
                    "section_title": sec_title,
                    "question_text": ex_output.question_text,
                    "question_type": "MCQ",
                    "options": ex_output.options,
                    "correct_option_index": ex_output.correct_option_index,
                    "explanation": ex_output.explanation,
                    "generated_by": "ai",
                }
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "AI guided exercise generation attempt failed",
                    attempt=attempt,
                    error=str(exc),
                )
                if attempt < max_attempts:
                    await asyncio.sleep(1.0)

        logger.error(
            "AI guided exercise generation failed after retries",
            error=str(last_error),
        )
        raise AITemporarilyUnavailableError(
            detail="Practice exercise generation is temporarily unavailable. Please try again.",
            code="AI_TEMPORARILY_UNAVAILABLE",
        )

    async def submit_guided_knowledge_check(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        answers: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Grade knowledge check responses, persist evaluation, and update StudentLearningProfile."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise NotFoundError("Study session not found")

        questions = session.quiz_questions or []
        if not questions:
            questions = await self.generate_session_quiz(session_id, student_id, question_count=5)
        if not questions:
            raise ValidationError("Unable to grade knowledge check: no questions found or generated.")

        try:
            from app.agents.study_planner_agent import StudyPlannerAgent

            gateway = self._build_gateway()
            agent = StudyPlannerAgent(gateway)

            report_obj = await agent.grade_knowledge_check(
                student_id=student_id,
                session_id=session_id,
                questions=questions,
                student_answers=answers,
                session_topic=session.topic,
            )
            report = report_obj.model_dump()
        except Exception as exc:
            logger.error(
                "Knowledge check AI evaluation failed; falling back to deterministic option grading",
                error=str(exc),
            )
            raw_questions = questions if isinstance(questions, list) else []
            total_q = len(raw_questions)
            if total_q == 0:
                raise AITemporarilyUnavailableError("Unable to grade the knowledge check right now. Please try again.")

            from app.agents.study_planner_agent import evaluate_question_response
            correct_count = 0
            q_grades = []
            for i, q_item in enumerate(raw_questions):
                q_dict = q_item.model_dump() if hasattr(q_item, "model_dump") else (q_item if isinstance(q_item, dict) else {})
                q_id = str(q_dict.get("id", i))
                raw_ans = answers.get(q_id, answers.get(str(i), ""))

                is_correct, score_pct, student_ans_str, correct_ans_str = evaluate_question_response(q_dict, raw_ans)

                if is_correct:
                    correct_count += 1

                q_grades.append({
                    "question_id": q_id,
                    "is_correct": is_correct,
                    "score": score_pct / 100.0,
                    "student_answer": student_ans_str,
                    "correct_answer": correct_ans_str,
                    "explanation": q_dict.get("explanation", "Evaluated based on answer verification key."),
                })

            calc_percentage = round((correct_count / total_q * 100), 1)
            report = {
                "total_questions": total_q,
                "score_percentage": calc_percentage,
                "question_grades": q_grades,
                "mastered_concepts": [session.topic] if calc_percentage >= 70 else [],
                "weak_concepts": [session.topic] if calc_percentage < 70 else [],
                "estimated_confidence_level": int(calc_percentage),
                "recommendations": [
                    "Review missed questions to improve concept understanding."
                    if calc_percentage < 70
                    else "Great job! Keep maintaining this streak."
                ],
            }

        score = float(report.get("score_percentage", 0.0))
        await self.repo.update_session_knowledge_check(
            session_id=session_id,
            answers=answers,
            score=score,
            report=report,
        )

        plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id)
        course_id = plan.course_id if plan else None
        profile = await self.repo.get_or_create_learning_profile(student_id, course_id)

        conf_dict = dict(profile.topic_confidence or {})
        conf_dict[session.topic] = int(report.get("estimated_confidence_level", int(score)))
        weak_list = list(profile.weak_topics or [])
        for w in report.get("weak_concepts", []):
            if w not in weak_list:
                weak_list.append(w)

        old_avg = profile.average_knowledge_check_score
        new_avg = score if old_avg is None else round((old_avg + score) / 2, 1)

        await self.repo.update_learning_profile(
            profile.id,
            topic_confidence=conf_dict,
            weak_topics=weak_list,
            average_knowledge_check_score=new_avg,
            last_studied_at=datetime.now(UTC),
        )

        # Issue M10: Auto-populate recommended_resource_ids from lecturer materials matching weak concepts or session topic
        try:
            mats_stmt = select(LecturerMaterial).where(
                LecturerMaterial.is_student_visible == True,
                LecturerMaterial.is_deleted == False,
            )
            if plan and plan.teaching_workspace_id:
                mats_stmt = mats_stmt.where(LecturerMaterial.teaching_workspace_id == plan.teaching_workspace_id)

            m_res = await self.db.execute(mats_stmt)
            mats = list(m_res.scalars().all())
            if mats:
                weak_set = set(report.get("weak_concepts", []) or [session.topic])
                rec_ids = [
                    str(m.id) for m in mats
                    if any(
                        w.lower() in (getattr(m, "display_name", None) or getattr(m, "original_filename", "") or "").lower()
                        or (getattr(m, "display_name", None) or getattr(m, "original_filename", "") or "").lower() in w.lower()
                        for w in weak_set
                    )
                ]
                if not rec_ids:
                    rec_ids = [str(mats[0].id)]
                session.recommended_resource_ids = rec_ids
                await self.repo.update_session(session)

                if plan:
                    curr_covered = set(plan.covered_material_ids or [])
                    curr_covered.update(rec_ids)
                    plan.covered_material_ids = list(curr_covered)
                    await self.repo.update_plan(plan)
        except Exception as exc:
            logger.warning("Failed to auto-recommend materials for knowledge check", error=str(exc))

        # Issue 4c: Spaced repetition auto-scheduling for weak topics
        weak_concepts = report.get("weak_concepts", [])
        if weak_concepts or score < 70:
            try:
                spaced_topics = weak_concepts if weak_concepts else [session.topic]
                await self.schedule_spaced_repetition_session(student_id, session.study_plan_id, spaced_topics, days_ahead=2)
            except Exception as exc:
                logger.warning("Spaced repetition auto-scheduling failed", error=str(exc))

        await self.db.commit()
        return report

    async def complete_guided_session(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> StudySessionResponse:
        """Mark guided study session as completed, generate summary, and update streak & readiness."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise NotFoundError("Study session not found")

        # Idempotent: a repeat call must not re-bill the AI summary or farm streak / profile counters.
        if session.status == "COMPLETED" and session.lesson_status == "COMPLETED":
            return self._format_session(session)

        # The session may already be COMPLETED (via complete_session) while its lesson is not;
        # streak and profile counters must only move the first time it is completed.
        first_completion = session.status != "COMPLETED"
        session.lesson_status = "COMPLETED"
        session.status = "COMPLETED"
        if first_completion or not session.completed_at:
            session.completed_at = datetime.now(UTC)

        try:
            from app.agents.study_planner_agent import StudyPlannerAgent

            gateway = self._build_gateway()
            agent = StudyPlannerAgent(gateway)

            summary_out = await agent.generate_session_summary(
                student_id=student_id,
                session_id=session_id,
                topic=session.topic,
                lesson_content=str(session.lesson_sections_json),
                knowledge_check_report=session.knowledge_check_report,
            )
            summary_parts = []
            if getattr(summary_out, "key_takeaways", None):
                summary_parts.append("**Key Takeaways:**\n" + "\n".join(f"- {t}" for t in summary_out.key_takeaways))
            if getattr(summary_out, "concepts_covered", None):
                summary_parts.append("**Concepts Covered:** " + ", ".join(f"`{c}`" for c in summary_out.concepts_covered))
            if getattr(summary_out, "common_mistakes_to_avoid", None):
                summary_parts.append("**Common Pitfalls to Avoid:**\n" + "\n".join(f"- {m}" for m in summary_out.common_mistakes_to_avoid))
            if getattr(summary_out, "recommendations_for_future_revision", None):
                summary_parts.append("**Recommendations for Revision:**\n" + "\n".join(f"- {r}" for r in summary_out.recommendations_for_future_revision))

            session.session_summary_text = "\n\n".join(summary_parts) if summary_parts else f"Summary for {session.topic}: Covered core concepts, worked through practical examples, and completed self-evaluation."
        except Exception as exc:
            logger.warning("Session summary AI generation failed, using topic summary fallback", error=str(exc))
            session.session_summary_text = f"Summary for {session.topic}: Covered core concepts, worked through practical examples, and completed self-evaluation."

        await self.repo.update_session(session)

        plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id)
        if plan:
            if first_completion:
                plan.streak_count += 1
            all_sessions = plan.sessions or []
            comp_sessions = [s for s in all_sessions if s.status == "COMPLETED" and not s.is_deleted]
            total_sessions = len([s for s in all_sessions if not s.is_deleted])
            if total_sessions > 0:
                ratio = len(comp_sessions) / total_sessions
                plan.readiness_score = min(100, max(DEFAULT_INITIAL_READINESS_SCORE, int(ratio * 100)))
            await self.repo.update_plan(plan)

            if first_completion:
                profile = await self.repo.get_or_create_learning_profile(student_id, plan.course_id)
                await self.repo.update_learning_profile(
                    profile.id,
                    total_sessions_completed=profile.total_sessions_completed + 1,
                    current_streak_days=profile.current_streak_days + 1,
                    last_studied_at=datetime.now(UTC),
                )

        # Update StudentLearningUnitProgress if linked to a Learning Unit
        if session.learning_unit_id:
            try:
                from app.db.models.learning_unit import StudentLearningUnitProgress
                prog_stmt = select(StudentLearningUnitProgress).where(
                    StudentLearningUnitProgress.student_id == student_id,
                    StudentLearningUnitProgress.learning_unit_id == session.learning_unit_id,
                )
                prog_res = await self.db.execute(prog_stmt)
                prog = prog_res.scalar_one_or_none()
                if not prog:
                    prog = StudentLearningUnitProgress(
                        student_id=student_id,
                        learning_unit_id=session.learning_unit_id,
                        status="COMPLETED",
                        completed_at=datetime.now(UTC),
                        linked_session_id=session.id,
                    )
                    self.db.add(prog)
                else:
                    prog.status = "COMPLETED"
                    prog.completed_at = datetime.now(UTC)
                    prog.linked_session_id = session.id
                    self.db.add(prog)
            except Exception as exc:
                logger.warning("Failed to update StudentLearningUnitProgress on session completion", error=str(exc))

        await self.db.commit()
        return self._format_session(session)

    async def generate_session_quiz(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        question_count: int = 5,
        force_regenerate: bool = False,
    ) -> List[Dict[str, Any]]:
        """Generate post-session AI practice quiz questions based on topic & course materials using StudyPlannerAgent."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise NotFoundError("Session not found")

        # Idempotency guard: Return existing questions if already generated and valid, unless force_regenerate=True
        if not force_regenerate and session.quiz_questions and len(session.quiz_questions) > 0:
            return session.quiz_questions

        await assert_student_ai_allowed(self.db, student_id)

        # Check language policy before AI quiz generation
        plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id) if getattr(session, "study_plan_id", None) else None
        if plan and plan.teaching_workspace_id:
            from app.core.ai.language_policy import assert_ai_allowed
            from app.db.models.academic import TeachingWorkspace

            ws = await self.db.get(TeachingWorkspace, plan.teaching_workspace_id)
            if ws:
                assert_ai_allowed(
                    getattr(ws, "language", None),
                    action="generate_knowledge_check",
                    context={"session_id": str(session.id), "workspace_id": str(ws.id)},
                )

        from app.agents.study_planner_agent import StudyPlannerAgent
        from app.core.exceptions import AITemporarilyUnavailableError

        gateway = self._build_gateway()
        agent = StudyPlannerAgent(gateway)

        # Ground quiz questions in actual delivered lesson content (session.lesson_sections_json)
        # and scoped Learning Unit / workspace course materials
        rag_context, _ = await self._get_session_rag_context(
            session=session,
            plan=plan,
            student_id=student_id,
            topic_or_query=session.topic,
            top_k=5,
        )

        lesson_content_parts = []
        for sec in (session.lesson_sections_json or []):
            if isinstance(sec, dict):
                title = sec.get("section_title", "")
                kp = sec.get("key_points") or []
                kp_str = "; ".join(kp) if isinstance(kp, list) else str(kp)
                body = sec.get("content", "")
                part_lines = []
                if title:
                    part_lines.append(f"Section: {title}")
                if kp_str:
                    part_lines.append(f"Key Points: {kp_str}")
                if body:
                    part_lines.append(f"Content: {body}")
                if part_lines:
                    lesson_content_parts.append("\n".join(part_lines))

        if rag_context:
            lesson_content_parts.append(f"Course Material & Learning Unit Context:\n{rag_context[:1500]}")

        lesson_content = "\n\n".join(lesson_content_parts) if lesson_content_parts else session.topic

        max_attempts = 2
        last_error: Optional[Exception] = None
        questions: List[Dict[str, Any]] = []

        for attempt in range(1, max_attempts + 1):
            try:
                questions_output = await agent.generate_knowledge_check(
                    session=session,
                    lesson_content=lesson_content,
                    question_count=question_count,
                )
                if questions_output:
                    questions = [q.model_dump() for q in questions_output]
                    for q in questions:
                        q["generated_by"] = "ai"
                    break
                else:
                    logger.warning(
                        "Empty questions list generated by AI agent",
                        attempt=attempt,
                        session_id=str(session_id),
                    )
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "AI quiz generation attempt failed",
                    attempt=attempt,
                    error=str(exc),
                    session_id=str(session_id),
                )
                if attempt < max_attempts:
                    await asyncio.sleep(1.0)

        if not questions:
            logger.error(
                "AI quiz generation failed after retries",
                error=str(last_error),
                session_id=str(session_id),
            )
            raise AITemporarilyUnavailableError(
                detail="AI question generation is temporarily unavailable. Please try again.",
                code="AI_TEMPORARILY_UNAVAILABLE",
            )

        session.quiz_questions = questions
        await self.repo.update_session(session)
        return questions
