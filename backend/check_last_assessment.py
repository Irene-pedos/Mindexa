import asyncio
from app.db.session import AsyncSessionLocal as SessionLocal
from app.db.models.assessment import Assessment
from sqlalchemy import select

async def main():
    async with SessionLocal() as db:
        res = await db.execute(select(Assessment).order_by(Assessment.created_at.desc()).limit(1))
        a = res.scalars().first()
        if a:
            print(f"ID: {a.id}")
            print(f"Title: {a.title}")
            print(f"Type: {a.assessment_type}")
            print(f"Status: {a.status}")
            print(f"Course ID: {a.course_id}")
            print(f"Subject ID: {a.subject_id}")
            print(f"Window Start: {a.window_start}")
        else:
            print("No assessments found")

if __name__ == "__main__":
    asyncio.run(main())
