"""
Root Startup runner for Render and production hosting.
Ensures backend/ is on sys.path, binds to 0.0.0.0 and dynamically reads PORT from environment.
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(BASE_DIR, "backend")
if os.path.exists(backend_dir) and backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"[Render Bootstrap] Starting Mock-On FastAPI server on {host}:{port}...", flush=True)
    uvicorn.run("app.main:app", host=host, port=port, log_level="info")

