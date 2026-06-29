import asyncio
from sqlalchemy import text
from app.db.session import AsyncSessionFactory

async def check():
    async with AsyncSessionFactory() as db:
        res = await db.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'question';
        """))
        columns = res.fetchall()
        print("Columns in 'question' table:")
        for col in columns:
            print(f"  {col[0]}: {col[1]}")

if __name__ == "__main__":
    asyncio.run(check())
