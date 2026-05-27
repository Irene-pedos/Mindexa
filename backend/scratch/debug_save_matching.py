
import asyncio
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Mock settings and imports
import sys
import os
sys.path.append(os.getcwd())

from app.services.submission_service import SubmissionService
from app.core.config import settings
from app.db.enums import SubmissionAnswerType

async def debug_save_matching():
    if not settings.DATABASE_ASYNC_URL:
        print("DATABASE_ASYNC_URL not set!")
        return

    engine = create_async_engine(settings.DATABASE_ASYNC_URL)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with AsyncSessionLocal() as db:
        # I need a valid attempt, question, and student
        from app.db.models.attempt import AssessmentAttempt, StudentResponse
        from app.db.models.question import Question, AssessmentQuestion
        
        # Get an active attempt
        res = await db.execute(select(AssessmentAttempt).limit(1))
        attempt = res.scalar_one_or_none()
        if not attempt:
            print("No attempts found.")
            return

        # Find a question in this assessment
        q_res = await db.execute(select(Question).join(AssessmentQuestion).where(AssessmentQuestion.assessment_id == attempt.assessment_id).limit(1))
        question = q_res.scalar_one_or_none()
        if not question:
            print("No questions found for assessment.")
            return

        print(f"Testing save_answer (MATCH_PAIRS) for attempt {attempt.id}, question {question.id}")
        service = SubmissionService(db)
        try:
            # Emulate matching dictionary
            matching_data = {"left-uuid-1": "right-uuid-1"}
            
            response, created = await service.save_answer(
                attempt_id=attempt.id,
                question_id=question.id,
                student_id=attempt.student_id,
                access_token=attempt.access_token,
                answer_type="MATCH_PAIRS",
                match_pairs_json=matching_data,
                change_type="debug"
            )
            print(f"Success! Response {'created' if created else 'updated'}: {response.id}")
            print(f"Stored match_pairs_json: {response.match_pairs_json}")
            
            await db.commit()
        except Exception as e:
            print(f"ERROR caught in service call: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(debug_save_matching())
