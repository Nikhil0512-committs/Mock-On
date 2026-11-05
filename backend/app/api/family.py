"""Family view API — GET /family/{token}"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Case, Promise

router = APIRouter(prefix="/family", tags=["family"])


@router.get("/{token}")
async def get_family_view(token: str, db: AsyncSession = Depends(get_db)):
    """
    Read-only view for a trusted family member.
    Returns case status, details, and all commitments.
    Sensitive recordings and credentials are NOT shared.
    """
    result = await db.execute(select(Case).where(Case.family_token == token))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(404, "Invalid or expired family token")

    p_result = await db.execute(
        select(Promise)
        .where(Promise.case_id == case.id)
        .order_by(Promise.created_at)
    )
    promises = p_result.scalars().all()

    info = case.approved_info or {}

    return {
        "case": {
            "id": case.id,
            "status": case.status,
            "language": case.language,
            "goal": case.goal,
            "domain": info.get("domain") or "telecom",
            "domain_label": info.get("domain_label") or "Consumer Dispute",
            "provider": info.get("service_provider") or "Customer Support",
            "identifier_type": info.get("identifier_type") or "Reference / ID",
            "identifier_value": info.get("identifier_value") or info.get("phone_number") or "",
            "phone_number": info.get("phone_number") or "",
            "disputed_amount": info.get("disputed_amount") or "",
            "ticket_number": info.get("ticket_number") or "TKT-2026-78432",
            "created_at": case.created_at,
        },
        "promises": [
            {
                "id": p.id,
                "commitment_type": p.commitment_type,
                "summary": p.summary,
                "status": p.status,
                "user_confirmed": p.user_confirmed,
                "due_at": p.due_at,
                "amount": p.amount,
                "currency": p.currency or "₹",
                "raw_date_phrase": getattr(p, "raw_date_phrase", None),
                "created_at": p.created_at,
            }
            for p in promises
        ],
    }
