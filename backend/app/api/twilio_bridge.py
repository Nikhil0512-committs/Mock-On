"""
Twilio TwiML <Connect><Stream> Bridge for Live Phone Calls.
Bridges Twilio Media Streams (8 kHz mulaw) <-> Gnani Prisma STT (8 kHz PCM) & Gnani Timbre TTS.
Fully synchronized with Neon DB, Call / Utterance models, and WebSocket live transcript.
"""
import asyncio
import audioop
import base64
import json
import logging
import os
import re
import uuid
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Request, Response, Depends
from pydantic import BaseModel
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings, get_settings
from app.database import get_db, AsyncSessionLocal
from app.models import Call, Case, Utterance, Promise
from app.services.gnani_stt import PrismaSTTAdapter
from app.services.gnani_tts import tts_adapter
from app.services.sarvam import sarvam_extractor
from app.services.validators import validator
from app.ws.call_socket import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/twilio", tags=["twilio"])


def _get_twilio_creds():
    sid = os.environ.get("TWILIO_ACCOUNT_SID") or getattr(settings, "twilio_account_sid", "")
    token = os.environ.get("TWILIO_AUTH_TOKEN") or getattr(settings, "twilio_auth_token", "")
    from_num = os.environ.get("TWILIO_PHONE_NUMBER") or getattr(settings, "twilio_phone_number", "")
    pub_url = os.environ.get("TWILIO_PUBLIC_URL") or getattr(settings, "twilio_public_url", "")
    return sid.strip(), token.strip(), from_num.strip(), pub_url.strip()


class OutboundCallRequest(BaseModel):
    to_phone: str  # Teammate's verified number e.g. "+919876543210"
    case_id: str
    public_url: Optional[str] = None  # Optional ngrok URL override


class TwilioConfigPayload(BaseModel):
    account_sid: str
    auth_token: str
    phone_number: str
    public_url: Optional[str] = None


@router.get("/status")
async def get_twilio_status():
    """Returns current Twilio configuration state."""
    sid, token, from_num, pub_url = _get_twilio_creds()

    return {
        "configured": bool(sid and token and from_num),
        "account_sid_masked": f"{sid[:6]}...{sid[-4:]}" if len(sid) > 10 else ("Configured" if sid else "Not set"),
        "phone_number": from_num or "Not set",
        "public_url": pub_url or "Auto-detect from request",
    }


@router.post("/config")
async def update_twilio_config(payload: TwilioConfigPayload):
    """Dynamically set/update Twilio credentials and persist them."""
    os.environ["TWILIO_ACCOUNT_SID"] = payload.account_sid.strip()
    os.environ["TWILIO_AUTH_TOKEN"] = payload.auth_token.strip()
    os.environ["TWILIO_PHONE_NUMBER"] = payload.phone_number.strip()
    if payload.public_url:
        os.environ["TWILIO_PUBLIC_URL"] = payload.public_url.strip().rstrip("/")

    settings.twilio_account_sid = os.environ["TWILIO_ACCOUNT_SID"]
    settings.twilio_auth_token = os.environ["TWILIO_AUTH_TOKEN"]
    settings.twilio_phone_number = os.environ["TWILIO_PHONE_NUMBER"]
    settings.twilio_public_url = os.environ.get("TWILIO_PUBLIC_URL", "")

    # Try updating backend/.env
    try:
        from pathlib import Path
        env_path = Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            content = env_path.read_text(encoding="utf-8")
            updates = {
                "TWILIO_ACCOUNT_SID": settings.twilio_account_sid,
                "TWILIO_AUTH_TOKEN": settings.twilio_auth_token,
                "TWILIO_PHONE_NUMBER": settings.twilio_phone_number,
                "TWILIO_PUBLIC_URL": settings.twilio_public_url,
            }
            lines = content.splitlines()
            for key, val in updates.items():
                found = False
                for i, line in enumerate(lines):
                    if line.startswith(f"{key}="):
                        lines[i] = f"{key}={val}"
                        found = True
                        break
                if not found:
                    lines.append(f"{key}={val}")
            env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except Exception as e:
        logger.warning(f"Could not persist Twilio config to .env: {e}")

    return {
        "ok": True,
        "configured": bool(settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_phone_number),
    }


@router.post("/voice")
async def twilio_voice_webhook(request: Request):
    """
    TwiML Webhook called by Twilio when the outbound or inbound call connects.
    Returns TwiML with <Connect><Stream> pointing to our FastAPI WebSocket.
    """
    form = await request.form()
    call_id = request.query_params.get("call_id") or form.get("call_id") or "default_call"
    case_id = request.query_params.get("case_id") or form.get("case_id") or "default_case"

    # Derive public host
    configured_pub = getattr(settings, "twilio_public_url", "")
    if configured_pub:
        # e.g. https://abc.ngrok-free.app -> abc.ngrok-free.app
        host_header = configured_pub.replace("https://", "").replace("http://", "")
        proto = "wss" if configured_pub.startswith("https") else "ws"
    else:
        host_header = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost:8000"
        proto = "wss" if "ngrok" in host_header or request.headers.get("x-forwarded-proto") == "https" else "ws"

    stream_url = f"{proto}://{host_header}/twilio/stream/{call_id}"

    twiml_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{stream_url}">
            <Parameter name="case_id" value="{case_id}" />
            <Parameter name="call_id" value="{call_id}" />
        </Stream>
    </Connect>
</Response>
"""
    return Response(content=twiml_xml.strip(), media_type="application/xml")


@router.websocket("/stream/{call_id}")
async def twilio_stream_websocket(websocket: WebSocket, call_id: str):
    """
    Twilio Media Stream WebSocket.
    - Receives Twilio audio frames: base64-encoded mulaw @ 8,000 Hz.
    - Converts mulaw -> 16-bit linear PCM @ 8,000 Hz.
    - Streams to Gnani Prisma STT.
    - Saves utterances into DB & broadcasts in real-time to the frontend.
    - Extracts promises via Sarvam AI.
    - Synthesizes responses via Gnani Timbre TTS in mulaw 8kHz back to caller.
    """
    await websocket.accept()
    logger.info(f"Twilio Media Stream connected for call {call_id}")

    stream_sid: Optional[str] = None
    call_sid: Optional[str] = None
    case_id: Optional[str] = None
    seq_counter = 0

    # Retrieve case_id from DB for this call
    try:
        async with AsyncSessionLocal() as db:
            c_res = await db.execute(select(Call).where(Call.id == call_id))
            call_obj = c_res.scalar_one_or_none()
            if call_obj:
                case_id = call_obj.case_id
    except Exception as e:
        logger.warning(f"Could not load call {call_id} from DB: {e}")

    audio_queue: asyncio.Queue[bytes] = asyncio.Queue()

    async def pcm_audio_generator():
        while True:
            chunk = await audio_queue.get()
            if chunk is None:
                break
            yield chunk

    stt_adapter = PrismaSTTAdapter()

    async def run_stt_pipeline():
        nonlocal seq_counter
        try:
            async for transcript in stt_adapter.stream(pcm_audio_generator()):
                text = transcript.get("text", "").strip()
                is_final = transcript.get("is_final", False)
                if not text:
                    continue

                seq_counter += 1
                logger.info(f"[Twilio Prisma STT] seq={seq_counter} final={is_final}: {text}")

                # 1. Broadcast utterance to web UI
                await manager.broadcast(
                    call_id,
                    {
                        "type": "utterance",
                        "data": {
                            "id": str(uuid.uuid4()),
                            "speaker": "agent",  # Person on the other end of the line
                            "text": text,
                            "is_final": is_final,
                            "latencyMs": transcript.get("latency_ms", 120),
                        },
                    },
                )

                # 2. Persist to DB on final
                if is_final and case_id:
                    try:
                        async with AsyncSessionLocal() as db:
                            utt = Utterance(
                                id=str(uuid.uuid4()),
                                call_id=call_id,
                                case_id=case_id,
                                speaker_role="agent",
                                speaker_confidence=0.95,
                                sequence_num=seq_counter,
                                raw_text=text,
                                normalised_text=text,
                            )
                            db.add(utt)
                            await db.commit()

                            # 3. Analyze for promises via Sarvam LLM
                            candidate = await sarvam_extractor.extract_promise(
                                [{"speaker_role": "agent", "raw_text": text}],
                                current_turn={"speaker_role": "agent", "raw_text": text},
                            )
                            if candidate and candidate.get("summary"):
                                p_id = str(uuid.uuid4())
                                proposed_promise = Promise(
                                    id=p_id,
                                    case_id=case_id,
                                    source_utterance_id=utt.id,
                                    commitment_type=candidate.get("commitment_type", "refund"),
                                    summary=candidate.get("summary"),
                                    quoted_text=candidate.get("quote", text),
                                    amount=candidate.get("amount", 1000.0),
                                    currency="INR",
                                    raw_date_phrase=candidate.get("raw_date_phrase", "5 working days"),
                                    status="pending",
                                    user_confirmed=False,
                                )
                                db.add(proposed_promise)
                                await db.commit()

                                # Broadcast proposed promise to frontend
                                await manager.broadcast(
                                    call_id,
                                    {
                                        "type": "promise_proposed",
                                        "data": {
                                            "promise_data": {
                                                "id": p_id,
                                                "commitment_type": proposed_promise.commitment_type,
                                                "amount": proposed_promise.amount,
                                                "quoted_text": proposed_promise.quoted_text,
                                                "raw_date_phrase": proposed_promise.raw_date_phrase,
                                            },
                                            "needs_date_confirmation": False,
                                        },
                                    },
                                )
                    except Exception as err:
                        logger.error(f"Error persisting Twilio utterance: {err}")

        except Exception as e:
            logger.warning(f"Twilio STT pipeline ended: {e}")

    stt_task = asyncio.create_task(run_stt_pipeline())

    try:
        while True:
            raw_msg = await websocket.receive_text()
            data = json.loads(raw_msg)
            event = data.get("event")

            if event == "connected":
                logger.info("Twilio Stream handshake connected")

            elif event == "start":
                start_info = data.get("start", {})
                stream_sid = start_info.get("streamSid")
                call_sid = start_info.get("callSid")
                logger.info(f"Twilio stream started: streamSid={stream_sid}, callSid={call_sid}")

                # Notify frontend call is active
                await manager.broadcast(call_id, {"type": "call_started", "data": {"call_id": call_id, "mode": "twilio"}})

                # Greet caller via Timbre TTS in mulaw
                asyncio.create_task(
                    send_timbre_speech(
                        websocket,
                        stream_sid,
                        "Namaskar, Mock-On Consumer AI Personal Assistant active. How may I assist your dispute today?",
                    )
                )

            elif event == "media":
                media = data.get("media", {})
                payload_b64 = media.get("payload", "")
                if payload_b64:
                    mulaw_chunk = base64.b64decode(payload_b64)
                    # Convert mulaw 8kHz 8-bit -> 16-bit linear PCM
                    pcm_chunk = audioop.ulaw2lin(mulaw_chunk, 2)
                    await audio_queue.put(pcm_chunk)

            elif event == "stop":
                logger.info(f"Twilio stream stopped for call {call_sid}")
                break

    except WebSocketDisconnect:
        logger.info(f"Twilio WebSocket disconnected for call {call_sid}")
    except Exception as e:
        logger.error(f"Twilio WebSocket stream error: {e}", exc_info=True)
    finally:
        await audio_queue.put(None)
        stt_task.cancel()
        # Mark call ended in DB
        try:
            async with AsyncSessionLocal() as db:
                c_res = await db.execute(select(Call).where(Call.id == call_id))
                c_obj = c_res.scalar_one_or_none()
                if c_obj:
                    c_obj.status = "ended"
                    await db.commit()
            await manager.broadcast(call_id, {"type": "call_ended", "data": {"call_id": call_id}})
        except Exception:
            pass


async def send_timbre_speech(websocket: WebSocket, stream_sid: str, text: str):
    """
    Synthesises speech via Timbre TTS, converts 16-bit linear PCM -> 8-bit mulaw,
    and streams to Twilio via WebSocket media events.
    """
    try:
        wav_bytes = await tts_adapter.synthesise(text)
        # Skip standard 44-byte WAV header to get raw PCM data
        pcm_data = wav_bytes[44:] if len(wav_bytes) > 44 else wav_bytes
        # Convert 16-bit linear PCM -> 8-bit mulaw
        mulaw_data = audioop.lin2ulaw(pcm_data, 2)

        chunk_size = 160  # 20ms at 8kHz
        for i in range(0, len(mulaw_data), chunk_size):
            chunk = mulaw_data[i : i + chunk_size]
            b64_payload = base64.b64encode(chunk).decode("utf-8")
            msg = {
                "event": "media",
                "streamSid": stream_sid,
                "media": {"payload": b64_payload},
            }
            await websocket.send_text(json.dumps(msg))
            await asyncio.sleep(0.02)

    except Exception as e:
        logger.error(f"Failed to send Timbre speech to Twilio: {e}")


@router.post("/call")
async def trigger_twilio_outbound_call(payload: OutboundCallRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Triggers an outbound call to a teammate's verified phone number using Twilio REST API.
    Creates a Call record in DB and binds it so frontend /call stays fully synced.
    """
    sid, token, from_number, default_pub_url = _get_twilio_creds()

    if not sid or not token or not from_number:
        raise HTTPException(
            400,
            detail="Twilio credentials not configured. Please provide TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.",
        )

    # Verify case exists
    c_res = await db.execute(select(Case).where(Case.id == payload.case_id))
    case = c_res.scalar_one_or_none()
    if not case:
        raise HTTPException(404, detail="Case not found")

    # Create Call entity
    call = Call(
        id=str(uuid.uuid4()),
        case_id=payload.case_id,
        scenario_id="twilio_pstn_bridge",
        status="active",
    )
    db.add(call)
    await db.commit()
    await db.refresh(call)

    # Determine public URL
    pub_url = payload.public_url or getattr(settings, "twilio_public_url", "")
    if not pub_url:
        host_header = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost:8000"
        proto = "https" if "ngrok" in host_header or request.headers.get("x-forwarded-proto") == "https" else "http"
        pub_url = f"{proto}://{host_header}"

    pub_url = pub_url.rstrip("/")
    twiml_url = f"{pub_url}/twilio/voice?case_id={case.id}&call_id={call.id}"

    api_url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Calls.json"
    auth = (sid, token)

    # Normalize destination phone number (remove spaces, dashes, brackets)
    raw_to = payload.to_phone.strip()
    digits_and_plus = re.sub(r"[^\d+]", "", raw_to)
    if not digits_and_plus.startswith("+"):
        if digits_and_plus.startswith("91") and len(digits_and_plus) == 12:
            normalized_to = f"+{digits_and_plus}"
        elif len(digits_and_plus) == 10:
            normalized_to = f"+91{digits_and_plus}"
        else:
            normalized_to = f"+{digits_and_plus}"
    else:
        normalized_to = digits_and_plus

    data = {
        "To": normalized_to,
        "From": from_number,
        "Url": twiml_url,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(api_url, data=data, auth=auth)
        if resp.status_code >= 400:
            logger.error(f"Twilio call failed: {resp.text}")
            call.status = "error"
            await db.commit()

            # Parse Twilio error code for descriptive user feedback
            try:
                err_json = resp.json()
                err_code = err_json.get("code")
                err_msg = err_json.get("message", resp.text)
            except Exception:
                err_code = None
                err_msg = resp.text

            if err_code == 573002:
                friendly_error = (
                    "Twilio Trial Limitation: Twilio blocks outbound calls from US trial numbers to Indian numbers (+91) "
                    "because international geo-permissions are locked on free trial accounts. "
                    "Please use 'Browser Voice Call' mode for the demo (0-latency, complete AI pipeline)."
                )
            elif err_code == 21215:
                friendly_error = f"Twilio Voice Geo-Permission blocked: Outbound calling to {normalized_to} is restricted on your Twilio account."
            elif err_code == 21211:
                friendly_error = f"Invalid phone format: '{payload.to_phone}'. Must be valid international format (e.g. +919103031412)."
            elif err_code == 21608:
                friendly_error = f"Twilio Trial Restriction: '{normalized_to}' is not verified under Twilio Console > Verified Caller IDs."
            else:
                friendly_error = f"Twilio Error ({err_code or resp.status_code}): {err_msg}"

            raise HTTPException(status_code=400, detail=friendly_error)

        res_data = resp.json()
        return {
            "ok": True,
            "call_id": call.id,
            "case_id": case.id,
            "call_sid": res_data.get("sid"),
            "status": res_data.get("status"),
            "to": normalized_to,
            "stream_url": f"{pub_url.replace('http', 'ws')}/twilio/stream/{call.id}",
        }
