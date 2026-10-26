"""
Collapse duplicate AI grade review (audit) rows created by repeated saves.

Dry run by default: prints what would change and modifies nothing.

    python scripts/dedupe_ai_grade_reviews.py            # preview
    python scripts/dedupe_ai_grade_reviews.py --apply    # soft-delete the duplicates

Run from the backend/ directory. Rows are soft-deleted, never removed, and the
latest row of each group keeps (or inherits) the recorded review time.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.repositories.grading_repo import GradingRepository  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402


async def main(apply: bool) -> None:
    async with AsyncSessionLocal() as session:
        summary = await GradingRepository(session).dedupe_ai_grade_reviews(apply=apply)
        if apply:
            await session.commit()
        else:
            await session.rollback()

    mode = "APPLIED" if apply else "DRY RUN (nothing changed)"
    print(f"[{mode}]")
    print(f"  grades with duplicate audit rows : {summary['groups']}")
    print(f"  duplicate rows {'removed' if apply else 'to remove'}          : {summary['removed']}")
    print(f"  review time carried to kept row  : {summary['evidence_carried']}")
    print(f"  skipped (pending review queue)   : {summary['skipped_pending']}")
    if not apply and summary["removed"]:
        print("Re-run with --apply to soft-delete the duplicates.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="actually soft-delete the duplicates")
    asyncio.run(main(parser.parse_args().apply))
