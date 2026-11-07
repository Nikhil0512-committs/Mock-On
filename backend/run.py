"""
Startup runner for Render and production hosting.
Binds to 0.0.0.0 and dynamically reads PORT from environment.
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"[Render Bootstrap] Starting Mock-On FastAPI server on {host}:{port}...", flush=True)
    uvicorn.run("app.main:app", host=host, port=port, log_level="info")

