import json
from pydantic import BaseModel, ValidationError

class BulkAssessmentQuestion(BaseModel):
    id: str
    sectionId: str

data = {"id": "123", "sectionId": ""}

try:
    print(BulkAssessmentQuestion.model_validate(data))
except ValidationError as e:
    print(e)
