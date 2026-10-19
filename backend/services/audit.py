"""Audit logging service for tracking user actions."""
from __future__ import annotations

import json
from typing import Any, Optional
from fastapi import Request
from sqlalchemy.orm import Session

try:
    from ..database import AuditLog, User
except ImportError:
    from database import AuditLog, User


def get_client_ip(request: Optional[Request]) -> str:
    if not request:
        return "127.0.0.1"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


def get_user_agent(request: Optional[Request]) -> str:
    if not request:
        return ""
    return request.headers.get("User-Agent", "")[:255]


def write_audit(
    db: Session,
    user: Optional[User],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[Any] = None,
    before: Optional[Any] = None,
    after: Optional[Any] = None,
    note: Optional[str] = None,
    request: Optional[Request] = None,
) -> AuditLog:
    """
    Ghi nhật ký thao tác người dùng vào bảng audit_logs.
    """
    user_id = user.id if user else None
    username = user.username if user else "system"
    role = user.role if user else None

    before_str = json.dumps(before, ensure_ascii=False) if before is not None else None
    after_str = json.dumps(after, ensure_ascii=False) if after is not None else None

    ip = get_client_ip(request)
    ua = get_user_agent(request)

    audit_entry = AuditLog(
        user_id=user_id,
        username=username,
        role=role,
        action=action,
        entity_type=str(entity_type) if entity_type else None,
        entity_id=str(entity_id) if entity_id is not None else None,
        before_json=before_str,
        after_json=after_str,
        note=note,
        ip=ip,
        user_agent=ua,
    )
    db.add(audit_entry)
    db.flush()
    return audit_entry
