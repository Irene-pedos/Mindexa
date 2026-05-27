
import uuid
import pytest
from httpx import AsyncClient
from datetime import date
from app.db.enums import (
    AssessmentStatus, 
    AssessmentType, 
    GroupSubmissionStatus,
    AcademicPeriodType,
    LecturerAssignmentRole
)
from app.db.models.assessment import Assessment
from app.db.models.auth import User
from app.db.models.attempt import GroupSubmission, StudentGroup
from app.db.models.academic import (
    Institution, 
    AcademicPeriod, 
    Department, 
    Option,
    Course, 
    ClassGroup,
    ClassSection,
    TeachingAssignment, 
    TeachingWorkspace
)
from app.core.constants import UserRole

@pytest.mark.asyncio
async def test_group_grading_queue_endpoint(client: AsyncClient, db, make_auth_headers):
    """Verify that the /grading/group-queue endpoint returns submitted group work."""
    # Setup Hierarchy
    inst = Institution(name="Queue Inst", code="QINST")
    db.add(inst); await db.flush()
    
    period = AcademicPeriod(
        institution_id=inst.id, 
        name="Q Period", 
        period_type=AcademicPeriodType.SEMESTER, 
        start_date=date(2026,1,1), 
        end_date=date(2026,12,31)
    )
    db.add(period); await db.flush()
    
    dept = Department(institution_id=inst.id, name="Q Dept", code="QDEPT")
    db.add(dept); await db.flush()

    opt = Option(department_id=dept.id, name="Q Option", code="QOPT")
    db.add(opt); await db.flush()
    
    course = Course(
        institution_id=inst.id, 
        academic_period_id=period.id, 
        name="Q Course", 
        code="QCODE",
        academic_year="2026"
    )
    db.add(course); await db.flush()

    cg = ClassGroup(course_id=course.id, name="Q Group", code="QG", option_id=opt.id)
    db.add(cg); await db.flush()

    cs = ClassSection(course_id=course.id, class_group_id=cg.id, name="Q Section")
    db.add(cs); await db.flush()
    
    lecturer = User(
        email=f"lec_queue_{uuid.uuid4().hex[:6]}@test.ac", 
        hashed_password="...", 
        role=UserRole.LECTURER,
        email_verified=True
    )
    db.add(lecturer); await db.flush()
    
    assignment = TeachingAssignment(
        lecturer_id=lecturer.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_period_id=period.id,
        academic_year="2026",
        role=LecturerAssignmentRole.MAIN_LECTURER,
        class_section_id=cs.id,
        option_id=opt.id
    )
    db.add(assignment); await db.flush()
    
    workspace = TeachingWorkspace(
        teaching_assignment_id=assignment.id,
        course_id=course.id,
        class_section_id=cs.id,
        academic_period_id=period.id,
        title="Q Workspace",
        created_by_id=lecturer.id
    )
    db.add(workspace); await db.flush()
    
    assessment = Assessment(
        title="Queue Test",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.PUBLISHED,
        created_by_id=lecturer.id,
        teaching_workspace_id=workspace.id,
        course_id=course.id,
        academic_year="2026",
        is_group_assessment=True,
        total_marks=100
    )
    db.add(assessment); await db.flush()
    
    group = StudentGroup(assessment_id=assessment.id, name="Queue Team", is_locked=True)
    db.add(group); await db.flush()
    
    submission = GroupSubmission(
        assessment_id=assessment.id, 
        group_id=group.id, 
        status=GroupSubmissionStatus.SUBMITTED
    )
    db.add(submission); await db.commit()
    
    headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)
    
    response = await client.get("/api/v1/grading/group-queue", headers=headers)
    
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert data["total"] >= 1
    
    # Check if our item is there
    found = False
    for item in data["items"]:
        if item["id"] == str(submission.id):
            found = True
            assert item["group_name"] == "Queue Team"
            assert item["assessment_title"] == "Queue Test"
            assert item["status"] == "SUBMITTED"
            break
    assert found
