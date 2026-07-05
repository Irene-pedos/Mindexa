from pathlib import Path


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
