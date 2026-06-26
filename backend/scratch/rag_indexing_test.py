import asyncio
import uuid
import sys
import os

sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.core.ai.provider_factory import get_ai_provider, get_embedding_provider
from app.core.ai.gateway import AIGateway
from app.db.session import AsyncSessionLocal
from app.services.rag_service import RAGService
from app.db.models.resource import StudentResource
from app.db.models.auth import User
from app.db.enums import ResourceCategory, UserRole

async def test_indexing():
    print("--- Mindexa RAG Indexing Test ---")
    
    async with AsyncSessionLocal() as db:
        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(db, chat_provider, embed_provider)
        rag_service = RAGService(db, gateway)
        
        # 0. Create a dummy user
        user = User(
            email=f"test_{uuid.uuid4().hex[:6]}@example.com",
            hashed_password="...",
            role=UserRole.STUDENT,
            is_active=True
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        print(f"Created dummy user: {user.id}")

        # 1. Create a dummy student resource record
        resource = StudentResource(
            student_id=user.id,
            original_filename="test_notes.txt",
            safe_filename="test_notes.txt",
            file_path="test_notes.txt",
            file_size_bytes=100,
            file_extension="TXT",
            mime_type="text/plain",
            resource_category=ResourceCategory.GENERAL,
            display_name="Test Notes"
        )
        db.add(resource)
        await db.commit()
        await db.refresh(resource)
        
        print(f"Created dummy resource: {resource.id}")
        
        # 2. Create a dummy file on disk
        if not os.path.exists("uploads"):
            os.makedirs("uploads")
        with open("uploads/test_notes.txt", "w") as f:
            f.write("This is a document about SQL. SQL stands for Structured Query Language. It is used for database management.")
            
        # 3. Trigger processing
        print("Processing resource...")
        try:
            await rag_service.process_student_resource(resource.id)
            print("SUCCESS: Processing finished.")
            
            # 4. Check chunks
            from app.db.models.resource import StudentResourceChunk
            from sqlalchemy import select

            stmt = select(StudentResourceChunk).where(StudentResourceChunk.student_resource_id == resource.id)

            res = await db.execute(stmt)
            chunks = res.scalars().all()
            print(f"Found {len(chunks)} chunks in database.")
            for c in chunks:
                print(f" - Chunk {c.chunk_index}: {c.content[:50]}...")
                
        except Exception as e:
            print(f"NOTICE: Indexing failed (expected if API key missing for embedding): {type(e).__name__} - {str(e)}")
        finally:
            # Cleanup
            print("Cleaning up...")
            await db.delete(resource)
            await db.delete(user)
            await db.commit()
            if os.path.exists("uploads/test_notes.txt"):
                os.remove("uploads/test_notes.txt")

    print("\n--- Indexing Test Complete ---")

if __name__ == "__main__":
    asyncio.run(test_indexing())
