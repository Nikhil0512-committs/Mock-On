"""Promises API — GET /promises, POST /promises/{id}/confirm"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Promise, PromiseEvent, Case, User
from app.schemas.promise import PromiseRead, PromiseConfirm, PromiseEventRead
from app.services.auth import get_optional_current_user
from app.services.ledger import ledger

router = APIRouter(prefix="/promises", tags=["promises"])


@router.get("", response_model=list[PromiseRead])
async def list_all_promises(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all confirmed or recorded promises (filtered by user if authenticated)."""
    if current_user:
        stmt = (
            select(Promise)
            .join(Case, Promise.case_id == Case.id)
            .where(
                or_(
                    Case.user_id == current_user.id,
                    Case.user_email == current_user.email,
                    Case.owner_id == current_user.email,
                )
            )
            .order_by(Promise.created_at.desc())
        )
    else:
        stmt = select(Promise).order_by(Promise.created_at.desc()).limit(100)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/case/{case_id}", response_model=list[PromiseRead])
async def list_promises(case_id: str, db: AsyncSession = Depends(get_db)):
    return await ledger.get_promises_for_case(db, case_id)


@router.get("/{promise_id}", response_model=PromiseRead)
async def get_promise(promise_id: str, db: AsyncSession = Depends(get_db)):
    p = await ledger.get_promise(db, promise_id)
    if not p:
        raise HTTPException(404, "Promise not found")
    return p


@router.post("/{promise_id}/confirm", response_model=PromiseRead)
async def confirm_promise(
    promise_id: str,
    payload: PromiseConfirm,
    db: AsyncSession = Depends(get_db),
):
    """
    User confirms (or rejects) a proposed promise.
    If confirmed=False, the promise is discarded.
    """
    # Check for existing promise (confirmation case)
    existing = await ledger.get_promise(db, promise_id)
    if existing:
        # Update existing promise with any corrections
        if not payload.confirmed:
            await ledger.transition(db, existing, "unable_to_verify", "user_rejected")
            return existing
        if payload.corrected_amount is not None:
            existing.amount = payload.corrected_amount
        if payload.corrected_due_at is not None:
            existing.due_at = payload.corrected_due_at
        if payload.corrected_summary:
            existing.summary = payload.corrected_summary
        if not existing.due_at:
            from app.services.deadline_worker import get_demo_now
            existing.due_at = get_demo_now() + timedelta(days=5)
        if payload.enable_follow_up:
            existing.follow_up_allowed = True
            existing.approval_timestamp = datetime.now(timezone.utc)
        existing.user_confirmed = True
        existing.user_confirmation_timestamp = datetime.now(timezone.utc)
        # Record audit event
        event = PromiseEvent(
            promise_id=existing.id,
            from_status=None,
            to_status="pending",
            rule_fired="user_confirmed",
        )
        db.add(event)
        await db.flush()
        await db.refresh(existing)

        # Call summary email will be dispatched once when the call actually concludes
        return existing

    raise HTTPException(404, "Promise not found — may not have been extracted yet")


@router.get("/{promise_id}/events", response_model=list[PromiseEventRead])
async def get_promise_events(promise_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PromiseEvent)
        .where(PromiseEvent.promise_id == promise_id)
        .order_by(PromiseEvent.created_at)
    )
    return list(result.scalars().all())
