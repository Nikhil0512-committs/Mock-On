"""
Promise Ledger Service — creates, updates, and queries promises.
This is the single source of truth for all commitments.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Promise, PromiseEvent, Utterance
from app.services.validators import validator, parse_date_phrase
from app.services.embeddings import embed_query_async

logger = logging.getLogger(__name__)

VALID_STATUSES = {"pending", "due_soon", "overdue", "fulfilled", "unable_to_verify"}


class LedgerService:
    """
    Manages the lifecycle of promises in the database.
    Only the backend creates or updates promises; never agent text.
    """

    async def propose_promise(
        self,
        db: AsyncSession,
        case_id: str,
        candidate: dict,
        utterance_id: str | None,
        recent_turns: list[dict],
    ) -> dict:
        """
        Validate a Sarvam candidate and return a proposal dict.
        The promise is NOT saved yet — user must confirm first.
        Returns: {ok: bool, promise_data: dict, failures: list}
        """
        results = validator.validate(candidate, recent_turns)
        failures = validator.blocking_failures(results)

        if failures:
            return {
                "ok": False,
                "promise_data": candidate,
                "failures": [{"field": r.field, "reason": r.reason} for r in failures],
            }

        # Parse date if available
        raw_phrase = candidate.get("raw_date_phrase")
        due_at = None
        if raw_phrase:
            due_at = parse_date_phrase(raw_phrase)

        promise_data = {
            "case_id": case_id,
            "source_utterance_id": utterance_id,
            "commitment_type": candidate["commitment_type"],
            "summary": candidate.get("summary", candidate["quote"][:200]),
            "speaker_role": candidate["speaker"],
            "quoted_text": candidate["quote"],
            "amount": candidate.get("amount"),
            "raw_date_phrase": raw_phrase,
            "due_at": due_at,
            "extraction_confidence": candidate.get("confidence"),
            "status": "pending",
        }

        now = datetime.now(timezone.utc)
        idempotency_key = (
            f"{case_id}-{utterance_id or 'x'}-"
            f"{candidate['commitment_type']}-{candidate['quote'][:30]}"
        )

        # Deduplicate: check if an unconfirmed promise of this type already exists for the case
        existing_res = await db.execute(
            select(Promise).where(
                Promise.case_id == case_id,
                Promise.commitment_type == candidate["commitment_type"],
                Promise.user_confirmed == False,
            )
        )
        promise = existing_res.scalars().first()

        if promise:
            # Update existing proposal in-place
            promise.source_utterance_id = utterance_id
            promise.summary = promise_data["summary"]
            promise.quoted_text = promise_data["quoted_text"]
            promise.amount = promise_data["amount"]
            promise.raw_date_phrase = raw_phrase
            promise.due_at = due_at
            promise.extraction_confidence = candidate.get("confidence")
            await db.flush()
            await db.refresh(promise)
            promise_data["id"] = promise.id
        else:
            promise = Promise(
                **{k: v for k, v in promise_data.items() if hasattr(Promise, k)},
                user_confirmed=False,
                follow_up_allowed=False,
                idempotency_key=idempotency_key,
            )
            db.add(promise)
            await db.flush()
            await db.refresh(promise)
            promise_data["id"] = promise.id

        return {
            "ok": True,
            "promise_data": promise_data,
            "failures": [],
            "needs_date_confirmation": (raw_phrase and due_at is None),
        }

    async def confirm_promise(
        self,
        db: AsyncSession,
        proposal: dict,
        corrections: dict,
        enable_follow_up: bool,
    ) -> Promise:
        """
        Save or finalize a confirmed promise in the ledger.
        """
        now = datetime.now(timezone.utc)
        promise_id = proposal.get("id")
        existing = await self.get_promise(db, promise_id) if promise_id else None

        if existing:
            if corrections.get("corrected_amount") is not None:
                existing.amount = corrections["corrected_amount"]
            if corrections.get("corrected_due_at") is not None:
                existing.due_at = corrections["corrected_due_at"]
            if corrections.get("corrected_summary"):
                existing.summary = corrections["corrected_summary"]
            existing.user_confirmed = True
            existing.user_confirmation_timestamp = now
            existing.follow_up_allowed = enable_follow_up
            existing.approval_timestamp = now if enable_follow_up else None

            event = PromiseEvent(
                promise_id=existing.id,
                from_status=None,
                to_status="pending",
                rule_fired="user_confirmed",
            )
            db.add(event)
            await db.flush()
            logger.info(f"Existing Promise confirmed: {existing.id} [{existing.commitment_type}]")
            return existing

        data = {**proposal}
        if corrections.get("corrected_amount") is not None:
            data["amount"] = corrections["corrected_amount"]
        if corrections.get("corrected_due_at") is not None:
            data["due_at"] = corrections["corrected_due_at"]
        if corrections.get("corrected_summary"):
            data["summary"] = corrections["corrected_summary"]

        idempotency_key = (
            f"{data['case_id']}-{data.get('source_utterance_id', 'x')}-"
            f"{data['commitment_type']}-{data.get('quoted_text', '')[:30]}"
        )

        promise = Promise(
            **{k: v for k, v in data.items() if hasattr(Promise, k)},
            user_confirmed=True,
            user_confirmation_timestamp=now,
            follow_up_allowed=enable_follow_up,
            approval_timestamp=now if enable_follow_up else None,
            idempotency_key=idempotency_key,
        )
        db.add(promise)
        await db.flush()

        # Record initial event
        event = PromiseEvent(
            promise_id=promise.id,
            from_status=None,
            to_status="pending",
            rule_fired="user_confirmed",
        )
        db.add(event)
        await db.flush()
        logger.info(f"Promise confirmed: {promise.id} [{promise.commitment_type}]")
        return promise

    async def transition(
        self,
        db: AsyncSession,
        promise: Promise,
        new_status: str,
        rule: str,
        meta: dict | None = None,
    ) -> PromiseEvent:
        """Transition a promise to a new status, creating an audit event."""
        assert new_status in VALID_STATUSES, f"Invalid status: {new_status}"
        old_status = promise.status
        promise.status = new_status
        event = PromiseEvent(
            promise_id=promise.id,
            from_status=old_status,
            to_status=new_status,
            rule_fired=rule,
            metadata_=meta or {},
        )
        db.add(event)
        await db.flush()
        logger.info(f"Promise {promise.id}: {old_status} → {new_status} [{rule}]")
        return event

    async def get_promises_for_case(
        self, db: AsyncSession, case_id: str
    ) -> list[Promise]:
        result = await db.execute(
            select(Promise)
            .where(Promise.case_id == case_id, Promise.user_confirmed == True)
            .order_by(Promise.created_at)
        )
        return list(result.scalars().all())

    async def get_promise(self, db: AsyncSession, promise_id: str) -> Promise | None:
        result = await db.execute(select(Promise).where(Promise.id == promise_id))
        return result.scalar_one_or_none()


# Singleton
ledger = LedgerService()
