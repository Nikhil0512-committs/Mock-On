"""Pydantic schemas for Cases."""
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class CaseCreate(BaseModel):
    owner_id: str = Field(default="demo-user", description="User identifier")
    user_id: str | None = None
    user_email: str | None = None
    language: str = Field(default="hi-IN")
    goal: str = Field(..., description="Description of the billing issue")
    approved_info: dict[str, Any] = Field(default_factory=dict)
    follow_up_consent: bool = Field(default=False)


class CaseRead(BaseModel):
    id: str
    owner_id: str
    user_id: str | None = None
    user_email: str | None = None
    language: str
    goal: str
    approved_info: dict[str, Any]
    follow_up_consent: bool
    status: str
    family_token: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CaseUpdate(BaseModel):
    follow_up_consent: bool | None = None
    status: str | None = None
