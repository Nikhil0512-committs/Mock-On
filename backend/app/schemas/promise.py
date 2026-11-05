"""Pydantic schemas for Promises."""
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


class PromiseRead(BaseModel):
    id: str
    case_id: str
    source_utterance_id: str | None
    commitment_type: str
    summary: str
    speaker_role: str
    speaker_confidence: float | None
    quoted_text: str
    amount: Decimal | None
    currency: str | None
    raw_date_phrase: str | None
    due_at: datetime | None
    deadline_type: str | None
    parser_confidence: float | None
    status: str
    user_confirmed: bool
    user_confirmation_timestamp: datetime | None
    verification_method: str | None
    verified_at: datetime | None
    verification_result: str | None
    follow_up_allowed: bool
    attempt_count: int
    extraction_confidence: float | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PromiseConfirm(BaseModel):
    """User confirms or corrects a proposed promise."""
    confirmed: bool = True
    # Optional corrections
    corrected_amount: Decimal | None = None
    corrected_due_at: datetime | None = None
    corrected_summary: str | None = None
    enable_follow_up: bool = False


class PromiseEventRead(BaseModel):
    id: str
    promise_id: str
    from_status: str | None
    to_status: str
    rule_fired: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
