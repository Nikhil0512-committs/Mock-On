"""Pydantic schemas for Calls and Utterances."""
from datetime import datetime
from pydantic import BaseModel


class CallCreate(BaseModel):
    case_id: str
    scenario_id: str = "telecom_billing_v1"


class CallRead(BaseModel):
    id: str
    case_id: str
    scenario_id: str
    status: str
    gnani_request_id: str | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UtteranceRead(BaseModel):
    id: str
    call_id: str
    speaker_role: str
    raw_text: str
    normalised_text: str
    stt_latency_ms: float | None
    sequence_num: int
    created_at: datetime

    model_config = {"from_attributes": True}
