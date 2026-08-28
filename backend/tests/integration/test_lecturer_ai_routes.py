from __future__ import annotations

import io
import json
import uuid
import zipfile
import pytest
from datetime import date
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch

from app.core.ai.providers import AICompletionResponse
from app.db.enums import (
    AIActionType,
    DifficultyLevel,
    LecturerAssignmentRole,
    QuestionType,
    UserRole,
)
from app.db.models.academic import (
    AcademicPeriod,
    Course,
    Department,
    Institution,
    TeachingAssignment,
    TeachingWorkspace,
)
from app.db.models.ai import AIActionLog
from app.db.models.auth import User
from app.db.models.learning_unit import LearningUnit
from app.db.models.question import Question


@pytest.mark.asyncio
async def test_lecturer_ai_slides_and_rubric_routes(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    # 1. Create Lecturer user & Student user
    lecturer = User(
        id=uuid.uuid4(),
        email=f"lecturer_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="test_hashed_password",
        role=UserRole.LECTURER,
        is_active=True,
        email_verified=True,
        status="ACTIVE",
    )
    student = User(
        id=uuid.uuid4(),
        email=f"student_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="test_hashed_password",
        role=UserRole.STUDENT,
        is_active=True,
        email_verified=True,
        status="ACTIVE",
    )
    db.add(lecturer)
    db.add(student)
    await db.flush()

    # 2. Hierarchy
    inst = Institution(id=uuid.uuid4(), name="Test University", code=f"TU_{uuid.uuid4().hex[:6]}")
    db.add(inst)
    await db.flush()

    dept = Department(id=uuid.uuid4(), institution_id=inst.id, name="Computer Science", code=f"CS_{uuid.uuid4().hex[:6]}")
    db.add(dept)
    await db.flush()

    period = AcademicPeriod(
        id=uuid.uuid4(),
        institution_id=inst.id,
        name="Fall 2026",
        code=f"F26_{uuid.uuid4().hex[:6]}",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 20),
    )
    db.add(period)
    await db.flush()

    course = Course(
        id=uuid.uuid4(),
        institution_id=inst.id,
        department_id=dept.id,
        academic_period_id=period.id,
        name="Database Systems",
        code=f"CS301_{uuid.uuid4().hex[:4]}",
        academic_year="2026",
        language="EN",
    )
    db.add(course)
    await db.flush()

    asgn = TeachingAssignment(
        id=uuid.uuid4(),
        lecturer_id=lecturer.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_period_id=period.id,
        academic_year="2026",
        role=LecturerAssignmentRole.MAIN_LECTURER,
        is_active=True,
    )
    db.add(asgn)
    await db.flush()

    ws = TeachingWorkspace(
        id=uuid.uuid4(),
        teaching_assignment_id=asgn.id,
        course_id=course.id,
        academic_period_id=period.id,
        title="CS301 Fall 2026",
        language="EN",
        created_by_id=lecturer.id,
    )
    db.add(ws)
    await db.flush()

    lu = LearningUnit(
        id=uuid.uuid4(),
        teaching_workspace_id=ws.id,
        order_index=1,
        title="Relational Algebra",
        summary="Foundational relational operations.",
        source_chunk_ids=[],
        estimated_study_minutes=45,
        is_active=True,
    )
    db.add(lu)

    question = Question(
        id=uuid.uuid4(),
        created_by_id=lecturer.id,
        course_id=course.id,
        question_type=QuestionType.ESSAY,
        content="Explain the relational difference operation and give an example.",
        marks=10,
        difficulty=DifficultyLevel.MEDIUM,
    )
    db.add(question)
    await db.commit()

    lecturer_headers = make_auth_headers(user_id=str(lecturer.id), role="LECTURER", email=lecturer.email)
    student_headers = make_auth_headers(user_id=str(student.id), role="STUDENT", email=student.email)

    # 3. Test Student gets 403 Forbidden
    res_student = await client.get(
        f"/api/v1/lecturers/ai/workspaces/{ws.id}/learning-units",
        headers=student_headers,
    )
    assert res_student.status_code == 403

    # 4. Test Lecturer gets Learning Units
    res_lus = await client.get(
        f"/api/v1/lecturers/ai/workspaces/{ws.id}/learning-units",
        headers=lecturer_headers,
    )
    assert res_lus.status_code == 200
    lu_data = res_lus.json()
    assert len(lu_data) >= 1
    assert lu_data[0]["title"] == "Relational Algebra"

    # 5. Test Slide Deck Export Endpoint (using edited payload)
    sample_deck = {
        "title": "Edited Relational Algebra Deck",
        "target_audience": "Undergraduate CS",
        "estimated_minutes": 45,
        "slides": [
            {
                "title": "Introduction to Relational Algebra",
                "bullet_points": ["Procedural query language", "Takes relations as input", "Outputs relations"],
                "visual_idea": "Diagram of projection and selection",
                "speaker_notes": "Introduce the foundational operators."
            },
            {
                "title": "Core Operators",
                "bullet_points": ["Select (sigma)", "Project (pi)", "Union (cup)", "Set difference (-)"],
                "visual_idea": "Venn diagrams for union and difference",
                "speaker_notes": "Walk through each operator syntax."
            },
            {
                "title": "Set Operations",
                "bullet_points": ["Union-compatible schemas", "Cartesian product vs Join"],
                "visual_idea": "Set intersection Venn diagram",
                "speaker_notes": "Explain schema compatibility rules."
            },
            {
                "title": "Summary",
                "bullet_points": ["Algebra is equivalent to safe calculus", "Basis for relational query optimization"],
                "visual_idea": "Summary box",
                "speaker_notes": "Wrap up and introduce SQL mapping next lecture."
            }
        ]
    }

    res_export = await client.post(
        "/api/v1/lecturers/ai/slides/export",
        json={"deck": sample_deck},
        headers=lecturer_headers,
    )
    assert res_export.status_code == 200
    assert res_export.headers["content-type"] == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    assert len(res_export.content) > 0

    # 6. Validate PPTX OpenXML Package Structure & Speaker Notes
    with zipfile.ZipFile(io.BytesIO(res_export.content)) as z:
        namelist = z.namelist()
        assert "[Content_Types].xml" in namelist
        assert "ppt/presentation.xml" in namelist
        assert any(name.startswith("ppt/slides/slide") for name in namelist)
        assert any(name.startswith("ppt/notesSlides/notesSlide") for name in namelist)

    # 7. Test Rubric Save Endpoint
    rubric_payload = {
        "question_id": str(question.id),
        "title": "Relational Difference Marking Scheme",
        "description": "Standard marking guidance.",
        "criteria": [
            {
                "title": "Theoretical Definition",
                "description": "Definition of set difference in relational algebra.",
                "max_marks": 5,
                "order_index": 1,
                "levels": [
                    {"label": "Excellent", "description": "Accurate formal definition.", "marks": 5},
                    {"label": "Inadequate", "description": "Confuses difference with intersection.", "marks": 0}
                ]
            },
            {
                "title": "Concrete Example",
                "description": "Valid example with schemas and table instances.",
                "max_marks": 5,
                "order_index": 2,
                "levels": [
                    {"label": "Excellent", "description": "Clear relations and correct output.", "marks": 5},
                    {"label": "Inadequate", "description": "Invalid example.", "marks": 0}
                ]
            }
        ]
    }

    res_rubric_save = await client.post(
        "/api/v1/lecturers/ai/rubrics/save",
        json=rubric_payload,
        headers=lecturer_headers,
    )
    assert res_rubric_save.status_code == 200
    save_data = res_rubric_save.json()
    assert save_data["criteria_count"] == 2
    assert "rubric_id" in save_data

    # Verify Question now has rubric_id set
    await db.refresh(question)
    assert question.rubric_id is not None


@pytest.mark.asyncio
async def test_unauthorized_lecturer_permission_guards_on_reads(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    # Lecturer 1 (Owner)
    lecturer1 = User(
        id=uuid.uuid4(),
        email=f"lecturer1_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="test_hashed_password",
        role=UserRole.LECTURER,
        is_active=True,
        email_verified=True,
        status="ACTIVE",
    )
    # Lecturer 2 (Attacker / Unassigned)
    lecturer2 = User(
        id=uuid.uuid4(),
        email=f"lecturer2_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="test_hashed_password",
        role=UserRole.LECTURER,
        is_active=True,
        email_verified=True,
        status="ACTIVE",
    )
    db.add(lecturer1)
    db.add(lecturer2)
    await db.flush()

    inst = Institution(id=uuid.uuid4(), name="Test Univ", code=f"TU_{uuid.uuid4().hex[:6]}")
    db.add(inst)
    await db.flush()

    dept = Department(id=uuid.uuid4(), institution_id=inst.id, name="Physics", code=f"PH_{uuid.uuid4().hex[:6]}")
    db.add(dept)
    await db.flush()

    period = AcademicPeriod(
        id=uuid.uuid4(),
        institution_id=inst.id,
        name="Spring 2026",
        code=f"S26_{uuid.uuid4().hex[:6]}",
        start_date=date(2026, 1, 15),
        end_date=date(2026, 5, 30),
    )
    db.add(period)
    await db.flush()

    course = Course(
        id=uuid.uuid4(),
        institution_id=inst.id,
        department_id=dept.id,
        academic_period_id=period.id,
        name="Quantum Mechanics",
        code=f"PHY401_{uuid.uuid4().hex[:4]}",
        academic_year="2026",
        language="EN",
    )
    db.add(course)
    await db.flush()

    # Assign only Lecturer 1 to course
    asgn = TeachingAssignment(
        id=uuid.uuid4(),
        lecturer_id=lecturer1.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_period_id=period.id,
        academic_year="2026",
        role=LecturerAssignmentRole.MAIN_LECTURER,
        is_active=True,
    )
    db.add(asgn)
    await db.flush()

    ws = TeachingWorkspace(
        id=uuid.uuid4(),
        teaching_assignment_id=asgn.id,
        course_id=course.id,
        academic_period_id=period.id,
        title="PHY401 Spring 2026",
        language="EN",
        created_by_id=lecturer1.id,
    )
    db.add(ws)
    await db.flush()

    lu = LearningUnit(
        id=uuid.uuid4(),
        teaching_workspace_id=ws.id,
        order_index=1,
        title="Schrodinger Wave Equation",
        summary="Wave mechanics formulations.",
        source_chunk_ids=[],
        estimated_study_minutes=50,
        is_active=True,
    )
    db.add(lu)

    q1 = Question(
        id=uuid.uuid4(),
        created_by_id=lecturer1.id,
        course_id=course.id,
        question_type=QuestionType.ESSAY,
        content="Derive the time-independent Schrodinger equation for a 1D harmonic oscillator.",
        marks=15,
        difficulty=DifficultyLevel.HARD,
    )
    db.add(q1)
    await db.commit()

    lecturer2_headers = make_auth_headers(user_id=str(lecturer2.id), role="LECTURER", email=lecturer2.email)

    # 1. Lecturer 2 attempting to read Lecturer 1's learning units must be blocked (403)
    res_lu_unauth = await client.get(
        f"/api/v1/lecturers/ai/workspaces/{ws.id}/learning-units",
        headers=lecturer2_headers,
    )
    assert res_lu_unauth.status_code == 403

    # 2. Lecturer 2 attempting to draft rubric on Lecturer 1's question must be blocked (403)
    res_rubric_unauth = await client.post(
        "/api/v1/lecturers/ai/rubrics/draft",
        json={"question_id": str(q1.id), "total_marks": 15},
        headers=lecturer2_headers,
    )
    assert res_rubric_unauth.status_code == 403

    # 3. Lecturer 2 attempting to generate slide deck on Lecturer 1's learning unit must be blocked (403)
    res_slide_unauth = await client.post(
        f"/api/v1/lecturers/ai/slides/{lu.id}/generate",
        json={"estimated_minutes": 50},
        headers=lecturer2_headers,
    )
    assert res_slide_unauth.status_code == 403
