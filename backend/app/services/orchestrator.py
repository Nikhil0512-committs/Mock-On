"""
Call Orchestrator — the central state machine for a live call.
Coordinates: Mock IVR → Prisma STT → Sarvam extractor → Validators → Timbre TTS → Ledger
"""
import asyncio
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Call, Utterance
from app.models.case import Case
from app.models.promise import Promise
from app.services.mock_ivr import MockIVREngine
from app.services.sarvam import sarvam_extractor
from app.services.validators import validator
from app.services.ledger import ledger
from app.services.embeddings import embed_texts_async
from app.services.gnani_tts import tts_adapter
from app.services.email import email_service

logger = logging.getLogger(__name__)


class CallOrchestrator:
    """
    Manages a single live call. The UI connects via WebSocket; events are
    broadcast to all listeners via the `broadcast` callback.
    """

    def __init__(
        self,
        call_id: str,
        case_id: str,
        scenario_id: str,
        db_session_factory,
        broadcast: Callable[[dict], Any],
    ):
        self.call_id = call_id
        self.case_id = case_id
        self.scenario_id = scenario_id
        self.db_session_factory = db_session_factory
        self.broadcast = broadcast

        self.ivr = MockIVREngine(scenario_id)
        self.utterances_buffer: list[dict] = []
        self.sequence_counter = 0
        self._stream_position = 0
        self._running = False
        self._extracted_promise = False

    async def run(self):
        """Main call lifecycle — called once, runs until the call ends."""
        self._running = True
        await self._emit("call_started", {"call_id": self.call_id, "scenario": self.scenario_id})

        # Dynamically customize IVR scenario with case details
        try:
            async with self.db_session_factory() as db:
                c_res = await db.execute(select(Case).where(Case.id == self.case_id))
                case = c_res.scalar_one_or_none()
                if case:
                    self.ivr.customize_for_case(case)
        except Exception as e:
            logger.warning(f"Failed to customize IVR script for case {self.case_id}: {e}")

        try:
            await self._play_ivr_greeting()
            await self._run_menu_phase()
            await self._play_hold()
            await self._run_agent_phase()
        except asyncio.CancelledError:
            logger.info(f"Call {self.call_id} cancelled")
        except Exception as e:
            logger.error(f"Orchestrator error in call {self.call_id}: {e}", exc_info=True)
            await self._emit("error", {"message": str(e)})
        finally:
            self._running = False
            await self._end_call()

    async def _play_ivr_greeting(self):
        """Play the scripted IVR greeting with Gnani Timbre TTS."""
        text = self.ivr.scenario.get("greeting_text", "Namaskar, aapka swagat hai XYZ Telecom ke customer care mein.")
        audio_b64 = None
        try:
            raw_audio = await tts_adapter.synthesise(text)
            audio_b64 = base64.b64encode(raw_audio).decode("ascii")
        except Exception as e:
            logger.warning(f"TTS synthesis failed for greeting: {e}")

        await self._emit("ivr_speaking", {
            "text": text,
            "audio_b64": audio_b64,
        })
        await asyncio.sleep(2.5)  # Simulate audio playback time

    async def _run_menu_phase(self):
        """Navigate the IVR menu tree using goal-based key selection."""
        options = self.ivr.get_menu_options("root")
        if not options:
            return

        chosen_opt = self._select_menu_option(options)
        chosen_key = chosen_opt.get("key", "1")
        chosen_label = chosen_opt.get("label", "Hindi")
        await self._emit("menu_pressed", {"key": chosen_key, "label": chosen_label, "options": options})
        self.ivr.press_key(chosen_key)
        await asyncio.sleep(1)

        # Sub-menu if needed
        sub_options = self.ivr.get_menu_options(self.ivr.menu_position)
        if sub_options:
            sub_opt = self._select_menu_option(sub_options)
            sub_key = sub_opt.get("key", "1")
            sub_label = sub_opt.get("label", "Billing aur payment")
            await self._emit("menu_pressed", {"key": sub_key, "label": sub_label, "options": sub_options})
            self.ivr.press_key(sub_key)
            await asyncio.sleep(1)

    def _select_menu_option(self, options: list[dict]) -> dict:
        """Rule-based menu selection — billing/refund complaints → best match."""
        for opt in options:
            label = opt.get("label", "").lower()
            if any(w in label for w in ["refund", "bill", "charge", "hindi"]):
                return opt
        return options[0] if options else {"key": "1", "label": "Option 1"}

    async def _play_hold(self):
        """Simulate hold music."""
        hold = self.ivr.get_hold_segment()
        duration = hold.get("duration_seconds", 8)
        await self._emit("hold_started", {"duration_seconds": duration})
        await asyncio.sleep(min(duration, 3))  # Shortened for demo
        await self._emit("hold_ended", {})

    async def _run_agent_phase(self):
        """
        Play scripted agent turns, transcribe each via Prisma STT (or simulate),
        then extract + validate promises after each agent turn.
        """
        while not self.ivr.is_ended():
            turn = self.ivr.next_agent_turn()
            if turn is None:
                break

            role = turn.get("role", "agent")
            text = turn.get("text", "")

            if not text:
                continue

            # Record utterance
            await self._emit("speech_start", {"speaker": role})
            utterance_id = await self._save_utterance(role, text, text)

            audio_b64 = None
            if role in ("agent", "ivr"):
                try:
                    raw_audio = await tts_adapter.synthesise(text)
                    audio_b64 = base64.b64encode(raw_audio).decode("ascii")
                except Exception as e:
                    logger.warning(f"TTS synthesis failed for turn: {e}")

            await asyncio.sleep(0.5)  # Simulate speech duration
            await self._emit("transcript_final", {
                "utterance_id": utterance_id,
                "speaker": role,
                "text": text,
                "sequence": self.sequence_counter,
                "audio_b64": audio_b64,
            })

            # After agent turn with promise, trigger extraction exactly once
            if role == "agent" and turn.get("contains_promise") and not self._extracted_promise:
                await self._extract_promises(utterance_id)
                self._extracted_promise = True

            # Small pause between turns
            await asyncio.sleep(1.0)

        self.ivr.end_call()

    async def _extract_promises(self, last_utterance_id: str):
        """Call Sarvam and validate any promise candidates found."""
        if not self.utterances_buffer:
            return

        candidates = await sarvam_extractor.extract(self.utterances_buffer, window=8)
        if not candidates:
            return

        async with self.db_session_factory() as db:
            for candidate in candidates:
                result = await ledger.propose_promise(
                    db,
                    case_id=self.case_id,
                    candidate=candidate,
                    utterance_id=last_utterance_id,
                    recent_turns=self.utterances_buffer,
                )
                if result["ok"]:
                    await self._emit("promise_proposed", {
                        "proposal": result["promise_data"],
                        "needs_date_confirmation": result.get("needs_date_confirmation", False),
                    })
                else:
                    logger.debug(f"Candidate rejected: {result['failures']}")
            await db.commit()

    async def _save_utterance(self, role: str, raw: str, normalised: str) -> str:
        """Save utterance to DB and return its ID."""
        utt_id = str(uuid.uuid4())
        self.sequence_counter += 1
        utt_dict = {
            "id": utt_id,
            "call_id": self.call_id,
            "case_id": self.case_id,
            "speaker_role": role,
            "raw_text": raw,
            "normalised_text": normalised,
            "sequence_num": self.sequence_counter,
        }
        self.utterances_buffer.append(utt_dict)

        async with self.db_session_factory() as db:
            # Embed in background to not block the call
            try:
                embeddings = await embed_texts_async([normalised])
                embedding = embeddings[0] if embeddings else None
            except Exception:
                embedding = None

            utt = Utterance(
                id=utt_id,
                call_id=self.call_id,
                case_id=self.case_id,
                speaker_role=role,
                raw_text=raw,
                normalised_text=normalised,
                sequence_num=self.sequence_counter,
                embedding=embedding,
                embedding_model=settings.embedding_model if embedding else None,
            )
            db.add(utt)
            await db.commit()

        return utt_id

    async def _end_call(self):
        """Mark the call as ended and dispatch summary or inconclusive notice email."""
        try:
            async with self.db_session_factory() as db:
                c_res = await db.execute(select(Case).where(Case.id == self.case_id))
                case = c_res.scalar_one_or_none()
                p_res = await db.execute(select(Promise).where(Promise.case_id == self.case_id))
                promises = p_res.scalars().all()

                info = (case.approved_info or {}) if case else {}
                provider = info.get("service_provider", "Customer Support")
                phone = info.get("phone_number", "Registered Mobile")
                id_label = info.get("identifier_type", "Reference")
                id_val = info.get("identifier_value") or phone
                domain = info.get("domain", "telecom")
                ticket_no = info.get("ticket_number") or "TKT-2026-78432"
                amount = (
                    (f"₹{info.get('disputed_amount')}" if info.get('disputed_amount') else None)
                    or "₹1,000"
                )

                promises_list = []
                for p in promises:
                    if p.amount:
                        amount = f"₹{p.amount}"
                    date_str = getattr(p, "raw_date_phrase", None) or getattr(p, "deadline_phrase", None) or "in 5 business days"
                    promises_list.append({
                        "type": getattr(p, "commitment_type", "Refund Commitment"),
                        "amount": p.amount,
                        "deadline_phrase": date_str,
                    })

                has_conclusion = len(promises_list) > 0
                end_reason = (
                    f"Call successfully concluded with confirmed commitment from {provider}."
                    if has_conclusion
                    else "Call ended without the representative confirming any resolution or commitment."
                )

                await self._emit("call_ended", {
                    "call_id": self.call_id,
                    "has_conclusion": has_conclusion,
                    "reason": end_reason,
                    "status": "resolved" if has_conclusion else "inconclusive",
                })

                if case and case.user_email:
                    if not has_conclusion:
                        await email_service.send_inconclusive_call_notice(
                            to_email=case.user_email,
                            case_id=self.case_id,
                            provider=provider,
                            ticket_number=ticket_no,
                            amount_str=amount,
                            reason=end_reason,
                            identifier_label=id_label,
                            identifier_val=id_val,
                        )
                        logger.info(f"Inconclusive call email sent to {case.user_email} for case {self.case_id}")
                    else:
                        await email_service.send_call_summary(
                            to_email=case.user_email,
                            case_id=self.case_id,
                            provider=provider,
                            phone_number=phone,
                            ticket_number=ticket_no,
                            amount_str=amount,
                            due_date_str="in 5 business days",
                            promises=promises_list,
                            identifier_label=id_label,
                            identifier_val=id_val,
                            domain=domain,
                        )
                        logger.info(f"Post-call summary email sent to {case.user_email} for case {self.case_id}")
        except Exception as mail_err:
            logger.error(f"Failed to complete end-call processing: {mail_err}", exc_info=True)
            await self._emit("call_ended", {"call_id": self.call_id, "has_conclusion": False})

    async def _emit(self, event_type: str, data: dict):
        """Broadcast an event to all WebSocket listeners."""
        msg = {"type": event_type, "data": data}
        try:
            await self.broadcast(msg)
        except Exception as e:
            logger.debug(f"Broadcast error (ignored): {e}")
