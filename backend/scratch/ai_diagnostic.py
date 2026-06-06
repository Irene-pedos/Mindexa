import asyncio
import uuid
import sys
import os

# Add backend to path so we can import app
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.core.ai.provider_factory import get_ai_provider, get_embedding_provider
from app.core.ai.gateway import AIGateway
from app.core.ai.providers import AICompletionRequest, AIMessage, AIEmbeddingRequest
from app.db.session import AsyncSessionLocal
from app.services.rag_service import RAGService
from app.core.config import settings

async def diagnostic_check():
    print("--- Mindexa AI Diagnostic Check ---")
    
    async with AsyncSessionLocal() as db:
        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(db, chat_provider, embed_provider)
        
        print(f"Chat Provider: {chat_provider.name} ({chat_provider.default_model})")
        print(f"Embedding Provider: {embed_provider.name} ({embed_provider.default_model})")
        
        # 1. Test Chat Completion (Groq)
        print("\n1. Testing Chat Completion...")
        try:
            req = AICompletionRequest(
                messages=[AIMessage(role="user", content="Hello, respond with 'OK' if you can hear me.")],
                max_tokens=10
            )
            # Use a dummy actor_id for auditing
            dummy_id = uuid.uuid4()
            resp = await gateway.complete(
                req, 
                action_type="STUDY_SUPPORT", 
                actor_id=dummy_id, 
                actor_role="student"
            )
            print(f"SUCCESS: AI responded: {resp.content}")
        except Exception as e:
            print(f"NOTICE: Chat failed (expected if API key missing): {type(e).__name__}")

        # 2. Test Embedding (Jina)
        print("\n2. Testing Embedding...")
        try:
            emb_req = AIEmbeddingRequest(input="This is a test sentence for RAG indexing.")
            emb_resp = await gateway.embed(emb_req)
            print(f"SUCCESS: Generated embedding of dimension {len(emb_resp.embeddings[0])}")
        except Exception as e:
            print(f"NOTICE: Embedding failed (expected if API key missing): {type(e).__name__}")

        # 3. Test RAG Retrieval Logic
        print("\n3. Testing RAG Retrieval Logic...")
        try:
            rag_service = RAGService(db, gateway)
            # Use dummy IDs
            dummy_student = uuid.uuid4()
            dummy_inst = uuid.uuid4()
            
            # This will likely return empty list because no data is indexed
            chunks = await rag_service.retrieve_context_for_student(
                student_id=dummy_student,
                institution_id=dummy_inst,
                query_text="What is SQL?"
            )
            print(f"SUCCESS: RAG retrieval logic executed. Found {len(chunks)} chunks.")
        except Exception as e:
            print(f"ERROR: RAG retrieval logic failed: {type(e).__name__} - {str(e)}")

    print("\n--- Diagnostic Check Complete ---")

if __name__ == "__main__":
    asyncio.run(diagnostic_check())
