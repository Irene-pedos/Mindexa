"""The edit page rebuilds an assessment from GET /assessments/{id}.

Whatever the wizard saved through POST/PUT /assessments/draft has to come back from that GET with
every question type, option, sub-question mark, rubric and setting intact, or editing a saved
assessment silently loses data. This replays a full paper through both endpoints.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from httpx import AsyncClient

from app.core.constants import UserRole
from app.db.enums import AcademicPeriodType, LecturerAssignmentRole
from app.db.models.academic import (
    AcademicPeriod,
    ClassGroup,
    ClassSection,
    Course,
    Department,
    Institution,
    Option,
    TeachingAssignment,
    TeachingWorkspace,
)
from app.db.models.auth import User, UserProfile


async def _setup(db):
    inst = Institution(name="Round Trip University", code=f"RT_{uuid.uuid4().hex[:6]}")
    db.add(inst)
    await db.flush()
    period = AcademicPeriod(
        institution_id=inst.id,
        name="2026-2027",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    dept = Department(institution_id=inst.id, name="Computing", code=f"CP_{uuid.uuid4().hex[:4]}")
    db.add_all([period, dept])
    await db.flush()
    opt = Option(department_id=dept.id, name="Software", code=f"SW_{uuid.uuid4().hex[:4]}")
    course = Course(
        institution_id=inst.id,
        academic_period_id=period.id,
        department_id=dept.id,
        name="Web Design",
        code=f"WD_{uuid.uuid4().hex[:4].upper()}",
        academic_year="2026",
    )
    db.add_all([opt, course])
    await db.flush()
    cg = ClassGroup(course_id=course.id, name="CG", code=f"CG_{uuid.uuid4().hex[:4]}", option_id=opt.id)
    db.add(cg)
    await db.flush()
    section = ClassSection(class_group_id=cg.id, name="Section A")
    db.add(section)
    lecturer = User(
        email=f"lec_{uuid.uuid4().hex[:6]}@example.com",
        role=UserRole.LECTURER,
        hashed_password="hash",
        institution_id=inst.id,
        is_active=True,
        email_verified=True,
    )
    db.add(lecturer)
    await db.flush()
    db.add(UserProfile(user_id=lecturer.id, first_name="Dr.", last_name="Round"))
    assignment = TeachingAssignment(
        lecturer_id=lecturer.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_period_id=period.id,
        academic_year="2026",
        role=LecturerAssignmentRole.MAIN_LECTURER,
        class_section_id=section.id,
        option_id=opt.id,
    )
    db.add(assignment)
    await db.flush()
    workspace = TeachingWorkspace(
        teaching_assignment_id=assignment.id,
        course_id=course.id,
        class_section_id=section.id,
        academic_period_id=period.id,
        title="Workspace",
        created_by_id=lecturer.id,
    )
    db.add(workspace)
    await db.flush()
    return {"inst": inst, "course": course, "workspace": workspace, "lecturer": lecturer, "section": section}


def _payload(env, assessment_id=None, *, marks_q1=2):
    o = lambda text, ok=False, i=0, **kw: {"option_text": text, "is_correct": ok, "order_index": i, **kw}  # noqa: E731
    questions = [
        {
            "id": str(uuid.uuid4()), "sectionId": "sec-a", "type": "mcq", "marks": marks_q1, "text": "Which tag holds metadata?",
            "options": [o("<head>", True, 0), o("<body>", False, 1), o("<footer>", False, 2)], "is_required": True,
        },
        {
            "id": str(uuid.uuid4()), "sectionId": "sec-a", "type": "true_false", "marks": 1, "text": "CSS styles pages.",
            "options": [o("True", True, 0), o("False", False, 1)],
        },
        {
            "id": str(uuid.uuid4()), "sectionId": "sec-b", "type": "matching", "marks": 4, "text": "Match tag to purpose.",
            "options": [o("h1", True, 0, option_text_right="Heading"), o("p", True, 1, option_text_right="Paragraph")],
        },
        {
            "id": str(uuid.uuid4()), "sectionId": "sec-b", "type": "ordering", "marks": 3, "text": "Order the steps.",
            "options": [o("Write HTML", True, 0), o("Add CSS", True, 1), o("Publish", True, 2)],
        },
        {
            "id": str(uuid.uuid4()), "sectionId": "sec-b", "type": "fill_blank", "marks": 2, "text": "The [blank] tag makes a link.",
            "options": [o("a", True, 0), o("div", False, 1)],
        },
        {
            "id": str(uuid.uuid4()), "sectionId": "sec-c", "type": "short_answer", "marks": 5, "text": "Define CSS.",
            "options": [o("Model Answer: Cascading Style Sheets\n\nRubric: 1 mark per idea", True, 0)],
        },
        {
            "id": str(uuid.uuid4()), "sectionId": "sec-c", "type": "essay", "marks": 10, "text": "Discuss responsive design.",
            "options": [o("Model Answer: Fluid grids\n\nRubric: Structure 5\n\nWord Limit: 300 words", True, 0)],
        },
        {
            "id": str(uuid.uuid4()), "sectionId": "sec-c", "type": "computational", "marks": 4, "text": "Compute 2 + 2.",
            "computationalType": "numeric",
            "options": [o("Solution Steps: add\n\nNumerical Answer: 4\n\nTolerance: 0.5", True, 0)],
        },
        {
            "id": str(uuid.uuid4()), "sectionId": "sec-c", "type": "case_study", "marks": 10,
            "text": "Analyze the bakery site.", "caseStudyContext": "A bakery site uses inline styles everywhere.",
            "aiGenerated": True,
            "options": [
                o("Outline the fix.", True, 0, option_text_right="Use one stylesheet. " * 40, match_key="6"),
                o("Justify it.", True, 1, option_text_right="Separation of concerns.", match_key="4"),
            ],
        },
    ]
    return {
        "id": str(assessment_id) if assessment_id else None,
        "draft_step": 5,
        "metadata": {
            "title": "Round trip paper",
            "mode": "Formative",
            "institution_id": str(env["inst"].id),
            "course_id": str(env["course"].id),
            "teaching_workspace_id": str(env["workspace"].id),
            "target_section_ids": [str(env["section"].id)],
            "durationMinutes": 60,
            "passing_marks": 20,
            "academic_year": "2026",
        },
        "blueprint": [
            {
                "id": "sec-a", "section": "Section A", "topics": "Basics", "marks": 3, "questions": 2, "difficulty": "Easy",
                "allowedTypes": ["mcq", "true_false"], "bloomLevel": "remember",
                "aiPromptHint": "Keep it simple", "difficultyDistribution": {"easy": 2, "medium": 0, "hard": 0},
            },
            {"id": "sec-b", "section": "Section B", "marks": 9, "questions": 3, "difficulty": "Medium",
             "allowedTypes": ["matching", "ordering", "fill_blank"], "bloomLevel": "apply"},
            {"id": "sec-c", "section": "Section C", "marks": 29, "questions": 4, "difficulty": "Hard",
             "allowedTypes": ["short_answer", "essay", "computational", "case_study"], "bloomLevel": "analyze"},
        ],
        "questions": questions,
        "rules": {
            "attempts": 2, "allowResume": False, "integrityProfileCode": "HOMEWORK",
            "resultRelease": "scheduled", "resultReleaseAt": "2026-12-01T08:00:00Z",
            "shuffleQuestions": False, "shuffleOptions": True,
        },
    }


@pytest.mark.asyncio
async def test_a_saved_paper_comes_back_complete_for_the_edit_page(client: AsyncClient, db, make_auth_headers):
    env = await _setup(db)
    headers = make_auth_headers(user_id=str(env["lecturer"].id), role=UserRole.LECTURER)

    saved = await client.post("/api/v1/assessments/draft", json=_payload(env), headers=headers)
    assert saved.status_code in (200, 201), saved.text
    assessment_id = saved.json()["id"]

    res = await client.get(f"/api/v1/assessments/{assessment_id}", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    # Sections keep their order and blueprint details.
    sections = sorted(data["sections"], key=lambda s: s["order_index"])
    assert [s["title"] for s in sections] == ["Section A", "Section B", "Section C"]
    assert sections[0]["ai_generation_prompt_hint"] == "Keep it simple"
    assert sections[0]["difficulty_distribution"] == {"easy": 2, "medium": 0, "hard": 0}

    # Settings the edit page must restore, or saving again would reset them.
    assert data["allow_resume"] is False
    assert data["integrity_profile_code"] == "HOMEWORK"
    assert data["result_release_at"].startswith("2026-12-01")
    assert data["max_attempts"] == 2

    aqs = sorted(data["assessment_questions"], key=lambda a: a["order_index"])
    assert len(aqs) == 9
    by_type = {a["question"]["question_type"].lower(): a for a in aqs}

    mcq = by_type["mcq"]
    assert mcq["is_required"] is True and mcq["marks_override"] == 2
    assert [(op["option_text"], op["is_correct"]) for op in sorted(mcq["question"]["options"], key=lambda x: x["order_index"])] == [
        ("<head>", True), ("<body>", False), ("<footer>", False),
    ]

    matching = sorted(by_type["matching"]["question"]["options"], key=lambda x: x["order_index"])
    assert [(op["match_key"], op["option_text_right"]) for op in matching] == [("h1", "Heading"), ("p", "Paragraph")]

    ordering = sorted(by_type["ordering"]["question"]["options"], key=lambda x: x["order_index"])
    assert [op["option_text"] for op in ordering] == ["Write HTML", "Add CSS", "Publish"]

    assert "Cascading Style Sheets" in by_type["short_answer"]["question"]["explanation"]
    assert "Word Limit: 300 words" in by_type["essay"]["question"]["explanation"]
    assert "Tolerance: 0.5" in by_type["computational"]["question"]["explanation"]
    assert by_type["computational"]["question"]["computational_type"] == "numeric"

    case = by_type["case_study"]
    assert case["added_via"].upper().startswith("AI_GENERATED")
    assert case["question"]["case_study_context"].startswith("A bakery site")
    parts = sorted(case["question"]["options"], key=lambda x: x["order_index"])
    assert [(p["option_text"], p["match_key"]) for p in parts] == [("Outline the fix.", "6"), ("Justify it.", "4")]
    assert len(parts[0]["option_text_right"]) > 500  # long guidance survives

    # Order of questions follows what was sent.
    assert [a["question"]["question_type"].lower() for a in aqs][:2] == ["mcq", "true_false"]


@pytest.mark.asyncio
async def test_saving_again_replaces_the_paper_without_duplicates(client: AsyncClient, db, make_auth_headers):
    env = await _setup(db)
    headers = make_auth_headers(user_id=str(env["lecturer"].id), role=UserRole.LECTURER)

    first = await client.post("/api/v1/assessments/draft", json=_payload(env), headers=headers)
    assert first.status_code in (200, 201), first.text
    assessment_id = first.json()["id"]
    loaded = (await client.get(f"/api/v1/assessments/{assessment_id}", headers=headers)).json()

    # What the edit page does: send back the questions it loaded, with one mark changed.
    payload = _payload(env, assessment_id, marks_q1=7)
    payload["questions"] = [
        {**q, "id": aq["question"]["id"]}
        for q, aq in zip(
            payload["questions"],
            sorted(loaded["assessment_questions"], key=lambda a: a["order_index"]),
        )
    ]
    second = await client.put(f"/api/v1/assessments/draft/{assessment_id}", json=payload, headers=headers)
    assert second.status_code == 200, second.text

    data = (await client.get(f"/api/v1/assessments/{assessment_id}", headers=headers)).json()
    assert len(data["assessment_questions"]) == 9
    first_q = sorted(data["assessment_questions"], key=lambda a: a["order_index"])[0]
    assert first_q["marks_override"] == 7
    assert data["allow_resume"] is False and data["integrity_profile_code"] == "HOMEWORK"
