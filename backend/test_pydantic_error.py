import asyncio
from app.schemas.assessment import BulkAssessmentPublishRequest, BulkAssessmentMetadata
import json

payload = {
    "metadata": {
        "title": "Test",
        "mode": "CAT",
        "durationMinutes": 120,
        "course_id": "some_uuid_or_string"
    },
    "blueprint": [],
    "questions": [],
    "rules": {}
}

# The problem is probably in validation_alias or some other logic
try:
    req = BulkAssessmentPublishRequest(**payload)
    print("Parsed:", req.metadata.model_dump())
except Exception as e:
    import traceback
    traceback.print_exc()
