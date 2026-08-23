import json
import uuid
from typing import Any, Dict, List, Optional

from app.agents.base import BaseAgent
from app.core.ai.gateway import AIGateway
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.core.logging import get_logger
from app.db.enums import AIActionType
from app.db.models.study_support_session import StudySupportSession
from app.db.schemas.rag import RAGRetrievalResult, SourceCitation
from app.services.rag_service import RAGService
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)

class StudySupportAgentResponse(BaseModel):
    answer: str
    citations: List[SourceCitation]
    fallback_used: bool

class StudySupportAgent(BaseAgent):
    """
    Agent responsible for explaining academic concepts to students using RAG.
    """

    def __init__(self, gateway: AIGateway):
        super().__init__(gateway)
        self.rag_service = None # Will be initialized in answer() or passed in

    async def answer(
        self,
        question: str,
        student_id: uuid.UUID,
        conversation_history: List[Dict[str, Any]],
        db: AsyncSession,
        selected_resource_id: Optional[uuid.UUID] = None,
        selected_resource_ids: Optional[List[uuid.UUID]] = None,
        teaching_workspace_id: Optional[uuid.UUID] = None,
        thinking_mode: bool = False,
        deep_search_mode: bool = False,
        log_to_global_history: bool = True,
        is_in_assessment: bool = False,
        attempt_id: Optional[uuid.UUID] = None,
        question_id: Optional[uuid.UUID] = None,
        selected_text: Optional[str] = None,
        current_page: Optional[int] = None,
    ) -> StudySupportAgentResponse:

        self.rag_service = RAGService(db)

        # Step 1: RAG retrieval with dynamic top_k, multi-resource, and workspace scoping
        top_k_count = 16 if deep_search_mode else 5
        rag_query = f"{question} {selected_text}" if selected_text else question
        rag_result = await self.rag_service.retrieve_context(
            question=rag_query,
            student_id=student_id,
            selected_resource_id=selected_resource_id,
            selected_resource_ids=selected_resource_ids,
            teaching_workspace_id=teaching_workspace_id,
            top_k=top_k_count,
        )

        # Step 2: Build system prompt with thinking_mode and assessment Socratic directives
        system_prompt = self._build_system_prompt(
            has_context=not rag_result.fallback_used,
            thinking_mode=thinking_mode,
            is_in_assessment=is_in_assessment,
        )

        # Step 3: Build user prompt with context injection and selected text
        user_prompt = self._build_user_prompt(
            question=question,
            context=rag_result.context_string,
            fallback=rag_result.fallback_used,
            selected_text=selected_text,
            current_page=current_page,
        )

        # Step 4: Call LLM with dynamic budget, reasoning controls, and assessment action type
        llm_response = await self._call_llm(
            system_prompt,
            user_prompt,
            conversation_history,
            student_id,
            thinking_mode=thinking_mode,
            is_in_assessment=is_in_assessment,
            attempt_id=attempt_id,
        )

        # Step 5: Audit log (skipped for guided-lesson and in-assessment calls to avoid leaking into global tutor history)
        if log_to_global_history and not is_in_assessment:
            await self._log_session(
                student_id=student_id,
                question=question,
                rag_result=rag_result,
                llm_response=llm_response,
                db=db,
            )

        # Step 6: Return response with citations
        return StudySupportAgentResponse(
            answer=llm_response,
            citations=rag_result.citations,
            fallback_used=rag_result.fallback_used,
        )

    def _build_system_prompt(
        self,
        has_context: bool,
        thinking_mode: bool = False,
        is_in_assessment: bool = False,
    ) -> str:
        if has_context:
            base_prompt = (
                "You are Mindexa's AI Study Tutor. Answer the student's question using the provided course material context.\n\n"
                "RESPONSE FORMATTING INSTRUCTIONS:\n"
                "1. DIRECT ANSWER FIRST: Begin immediately with a clear and concise explanation to the student's question. Do not start with introductory filler like 'According to the provided course material context...'.\n"
                "2. VISUAL & STRUCTURAL CLARITY: Use clean Markdown formatting with section headings (e.g. ### Key Concepts), concise paragraphs, bold key terms (**term**), and bullet points.\n"
                "3. NO INLINE CITATION CLUTTER: Do NOT insert raw text markers or bracketed references like '[Source: ...]' into your response body text. Structured citations are attached automatically.\n"
                "4. SCOPE BOUNDARIES: If the context only partially answers the question, explain what can be answered from notes first, then provide academic concepts.\n"
                "5. ACADEMIC INTEGRITY: Never reveal exam answer keys or materials from unassigned courses."
            )
        else:
            base_prompt = (
                "You are Mindexa's AI Study Tutor. No relevant course materials were found for this query.\n\n"
                "RESPONSE FORMATTING INSTRUCTIONS:\n"
                "1. MANDATORY GENERAL KNOWLEDGE DISCLAIMER: Your response MUST start with the exact string: '**General Knowledge:** This response is not based on your provided course material context.'\n"
                "2. DIRECT ANSWER: Immediately after the disclaimer, answer the question accurately using general academic knowledge.\n"
                "3. VISUAL & STRUCTURAL CLARITY: Use clean Markdown formatting with section headings (### ...), concise paragraphs, bold key terms, and bullet points.\n"
                "4. NO CITATIONS: Do not invent or cite any file sources since this response relies on general knowledge."
            )

        if is_in_assessment:
            base_prompt += (
                "\n\n[IN-ASSESSMENT SOCRATIC TUTOR MODE ACTIVE]:\n"
                "- The student is currently taking a live homework assessment.\n"
                "- Explain relevant underlying concepts, mathematical principles, definitions, and problem-solving frameworks.\n"
                "- NEVER produce the final, direct, or numeric answer to the specific problem the student is trying to solve.\n"
                "- Guide the student Socratically so they can independently deduce the solution."
            )

        if thinking_mode:
            base_prompt += (
                "\n\n[DEEP REASONING MODE ACTIVE]: Perform thorough, step-by-step analytical reasoning "
                "before providing your final explanation. Provide an exhaustive, highly structured, "
                "and logically rigorous academic breakdown."
            )

        return base_prompt

    def _build_user_prompt(
        self,
        question: str,
        context: str,
        fallback: bool,
        selected_text: Optional[str] = None,
        current_page: Optional[int] = None,
    ) -> str:
        prompt_parts = [f"Student Question:\n{question}\n"]

        if selected_text:
            page_info = f" (Page {current_page})" if current_page else ""
            prompt_parts.append(
                f"[STUDENT HIGHLIGHTED EXCERPT{page_info}]:\n\"\"\"\n{selected_text}\n\"\"\"\n"
            )

        if not fallback:
            prompt_parts.append(
                f"Retrieved Course Material Context:\n{context}\n\n"
                "Instructions: Answer the student's question directly and concisely. "
                + ("If an excerpt was highlighted above, address that excerpt first, then explain the concept and reference the surrounding page context. " if selected_text else "")
                + "Use clean Markdown styling (### headings, bold terms, bullet points). "
                "Do NOT inline raw [Source: ...] or page number brackets inside your answer body text."
            )
        else:
            prompt_parts.append(
                "No course materials were found. Remember to start your response with: "
                "'**General Knowledge:** This response is not based on your provided course material context.'"
            )

        return "\n".join(prompt_parts)

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        history: List[Dict[str, Any]],
        student_id: uuid.UUID,
        thinking_mode: bool = False,
        is_in_assessment: bool = False,
        attempt_id: Optional[uuid.UUID] = None,
    ) -> str:
        messages = [AIMessage(role="system", content=system_prompt)]

        # Add history
        for msg in history[-5:]:  # Last 5 messages for context
            if not isinstance(msg, dict):
                continue
            role = msg.get("role")
            content = msg.get("content")
            if not role or not content:
                continue
            messages.append(AIMessage(role=role, content=content))

        messages.append(AIMessage(role="user", content=user_prompt))

        max_tokens_budget = 2048 if thinking_mode else 1000
        temp = 0.2 if thinking_mode else 0.4

        request = AICompletionRequest(
            messages=messages,
            temperature=temp,
            max_tokens=max_tokens_budget,
        )

        action_type = AIActionType.ASSESSMENT_AI_SUPPORT if is_in_assessment else AIActionType.STUDY_SUPPORT

        response = await self.gateway.complete(
            request,
            action_type=action_type,
            actor_id=student_id,
            actor_role="student",
            subject_entity_id=attempt_id,
            subject_entity_type="assessment_attempt" if is_in_assessment else None,
        )
        return response.content

    async def _log_session(
        self,
        student_id: uuid.UUID,
        question: str,
        rag_result: RAGRetrievalResult,
        llm_response: str,
        db: AsyncSession,
    ) -> None:
        session = StudySupportSession(
            student_id=student_id,
            question=question,
            retrieved_chunk_ids=rag_result.chunk_ids_used,
            context_used=rag_result.context_string,
            llm_response=llm_response,
            source_citations=[c.model_dump() for c in rag_result.citations]
        )
        db.add(session)
        await db.commit()

    async def generate_revision_guide(
        self,
        topic: str,
        student_id: uuid.UUID,
        teaching_workspace_id: Optional[uuid.UUID] = None,
        db: Optional[AsyncSession] = None,
    ) -> Any:
        from app.schemas.student_ai import RevisionGuideOutput
        if db:
            self.rag_service = RAGService(db)
            rag_res = await self.rag_service.retrieve_context(
                question=topic,
                student_id=student_id,
                teaching_workspace_id=teaching_workspace_id,
                top_k=8,
            )
            ctx = rag_res.context_string
        else:
            ctx = ""

        system_prompt = (
            "You are an academic study coach. Generate a structured revision guide for the requested topic. "
            "Respond ONLY with a single JSON object matching this schema:\n"
            "{\n"
            '  "summary": "Comprehensive topic summary.",\n'
            '  "checklist": ["Action item 1", "Action item 2"],\n'
            '  "readings": ["Recommended material 1", "Recommended material 2"]\n'
            "}"
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_prompt),
                AIMessage(role="user", content=f"Generate structured revision guide for topic: '{topic}'. Context:\n{ctx}"),
            ],
            temperature=0.3,
            max_tokens=1500,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.STUDY_SUPPORT,
            actor_id=student_id,
            actor_role="student",
        )

        res = self._parse_json_output(response.content, RevisionGuideOutput)
        return res
