"""
app/scripts/seed_academic_v2.py

Dedicated seed script for the updated academic hierarchy and lecturer multi-association.
"""

import asyncio
import logging
import uuid
import sys
from pathlib import Path
from datetime import UTC, datetime, date, timedelta

# Ensure project root is on PYTHONPATH
_project_root = Path(__file__).resolve().parent.parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from sqlalchemy import select, text
from app.db.session import AsyncSessionLocal
from app.core.security import hash_password
from app.db.enums import (
    UserRole, 
    UserStatus, 
    AcademicPeriodType, 
    LecturerAssignmentRole
)
from app.db.models.auth import User, UserProfile
from app.db.models.academic import (
    Institution,
    Department,
    Option,
    ClassGroup,
    ClassSection,
    AcademicPeriod,
    Course,
    CourseDepartment,
    CourseOption,
    LecturerInstitution,
    LecturerDepartment,
    LecturerOption,
    LecturerCourseAssignment
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("seed_v2")

async def seed_v2():
    async with AsyncSessionLocal() as db:
        logger.info("--- Starting Enhanced Academic Seed (V2) ---")

        # 1. Institution
        inst = await db.execute(select(Institution).where(Institution.code == "MINDEXA_V2"))
        institution = inst.scalars().first()
        if not institution:
            institution = Institution(name="Mindexa Global University", code="MINDEXA_V2", is_active=True)
            db.add(institution)
            await db.flush()
            logger.info(f"Created Institution: {institution.name}")
        else:
            logger.info("Institution MINDEXA_V2 already exists")

        # 2. Departments
        departments_data = [
            {"name": "School of Engineering", "code": "ENG"},
            {"name": "School of Business", "code": "BUS"}
        ]
        depts = {}
        for d in departments_data:
            res = await db.execute(select(Department).where(Department.code == d["code"], Department.institution_id == institution.id))
            dept = res.scalars().first()
            if not dept:
                dept = Department(institution_id=institution.id, name=d["name"], code=d["code"], is_active=True)
                db.add(dept)
                await db.flush()
                logger.info(f"Created Department: {dept.name}")
            depts[d["code"]] = dept

        # 3. Options
        options_data = [
            {"dept": "ENG", "name": "Software Engineering", "code": "SE"},
            {"dept": "ENG", "name": "Networking & Cyber", "code": "NET"},
            {"dept": "BUS", "name": "Accounting", "code": "ACC"}
        ]
        opts = {}
        for o in options_data:
            dept = depts[o["dept"]]
            res = await db.execute(select(Option).where(Option.code == o["code"], Option.department_id == dept.id))
            opt = res.scalars().first()
            if not opt:
                opt = Option(department_id=dept.id, name=o["name"], code=o["code"], is_active=True)
                db.add(opt)
                await db.flush()
                logger.info(f"Created Option: {opt.name}")
            opts[o["code"]] = opt

        # 4. Class Groups
        class_groups_data = [
            {"opt": "SE", "name": "Year 3 SE A", "code": "Y3SEA", "level": 3},
            {"opt": "SE", "name": "Year 3 SE B", "code": "Y3SEB", "level": 3},
            {"opt": "NET", "name": "Year 2 NET", "code": "Y2NET", "level": 2}
        ]
        cgs = {}
        for cg_d in class_groups_data:
            opt = opts[cg_d["opt"]]
            res = await db.execute(select(ClassGroup).where(ClassGroup.code == cg_d["code"], ClassGroup.option_id == opt.id))
            cg = res.scalars().first()
            if not cg:
                cg = ClassGroup(option_id=opt.id, name=cg_d["name"], code=cg_d["code"], level=cg_d["level"], is_active=True)
                db.add(cg)
                await db.flush()
                logger.info(f"Created Class Group: {cg.name}")
            cgs[cg_d["code"]] = cg

        # 5. Academic Period
        res = await db.execute(select(AcademicPeriod).where(AcademicPeriod.name == "Annual 2026", AcademicPeriod.institution_id == institution.id))
        period = res.scalars().first()
        if not period:
            period = AcademicPeriod(
                institution_id=institution.id,
                name="Annual 2026",
                period_type=AcademicPeriodType.YEAR,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                is_active=True
            )
            db.add(period)
            await db.flush()
            logger.info(f"Created Period: {period.name}")

        # 6. Lecturer Account
        lecturer_email = "trainer@mindexa.dev"
        res = await db.execute(select(User).where(User.email == lecturer_email))
        lecturer = res.scalars().first()
        if not lecturer:
            lecturer = User(
                email=lecturer_email,
                hashed_password=hash_password("Mindexa@2026"),
                role=UserRole.LECTURER.value,
                status=UserStatus.ACTIVE.value,
                email_verified=True
            )
            db.add(lecturer)
            await db.flush()
            
            profile = UserProfile(
                user_id=lecturer.id,
                first_name="Advanced",
                last_name="Trainer",
                staff_id="STF-001",
                college="CST",
                department="Engineering",
                option="Software Engineering"
            )
            db.add(profile)
            await db.flush()
            logger.info(f"Created Lecturer: {lecturer_email}")
        else:
            logger.info(f"Lecturer {lecturer_email} already exists")

        # 7. Lecturer Multi-Associations
        # Associate with Institution
        res = await db.execute(select(LecturerInstitution).where(LecturerInstitution.lecturer_id == lecturer.id, LecturerInstitution.institution_id == institution.id))
        if not res.scalars().first():
            db.add(LecturerInstitution(lecturer_id=lecturer.id, institution_id=institution.id))
            logger.info("Linked lecturer to institution")

        # Associate with both Engineering and Business Departments
        for dept_code in ["ENG", "BUS"]:
            dept = depts[dept_code]
            res = await db.execute(select(LecturerDepartment).where(LecturerDepartment.lecturer_id == lecturer.id, LecturerDepartment.department_id == dept.id))
            if not res.scalars().first():
                db.add(LecturerDepartment(lecturer_id=lecturer.id, department_id=dept.id))
                logger.info(f"Linked lecturer to {dept.name}")

        # Associate with SE and NET Options
        for opt_code in ["SE", "NET"]:
            opt = opts[opt_code]
            res = await db.execute(select(LecturerOption).where(LecturerOption.lecturer_id == lecturer.id, LecturerOption.option_id == opt.id))
            if not res.scalars().first():
                db.add(LecturerOption(lecturer_id=lecturer.id, option_id=opt.id))
                logger.info(f"Linked lecturer to {opt.name}")

        # 8. Seed a Course
        course_code = "CS-ADV-101"
        res = await db.execute(select(Course).where(Course.code == course_code, Course.institution_id == institution.id))
        course = res.scalars().first()
        if not course:
            course = Course(
                institution_id=institution.id,
                academic_period_id=period.id,
                name="Advanced System Architecture",
                code=course_code,
                description="Complex distributed systems and high-availability patterns.",
                credit_hours=4,
                is_active=True
            )
            db.add(course)
            await db.flush()
            logger.info(f"Created Course: {course.name}")
            
            # Multi-Department link
            db.add(CourseDepartment(course_id=course.id, department_id=depts["ENG"].id))
            
            # Multi-Option link
            db.add(CourseOption(course_id=course.id, option_id=opts["SE"].id))
            
            # Create Sections for Class Groups
            for cg_code in ["Y3SEA", "Y3SEB"]:
                cg = cgs[cg_code]
                section = ClassSection(
                    course_id=course.id,
                    class_group_id=cg.id,
                    name=cg.name,
                    capacity=40,
                    is_active=True
                )
                db.add(section)
            
            # Assign Lecturer
            db.add(LecturerCourseAssignment(
                lecturer_id=lecturer.id,
                course_id=course.id,
                assignment_role=LecturerAssignmentRole.PRIMARY,
                is_active=True
            ))
            logger.info("Assigned lecturer and class sections to course")

        await db.commit()
        logger.info("\n--- Seed V2 Completed Successfully ---")
        logger.info(f"Login Email: {lecturer_email}")
        logger.info("Login Password: Mindexa@2026")

if __name__ == "__main__":
    asyncio.run(seed_v2())
