"""
Hold-On Backend — FastAPI Application Entry Point
"""
import logging
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Response, WebSocket, Request
from fastapi.responses import JSONResponse
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
    import asyncio
    logger.info("Hold-On backend starting up...")
    
    # Safe DB initialisation with fast timeout; if DB connection is slow, continues in background
    # This guarantees the web port opens immediately so Render port scan succeeds
    async def _safe_init():
        try:
            await init_db()
            logger.info("Database successfully initialized")
        except Exception as e:
            logger.warning(f"Initial DB connection deferred: {e}")

    try:
        await asyncio.wait_for(_safe_init(), timeout=4.0)
    except (asyncio.TimeoutError, Exception) as e:
        logger.warning(f"DB init taking longer than 4s — scheduling in background so web port binds immediately: {e}")
        asyncio.create_task(_safe_init())

    # Start deadline worker
    try:
        await deadline_worker.start()
        logger.info("Deadline worker started")
    except Exception as e:
        logger.warning(f"Deadline worker startup warning: {e}")

    yield

    # Shutdown
    try:
        await deadline_worker.stop()
    except Exception:
        pass
    logger.info("Hold-On backend shut down")


app = FastAPI(
    title="Hold-On API",
    description="Voice-first consumer advocate — evidence-linked complaint management",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the React frontend, local dev, Vercel deployments, and preview domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    origin = request.headers.get("origin")
    headers = {}
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Access-Control-Allow-Methods"] = "*"
        headers["Access-Control-Allow-Headers"] = "*"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
        headers=headers,
    )

# REST Routers (accessible both at root / and with /api prefix for complete deployment compatibility)
routers = [auth.router, cases.router, calls.router, promises.router, demo.router, family.router, resolution.router, twilio_bridge.router]
for r in routers:
    app.include_router(r)
    app.include_router(r, prefix="/api")


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


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", settings.effective_port or 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    logger.info(f"Binding and starting Uvicorn server on {host}:{port}...")
    uvicorn.run("app.main:app", host=host, port=port, log_level="info")
