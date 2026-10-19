"""Violation case status and identifier rules."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any


REVIEW_STATUS_LABELS = {
    "pending": "Chờ duyệt",
    "confirmed": "Đã xác nhận",
    "approved": "Đã xác nhận",
    "notice_exported": "Đã xuất hồ sơ",
    "notified": "Đã gửi thông báo",
    "resolved": "Đã xử lý",
    "rejected": "Đã hủy",
    "cancelled": "Đã hủy",
}

_REVIEW_STATUS_ALIASES = {
    "approved": "confirmed",
    "confirm": "confirmed",
    "confirmed": "confirmed",
    "processing": "notified",
    "fined_sent": "notified",
    "sent": "notified",
    "paid": "resolved",
    "done": "resolved",
    "cancelled": "rejected",
    "canceled": "rejected",
    "reject": "rejected",
}

VALID_REVIEW_STATUSES = frozenset({
    "pending",
    "confirmed",
    "notice_exported",
    "notified",
    "resolved",
    "rejected",
})


def effective_review_status(detection: Any) -> str:
    status = str(getattr(detection, "review_status", "") or "").strip().lower()
    if status:
        return status
    violation_type = str(getattr(detection, "violation_type", "") or "").strip()
    return "pending" if violation_type else "approved"


def normalize_review_status(value: str) -> str:
    raw = str(value or "").strip().lower()
    normalized = _REVIEW_STATUS_ALIASES.get(raw, raw)
    if normalized not in VALID_REVIEW_STATUSES:
        raise ValueError("Invalid review status")
    return normalized


def case_code_for_detection(detection: Any, *, fallback_time: datetime) -> str:
    timestamp = getattr(detection, "timestamp", None) or fallback_time
    plate = re.sub(
        r"[^A-Z0-9]",
        "",
        str(getattr(detection, "plate_number", "") or "UNKNOWN").upper(),
    ) or "UNKNOWN"
    return f"BB-{timestamp.strftime('%Y%m%d')}-{plate}-{int(detection.id):05d}"
