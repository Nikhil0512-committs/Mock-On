"""
Hold-On Backend — FastAPI Application Entry Point
"""
import logging
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.services.deadline_worker import deadline_worker
from app.api import cases, calls, promises, demo, family, auth, resolution, twilio_bridge
from app.ws.call_socket import handle_call_websocket

# Configure structured logging
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("Hold-On backend starting up...")
    # Initialise DB (create tables, pgvector extension)
    await init_db()
    logger.info("Database initialised")
    # Start deadline worker
    await deadline_worker.start()
    logger.info("Deadline worker started")
    yield
    # Shutdown
    await deadline_worker.stop()
    logger.info("Hold-On backend shut down")


app = FastAPI(
    title="Hold-On API",
    description="Voice-first consumer advocate — evidence-linked complaint management",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the React frontend and Vercel deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST Routers
app.include_router(auth.router)
app.include_router(cases.router)
app.include_router(calls.router)
app.include_router(promises.router)
app.include_router(demo.router)
app.include_router(family.router)
app.include_router(resolution.router)
app.include_router(resolution.router, prefix="/api")
app.include_router(twilio_bridge.router)


# WebSocket endpoint for live call events
@app.websocket("/ws/calls/{call_id}")
async def call_websocket(websocket: WebSocket, call_id: str):
    await handle_call_websocket(websocket, call_id)


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    # Return SVG shield icon so browser renders icon and avoids 404
    svg_icon = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        '<rect width="100" height="100" rx="24" fill="#0f172a"/>'
        '<path d="M50 18 L76 30 V52 C76 68 64 80 50 86 C36 80 24 68 24 52 V30 Z" fill="#3b82f6" fill-opacity="0.2" stroke="#3b82f6" stroke-width="4"/>'
        '<path d="M42 50 L48 56 L60 42" stroke="#60a5fa" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
        '</svg>'
    )
    return Response(content=svg_icon, media_type="image/svg+xml")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "hold-on-backend"}


@app.get("/")
async def root():
    return {
        "service": "Hold-On",
        "tagline": "The call is only the beginning.",
        "docs": "/docs",
    }
