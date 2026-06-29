import asyncio
from sqlalchemy import text
from app.db.session import AsyncSessionFactory

async def apply():
    async with AsyncSessionFactory() as db:
        await db.execute(text("ALTER TABLE question ADD COLUMN IF NOT EXISTS computational_type VARCHAR;"))
        await db.commit()
        print("Successfully added computational_type column to question table!")

if __name__ == "__main__":
    asyncio.run(apply())
