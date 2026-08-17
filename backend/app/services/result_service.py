"""
app/services/result_service.py

Business logic for assessment result calculation and release.

RULES ENFORCED HERE:
    - Results are calculated only when ALL questions have is_final=True grades.
    - Partial results (not fully graded) are NOT released to students.
    - integrity_hold=True blocks release even if is_released would be set.
    - Letter grade is computed from percentage using institution grade bands.
    - Bulk release respects integrity holds: held results are counted and
      returned in the response but not released.
    - Recalculation is idempotent — safe to call multiple times as more
      grades are finalised (for partial grading scenarios).
    - Students can only see their own result after is_released=True.
    - Lecturers and admins can see results at any time.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError
from app.db.enums import AttemptStatus, ResultLetterGrade
from app.db.models.result import AssessmentResult
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.grading_repo import GradingRepository
from app.db.repositories.result_repo import ResultRepository
from app.db.repositories.submission_repo import SubmissionRepository


def _utcnow() -> datetime:
    return datetime.now(UTC)


# Grade band thresholds (percentage >= threshold → grade)
GRADE_BANDS = [
    (90, ResultLetterGrade.A_PLUS),
    (85, ResultLetterGrade.A),
    (80, ResultLetterGrade.A_MINUS),
    (75, ResultLetterGrade.B_PLUS),
    (70, ResultLetterGrade.B),
    (65, ResultLetterGrade.B_MINUS),
    (60, ResultLetterGrade.C_PLUS),
    (55, ResultLetterGrade.C),
    (50, ResultLetterGrade.C_MINUS),
    (45, ResultLetterGrade.D),
    (0,  ResultLetterGrade.F),
]


class ResultService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.result_repo = ResultRepository(db)
        self.grading_repo = GradingRepository(db)
        self.attempt_repo = AttemptRepository(db)
        self.assessment_repo = AssessmentRepository(db)
        self.submission_repo = SubmissionRepository(db)

    async def _notify_result_released(
        self,
        *,
        result: AssessmentResult,
        assessment_title: str,
    ) -> None:
        from app.core.config import settings
        from app.db.enums import NotificationType
        from app.db.models.auth import User
        from app.db.repositories.notification_repo import NotificationRepository
        from app.workers.tasks import send_email_notification

        target_id = result.attempt_id or result.id
        action_url = f"/student/results/{target_id}"
        notification_repo = NotificationRepository(self.db)
        await notification_repo.create(
            recipient_id=result.student_id,
            notification_type=(
                NotificationType.GROUP_RESULT_RELEASED
                if result.is_group_result
                else NotificationType.RESULT_RELEASED
            ),
            title=f"Marks published: {assessment_title}",
            body=(
                f"Your marks for {assessment_title} have been published. "
                f"Score: {round(result.percentage, 1)}%."
            ),
            reference_id=target_id,
            reference_type="group_submission" if result.is_group_result else "assessment_attempt",
            action_url=action_url,
        )

        user_stmt = (
            select(User)
            .options(selectinload(User.profile))
            .where(User.id == result.student_id)
        )
        user_res = await self.db.execute(user_stmt)
        student = user_res.scalar_one_or_none()
        if student and student.email:
            first_name = student.profile.first_name if student.profile else "Student"
            results_url = f"{settings.FRONTEND_URL}{action_url}"
            send_email_notification.delay(
                to_email=student.email,
                subject=f"Results Released: {assessment_title}",
                template_name="result_released",
                context={
                    "first_name": first_name,
                    "assessment_title": assessment_title,
                    "result_id": str(result.id),
                    "results_url": results_url,
                    "percentage": round(result.percentage, 1),
                    "letter_grade": (
                        result.letter_grade.value
                        if hasattr(result.letter_grade, "value")
                        else str(result.letter_grade)
                    ),
                    "is_passing": result.is_passing,
                    "notification_type": (
                        NotificationType.GROUP_RESULT_RELEASED.value
                        if result.is_group_result
                        else NotificationType.RESULT_RELEASED.value
                    ),
                    "app_name": settings.APP_NAME,
                },
            )

    # -----------------------------------------------------------------------
    # CALCULATE RESULT
    # -----------------------------------------------------------------------

    async def calculate_result(
        self,
        *,
        attempt_id: uuid.UUID,
        allow_partial: bool = False,
        is_post_release_correction: bool = False,
    ) -> tuple[AssessmentResult, bool]:
        """
        Compute the AssessmentResult for an attempt.

        Uses only is_final=True grades. By default requires all questions to be graded
        unless allow_partial=True is explicitly passed.
        The result is NOT released until the lecturer triggers release (or IMMEDIATE mode on full grading).

        Returns (result, created: bool).
        """
        attempt = await self.attempt_repo.get_by_id_simple(attempt_id)
        if not attempt:
            raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

        if attempt.status not in (AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED):
            raise ConflictError(
                "Cannot calculate result for an attempt that has not been submitted",
                code="ATTEMPT_NOT_SUBMITTED",
            )

        assessment = await self.assessment_repo.get_by_id_simple(attempt.assessment_id)
        aq_count = await self.assessment_repo.count_assessment_questions(attempt.assessment_id)
        graded_count = await self.grading_repo.count_final_grades(attempt_id)

        # Completeness guard (Item 13)
        if not allow_partial and aq_count > 0 and graded_count < aq_count:
            raise ConflictError(
                f"Attempt is only partially graded ({graded_count}/{aq_count} questions finalized). Set allow_partial=True to compute intermediate draft.",
                code="ATTEMPT_PARTIALLY_GRADED",
            )

        # Sum scores from final grades
        total_score = await self.grading_repo.sum_final_scores(attempt_id)
        
        # Authoritative max score (denominator)
        max_score = (
            float(assessment.total_marks)
            if (assessment and assessment.total_marks and assessment.total_marks > 0)
            else await self.grading_repo.sum_max_scores(attempt_id)
        )
        if max_score <= 0:
            max_score = await self.grading_repo.sum_max_scores(attempt_id)

        # Percentage (guard against divide-by-zero)
        percentage = round((total_score / max_score) * 100, 2) if max_score > 0 else 0.0

        # Passing threshold from assessment
        passing_pct = 0.0
        if assessment and assessment.passing_marks and assessment.total_marks:
            passing_pct = (assessment.passing_marks / assessment.total_marks) * 100

        letter_grade = _compute_letter_grade(percentage)
        is_passing = percentage >= passing_pct

        result, created = await self.result_repo.create_or_update_result(
            attempt_id=attempt_id,
            student_id=attempt.student_id,
            assessment_id=attempt.assessment_id,
            total_score=total_score,
            max_score=max_score,
            percentage=percentage,
            letter_grade=letter_grade,
            is_passing=is_passing,
            graded_question_count=graded_count,
            total_question_count=aq_count,
            is_post_release_correction=is_post_release_correction,
        )

        # Set integrity hold if attempt is flagged
        if attempt.is_flagged:
            await self.result_repo.set_integrity_hold(result.id, True)

        # Update cached score on attempt
        await self.attempt_repo.set_total_score(attempt_id, total_score)

        # Generate per-question breakdown
        await self.generate_breakdown(result.id, attempt_id)

        # Gate: Automatic Release for IMMEDIATE mode
        from app.db.enums import ResultReleaseMode

        release_mode = assessment.result_release_mode if assessment else None
        if hasattr(release_mode, "value"):
            release_mode = release_mode.value

        is_fully_graded = (
            aq_count > 0
            and graded_count >= aq_count
            and result.total_question_count > 0
            and result.graded_question_count >= result.total_question_count
        )

        if (
            release_mode == ResultReleaseMode.IMMEDIATE.value
            and not result.integrity_hold
            and not result.is_released
            and is_fully_graded
        ):
            await self.result_repo.release(result.id, released_by_id=None)
            result.is_released = True

            await self._notify_result_released(
                result=result,
                assessment_title=assessment.title if assessment else "Assessment",
            )

        return result, created

    # -----------------------------------------------------------------------
    # GENERATE BREAKDOWN
    # -----------------------------------------------------------------------

    async def generate_breakdown(
        self,
        result_id: uuid.UUID,
        attempt_id: uuid.UUID,
    ) -> None:
        """
        Create/replace per-question breakdown rows for a result.

        Sources data from SubmissionGrade and StudentResponse rows.
        Idempotent — replaces existing breakdowns.
        """
        grades = await self.grading_repo.list_final_grades_for_attempt(attempt_id)
        responses = await self.submission_repo.list_responses_for_attempt(attempt_id)

        # Build maps for efficient lookup
        grade_map = {g.question_id: g for g in grades}
        response_map = {r.question_id: r for r in responses}

        # Get all question IDs in this attempt (via responses)
        all_question_ids = set(response_map.keys())

        breakdowns = []
        for q_id in all_question_ids:
            grade = grade_map.get(q_id)
            response = response_map.get(q_id)

            breakdowns.append({
                "question_id": q_id,
                "attempt_id": attempt_id,
                "score": grade.score if grade else None,
                "max_score": grade.max_score if grade else 0.0,
                "is_correct": (
                    grade.score == grade.max_score
                    if grade and grade.score is not None
                    else None
                ),
                "feedback": grade.feedback if grade else None,
                "grading_mode": grade.grading_mode if grade else None,
                "feedback_author_basis": grade.feedback_author_basis if grade else "LECTURER",
                "was_skipped": response.is_skipped if response else False,
            })

        await self.result_repo.replace_breakdowns(result_id, breakdowns)

    # -----------------------------------------------------------------------
    # RELEASE RESULTS
    # -----------------------------------------------------------------------

    async def release_results(
        self,
        *,
        assessment_id: uuid.UUID,
        released_by_id: uuid.UUID | None = None,
        attempt_ids: list[uuid.UUID] | None = None,
        class_section_id: uuid.UUID | None = None,
    ) -> dict:
        """
        Release results to students.

        If attempt_ids is None → releases all fully-graded releasable results for the assessment.
        If attempt_ids is provided → releases only those specific results that are fully graded.

        Server-side validation:
        - Results with integrity_hold=True are held and returned in held_attempt_ids.
        - Results that are not fully graded (graded_question_count < total_question_count or
          total_question_count == 0) are strictly NOT released and returned in incomplete_attempt_ids.
        - Partial results are NEVER released to students.

        Returns:
            {
                released_count: int,
                held_count: int,
                held_attempt_ids: [uuid, ...],
                incomplete_count: int,
                incomplete_attempt_ids: [uuid, ...],
                message: str,
            }
        """
        from sqlalchemy import select

        # Total question count for assessment
        total_questions = await self.assessment_repo.count_assessment_questions(assessment_id)

        if attempt_ids:
            # Load specific results
            results = await self.result_repo.list_by_attempt_ids(attempt_ids)
            existing_attempt_ids = {r.attempt_id for r in results}
            missing_attempt_ids = [aid for aid in attempt_ids if aid not in existing_attempt_ids]

            # For missing results, attempt calculation
            for aid in missing_attempt_ids:
                try:
                    calc_res, _ = await self.calculate_result(attempt_id=aid)
                    results.append(calc_res)
                except Exception:
                    pass
        elif class_section_id:
            from app.db.models.academic import StudentEnrollment
            from app.db.enums import EnrollmentStatus
            student_ids_stmt = select(StudentEnrollment.student_id).where(
                StudentEnrollment.class_section_id == class_section_id,
                StudentEnrollment.enrollment_status == EnrollmentStatus.ACTIVE.value,
                StudentEnrollment.is_deleted == False
            )
            res = await self.db.execute(student_ids_stmt)
            section_student_ids = set(res.scalars().all())

            all_results = await self.result_repo.list_unreleased_without_hold(assessment_id)
            results = [r for r in all_results if r.student_id in section_student_ids]
        else:
            results = await self.result_repo.list_unreleased_without_hold(assessment_id)

        releasable = []
        held = []
        incomplete = []

        for r in results:
            if r.is_released:
                continue
            if r.integrity_hold:
                held.append(r)
                continue

            # Live check of question counts for data integrity
            if r.is_group_result or not r.attempt_id:
                is_fully_graded = (
                    r.total_question_count > 0
                    and r.graded_question_count >= r.total_question_count
                )
            else:
                actual_graded = await self.grading_repo.count_final_grades(r.attempt_id)
                aq_count = total_questions if total_questions > 0 else await self.assessment_repo.count_assessment_questions(r.assessment_id)
                is_fully_graded = (
                    aq_count > 0
                    and actual_graded == aq_count
                    and r.total_question_count > 0
                    and r.graded_question_count >= r.total_question_count
                )

            if is_fully_graded:
                releasable.append(r)
            else:
                incomplete.append(r)

        released_ids = [r.id for r in releasable]
        released_count = await self.result_repo.bulk_release(
            released_ids, released_by_id=released_by_id
        )

        # Synchronize GroupSubmission.result_released_at for any released group results
        group_sub_ids = {r.group_submission_id for r in releasable if r.is_group_result and r.group_submission_id}
        for g_sub_id in group_sub_ids:
            from app.db.models.attempt import GroupSubmission
            g_sub = await self.db.get(GroupSubmission, g_sub_id)
            if g_sub and not g_sub.result_released_at:
                g_sub.result_released_at = _utcnow()
                self.db.add(g_sub)
        if group_sub_ids:
            await self.db.flush()

        # Dispatch notifications for released results
        if released_ids:
            assessment = await self.assessment_repo.get_by_id_simple(assessment_id)
            assessment_title = assessment.title if assessment else "Assessment"

            for r in releasable:
                await self._notify_result_released(
                    result=r,
                    assessment_title=assessment_title,
                )

        held_attempt_ids = [r.attempt_id or r.id for r in held]
        incomplete_attempt_ids = [r.attempt_id or r.id for r in incomplete]

        parts = [f"{released_count} result(s) released."]
        if held:
            parts.append(f"{len(held)} held due to integrity flags.")
        if incomplete:
            parts.append(f"{len(incomplete)} skipped (partially graded / incomplete).")

        return {
            "released_count": released_count,
            "held_count": len(held),
            "held_attempt_ids": held_attempt_ids,
            "incomplete_count": len(incomplete),
            "incomplete_attempt_ids": incomplete_attempt_ids,
            "message": " ".join(parts),
        }

    # -----------------------------------------------------------------------
    # GET RESULT (role-aware)
    # -----------------------------------------------------------------------

    async def get_result_for_student(
        self,
        *,
        attempt_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> dict:
        """
        Return a result for a student — only if is_released=True.
        Supports lookup by attempt_id OR direct result.id.
        Raises NotFoundError if not released yet.
        """
        result = await self.result_repo.get_by_attempt_or_id_with_breakdowns(attempt_id)
        if not result:
            raise NotFoundError("Result not found", code="RESULT_NOT_FOUND")

        if result.student_id != student_id:
            raise AuthorizationError("You do not own this result", code="RESULT_OWNERSHIP_VIOLATION")

        if not result.is_released:
            raise NotFoundError(
                "Result is not yet available",
                code="RESULT_NOT_RELEASED",
            )
        
        return await self._enrich_result_response(result)

    async def get_result_for_lecturer(
        self,
        *,
        attempt_id: uuid.UUID,
    ) -> dict:
        """
        Return a result for a lecturer/admin — no release check.
        Supports lookup by attempt_id OR direct result.id.
        """
        result = await self.result_repo.get_by_attempt_or_id_with_breakdowns(attempt_id)
        if not result:
            raise NotFoundError("Result not found", code="RESULT_NOT_FOUND")
        
        return await self._enrich_result_response(result)

    async def _enrich_result_response(self, result: AssessmentResult) -> dict:
        """Add question and answer text to breakdowns for UI review with full academic hierarchy."""
        from sqlalchemy import select
        from app.schemas.result import AssessmentResultResponse
        from app.db.models.academic import (
            AcademicPeriod,
            ClassGroup,
            ClassSection,
            College,
            Course,
            Department,
            Institution,
            Option,
            StudentEnrollment,
            TeachingAssignment,
            TeachingWorkspace,
        )
        from app.db.models.assessment import Assessment, AssessmentTargetSection
        
        resp = AssessmentResultResponse.model_validate(result)
        
        # 1. Load attempt info
        if result.attempt_id:
            attempt = await self.attempt_repo.get_by_id_simple(result.attempt_id)
            if attempt:
                resp.submitted_at = attempt.submitted_at
                resp.started_at = attempt.started_at

        # 2. Load assessment and academic hierarchy
        assessment = await self.db.get(Assessment, result.assessment_id)
        
        inst_id: uuid.UUID | None = None
        college_id: uuid.UUID | None = None
        dept_id: uuid.UUID | None = None
        option_id: uuid.UUID | None = None
        class_section_id: uuid.UUID | None = None
        academic_period_id: uuid.UUID | None = None

        if assessment:
            resp.assessment_title = assessment.title
            resp.academic_year = assessment.academic_year
            resp.course_code = assessment.course_code
            resp.course_name = assessment.course_name
            resp.duration_minutes = assessment.duration_minutes
            resp.window_start = assessment.window_start
            resp.window_end = assessment.window_end
            
            asmt_type = assessment.assessment_type
            if hasattr(asmt_type, "value"):
                asmt_type = asmt_type.value
            resp.assessment_type = str(asmt_type)
            
            if hasattr(assessment, "level") and assessment.level:
                resp.academic_level = str(assessment.level)

            # Load Course
            course = None
            if assessment.course_id:
                course = await self.db.get(Course, assessment.course_id)
            elif assessment.course:
                course = assessment.course

            if course:
                if not resp.academic_year and course.academic_year:
                    resp.academic_year = course.academic_year
                if not resp.course_code:
                    resp.course_code = course.code
                if not resp.course_name:
                    resp.course_name = course.name
                if not resp.academic_level and hasattr(course, "level") and course.level:
                    resp.academic_level = str(course.level)
                if course.institution_id:
                    inst_id = course.institution_id
                if course.department_id:
                    dept_id = course.department_id
                if course.academic_period_id:
                    academic_period_id = course.academic_period_id

            # Load Teaching Workspace & Assignment
            if assessment.teaching_workspace_id:
                workspace = await self.db.get(TeachingWorkspace, assessment.teaching_workspace_id)
                if workspace:
                    if workspace.class_section_id and not class_section_id:
                        class_section_id = workspace.class_section_id
                    if workspace.academic_period_id and not academic_period_id:
                        academic_period_id = workspace.academic_period_id
                    if workspace.teaching_assignment_id:
                        assignment = await self.db.get(TeachingAssignment, workspace.teaching_assignment_id)
                        if assignment:
                            if assignment.institution_id and not inst_id:
                                inst_id = assignment.institution_id
                            if assignment.college_id and not college_id:
                                college_id = assignment.college_id
                            if assignment.department_id and not dept_id:
                                dept_id = assignment.department_id
                            if assignment.option_id and not option_id:
                                option_id = assignment.option_id
                            if assignment.class_section_id and not class_section_id:
                                class_section_id = assignment.class_section_id
                            if assignment.academic_period_id and not academic_period_id:
                                academic_period_id = assignment.academic_period_id
                            if assignment.academic_year and not resp.academic_year:
                                resp.academic_year = assignment.academic_year

        # 3. Resolve Target Class Section or Student's Enrollment Section
        if not class_section_id:
            try:
                target_stmt = select(AssessmentTargetSection.class_section_id).where(
                    AssessmentTargetSection.assessment_id == result.assessment_id
                )
                target_section_ids = (await self.db.scalars(target_stmt)).all()
                if target_section_ids:
                    enrollment_stmt = select(StudentEnrollment.class_section_id).where(
                        StudentEnrollment.student_id == result.student_id,
                        StudentEnrollment.class_section_id.in_(target_section_ids),
                    )
                    enrolled_sec = (await self.db.scalars(enrollment_stmt)).first()
                    class_section_id = enrolled_sec or target_section_ids[0]
                else:
                    enrollment_stmt = select(StudentEnrollment.class_section_id).where(
                        StudentEnrollment.student_id == result.student_id
                    )
                    class_section_id = (await self.db.scalars(enrollment_stmt)).first()
            except Exception:
                pass

        # 4. Resolve Academic Section, Class Group & Degree Program (Option)
        if class_section_id:
            section = await self.db.get(ClassSection, class_section_id)
            if section:
                resp.class_name = section.name
                if section.department_id and not dept_id:
                    dept_id = section.department_id
                if section.class_group_id:
                    cg = await self.db.get(ClassGroup, section.class_group_id)
                    if cg:
                        if not resp.academic_level:
                            resp.academic_level = cg.name if cg.name else (f"Level {cg.level}" if cg.level else None)
                        if cg.option_id and not option_id:
                            option_id = cg.option_id

        if option_id:
            opt = await self.db.get(Option, option_id)
            if opt:
                resp.option_name = opt.name
                if not resp.academic_level and opt.name:
                    resp.academic_level = opt.name
                if opt.department_id and not dept_id:
                    dept_id = opt.department_id

        # 5. Resolve Department, College, Institution & Academic Period
        if dept_id:
            dept = await self.db.get(Department, dept_id)
            if dept:
                resp.department_name = dept.name
                if dept.college_id and not college_id:
                    college_id = dept.college_id
                if dept.institution_id and not inst_id:
                    inst_id = dept.institution_id

        if college_id:
            col = await self.db.get(College, college_id)
            if col:
                resp.college_name = col.name
                resp.school_name = col.name
                if col.institution_id and not inst_id:
                    inst_id = col.institution_id

        if inst_id:
            inst = await self.db.get(Institution, inst_id)
            if inst:
                resp.institution_name = inst.name
                resp.institution_logo_url = inst.logo_url

        if academic_period_id and not resp.academic_year:
            period = await self.db.get(AcademicPeriod, academic_period_id)
            if period:
                resp.academic_year = period.name

        # 6. Group Result Special Handling: No fake breakdown generation
        if result.is_group_result:
            from app.db.models.attempt import GroupSubmission, StudentGroup
            resp.is_group_result = True
            resp.group_submission_id = result.group_submission_id
            resp.breakdowns = []
            if result.group_submission_id:
                group_sub = await self.db.get(GroupSubmission, result.group_submission_id)
                if group_sub:
                    resp.group_feedback = group_sub.feedback
                    if not resp.submitted_at:
                        resp.submitted_at = group_sub.submitted_at
                    group = await self.db.get(StudentGroup, group_sub.group_id)
                    if group:
                        resp.group_id = group.id
                        resp.group_name = group.name
            return resp.model_dump()

        # Load all questions and responses for this attempt
        responses = await self.submission_repo.list_responses_for_attempt(result.attempt_id) if result.attempt_id else []
        response_map = {r.question_id: r for r in responses}
        
        # Map for section titles
        aq_rows = await self.assessment_repo.list_assessment_questions(result.assessment_id)
        aq_map = {aq.question_id: aq for aq in aq_rows}
        
        for bd in resp.breakdowns:
            response = response_map.get(bd.question_id)
            if not response:
                continue
                
            q = response.question
            bd.question_text = q.content
            bd.image_url = q.image_url
            bd.case_study_context = q.case_study_context
            bd.question_table_context = q.question_table_context
            bd.requires_table_answer = bool(q.requires_table_answer)
            bd.answer_table_template = q.answer_table_template
            
            # Populate section title
            aq = aq_map.get(bd.question_id)
            if aq and aq.assessment_section:
                bd.section_title = aq.assessment_section.title
            
            # Safe Enum to string conversion
            q_type = q.question_type
            if hasattr(q_type, "value"):
                q_type = q_type.value
            bd.question_type = str(q_type).lower()
            
            # Format student answer
            ans_type = response.answer_type
            if hasattr(ans_type, "value"):
                ans_type = ans_type.value
            
            if ans_type == "SINGLE_OPTION":
                # Find the option text
                opt_id = response.selected_option_ids[0] if response.selected_option_ids else None
                if opt_id:
                    opt = next((o for o in q.options if str(o.id) == str(opt_id)), None)
                    bd.student_answer = opt.content if opt else "Unknown Option"
            elif ans_type == "MULTI_OPTION":
                bd.student_answer = ", ".join([
                    next((o.content for o in q.options if str(o.id) == str(oid)), "Unknown")
                    for oid in (response.selected_option_ids or [])
                ])
            elif ans_type == "MATCH_PAIRS":
                bd.student_answer_json = response.match_pairs_json
                bd.student_answer = ""
            elif ans_type == "FILL_BLANKS":
                bd.student_answer_json = response.fill_blank_answers
                bd.student_answer = ""
            elif ans_type == "ORDERED_LIST":
                bd.student_answer_json = response.ordered_option_ids or []
                ordered_texts = [
                    next((o.content for o in q.options if str(o.id) == str(oid)), "Unknown")
                    for oid in (response.ordered_option_ids or [])
                ]
                bd.student_answer = ", ".join(ordered_texts)
            else:
                bd.student_answer = response.answer_text
                if response.answer_text:
                    try:
                        import json
                        parsed = json.loads(response.answer_text)
                        if isinstance(parsed, (dict, list)):
                            bd.student_answer_json = parsed
                    except (TypeError, ValueError):
                        pass
                
            # Correct answer (for auto-gradable)
            raw_q_type = q.question_type
            if hasattr(raw_q_type, "value"):
                raw_q_type = raw_q_type.value

            if raw_q_type in ["MCQ", "TRUE_FALSE"]:
                correct_opts = [o.content for o in q.options if o.is_correct]
                bd.correct_answer = ", ".join(correct_opts)
            elif raw_q_type == "MATCHING":
                # Show matches
                bd.correct_answer = ", ".join([f"{o.content} -> {o.match_value}" for o in q.options])
            elif raw_q_type in ["ORDERING", "ORDERED_LIST"]:
                sorted_opts = sorted(q.options, key=lambda o: (o.order_index if o.order_index is not None else 0))
                bd.correct_answer = " -> ".join([o.content for o in sorted_opts])
            elif raw_q_type in ["FILL_BLANK", "FILL_BLANKS"]:
                if hasattr(q, "blanks") and q.blanks:
                    sorted_blanks = sorted(q.blanks, key=lambda b: (b.blank_index if b.blank_index is not None else 0))
                    bd.correct_answer = "; ".join([
                        f"Blank {b.blank_index + 1}: " + " | ".join(b.accepted_answers or [])
                        for b in sorted_blanks
                    ])
                    bd.blanks = [
                        {
                            "blank_index": b.blank_index,
                            "accepted_answers": b.accepted_answers or [],
                            "case_sensitive": bool(b.case_sensitive),
                        }
                        for b in sorted_blanks
                    ]
                elif q.options:
                    sorted_opts = sorted(q.options, key=lambda o: (o.order_index if o.order_index is not None else 0))
                    bd.correct_answer = "; ".join([
                        f"Blank {i + 1}: {o.content}" for i, o in enumerate(sorted_opts)
                    ])
            
            bd.options = [
                {
                    "id": str(o.id),
                    "text": o.content,
                    "is_correct": o.is_correct,
                    "match_key": o.match_key,
                    "match_value": o.match_value,
                    "order_index": o.order_index,
                }
                for o in (q.options or [])
            ]

        return resp.model_dump()

    async def list_results_for_student(
        self,
        *,
        student_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AssessmentResult], int]:
        """
        Return a list of released results for a student.
        """
        return await self.result_repo.list_by_student(
            student_id=student_id,
            is_released=True,
            page=page,
            page_size=page_size,
        )

    # -----------------------------------------------------------------------
    # CLEAR INTEGRITY HOLD
    # -----------------------------------------------------------------------

    async def clear_integrity_hold(
        self,
        *,
        result_id: uuid.UUID,
        cleared_by_id: uuid.UUID,
    ) -> None:
        """
        Clear the integrity hold on a result, making it releasable.
        Must be called by a lecturer or admin after resolving the flag.
        """
        result = await self.result_repo.get_by_id(result_id)
        if not result:
            raise NotFoundError("Result not found", code="RESULT_NOT_FOUND")
        if not result.integrity_hold:
            raise ConflictError(
                "This result does not have an integrity hold",
                code="NO_INTEGRITY_HOLD",
            )
        await self.result_repo.set_integrity_hold(result_id, False)


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _compute_letter_grade(percentage: float) -> ResultLetterGrade | None:
    """Compute letter grade from percentage using institution bands."""
    for threshold, grade in GRADE_BANDS:
        if percentage >= threshold:
            return grade
    return ResultLetterGrade.F
