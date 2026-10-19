from __future__ import annotations

import os
import secrets
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from ..chatbots.zalo_adapter import build_zalo_reply, extract_message_text, extract_user_id, send_zalo_text


router = APIRouter()


@router.get("/health")
def zalo_health() -> Dict[str, str]:
    return {"status": "ok", "channel": "zalo"}


@router.post("/webhook")
async def zalo_webhook(request: Request) -> Dict[str, Any]:
    configured_secret = os.getenv("ZALO_WEBHOOK_SECRET", "").strip()
    is_production = os.getenv("APP_ENV", "development").strip().lower() in {"production", "prod"}
    if is_production and not configured_secret:
        raise HTTPException(status_code=503, detail="Zalo webhook is not configured")
    if configured_secret:
        supplied_secret = (
            request.headers.get("x-zalo-webhook-secret", "")
            or request.query_params.get("secret", "")
        )
        if not secrets.compare_digest(supplied_secret, configured_secret):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid Zalo webhook payload")

    user_id = extract_user_id(payload)
    text = extract_message_text(payload)

    if not user_id:
        return {"ok": True, "ignored": "missing_user_id"}

    reply = build_zalo_reply(text)
    result = send_zalo_text(user_id, reply)
    return {"ok": True, "sent": True, "zalo": result}
