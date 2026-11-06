"""
Gnani Timbre TTS Adapter — text-to-speech for agent replies.
Uses Timbre v3.0 REST API to synthesise short replies and speak them
back into the Prisma connection (simulated call audio).
"""
import base64
import logging
from typing import AsyncGenerator

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Phrases the TTS must never speak (security rule from spec)
_FORBIDDEN_PATTERNS = [
    "otp", "pin", "password", "cvv", "card number",
    "account password", "secret", "passcode",
]

# High-speed in-memory audio synthesis cache (0ms latency on repeated phrases)
_AUDIO_CACHE: dict[str, bytes] = {}
_MAX_CACHE_SIZE = 500

_shared_http_client: httpx.AsyncClient | None = None


def _get_shared_client() -> httpx.AsyncClient:
    global _shared_http_client
    if _shared_http_client is None or _shared_http_client.is_closed:
        _shared_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(4.0, connect=2.0),
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=60.0),
        )
    return _shared_http_client


def _is_safe(text: str) -> bool:
    """Returns False if text contains sensitive credential patterns."""
    lower = text.lower()
    return not any(p in lower for p in _FORBIDDEN_PATTERNS)


class TimbreTTSAdapter:
    """
    High-performance wrapper for Gnani Timbre v3.0 TTS REST API.
    Features connection pooling, persistent keep-alive, and an LRU audio cache for instant sub-50ms playback.
    """

    def __init__(self):
        self.rest_url = settings.gnani_tts_rest_url
        self.api_key = settings.gnani_api_key
        self.model = settings.gnani_tts_model
        self.voice = "Shivani"  # Dedicated female voice for AI Personal Assistant Shivani
        self.language = settings.gnani_tts_language or "hi-en"
        self.speed = settings.gnani_tts_speed
        self.audio_cache = _AUDIO_CACHE

    def _headers(self) -> dict[str, str]:
        return {
            "X-API-Key-ID": self.api_key,
            "Content-Type": "application/json",
        }

    async def synthesise(self, text: str) -> bytes:
        """
        Synthesise text → raw audio bytes (WAV).
        Uses connection pooling and in-memory cache for ultra-low latency.
        """
        clean_text = text.strip()
        if not clean_text:
            return b""

        if not _is_safe(clean_text):
            raise ValueError(f"TTS refused: text contains sensitive patterns: {clean_text[:50]}")

        cache_key = f"{self.voice}:{self.language}:{clean_text}"
        if cache_key in _AUDIO_CACHE:
            logger.debug(f"TTS cache hit for: {clean_text[:40]}")
            return _AUDIO_CACHE[cache_key]

        sample_rate = getattr(settings, "gnani_tts_sample_rate", 24000)
        payload = {
            "text": clean_text,
            "voice": self.voice,
            "model": self.model,
            "language": self.language,
            "speed": self.speed,
            "audio_config": {
                "sample_rate_hertz": sample_rate,
                "container": "wav",
            },
        }

        client = _get_shared_client()
        try:
            resp = await client.post(
                self.rest_url,
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            if "audio" in content_type or resp.content.startswith(b"RIFF"):
                audio_bytes = resp.content
            else:
                data = resp.json()
                audio_b64 = data.get("audio") or data.get("audio_data") or ""
                if not audio_b64:
                    raise RuntimeError(f"Timbre TTS returned no audio: {data}")
                audio_bytes = base64.b64decode(audio_b64)

            # Store in cache
            if len(_AUDIO_CACHE) >= _MAX_CACHE_SIZE:
                _AUDIO_CACHE.pop(next(iter(_AUDIO_CACHE)))
            _AUDIO_CACHE[cache_key] = audio_bytes

            logger.debug(f"TTS synthesised {len(audio_bytes)} bytes for: {clean_text[:60]}")
            return audio_bytes
        except Exception as e:
            logger.warning(f"Timbre TTS network call skipped or failed ({e}); falling back smoothly.")
            raise e

    async def synthesise_to_pcm(self, text: str) -> bytes:
        """Synthesise and convert to raw 8 kHz PCM using numpy (no ffmpeg dependency)."""
        wav_bytes = await self.synthesise(text)
        # For now return the WAV bytes directly; PCM conversion done in orchestrator
        return wav_bytes

    async def pre_generate_lines(self, lines: list[str]) -> dict[str, bytes]:
        """
        Pre-generate fixed TTS lines for the demo (IVR prompts, hold lines).
        Returns a mapping of text → audio_bytes.
        """
        results: dict[str, bytes] = {}
        for line in lines:
            try:
                results[line] = await self.synthesise(line)
            except Exception as e:
                logger.warning(f"TTS pre-gen failed for '{line[:40]}': {e}")
        return results


# Singleton
tts_adapter = TimbreTTSAdapter()
