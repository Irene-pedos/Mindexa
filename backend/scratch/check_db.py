import asyncio
from sqlalchemy import text
from app.db.session import engine

async def test():
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'resource_chunks'"))
        for row in res.fetchall():
            print(row)

asyncio.run(test())
