import asyncio

from app.db.session import AsyncSessionLocal
from sqlalchemy import text


async def drop_enums():
    async with AsyncSessionLocal() as session:
        await session.execute(text('DROP TYPE IF EXISTS userrole CASCADE'))
        await session.execute(text('DROP TYPE IF EXISTS userstatus CASCADE'))
        await session.commit()
        print("✓ Enums dropped")

if __name__ == "__main__":
    asyncio.run(drop_enums())
