import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def check():
    test_db_url = settings.DATABASE_ASYNC_URL.replace(
        f"/{settings.POSTGRES_DB}",
        f"/{settings.POSTGRES_DB}_test",
    )
    engine = create_async_engine(test_db_url)
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))
        tables = [r[0] for r in res.fetchall()]
        print("Tables in test DB:", ", ".join(tables))
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check())
