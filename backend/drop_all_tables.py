import asyncio
from sqlalchemy import text
from app.db.session import AsyncSessionLocal

async def drop_all():
    async with AsyncSessionLocal() as session:
        # Get all tables
        result = await session.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))
        tables = [row[0] for row in result.fetchall()]
        
        if tables:
            quoted_tables = [f'"{t}"' for t in tables]
            print("Dropping tables:", quoted_tables)
            await session.execute(text(f"DROP TABLE IF EXISTS {', '.join(quoted_tables)} CASCADE"))
            
        # Drop alembic version table
        await session.execute(text("DROP TABLE IF EXISTS alembic_version CASCADE"))
        
        # Drop enum types
        result = await session.execute(text("SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'"))
        types = [row[0] for row in result.fetchall()]
        if types:
            print("Dropping enum types:", types)
            for t in types:
                await session.execute(text(f"DROP TYPE IF EXISTS {t} CASCADE"))
                
        await session.commit()
        print("Database cleared.")

if __name__ == "__main__":
    asyncio.run(drop_all())
