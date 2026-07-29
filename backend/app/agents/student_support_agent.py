import json
import uuid
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.agents.base import BaseAgent
from app.services.rag_service import RAGService
from app.db.schemas.rag import SourceCitation, RAGRetrievalResult
from app.db.models.study_support_session import StudySupportSession
from app.db.enums import AIActionType
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.core.ai.gateway import AIGateway
from app.core.logging import get_logger

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
    ) -> StudySupportAgentResponse:
        
        self.rag_service = RAGService(db)
        
        # Step 1: RAG retrieval
        rag_result = await self.rag_service.retrieve_context(
            question=question,
            student_id=student_id,
            selected_resource_id=selected_resource_id,
        )
        
        # Step 2: Build system prompt
        system_prompt = self._build_system_prompt(has_context=not rag_result.fallback_used)
        
        # Step 3: Build user prompt with context injection
        user_prompt = self._build_user_prompt(
            question=question,
            context=rag_result.context_string,
            fallback=rag_result.fallback_used,
        )
        
        # Step 4: Call LLM (Groq via Gateway)
        llm_response = await self._call_llm(system_prompt, user_prompt, conversation_history, student_id)
        
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

    def _build_system_prompt(self, has_context: bool) -> str:
        if has_context:
            return (
                "You are the Mindexa Study Support Agent. You help students understand their "
                "course materials. Answer the student's question using ONLY the provided "
                "course material context. If the context does not fully answer the question, "
                "say so clearly and explain what you can from the context. Never fabricate "
                "academic content. Never reveal assessment answers, question banks, or "
                "materials from other courses. Cite sources when referring to specific content."
            )
        else:
            return (
                "You are the Mindexa Study Support Agent. No relevant course materials were "
                "found for this question. Answer from general academic knowledge only, "
                "clearly stating that your answer is not based on the student's specific "
                "course materials. Encourage the student to check their uploaded notes or "
                "ask their lecturer."
            )

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

    async def _call_llm(self, system_prompt: str, user_prompt: str, history: List[Dict[str, Any]], student_id: uuid.UUID) -> str:
        messages = [AIMessage(role="system", content=system_prompt)]
        
        # Add history
        for msg in history[-5:]: # Last 5 messages for context
            messages.append(AIMessage(role=msg["role"], content=msg["content"]))
            
        messages.append(AIMessage(role="user", content=user_prompt))
        
        request = AICompletionRequest(
            messages=messages,
            temperature=0.2,
            max_tokens=1000,
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
