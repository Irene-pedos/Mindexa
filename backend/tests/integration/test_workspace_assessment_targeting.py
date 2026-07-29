"""
tests/integration/test_workspace_assessment_targeting.py

Integration tests for workspace sections resolution, student roster/count matching,
student workspace visibility, assessment availability, and finalization snapshots.
"""

from __future__ import annotations

import uuid
from datetime import date, UTC, datetime
import pytest
from httpx import AsyncClient
from app.db.enums import AssessmentType, AssessmentStatus, UserRole, LecturerAssignmentRole, AcademicPeriodType, EnrollmentStatus
from app.db.models.academic import (
    Course,
    Institution,
    AcademicPeriod,
    ClassGroup,
    ClassSection,
    StudentEnrollment,
    Department,
    Option,
    TeachingAssignment,
    TeachingWorkspace,
)
from app.db.models.assessment import Assessment, AssessmentTargetSection
from app.db.models.auth import User, UserProfile
from app.db.repositories.workspace_repo import WorkspaceRepository
from app.services.lecturer_service import LecturerService
from app.services.assessment_service import AssessmentService


@pytest.mark.asyncio
async def test_workspace_targeting_and_visibility(client: AsyncClient, make_auth_headers, db):
    # 1. Setup structure: Institution, Department, Option, Course, Period
    inst = Institution(name="Test Inst", code="TINS")
    db.add(inst)
    await db.flush()

    period = AcademicPeriod(
        institution_id=inst.id,
        name="Semester 1 2026",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    db.add(period)
    
    dept = Department(institution_id=inst.id, name="Computer Science", code="CS")
    db.add(dept)
    await db.flush()

    opt = Option(department_id=dept.id, name="Software Engineering", code="SE")
    db.add(opt)
    await db.flush()

    course = Course(
        institution_id=inst.id,
        academic_period_id=period.id,
        name="Algorithms 101",
        code="CS101",
        academic_year="2026",
    )
    db.add(course)
    await db.flush()

    # 2. Setup Year Groups (ClassGroup) and Sections
    cg_se_y1 = ClassGroup(course_id=course.id, option_id=opt.id, name="SE Year 1", code="SEY1")
    db.add(cg_se_y1)
    await db.flush()

    sec_a = ClassSection(class_group_id=cg_se_y1.id, name="A", department_id=dept.id)
    sec_b = ClassSection(class_group_id=cg_se_y1.id, name="B", department_id=dept.id)
    db.add(sec_a)
    db.add(sec_b)
    await db.flush()

    # Create another section in a different department/option to test containment boundary
    dept_other = Department(institution_id=inst.id, name="Electrical Eng", code="EE")
    db.add(dept_other)
    await db.flush()
    opt_other = Option(department_id=dept_other.id, name="Telecommunications", code="TC")
    db.add(opt_other)
    await db.flush()
    course_other = Course(institution_id=inst.id, academic_period_id=period.id, name="Circuits 101", code="EE101", academic_year="2026")
    db.add(course_other)
    await db.flush()
    cg_ee_y1 = ClassGroup(course_id=course_other.id, option_id=opt_other.id, name="EE Year 1", code="EEY1")
    db.add(cg_ee_y1)
    await db.flush()
    sec_c = ClassSection(class_group_id=cg_ee_y1.id, name="C", department_id=dept_other.id)
    db.add(sec_c)
    await db.flush()

    # 3. Create Lecturer & Assignments
    lid = uuid.uuid4()
    lecturer = User(id=lid, email="lecturer@t.ac", hashed_password="...", role=UserRole.LECTURER, email_verified=True)
    db.add(lecturer)
    await db.flush()
    lect_profile = UserProfile(user_id=lid, first_name="John", last_name="Doe", faculty_id="F123")
    db.add(lect_profile)
    await db.flush()

    # Course-wide/Global Assignment for Lecturer (class_section_id is None)
    global_assignment = TeachingAssignment(
        lecturer_id=lid,
        institution_id=inst.id,
        department_id=dept.id,
        option_id=opt.id,
        course_id=course.id,
        academic_period_id=period.id,
        academic_year="2026",
        role=LecturerAssignmentRole.MAIN_LECTURER,
        class_section_id=None,
    )
    db.add(global_assignment)
    await db.flush()

    # Global Workspace for Lecturer
    global_workspace = TeachingWorkspace(
        teaching_assignment_id=global_assignment.id,
        course_id=course.id,
        class_section_id=None,
        academic_period_id=period.id,
        title="CS101 Global Workspace",
        created_by_id=lid,
    )
    db.add(global_workspace)
    await db.flush()

    # Section-specific Assignment for Section A
    sec_a_assignment = TeachingAssignment(
        lecturer_id=lid,
        institution_id=inst.id,
        department_id=dept.id,
        option_id=opt.id,
        course_id=course.id,
        academic_period_id=period.id,
        academic_year="2026",
        role=LecturerAssignmentRole.MAIN_LECTURER,
        class_section_id=sec_a.id,
    )
    db.add(sec_a_assignment)
    await db.flush()

    # Section-specific Workspace for Section A
    sec_a_workspace = TeachingWorkspace(
        teaching_assignment_id=sec_a_assignment.id,
        course_id=course.id,
        class_section_id=sec_a.id,
        academic_period_id=period.id,
        title="CS101 Sec A Workspace",
        created_by_id=lid,
    )
    db.add(sec_a_workspace)
    await db.flush()

    # 4. Create Students and Enrollments
    s_a_id = uuid.uuid4()
    s_b_id = uuid.uuid4()
    s_c_id = uuid.uuid4()

    student_a = User(id=s_a_id, email="student_a@t.ac", hashed_password="...", role=UserRole.STUDENT, email_verified=True)
    student_b = User(id=s_b_id, email="student_b@t.ac", hashed_password="...", role=UserRole.STUDENT, email_verified=True)
    student_c = User(id=s_c_id, email="student_c@t.ac", hashed_password="...", role=UserRole.STUDENT, email_verified=True)
    db.add_all([student_a, student_b, student_c])
    await db.flush()

    prof_a = UserProfile(user_id=s_a_id, first_name="Alice", last_name="Smith", student_id="S001")
    prof_b = UserProfile(user_id=s_b_id, first_name="Bob", last_name="Jones", student_id="S002")
    prof_c = UserProfile(user_id=s_c_id, first_name="Charlie", last_name="Brown", student_id="S003")
    db.add_all([prof_a, prof_b, prof_c])
    await db.flush()

    # Student A in Section A (enrolled)
    db.add(StudentEnrollment(student_id=s_a_id, class_section_id=sec_a.id, enrollment_status=EnrollmentStatus.ACTIVE))
    # Student B in Section B (enrolled)
    db.add(StudentEnrollment(student_id=s_b_id, class_section_id=sec_b.id, enrollment_status=EnrollmentStatus.ACTIVE))
    # Student C in Section C (unrelated department/course section)
    db.add(StudentEnrollment(student_id=s_c_id, class_section_id=sec_c.id, enrollment_status=EnrollmentStatus.ACTIVE))
    await db.flush()

    await db.commit()

    # ---------------------------------------------------------
    # TEST 1: Roster and Student Count Matching
    # ---------------------------------------------------------
    w_repo = WorkspaceRepository(db)
    
    # Section A workspace count should be 1 (Student A)
    count_sec_a = await w_repo.get_student_count(sec_a_workspace.id)
    assert count_sec_a == 1
    
    # Global workspace count should resolve Sections A and B -> count = 2 (Student A & Student B)
    count_global = await w_repo.get_student_count(global_workspace.id)
    assert count_global == 2

    # Roster fetched from service layer:
    svc = LecturerService(db)
    detail_global = await svc.get_workspace_detail(lid, global_workspace.id)
    assert len(detail_global.roster) == 2
    # Verify student count matches roster count
    assert detail_global.student_count == len(detail_global.roster)
    # Check section IDs on roster
    roster_ids = {r.id for r in detail_global.roster}
    assert roster_ids == {s_a_id, s_b_id}
    # Verify sections metadata returned
    sections_returned = {s.id for s in detail_global.sections}
    assert sections_returned == {sec_a.id, sec_b.id}

    # ---------------------------------------------------------
    # TEST 2: Workspace Visibility Scoping
    # ---------------------------------------------------------
    # Student A (Section A) should see:
    # 1. Section A workspace
    # 2. Global workspace
    workspaces_a = await w_repo.list_by_student(s_a_id)
    ws_ids_a = {w.id for w in workspaces_a}
    assert sec_a_workspace.id in ws_ids_a
    assert global_workspace.id in ws_ids_a

    # Student B (Section B) should see:
    # 1. Global workspace (since Section B matches course scope)
    # NOT Section A workspace
    workspaces_b = await w_repo.list_by_student(s_b_id)
    ws_ids_b = {w.id for w in workspaces_b}
    assert global_workspace.id in ws_ids_b
    assert sec_a_workspace.id not in ws_ids_b

    # Student C (Section C - EE) should see NEITHER
    workspaces_c = await w_repo.list_by_student(s_c_id)
    ws_ids_c = {w.id for w in workspaces_c}
    assert global_workspace.id not in ws_ids_c
    assert sec_a_workspace.id not in ws_ids_c

    # ---------------------------------------------------------
    # TEST 3: Student Assessment Availability & Section-level targeting
    # ---------------------------------------------------------
    # Scenario A: Assessment in global workspace targeting "all" (no target sections)
    ass_all = Assessment(
        title="Midterm Exam All",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.PUBLISHED,
        created_by_id=lid,
        teaching_workspace_id=global_workspace.id,
        course_id=course.id,
        academic_year="2026",
        audience_type="all",
    )
    db.add(ass_all)
    await db.commit()

    from app.db.repositories.assessment_repo import AssessmentRepository
    ass_repo = AssessmentRepository(db)

    # Student A and B should see the assessment
    res_a, _ = await ass_repo.list_available_for_student(student_id=s_a_id)
    assert ass_all.id in {a.id for a in res_a}
    res_b, _ = await ass_repo.list_available_for_student(student_id=s_b_id)
    assert ass_all.id in {a.id for a in res_b}

    # Scenario B: Section-level targeting (target Section A only)
    ass_sec_a = Assessment(
        title="Midterm Section A Only",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.PUBLISHED,
        created_by_id=lid,
        teaching_workspace_id=global_workspace.id,
        course_id=course.id,
        academic_year="2026",
        audience_type="sections",
    )
    db.add(ass_sec_a)
    await db.flush()
    db.add(AssessmentTargetSection(assessment_id=ass_sec_a.id, class_section_id=sec_a.id))
    await db.commit()

    # Student A (Section A) should see it
    res_a_t, _ = await ass_repo.list_available_for_student(student_id=s_a_id)
    assert ass_sec_a.id in {a.id for a in res_a_t}
    # Student B (Section B) should NOT see it
    res_b_t, _ = await ass_repo.list_available_for_student(student_id=s_b_id)
    assert ass_sec_a.id not in {a.id for a in res_b_t}

    # Attempt Authorization Target Section checks
    from app.services.attempt_service import AttemptService
    from app.core.exceptions import AuthorizationError
    attempt_svc = AttemptService(db)
    
    # Student A (in targeted section A) can start attempt
    attempt_a = await attempt_svc.start_attempt(student_id=s_a_id, assessment_id=ass_sec_a.id)
    assert attempt_a is not None

    # Student B (not in targeted section A) should be blocked
    with pytest.raises(AuthorizationError, match="You are not eligible"):
        await attempt_svc.start_attempt(student_id=s_b_id, assessment_id=ass_sec_a.id)

    # ---------------------------------------------------------
    # TEST 4: Student Enrollment Snapshot on Finalization
    # ---------------------------------------------------------
    ass_svc = AssessmentService(db)

    # Setup assessment draft (to finalize/publish)
    ass_draft = Assessment(
        title="Draft Assessment",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.DRAFT,
        created_by_id=lid,
        teaching_workspace_id=global_workspace.id,
        course_id=course.id,
        academic_year="2026",
        audience_type="all",
        total_marks=10,
    )
    db.add(ass_draft)
    await db.flush()

    from app.db.models.assessment import AssessmentSection
    from app.db.models.question import Question, AssessmentQuestion
    from app.db.enums import QuestionType
    
    sec = AssessmentSection(
        assessment_id=ass_draft.id,
        title="Section 1",
        order_index=0,
        allocated_marks=10,
        question_count_target=1,
    )
    db.add(sec)
    await db.flush()
    
    q = Question(content="What is 1+1?", question_type=QuestionType.SHORT_ANSWER, created_by_id=lid)
    db.add(q)
    await db.flush()
    
    aq = AssessmentQuestion(
        assessment_id=ass_draft.id,
        assessment_section_id=sec.id,
        question_id=q.id,
        marks_override=10,
        order_index=0,
    )
    db.add(aq)
    await db.flush()

    # Target only Section B
    db.add(AssessmentTargetSection(assessment_id=ass_draft.id, class_section_id=sec_b.id))
    await db.commit()

    # Finalize/Publish the draft
    finalize_res = await ass_svc.finalize_assessment(ass_draft.id, lecturer)
    assert not finalize_res.errors, f"Validation failed with errors: {finalize_res.errors}"
    assert finalize_res.is_finalized
    await db.commit()
    
    # Reload and check snapshot
    await db.refresh(ass_draft)
    snapshot = ass_draft.student_enrollment_snapshot
    assert snapshot is not None
    # Since it was targeted at Section B, snapshot should contain ONLY Student B
    emails = {s["email"] for s in snapshot}
    assert emails == {"student_b@t.ac"}
