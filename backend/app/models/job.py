"""
Job model — deadline worker jobs (idempotent, lockable).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    promise_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("promises.id", ondelete="CASCADE"), nullable=False
    )
    # Unique key: case_id + promise_id + attempt_number
    idempotency_key: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1)

    # Scheduling
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Status: pending | claimed | success | failed | cancelled
    status: Mapped[str] = mapped_column(String(20), default="pending")
    result: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


# Index for the deadline worker to efficiently claim pending due jobs
__table_args__ = (
    Index("ix_jobs_status_run_at", "status", "run_at"),
)
