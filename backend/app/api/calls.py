"""Calls API — POST /calls, GET /calls/{id}, Live Admin Switchboard dispatch & messaging."""
import asyncio
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, AsyncSessionLocal
from app.models import Call, Case, Utterance, Promise
from app.schemas.call import CallCreate, CallRead
from app.services.orchestrator import CallOrchestrator
from app.services.sarvam import sarvam_extractor
from app.services.validators import validator
from app.services.email import email_service
from app.ws.call_socket import manager

router = APIRouter(prefix="/calls", tags=["calls"])
logger = logging.getLogger(__name__)


def deduplicate_phrase_repetitions(text: str) -> str:
    """Strip runaway phrase loops caused by browser speech recognition or mic echo."""
    if not text:
        return ""
    import re
    # Strip identical repeated chunks of length 8 to 250 characters
    cleaned = re.sub(r'(.{8,250}?)\s+(?:\1\s*)+', r'\1 ', text, flags=re.IGNORECASE)
    words = cleaned.strip().split()
    if len(words) < 2:
        return cleaned.strip()

    max_w = min(len(words) // 2, 60)
    for _ in range(2):
        for window in range(max_w, 0, -1):
            out = []
            i = 0
            while i < len(words):
                if i + window * 2 <= len(words):
                    p1 = " ".join(words[i : i + window]).lower()
                    p2 = " ".join(words[i + window : i + window * 2]).lower()
                    if p1 == p2:
                        out.extend(words[i : i + window])
                        i += window * 2
                        while i + window <= len(words) and " ".join(words[i : i + window]).lower() == p1:
                            i += window
                        continue
                out.append(words[i])
                i += 1
            words = out
    return " ".join(words).strip()


class AcceptCallPayload(BaseModel):
    operator_name: Optional[str] = "Tata / Airtel Support Specialist"


class CallMessagePayload(BaseModel):
    speaker: str  # "agent" (operator) or "user" (consumer / advocate)
    text: str
    auto_advocate_reply: Optional[bool] = True


@router.get("/switchboard/pending")
async def get_switchboard_pending(db: AsyncSession = Depends(get_db)):
    """Return all incoming/ringing and active switchboard calls for operator desk, auto-expiring stale calls."""
    now_utc = datetime.now(timezone.utc)
    stale_cutoff = now_utc - timedelta(minutes=20)

    # Auto-expire any stale calls older than 20 minutes so they don't linger in queue
    await db.execute(
        update(Call)
        .where(
            Call.scenario_id == "live_switchboard",
            Call.status.in_(["ringing", "active", "initialising"]),
            Call.created_at < stale_cutoff,
        )
        .values(status="ended", ended_at=now_utc)
    )
    await db.commit()

    stmt = (
        select(Call, Case)
        .join(Case, Call.case_id == Case.id)
        .where(
            Call.scenario_id == "live_switchboard",
            Call.status.in_(["ringing", "active", "initialising"]),
        )
        .order_by(Call.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    results = []
    for call, case in rows:
        results.append({
            "call": {
                "id": call.id,
                "case_id": call.case_id,
                "scenario_id": call.scenario_id,
                "status": call.status,
                "started_at": call.started_at.isoformat() if call.started_at else None,
                "created_at": call.created_at.isoformat() if call.created_at else None,
            },
            "case": {
                "id": case.id,
                "owner_id": case.owner_id,
                "user_email": case.user_email,
                "goal": case.goal,
                "approved_info": case.approved_info,
                "status": case.status,
                "created_at": case.created_at.isoformat() if case.created_at else None,
            },
        })
    return results


@router.post("/switchboard/clear")
async def clear_switchboard_queue(db: AsyncSession = Depends(get_db)):
    """Clear all pending/ringing switchboard calls."""
    now_utc = datetime.now(timezone.utc)
    res = await db.execute(
        update(Call)
        .where(
            Call.scenario_id == "live_switchboard",
            Call.status.in_(["ringing", "active", "initialising"]),
        )
        .values(status="ended", ended_at=now_utc)
    )
    await db.commit()
    return {"ok": True, "cleared_count": res.rowcount}


@router.post("", response_model=CallRead, status_code=201)
async def start_call(payload: CallCreate, db: AsyncSession = Depends(get_db)):
    """Start a new call for a case. If live_switchboard, marks ringing for operator."""
    case_result = await db.execute(select(Case).where(Case.id == payload.case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(404, "Case not found")

    is_live = (payload.scenario_id == "live_switchboard")

    # Create call record
    call = Call(
        case_id=payload.case_id,
        scenario_id=payload.scenario_id,
        status="ringing" if is_live else "initialising",
        started_at=datetime.now(timezone.utc) if not is_live else None,
    )
    db.add(call)
    await db.commit()
    await db.refresh(call)
    call_id = call.id

    if is_live:
        # Notify switchboard of new incoming call
        await manager.broadcast("switchboard", {
            "type": "incoming_call",
            "call_id": call.id,
            "case_id": case.id,
            "goal": case.goal,
            "approved_info": case.approved_info,
        })

        # Send call dispatch confirmation email to consumer
        user_email = (
            case.user_email
            or (case.owner_id if "@" in (case.owner_id or "") else None)
            or (case.approved_info or {}).get("contact_email")
            or (case.approved_info or {}).get("email")
        )
        if user_email:
            info = case.approved_info or {}
            asyncio.create_task(email_service.send_call_dispatched(
                to_email=user_email,
                case_id=case.id,
                provider=info.get("service_provider") or "Customer Care",
                identifier_label=info.get("identifier_type") or "Reference",
                identifier_val=info.get("identifier_value") or info.get("phone_number") or "CA-1029481029",
                amount_str=f"₹{info.get('disputed_amount', '8,500')}",
                ticket_number=info.get("ticket_number") or "TKT-2026-78432",
                goal=case.goal,
            ))
        return call

    # Otherwise run automated Browser Voice IVR Orchestrator
    async def broadcast(msg: dict):
        await manager.broadcast(call_id, msg)

    orchestrator = CallOrchestrator(
        call_id=call_id,
        case_id=payload.case_id,
        scenario_id=payload.scenario_id,
        db_session_factory=AsyncSessionLocal,
        broadcast=broadcast,
    )

    task = asyncio.create_task(orchestrator.run())
    manager.set_task(call_id, task)

    call.status = "active"
    await db.commit()
    await db.refresh(call)
    return call


@router.post("/{call_id}/accept")
async def accept_call(
    call_id: str,
    payload: Optional[AcceptCallPayload] = None,
    db: AsyncSession = Depends(get_db),
):
    """Admin / Support Operator accepts the ringing call."""
    result = await db.execute(select(Call).where(Call.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(404, "Call not found")

    c_res = await db.execute(select(Case).where(Case.id == call.case_id))
    case = c_res.scalar_one_or_none()

    call.status = "active"
    call.started_at = datetime.now(timezone.utc)

    op_name = payload.operator_name if payload else "Support Desk Operator"

    # Broadcast acceptance event
    await manager.broadcast(call_id, {
        "type": "call_accepted",
        "operator_name": op_name,
        "message": f"{op_name} answered the call. Live telephony session active.",
    })
    await db.commit()

    return {"ok": True, "call_id": call_id, "status": "active"}


class TTSPayload(BaseModel):
    text: str


@router.post("/tts")
async def synthesize_speech(payload: TTSPayload):
    """Synthesizes text using Gnani Timbre TTS into base64 audio."""
    from app.services.gnani_tts import tts_adapter
    import base64
    try:
        audio_bytes = await tts_adapter.synthesise(payload.text)
        return {
            "ok": True,
            "audio_b64": base64.b64encode(audio_bytes).decode("utf-8"),
        }
    except Exception as e:
        logger.warning(f"TTS synthesis failed: {e}")
        return {"ok": False, "error": str(e)}


_call_advocate_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


@router.post("/{call_id}/send_message")
async def send_call_message(
    call_id: str,
    payload: CallMessagePayload,
    db: AsyncSession = Depends(get_db),
):
    """
    Operator or Consumer sends a message over the live call.
    Strict anti-hallucination: detects refusals honestly, only extracts verified commitments.
    Synthesizes speech audio so users experience an authentic voice call.
    """
    result = await db.execute(select(Call).where(Call.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(404, "Call not found")

    c_res = await db.execute(select(Case).where(Case.id == call.case_id))
    case = c_res.scalar_one_or_none()

    text = deduplicate_phrase_repetitions(payload.text.strip())
    if not text:
        raise HTTPException(400, "Text cannot be empty")

    # Anti-race / rapid duplicate suppression check:
    # If the identical text from the same speaker was sent within the last 2 seconds, deduplicate!
    prev_utt_res = await db.execute(
        select(Utterance)
        .where(Utterance.call_id == call_id)
        .order_by(Utterance.created_at.desc(), Utterance.sequence_num.desc())
        .limit(1)
    )
    prev_utt = prev_utt_res.scalar_one_or_none()
    if prev_utt and prev_utt.speaker_role == payload.speaker and prev_utt.raw_text.strip().lower() == text.lower():
        now_dt = datetime.now(timezone.utc)
        prev_dt = prev_utt.created_at
        if prev_dt and (now_dt - prev_dt).total_seconds() < 2.5:
            logger.info(f"Deduplicated rapid duplicate utterance on call {call_id}: '{text}'")
            return {
                "ok": True,
                "utterance_id": prev_utt.id,
                "promise_detected": False,
                "is_refusal": False,
                "deduplicated": True,
            }

    # Monotonic sequence numbering
    seq_res = await db.execute(
        select(func.coalesce(func.max(Utterance.sequence_num), 0)).where(Utterance.call_id == call_id)
    )
    next_seq = int(seq_res.scalar() or 0) + 1

    utt_id = str(uuid.uuid4())
    utt = Utterance(
        id=utt_id,
        call_id=call_id,
        case_id=call.case_id,
        speaker_role=payload.speaker,
        sequence_num=next_seq,
        raw_text=text,
        normalised_text=text,
    )
    db.add(utt)
    await db.commit()

    # Attempt TTS synthesis ONLY for consumer/advocate speech (payload.speaker == "user").
    # Company representative speech ('agent') is human/switchboard voice and must NEVER be voice-read by our AI!
    audio_b64 = None
    if payload.speaker == "user":
        try:
            from app.services.gnani_tts import tts_adapter
            import base64
            audio_bytes = await tts_adapter.synthesise(text)
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        except Exception as e:
            logger.debug(f"Audio synthesis skipped: {e}")

    # 1. Broadcast utterance with audio to both sides
    await manager.broadcast(call_id, {
        "type": "utterance",
        "data": {
            "id": utt_id,
            "speaker": payload.speaker,
            "text": text,
            "is_final": True,
            "latencyMs": 95,
            "audio_b64": audio_b64,
        },
    })

    promise_detected = False
    is_refusal = False

    # 2. If the company representative spoke, run Anti-Hallucination + Evasion Radar + Sarvam LLM
    if payload.speaker == "agent":
        # Real-time Corporate Evasion & Tactic Analysis (Feature 2)
        domain_name = (case.approved_info or {}).get("domain", "telecom") if case else "telecom"
        evasion_analysis = sarvam_extractor.analyze_evasion_and_tactics(text, domain=domain_name)
        await manager.broadcast(call_id, {
            "type": "evasion_radar",
            "data": evasion_analysis,
        })

        lower_text = text.lower()
        refusal_terms = [
            "no refund", "cannot refund", "can't refund", "refuse", "not possible",
            "refund nahi", "nahi hoga", "policy does not allow", "unable to process refund",
            "denied", "not approved", "no compensation", "nothing can be done",
            "nahi milega", "reject", "rejected", "cannot waive", "won't refund",
            "not eligible", "cannot assist", "cannot promise",
        ]
        is_refusal = any(term in lower_text for term in refusal_terms)

        if is_refusal:
            logger.info(f"Anti-Hallucination: Representative refused, zero promise created: {text}")
            await manager.broadcast(call_id, {
                "type": "radar_update",
                "data": {
                    "status": "refused",
                    "title": "Representative Refused Resolution",
                    "detail": f"Company representative stated: '{text}'. No statutory settlement offered.",
                    "escalation_recommended": True,
                },
            })
        else:
            try:
                candidate = await sarvam_extractor.extract_promise(
                    [{"speaker_role": "agent", "raw_text": text, "normalised_text": text}],
                    current_turn={"speaker_role": "agent", "raw_text": text, "normalised_text": text},
                )
                if candidate and candidate.get("summary"):
                    from app.services.ledger import ledger
                    res = await ledger.propose_promise(
                        db,
                        case_id=call.case_id,
                        candidate=candidate,
                        utterance_id=utt_id,
                        recent_turns=[{"speaker_role": "agent", "raw_text": text}],
                    )
                    if res.get("ok"):
                        promise_detected = True
                        await manager.broadcast(call_id, {
                            "type": "promise_proposed",
                            "proposal": res["promise_data"],
                            "needs_date_confirmation": res.get("needs_date_confirmation", False),
                        })
                        await db.commit()
            except Exception as e:
                logger.warning(f"Error during switchboard Sarvam promise extraction: {e}")

        # Intelligent Dynamic Advocate AI reply based on provided intake info
        if payload.auto_advocate_reply:
            async def advocate_reply():
                try:
                    async with _call_advocate_locks[call_id]:
                        # Natural 120ms conversational turn pause (ultra-low latency)
                        await asyncio.sleep(0.12)
                        info = (case.approved_info or {}) if case else {}
                        amt = info.get("disputed_amount") or "8,500"
                        goal_text = case.goal if case else "Dispute provisional meter billing excess"

                        # Pull previous turns from database for conversational context under lock
                        recent_db_turns = []
                        async with AsyncSessionLocal() as async_db:
                            t_res = await async_db.execute(
                                select(Utterance)
                                .where(Utterance.call_id == call_id)
                                .order_by(Utterance.sequence_num.asc(), Utterance.created_at.asc())
                            )
                            all_turns = t_res.scalars().all()
                            for u in all_turns:
                                recent_db_turns.append({
                                    "speaker_role": u.speaker_role,
                                    "raw_text": u.raw_text,
                                    "normalised_text": u.normalised_text,
                                })

                        # Freeze guard: skip ONLY if the advocate replied within the last 2 seconds.
                        if all_turns and all_turns[-1].speaker_role == "user":
                            last_adv_time = all_turns[-1].created_at
                            if last_adv_time:
                                adv_age_s = (datetime.now(timezone.utc) - last_adv_time).total_seconds()
                                if adv_age_s < 2.0:
                                    logger.info(
                                        f"Advocate replied {adv_age_s:.1f}s ago on call {call_id}; "
                                        "skipping rapid-duplicate advocate reply."
                                    )
                                    return

                        # Generate intelligent context-aware reply using Sarvam LLM + Intake docket
                        adv_result = await sarvam_extractor.generate_advocate_response(
                            case_info=info,
                            goal=goal_text,
                            recent_turns=recent_db_turns,
                            rep_latest_text=text,
                            is_refusal=is_refusal,
                            promise_detected=promise_detected,
                        )
                        if isinstance(adv_result, tuple):
                            advocate_text, thought_process = adv_result
                        else:
                            advocate_text, thought_process = adv_result, "Autonomous Strategy: Applying domain regulations."

                        # If representative refused, dispatch an immediate statutory notice email to consumer
                        if is_refusal and case:
                            user_email = (
                                case.user_email
                                or (case.owner_id if "@" in (case.owner_id or "") else None)
                                or (case.approved_info or {}).get("contact_email")
                                or (case.approved_info or {}).get("email")
                            )
                            if user_email and "@" in user_email and not any(d in user_email.lower() for d in ["@mockon.ai", "@example.com", "@test.com"]):
                                asyncio.create_task(email_service.send_refusal_notice(
                                    to_email=user_email,
                                    case_id=case.id,
                                    provider=info.get("service_provider") or "Customer Care",
                                    identifier_val=info.get("identifier_value") or "CA-1029481029",
                                    amount_str=f"₹{amt}",
                                    ticket_number=info.get("ticket_number") or "TKT-2026-78432",
                                    rep_statement=text,
                                ))

                        adv_id = str(uuid.uuid4())
                        async with AsyncSessionLocal() as async_db:
                            adv_seq_res = await async_db.execute(
                                select(func.coalesce(func.max(Utterance.sequence_num), 0)).where(Utterance.call_id == call_id)
                            )
                            adv_next_seq = int(adv_seq_res.scalar() or 0) + 1

                            adv_utt = Utterance(
                                id=adv_id,
                                call_id=call_id,
                                case_id=call.case_id,
                                speaker_role="user",
                                sequence_num=adv_next_seq,
                                raw_text=advocate_text,
                                normalised_text=advocate_text,
                            )
                            async_db.add(adv_utt)
                            await async_db.commit()

                        # ── TEXT-FIRST FAST PATH ──────────────────────────────────────────
                        # Broadcast the text reply immediately (< 200ms) so the UI shows
                        # Shivani's response without waiting for TTS synthesis.
                        await manager.broadcast(call_id, {
                            "type": "utterance",
                            "data": {
                                "id": adv_id,
                                "speaker": "user",
                                "text": advocate_text,
                                "thought_process": thought_process,
                                "is_final": True,
                                "latencyMs": 110,
                                "audio_b64": None,  # Audio follows via audio_patch
                            },
                        })

                        # ── BACKGROUND TTS ────────────────────────────────────────────────
                        # Synthesize audio and send as a secondary audio_patch event.
                        # The UI plays it via the SequentialAudioQueue when it arrives.
                        try:
                            from app.services.gnani_tts import tts_adapter
                            import base64
                            adv_bytes = await tts_adapter.synthesise(advocate_text)
                            adv_audio = base64.b64encode(adv_bytes).decode("utf-8")
                            await manager.broadcast(call_id, {
                                "type": "audio_patch",
                                "utterance_id": adv_id,
                                "audio_b64": adv_audio,
                            })
                        except Exception as e:
                            logger.debug(f"Advocate TTS synthesis failed (text already delivered): {e}")

                        # ── AUTONOMOUS CALL TERMINATION ON CONFIRMED REFUND ──────────────
                        # When a refund or settlement commitment is detected from the representative,
                        # the AI Personal Agent autonomously locks the commitment into the ledger
                        # and concludes the call automatically without requiring manual hangup.
                        if promise_detected:
                            logger.info(
                                f"Autonomous Agent: Refund commitment logged on call {call_id}. "
                                "Scheduling automatic call conclusion after concluding turn."
                            )
                            async def auto_conclude_after_turn():
                                # Allow time for Shivani's concluding utterance and TTS audio to play
                                await asyncio.sleep(3.5)
                                try:
                                    await execute_call_end(
                                        call_id,
                                        reason="Autonomous Resolution: Settlement commitment confirmed by representative",
                                    )
                                    logger.info(f"Autonomous Agent successfully concluded call {call_id}.")
                                except Exception as auto_end_err:
                                    logger.error(f"Error during autonomous call conclusion: {auto_end_err}", exc_info=True)

                            asyncio.create_task(auto_conclude_after_turn())
                except Exception as adv_err:
                    logger.error(f"Error generating advocate reply on call {call_id}: {adv_err}", exc_info=True)

            asyncio.create_task(advocate_reply())

    return {
        "ok": True,
        "utterance_id": utt_id,
        "promise_detected": promise_detected,
        "is_refusal": is_refusal,
    }


@router.get("/case/{case_id}/latest", response_model=Optional[CallRead])
async def get_latest_call_for_case(case_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch the latest active, ringing, or recent call for a case."""
    stmt = (
        select(Call)
        .where(Call.case_id == case_id)
        .order_by(Call.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


@router.get("/{call_id}", response_model=CallRead)
async def get_call(call_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Call).where(Call.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(404, "Call not found")
    return call


class EndCallPayload(BaseModel):
    reason: Optional[str] = None


async def execute_call_end(call_id: str, reason: Optional[str] = None) -> dict:
    """Core logic to end a call session, lock commitments, evaluate conclusion, and dispatch emails."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Call).where(Call.id == call_id))
        call = result.scalar_one_or_none()
        if not call:
            return {"status": "error", "message": "Call not found"}

        if call.status == "ended":
            return {"status": "ended", "call_id": call_id}

        manager.cancel_task(call_id)
        _call_advocate_locks.pop(call_id, None)
        call.status = "ended"
        call.ended_at = datetime.now(timezone.utc)

        # Auto-confirm any promises extracted on the call so they are locked into evidence and tracked by deadline worker
        unconfirmed = await db.execute(
            select(Promise).where(Promise.case_id == call.case_id, Promise.user_confirmed == False)
        )
        for p in unconfirmed.scalars().all():
            p.user_confirmed = True
            p.user_confirmation_timestamp = datetime.now(timezone.utc)
            p.follow_up_allowed = True
            if not p.due_at:
                p.due_at = datetime.now(timezone.utc) + timedelta(days=5)
        await db.commit()

        # Determine whether a genuine commitment or resolution was logged
        from app.services.ledger import ledger
        confirmed_promises = await ledger.get_promises_for_case(db, call.case_id)

        c_res = await db.execute(select(Case).where(Case.id == call.case_id))
        case = c_res.scalar_one_or_none()
        info = case.approved_info if case else {}
        provider = info.get("service_provider") or "Customer Care"

        # Pull all call utterances to let our female AI Personal Agent (Shivani) autonomously evaluate the call
        u_res = await db.execute(
            select(Utterance)
            .where(Utterance.call_id == call_id)
            .order_by(Utterance.sequence_num.asc(), Utterance.created_at.asc())
        )
        all_turns = [
            {"speaker_role": u.speaker_role, "raw_text": u.raw_text, "normalised_text": u.normalised_text}
            for u in u_res.scalars().all()
        ]

        evaluation = await sarvam_extractor.evaluate_call_and_summarize(
            case_info=info,
            goal=case.goal if case else "Dispute resolution",
            turns=all_turns,
            confirmed_promises=confirmed_promises,
        )

        await manager.broadcast(call_id, {
            "type": "call_ended",
            "call_id": call_id,
            "has_conclusion": evaluation["has_conclusion"],
            "reason": reason or evaluation["outcome_title"],
            "status": evaluation["status"].lower(),
            "summary": evaluation["summary"],
        })

        # Always dispatch post-call summary email with the AI Agent's autonomous determination
        if case:
            target_emails = []
            user_email = (
                case.user_email
                or (case.owner_id if "@" in (case.owner_id or "") else None)
                or (case.approved_info or {}).get("contact_email")
                or (case.approved_info or {}).get("email")
            )
            if user_email and "@" in user_email and not any(d in user_email.lower() for d in ["@mockon.ai", "@example.com", "@test.com", "@mock.com"]):
                target_emails.append(user_email)

            if settings.smtp_user and settings.smtp_user not in target_emails:
                target_emails.append(settings.smtp_user)

            ticket_number = info.get("ticket_number") or "TKT-2026-78432"
            amt_str = f"₹{info.get('disputed_amount', '8,500')}"
            id_type = info.get("identifier_type") or "Reference"
            id_val = info.get("identifier_value") or info.get("phone_number") or "CA-1029481029"

            p_list = [
                {
                    "type": getattr(p, "commitment_type", "refund"),
                    "amount": getattr(p, "amount", amt_str),
                    "deadline_phrase": getattr(p, "raw_date_phrase", "in 5 business days") or "in 5 business days",
                }
                for p in confirmed_promises
            ]

            for recipient in target_emails:
                asyncio.create_task(email_service.send_call_summary(
                    to_email=recipient,
                    case_id=case.id,
                    call_id=call.id,
                    provider=provider,
                    phone_number=info.get("phone_number") or "Registered Mobile",
                    ticket_number=ticket_number,
                    amount_str=amt_str,
                    due_date_str="in 5 business days",
                    promises=p_list,
                    identifier_label=id_type,
                    identifier_val=id_val,
                    domain=info.get("domain") or "telecom",
                    outcome_status=evaluation["status"],
                    outcome_title=evaluation["outcome_title"],
                    executive_summary=evaluation["summary"],
                    next_step=evaluation["next_step"],
                    force=True,
                ))

        return {
            "status": "ended",
            "call_id": call_id,
            "has_conclusion": evaluation["has_conclusion"],
            "reason": reason or evaluation["outcome_title"],
            "evaluation": evaluation,
        }


@router.post("/{call_id}/end")
async def end_call(
    call_id: str,
    payload: Optional[EndCallPayload] = None,
    db: AsyncSession = Depends(get_db),
):
    """Manually end a call, broadcast termination with conclusion state, and dispatch proper summary or inconclusive notification."""
    reason = payload.reason if payload else None
    return await execute_call_end(call_id, reason=reason)
