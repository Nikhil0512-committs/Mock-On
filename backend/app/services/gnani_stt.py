"""
Gnani Prisma STT Adapter — 8 kHz streaming speech-to-text.
Streams raw 16-bit mono PCM frames to Prisma v3.0 WebSocket.
"""
import asyncio
import json
import logging
import time
from typing import AsyncGenerator, Callable

import websockets
from websockets.exceptions import ConnectionClosed

from app.config import settings

logger = logging.getLogger(__name__)

FRAME_SIZE = 1024  # bytes — as specified in Gnani docs


class PrismaSTTAdapter:
    """
    Wraps the Gnani Prisma v3.0 streaming STT WebSocket.
    Usage:
        async for transcript in adapter.stream(audio_bytes_iter):
            print(transcript)
    """

    def __init__(self):
        self.ws_url = settings.gnani_stt_ws_url
        self.api_key = settings.gnani_api_key
        self.language = settings.gnani_stt_language
        self.model = settings.gnani_stt_model
        self.sample_rate = settings.gnani_stt_sample_rate
        self.fmt = settings.gnani_stt_format

    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key-id": self.api_key,
            "language_code": self.language,
            "model": self.model,
            "x-sample-rate": str(self.sample_rate),
            "format": self.fmt,
        }

    async def stream(
        self,
        audio_iter: AsyncGenerator[bytes, None],
        on_transcript: Callable[[dict], None] | None = None,
    ) -> AsyncGenerator[dict, None]:
        """
        Opens a Prisma WebSocket, sends audio frames, yields transcript events.
        Each yielded dict has: {text, is_final, latency_ms, segment_id}
        """
        headers = self._headers()
        try:
            async with websockets.connect(
                self.ws_url,
                additional_headers=headers,
                ping_interval=10,
                ping_timeout=30,
            ) as ws:
                logger.info("Prisma STT WebSocket connected")

                async def send_audio():
                    """Send PCM frames to Prisma."""
                    async for chunk in audio_iter:
                        # Send in FRAME_SIZE chunks
                        for i in range(0, len(chunk), FRAME_SIZE):
                            frame = chunk[i : i + FRAME_SIZE]
                            await ws.send(frame)
                            await asyncio.sleep(0)  # yield control
                    # Signal end of stream
                    await ws.send(json.dumps({"eos": True}))

                send_task = asyncio.create_task(send_audio())

                try:
                    async for raw_msg in ws:
                        t_recv = time.monotonic()
                        if isinstance(raw_msg, bytes):
                            continue  # ignore binary frames
                        try:
                            msg = json.loads(raw_msg)
                        except json.JSONDecodeError:
                            continue

                        transcript = self._parse_transcript(msg, t_recv)
                        if transcript:
                            if on_transcript:
                                on_transcript(transcript)
                            yield transcript
                finally:
                    send_task.cancel()

        except ConnectionClosed as e:
            logger.warning(f"Prisma STT connection closed: {e}")
        except Exception as e:
            logger.error(f"Prisma STT error: {e}", exc_info=True)
            raise

    def _parse_transcript(self, msg: dict, recv_time: float) -> dict | None:
        """Normalise Prisma v3.0 response format into our internal format."""
        # Prisma returns: {"transcript": "...", "is_final": true, "latency": 250, ...}
        text = msg.get("transcript") or msg.get("text") or ""
        if not text:
            return None
        return {
            "text": text.strip(),
            "is_final": bool(msg.get("is_final", msg.get("isFinal", True))),
            "latency_ms": msg.get("latency", 0),
            "segment_id": msg.get("segment_id") or msg.get("segmentId"),
            "recv_time": recv_time,
        }

    async def transcribe_file(self, audio_bytes: bytes) -> dict:
        """REST API for short clips (for eval runs)."""
        import httpx
        headers = {
            "x-api-key-id": self.api_key,
            "x-apikey-id": self.api_key,
            "language_code": self.language,
            "model": self.model,
            "x-sample-rate": str(self.sample_rate),
            "format": self.fmt,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                settings.gnani_stt_rest_url,
                headers=headers,
                content=audio_bytes,
            )
            response.raise_for_status()
            return response.json()


# Singleton
stt_adapter = PrismaSTTAdapter()
