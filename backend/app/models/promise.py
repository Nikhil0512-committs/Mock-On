"""
Promise model — a commitment extracted from the conversation.
PromiseEvent — append-only audit log of state changes.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import (
    String, Text, Boolean, DateTime, ForeignKey,
    Numeric, JSON, Integer, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Promise(Base):
    __tablename__ = "promises"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    case_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    source_utterance_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("utterances.id", ondelete="SET NULL")
    )

    # --- Identity ---
    # promise_type: refund | correction | callback | technician_visit | update
    commitment_type: Mapped[str] = mapped_column(String(50), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)

    # --- Attribution ---
    speaker_role: Mapped[str] = mapped_column(String(20), nullable=False)  # agent | user | ivr
    speaker_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    # Exact words from the transcript
    quoted_text: Mapped[str] = mapped_column(Text, nullable=False)
    excerpt_id: Mapped[str | None] = mapped_column(String(36))

    # --- Amount (if applicable) ---
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str | None] = mapped_column(String(10), default="INR")

    # --- Timing ---
    raw_date_phrase: Mapped[str | None] = mapped_column(Text)          # "paanch working days"
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deadline_type: Mapped[str | None] = mapped_column(String(20))      # calendar | working
    parser_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))

    # --- Status (5 states) ---
    # pending | due_soon | overdue | fulfilled | unable_to_verify
    status: Mapped[str] = mapped_column(String(30), default="pending")

    # --- User confirmation ---
    user_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    user_confirmation_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- Verification ---
    verification_method: Mapped[str | None] = mapped_column(String(50))
    verifier: Mapped[str | None] = mapped_column(String(50))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_result: Mapped[str | None] = mapped_column(Text)

    # --- Automation controls ---
    follow_up_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    approval_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str | None] = mapped_column(String(200), unique=True)

    # Extraction metadata
    extraction_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    case: Mapped["Case"] = relationship("Case", back_populates="promises")
    events: Mapped[list["PromiseEvent"]] = relationship(
        "PromiseEvent", back_populates="promise", order_by="PromiseEvent.created_at"
    )


class PromiseEvent(Base):
    """Append-only audit log for every promise state change."""
    __tablename__ = "promise_events"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    promise_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("promises.id", ondelete="CASCADE"), nullable=False
    )
    # from_status → to_status
    from_status: Mapped[str | None] = mapped_column(String(30))
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    rule_fired: Mapped[str | None] = mapped_column(String(200))
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    promise: Mapped["Promise"] = relationship("Promise", back_populates="events")


# Index for vector similarity search on utterances done here in promise model file
# (no embedding in promise itself; embeddings live in utterances)
