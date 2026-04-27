"""
app/scripts/seed_db.py

CLI entry point for the Mindexa development seed system.

USAGE:
    # Normal seed (idempotent — safe to run multiple times):
    python -m app.scripts.seed_db

    # Reset ALL data then re-seed clean:
    python -m app.scripts.seed_db --reset

    # Dry-run check (environment + DB connection only, no writes):
    python -m app.scripts.seed_db --check

ENVIRONMENT:
    Reads from .env / environment variables.
    Will ABORT immediately if ENVIRONMENT != "development".

REQUIREMENTS:
    - PostgreSQL must be running and accessible (DATABASE_URL set)
    - Redis must be running (REDIS_URL set) if app.core.redis is initialised
    - Run from the project root directory so Python can find the app package

EXAMPLES (from project root):
    cd /path/to/mindexa-backend
    python -m app.scripts.seed_db
    python -m app.scripts.seed_db --reset
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path

# ── Ensure project root is on PYTHONPATH ─────────────────────────────────────
# This is needed when the script is run as `python app/scripts/seed_db.py`
# (without -m flag). When run as `python -m app.scripts.seed_db`, Python
# handles the path automatically.
_project_root = Path(__file__).resolve().parent.parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))


# ── Configure logging BEFORE any app imports ─────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("mindexa.seed")


# ---------------------------------------------------------------------------
# ARGUMENT PARSER
# ---------------------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="seed_db",
        description=(
            "Mindexa development database seed tool.\n"
            "Creates realistic baseline data for all phases (2-5)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m app.scripts.seed_db\n"
            "  python -m app.scripts.seed_db --reset\n"
            "  python -m app.scripts.seed_db --check\n"
        ),
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        default=False,
        help=(
            "DANGER: Delete ALL data from the database, then re-seed. "
            "Only available in development."
        ),
    )
    parser.add_argument(
        "--check",
        action="store_true",
        default=False,
        help=("Dry-run: verify environment and DB connection only. No data is written."),
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# ENVIRONMENT CHECK
# ---------------------------------------------------------------------------


def _check_environment() -> None:
    """
    Verify we are in development before doing anything else.

    Imports settings lazily so we can print a clean error if the .env
    is misconfigured before any other import fails.
    """
    try:
        from app.core.config import settings
    except Exception as exc:
        logger.critical(
            "Failed to load app settings. Is your .env file configured correctly? Error: %s", exc
        )
        sys.exit(1)

    if settings.ENVIRONMENT != "development":
        logger.critical(
            "SEED ABORTED — ENVIRONMENT is '%s', not 'development'. "
            "This script must NEVER run in %s.",
            settings.ENVIRONMENT,
            settings.ENVIRONMENT,
        )
        sys.exit(1)

    logger.info("  ✔  Environment: %s", settings.ENVIRONMENT)
    logger.info(
        "  ✔  Database: %s",
        settings.DATABASE_URL.split("@")[-1]
        if "@" in settings.DATABASE_URL
        else settings.DATABASE_URL,
    )


# ---------------------------------------------------------------------------
# DATABASE CHECK
# ---------------------------------------------------------------------------


async def _check_db_connection() -> bool:
    """Test that we can reach the database."""
    try:
        from sqlalchemy import text

        from app.db.session import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        logger.info("  ✔  Database connection: OK")
        return True
    except Exception as exc:
        logger.error("  ✗  Database connection failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# MAIN ASYNC RUNNER
# ---------------------------------------------------------------------------


async def main(args: argparse.Namespace) -> int:
    """
    Main async entry point.

    Returns 0 on success, 1 on failure.
    """
    logger.info("")
    logger.info("╔══════════════════════════════════════════════════════╗")
    logger.info("║       MINDEXA Development Seed Tool                  ║")
    logger.info("╚══════════════════════════════════════════════════════╝")
    logger.info("")

    # ── Environment guard ────────────────────────────────────────────────────
    _check_environment()

    # ── DB connection check ───────────────────────────────────────────────────
    if not await _check_db_connection():
        logger.critical("Cannot proceed without a database connection.")
        return 1

    # ── Dry run (--check) ─────────────────────────────────────────────────────
    if args.check:
        logger.info("")
        logger.info("  --check mode: environment and DB connection OK.")
        logger.info("  No data was written.")
        return 0

    from app.core.seed import reset_seed_data, seed_all
    from app.db.session import AsyncSessionLocal

    # ── Reset mode (--reset) ──────────────────────────────────────────────────
    if args.reset:
        logger.warning("")
        logger.warning("  ⚠  --reset flag detected.")
        logger.warning("  This will DELETE ALL DATA from the database.")
        logger.warning("")

        # Safety confirmation prompt
        try:
            confirm = input("  Type 'yes' to confirm deletion: ").strip().lower()
        except EOFError:
            # Non-interactive mode (CI/CD) — require explicit --yes flag
            logger.error(
                "  Non-interactive mode: --reset requires manual confirmation. "
                "Run interactively or add explicit confirmation support."
            )
            return 1

        if confirm != "yes":
            logger.info("  Cancelled. No data was deleted.")
            return 0

        logger.info("")
        async with AsyncSessionLocal() as session:
            try:
                await reset_seed_data(session)
            except Exception as exc:
                await session.rollback()
                logger.critical("  Reset failed: %s", exc, exc_info=True)
                return 1

    # ── Seed ──────────────────────────────────────────────────────────────────
    logger.info("")
    start_time = time.perf_counter()

    async with AsyncSessionLocal() as session:
        try:
            await seed_all(session)
        except RuntimeError as exc:
            # RuntimeError = environment guard triggered
            logger.critical("  %s", exc)
            return 1
        except Exception as exc:
            await session.rollback()
            logger.critical("  Seed failed with error: %s", exc, exc_info=True)
            return 1

    elapsed = time.perf_counter() - start_time
    logger.info("")
    logger.info("  Completed in %.2f seconds.", elapsed)
    logger.info("")
    return 0


# ---------------------------------------------------------------------------
# ENTRY POINT
# ---------------------------------------------------------------------------


def run() -> None:
    """Synchronous wrapper — called by `python -m app.scripts.seed_db`."""
    args = _parse_args()
    exit_code = asyncio.run(main(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    run()
