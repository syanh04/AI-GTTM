"""Sampled trajectory storage and in-memory track state cache.

This module is intentionally best-effort. Callers should be able to catch and log
any unexpected error without affecting the real-time ALPR stream.
"""

from __future__ import annotations

import json
import math
import time
from datetime import datetime
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

from sqlalchemy.orm import Session

try:
    from ..database import VehicleTrajectory
except ImportError:  # pragma: no cover - direct script execution fallback
    from database import VehicleTrajectory

from .cutin_detector import detect_cut_in_event, save_traffic_event
from .config import (
    ANALYTICS_DEBUG,
    LANE_CONFIG_CACHE_TTL_SECONDS,
    MAX_BBOX_JUMP_RATIO,
    MIN_DETECTION_CONFIDENCE,
    TRACK_STATE_MAX_AGE_SECONDS,
    TRACK_STATE_MAX_HISTORY,
    TRAJECTORY_SAMPLE_INTERVAL_MS,
)
from .geometry import is_bbox_jump_abnormal
from .lane_assignment import assign_lane_by_polygon
from .lane_config import get_lane_configs

TrackKey = Tuple[str, int]

track_state_cache: Dict[TrackKey, Dict[str, Any]] = {}
last_trajectory_sample_at: Dict[TrackKey, datetime] = {}
_lane_config_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_LANE_CONFIG_CACHE_TTL_SECONDS = LANE_CONFIG_CACHE_TTL_SECONDS


def _to_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    try:
        return float(value)
    except Exception:
        return default


def _to_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    try:
        return int(value)
    except Exception:
        return default


def _timestamp_seconds(value: datetime) -> float:
    return float(value.timestamp())


def _ms_between(previous: datetime, current: datetime) -> float:
    return (_timestamp_seconds(current) - _timestamp_seconds(previous)) * 1000.0


def _normalize_bbox(raw_bbox: Any) -> Optional[List[int]]:
    if not isinstance(raw_bbox, (list, tuple)) or len(raw_bbox) < 4:
        return None
    values = [_to_float(v) for v in raw_bbox[:4]]
    if any(v is None for v in values):
        return None
    x1, y1, x2, y2 = values
    if x2 <= x1 or y2 <= y1:
        return None
    return [int(round(x1)), int(round(y1)), int(round(x2)), int(round(y2))]


def _normalize_point(raw_point: Any) -> Optional[Dict[str, float]]:
    if not isinstance(raw_point, Mapping):
        return None
    x = _to_float(raw_point.get("x"))
    y = _to_float(raw_point.get("y"))
    if x is None or y is None:
        return None
    return {"x": x, "y": y}


def _get_track_id(vehicle: Mapping[str, Any]) -> Optional[int]:
    return _to_int(vehicle.get("track_id"))


def _get_detection_confidence(vehicle: Mapping[str, Any]) -> Optional[float]:
    confidence = _to_float(vehicle.get("detection_confidence"))
    if confidence is None:
        confidence = _to_float(vehicle.get("confidence"))
    return confidence


def _estimate_speed_px_s(previous: Mapping[str, Any], current_point: Mapping[str, float], timestamp: datetime) -> Optional[float]:
    previous_point = previous.get("point")
    previous_ts = previous.get("timestamp")
    if not isinstance(previous_point, Mapping) or not isinstance(previous_ts, datetime):
        return None

    dt = _timestamp_seconds(timestamp) - _timestamp_seconds(previous_ts)
    if dt <= 1e-6:
        return None

    dx = float(current_point["x"]) - float(previous_point["x"])
    dy = float(current_point["y"]) - float(previous_point["y"])
    return math.hypot(dx, dy) / dt


def _get_lane_configs_cached(db: Session, camera_id: str) -> List[Dict[str, Any]]:
    now = time.monotonic()
    cached = _lane_config_cache.get(camera_id)
    if cached and (now - cached[0]) <= _LANE_CONFIG_CACHE_TTL_SECONDS:
        return cached[1]

    lanes = get_lane_configs(db, camera_id)
    _lane_config_cache[camera_id] = (now, lanes)
    return lanes


def cleanup_track_state_cache(now: datetime) -> None:
    """Drop stale in-memory track states. Does not touch the database."""
    now_s = _timestamp_seconds(now)
    stale_keys = []
    for key, state in track_state_cache.items():
        last_seen = state.get("last_seen")
        if not isinstance(last_seen, datetime):
            stale_keys.append(key)
            continue
        if now_s - _timestamp_seconds(last_seen) > TRACK_STATE_MAX_AGE_SECONDS:
            stale_keys.append(key)

    for key in stale_keys:
        track_state_cache.pop(key, None)
        last_trajectory_sample_at.pop(key, None)


def update_track_state_cache(
    camera_id: str,
    vehicle: Mapping[str, Any],
    lane_id: Optional[str],
    timestamp: datetime,
) -> Optional[Dict[str, Any]]:
    """Update memory history for one track and return its state, or None if skipped."""
    try:
        normalized_camera_id = str(camera_id or "").strip()
        track_id = _get_track_id(vehicle)
        if not normalized_camera_id or track_id is None:
            return None

        bbox = _normalize_bbox(vehicle.get("bbox"))
        center_bottom = _normalize_point(vehicle.get("center_bottom"))
        if bbox is None or center_bottom is None:
            return None

        confidence = _get_detection_confidence(vehicle)
        if confidence is not None and confidence < MIN_DETECTION_CONFIDENCE:
            return None

        key = (normalized_camera_id, track_id)
        state = track_state_cache.setdefault(
            key,
            {
                "camera_id": normalized_camera_id,
                "track_id": track_id,
                "history": [],
                "last_seen": timestamp,
            },
        )
        history = state.setdefault("history", [])

        if history:
            previous_bbox = history[-1].get("bbox")
            if previous_bbox and is_bbox_jump_abnormal(previous_bbox, bbox, MAX_BBOX_JUMP_RATIO):
                state["bbox_jump_count"] = int(state.get("bbox_jump_count", 0) or 0) + 1
                state["last_seen"] = timestamp
                return None

        speed_px_s = _estimate_speed_px_s(history[-1], center_bottom, timestamp) if history else None
        current = {
            "point": center_bottom,
            "lane_id": lane_id,
            "timestamp": timestamp,
            "speed_px_s": speed_px_s,
            "bbox": bbox,
            "confidence": confidence,
            "raw_track_id": _to_int(vehicle.get("raw_track_id")),
            "class_name": str(vehicle.get("class") or vehicle.get("class_name") or ""),
        }
        history.append(current)
        if len(history) > TRACK_STATE_MAX_HISTORY:
            del history[:-TRACK_STATE_MAX_HISTORY]

        state["current"] = current
        state["last_seen"] = timestamp
        return state
    except Exception as exc:
        print(f"[ANALYTICS WARNING] update_track_state_cache skipped: {exc}")
        return None


def sample_and_save_trajectory(
    db: Session,
    camera_id: str,
    vehicle: Mapping[str, Any],
    lane_id: Optional[str],
    timestamp: datetime,
) -> bool:
    """Persist one sampled trajectory row if the track interval has elapsed."""
    try:
        normalized_camera_id = str(camera_id or "").strip()
        track_id = _get_track_id(vehicle)
        if not normalized_camera_id or track_id is None:
            return False

        bbox = _normalize_bbox(vehicle.get("bbox"))
        center_bottom = _normalize_point(vehicle.get("center_bottom"))
        if bbox is None or center_bottom is None:
            return False

        key = (normalized_camera_id, track_id)
        previous_sample = last_trajectory_sample_at.get(key)
        if previous_sample and _ms_between(previous_sample, timestamp) < TRAJECTORY_SAMPLE_INTERVAL_MS:
            return False

        state = track_state_cache.get(key) or {}
        current = state.get("current") or {}
        speed_px_s = _to_float(current.get("speed_px_s"))
        confidence = _get_detection_confidence(vehicle)

        row = VehicleTrajectory(
            timestamp=timestamp,
            camera_id=normalized_camera_id,
            track_id=track_id,
            raw_track_id=_to_int(vehicle.get("raw_track_id")),
            class_name=str(vehicle.get("class") or vehicle.get("class_name") or ""),
            bbox_json=json.dumps(bbox, ensure_ascii=False),
            center_bottom_x=float(center_bottom["x"]),
            center_bottom_y=float(center_bottom["y"]),
            lane_id=lane_id,
            speed_px_s=speed_px_s,
            confidence=confidence,
        )
        db.add(row)
        db.commit()
        last_trajectory_sample_at[key] = timestamp
        return True
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        print(f"[ANALYTICS WARNING] sample trajectory skipped: {exc}")
        return False


def update_lane_trajectory_analytics(
    db: Session,
    camera_id: str,
    vehicles: Iterable[Mapping[str, Any]],
    timestamp: datetime,
) -> Dict[str, Any]:
    """Assign lanes, update memory state, and persist sampled trajectory rows."""
    stats: Dict[str, Any] = {
        "seen": 0,
        "state_updated": 0,
        "saved": 0,
        "events": 0,
        "skipped": 0,
        "skipped_missing_payload": 0,
        "lane_distribution": {},
    }
    normalized_camera_id = str(camera_id or "").strip()
    vehicles_list = list(vehicles or [])
    if not normalized_camera_id or not vehicles_list:
        return stats

    cleanup_track_state_cache(timestamp)
    lane_configs = _get_lane_configs_cached(db, normalized_camera_id)

    for vehicle in vehicles_list:
        stats["seen"] += 1
        try:
            bbox = _normalize_bbox(vehicle.get("bbox"))
            center_bottom = _normalize_point(vehicle.get("center_bottom"))
            if bbox is None or center_bottom is None:
                stats["skipped"] += 1
                stats["skipped_missing_payload"] += 1
                continue

            lane_id = assign_lane_by_polygon(center_bottom, lane_configs) if lane_configs else None
            lane_key = lane_id or "None"
            lane_distribution = stats["lane_distribution"]
            lane_distribution[lane_key] = int(lane_distribution.get(lane_key, 0) or 0) + 1

            state = update_track_state_cache(normalized_camera_id, vehicle, lane_id, timestamp)
            if state is None:
                stats["skipped"] += 1
                continue
            stats["state_updated"] += 1
            if sample_and_save_trajectory(db, normalized_camera_id, vehicle, lane_id, timestamp):
                stats["saved"] += 1

            try:
                event = detect_cut_in_event(
                    normalized_camera_id,
                    state,
                    list(track_state_cache.values()),
                    lane_configs,
                    timestamp,
                )
                if event and save_traffic_event(db, event) is not None:
                    stats["events"] += 1
            except Exception as exc:
                print(f"[ANALYTICS WARNING] cut-in event skipped: {exc}")
        except Exception as exc:
            stats["skipped"] += 1
            print(f"[ANALYTICS WARNING] vehicle trajectory skipped: {exc}")

    if ANALYTICS_DEBUG:
        print(
            "[ANALYTICS DEBUG] "
            f"camera_id={normalized_camera_id} vehicles={stats['seen']} "
            f"saved={stats['saved']} skipped_missing_payload={stats['skipped_missing_payload']} "
            f"lanes={stats['lane_distribution']} events={stats['events']}"
        )

    return stats
