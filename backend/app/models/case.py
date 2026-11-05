"""
Case model — top-level container for a customer complaint.
"""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy import String, Text, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    owner_id: Mapped[str] = mapped_column(String(100), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    language: Mapped[str] = mapped_column(String(20), default="hi-IN")
    goal: Mapped[str] = mapped_column(Text, nullable=False)

    # Consent
    approved_info: Mapped[dict] = mapped_column(JSON, default=dict)
    follow_up_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Status: open | resolved | closed
    status: Mapped[str] = mapped_column(String(20), default="open")

    # Family view token (null until shared)
    family_token: Mapped[str | None] = mapped_column(String(64))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user: Mapped["User | None"] = relationship("User", back_populates="cases", lazy="select")
    calls: Mapped[list["Call"]] = relationship("Call", back_populates="case", lazy="select")
    promises: Mapped[list["Promise"]] = relationship("Promise", back_populates="case", lazy="select")
