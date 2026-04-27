import asyncio

from sqlalchemy import text

from app.db.session import AsyncSessionLocal


async def check_columns():
    async with AsyncSessionLocal() as session:
        for table in ['users', 'security_event', 'ai_generation_batch']:
            print(f"--- Table: {table} ---")
            query = text(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{table}'")
            res = await session.execute(query)
            for row in res.fetchall():
                print(row)
        
        for enum in ['securityeventtype', 'securityeventseverity', 'aibatchstatus']:
            print(f"--- Enum: {enum} ---")
            query = text(f"SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE typname = '{enum}'")
            res = await session.execute(query)
            print([r[0] for r in res.fetchall()])

if __name__ == "__main__":
    asyncio.run(check_columns())
