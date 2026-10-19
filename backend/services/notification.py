"""Notification delivery and history serialization."""
from __future__ import annotations

import asyncio
import os
import smtplib
from datetime import datetime
from email.message import EmailMessage
from typing import Any, Callable

import httpx


class NotificationDeliveryError(RuntimeError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def parse_notification_sent_at(value: str, *, now_provider: Callable[[], datetime]) -> datetime:
    if not value:
        return now_provider()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return now_provider()


def serialize_notification_history(item: Any) -> dict[str, Any]:
    return {
        "id": item.id,
        "violation_id": item.violation_id,
        "detection_id": item.detection_id,
        "license_plate": item.license_plate or "",
        "channel": item.channel,
        "status": item.status,
        "recipient": item.recipient or "",
        "message": item.message or "",
        "operator": item.operator or "",
        "sent_at": item.sent_at.isoformat() if item.sent_at else "",
    }


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


async def deliver_notification(
    *,
    channel: str,
    recipient: str,
    message: str,
    subject: str = "",
) -> dict[str, Any]:
    if channel == "sms":
        webhook_url = os.getenv("SMS_WEBHOOK_URL", "").strip()
        webhook_token = os.getenv("SMS_WEBHOOK_TOKEN", "").strip()
        if not webhook_url:
            raise NotificationDeliveryError(503, "SMS provider is not configured")
        headers = {"Authorization": f"Bearer {webhook_token}"} if webhook_token else {}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    webhook_url,
                    json={"recipient": recipient, "message": message},
                    headers=headers,
                )
            response.raise_for_status()
        except Exception as exc:
            raise NotificationDeliveryError(502, "SMS provider rejected the request") from exc
    else:
        smtp_host = os.getenv("SMTP_HOST", "").strip()
        smtp_port = _env_int("SMTP_PORT", 587)
        smtp_user = os.getenv("SMTP_USERNAME", "").strip()
        smtp_password = os.getenv("SMTP_PASSWORD", "")
        smtp_from = os.getenv("SMTP_FROM", smtp_user).strip()
        if not smtp_host or not smtp_from:
            raise NotificationDeliveryError(503, "Email provider is not configured")

        email = EmailMessage()
        email["From"] = smtp_from
        email["To"] = recipient
        email["Subject"] = subject.strip() or "RoadAI notification"
        email.set_content(message)

        def send_email() -> None:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as smtp:
                if _env_bool("SMTP_STARTTLS", True):
                    smtp.starttls()
                if smtp_user:
                    smtp.login(smtp_user, smtp_password)
                smtp.send_message(email)

        try:
            await asyncio.to_thread(send_email)
        except Exception as exc:
            raise NotificationDeliveryError(502, "Email provider rejected the request") from exc

    return {"ok": True, "channel": channel, "recipient": recipient}
