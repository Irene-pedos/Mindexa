import asyncio
from sqlalchemy import text
from app.db.session import AsyncSessionFactory, engine
from app.core.logging import get_logger

logger = get_logger(__name__)


async def reset_database():
    async with AsyncSessionFactory() as session:
        result = await session.execute(
            text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = 'public' 
                  AND tablename != 'alembic_version';
            """)
        )
        tables = [row[0] for row in result.fetchall()]
        if not tables:
            print("No user tables found to truncate.")
            return

        print(f"Truncating {len(tables)} tables: {', '.join(tables)}")
        table_list_str = ", ".join(f'"{t}"' for t in tables)
        await session.execute(text(f"TRUNCATE TABLE {table_list_str} CASCADE;"))
        await session.commit()
        print("Database wipe complete! All user data and tables have been cleared.")


if __name__ == "__main__":
    asyncio.run(reset_database())
