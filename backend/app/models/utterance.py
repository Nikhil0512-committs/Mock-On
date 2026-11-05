"""
Utterance model — one turn of speech in a call.
Each transcript from Prisma STT becomes a row with speaker role + embedding.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
from app.database import Base


class Utterance(Base):
    __tablename__ = "utterances"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    call_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("calls.id", ondelete="CASCADE"), nullable=False
    )
    case_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )

    # Speaker: agent | user | ivr | system
    speaker_role: Mapped[str] = mapped_column(String(20), nullable=False)

    # Stream positions (bytes from our own position counter)
    stream_start: Mapped[int | None] = mapped_column(Integer)
    stream_end: Mapped[int | None] = mapped_column(Integer)

    # Transcript
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    normalised_text: Mapped[str] = mapped_column(Text, nullable=False)
    segment_id: Mapped[str | None] = mapped_column(String(100))

    # Latency from Gnani (ms) — stored alongside the transcript
    stt_latency_ms: Mapped[float | None] = mapped_column(Float)

    # Sequence number within the call
    sequence_num: Mapped[int] = mapped_column(Integer, default=0)

    # Embedding vector (multilingual-e5-small, 384 dims)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(384))
    embedding_model: Mapped[str | None] = mapped_column(String(100))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    call: Mapped["Call"] = relationship("Call", back_populates="utterances")
