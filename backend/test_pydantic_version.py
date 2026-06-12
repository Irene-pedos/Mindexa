import pydantic
from pydantic import BaseModel, ValidationError

print(f"Pydantic version: {pydantic.__version__}")

class Q(BaseModel):
    sectionId: str

try:
    print(Q.model_validate({"sectionId": ""}))
except ValidationError as e:
    print(e)

try:
    print(Q.model_validate({}))
except ValidationError as e:
    print(e)
