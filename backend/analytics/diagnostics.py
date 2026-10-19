"""Read-only diagnostics helpers for lane analytics smoke tests."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

try:
    from ..database import LaneConfig, TrafficEvent, VehicleTrajectory, _vn_now
except ImportError:  # pragma: no cover - direct script execution fallback
    from database import LaneConfig, TrafficEvent, VehicleTrajectory, _vn_now


def _iso_or_none(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    try:
        return value.isoformat()
    except Exception:
        return str(value)


def build_lane_analytics_diagnostics(db: Session, camera_id: str) -> Dict[str, Any]:
    """Return a compact, read-only health snapshot for one camera."""
    normalized_camera_id = str(camera_id or "").strip()
    if not normalized_camera_id:
        raise ValueError("camera_id is required")

    now = _vn_now()
    last_1_minute = now - timedelta(minutes=1)
    last_5_minutes = now - timedelta(minutes=5)

    lane_config_count = (
        db.query(func.count(LaneConfig.id))
        .filter(LaneConfig.camera_id == normalized_camera_id)
        .filter(LaneConfig.is_active == 1)
        .scalar()
        or 0
    )

    total_rows = (
        db.query(func.count(VehicleTrajectory.id))
        .filter(VehicleTrajectory.camera_id == normalized_camera_id)
        .scalar()
        or 0
    )
    rows_last_1_minute = (
        db.query(func.count(VehicleTrajectory.id))
        .filter(VehicleTrajectory.camera_id == normalized_camera_id)
        .filter(VehicleTrajectory.timestamp >= last_1_minute)
        .scalar()
        or 0
    )
    rows_last_5_minutes = (
        db.query(func.count(VehicleTrajectory.id))
        .filter(VehicleTrajectory.camera_id == normalized_camera_id)
        .filter(VehicleTrajectory.timestamp >= last_5_minutes)
        .scalar()
        or 0
    )
    unique_tracks_last_5_minutes = (
        db.query(func.count(func.distinct(VehicleTrajectory.track_id)))
        .filter(VehicleTrajectory.camera_id == normalized_camera_id)
        .filter(VehicleTrajectory.timestamp >= last_5_minutes)
        .scalar()
        or 0
    )
    latest_timestamp = (
        db.query(func.max(VehicleTrajectory.timestamp))
        .filter(VehicleTrajectory.camera_id == normalized_camera_id)
        .scalar()
    )

    lane_distribution_rows = (
        db.query(
            VehicleTrajectory.lane_id,
            func.count(VehicleTrajectory.id).label("rows"),
            func.count(func.distinct(VehicleTrajectory.track_id)).label("unique_tracks"),
        )
        .filter(VehicleTrajectory.camera_id == normalized_camera_id)
        .filter(VehicleTrajectory.timestamp >= last_5_minutes)
        .group_by(VehicleTrajectory.lane_id)
        .order_by(func.count(VehicleTrajectory.id).desc())
        .limit(50)
        .all()
    )
    lane_distribution = [
        {"lane_id": lane_id, "rows": int(rows or 0), "unique_tracks": int(unique_tracks or 0)}
        for lane_id, rows, unique_tracks in lane_distribution_rows
    ]

    cut_in_total = (
        db.query(func.count(TrafficEvent.id))
        .filter(TrafficEvent.camera_id == normalized_camera_id)
        .filter(TrafficEvent.event_type == "cut_in")
        .scalar()
        or 0
    )
    cut_in_last_5_minutes = (
        db.query(func.count(TrafficEvent.id))
        .filter(TrafficEvent.camera_id == normalized_camera_id)
        .filter(TrafficEvent.event_type == "cut_in")
        .filter(TrafficEvent.timestamp >= last_5_minutes)
        .scalar()
        or 0
    )
    latest_cut_in_timestamp = (
        db.query(func.max(TrafficEvent.timestamp))
        .filter(TrafficEvent.camera_id == normalized_camera_id)
        .filter(TrafficEvent.event_type == "cut_in")
        .scalar()
    )

    return {
        "camera_id": normalized_camera_id,
        "has_lane_config": lane_config_count > 0,
        "lane_config_count": int(lane_config_count),
        "trajectory": {
            "total_rows": int(total_rows),
            "rows_last_1_minute": int(rows_last_1_minute),
            "rows_last_5_minutes": int(rows_last_5_minutes),
            "unique_tracks_last_5_minutes": int(unique_tracks_last_5_minutes),
            "latest_timestamp": _iso_or_none(latest_timestamp),
            "lane_distribution_last_5_minutes": lane_distribution,
        },
        "events": {
            "cut_in_total": int(cut_in_total),
            "cut_in_last_5_minutes": int(cut_in_last_5_minutes),
            "latest_cut_in_timestamp": _iso_or_none(latest_cut_in_timestamp),
        },
        "notes": [
            "Nếu rows_last_5_minutes = 0 thì stream chưa ghi trajectory hoặc camera_id không khớp.",
            "Nếu lane_id toàn null thì chưa cấu hình lane polygon hoặc polygon không khớp frame.",
        ],
    }
