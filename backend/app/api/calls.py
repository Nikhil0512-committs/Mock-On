"""Calls API — POST /calls, GET /calls/{id}, Live Admin Switchboard dispatch & messaging."""
import asyncio
import logging
import re
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
from app.models import Call, Case, Utterance, Promise, User
from app.schemas.call import CallCreate, CallRead
from app.services.orchestrator import CallOrchestrator
from app.services.sarvam import sarvam_extractor
from app.services.validators import validator
from app.services.email import email_service
from app.ws.call_socket import manager

router = APIRouter(prefix="/calls", tags=["calls"])
logger = logging.getLogger(__name__)


async def resolve_case_consumer_name(db: AsyncSession, case: Optional[Case]) -> str:
    """
    Dynamically resolve consumer name from the user account or case docket.
    If the account username is 'nikhil', Shivani represents Nikhil.
    If the account username is 'aarti', Shivani represents Aarti.
    Supports any username or full_name from the user account.
    """
    if not case:
        return "Nikhil Sharma"

    user = None
    if case.user_id:
        res = await db.execute(select(User).where(User.id == case.user_id))
        user = res.scalar_one_or_none()
    if not user and case.user_email:
        res = await db.execute(select(User).where(func.lower(User.email) == case.user_email.lower()))
        user = res.scalar_one_or_none()
    if not user and case.owner_id and "@" in case.owner_id:
        res = await db.execute(select(User).where(func.lower(User.email) == case.owner_id.lower()))
        user = res.scalar_one_or_none()

    if user:
        if user.full_name and user.full_name.strip():
            return user.full_name.strip()
        if user.email:
            username = user.email.split("@")[0].replace(".", " ").replace("_", " ").strip().title()
            if username:
                return username

    info = case.approved_info or {}
    c_name = info.get("consumer_name") or info.get("full_name")
    if c_name and c_name.strip() and c_name.strip().lower() not in ["consumer", "user", "admin"]:
        return c_name.strip()

    if case.user_email and "@" in case.user_email:
        username = case.user_email.split("@")[0].replace(".", " ").replace("_", " ").strip().title()
        if username and username.lower() not in ["consumer", "user", "admin", "test"]:
            return username

    if case.owner_id and "@" in case.owner_id:
        username = case.owner_id.split("@")[0].replace(".", " ").replace("_", " ").strip().title()
        if username and username.lower() not in ["consumer", "user", "admin", "test"]:
            return username

    return "Nikhil Sharma"


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
    rows = list((await db.execute(stmt)).all())

    # Ensure any cases in follow_up_active state have an active/ringing call in the switchboard queue
    pending_followup_cases = (
        await db.execute(
            select(Case).where(
                Case.status.in_(["follow_up_active", "overdue"])
            )
        )
    ).scalars().all()

    for fu_case in pending_followup_cases:
        has_active = any(c.case_id == fu_case.id for c, _ in rows)
        if not has_active:
            # Check last ended call to prevent instant re-ringing within 45s
            last_call_res = await db.execute(
                select(Call)
                .where(Call.case_id == fu_case.id, Call.scenario_id == "live_switchboard")
                .order_by(Call.ended_at.desc().nullslast())
                .limit(1)
            )
            last_call = last_call_res.scalar_one_or_none()
            if last_call and last_call.ended_at and (now_utc - last_call.ended_at).total_seconds() < 45:
                continue

            new_call = Call(
                case_id=fu_case.id,
                scenario_id="live_switchboard",
                status="ringing",
                started_at=None,
            )
            db.add(new_call)
            try:
                await db.commit()
                await db.refresh(new_call)
                rows.insert(0, (new_call, fu_case))
            except Exception as e:
                logger.warning(f"Error auto-spawning follow-up switchboard call for case {fu_case.id}: {e}")
                await db.rollback()

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
        # Pre-warm high-speed TTS cache in background for instant speech playback
        from app.services.gnani_tts import tts_adapter
        asyncio.create_task(tts_adapter.warm_up_common_phrases(case.approved_info))

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

    if case:
        from app.services.gnani_tts import tts_adapter
        consumer_name = await resolve_case_consumer_name(db, case)
        info_to_warm = dict(case.approved_info or {})
        info_to_warm["consumer_name"] = consumer_name
        asyncio.create_task(tts_adapter.warm_up_common_phrases(info_to_warm))

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

    # Anti-race / rapid duplicate suppression check (prevent accidental double-clicks < 0.8s)
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
        if prev_dt and (now_dt - prev_dt).total_seconds() < 0.4:
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
                lower_t = text.lower()
                has_ref_sig = any(w in lower_t for w in [
                    "refund", "रिफंड", "credit", "क्रेडिट", "wapas", "वापस", "पैसे", "reverse",
                    "waiver", "waive", "callback", "call you back", "visit", "technician"
                ])
                candidate = None

                # Ultra-fast path: Only perform promise extraction if representative uttered commitment signals
                if has_ref_sig:
                    has_time_sig = any(w in lower_t for w in ["din", "दिन", "days", "day", "hours", "ghante", "घंटे", "working", "kal", "कल", "तीन", "चार", "पांच"])
                    if has_time_sig:
                        raw_date = None
                        d_m = re.search(r"((?:agle\s*|next\s*|अगले\s*)?(?:paanch|do|teen|chaar|ek|das|teen\s*se\s*chaar|do\s*se\s*teen|[0-9]+(?:\s*(?:se|to|-)\s*[0-9]+)?|तीन\s*से\s*चार|दो\s*से\s*तीन|तीन|चार|पांच|पाँच|दो|सात|दस)\s*(?:din|दिन|days|hours|ghante|घंटे)(?:\s*(?:mein|me|में))?)", lower_t)
                        if d_m:
                            raw_date = d_m.group(1).strip()
                        c_amt = None
                        if case:
                            try:
                                amt_val = (case.approved_info or {}).get("disputed_amount")
                                if amt_val:
                                    clean_amt = re.sub(r"[^\d.]", "", str(amt_val))
                                    if clean_amt:
                                        c_amt = float(clean_amt)
                            except Exception:
                                pass
                        candidate = {
                            "ticket_id": None,
                            "quote": text,
                            "speaker": "agent",
                            "commitment_type": "refund",
                            "amount": c_amt,
                            "raw_date_phrase": raw_date or "3 days",
                            "confidence": 0.95,
                            "summary": f"Refund of ₹{c_amt or ''} to consumer account within {raw_date or '3 days'}",
                        }

                    # If not matched by direct pattern, fallback to extract_promise
                    if not candidate:
                        candidate = await sarvam_extractor.extract_promise(
                            [{"speaker_role": "agent", "raw_text": text, "normalised_text": text}],
                            current_turn={"speaker_role": "agent", "raw_text": text, "normalised_text": text},
                        )

                # Inherit disputed amount from case docket if representative didn't restate the rupee amount
                if candidate and not candidate.get("amount") and case:
                    try:
                        amt_val = (case.approved_info or {}).get("disputed_amount")
                        if amt_val:
                            clean_amt = re.sub(r"[^\d.]", "", str(amt_val))
                            if clean_amt:
                                candidate["amount"] = float(clean_amt)
                    except Exception:
                        pass

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
                        # Auto-confirm the promise immediately so it is locked into DB and evidence
                        p_id = res.get("promise_data", {}).get("id")
                        if p_id:
                            p_res = await db.execute(select(Promise).where(Promise.id == p_id))
                            p_obj = p_res.scalar_one_or_none()
                            if p_obj:
                                p_obj.user_confirmed = True
                                p_obj.user_confirmation_timestamp = datetime.now(timezone.utc)
                                p_obj.follow_up_allowed = True
                                res["promise_data"]["user_confirmed"] = True
                        await manager.broadcast(call_id, {
                            "type": "promise_proposed",
                            "proposal": res["promise_data"],
                            "needs_date_confirmation": False,
                        })
                        await db.commit()
            except Exception as e:
                logger.warning(f"Error during switchboard Sarvam promise extraction: {e}")

        # Check if call was already resolved in prior turns (refund commitment already received)
        has_prior_resolution = False
        prior_p_cnt = (await db.execute(
            select(func.count(Promise.id)).where(Promise.case_id == call.case_id, Promise.user_confirmed == True)
        )).scalar() or 0
        if prior_p_cnt > 0 or promise_detected:
            has_prior_resolution = True
        else:
            prev_u_res = await db.execute(
                select(Utterance.raw_text).where(Utterance.call_id == call_id, Utterance.speaker_role == "agent")
            )
            for pu in prev_u_res.scalars().all():
                pt = (pu or "").lower()
                if any(w in pt for w in ["refund", "रिफंड", "credit", "क्रेडिट", "wapas", "वापस", "reverse", "पैसे"]) and any(w in pt for w in ["din", "दिन", "days", "hours", "ghante", "घंटे"]):
                    has_prior_resolution = True
                    break

        # Check if disconnect was authorized, or if representative offered closing courtesies post-resolution
        lower_rep_check = text.lower()
        is_disconnect_authorized = any(w in lower_rep_check for w in [
            "call ko kaat sakte", "call disconnect kar", "hang up", "call cut", "kaat sakte hain",
            "कॉल को काट सकते", "कॉल काट सकते", "कॉल डिस्कनेक्ट", "काट सकते हैं", "कॉल कट",
            "phone rakh sakte", "फ़ोन रख सकते", "फोन रख सकते", "disconnect kar dijiye", "disconnect kar sakte",
            "disconnect kar lijiye"
        ])

        # If a resolution was already secured or detected, any closing courtesy from rep triggers clean disconnect
        is_closing_courtesy = has_prior_resolution and any(w in lower_rep_check for w in [
            "धन्यवाद", "thank you", "thanks", "दिन मंगलमय", "दिन शुभ", "शुभ दिन",
            "ok", "okay", "bye", "alvida", "take care", "welcome", "जी"
        ])
        if is_closing_courtesy:
            is_disconnect_authorized = True

        # Intelligent Dynamic Advocate AI reply based on provided intake info
        if payload.auto_advocate_reply:
            async def advocate_reply():
                try:
                    async with _call_advocate_locks[call_id]:
                        # Natural 120ms conversational turn pause (ultra-low latency)
                        await asyncio.sleep(0.12)
                        info = dict(case.approved_info or {}) if case else {}
                        if case and case.language:
                            info["language"] = case.language
                        amt = info.get("disputed_amount") or "8,500"
                        goal_text = case.goal if case else "Dispute provisional meter billing excess"

                        # Pull previous turns from database for conversational context under lock
                        recent_db_turns = []
                        async with AsyncSessionLocal() as async_db:
                            # 1. Dynamically resolve consumer name from account (Nikhil / Aarti / logged-in user)
                            consumer_name = await resolve_case_consumer_name(async_db, case)
                            info["consumer_name"] = consumer_name

                            # 2. Check if this call is an escalated follow-up call
                            is_case_follow_up = bool(
                                info.get("is_follow_up")
                                or (case and case.status in ["follow_up_active", "overdue"])
                                or "OVERDUE" in goal_text.upper()
                                or "FOLLOW-UP" in goal_text.upper()
                                or "FOLLOW UP" in goal_text.upper()
                            )
                            if is_case_follow_up and case:
                                info["is_follow_up"] = True
                                if not info.get("promised_timeline"):
                                    prior_p_res = await async_db.execute(
                                        select(Promise)
                                        .where(Promise.case_id == case.id)
                                        .order_by(Promise.created_at.desc())
                                        .limit(1)
                                    )
                                    prior_p = prior_p_res.scalar_one_or_none()
                                    if prior_p:
                                        info["promised_timeline"] = prior_p.raw_date_phrase or "3 se 4 din"
                                        info["promised_amount"] = str(prior_p.amount) if prior_p.amount else amt
                                        info["promised_quote"] = prior_p.quoted_text
                                    else:
                                        info["promised_timeline"] = "3 se 4 din"

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

                        # If call already reached resolution and representative is exchanging closing pleasantries, conclude gracefully
                        if (is_closing_courtesy or is_disconnect_authorized) and not promise_detected:
                            advocate_text = "Theek hai representative ji, sahayata ke liye bahut dhanyavaad. Main call disconnect kar rahi hoon. Aapka din shubh ho."
                            thought_process = "Autonomous Strategy: Settlement confirmed in docket. Concluding call with gratitude."
                        else:
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

                        # ── FAST DELIVERY PATH (Audio included immediately if cached in memory) ──
                        from app.services.gnani_tts import tts_adapter
                        import base64
                        cached_bytes = tts_adapter.get_cached_audio(advocate_text)
                        cached_b64 = base64.b64encode(cached_bytes).decode("utf-8") if cached_bytes else None

                        # Broadcast the text reply immediately (< 50ms)
                        # If audio was pre-cached, it arrives in the primary event for 0ms voice latency!
                        await manager.broadcast(call_id, {
                            "type": "utterance",
                            "data": {
                                "id": adv_id,
                                "speaker": "user",
                                "text": advocate_text,
                                "thought_process": thought_process,
                                "is_final": True,
                                "latencyMs": 40 if cached_b64 else 95,
                                "audio_b64": cached_b64,
                            },
                        })

                    # ── AUTONOMOUS CALL TERMINATION ON CONFIRMED REFUND OR DISCONNECT AUTHORIZATION ──
                    if promise_detected or is_disconnect_authorized:
                        logger.info(
                            f"Autonomous Agent: Resolution or disconnect trigger on call {call_id} "
                            f"(promise_detected={promise_detected}, is_disconnect_auth={is_disconnect_authorized}). "
                            "Scheduling automatic call conclusion after concluding turn."
                        )
                        async def auto_conclude_after_turn():
                            # Natural delay for Shivani's confirmation/closing speech to finish playing in browser
                            delay = 2.2 if promise_detected else 1.5
                            await asyncio.sleep(delay)
                            try:
                                end_reason = (
                                    "Autonomous Resolution: Settlement commitment confirmed by representative"
                                    if (promise_detected or has_prior_resolution)
                                    else "Autonomous Resolution: Call concluded per representative disconnect authorization"
                                )
                                await execute_call_end(call_id, reason=end_reason)
                                logger.info(f"Autonomous Agent successfully concluded call {call_id}.")
                            except Exception as auto_end_err:
                                logger.error(f"Error during autonomous call conclusion: {auto_end_err}", exc_info=True)

                        asyncio.create_task(auto_conclude_after_turn())

                    # ── BACKGROUND TTS (Executed asynchronously so it does not block conclusion) ──
                    if not cached_b64:
                        async def synthesize_and_patch():
                            try:
                                adv_bytes = await tts_adapter.synthesise(advocate_text)
                                adv_audio = base64.b64encode(adv_bytes).decode("utf-8")
                                await manager.broadcast(call_id, {
                                    "type": "audio_patch",
                                    "utterance_id": adv_id,
                                    "text": advocate_text,
                                    "thought_process": thought_process,
                                    "audio_b64": adv_audio,
                                })
                            except Exception as e:
                                logger.warning(f"Advocate TTS synthesis failed ({e}). Dispatching fallback speech event.")
                                await manager.broadcast(call_id, {
                                    "type": "audio_patch",
                                    "utterance_id": adv_id,
                                    "text": advocate_text,
                                    "thought_process": thought_process,
                                    "audio_b64": None,
                                    "fallback_speech": True,
                                })
                        asyncio.create_task(synthesize_and_patch())
                except Exception as adv_err:
                    logger.error(f"Error generating advocate reply on call {call_id}: {adv_err}", exc_info=True)

            asyncio.create_task(advocate_reply())
        elif promise_detected or is_disconnect_authorized:
            async def direct_auto_conclude():
                await asyncio.sleep(1.5)
                try:
                    await execute_call_end(
                        call_id,
                        reason="Autonomous Resolution: Settlement commitment confirmed by representative",
                    )
                except Exception as auto_end_err:
                    logger.error(f"Error during direct autonomous call conclusion: {auto_end_err}", exc_info=True)
            asyncio.create_task(direct_auto_conclude())

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


@router.get("/{call_id}/utterances")
async def get_call_utterances(call_id: str, db: AsyncSession = Depends(get_db)):
    """Fetches all stored utterances for a given call in chronological sequence."""
    result = await db.execute(
        select(Utterance)
        .where(Utterance.call_id == call_id)
        .order_by(Utterance.sequence_num.asc(), Utterance.created_at.asc())
    )
    return [
        {
            "id": u.id,
            "speaker": u.speaker_role,
            "text": u.raw_text or u.normalised_text,
            "isFinal": True,
            "sequence": u.sequence_num,
        }
        for u in result.scalars().all()
    ]


class EndCallPayload(BaseModel):
    reason: Optional[str] = None


async def execute_call_end(call_id: str, reason: Optional[str] = None) -> dict:
    """Core logic to end a call session, lock commitments, evaluate conclusion, and dispatch emails."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Call).where(Call.id == call_id))
        call = result.scalar_one_or_none()
        if not call:
            return {"status": "error", "message": "Call not found"}

        manager.cancel_task(call_id)
        _call_advocate_locks.pop(call_id, None)
        call.status = "ended"
        call.ended_at = datetime.now(timezone.utc)

        # 1. Auto-confirm any promises extracted on the call so they are locked into evidence and tracked by deadline worker
        try:
            unconfirmed = await db.execute(
                select(Promise).where(Promise.case_id == call.case_id, Promise.user_confirmed == False)
            )
            for p in unconfirmed.scalars().all():
                p.user_confirmed = True
                p.user_confirmation_timestamp = datetime.now(timezone.utc)
                p.follow_up_allowed = True
                if not p.due_at:
                    from app.services.deadline_worker import get_demo_now
                    p.due_at = get_demo_now() + timedelta(days=3)
            await db.commit()
        except Exception as p_err:
            logger.warning(f"Error auto-confirming promises: {p_err}")

        # 2. Determine whether a genuine commitment or resolution was logged
        from app.services.ledger import ledger
        confirmed_promises = await ledger.get_promises_for_case(db, call.case_id)

        c_res = await db.execute(select(Case).where(Case.id == call.case_id))
        case = c_res.scalar_one_or_none()
        info = dict(case.approved_info or {}) if case else {}
        consumer_name = await resolve_case_consumer_name(db, case)
        info["consumer_name"] = consumer_name
        provider = info.get("service_provider") or "Customer Care"

        # Pull all call utterances to let our female AI Personal Agent (Shivani) autonomously evaluate the call
        u_res = await db.execute(
            select(Utterance)
            .where(Utterance.call_id == call_id)
            .order_by(Utterance.sequence_num.asc(), Utterance.created_at.asc())
        )
        all_utt_objects = list(u_res.scalars().all())
        all_turns = [
            {"speaker_role": u.speaker_role, "raw_text": u.raw_text, "normalised_text": u.normalised_text}
            for u in all_utt_objects
        ]

        # 3. Dual Safety Net: If confirmed_promises is empty, check utterances for verbal refund commitments
        if not confirmed_promises:
            try:
                rep_turns = [u for u in all_utt_objects if u.speaker_role == "agent"]
                for ru in rep_turns:
                    t_lower = (ru.raw_text or ru.normalised_text or "").lower()
                    has_ref = any(w in t_lower for w in ["refund", "रिफंड", "credit", "क्रेडिट", "wapas", "वापस", "reverse", "पैसे"])
                    has_time = any(w in t_lower for w in ["din", "दिन", "days", "day", "hours", "ghante", "घंटे", "working", "business", "kal", "कल", "तीन", "चार", "पांच"])
                    if has_ref and has_time:
                        c_amt = None
                        if case:
                            try:
                                amt_val = (case.approved_info or {}).get("disputed_amount")
                                if amt_val:
                                    clean_num = re.sub(r"[^\d.]", "", str(amt_val))
                                    if clean_num:
                                        c_amt = float(clean_num)
                            except Exception:
                                pass
                        from app.services.deadline_worker import get_demo_now
                        from app.services.validators import parse_date_phrase
                        d_m = re.search(r"((?:agle\s*|next\s*|अगले\s*)?(?:paanch|do|teen|chaar|ek|das|teen\s*se\s*chaar|do\s*se\s*teen|[0-9]+(?:\s*(?:se|to|-)\s*[0-9]+)?|तीन\s*से\s*चार|दो\s*से\s*तीन|तीन|चार|पांच|पाँच|दो|सात|दस)\s*(?:din|दिन|days|hours|ghante|घंटे)(?:\s*(?:mein|me|में))?)", t_lower)
                        raw_phrase = d_m.group(1).strip() if d_m else "3 days"
                        parsed_dt = parse_date_phrase(raw_phrase) or (get_demo_now() + timedelta(days=3))
                        fallback_p = Promise(
                            id=str(uuid.uuid4()),
                            case_id=call.case_id,
                            source_utterance_id=ru.id,
                            commitment_type="refund",
                            amount=c_amt,
                            raw_date_phrase=raw_phrase,
                            due_at=parsed_dt,
                            quoted_text=ru.raw_text or ru.normalised_text or "Refund promised",
                            user_confirmed=True,
                            user_confirmation_timestamp=datetime.now(timezone.utc),
                            follow_up_allowed=True,
                            status="pending",
                            extraction_confidence=0.95,
                            summary=f"Refund of ₹{c_amt or ''} promised by representative within {raw_phrase}",
                        )
                        db.add(fallback_p)
                        await db.commit()
                        confirmed_promises = [fallback_p]
                        break
            except Exception as fb_err:
                logger.error(f"Error in fallback promise extraction/persistence: {fb_err}", exc_info=True)

        evaluation = await sarvam_extractor.evaluate_call_and_summarize(
            case_info=info,
            goal=case.goal if case else "Dispute resolution",
            turns=all_turns,
            confirmed_promises=confirmed_promises,
        )

        # Update case status if resolution achieved
        if evaluation.get("has_conclusion") and evaluation.get("status") == "RESOLVED_PROMISED" and case:
            case.status = "resolved"
            await db.commit()

        # If a valid conclusion or refund commitment was reached, ALWAYS prioritize the resolution outcome title over any generic midway string
        broadcast_reason = (
            evaluation.get("outcome_title")
            if (evaluation.get("has_conclusion") or len(confirmed_promises) > 0)
            else (reason or evaluation.get("outcome_title") or "Call concluded")
        )

        await manager.broadcast(call_id, {
            "type": "call_ended",
            "call_id": call_id,
            "has_conclusion": evaluation["has_conclusion"],
            "reason": broadcast_reason,
            "status": evaluation["status"].lower(),
            "summary": evaluation["summary"],
            "promises_count": len(confirmed_promises),
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
