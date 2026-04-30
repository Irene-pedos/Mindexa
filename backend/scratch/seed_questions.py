import asyncio
from app.db.session import AsyncSessionFactory
from app.db.models.question import Question
from app.db.enums import QuestionType, DifficultyLevel, QuestionSourceType
import uuid

async def run():
    async with AsyncSessionFactory() as db:
        # Check if we have any questions
        from sqlalchemy import select
        res = await db.execute(select(Question).limit(1))
        if res.scalars().first():
            print("Questions already exist.")
            return

        # Add some sample questions
        q1 = Question(
            content="What is the primary key in a database?",
            question_type=QuestionType.MCQ,
            difficulty=DifficultyLevel.EASY,
            marks=2,
            is_approved=True,
            is_in_question_bank=True,
            source_type=QuestionSourceType.MANUAL,
            topic_tag="Databases"
        )
        q2 = Question(
            content="Explain the difference between INNER JOIN and LEFT JOIN.",
            question_type=QuestionType.ESSAY,
            difficulty=DifficultyLevel.MEDIUM,
            marks=5,
            is_approved=True,
            is_in_question_bank=True,
            source_type=QuestionSourceType.MANUAL,
            topic_tag="SQL"
        )
        q3 = Question(
            content="SQL stands for Structured Query Language.",
            question_type=QuestionType.TRUE_FALSE,
            difficulty=DifficultyLevel.EASY,
            marks=1,
            is_approved=True,
            is_in_question_bank=True,
            source_type=QuestionSourceType.MANUAL,
            topic_tag="Introduction"
        )
        
        db.add_all([q1, q2, q3])
        await db.commit()
        print("Sample questions added to bank.")

if __name__ == "__main__":
    asyncio.run(run())
