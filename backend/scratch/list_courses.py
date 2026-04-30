import asyncio
from app.db.session import AsyncSessionFactory
from app.db.models.academic import Course
from sqlalchemy import select

async def run():
    async with AsyncSessionFactory() as db:
        res = await db.execute(select(Course))
        courses = res.scalars().all()
        if not courses:
            print("No courses found.")
        for c in courses:
            print(f"ID: {c.id}, Name: {c.name}")

if __name__ == "__main__":
    asyncio.run(run())
