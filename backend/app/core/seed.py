"""
app/core/seed.py

Development seed orchestrator for Mindexa Platform.

HARD RULES:
    1. ONLY runs when settings.ENVIRONMENT == "development".
       Any other environment → immediate abort.
    2. IDEMPOTENT — every seed function checks existence before inserting.
       Safe to run multiple times without duplicating data.
    3. Uses repositories for domain objects, raw SQL only for tables
       (course, subject, class_section) that have no SQLModel definition yet.
    4. Passwords are always hashed via the same bcrypt function as AuthService.
    5. A single session is used. Commit happens at the end of each major step.

SEEDED ACCOUNTS:
    admin@mindexa.dev     / Admin@123      (ADMIN, active, verified)
    lecturer@mindexa.dev  / Lecturer@123   (LECTURER, active, verified)
    student@mindexa.dev   / Student@123    (STUDENT, active, verified)

SEEDED STRUCTURE:
    1 Course  → "Introduction to Computer Science" (CS101)
    1 Subject → "Programming Fundamentals"
    1 ClassSection → "CS101-A"
    Lecturer assigned to section as PRIMARY supervisor
    Student enrolled in section

SEEDED ASSESSMENT:
    Title: "Intro to Programming CAT"
    Type: CAT, Status: ACTIVE
    5 MCQ + 2 True/False + 2 Short Answer questions
    Linked to CS101-A section

SEEDED ATTEMPT:
    Student has one IN_PROGRESS attempt with 3 answers saved.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password, normalize_email
from app.db.enums import (
    AcademicPeriodType,
    AssessmentStatus,
    AssessmentType,
    AttemptStatus,
    DifficultyLevel,
    EnrollmentStatus,
    GradingMode,
    LecturerAssignmentRole,
    QuestionAddedVia,
    QuestionSourceType,
    QuestionType,
    ResultReleaseMode,
    SubmissionAnswerType,
    SupervisorRole,
    UserRole,
    UserStatus,
)
from app.db.models import (
    AcademicPeriod,
    AssessmentAttempt,
    ClassSection,
    Course,
    CourseSubject,
    Department,
    Institution,
    LecturerCourseAssignment,
    StudentEnrollment,
    StudentResponse,
    Subject,
    User,
    UserProfile,
)
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.auth import UserRepository
from app.db.repositories.question_repo import QuestionRepository
from app.db.repositories.submission_repo import SubmissionRepository

logger = logging.getLogger("mindexa.seed")

# Questions linked to assessment count before inserting
MIN_QUESTIONS_SEEDED = 9
FIRST_MCQ_INDEX = 1
SECOND_MCQ_INDEX = 2
FIRST_TF_INDEX = 6
SECOND_TF_INDEX = 7
FIRST_SA_INDEX = 8

ADMIN_EMAIL = "admin@mindexa.dev"
ADMIN_PASSWORD = "Admin@123"
ADMIN_FIRST = "System"
ADMIN_LAST = "Admin"

LECTURER_EMAIL = "lecturer@mindexa.dev"
LECTURER_PASSWORD = "Lecturer@123"
LECTURER_FIRST = "Elena"
LECTURER_LAST = "Vasquez"

STUDENT_EMAIL = "student@mindexa.dev"
STUDENT_PASSWORD = "Student@123"
STUDENT_FIRST = "Alex"
STUDENT_LAST = "Rivera"

INSTITUTION_NAME = "Mindexa University"
INSTITUTION_CODE = "MINDEXA_U"

DEPT_NAME = "Computer Science"
DEPT_CODE = "CS"

PERIOD_NAME = "Semester 1 2026"
PERIOD_TYPE = AcademicPeriodType.SEMESTER

COURSE_CODE = "CS101"
COURSE_TITLE = "Introduction to Computer Science"
SUBJECT_CODE = "CS101_SUB"
SUBJECT_TITLE = "Programming Fundamentals"
SECTION_NAME = "Section A"
ASSESSMENT_TITLE = "Intro to Programming CAT"


# ---------------------------------------------------------------------------
# EXCEPTIONS
# ---------------------------------------------------------------------------


class SeedEnvironmentError(Exception):
    """Raised when seed is attempted outside development environment."""

    def __init__(self) -> None:
        super().__init__("Seed requires development environment")


# ---------------------------------------------------------------------------
# ENVIRONMENT GUARD (called first — aborts if not development)
# ---------------------------------------------------------------------------


def _assert_development() -> None:
    """Hard abort if not in development environment."""
    if settings.ENVIRONMENT != "development":
        raise SeedEnvironmentError()


# ---------------------------------------------------------------------------
# MAIN ORCHESTRATOR
# ---------------------------------------------------------------------------


async def seed_all(session: AsyncSession) -> None:
    """
    Seed the entire development database.

    Calls each seed function in dependency order.
    Each step commits individually so partial failures are recoverable.
    """
    _assert_development()
    logger.info("=" * 60)
    logger.info("  MINDEXA DEVELOPMENT SEED — starting")
    logger.info("=" * 60)

    # Step 1 — Users (must be first — all other objects depend on user IDs)
    _, lecturer_id, student_id = await seed_users(session)

    # Step 2 — Academic structure (course / subject / section / enrollment)
    course_id, subject_id, section_id = await seed_academic_structure(
        session, lecturer_id=lecturer_id, student_id=student_id
    )

    # Step 3 — Assessment
    assessment_id = await seed_assessment(
        session,
        course_id=course_id,
        subject_id=subject_id,
        section_id=section_id,
        lecturer_id=lecturer_id,
    )

    # Step 4 — Questions
    question_ids = await seed_questions(
        session,
        assessment_id=assessment_id,
        subject_id=subject_id,
        lecturer_id=lecturer_id,
    )

    # Step 5 — Attempt data (optional simulation)
    await seed_attempt_data(
        session,
        assessment_id=assessment_id,
        student_id=student_id,
        question_ids=question_ids,
    )

    logger.info("=" * 60)
    logger.info("  MINDEXA DEVELOPMENT SEED — complete ✔")
    logger.info("=" * 60)
    _print_credentials()


# ---------------------------------------------------------------------------
# SEED 1 — USERS
# ---------------------------------------------------------------------------


async def seed_users(
    session: AsyncSession,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """
    Create admin, lecturer, and student accounts.

    Returns (_, lecturer_id, student_id).

    Each user is:
        - email_verified = True
        - status = active
    """
    repo = UserRepository(session)

    # User configs: (email, password, role, first_name, last_name, label)
    user_configs = [
        (
            ADMIN_EMAIL,
            ADMIN_PASSWORD,
            UserRole.ADMIN.value,
            ADMIN_FIRST,
            ADMIN_LAST,
            "Admin",
        ),
        (
            LECTURER_EMAIL,
            LECTURER_PASSWORD,
            UserRole.LECTURER.value,
            LECTURER_FIRST,
            LECTURER_LAST,
            "Lecturer",
        ),
        (
            STUDENT_EMAIL,
            STUDENT_PASSWORD,
            UserRole.STUDENT.value,
            STUDENT_FIRST,
            STUDENT_LAST,
            "Student",
        ),
    ]

    user_ids = []

    for email, password, role, first_name, last_name, label in user_configs:
        normalized = normalize_email(email)
        existing = await repo.get_by_email(normalized)

        if existing:
            logger.info("  ⟳  %s user already exists (%s)", label, email)
            user_ids.append(existing.id)
            continue

        pw_hash = hash_password(password)
        user = await repo.create(
            User(
                email=normalized,
                hashed_password=pw_hash,
                role=role,
                status=UserStatus.ACTIVE.value,
            )
        )

        profile = UserProfile(
            user_id=user.id,
            first_name=first_name,
            last_name=last_name,
        )
        session.add(profile)

        # Mark email verified and active — seed accounts don't need verification flow
        user.email_verified = True
        user.email_verified_at = _utcnow()
        user.status = UserStatus.ACTIVE.value

        await session.flush()
        logger.info("  %s user created (%s)", label, email)
        user_ids.append(user.id)

    await session.commit()
    return user_ids[0], user_ids[1], user_ids[2]


# ---------------------------------------------------------------------------
# SEED 2 — ACADEMIC STRUCTURE
# ---------------------------------------------------------------------------


async def seed_academic_structure(
    session: AsyncSession,
    lecturer_id: uuid.UUID,
    student_id: uuid.UUID,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """
    Create institution -> department -> period -> course -> subject -> section -> enrollment.

    Returns (course_id, subject_id, section_id).
    """
    # ── Institution ──────────────────────────────────────────────────────────
    inst_id = await _ensure_institution(session)

    # ── Department ────────────────────────────────────────────────────────────
    dept_id = await _ensure_department(session, inst_id)

    # ── AcademicPeriod ────────────────────────────────────────────────────────
    period_id = await _ensure_academic_period(session, inst_id)

    # ── Course ────────────────────────────────────────────────────────────────
    course_id = await _ensure_course(session, inst_id, dept_id, period_id)

    # ── Subject ───────────────────────────────────────────────────────────────
    subject_id = await _ensure_subject(session, inst_id, dept_id, course_id)

    # ── ClassSection ──────────────────────────────────────────────────────────
    section_id = await _ensure_class_section(session, course_id=course_id)

    # ── Lecturer Assignment ───────────────────────────────────────────────────
    await _ensure_lecturer_assignment(session, lecturer_id=lecturer_id, course_id=course_id)

    # ── Student Enrollment ────────────────────────────────────────────────────
    await _ensure_enrollment(session, student_id=student_id, section_id=section_id)

    await session.commit()
    logger.info("  ✔  Academic structure ready")
    return course_id, subject_id, section_id


async def _ensure_institution(session: AsyncSession) -> uuid.UUID:
    """Upsert the seed institution."""
    result = await session.execute(
        select(Institution).where(
            Institution.code == INSTITUTION_CODE  # type: ignore[misc]
        )
    )
    inst = result.scalar_one_or_none()
    if inst:
        logger.info("  ⟳  Institution already exists (%s)", INSTITUTION_CODE)
        return inst.id

    inst = Institution(
        name=INSTITUTION_NAME,
        code=INSTITUTION_CODE,
        is_active=True,
    )
    session.add(inst)
    await session.flush()
    logger.info("  ✔  Institution created (%s)", INSTITUTION_CODE)
    return inst.id


async def _ensure_department(session: AsyncSession, institution_id: uuid.UUID) -> uuid.UUID:
    """Upsert the seed department."""
    stmt = select(Department)
    stmt = stmt.where(Department.code == DEPT_CODE)  # type: ignore[misc]
    stmt = stmt.where(Department.institution_id == institution_id)  # type: ignore[misc]
    result = await session.execute(stmt)
    dept = result.scalar_one_or_none()
    if dept:
        logger.info("  ⟳  Department already exists (%s)", DEPT_CODE)
        return dept.id

    dept = Department(
        institution_id=institution_id,
        name=DEPT_NAME,
        code=DEPT_CODE,
        is_active=True,
    )
    session.add(dept)
    await session.flush()
    logger.info("  ✔  Department created (%s)", DEPT_CODE)
    return dept.id


async def _ensure_academic_period(session: AsyncSession, institution_id: uuid.UUID) -> uuid.UUID:
    """Upsert the seed academic period."""
    stmt = select(AcademicPeriod)
    stmt = stmt.where(AcademicPeriod.name == PERIOD_NAME)  # type: ignore[misc]
    stmt = stmt.where(AcademicPeriod.institution_id == institution_id)  # type: ignore[misc]
    result = await session.execute(stmt)
    period = result.scalar_one_or_none()
    if period:
        logger.info("  ⟳  AcademicPeriod already exists (%s)", PERIOD_NAME)
        return period.id

    now = _utcnow()
    period = AcademicPeriod(
        institution_id=institution_id,
        name=PERIOD_NAME,
        period_type=PERIOD_TYPE,
        start_date=now - timedelta(days=30),
        end_date=now + timedelta(days=90),
        is_active=True,
    )
    session.add(period)
    await session.flush()
    logger.info("  ✔  AcademicPeriod created (%s)", PERIOD_NAME)
    return period.id


async def _ensure_course(
    session: AsyncSession,
    institution_id: uuid.UUID,
    department_id: uuid.UUID,
    period_id: uuid.UUID,
) -> uuid.UUID:
    """Upsert the seed course."""
    stmt = select(Course)
    stmt = stmt.where(Course.code == COURSE_CODE)  # type: ignore[misc]
    stmt = stmt.where(Course.institution_id == institution_id)  # type: ignore[misc]
    stmt = stmt.where(Course.academic_period_id == period_id)  # type: ignore[misc]
    result = await session.execute(stmt)
    course = result.scalar_one_or_none()
    if course:
        logger.info("  ⟳  Course already exists (%s)", COURSE_CODE)
        return course.id

    course = Course(
        institution_id=institution_id,
        department_id=department_id,
        academic_period_id=period_id,
        code=COURSE_CODE,
        name=COURSE_TITLE,
        is_active=True,
    )
    session.add(course)
    await session.flush()
    logger.info("  ✔  Course created (%s)", COURSE_CODE)
    return course.id


async def _ensure_subject(
    session: AsyncSession,
    institution_id: uuid.UUID,
    department_id: uuid.UUID,
    course_id: uuid.UUID,
) -> uuid.UUID:
    """Upsert the seed subject."""
    stmt = select(Subject)
    stmt = stmt.where(Subject.title == SUBJECT_TITLE)  # type: ignore[misc]
    stmt = stmt.where(Subject.institution_id == institution_id)  # type: ignore[misc]
    result = await session.execute(stmt)
    row = result.fetchone()
    if row:
        logger.info("  ⟳  Subject already exists (%s)", SUBJECT_TITLE)
        subject = row[0]
        subject_id = subject.id
        # Ensure CourseSubject link exists
        cs_stmt = select(CourseSubject)
        cs_stmt = cs_stmt.where(CourseSubject.course_id == course_id)  # type: ignore[misc]
        cs_stmt = cs_stmt.where(CourseSubject.subject_id == subject_id)  # type: ignore[misc]
        cs_result = await session.execute(cs_stmt)
        if not cs_result.fetchone():
            cs = CourseSubject(course_id=course_id, subject_id=subject_id)
            session.add(cs)
            await session.flush()
            logger.info("  ✔  CourseSubject link created")
        return subject_id

    subject = Subject(
        institution_id=institution_id,
        department_id=department_id,
        title=SUBJECT_TITLE,
        is_active=True,
    )
    session.add(subject)
    await session.flush()

    # Link to course
    cs = CourseSubject(course_id=course_id, subject_id=subject.id)
    session.add(cs)

    logger.info("  ✔  Subject created (%s)", SUBJECT_TITLE)
    return subject.id


async def _ensure_class_section(
    session: AsyncSession,
    course_id: uuid.UUID,
) -> uuid.UUID:
    """Upsert the seed class section."""
    stmt = select(ClassSection)
    stmt = stmt.where(ClassSection.name == SECTION_NAME)  # type: ignore[misc]
    stmt = stmt.where(ClassSection.course_id == course_id)  # type: ignore[misc]
    result = await session.execute(stmt)
    section = result.scalar_one_or_none()
    if section:
        logger.info("  ⟳  ClassSection already exists (%s)", SECTION_NAME)
        return section.id

    section = ClassSection(
        course_id=course_id,
        name=SECTION_NAME,
        capacity=50,
        is_active=True,
    )
    session.add(section)
    await session.flush()
    logger.info("  ✔  ClassSection created (%s)", SECTION_NAME)
    return section.id


async def _ensure_lecturer_assignment(
    session: AsyncSession,
    lecturer_id: uuid.UUID,
    course_id: uuid.UUID,
) -> None:
    """Assign lecturer to course."""
    stmt = select(LecturerCourseAssignment)
    stmt = stmt.where(LecturerCourseAssignment.lecturer_id == lecturer_id)  # type: ignore[misc]
    stmt = stmt.where(LecturerCourseAssignment.course_id == course_id)  # type: ignore[misc]
    result = await session.execute(stmt)
    if result.scalar_one_or_none():
        logger.info("  ⟳  Lecturer assignment already exists")
        return

    assignment = LecturerCourseAssignment(
        lecturer_id=lecturer_id,
        course_id=course_id,
        assignment_role=LecturerAssignmentRole.PRIMARY,
        is_active=True,
    )
    session.add(assignment)
    await session.flush()
    logger.info("  ✔  Lecturer assigned to course")


async def _ensure_enrollment(
    session: AsyncSession,
    student_id: uuid.UUID,
    section_id: uuid.UUID,
) -> None:
    """Enroll the student in the class section."""
    stmt = select(StudentEnrollment)
    stmt = stmt.where(StudentEnrollment.student_id == student_id)  # type: ignore[misc]
    stmt = stmt.where(StudentEnrollment.class_section_id == section_id)  # type: ignore[misc]
    result = await session.execute(stmt)
    if result.scalar_one_or_none():
        logger.info("  ⟳  Student enrollment already exists")
        return

    enrollment = StudentEnrollment(
        student_id=student_id,
        class_section_id=section_id,
        enrollment_status=EnrollmentStatus.ACTIVE,
        enrolled_at=_utcnow(),
    )
    session.add(enrollment)
    await session.flush()
    logger.info("  ✔  Student enrolled in section %s", SECTION_NAME)


# ---------------------------------------------------------------------------
# SEED 3 — ASSESSMENT
# ---------------------------------------------------------------------------


async def seed_assessment(
    session: AsyncSession,
    course_id: uuid.UUID,
    subject_id: uuid.UUID,
    section_id: uuid.UUID,
    lecturer_id: uuid.UUID,
) -> uuid.UUID:
    """
    Create a fully functional ACTIVE CAT assessment.

    Returns the assessment UUID.
    Idempotent: checks for existing assessment by title + course_id.
    """
    repo = AssessmentRepository(session)

    # Idempotency check
    existing_result = await session.execute(
        text("SELECT id FROM assessment WHERE title = :title AND course_id = :course_id LIMIT 1"),
        {"title": ASSESSMENT_TITLE, "course_id": str(course_id)},
    )
    existing_row = existing_result.fetchone()
    if existing_row:
        logger.info("  ⟳  Assessment already exists (%s)", ASSESSMENT_TITLE)
        return uuid.UUID(str(existing_row[0]))

    now = _utcnow()
    window_start = now - timedelta(hours=1)  # already open
    window_end = now + timedelta(hours=23)  # closes in 23h

    assessment = await repo.create(
        title=ASSESSMENT_TITLE,
        assessment_type=AssessmentType.CAT,
        course_id=course_id,
        subject_id=subject_id,
        created_by_id=lecturer_id,
        grading_mode=GradingMode.AUTO,
        result_release_mode=ResultReleaseMode.DELAYED,
        total_marks=25,
        instructions=(
            "Closed Book. No AI assistance allowed. Complete all sections within the time limit."
        ),
        passing_marks=15,
        duration_minutes=60,
    )

    # Immediately set status to ACTIVE and publish timestamps
    await repo.update_fields(
        assessment.id,
        lecturer_id,
        status=AssessmentStatus.ACTIVE,
        window_start=window_start,
        window_end=window_end,
        draft_is_complete=True,
        draft_step=None,
        published_at=now,
        publish_validated_at=now,
        fullscreen_required=True,
        integrity_monitoring_enabled=True,
        max_attempts=1,
    )

    # Add lecturer as PRIMARY supervisor
    await repo.add_supervisor(
        assessment_id=assessment.id,
        supervisor_id=lecturer_id,
        supervisor_role=SupervisorRole.PRIMARY,
        assigned_by_id=lecturer_id,
    )

    # Link assessment to the class section
    await repo.add_target_section(
        assessment_id=assessment.id,
        class_section_id=section_id,
        added_by_id=lecturer_id,
    )

    # Create two blueprint sections
    await repo.create_section(
        assessment_id=assessment.id,
        title="Section A — Closed Questions",
        order_index=1,
        marks_allocated=17,
        question_count_target=7,
        instructions="Answer ALL questions. Each MCQ is worth 2 marks. True/False: 1 mark each.",
    )
    await repo.create_section(
        assessment_id=assessment.id,
        title="Section B — Short Answer",
        order_index=2,
        marks_allocated=8,
        question_count_target=2,
        instructions="Answer in 2-4 sentences. Each question is worth 4 marks.",
    )

    await session.commit()
    logger.info("  ✔  Assessment created: '%s' (ACTIVE)", ASSESSMENT_TITLE)
    return assessment.id


# ---------------------------------------------------------------------------
# SEED 4 — QUESTIONS
# ---------------------------------------------------------------------------


async def seed_questions(
    session: AsyncSession,
    assessment_id: uuid.UUID,
    subject_id: uuid.UUID,
    lecturer_id: uuid.UUID,
) -> list[uuid.UUID]:
    """
    Create 5 MCQ + 2 True/False + 2 Short Answer questions.
    Link all questions to the assessment.

    Returns list of question UUIDs (in assessment order).

    Idempotent: checks question count linked to assessment before inserting.
    """
    repo = QuestionRepository(session)
    assessment_repo = AssessmentRepository(session)

    # Idempotency check — if questions already linked, skip
    linked = await assessment_repo.count_questions(assessment_id)
    if linked >= MIN_QUESTIONS_SEEDED:
        logger.info("  ⟳  Questions already seeded (%d linked)", linked)
        result = await session.execute(
            text(
                "SELECT question_id FROM assessment_question "
                "WHERE assessment_id = :aid ORDER BY order_index"
            ),
            {"aid": str(assessment_id)},
        )
        return [uuid.UUID(str(row[0])) for row in result.fetchall()]

    question_ids: list[uuid.UUID] = []
    order = 0

    # ── 5 MCQ Questions ───────────────────────────────────────────────────────

    mcq_data = [
        {
            "content": (
                "Which of the following is the correct syntax to print 'Hello, World!' in Python?"
            ),
            "difficulty": DifficultyLevel.EASY,
            "marks": 2,
            "topic_tag": "python-basics",
            "options": [
                ("print('Hello, World!')", True),
                ("echo 'Hello, World!'", False),
                ("System.out.println('Hello, World!')", False),
                ("console.log('Hello, World!')", False),
            ],
        },
        {
            "content": "What is the output of: `2 ** 3` in Python?",
            "difficulty": DifficultyLevel.EASY,
            "marks": 2,
            "topic_tag": "python-operators",
            "options": [
                ("6", False),
                ("8", True),
                ("9", False),
                ("23", False),
            ],
        },
        {
            "content": "Which data structure stores key-value pairs in Python?",
            "difficulty": DifficultyLevel.MEDIUM,
            "marks": 2,
            "topic_tag": "data-structures",
            "options": [
                ("List", False),
                ("Tuple", False),
                ("Dictionary", True),
                ("Set", False),
            ],
        },
        {
            "content": "What does the `len()` function return when called on a list?",
            "difficulty": DifficultyLevel.EASY,
            "marks": 2,
            "topic_tag": "python-builtins",
            "options": [
                ("The last element", False),
                ("The first element", False),
                ("The number of elements", True),
                ("The sum of all elements", False),
            ],
        },
        {
            "content": "Which loop will execute its body AT LEAST once regardless of condition?",
            "difficulty": DifficultyLevel.MEDIUM,
            "marks": 2,
            "topic_tag": "control-flow",
            "options": [
                ("for loop", False),
                ("while loop", False),
                ("do-while loop", True),
                ("foreach loop", False),
            ],
        },
    ]

    for q_data in mcq_data:
        question = await repo.create(
            created_by_id=lecturer_id,
            question_type=QuestionType.MCQ,
            content=q_data["content"],
            difficulty=q_data["difficulty"],
            marks=q_data["marks"],
            topic_tag=q_data["topic_tag"],
            subject_id=subject_id,
            source_type=QuestionSourceType.MANUAL,
            is_approved=True,
        )

        for idx, (opt_text, is_correct) in enumerate(q_data["options"]):
            await repo.add_option(
                question_id=question.id,
                content=opt_text,
                order_index=idx + 1,
                is_correct=is_correct,
            )

        order += 1
        await assessment_repo.add_question(
            assessment_id=assessment_id,
            question_id=question.id,
            order_index=order,
            added_via=QuestionAddedVia.MANUAL_WRITE.value,
            marks_override=q_data["marks"],
        )
        question_ids.append(question.id)

    # ── 2 True/False Questions ────────────────────────────────────────────────

    tf_data = [
        {
            "content": "In Python, variables must be explicitly declared with a type before use.",
            "difficulty": DifficultyLevel.EASY,
            "marks": 1,
            "topic_tag": "python-basics",
            "correct_is_true": False,  # Answer: False
        },
        {
            "content": "A function in Python can return multiple values.",
            "difficulty": DifficultyLevel.MEDIUM,
            "marks": 1,
            "topic_tag": "python-functions",
            "correct_is_true": True,  # Answer: True
        },
    ]

    for q_data in tf_data:
        question = await repo.create(
            created_by_id=lecturer_id,
            question_type=QuestionType.TRUE_FALSE,
            content=q_data["content"],
            difficulty=q_data["difficulty"],
            marks=q_data["marks"],
            topic_tag=q_data["topic_tag"],
            subject_id=subject_id,
            source_type=QuestionSourceType.MANUAL,
            is_approved=True,
        )

        # True option
        await repo.add_option(
            question_id=question.id,
            content="True",
            order_index=1,
            is_correct=q_data["correct_is_true"],
        )
        # False option
        await repo.add_option(
            question_id=question.id,
            content="False",
            order_index=2,
            is_correct=not q_data["correct_is_true"],
        )

        order += 1
        await assessment_repo.add_question(
            assessment_id=assessment_id,
            question_id=question.id,
            order_index=order,
            added_via=QuestionAddedVia.MANUAL_WRITE.value,
            marks_override=q_data["marks"],
        )
        question_ids.append(question.id)

    # ── 2 Short Answer Questions ──────────────────────────────────────────────

    sa_data = [
        {
            "content": (
                "Explain the difference between a 'list' and a 'tuple' in Python. "
                "Give one example of when you would use each."
            ),
            "difficulty": DifficultyLevel.MEDIUM,
            "marks": 4,
            "topic_tag": "data-structures",
            "explanation": (
                "Lists are mutable (can be changed after creation), tuples are immutable. "
                "Use a list for a collection that changes (e.g., shopping cart). "
                "Use a tuple for fixed data (e.g., coordinates)."
            ),
        },
        {
            "content": (
                "What is a 'function' in programming? "
                "Describe two benefits of using functions in your code."
            ),
            "difficulty": DifficultyLevel.EASY,
            "marks": 4,
            "topic_tag": "python-functions",
            "explanation": (
                "A function is a named block of reusable code that performs a specific task. "
                "Benefits: (1) Code reuse — write once, call many times. "
                "(2) Readability — code is easier to read and maintain."
            ),
        },
    ]

    for q_data in sa_data:
        question = await repo.create(
            created_by_id=lecturer_id,
            question_type=QuestionType.SHORT_ANSWER,
            content=q_data["content"],
            difficulty=q_data["difficulty"],
            marks=q_data["marks"],
            topic_tag=q_data["topic_tag"],
            subject_id=subject_id,
            explanation=q_data["explanation"],
            source_type=QuestionSourceType.MANUAL,
            is_approved=True,
        )

        order += 1
        await assessment_repo.add_question(
            assessment_id=assessment_id,
            question_id=question.id,
            order_index=order,
            added_via=QuestionAddedVia.MANUAL_WRITE.value,
            marks_override=q_data["marks"],
        )
        question_ids.append(question.id)

    await session.commit()
    logger.info(
        "  ✔  Questions seeded: 5 MCQ + 2 True/False + 2 Short Answer (%d total)", len(question_ids)
    )
    return question_ids


# ---------------------------------------------------------------------------
# SEED 5 — ATTEMPT DATA
# ---------------------------------------------------------------------------


async def seed_attempt_data(
    session: AsyncSession,
    assessment_id: uuid.UUID,
    student_id: uuid.UUID,
    question_ids: list[uuid.UUID],
) -> None:
    """
    Simulate an in-progress student attempt.

    Creates:
        - One IN_PROGRESS AssessmentAttempt
        - 3 saved answers (2 MCQ, 1 True/False)
        - 6 unanswered questions (Short Answer + remaining)

    This enables testing of:
        - Resume attempt
        - Grading (auto + manual)
        - Result calculation

    Idempotent: checks for existing attempt before creating.
    """
    attempt_repo = AttemptRepository(session)
    submission_repo = SubmissionRepository(session)

    # Idempotency check
    existing = await attempt_repo.get_active_attempt(student_id, assessment_id)
    if existing:
        logger.info("  ⟳  Attempt already exists for student")
        return

    now = _utcnow()
    expires_at = now + timedelta(minutes=55)  # 55 minutes remaining

    attempt = AssessmentAttempt(
        assessment_id=assessment_id,
        student_id=student_id,
        attempt_number=1,
        grading_mode=GradingMode.AUTO,
        status=AttemptStatus.IN_PROGRESS,
        started_at=now,
        expires_at=expires_at,
        last_activity_at=now,
        access_token=uuid.uuid4(),
        ip_address="127.0.0.1",
        user_agent="Seed/1.0 (Development)",
    )
    session.add(attempt)
    await session.flush()

    # Answer the first MCQ (question_ids[0])
    if len(question_ids) >= FIRST_MCQ_INDEX + 1:
        # Get the correct option ID for Q1
        q1_options = await session.execute(
            text(
                "SELECT id, is_correct FROM question_option "
                "WHERE question_id = :qid ORDER BY order_index"
            ),
            {"qid": str(question_ids[0])},
        )
        q1_rows = q1_options.fetchall()
        correct_option = next(
            (str(r[0]) for r in q1_rows if r[1]), str(q1_rows[0][0]) if q1_rows else None
        )

        if correct_option:
            response = StudentResponse(
                attempt_id=attempt.id,
                question_id=question_ids[0],
                answer_type=SubmissionAnswerType.SINGLE_OPTION,
                selected_option_ids=[correct_option],
                is_final=False,
                saved_at=now,
                time_spent_seconds=45,
                is_skipped=False,
            )
            session.add(response)
            await session.flush()

            # Audit log
            await submission_repo.append_log(
                response_id=response.id,
                attempt_id=attempt.id,
                question_id=question_ids[0],
                change_type="manual_save",
                previous_value=None,
                new_value={"selected_option_ids": [correct_option]},
            )

    # Answer the second MCQ (question_ids[1]) — wrong answer
    if len(question_ids) >= SECOND_MCQ_INDEX + 1:
        q2_options = await session.execute(
            text(
                "SELECT id, is_correct FROM question_option "
                "WHERE question_id = :qid ORDER BY order_index"
            ),
            {"qid": str(question_ids[1])},
        )
        q2_rows = q2_options.fetchall()
        wrong_option = next(
            (str(r[0]) for r in q2_rows if not r[1]), str(q2_rows[0][0]) if q2_rows else None
        )

        if wrong_option:
            response2 = StudentResponse(
                attempt_id=attempt.id,
                question_id=question_ids[1],
                answer_type=SubmissionAnswerType.SINGLE_OPTION,
                selected_option_ids=[wrong_option],
                is_final=False,
                saved_at=now,
                time_spent_seconds=30,
                is_skipped=False,
            )
            session.add(response2)
            await session.flush()

            await submission_repo.append_log(
                response_id=response2.id,
                attempt_id=attempt.id,
                question_id=question_ids[1],
                change_type="autosave",
                previous_value=None,
                new_value={"selected_option_ids": [wrong_option]},
            )

    # Answer True/False question (question_ids[5]) — correct
    if len(question_ids) >= FIRST_TF_INDEX + 1:
        tf_q = question_ids[5]
        tf_options = await session.execute(
            text(
                "SELECT id, is_correct FROM question_option "
                "WHERE question_id = :qid ORDER BY order_index"
            ),
            {"qid": str(tf_q)},
        )
        tf_rows = tf_options.fetchall()
        correct_tf = next(
            (str(r[0]) for r in tf_rows if r[1]), str(tf_rows[0][0]) if tf_rows else None
        )

        if correct_tf:
            response3 = StudentResponse(
                attempt_id=attempt.id,
                question_id=tf_q,
                answer_type=SubmissionAnswerType.SINGLE_OPTION,
                selected_option_ids=[correct_tf],
                is_final=False,
                saved_at=now,
                time_spent_seconds=20,
                is_skipped=False,
            )
            session.add(response3)
            await session.flush()

            await submission_repo.append_log(
                response_id=response3.id,
                attempt_id=attempt.id,
                question_id=tf_q,
                change_type="manual_save",
                previous_value=None,
                new_value={"selected_option_ids": [correct_tf]},
            )

    await session.commit()
    logger.info(
        "  ✔  Attempt seeded: IN_PROGRESS, 3 answers saved, %d questions unanswered",
        max(0, len(question_ids) - 3),
    )
    logger.info("  i   access_token: %s", attempt.access_token)


# ---------------------------------------------------------------------------
# RESET (--reset flag support)
# ---------------------------------------------------------------------------


async def reset_seed_data(session: AsyncSession) -> None:
    """
    Delete ALL seed data in the correct FK dependency order.

    WARNING: This deletes data from production-like tables.
    Only callable in development.

    Called when the seed script is invoked with --reset flag.
    """
    _assert_development()
    logger.warning("  ⚠  RESET MODE — deleting all seed data...")

    # Delete in reverse dependency order
    delete_order = [
        # Phase 5 — attempts, submissions, grading, results, integrity
        "student_response_log",
        "student_response",
        "submission_grade",
        "grading_queue_item",
        "result_breakdown",
        "assessment_result",
        "integrity_event",
        "integrity_warning",
        "integrity_flag",
        "supervision_session",
        "assessment_attempt",
        # Phase 4 — questions, assessments
        "ai_question_review",
        "ai_question_generation_batch",
        "question_bank_entry",
        "assessment_question",
        "assessment_blueprint_rule",
        "assessment_draft_progress",
        "assessment_autosave",
        "assessment_publish_validation",
        "assessment_target_section",
        "assessment_supervisor",
        "assessment_section",
        "assessment",
        "question_option",
        "question_blank",
        "question",
        "rubric_criterion_level",
        "rubric_criterion",
        "rubric",
        # Phase 2 — academic structure (SQLModel tables)
        "student_enrollment",
        "lecturer_course_assignment",
        "class_section",
        "course_subject",
        "subject",
        "course",
        "academic_period",
        "department",
        "institution",
        # Phase 3 — auth
        "security_event",
        "password_reset_tokens",
        "refresh_tokens",
        "user_profiles",
        "users",
    ]

    for table in delete_order:
        try:
            await session.execute(text(f"TRUNCATE TABLE {table} CASCADE"))
            logger.info("  ✔  Cleared: %s", table)
        except Exception as e:
            logger.warning("  ⚠  Could not clear %s: %s", table, str(e))

    await session.commit()
    logger.info("  ✔  Reset complete — database is empty")


# ---------------------------------------------------------------------------
# INTERNAL HELPERS
# ---------------------------------------------------------------------------


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _print_credentials() -> None:
    """Print a formatted credential summary after seeding."""
    logger.info("")
    logger.info("  ┌─────────────────────────────────────────────────────┐")
    logger.info("  │           SEED CREDENTIALS (dev only)               │")
    logger.info("  ├─────────────────────────────────────────────────────┤")
    logger.info("  │  ADMIN    admin@mindexa.dev     / Admin@123         │")
    logger.info("  │  LECTURER lecturer@mindexa.dev  / Lecturer@123      │")
    logger.info("  │  STUDENT  student@mindexa.dev   / Student@123       │")
    logger.info("  ├─────────────────────────────────────────────────────┤")
    logger.info("  │  Assessment: 'Intro to Programming CAT' (ACTIVE)    │")
    logger.info("  │  Status: window open, student attempt IN_PROGRESS   │")
    logger.info("  └─────────────────────────────────────────────────────┘")
    logger.info("")
