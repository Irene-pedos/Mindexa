import asyncio
from sqlmodel import select
from app.db.session import AsyncSessionFactory
from app.db.models.assessment import AssessmentSection

async def check():
    async with AsyncSessionFactory() as db:
        res = await db.execute(select(AssessmentSection))
        sections = res.scalars().all()
        print(f"Total sections: {len(sections)}")
        for s in sections:
            print(f"Section ID: {s.id}")
            print(f"  Title: {s.title}")
            print(f"  Allowed Types: {s.allowed_question_types}")
            print(f"  Difficulty: {s.difficulty_distribution}")

if __name__ == "__main__":
    asyncio.run(check())
