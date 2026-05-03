
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def check_db():
    engine = create_async_engine("postgresql+asyncpg://postgres:Postgre123@localhost:5433/mindexa_db")
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='assessment'"))
        columns = [row[0] for row in res]
        print(f"Columns: {columns}")

if __name__ == "__main__":
    asyncio.run(check_db())
