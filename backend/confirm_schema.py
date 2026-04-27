import asyncio

from sqlalchemy import text

from app.db.session import AsyncSessionLocal


async def check():
    async with AsyncSessionLocal() as session:
        # Count tables
        count_res = await session.execute(text("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"))
        count = count_res.scalar()
        
        # Get version
        version_res = await session.execute(text("SELECT version_num FROM alembic_version"))
        version = version_res.scalar()
        
        # List tables for verification
        tables_res = await session.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"))
        tables = [r[0] for r in tables_res.fetchall()]
        
        print(f"Table count: {count}")
        print(f"Alembic version: {version}")
        print("Tables:", ", ".join(tables))

if __name__ == "__main__":
    asyncio.run(check())
