"""
tests/integration/test_group_workspace_flow.py

Integration tests for the end-to-end group collaborative workspace flow.
"""

from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from app.db.enums import AssessmentType, AssessmentStatus, UserRole, GroupSubmissionStatus

@pytest.mark.asyncio
async def test_group_workspace_collaboration_flow(client: AsyncClient, make_auth_headers, db):
    # 1. Setup full context (Lecturer, Assessment, Students, Group, Submission)
    from app.db.models.academic import Course, Institution, AcademicPeriod, ClassGroup, ClassSection, StudentEnrollment, Department, Option
    from app.db.models.assessment import Assessment, AssessmentTargetSection
    from app.db.models.question import Question, AssessmentQuestion
    from app.db.models.auth import User

    from app.db.models.attempt import StudentGroup, StudentGroupMember, GroupSubmission
    from app.db.enums import AcademicPeriodType, EnrollmentStatus
    from datetime import date
    
    # Lecturer
    lid = uuid.uuid4()
    lecturer = User(id=lid, email="l@t.ac", hashed_password="...", role=UserRole.LECTURER, email_verified=True)
    db.add(lecturer); await db.flush()
    
    # Academic
    inst = Institution(name="I", code="I"); db.add(inst); await db.flush()
    period = AcademicPeriod(institution_id=inst.id, name="P", period_type=AcademicPeriodType.SEMESTER, start_date=date(2026,1,1), end_date=date(2026,12,31)); db.add(period); await db.flush()
    dept = Department(institution_id=inst.id, name="D", code="D"); db.add(dept); await db.flush()
    opt = Option(department_id=dept.id, name="O", code="O"); db.add(opt); await db.flush()
    course = Course(institution_id=inst.id, academic_period_id=period.id, name="C", code="C", academic_year="2026"); db.add(course); await db.flush()
    cg = ClassGroup(course_id=course.id, option_id=opt.id, name="G", code="G"); db.add(cg); await db.flush()
    cs = ClassSection(class_group_id=cg.id, name="S"); db.add(cs); await db.flush()

    from app.db.models.academic import TeachingAssignment, TeachingWorkspace
    from app.db.enums import LecturerAssignmentRole
    assignment = TeachingAssignment(
        lecturer_id=lid, institution_id=inst.id, department_id=dept.id,
        course_id=course.id, academic_period_id=period.id, academic_year="2026",
        role=LecturerAssignmentRole.MAIN_LECTURER, class_section_id=cs.id, option_id=opt.id
    )
    db.add(assignment); await db.flush()

    workspace = TeachingWorkspace(
        teaching_assignment_id=assignment.id, course_id=course.id,
        class_section_id=cs.id, academic_period_id=period.id,
        title="W", created_by_id=lid
    )
    db.add(workspace); await db.flush()
    
    # Students (2)
    s1_id = uuid.uuid4(); s2_id = uuid.uuid4()
    s1 = User(id=s1_id, email="s1@t.ac", hashed_password="...", role=UserRole.STUDENT, email_verified=True); db.add(s1)
    s2 = User(id=s2_id, email="s2@t.ac", hashed_password="...", role=UserRole.STUDENT, email_verified=True); db.add(s2)
    await db.flush()
    db.add(StudentEnrollment(student_id=s1_id, class_section_id=cs.id, enrollment_status=EnrollmentStatus.ACTIVE))
    db.add(StudentEnrollment(student_id=s2_id, class_section_id=cs.id, enrollment_status=EnrollmentStatus.ACTIVE))
    await db.flush()
    
    # Assessment (Published)
    assessment = Assessment(
        title="Group Workspace Test",
        assessment_type=AssessmentType.GROUP_WORK,
        status=AssessmentStatus.PUBLISHED,
        created_by_id=lid,
        teaching_workspace_id=workspace.id,
        course_id=course.id,
        academic_year="2026",
        is_group_assessment=True,
        require_all_member_participation=True,
        require_all_member_approval=True
    )
    db.add(assessment); await db.flush()
    db.add(AssessmentTargetSection(assessment_id=assessment.id, class_section_id=cs.id))
    
    # Questions (1)
    from app.db.models.question import Question
    from app.db.enums import QuestionType
    q = Question(content="What is 1+1?", question_type=QuestionType.SHORT_ANSWER, created_by_id=lid)
    db.add(q); await db.flush()
    aq = AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, marks_override=10, order_index=0)
    db.add(aq); await db.flush()
    
    # Group & Submission
    group = StudentGroup(assessment_id=assessment.id, name="Team Test", is_locked=True)
    db.add(group); await db.flush()
    db.add(StudentGroupMember(group_id=group.id, student_id=s1_id, is_leader=True))
    db.add(StudentGroupMember(group_id=group.id, student_id=s2_id, is_leader=False))
    await db.flush()
    submission = GroupSubmission(assessment_id=assessment.id, group_id=group.id, status=GroupSubmissionStatus.DRAFT)
    db.add(submission)
    
    await db.commit()
    
    # 2. Collaborative Flow via API
    s1_headers = make_auth_headers(user_id=str(s1_id), role=UserRole.STUDENT, email="s1@t.ac")
    s2_headers = make_auth_headers(user_id=str(s2_id), role=UserRole.STUDENT, email="s2@t.ac")
    
    # S1 saves answer
    resp = await client.put(
        f"/api/v1/group-work/submissions/{submission.id}/answers/{q.id}?assessment_id={assessment.id}",
        headers=s1_headers,
        json={"answer_content": {"text": "It is 2"}, "change_source": "manual_edit"}
    )
    assert resp.status_code == 200
    
    # S2 adds comment
    resp = await client.post(
        f"/api/v1/group-work/submissions/{submission.id}/comments?assessment_id={assessment.id}",
        headers=s2_headers,
        json={"body": "I agree with S1."}
    )
    assert resp.status_code == 200
    
    # S1 requests approval (Participation satisfied: S1 edited, S2 commented)
    resp = await client.post(
        f"/api/v1/group-work/submissions/{submission.id}/request-approval?assessment_id={assessment.id}",
        headers=s1_headers
    )
    assert resp.status_code == 204
    
    # S1 and S2 approve
    await client.post(f"/api/v1/group-work/submissions/{submission.id}/approve?assessment_id={assessment.id}", headers=s1_headers, json={"status": "APPROVED"})
    await client.post(f"/api/v1/group-work/submissions/{submission.id}/approve?assessment_id={assessment.id}", headers=s2_headers, json={"status": "APPROVED"})
    
    # Leader (S1) finalizes
    resp = await client.post(
        f"/api/v1/group-work/submissions/{submission.id}/submit?assessment_id={assessment.id}",
        headers=s1_headers,
        json={"confirm": True}
    )
    assert resp.status_code == 204
    
    # Check final state
    await db.refresh(submission)
    assert submission.status == GroupSubmissionStatus.SUBMITTED
