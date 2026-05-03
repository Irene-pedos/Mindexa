
import uuid
from app.db.models.assessment import Assessment
from app.schemas.assessment import AssessmentSummaryResponse

def test_pydantic():
    a = Assessment(
        id=uuid.uuid4(),
        title="Test",
        assessment_type="CAT",
        status="DRAFT",
        grading_mode="AUTO",
        total_marks=100,
        draft_is_complete=True,
        created_by_id=uuid.uuid4()
    )
    print(f"Model is_finalized: {a.is_finalized}")
    try:
        s = AssessmentSummaryResponse.model_validate(a)
        print(f"Schema is_finalized: {s.is_finalized}")
    except Exception as e:
        print(f"Pydantic failed: {e}")

if __name__ == "__main__":
    test_pydantic()
