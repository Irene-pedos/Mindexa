import asyncio
from app.db.session import engine
from app.db.base import BaseModel
# Import all models to ensure they are registered with BaseModel.metadata
import app.db.models

async def create_all():
    async with engine.begin() as conn:
        print("Creating tables...")
        await conn.run_sync(BaseModel.metadata.create_all)
        print("Tables created.")

if __name__ == "__main__":
    asyncio.run(create_all())
