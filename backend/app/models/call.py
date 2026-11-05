"""
Call model — one phone call session within a case.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    case_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    scenario_id: Mapped[str] = mapped_column(String(100), nullable=False)
    audio_file: Mapped[str | None] = mapped_column(Text)  # path to scenario audio

    # Gnani request tracking
    gnani_request_id: Mapped[str | None] = mapped_column(String(200))

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Status: initialising | active | on_hold | ended | error
    status: Mapped[str] = mapped_column(String(30), default="initialising")

    # Latency tracking (ms)
    avg_stt_latency_ms: Mapped[float | None] = mapped_column(Float)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    case: Mapped["Case"] = relationship("Case", back_populates="calls")
    utterances: Mapped[list["Utterance"]] = relationship(
        "Utterance", back_populates="call", lazy="select"
    )
