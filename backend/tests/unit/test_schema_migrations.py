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
    assert heads[0] == "20260824_1130_progress_layout"
