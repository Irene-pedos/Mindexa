
import asyncio
import uuid
from datetime import datetime, UTC
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.db.models.assessment import Assessment
from app.schemas.assessment import AssessmentSummaryResponse
from app.db.enums import AssessmentType, AssessmentStatus, GradingMode

async def test_validate():
    a = Assessment(
        id=uuid.uuid4(),
        title="Test",
        assessment_type=AssessmentType.CAT,
        status=AssessmentStatus.DRAFT,
        grading_mode=GradingMode.MANUAL,
        total_marks=100,
        draft_is_complete=False,
        created_by_id=uuid.uuid4(),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC)
    )
    try:
        res = AssessmentSummaryResponse.model_validate(a)
        print("Success")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_validate())
