import uuid
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from app.agents.base import BaseAgent
from app.core.ai.gateway import AIGateway
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.db.enums import AIActionType
from app.db.schemas.rag import RAGRetrievalResult, SourceCitation
from app.services.rag_service import RAGService


class LecturerSupportAgentResponse(BaseModel):
    answer: str
    citations: List[SourceCitation]
    fallback_used: bool


class LecturerSupportAgent(BaseAgent):
    """Agent responsible for aiding lecturers with RAG grounding."""

    def __init__(self, gateway: AIGateway):
        super().__init__(gateway)
        self.rag_service = None

    async def answer(
        self,
        question: str,
        workspace_id: uuid.UUID,
        mode: str,
        selected_material_ids: Optional[List[uuid.UUID]],
        conversation_history: List[Dict[str, Any]],
        db: Any,
    ) -> LecturerSupportAgentResponse:
        self.rag_service = RAGService(db)

        # 1. RAG retrieval
        rag_result = await self.rag_service.retrieve_context_for_lecturer(
            topic=question,
            teaching_workspace_id=workspace_id,
            material_ids=selected_material_ids,
        )

        # 2. Map mode to AIActionType
        action_mapping = {
            "chat": AIActionType.STUDY_SUPPORT,
            "content": AIActionType.DOCUMENT_SUMMARY,
            "review": AIActionType.GRADE_RESPONSE,
            "feedback": AIActionType.SUGGEST_FEEDBACK,
            "analytics": AIActionType.NARRATE_ANALYTICS,
            "insights": AIActionType.NARRATE_ANALYTICS,
        }
        action_type = action_mapping.get(mode, AIActionType.STUDY_SUPPORT)

        # 3. System and User Prompt building with honesty rules
        system_prompt = self._build_system_prompt(has_context=not rag_result.fallback_used)
        user_prompt = self._build_user_prompt(
            question, rag_result.context_string, rag_result.fallback_used
        )

        # 4. Build message list
        messages = [AIMessage(role="system", content=system_prompt)]
        for turn in conversation_history[-10:]:
            role = "assistant" if turn.get("role") == "model" else turn.get("role", "user")
            messages.append(AIMessage(role=role, content=turn.get("content", "")))
        messages.append(AIMessage(role="user", content=user_prompt))

        request = AICompletionRequest(
            messages=messages,
            temperature=0.3 if mode != "chat" else 0.7,
            max_tokens=2048,
        )

        response = await self.gateway.complete(
            request,
            action_type=action_type,
            actor_id=None,
            actor_role="lecturer",
        )

        return LecturerSupportAgentResponse(
            answer=response.content,
            citations=rag_result.citations,
            fallback_used=rag_result.fallback_used,
        )

    def _build_system_prompt(self, has_context: bool) -> str:
        if has_context:
            return (
                "You are the Mindexa Lecturer AI Assistant. You help lecturers draft course materials, "
                "rubrics, feedback, and answer pedagogical questions. Use the retrieved course material "
                "context as your primary source of truth. If the retrieved context does not fully answer "
                "the question, clearly state what was found in the context first, and then supplement "
                "with general academic knowledge, labeling the general knowledge clearly. Never claim to "
                "have read or accessed a course file unless retrieved chunks from that file were actually "
                "provided in the context. If the user asks something entirely unrelated to academic, "
                "pedagogical, or coursework topics (not identity questions — those are handled separately), "
                "briefly and kindly redirect them to teaching, rubric, and course design topics."
            )
        else:
            return (
                "You are the Mindexa Lecturer AI Assistant. No relevant course materials were found in the "
                "retrieved context. Answer the lecturer's query using general academic knowledge only, and "
                "clearly state at the beginning that your answer is not based on specific course materials. "
                "If the user asks something entirely unrelated to academic, pedagogical, or coursework topics "
                "(not identity questions — those are handled separately), briefly and kindly redirect them to "
                "teaching, rubric, and course design topics."
            )

    def _build_user_prompt(self, question: str, context: str, fallback: bool) -> str:
        if not fallback:
            return (
                f"Lecturer Request:\n{question}\n\n"
                f"Retrieved Course Material Context:\n{context}\n\n"
                "Please respond using the context provided."
            )
        else:
            return f"Lecturer Request:\n{question}\n\nNo matching course material context was found."
