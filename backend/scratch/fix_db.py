
import asyncio
from sqlalchemy import text
from app.db.session import AsyncSessionLocal

async def check_db():
    async with AsyncSessionLocal() as session:
        try:
            # Check if table exists
            res = await session.execute(text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'security_event');"))
            exists = res.scalar()
            print(f"Table security_event exists: {exists}")
            
            # Check if type exists
            res = await session.execute(text("SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'securityeventtype');"))
            type_exists = res.scalar()
            print(f"Type securityeventtype exists: {type_exists}")
            
            if not type_exists:
                print("Creating missing type securityeventtype...")
                # We need to do this outside of a transaction or with explicit commit if needed
                # Actually for enums we can just create them
                await session.execute(text("CREATE TYPE securityeventtype AS ENUM ('FAILED_LOGIN', 'ACCOUNT_LOCKED', 'TOKEN_REVOKED', 'SUSPICIOUS_IP', 'PASSWORD_RESET_REQUESTED', 'ROLE_CHANGED', 'ACCOUNT_SUSPENDED', 'LOGIN_SUCCESS');"))
                await session.commit()
                print("Type created.")
            else:
                # Check if LOGIN_SUCCESS is in the type (since I saw it in the logs but it wasn't in the initial migration snippet)
                res = await session.execute(text("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'securityeventtype';"))
                labels = [r[0] for r in res.fetchall()]
                print(f"Current labels: {labels}")
                if 'LOGIN_SUCCESS' not in labels:
                    print("Adding LOGIN_SUCCESS to securityeventtype...")
                    # ALTER TYPE cannot be run inside a transaction block in some postgres versions/drivers
                    # But we'll try
                    await session.execute(text("ALTER TYPE securityeventtype ADD VALUE 'LOGIN_SUCCESS';"))
                    await session.commit()
                    print("Label added.")

        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_db())
