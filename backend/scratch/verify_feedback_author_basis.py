import asyncio

from app.db.session import AsyncSessionFactory
from sqlalchemy import text


async def main() -> None:
    async with AsyncSessionFactory() as session:
        result = await session.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name='submission_grade' AND column_name='feedback_author_basis'")
        )
        print(result.fetchall())

asyncio.run(main())
