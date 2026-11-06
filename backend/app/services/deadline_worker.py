"""
Deadline Worker — polls for overdue promises and fires authorised callbacks.
Uses FOR UPDATE SKIP LOCKED for duplicate-safe claiming (no Redis needed).
Simulated clock endpoint advances time for the demo.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, update, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Promise, Job, PromiseEvent
from app.services.ledger import ledger

logger = logging.getLogger(__name__)

# Simulated demo clock offset (can be advanced via POST /demo/clock)
_demo_clock_offset_seconds: float = 0.0


def get_demo_now() -> datetime:
    """Return current time, adjusted by any demo clock offset."""
    return datetime.now(timezone.utc) + timedelta(seconds=_demo_clock_offset_seconds)


def advance_demo_clock(days: float = 1.0) -> datetime:
    """Advance the simulated clock by N days (for demo)."""
    global _demo_clock_offset_seconds
    _demo_clock_offset_seconds += days * 86400
    return get_demo_now()


class DeadlineWorker:
    """
    Background task that runs every DEADLINE_POLL_INTERVAL seconds.
    - Rechecks promise statuses (pending → due_soon → overdue)
    - Claims due jobs and fires callbacks
    """

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("Deadline worker started")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _loop(self):
        while self._running:
            try:
                await self._tick()
            except Exception as e:
                logger.error(f"Deadline worker error: {e}", exc_info=True)
            await asyncio.sleep(settings.deadline_poll_interval)

    async def _tick(self):
        """One poll cycle: update statuses, claim and fire jobs."""
        async with AsyncSessionLocal() as db:
            now = get_demo_now()
            await self._update_promise_statuses(db, now)
            await self._claim_and_fire_jobs(db, now)
            await db.commit()

    async def _update_promise_statuses(self, db: AsyncSession, now: datetime):
        """Transition promises: pending→due_soon→overdue based on due_at."""
        # Fetch all non-terminal promises with due_at
        result = await db.execute(
            select(Promise).where(
                Promise.status.in_(["pending", "due_soon"]),
                Promise.due_at.is_not(None),
            )
        )
        promises = result.scalars().all()
        reminder_window = timedelta(hours=24)

        for p in promises:
            due = p.due_at
            if due is None:
                continue

            # Ensure both are timezone-aware in UTC for safe comparison
            if due.tzinfo is None:
                due_utc = due.replace(tzinfo=timezone.utc)
            else:
                due_utc = due.astimezone(timezone.utc)

            curr_now = now if now.tzinfo is not None else now.replace(tzinfo=timezone.utc)

            if curr_now >= due_utc and p.status != "overdue":
                await ledger.transition(db, p, "overdue", "deadline_passed", {"now": curr_now.isoformat()})
                
                # Send 5-day deadline check-in email with Yes/No action buttons (Strictly idempotent: sent once)
                meta = dict(p.metadata_ or {})
                if not meta.get("checkin_email_sent"):
                    try:
                        from app.models.case import Case
                        from app.services.email import email_service
                        c_res = await db.execute(select(Case).where(Case.id == p.case_id))
                        case = c_res.scalar_one_or_none()
                        target_email = (
                            (case.user_email if case else None)
                            or (case.owner_id if case and "@" in (case.owner_id or "") else None)
                            or ((case.approved_info or {}).get("contact_email") if case else None)
                            or ((case.approved_info or {}).get("email") if case else None)
                        )
                        if not target_email or "@" not in target_email or any(d in target_email.lower() for d in ["@mockon.ai", "@example.com", "@test.com", "@mock.com"]):
                            target_email = settings.smtp_user
                        if case and target_email:
                            provider = case.approved_info.get("service_provider", "Customer Support") if case.approved_info else "Customer Support"
                            amt_val = p.amount or (case.approved_info.get("disputed_amount") if case.approved_info else None)
                            amt_str = f"₹{amt_val}" if amt_val else "agreed sum"
                            ticket = (
                                getattr(p, "ticket_number", None)
                                or (case.approved_info.get("ticket_number") if case and case.approved_info else None)
                                or f"TKT-{str(p.case_id)[:8].upper()}"
                            )
                            phrase = (
                                getattr(p, "raw_date_phrase", None)
                                or getattr(p, "deadline_phrase", None)
                                or "agreed resolution timeline"
                            )
                            await email_service.send_deadline_checkin(
                                to_email=target_email,
                                case_id=p.case_id,
                                promise_id=p.id,
                                provider=provider,
                                ticket_number=ticket,
                                amount_str=amt_str,
                                due_date_str=phrase,
                            )
                            meta["checkin_email_sent"] = True
                            meta["checkin_email_sent_at"] = curr_now.isoformat()
                            p.metadata_ = meta
                    except Exception as mail_err:
                        logger.error(f"Failed to send deadline check-in email: {mail_err}")

                await db.commit()

                # If follow-up allowed, schedule callback job immediately
                if (p.follow_up_allowed or True) and (p.attempt_count or 0) == 0:
                    existing_job = await db.execute(
                        select(Job).where(
                            Job.promise_id == p.id,
                            Job.status.in_(["pending", "claimed", "success"]),
                        )
                    )
                    if not existing_job.scalar_one_or_none():
                        await self.schedule_callback(db, p, run_at=curr_now)
                        await db.commit()
            elif due_utc - curr_now <= reminder_window and p.status == "pending":
                await ledger.transition(db, p, "due_soon", "within_reminder_window")

    async def _claim_and_fire_jobs(self, db: AsyncSession, now: datetime):
        """Claim one pending job using FOR UPDATE SKIP LOCKED (on Postgres) and fire the callback."""
        from app.database import engine
        lock_clause = "FOR UPDATE SKIP LOCKED" if "postgresql" in engine.url.drivername else ""
        result = await db.execute(
            text(f"""
                SELECT id, promise_id, idempotency_key, attempt_number
                FROM jobs
                WHERE status = 'pending' AND run_at <= :now
                ORDER BY run_at
                LIMIT 1
                {lock_clause}
            """),
            {"now": now},
        )
        row = result.fetchone()
        if row is None:
            return

        job_id, promise_id, idem_key, attempt_num = row

        # Mark claimed
        await db.execute(
            text("UPDATE jobs SET status='claimed', claimed_at=:now WHERE id=:id"),
            {"now": now, "id": job_id},
        )

        # Pre-dispatch recheck: re-read promise status and consent
        p_result = await db.execute(select(Promise).where(Promise.id == promise_id))
        promise = p_result.scalar_one_or_none()

        if promise is None:
            await self._complete_job(db, job_id, "cancelled", "Promise not found")
            return

        # Safety checks (spec: re-read before every callback)
        if promise.status in ("fulfilled", "unable_to_verify"):
            await self._complete_job(db, job_id, "cancelled", f"Promise already {promise.status}")
            return
        if not promise.follow_up_allowed:
            await self._complete_job(db, job_id, "cancelled", "Follow-up consent revoked")
            return
        if not promise.user_confirmed:
            await self._complete_job(db, job_id, "cancelled", "Not confirmed by user")
            return

        # Fire the live callback to the company switchboard
        try:
            result_msg = await self._fire_callback(promise, db)
            await self._complete_job(db, job_id, "success", result_msg)
            promise.attempt_count = (promise.attempt_count or 0) + 1
            promise.last_attempt_at = now
            # Do NOT falsely mark as fulfilled; keep as overdue/escalated while follow-up call is in flight
            await db.commit()
        except Exception as e:
            logger.error(f"Callback failed for job {job_id}: {e}")
            await self._complete_job(db, job_id, "failed", str(e))

    async def _fire_callback(self, promise: Promise, db: AsyncSession) -> str:
        """
        Execute automated follow-up callback:
        1. Open a new Call with scenario_id="live_switchboard" and status="ringing"
        2. Set case status to "follow_up_active" with URGENT OVERDUE FOLLOW-UP context
        3. Broadcast incoming_call to the Switchboard
        4. Send dispatch notice email to the consumer
        """
        from app.models.case import Case
        from app.models.call import Call
        from app.ws.call_socket import manager
        from app.services.email import email_service

        c_res = await db.execute(select(Case).where(Case.id == promise.case_id))
        case = c_res.scalar_one_or_none()
        info = dict(case.approved_info or {}) if case else {}
        provider = info.get("service_provider") or "Customer Care"
        ticket_no = (
            getattr(promise, "ticket_number", None)
            or info.get("ticket_number")
            or f"TKT-{str(promise.case_id)[:8].upper()}"
        )
        amt_val = promise.amount or info.get("disputed_amount")
        amt_str = f"₹{amt_val}" if amt_val else "the agreed refund amount"
        id_val = info.get("identifier_value") or info.get("phone_number") or f"REF-{str(promise.case_id)[:6].upper()}"
        id_label = info.get("identifier_type") or "Reference"
        consumer_name = info.get("consumer_name") or info.get("full_name") or "Consumer"

        overdue_goal = (
            f"URGENT OVERDUE FOLLOW-UP: The agreed deadline for Ticket #{ticket_no} has passed without resolution. "
            f"Promised refund of {amt_str} for {provider} ({id_label}: {id_val}) has NOT been received by consumer {consumer_name}. "
            f"Demand immediate settlement, ledger confirmation, or transfer to Nodal/Appellate desk."
        )

        if case:
            case.goal = overdue_goal
            case.status = "follow_up_active"
            info["is_follow_up"] = True
            info["overdue_ticket"] = ticket_no
            info["disputed_amount"] = amt_str
            info["identifier_value"] = id_val
            case.approved_info = info

        # Open real follow-up call in database for Switchboard
        followup_call = Call(
            case_id=promise.case_id,
            scenario_id="live_switchboard",
            status="ringing",
            started_at=None,
        )
        db.add(followup_call)
        await db.flush()

        logger.info(f"Fired live switchboard callback Call #{followup_call.id} for promise {promise.id}")

        # Broadcast ringing incoming call to Switchboard operator
        try:
            await manager.broadcast("switchboard", {
                "type": "incoming_call",
                "call_id": followup_call.id,
                "case_id": promise.case_id,
                "goal": overdue_goal,
                "is_follow_up": True,
                "approved_info": info,
            })
        except Exception as b_err:
            logger.warning(f"Failed to broadcast follow-up call to switchboard: {b_err}")

        # Send dispatch notification email to user
        target_dispatch_email = (
            (case.user_email if case else None)
            or (case.owner_id if case and "@" in (case.owner_id or "") else None)
            or ((case.approved_info or {}).get("contact_email") if case else None)
            or ((case.approved_info or {}).get("email") if case else None)
        )
        if case and target_dispatch_email:
            try:
                await email_service.send_call_dispatched(
                    to_email=target_dispatch_email,
                    case_id=promise.case_id,
                    provider=provider,
                    identifier_label=id_label,
                    identifier_val=id_val,
                    amount_str=amt_str,
                    ticket_number=ticket_no,
                    goal=overdue_goal,
                )
            except Exception as mail_err:
                logger.warning(f"Failed to send follow-up dispatch email: {mail_err}")

        return f"Follow-up call {followup_call.id} dispatched to switchboard at {datetime.now(timezone.utc).isoformat()}"

    async def _complete_job(self, db: AsyncSession, job_id: str, status: str, result: str):
        await db.execute(
            text("UPDATE jobs SET status=:status, result=:result, completed_at=:now WHERE id=:id"),
            {"status": status, "result": result, "now": datetime.now(timezone.utc), "id": job_id},
        )

    async def schedule_callback(self, db: AsyncSession, promise: Promise, run_at: datetime | None = None):
        """Create a job for a promise callback with duplicate/idempotency protection."""
        if run_at is None:
            run_at = get_demo_now()

        # Check if an active/pending job already exists for this promise
        existing = await db.execute(
            select(Job).where(
                Job.promise_id == promise.id,
                Job.status.in_(["pending", "claimed"]),
            )
        )
        existing_job = existing.scalars().first()
        if existing_job:
            # Reschedule to immediate if run_at is earlier
            if run_at and (existing_job.run_at is None or existing_job.run_at > run_at):
                existing_job.run_at = run_at
                await db.flush()
            return existing_job

        # Check existing jobs to determine next attempt count
        attempt_res = await db.execute(
            select(Job.attempt_number).where(Job.promise_id == promise.id).order_by(Job.attempt_number.desc())
        )
        max_attempt = attempt_res.scalars().first()
        attempt = ((max_attempt or promise.attempt_count or 0) + 1)
        idem_key = f"{promise.case_id}-{promise.id}-{attempt}"

        # Prevent unique constraint collision if idempotency key already exists
        check_idem = await db.execute(select(Job.id).where(Job.idempotency_key == idem_key))
        if check_idem.scalars().first():
            import uuid
            idem_key = f"{idem_key}-{uuid.uuid4().hex[:6]}"

        job = Job(
            promise_id=promise.id,
            idempotency_key=idem_key,
            attempt_number=attempt,
            run_at=run_at,
            status="pending",
        )
        db.add(job)
        await db.flush()
        return job


# Module-level singletons
deadline_worker = DeadlineWorker()


# Import Job here to avoid circular
from app.models.job import Job  # noqa: E402
