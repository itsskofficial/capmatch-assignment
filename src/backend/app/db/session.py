# backend/app/db/session.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

# Create an async engine instance. pool_pre_ping=True helps manage stale connections.
engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)

# Create a configured "AsyncSession" class.
AsyncSessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False, # Important for FastAPI
)

async def get_db_session() -> AsyncSession:
    """
    FastAPI dependency that provides a database session for a single request.
    """
    async with AsyncSessionLocal() as session:
        yield session