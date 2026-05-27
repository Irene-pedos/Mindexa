
import asyncio
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Mock settings and imports
import sys
import os
sys.path.append(os.getcwd())

from app.db.repositories.attempt_repo import AttemptRepository
from app.core.config import settings

async def debug_get_attempt():
    if not settings.DATABASE_ASYNC_URL:
        print("DATABASE_ASYNC_URL not set!")
        return

    engine = create_async_engine(settings.DATABASE_ASYNC_URL)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    # I need a valid attempt ID from the database to test
    async with AsyncSessionLocal() as db:
        from app.db.models.attempt import AssessmentAttempt
        res = await db.execute(select(AssessmentAttempt.id).limit(1))
        attempt_id = res.scalar_one_or_none()
        
        if not attempt_id:
            print("No attempts found in DB to test.")
            return

        print(f"Testing get_with_questions for attempt: {attempt_id}")
        repo = AttemptRepository(db)
        try:
            attempt = await repo.get_with_questions(attempt_id)
            print(f"Success! Attempt loaded: {attempt.id}")
            if attempt.assessment:
                print(f"Assessment: {attempt.assessment.title}")
                print(f"Question count: {len(attempt.assessment.assessment_questions)}")
        except Exception as e:
            print(f"ERROR caught in repo call: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(debug_get_attempt())
