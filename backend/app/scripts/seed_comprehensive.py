"""
app/scripts/seed_comprehensive.py

Comprehensive seed script to refresh the database with consistent academic data.
Clears existing data and sets up a complete hierarchy matching current project state.
"""

import asyncio
import logging
import sys
from pathlib import Path
from datetime import UTC, datetime, date

# Ensure project root is on PYTHONPATH
_project_root = Path(__file__).resolve().parent.parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from sqlalchemy import select, text, delete
from app.db.session import AsyncSessionLocal
from app.core.security import hash_password
from app.db.enums import (
    UserRole, 
    UserStatus, 
    AcademicPeriodType, 
    LecturerAssignmentRole,
    EnrollmentStatus
)
from app.db.models.auth import User, UserProfile
from app.db.models.academic import (
    Institution,
    Campus,
    College,
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
    LecturerCourseAssignment,
    StudentEnrollment
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("seed_comprehensive")

async def clear_data(db):
    logger.info("--- Clearing Existing Academic Data ---")
    
    # Tables to clear in order
    from app.db.models.academic import TeachingAssignment, TeachingWorkspace
    from app.db.models.notification import Notification
    from app.db.models.audit import SecurityEvent
    tables = [
        StudentEnrollment,
        LecturerCourseAssignment,
        TeachingWorkspace,
        TeachingAssignment,
        LecturerOption,
        LecturerDepartment,
        LecturerInstitution,
        CourseOption,
        CourseDepartment,
        ClassSection,
        Course,
        AcademicPeriod,
        ClassGroup,
        Option,
        Department,
        College,
        Campus,
        Institution,
        Notification,
        SecurityEvent,
        UserProfile,
        User
    ]
    
    for table in tables:
        await db.execute(delete(table))
    
    await db.commit()
    logger.info("Data cleared.")

async def seed_comprehensive():
    async with AsyncSessionLocal() as db:
        await clear_data(db)
        logger.info("--- Starting Comprehensive Seed ---")

        # 1. Institutions
        inst1 = Institution(name="Mindexa University of Science", code="MUS", is_active=True)
        db.add(inst1)
        await db.flush()
        
        # 2. Campuses
        campus1 = Campus(institution_id=inst1.id, name="Kigali Main Campus", code="KGL", is_active=True)
        db.add(campus1)
        await db.flush()
        
        # 3. Colleges
        college1 = College(campus_id=campus1.id, name="College of Engineering", code="COE", is_active=True)
        db.add(college1)
        await db.flush()
        
        # 4. Departments
        dept1 = Department(institution_id=inst1.id, college_id=college1.id, name="Computer Science", code="CS", is_active=True)
        db.add(dept1)
        await db.flush()
        
        # 5. Options
        opt1 = Option(department_id=dept1.id, name="Software Engineering", code="SE", is_active=True)
        db.add(opt1)
        await db.flush()
        
        # 6. Class Groups (Levels)
        cg1 = ClassGroup(option_id=opt1.id, name="Level 6 (Year 1 & 2)", code="L6", level=6, is_active=True)
        cg2 = ClassGroup(option_id=opt1.id, name="Level 7 (Year 3)", code="L7", level=7, is_active=True)
        db.add_all([cg1, cg2])
        await db.flush()

        # 7. Academic Periods
        p1 = AcademicPeriod(
            institution_id=inst1.id,
            name="2024 - 2025",
            period_type=AcademicPeriodType.SEMESTER,
            start_date=date(2024, 9, 1),
            end_date=date(2025, 6, 30),
            is_active=True
        )
        p2 = AcademicPeriod(
            institution_id=inst1.id,
            name="2025 - 2026",
            period_type=AcademicPeriodType.SEMESTER,
            start_date=date(2025, 9, 1),
            end_date=date(2026, 6, 30),
            is_active=True
        )
        db.add_all([p1, p2])
        await db.flush()

        # 8. Admin User
        admin = User(
            email="admin@mindexa.dev",
            hashed_password=hash_password("Mindexa@2026"),
            role=UserRole.ADMIN.value,
            status=UserStatus.ACTIVE.value,
            email_verified=True,
            onboarding_completed=True
        )
        db.add(admin)
        await db.flush()
        admin_profile = UserProfile(user_id=admin.id, first_name="System", last_name="Admin")
        db.add(admin_profile)

        # 9. Lecturer User
        lecturer = User(
            email="lecturer@mindexa.dev",
            hashed_password=hash_password("Mindexa@2026"),
            role=UserRole.LECTURER.value,
            status=UserStatus.ACTIVE.value,
            email_verified=True,
            onboarding_completed=True
        )
        db.add(lecturer)
        await db.flush()
        lect_profile = UserProfile(
            user_id=lecturer.id,
            first_name="Alice",
            last_name="Professor",
            staff_id="LEC-CS-001",
            phone_number="+250780000001",
            bio="Expert in Distributed Systems and Cloud Computing.",
            college="College of Engineering",
            department="Computer Science",
            option="Software Engineering"
        )
        db.add(lect_profile)
        await db.flush()

        # 10. Student User
        student = User(
            email="student@mindexa.dev",
            hashed_password=hash_password("Mindexa@2026"),
            role=UserRole.STUDENT.value,
            status=UserStatus.ACTIVE.value,
            email_verified=True,
            onboarding_completed=True
        )
        db.add(student)
        await db.flush()
        stud_profile = UserProfile(
            user_id=student.id,
            first_name="Bob",
            last_name="Student",
            student_id="2024/UG/CS/001",
            phone_number="+250780000002",
            institution_id=inst1.id,
            campus_id=campus1.id,
            college_id=college1.id,
            department_id=dept1.id,
            option_id=opt1.id,
            level="Level 6",
            year="2024 - 2025"
        )
        db.add(stud_profile)
        await db.flush()

        # 11. Courses
        course1 = Course(
            institution_id=inst1.id,
            academic_period_id=p1.id,
            academic_year="2024 - 2025",
            name="Introduction to Programming",
            code="CS101",
            description="Fundamentals of programming using Python.",
            credit_hours=3,
            is_active=True
        )
        db.add(course1)
        await db.flush()
        
        # Link course to dept and opt
        db.add(CourseDepartment(course_id=course1.id, department_id=dept1.id))
        db.add(CourseOption(course_id=course1.id, option_id=opt1.id))
        
        # Create Class Sections
        section1 = ClassSection(
            course_id=course1.id,
            class_group_id=cg1.id,
            name="Group A",
            capacity=60,
            is_active=True
        )
        db.add(section1)
        await db.flush()

        # 12. Teaching Assignments
        from app.db.models.academic import TeachingAssignment as TeachingAssignmentModel
        ta = TeachingAssignmentModel(
            lecturer_id=lecturer.id,
            institution_id=inst1.id,
            campus_id=campus1.id,
            college_id=college1.id,
            department_id=dept1.id,
            option_id=opt1.id,
            course_id=course1.id,
            class_section_id=section1.id,
            academic_year="2024 - 2025",
            academic_period_id=p1.id,
            role=LecturerAssignmentRole.MAIN_LECTURER,
            is_active=True
        )
        db.add(ta)
        await db.flush()
        
        # Assign Lecturer to specific course (Legacy model link)
        db.add(LecturerCourseAssignment(
            lecturer_id=lecturer.id,
            course_id=course1.id,
            assignment_role=LecturerAssignmentRole.MAIN_LECTURER,
            is_active=True
        ))

        # 13. Enroll Student
        enroll = StudentEnrollment(
            student_id=student.id,
            class_section_id=section1.id,
            enrollment_status=EnrollmentStatus.ACTIVE,
            enrolled_at=datetime.now(UTC)
        )
        db.add(enroll)
        
        # Update student profile with section_id
        stud_profile.class_section_id = section1.id

        await db.commit()
        logger.info("\n--- Comprehensive Seed Completed Successfully ---")
        logger.info(f"Admin:    admin@mindexa.dev / Mindexa@2026")
        logger.info(f"Lecturer: lecturer@mindexa.dev / Mindexa@2026")
        logger.info(f"Student:  student@mindexa.dev / Mindexa@2026")

if __name__ == "__main__":
    asyncio.run(seed_comprehensive())
