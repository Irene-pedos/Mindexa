import asyncio
import uuid
from app.db.session import AsyncSessionLocal
from app.db.repositories.grading_repo import GradingRepository
from app.schemas.grading import SubmissionGradeResponse
from app.api.v1.routes.grading import get_grade_for_response
from app.db.models.auth import User

async def main():
    async with AsyncSessionLocal() as db:
        user = await db.get(User, uuid.UUID("efc3793c-2ead-4529-8dc9-3a787ca5ef36")) # test user
        response_id = uuid.UUID("19bb3132-a176-4e2f-a22b-edcc448a6320")
        try:
            resp = await get_grade_for_response(response_id, user, db)
            print("Successfully got response")
        except Exception as e:
            print("Error:")
            print(e)
            
if __name__ == "__main__":
    asyncio.run(main())