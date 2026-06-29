import asyncio
import uuid
from sqlmodel import select
from app.db.session import AsyncSessionFactory
from app.db.models.question import AIGenerationBatch

async def check():
    batch_id = uuid.UUID("c9130b1a-2638-457f-b46b-dd16974be004")
    async with AsyncSessionFactory() as db:
        res = await db.execute(select(AIGenerationBatch).where(AIGenerationBatch.id == batch_id))
        batch = res.scalar_one_or_none()
        if batch:
            print("Batch found!")
            print(f"  Status: {batch.status}")
            print(f"  Subject: {batch.subject}")
            print(f"  Topic: {batch.topic}")
            print(f"  Question Type: {batch.question_type}")
            print(f"  Difficulty: {batch.difficulty}")
            print(f"  Bloom Level: {batch.bloom_level}")
            print(f"  Teaching Workspace ID: {batch.teaching_workspace_id}")
            print(f"  Additional Context: {batch.additional_context}")
        else:
            print("Batch not found")

if __name__ == "__main__":
    asyncio.run(check())
