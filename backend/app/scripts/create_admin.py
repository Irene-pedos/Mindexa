import asyncio
import sys
from app.db.session import AsyncSessionFactory
from app.db.models.auth import User, UserProfile
from app.db.enums import UserRole
from app.core.security import hash_password, normalize_email


async def create_admin(email: str = "admin@mindexa.com", password: str = "Admin@12345"):
    norm_email = normalize_email(email)
    hashed_pwd = hash_password(password)

    async with AsyncSessionFactory() as session:
        from sqlalchemy import select
        stmt = select(User).where(User.email == norm_email)
        res = await session.execute(stmt)
        existing = res.scalar_one_or_none()

        from datetime import datetime, UTC
        from app.core.constants import UserStatus

        if existing:
            existing.hashed_password = hashed_pwd
            existing.role = UserRole.ADMIN.value
            existing.status = UserStatus.ACTIVE.value
            existing.email_verified = True
            existing.email_verified_at = datetime.now(UTC)
            existing.onboarding_completed = True
            await session.commit()
            print(f"Updated existing user '{norm_email}' to ACTIVE verified ADMIN.")
            return

        user = User(
            email=norm_email,
            hashed_password=hashed_pwd,
            role=UserRole.ADMIN.value,
            status=UserStatus.ACTIVE.value,
            email_verified=True,
            email_verified_at=datetime.now(UTC),
            onboarding_completed=True,
        )
        session.add(user)
        await session.flush()

        profile = UserProfile(
            user_id=user.id,
            first_name="System",
            last_name="Admin",
            title="System Administrator",
        )
        session.add(profile)
        await session.commit()

        print(f"Successfully created Main Admin Account:")
        print(f"  Email: {norm_email}")
        print(f"  Password: {password}")
        print(f"  Role: {user.role}")


if __name__ == "__main__":
    email_arg = sys.argv[1] if len(sys.argv) > 1 else "admin@mindexa.com"
    password_arg = sys.argv[2] if len(sys.argv) > 2 else "Admin@12345"
    asyncio.run(create_admin(email_arg, password_arg))
