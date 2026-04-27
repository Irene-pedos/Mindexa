import asyncio
import logging
import sys

from sqlalchemy import text

from app.db.session import AsyncSessionLocal

logger = logging.getLogger("mindexa.drop_enums")

async def drop_enums(force: bool = False) -> None:
    if not force:
        answer = input(
            "This will DROP TYPE ... CASCADE and remove dependent objects. Continue? [y/N]: "
        ).strip().lower()
        if answer not in {"y", "yes"}:
            logger.info("Aborted enum drop; no changes applied.")
            return

    logger.warning(
        "Dropping enums with CASCADE: userrole, userstatus. "
        "This will remove dependent database objects."
    )

    session = AsyncSessionLocal()
    try:
        await session.execute(text("DROP TYPE IF EXISTS userrole CASCADE"))
        await session.execute(text("DROP TYPE IF EXISTS userstatus CASCADE"))
        await session.commit()
        logger.info("Enums dropped successfully.")
    except Exception:
        await session.rollback()
        logger.exception("Failed to drop enums; transaction rolled back.")
        raise
    finally:
        await session.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    force_flag = "--force" in sys.argv
    asyncio.run(drop_enums(force=force_flag))
