import asyncio
from sqlalchemy import text
from app.db.session import AsyncSessionLocal

async def check():
    async with AsyncSessionLocal() as session:
        res = await session.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_question_review'"))
        print("\n".join([r[0] for r in res.fetchall()]))

if __name__ == "__main__":
    asyncio.run(check())
