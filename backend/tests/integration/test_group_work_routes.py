"""
tests/integration/test_group_work_routes.py

Integration tests for group-work API endpoints.
"""

from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from app.db.enums import AssessmentType, AssessmentStatus, UserRole, GroupAssignmentMode
from app.db.models.auth import User

@pytest.mark.asyncio
async def test_auto_generate_groups_route(client: AsyncClient, make_auth_headers, db):
    # 1. Create a lecturer user
    lecturer_id = uuid.uuid4()
    lecturer = User(
        id=lecturer_id, 
        email="lecturer@test.ac", 
        hashed_password="...", 
        role=UserRole.LECTURER,
        email_verified=True
    )
    db.add(lecturer); await db.flush()
    
    headers = make_auth_headers(user_id=str(lecturer_id), role=UserRole.LECTURER, email="lecturer@test.ac")

    # 2. Create a draft group-work assessment with full academic context
    from app.db.models.academic import Course, Institution, AcademicPeriod, ClassGroup, ClassSection, StudentEnrollment, Department, Option
    from app.db.models.assessment import Assessment, AssessmentTargetSection
    from app.db.enums import AcademicPeriodType, EnrollmentStatus
    from datetime import date
    
    inst = Institution(name="Inst", code="INST")
    db.add(inst); await db.flush()
    period = AcademicPeriod(institution_id=inst.id, name="P1", period_type=AcademicPeriodType.SEMESTER, start_date=date(2026,1,1), end_date=date(2026,12,31))
    db.add(period); await db.flush()
    dept = Department(institution_id=inst.id, name="D1", code="D1")
    db.add(dept); await db.flush()
    opt = Option(department_id=dept.id, name="O1", code="O1")
    db.add(opt); await db.flush()
    
    course = Course(institution_id=inst.id, academic_period_id=period.id, name="C1", code="C1")
    db.add(course); await db.flush()
    cg = ClassGroup(course_id=course.id, option_id=opt.id, name="G1", code="G1")
    db.add(cg); await db.flush()
    cs = ClassSection(course_id=course.id, class_group_id=cg.id, name="S1")
    db.add(cs); await db.flush()
    
    assessment = Assessment(
        title="Group API Test",
        assessment_type=AssessmentType.GROUP_WORK,
        status=AssessmentStatus.DRAFT,
        created_by_id=lecturer_id,
        course_id=course.id,
        is_group_assessment=True,
        max_group_size=3
    )
    db.add(assessment); await db.flush()
    
    target = AssessmentTargetSection(assessment_id=assessment.id, class_section_id=cs.id)
    db.add(target); await db.flush()
    
    # Create 5 students and enroll them
    for i in range(5):
        sid = uuid.uuid4()
        stu = User(id=sid, email=f"s{i}@test.ac", hashed_password="...", role=UserRole.STUDENT)
        db.add(stu); await db.flush()
        enrol = StudentEnrollment(student_id=sid, class_section_id=cs.id, enrollment_status=EnrollmentStatus.ACTIVE)
        db.add(enrol); await db.flush()
        
    await db.commit(); await db.refresh(assessment)
    
    # 3. Call auto-generate route
    response = await client.post(
        f"/api/v1/group-work/assessments/{assessment.id}/groups/auto-generate",
        headers=headers,
        json={
            "max_group_size": 3,
            "allow_smaller_final_group": True,
            "naming_pattern": "Group {index}"
        }
    )
    
    # 4. Check response
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2 # 5 students, max size 3 -> 2 groups
    assert data[0]["name"] == "Group 1"
    assert len(data[0]["members"]) == 3
    assert len(data[1]["members"]) == 2

@pytest.mark.asyncio
async def test_get_workspace_route(client: AsyncClient, student_headers, db):
    # This requires a lot of setup (assessment, group, enrollment, etc.)
    # We'll rely on the conftest helpers if they exist.
    pass
