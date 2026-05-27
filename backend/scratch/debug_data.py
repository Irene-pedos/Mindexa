import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models.academic import Course, ClassSection, TeachingAssignment

async def main():
    async with AsyncSessionLocal() as db:
        assignments = (await db.execute(select(TeachingAssignment))).scalars().all()
        print(f"Total Assignments: {len(assignments)}")
        for a in assignments:
            print(f" Assignment {a.id}: course_id={a.course_id}, section_id={a.class_section_id}")
            
        courses = (await db.execute(select(Course))).scalars().all()
        print(f"Total Courses: {len(courses)}")
        for c in courses:
            print(f" Course {c.id}: {c.code}")
            
        sections = (await db.execute(select(ClassSection))).scalars().all()
        print(f"Total Sections: {len(sections)}")
        for s in sections:
            print(f" Section {s.id}: {s.name}")

if __name__ == "__main__":
    asyncio.run(main())
