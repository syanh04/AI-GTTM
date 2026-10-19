"""Notification history and delivery API routes."""
from dataclasses import dataclass
from typing import Any, Callable

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class NotificationRouteHandlers:
    get_notification_history: Callable[..., Any]
    create_notification_history: Callable[..., Any]
    send_notification: Callable[..., Any]


def register_notification_routes(
    app: Any,
    *,
    notification_history_model: Any,
    get_db_dependency: Callable[..., Any],
    require_any_role_dependency: Callable[..., Any],
    require_operator_dependency: Callable[..., Any],
    notification_history_create_model: Any,
    notification_send_request_model: Any,
    notification_history_out_model: Any,
    notification_history_response_model: Any,
    serialize_notification_history: Callable[[Any], dict[str, Any]],
    parse_notification_sent_at: Callable[[str], Any],
    deliver_notification: Callable[..., Any],
    notification_delivery_error: type[Exception],
) -> NotificationRouteHandlers:
    """Register notification routes with application dependencies injected."""

    @app.get(
        "/api/notification-history",
        response_model=notification_history_response_model,
        dependencies=[Depends(require_any_role_dependency)],
    )
    def get_notification_history(
        violation_id: str = Query(default=""),
        license_plate: str = Query(default=""),
        limit: int = 50,
        db: Session = Depends(get_db_dependency),
    ) -> Any:
        limit = max(1, min(limit, 200))
        query = db.query(notification_history_model)
        if violation_id:
            query = query.filter(notification_history_model.violation_id == violation_id)
        if license_plate:
            query = query.filter(notification_history_model.license_plate == license_plate)
        rows = (
            query
            .order_by(
                notification_history_model.sent_at.desc(),
                notification_history_model.id.desc(),
            )
            .limit(limit)
            .all()
        )
        return notification_history_response_model(
            items=[serialize_notification_history(row) for row in rows]
        )

    @app.post(
        "/api/notification-history",
        response_model=notification_history_out_model,
        dependencies=[Depends(require_operator_dependency)],
    )
    def create_notification_history(
        payload: notification_history_create_model,
        db: Session = Depends(get_db_dependency),
    ) -> dict[str, Any]:
        channel = str(payload.channel or "").strip().lower()
        status = str(payload.status or "").strip().lower()
        if channel not in {"sms", "email"}:
            raise HTTPException(status_code=400, detail="channel must be sms or email")
        if status not in {"sent", "failed"}:
            raise HTTPException(status_code=400, detail="status must be sent or failed")

        row = notification_history_model(
            violation_id=str(payload.violation_id or "").strip(),
            detection_id=payload.detection_id,
            license_plate=str(payload.license_plate or "").strip().upper(),
            channel=channel,
            status=status,
            recipient=str(payload.recipient or "").strip(),
            message=str(payload.message or "").strip(),
            operator=str(payload.operator or "").strip() or "admin",
            sent_at=parse_notification_sent_at(payload.sent_at or ""),
        )
        if not row.violation_id:
            raise HTTPException(status_code=400, detail="violation_id is required")
        db.add(row)
        db.commit()
        db.refresh(row)
        return serialize_notification_history(row)

    @app.post(
        "/api/notifications/send",
        dependencies=[Depends(require_operator_dependency)],
    )
    async def send_notification(payload: notification_send_request_model) -> dict[str, Any]:
        channel = payload.channel.strip().lower()
        recipient = payload.recipient.strip()
        message = payload.message.strip()
        if channel not in {"sms", "email"}:
            raise HTTPException(status_code=400, detail="channel must be sms or email")
        if not recipient or not message:
            raise HTTPException(status_code=400, detail="recipient and message are required")
        if any(char in recipient or char in payload.subject for char in ("\r", "\n")):
            raise HTTPException(status_code=400, detail="Invalid notification headers")

        try:
            return await deliver_notification(
                channel=channel,
                recipient=recipient,
                message=message,
                subject=payload.subject,
            )
        except notification_delivery_error as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return NotificationRouteHandlers(
        get_notification_history=get_notification_history,
        create_notification_history=create_notification_history,
        send_notification=send_notification,
    )
