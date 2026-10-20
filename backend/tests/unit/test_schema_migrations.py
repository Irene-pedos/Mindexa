from pathlib import Path
import re


def test_submission_grade_feedback_author_basis_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20260701_1030_43a7d2eedf5d_add_feedback_author_basis_to_result_breakdown.py"
    )
    migration_source = migration_path.read_text(encoding="utf-8")

    assert 'op.add_column(\n        "submission_grade"' in migration_source
    assert '"feedback_author_basis"' in migration_source


def test_unify_group_work_results_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20260817_1100_unify_group_work_results_schema.py"
    )
    assert migration_path.exists(), "Group work results migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision = "20260817_1100_group_results"' in source
    assert 'down_revision = "20260814_2145_add_table_fields"' in source
    assert '"group_submission_id"' in source
    assert '"is_group_result"' in source


def test_post_release_correction_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20260817_1300_add_post_release_correction_to_result.py"
    )
    assert migration_path.exists(), "Post release correction migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision = "20260817_1300_post_release"' in source
    assert 'down_revision = "20260817_1100_group_results"' in source
    assert '"is_post_release_corrected"' in source
    assert '"post_release_corrected_at"' in source


def test_add_paused_at_to_attempt_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20260819_1230_add_paused_at_to_attempt.py"
    )
    assert migration_path.exists(), "Add paused_at migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision = "20260819_1230_add_paused_at"' in source
    assert 'down_revision = "20260817_1300_post_release"' in source
    assert '"paused_at"' in source


def test_add_workspace_banner_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20260820_0030_add_workspace_banner_image.py"
    )
    assert migration_path.exists(), "Workspace banner migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision = "20260820_0030_workspace_banner"' in source
    assert 'down_revision = "20260819_1230_add_paused_at"' in source
    assert '"banner_image_url"' in source


def test_add_study_reader_capture_tables_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20260823_1045_add_study_reader_capture_tables.py"
    )
    assert migration_path.exists(), "Study reader capture migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision = "20260823_1045_study_reader"' in source
    assert 'down_revision = "20260820_0030_workspace_banner"' in source
    assert '"student_reading_progress"' in source
    assert '"student_material_annotation"' in source
    assert '"student_material_key_point"' in source


def test_add_reading_progress_layout_fields_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20260824_1130_add_reading_progress_layout_fields.py"
    )
    assert migration_path.exists(), "Reading progress layout migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision = "20260824_1130_progress_layout"' in source
    assert 'down_revision = "20260823_1045_study_reader"' in source
    assert '"rotation"' in source
    assert '"zoom_mode"' in source
    assert '"two_page_view"' in source
    assert '"furthest_page_reached"' in source


def test_add_conversation_id_to_study_support_session_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20260825_1200_add_conversation_id_to_study_support_session.py"
    )
    assert migration_path.exists(), "Study support conversation_id migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision = "20260825_1200_study_support_conv"' in source
    assert 'down_revision = "20260824_1130_progress_layout"' in source
    assert '"conversation_id"' in source
    assert '"ix_study_support_sessions_conversation_id"' in source


def test_add_generate_slide_deck_to_ai_action_type_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20260827_1030_add_generate_slide_deck_to_ai_action_type.py"
    )
    assert migration_path.exists(), "Slide deck action migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision: str = \'20260827_1030_slide_deck_action\'' in source or 'revision = "20260827_1030_slide_deck_action"' in source
    assert 'down_revision' in source
    assert "'GENERATE_SLIDE_DECK'" in source


def test_extend_learning_unit_and_outcomes_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20260827_2030_extend_learning_unit_and_outcomes.py"
    )
    assert migration_path.exists(), "Extend learning unit migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert "20260827_2030_extend_lu" in source
    assert "down_revision" in source
    assert "learning_outcomes" in source
    assert "start_page" in source
    assert "end_page" in source
    assert "uq_lu_workspace_material_order" in source


def test_add_generate_guided_exercise_to_ai_action_type_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20260828_2330_add_generate_guided_exercise_action.py"
    )
    assert migration_path.exists(), "Add generate guided exercise action migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert "20260828_2330_guided_ex_action" in source
    assert "20260827_2030_extend_lu" in source
    assert "GENERATE_GUIDED_EXERCISE" in source


def test_migration_chain_integrity():
    """Verify that every migration has a valid down_revision and there is exactly one head."""
    versions_dir = Path(__file__).resolve().parents[1] / ".." / "alembic" / "versions"
    migration_files = list(versions_dir.glob("*.py"))
    assert len(migration_files) > 0

    revisions = {}
    down_revisions = {}

    rev_pattern = re.compile(r'^revision\s*(?::\s*str)?\s*=\s*["\']([^"\']+)["\']', re.MULTILINE)
    down_rev_pattern = re.compile(
        r'^down_revision\s*(?::\s*(?:str|Union\[str, None\]|Optional\[str\]))?\s*=\s*(?:["\']([^"\']+)["\']|None)',
        re.MULTILINE,
    )

    for mf in migration_files:
        content = mf.read_text(encoding="utf-8")
        rev_match = rev_pattern.search(content)
        down_match = down_rev_pattern.search(content)
        if rev_match:
            rev_id = rev_match.group(1)
            down_id = down_match.group(1) if down_match and down_match.group(1) else None
            revisions[rev_id] = mf.name
            down_revisions[rev_id] = down_id

    # Verify that each down_revision (if not None) exists in revisions
    for rev, down_rev in down_revisions.items():
        if down_rev is not None:
            assert (
                down_rev in revisions
            ), f"Migration {revisions[rev]} has invalid down_revision: {down_rev}"

    # Verify single head (revisions that are not down_revision of any other revision)
    all_down_revs = set(down_revisions.values())
    heads = [rev for rev in revisions if rev not in all_down_revs]
    assert len(heads) == 1, f"Expected exactly 1 migration head, found: {heads}"
    assert heads[0] == "20261015_p5_marking"


def test_phase1_duties_and_policies_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20261011_1200_phase1_duties_and_policies.py"
    )
    assert migration_path.exists(), "Phase 1 migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision: str = "20261011_p1_duties_policies"' in source
    assert 'down_revision: Union[str, None] = "20261011_p0_align"' in source
    assert '"user_duty_assignment"' in source
    assert '"approval_policy"' in source
    assert '"uq_duty_assignment_dept_active"' in source
    assert '"uq_duty_assignment_campus_active"' in source
    assert '"uq_duty_assignment_inst_active"' in source
    assert '"uq_approval_policy_inst_type"' in source


def test_phase2_choice_sections_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20261012_0900_phase2_choice_sections.py"
    )
    assert migration_path.exists(), "Phase 2 migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision: str = "20261012_p2_choice_sections"' in source
    assert 'down_revision: Union[str, None] = "20261011_p1_duties_policies"' in source
    assert '"exam_structure_template"' in source
    assert '"attempt_section_selection"' in source
    assert '"section_kind"' in source
    assert '"over_answer_policy"' in source
    assert '"schedule_state"' in source
    assert '"is_counted"' in source
    assert '"uq_attempt_section_selection_attempt_question"' in source


def test_phase3_moderation_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20261013_0900_phase3_moderation.py"
    )
    assert migration_path.exists(), "Phase 3 migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision: str = "20261013_p3_moderation"' in source
    assert 'down_revision: Union[str, None] = "20261012_p2_choice_sections"' in source
    assert '"assessment_version"' in source
    assert '"moderation_review"' in source
    assert '"moderation_comment"' in source
    assert '"assessment_seal"' in source
    assert '"exam_print_job"' in source


def test_phase4_authoring_and_delegation_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20261014_0900_phase4_authoring.py"
    )
    assert migration_path.exists(), "Phase 4 migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision: str = "20261014_p4_authoring"' in source
    assert 'down_revision: Union[str, None] = "20261013_p3_moderation"' in source
    assert '"assessment_collaborator"' in source
    assert '"author_delegation"' in source
    assert '"is_superseded"' in source
    assert '"acting_under_delegation_id"' in source
    assert '"uq_assessment_collaborator_assessment_lecturer"' in source


def test_phase5_marking_migration_exists():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / ".."
        / "alembic"
        / "versions"
        / "20261015_0900_phase5_marking.py"
    )
    assert migration_path.exists(), "Phase 5 migration file must exist"
    source = migration_path.read_text(encoding="utf-8")
    assert 'revision: str = "20261015_p5_marking"' in source
    assert 'down_revision: Union[str, None] = "20261014_p4_authoring"' in source
    assert '"marking_scheme"' in source
    assert '"question_mark_step"' in source
    assert '"material_key_point"' in source
    assert '"question_key_point"' in source
    assert '"ai_grade_sample_check"' in source
    assert '"grading_delegation"' in source
    assert '"anonymous_marking"' in source
    assert '"graded_by_id"' in source
    assert '"delegation_id"' in source




