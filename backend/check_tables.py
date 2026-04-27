import asyncio

from sqlalchemy import text

from app.db.session import AsyncSessionLocal


async def check():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema='public'
            ORDER BY table_name
        """))
        tables = [row[0] for row in result]
        print("Tables in database:", tables)
        print(f"Total tables: {len(tables)}")

if __name__ == "__main__":
    asyncio.run(check())
