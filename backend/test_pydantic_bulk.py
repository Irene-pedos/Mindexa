import json
from app.schemas.assessment import BulkAssessmentPublishRequest, BulkAssessmentQuestion
from pydantic import ValidationError

data = {
    "metadata": {
        "title": "Test",
        "durationMinutes": 60,
        "passing_marks": 50
    },
    "rules": {},
    "blueprint": [],
    "questions": [
        {
            "id": "1",
            "sectionId": ""
        }
    ]
}

try:
    req = BulkAssessmentPublishRequest.model_validate(data)
    print("Success")
except ValidationError as e:
    print(e)
