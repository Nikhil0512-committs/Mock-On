"""Demo API — POST /demo/clock, GET /demo/status"""
from fastapi import APIRouter
from app.services.deadline_worker import advance_demo_clock, get_demo_now

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/clock")
async def advance_clock(days: float = 1.0):
    """
    Advance the simulated demo clock by N days.
    Immediately triggers the deadline worker tick to process overdue promises and callbacks.
    """
    import logging
    logger = logging.getLogger(__name__)
    from app.services.deadline_worker import deadline_worker
    new_time = advance_demo_clock(days)
    tick_error = None
    try:
        await deadline_worker._tick()
        logger.info(f"Simulated clock advanced by {days} days to {new_time.isoformat()} and triggered deadline worker tick.")
    except Exception as e:
        logger.error(f"Error during deadline worker tick on clock advance: {e}", exc_info=True)
        tick_error = str(e)
    return {
        "advanced_days": days,
        "simulated_now": new_time.isoformat(),
        "tick_error": tick_error,
    }


@router.get("/clock")
async def get_clock():
    """Get the current simulated time."""
    return {"simulated_now": get_demo_now().isoformat()}


@router.get("/status")
async def get_demo_status():
    """Health check for demo components."""
    from app.services.sarvam import sarvam_extractor
    from app.config import settings
    sarvam_ok = await sarvam_extractor.is_available()
    gnani_ok = bool(settings.gnani_api_key and len(settings.gnani_api_key) > 10)
    return {
        "sarvam_available": sarvam_ok,
        "gnani_available": gnani_ok,
        "simulated_now": get_demo_now().isoformat(),
    }
