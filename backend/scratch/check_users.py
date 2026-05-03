
import asyncio
from sqlmodel import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from app.db.models.auth import User

async def check_users():
    engine = create_async_engine("postgresql+asyncpg://postgres:Postgre123@localhost:5433/mindexa_db")
    async with AsyncSession(engine) as session:
        res = await session.execute(select(User))
        users = res.scalars().all()
        for u in users:
            print(f"User: {u.email} - Role: {u.role}")

if __name__ == "__main__":
    asyncio.run(check_users())
