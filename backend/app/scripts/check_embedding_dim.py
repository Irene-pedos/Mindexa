import asyncio
from sqlalchemy import text
from app.db.session import AsyncSessionFactory

async def check_all_vector_cols():
    async with AsyncSessionFactory() as session:
        res = await session.execute(text("""
            SELECT c.relname, a.attname, a.atttypmod
            FROM pg_attribute a
            JOIN pg_class c ON a.attrelid = c.oid
            JOIN pg_type t ON a.atttypid = t.oid
            WHERE t.typname = 'vector';
        """))
        for row in res.fetchall():
            print(f"Table: {row[0]}, Column: {row[1]}, typmod (dim): {row[2]}")

if __name__ == "__main__":
    asyncio.run(check_all_vector_cols())
