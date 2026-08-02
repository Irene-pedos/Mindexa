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
    ) -> StudySupportAgentResponse:

        self.rag_service = RAGService(db)

        # Step 1: RAG retrieval with dynamic top_k, multi-resource, and workspace scoping
        top_k_count = 16 if deep_search_mode else 5
        rag_result = await self.rag_service.retrieve_context(
            question=question,
            student_id=student_id,
            selected_resource_id=selected_resource_id,
            selected_resource_ids=selected_resource_ids,
            teaching_workspace_id=teaching_workspace_id,
            top_k=top_k_count,
        )

        # Step 2: Build system prompt with thinking_mode directive
        system_prompt = self._build_system_prompt(has_context=not rag_result.fallback_used, thinking_mode=thinking_mode)

        # Step 3: Build user prompt with context injection
        user_prompt = self._build_user_prompt(
            question=question,
            context=rag_result.context_string,
            fallback=rag_result.fallback_used,
        )

        # Step 4: Call LLM with dynamic budget and reasoning controls
        llm_response = await self._call_llm(
            system_prompt, user_prompt, conversation_history, student_id, thinking_mode=thinking_mode
        )

        # Step 5: Audit log
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

    def _build_system_prompt(self, has_context: bool, thinking_mode: bool = False) -> str:
        base_prompt = ""
        if has_context:
            base_prompt = (
                "You are the Mindexa Study Support Agent. You help students understand their "
                "course materials. Answer the student's question using ONLY the provided "
                "course material context. If the context does not fully answer the question, "
                "say so clearly and explain what you can from the context. Never fabricate "
                "academic content. Never reveal assessment answers, question banks, or "
                "materials from other courses. Cite sources when referring to specific content."
            )
        else:
            base_prompt = (
                "You are the Mindexa Study Support Agent. No relevant course materials were "
                "found for this question. Answer from general academic knowledge only, "
                "clearly stating that your answer is not based on the student's specific "
                "course materials. Encourage the student to check their uploaded notes or "
                "ask their lecturer."
            )

        if thinking_mode:
            base_prompt += (
                "\n\n[DEEP REASONING MODE ACTIVE]: Perform thorough, step-by-step analytical reasoning "
                "before providing your final explanation. Provide an exhaustive, highly structured, "
                "and logically rigorous academic breakdown."
            )

        return base_prompt

    def _build_user_prompt(self, question: str, context: str, fallback: bool) -> str:
        if not fallback:
            return (
                f"Student Question:\n{question}\n\n"
                f"Retrieved Course Material Context:\n{context}\n\n"
                "Please answer the student's question using the context above. "
                "Reference specific sections where relevant."
            )
        else:
            return (
                f"Student Question:\n{question}\n\n"
                "No course materials were found. Answer from general academic knowledge only."
            )

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        history: List[Dict[str, Any]],
        student_id: uuid.UUID,
        thinking_mode: bool = False,
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

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.STUDY_SUPPORT,
            actor_id=student_id,
            actor_role="student",
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
