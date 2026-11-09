"""
Hold-On Backend — Database connection (Neon + asyncpg + pgvector)
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from pgvector.sqlalchemy import Vector  # noqa: F401 – registers the type
from app.config import settings

def normalize_database_url(url: str) -> str:
    """Normalize PostgreSQL URLs for asyncpg and Neon."""
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)

    # asyncpg expects 'ssl=require', not 'sslmode=require' or 'channel_binding'
    if "asyncpg" in url:
        url = url.replace("sslmode=require", "ssl=require")
        url = url.replace("&channel_binding=require", "")
        url = url.replace("?channel_binding=require&", "?")
        url = url.replace("channel_binding=require", "")
        if url.endswith("&") or url.endswith("?"):
            url = url[:-1]
    return url


db_url = normalize_database_url(settings.database_url)

engine_kwargs = {
    "echo": (settings.app_env == "development"),
}
if "postgresql" in db_url:
    engine_kwargs.update({
        "pool_size": 5,
        "max_overflow": 10,
        "pool_pre_ping": True,
    })

# Create async engine pointing at Neon DB (or SQLite fallback)
engine = create_async_engine(db_url, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """
    Create pgvector extension (if PostgreSQL) and all tables on startup.
    Safe to call multiple times (uses IF NOT EXISTS).
    """
    from sqlalchemy import text
    import app.models  # Ensure all models are registered with Base.metadata

    async with engine.begin() as conn:
        if "postgresql" in engine.url.drivername:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        
        await conn.run_sync(Base.metadata.create_all)

        # Migration helper for existing cases, users, and promises tables
        if "postgresql" in engine.url.drivername:
            await conn.execute(text("ALTER TABLE cases ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);"))
            await conn.execute(text("ALTER TABLE cases ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) DEFAULT 'consumer';"))
            await conn.execute(text("ALTER TABLE promises ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';"))
            await conn.execute(text("ALTER TABLE promise_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';"))
        elif "sqlite" in engine.url.drivername:
            try:
                await conn.execute(text("ALTER TABLE cases ADD COLUMN user_id VARCHAR(36);"))
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE cases ADD COLUMN user_email VARCHAR(255);"))
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(30) DEFAULT 'consumer';"))
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE promises ADD COLUMN metadata JSON;"))
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE promise_events ADD COLUMN metadata JSON;"))
            except Exception:
                pass

    # Ensure default Admin & Consumer demo accounts exist
    try:
        from app.services.auth import hash_password
        import uuid
        async with AsyncSessionLocal() as session:
            from sqlalchemy import select
            from app.models.user import User

            # Check admin
            res_admin = await session.execute(select(User).where(User.email == "admin@mockon.ai"))
            admin_user = res_admin.scalar_one_or_none()
            if not admin_user:
                admin_user = User(
                    id=str(uuid.uuid4()),
                    email="admin@mockon.ai",
                    hashed_password=hash_password("admin123"),
                    full_name="Company Support Desk (Admin)",
                    phone_number="+91 1800 200 1234",
                    role="admin",
                )
                session.add(admin_user)
            else:
                admin_user.role = "admin"

            # Check consumer Nikhil
            res_consumer = await session.execute(select(User).where(User.email == "nikhil@mockon.ai"))
            consumer_user = res_consumer.scalar_one_or_none()
            if not consumer_user:
                consumer_user = User(
                    id=str(uuid.uuid4()),
                    email="nikhil@mockon.ai",
                    hashed_password=hash_password("password123"),
                    full_name="Nikhil Sharma",
                    phone_number="+91 91030 31412",
                    role="consumer",
                )
                session.add(consumer_user)

            # Check consumer Aarti
            res_aarti = await session.execute(select(User).where(User.email == "aarti@mockon.ai"))
            aarti_user = res_aarti.scalar_one_or_none()
            if not aarti_user:
                aarti_user = User(
                    id=str(uuid.uuid4()),
                    email="aarti@mockon.ai",
                    hashed_password=hash_password("password123"),
                    full_name="Aarti Sharma",
                    phone_number="+91 98765 43210",
                    role="consumer",
                )
                session.add(aarti_user)

            await session.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Could not auto-seed demo accounts: %s", e)
