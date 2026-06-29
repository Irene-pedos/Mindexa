import asyncio
import os
import uuid
from dotenv import load_dotenv

# Load env variables from .env
load_dotenv(dotenv_path="D:/Projects/mindexa/backend/.env")

from app.core.ai.provider_factory import get_ai_provider
from app.core.ai.gateway import AIGateway
from app.agents.assessment_generator_agent import AssessmentGeneratorAgent
from app.db.session import AsyncSessionFactory

async def test():
    provider = get_ai_provider()
    print("Provider:", provider.name)
    print("Default Model:", provider.default_model)
    
    async with AsyncSessionFactory() as db:
        gateway = AIGateway(db, provider)
        agent = AssessmentGeneratorAgent(gateway)
        
        try:
            questions, prompt = await agent.generate(
                lecturer_id=uuid.uuid4(),
                question_type="case_study",
                difficulty="hard",
                count=1,
                subject="Latest Assessment",
                topic="Air Polution",
                bloom_level="remember",
                course_material_context=None,
            )
            print("SUCCESS!")
            print(f"Generated {len(questions)} questions")
            for q in questions:
                print("-", q.question)
        except Exception as e:
            print("FAILED!")
            print("Error Type:", type(e))
            print("Error Message:", str(e))

if __name__ == "__main__":
    asyncio.run(test())
