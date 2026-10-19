"""Persistence helpers for lane polygon configuration."""

from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Mapping, Optional

from sqlalchemy.orm import Session

try:
    from ..database import LaneConfig, _vn_now
except ImportError:  # pragma: no cover - direct script execution fallback
    from database import LaneConfig, _vn_now

from .geometry import normalize_vector


class LaneConfigValidationError(ValueError):
    """Raised when a lane config payload cannot be accepted."""


def _safe_float(value: Any, field_name: str) -> float:
    try:
        return float(value)
    except Exception as exc:
        raise LaneConfigValidationError(f"{field_name} must be a number") from exc


def _normalize_point(raw: Any, label: str) -> Dict[str, float]:
    if not isinstance(raw, Mapping):
        raise LaneConfigValidationError(f"{label} must be an object with x and y")
    if "x" not in raw or "y" not in raw:
        raise LaneConfigValidationError(f"{label} must include x and y")
    return {
        "x": _safe_float(raw.get("x"), f"{label}.x"),
        "y": _safe_float(raw.get("y"), f"{label}.y"),
    }


def _json_or_none(value: Any) -> Optional[str]:
    if value is None or value == "":
        return None
    return json.dumps(value, ensure_ascii=False)


def validate_lane_config(lane: Mapping[str, Any]) -> Dict[str, Any]:
    """Validate and normalize one lane payload from API or internal callers."""
    if not isinstance(lane, Mapping):
        raise LaneConfigValidationError("lane must be an object")

    lane_id = str(lane.get("lane_id") or "").strip()
    if not lane_id:
        raise LaneConfigValidationError("lane_id is required")

    polygon_raw = lane.get("polygon")
    if polygon_raw is None and lane.get("polygon_json"):
        try:
            polygon_raw = json.loads(str(lane.get("polygon_json")))
        except Exception as exc:
            raise LaneConfigValidationError("polygon_json is invalid JSON") from exc
    if not isinstance(polygon_raw, list) or len(polygon_raw) < 3:
        raise LaneConfigValidationError("polygon must include at least 3 points")

    polygon = [_normalize_point(point, f"polygon[{idx}]") for idx, point in enumerate(polygon_raw)]

    direction_vector_raw = lane.get("direction_vector")
    if direction_vector_raw is None and lane.get("direction_vector_json"):
        try:
            direction_vector_raw = json.loads(str(lane.get("direction_vector_json")))
        except Exception as exc:
            raise LaneConfigValidationError("direction_vector_json is invalid JSON") from exc
    direction_vector = normalize_vector(direction_vector_raw)
    if direction_vector is None:
        raise LaneConfigValidationError("direction_vector must be a non-zero vector with x and y")

    direction_start = lane.get("direction_start")
    if direction_start is not None:
        direction_start = _normalize_point(direction_start, "direction_start")

    direction_end = lane.get("direction_end")
    if direction_end is not None:
        direction_end = _normalize_point(direction_end, "direction_end")

    homography = lane.get("homography")
    meter_per_pixel = lane.get("meter_per_pixel")
    if meter_per_pixel is not None and meter_per_pixel != "":
        meter_per_pixel = _safe_float(meter_per_pixel, "meter_per_pixel")
    else:
        meter_per_pixel = None

    frame_width = lane.get("frame_width")
    frame_height = lane.get("frame_height")
    frame_width = int(_safe_float(frame_width, "frame_width")) if frame_width not in (None, "") else None
    frame_height = int(_safe_float(frame_height, "frame_height")) if frame_height not in (None, "") else None

    return {
        "lane_id": lane_id,
        "lane_name": str(lane.get("lane_name") or lane_id),
        "polygon": polygon,
        "direction_vector": direction_vector,
        "direction_start": direction_start,
        "direction_end": direction_end,
        "frame_width": frame_width,
        "frame_height": frame_height,
        "homography": homography,
        "meter_per_pixel": meter_per_pixel,
        "is_active": 1 if bool(lane.get("is_active", True)) else 0,
    }


def serialize_lane_config(row: LaneConfig) -> Dict[str, Any]:
    """Serialize a LaneConfig ORM row for API responses and assignment code."""
    def loads(value: Optional[str], fallback: Any) -> Any:
        if not value:
            return fallback
        try:
            return json.loads(value)
        except Exception:
            return fallback

    return {
        "id": row.id,
        "camera_id": row.camera_id,
        "lane_id": row.lane_id,
        "lane_name": row.lane_name or row.lane_id,
        "polygon": loads(row.polygon_json, []),
        "direction_vector": loads(row.direction_vector_json, None),
        "direction_start": loads(row.direction_start_json, None),
        "direction_end": loads(row.direction_end_json, None),
        "frame_width": row.frame_width,
        "frame_height": row.frame_height,
        "homography": loads(row.homography_json, None),
        "meter_per_pixel": row.meter_per_pixel,
        "is_active": bool(row.is_active),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def get_lane_configs(db: Session, camera_id: str) -> List[Dict[str, Any]]:
    normalized_camera_id = str(camera_id or "").strip()
    if not normalized_camera_id:
        return []

    rows = (
        db.query(LaneConfig)
        .filter(LaneConfig.camera_id == normalized_camera_id)
        .filter(LaneConfig.is_active == 1)
        .order_by(LaneConfig.id.asc())
        .all()
    )
    return [serialize_lane_config(row) for row in rows]


def save_lane_configs(db: Session, camera_id: str, lanes: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """Deactivate old active lanes for a camera, then insert a new active set."""
    normalized_camera_id = str(camera_id or "").strip()
    if not normalized_camera_id:
        raise LaneConfigValidationError("camera_id is required")
    if not isinstance(lanes, list):
        lanes = list(lanes or [])
    if not lanes:
        raise LaneConfigValidationError("lanes must include at least one lane")

    normalized_lanes = [validate_lane_config(lane) for lane in lanes]
    seen_ids = set()
    for lane in normalized_lanes:
        if lane["lane_id"] in seen_ids:
            raise LaneConfigValidationError(f"duplicate lane_id: {lane['lane_id']}")
        seen_ids.add(lane["lane_id"])

    now = _vn_now()
    old_rows = (
        db.query(LaneConfig)
        .filter(LaneConfig.camera_id == normalized_camera_id)
        .filter(LaneConfig.is_active == 1)
        .all()
    )
    for row in old_rows:
        row.is_active = 0
        row.updated_at = now

    new_rows = []
    for lane in normalized_lanes:
        row = LaneConfig(
            camera_id=normalized_camera_id,
            lane_id=lane["lane_id"],
            lane_name=lane["lane_name"],
            polygon_json=json.dumps(lane["polygon"], ensure_ascii=False),
            direction_vector_json=json.dumps(lane["direction_vector"], ensure_ascii=False),
            direction_start_json=_json_or_none(lane.get("direction_start")),
            direction_end_json=_json_or_none(lane.get("direction_end")),
            frame_width=lane.get("frame_width"),
            frame_height=lane.get("frame_height"),
            homography_json=_json_or_none(lane.get("homography")),
            meter_per_pixel=lane.get("meter_per_pixel"),
            is_active=1,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        new_rows.append(row)

    db.commit()
    for row in new_rows:
        db.refresh(row)
    return [serialize_lane_config(row) for row in new_rows]
