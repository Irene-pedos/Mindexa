import asyncio
import uuid
import json
from sqlmodel import select
from app.db.session import AsyncSessionFactory
from app.db.models.ai import AIActionLog

async def check():
    batch_id = uuid.UUID("c9130b1a-2638-457f-b46b-dd16974be004")
    async with AsyncSessionFactory() as db:
        res = await db.execute(
            select(AIActionLog)
            .where(AIActionLog.subject_entity_id == batch_id)
            .order_by(AIActionLog.created_at.asc())
        )
        logs = res.scalars().all()
        print(f"Found {len(logs)} action logs")
        for i, log in enumerate(logs):
            print(f"Log #{i+1}:")
            print(f"  Action Type: {log.action_type}")
            print(f"  Status: {log.status}")
            print(f"  Provider: {log.provider_name}")
            print(f"  Model: {log.model_name}")
            print(f"  Prompt Summary: {log.prompt_summary}")
            print(f"  Latency: {log.latency_ms} ms")
            if log.error_message:
                print(f"  Error Message: {log.error_message}")
            if log.raw_output:
                print("  Raw Output JSON:")
                try:
                    out = json.loads(log.raw_output) if isinstance(log.raw_output, str) else log.raw_output
                    print(json.dumps(out, indent=2))
                except Exception:
                    print(log.raw_output)
            print("-" * 40)

if __name__ == "__main__":
    asyncio.run(check())
