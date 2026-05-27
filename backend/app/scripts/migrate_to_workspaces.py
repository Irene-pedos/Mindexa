"""
app/scripts/migrate_to_workspaces.py

Data migration script to initialize TeachingWorkspace instances for all existing
TeachingAssignment records.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Ensure project root is on PYTHONPATH
_project_root = Path(__file__).resolve().parent.parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models.academic import TeachingAssignment, TeachingWorkspace, Course, ClassSection

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("workspace_migration")

async def migrate():
    async with AsyncSessionLocal() as db:
        logger.info("--- Starting Workspace Migration ---")

        # 1. Fetch all assignments that don't have workspaces yet
        stmt = select(TeachingAssignment).where(TeachingAssignment.is_active == True)
        result = await db.execute(stmt)
        assignments = result.scalars().all()
        
        count = 0
        for assignment in assignments:
            # Check if workspace exists
            ws_stmt = select(TeachingWorkspace).where(
                TeachingWorkspace.teaching_assignment_id == assignment.id
            )
            ws_res = await db.execute(ws_stmt)
            if ws_res.scalars().first():
                continue

            # Need Course and Section for title
            course_stmt = select(Course).where(Course.id == assignment.course_id)
            course = (await db.execute(course_stmt)).scalar_one_or_none()
            
            section_stmt = select(ClassSection).where(ClassSection.id == assignment.class_section_id)
            section = (await db.execute(section_stmt)).scalar_one_or_none()
            
            if not course or not section:
                logger.warning(f"Skipping assignment {assignment.id}: Missing course or section")
                continue

            # Create Workspace
            workspace = TeachingWorkspace(
                teaching_assignment_id=assignment.id,
                course_id=course.id,
                class_section_id=section.id,
                academic_period_id=assignment.academic_period_id,
                title=f"{course.name} ({section.name})",
                description=course.description,
                status="ACTIVE",
                created_by_id=assignment.lecturer_id # Assign to lecturer
            )
            db.add(workspace)
            count += 1
            
        await db.commit()
        logger.info(f"Migration complete. Created {count} workspaces.")

if __name__ == "__main__":
    asyncio.run(migrate())
