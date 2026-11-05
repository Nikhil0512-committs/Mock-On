"""
KBChunk model — escalation guide passages with vector embeddings.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector
from app.database import Base


class KBChunk(Base):
    __tablename__ = "kb_chunks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    checked_date: Mapped[str] = mapped_column(String(20))  # YYYY-MM-DD
    category: Mapped[str] = mapped_column(String(50))      # trai | nch | cpgrams | provider
    title: Mapped[str] = mapped_column(Text)
    passage: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(384))
    embedding_model: Mapped[str | None] = mapped_column(String(100))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
