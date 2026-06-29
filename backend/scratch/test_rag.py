import asyncio
import os
import uuid
from dotenv import load_dotenv

# Load env variables from .env
load_dotenv(dotenv_path="D:/Projects/mindexa/backend/.env")

from app.services.rag_service import RAGService
from app.db.session import AsyncSessionFactory

async def test():
    workspace_id = uuid.UUID("de829d0b-e897-49bc-a288-b5f81fcd4d71")
    topic = "Air Polution"
    
    async with AsyncSessionFactory() as db:
        rag = RAGService(db)
        try:
            context = await rag.retrieve_context_for_lecturer(
                topic=topic,
                teaching_workspace_id=workspace_id,
                top_k=8,
            )
            print("RETRIEVED CONTEXT:")
            print("Length:", len(context))
            print("Content preview:")
            print(repr(context))
        except Exception as e:
            print("RAG Retrieval Failed:", str(e))

if __name__ == "__main__":
    asyncio.run(test())
