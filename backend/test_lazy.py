import asyncio
import uuid
from app.db.session import AsyncSessionLocal
from app.db.repositories.grading_repo import GradingRepository
from app.schemas.grading import SubmissionGradeResponse

async def main():
    async with AsyncSessionLocal() as db:
        repo = GradingRepository(db)
        from sqlalchemy import select
        from app.db.models.attempt import SubmissionGrade
        res = await db.execute(select(SubmissionGrade.response_id).limit(1))
        response_id = res.scalar_one_or_none()
        if not response_id:
            print("No response found")
            return
            
        print("Testing with response_id:", response_id)
        grade = await repo.get_full_grade_detail(response_id)
        if grade:
            print("Grade loaded:", grade.id)
            try:
                resp = SubmissionGradeResponse.model_validate(grade)
                print("Validated successfully!")
            except Exception as e:
                print("Error validating:")
                print(e)
        else:
            print("No grade found")

if __name__ == "__main__":
    asyncio.run(main())