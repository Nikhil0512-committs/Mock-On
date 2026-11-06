"""
Hold-On Backend — Application Settings
Reads from .env file via pydantic-settings
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_cors_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost:4173,https://mock-on.vercel.app"

    # Database (Neon PostgreSQL with SQLite fallback for offline development)
    database_url: str = Field(
        default="sqlite+aiosqlite:///./holdon.db"
    )

    # Gnani STT (Prisma)
    gnani_api_key: str = Field(default="")
    gnani_stt_ws_url: str = "wss://api.vachana.ai/stt/v3/stream"
    gnani_stt_rest_url: str = "https://api.vachana.ai/stt/v3"
    gnani_stt_model: str = "prisma-v3.0"
    gnani_stt_language: str = "hi-IN,en-IN"
    gnani_stt_sample_rate: int = 8000
    gnani_stt_format: str = "codemix"

    # Gnani TTS (Timbre)
    gnani_tts_ws_url: str = "wss://api.vachana.ai/api/v1/tts"
    gnani_tts_rest_url: str = "https://api.vachana.ai/api/v1/tts/inference"
    gnani_tts_model: str = "timbre-v3.0"
    gnani_tts_voice: str = "Shivani"
    gnani_tts_language: str = "hi-en"
    gnani_tts_speed: float = 1.0

    # Sarvam AI
    sarvam_base_url: str = "https://api.sarvam.ai/v1"
    sarvam_model: str = "sarvam-105b-conversations"
    sarvam_api_key: str = Field(default="")
    sarvam_fallback_model: str = "sarvam-105b"

    # Demo
    demo_clock_ratio: int = 86400  # 1 real second = 1 simulated day
    deadline_poll_interval: int = 5

    # Family view
    family_token_secret: str = "change-me"

    # Embeddings
    embedding_model: str = "intfloat/multilingual-e5-small"
    embedding_dim: int = 384

    # Audio
    audio_sample_rate: int = 8000

    # Email (Gmail SMTP)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 465
    smtp_user: str = Field(default="")
    smtp_password: str = Field(default="")
    smtp_from: str = "Mock-On AI <nikhilsharma5122006@gmail.com>"

    # JWT Authentication
    jwt_secret: str = "mock-on-super-secret-jwt-key-2026-gnani-ai-challenge-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080

    # Application URLs
    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"

    # Twilio Live Telephony Bridge
    twilio_account_sid: str = Field(default="")
    twilio_auth_token: str = Field(default="")
    twilio_phone_number: str = Field(default="")
    twilio_public_url: str = Field(default="")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.app_cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
