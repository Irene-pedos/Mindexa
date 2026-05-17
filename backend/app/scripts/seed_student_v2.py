"""
app/scripts/seed_student_v2.py

Dedicated seed script for a student with a full profile and course enrollments
reflecting the latest academic hierarchy changes.
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
    EnrollmentStatus
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
    StudentEnrollment
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("seed_student_v2")

async def seed_student_v2():
    async with AsyncSessionLocal() as db:
        logger.info("--- Seeding Student with Full Profile & Enrollments ---")

        # 1. Ensure Institution (MINDEXA_V2)
        inst_res = await db.execute(select(Institution).where(Institution.code == "MINDEXA_V2"))
        institution = inst_res.scalars().first()
        if not institution:
            institution = Institution(name="Mindexa Global University", code="MINDEXA_V2", is_active=True)
            db.add(institution)
            await db.flush()
            logger.info(f"Created Institution: {institution.name}")
        
        # 2. Ensure Department (School of Engineering)
        dept_res = await db.execute(select(Department).where(Department.code == "ENG", Department.institution_id == institution.id))
        dept = dept_res.scalars().first()
        if not dept:
            dept = Department(institution_id=institution.id, name="School of Engineering", code="ENG", is_active=True)
            db.add(dept)
            await db.flush()
            logger.info(f"Created Department: {dept.name}")

        # 3. Ensure Option (Software Engineering)
        opt_res = await db.execute(select(Option).where(Option.code == "SE", Option.department_id == dept.id))
        opt = opt_res.scalars().first()
        if not opt:
            opt = Option(department_id=dept.id, name="Software Engineering", code="SE", is_active=True)
            db.add(opt)
            await db.flush()
            logger.info(f"Created Option: {opt.name}")

        # 4. Ensure Class Group (Year 3 SE A)
        cg_res = await db.execute(select(ClassGroup).where(ClassGroup.code == "Y3SEA", ClassGroup.option_id == opt.id))
        cg = cg_res.scalars().first()
        if not cg:
            cg = ClassGroup(option_id=opt.id, name="Year 3 SE A", code="Y3SEA", level=3, is_active=True)
            db.add(cg)
            await db.flush()
            logger.info(f"Created Class Group: {cg.name}")

        # 5. Ensure Academic Period
        period_res = await db.execute(select(AcademicPeriod).where(AcademicPeriod.name == "Annual 2026", AcademicPeriod.institution_id == institution.id))
        period = period_res.scalars().first()
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

        # 6. Ensure Course & Section
        course_res = await db.execute(select(Course).where(Course.code == "CS-ADV-101", Course.institution_id == institution.id))
        course = course_res.scalars().first()
        if not course:
            course = Course(
                institution_id=institution.id,
                academic_period_id=period.id,
                name="Advanced System Architecture",
                code="CS-ADV-101",
                description="Complex distributed systems and high-availability patterns.",
                credit_hours=4,
                is_active=True,
                department_name=dept.name,
                option_name=opt.name
            )
            db.add(course)
            await db.flush()
            logger.info(f"Created Course: {course.name}")
        
        section_res = await db.execute(select(ClassSection).where(ClassSection.course_id == course.id, ClassSection.class_group_id == cg.id))
        section = section_res.scalars().first()
        if not section:
            section = ClassSection(
                course_id=course.id,
                class_group_id=cg.id,
                name=cg.name,
                capacity=40,
                is_active=True
            )
            db.add(section)
            await db.flush()
            logger.info(f"Created Section: {section.name}")

        # 7. Create Student Account
        student_email = "student_v2@mindexa.dev"
        student_password = "Mindexa@2026"
        user_res = await db.execute(select(User).where(User.email == student_email))
        student_user = user_res.scalars().first()
        
        if not student_user:
            student_user = User(
                email=student_email,
                hashed_password=hash_password(student_password),
                role=UserRole.STUDENT.value,
                status=UserStatus.ACTIVE.value,
                email_verified=True,
                email_verified_at=datetime.now(UTC)
            )
            db.add(student_user)
            await db.flush()
            
            profile = UserProfile(
                user_id=student_user.id,
                first_name="Jordan",
                last_name="Smith",
                student_id="STU-2026-001",
                phone_number="+1234567890",
                college="College of Science and Technology",
                department="School of Engineering",
                option="Software Engineering",
                level="3",
                year="2026"
            )
            db.add(profile)
            await db.flush()
            logger.info(f"Created Student User & Profile: {student_email}")
        else:
            # Update profile just in case to match latest changes
            profile_res = await db.execute(select(UserProfile).where(UserProfile.user_id == student_user.id))
            profile = profile_res.scalars().first()
            if profile:
                profile.first_name = "Jordan"
                profile.last_name = "Smith"
                profile.student_id = "STU-2026-001"
                profile.phone_number = "+1234567890"
                profile.college = "College of Science and Technology"
                profile.department = "School of Engineering"
                profile.option = "Software Engineering"
                profile.level = "3"
                profile.year = "2026"
                db.add(profile)
            logger.info(f"Student {student_email} already exists, updated profile.")

        # 8. Enroll Student in Section (V2)
        enroll_res = await db.execute(
            select(StudentEnrollment).where(
                StudentEnrollment.student_id == student_user.id,
                StudentEnrollment.class_section_id == section.id
            )
        )
        enrollment = enroll_res.scalars().first()
        if not enrollment:
            enrollment = StudentEnrollment(
                student_id=student_user.id,
                class_section_id=section.id,
                enrollment_status=EnrollmentStatus.ACTIVE,
                enrolled_at=datetime.now(UTC)
            )
            db.add(enrollment)
            logger.info(f"Enrolled student in {course.name} - {section.name}")
        else:
            logger.info(f"Student already enrolled in {course.name}")

        # 9. Enroll in Phase 1 Course (Y2 IT - Database Systems) if exists
        phase1_section_res = await db.execute(select(ClassSection).where(ClassSection.name == "Y2 IT"))
        phase1_section = phase1_section_res.scalars().first()
        if phase1_section:
            enroll_res = await db.execute(
                select(StudentEnrollment).where(
                    StudentEnrollment.student_id == student_user.id,
                    StudentEnrollment.class_section_id == phase1_section.id
                )
            )
            if not enroll_res.scalars().first():
                db.add(StudentEnrollment(
                    student_id=student_user.id,
                    class_section_id=phase1_section.id,
                    enrollment_status=EnrollmentStatus.ACTIVE,
                    enrolled_at=datetime.now(UTC)
                ))
                logger.info("Enrolled student in Y2 IT (Phase 1 course)")

        await db.commit()
        logger.info("\n--- Student Seed V2 Completed Successfully ---")
        logger.info(f"Student Email:    {student_email}")
        logger.info(f"Student Password: {student_password}")
        logger.info(f"Student ID:       STU-2026-001")

if __name__ == "__main__":
    asyncio.run(seed_student_v2())
