"""Rule-based cut-in / dangerous lane-change detector.

The detector consumes in-memory track states produced by trajectory_store. It does
not query trajectory history from the database during stream processing.
"""

from __future__ import annotations

import json
import math
from datetime import datetime
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

from sqlalchemy.orm import Session

try:
    from ..database import TrafficEvent
except ImportError:  # pragma: no cover - direct script execution fallback
    from database import TrafficEvent

from .config import (
    CUTIN_COOLDOWN_SECONDS,
    MAX_GAP_PX,
    MAX_LANE_NONE_RATIO,
    MIN_LANE_STABLE_FRAMES,
    MIN_LATERAL_RATIO,
    MIN_LATERAL_SPEED_PX_S,
    MIN_TRACK_HISTORY_FRAMES,
    PIXEL_TTC_DANGER,
    PIXEL_TTC_WARNING,
)
from .geometry import compute_projection_position, normalize_vector

_cooldown_until: Dict[Tuple[str, int, str], datetime] = {}


def _ts(value: datetime) -> float:
    return float(value.timestamp())


def _current(state: Mapping[str, Any]) -> Mapping[str, Any]:
    return state.get("current") or {}


def _lane_direction(lane_config: Optional[Mapping[str, Any]]) -> Optional[Dict[str, Any]]:
    if not lane_config:
        return None
    vector = normalize_vector(lane_config.get("direction_vector"))
    if vector is None:
        return None
    origin = lane_config.get("direction_start")
    if not isinstance(origin, Mapping):
        polygon = lane_config.get("polygon") or []
        origin = polygon[0] if isinstance(polygon, list) and polygon else {"x": 0.0, "y": 0.0}
    return {"origin": origin, "vector": vector}


def _projection(point: Any, lane_direction: Mapping[str, Any]) -> Optional[Dict[str, float]]:
    return compute_projection_position(point, lane_direction.get("origin"), lane_direction.get("vector"))


def _lane_none_ratio(history: List[Mapping[str, Any]]) -> float:
    if not history:
        return 1.0
    none_count = sum(1 for item in history if not item.get("lane_id"))
    return none_count / len(history)


def detect_stable_lane_change(history: List[Mapping[str, Any]], min_lane_stable_frames: int = MIN_LANE_STABLE_FRAMES) -> Optional[Dict[str, Any]]:
    """Detect latest stable transition from one lane to another."""
    if len(history) < MIN_TRACK_HISTORY_FRAMES:
        return None

    compact = []
    current_lane = None
    current_items: List[Mapping[str, Any]] = []

    for item in history:
        lane_id = item.get("lane_id")
        if not lane_id:
            continue
        if lane_id != current_lane:
            if current_lane is not None and len(current_items) >= min_lane_stable_frames:
                compact.append({"lane_id": current_lane, "items": current_items})
            current_lane = lane_id
            current_items = [item]
        else:
            current_items.append(item)

    if current_lane is not None and len(current_items) >= min_lane_stable_frames:
        compact.append({"lane_id": current_lane, "items": current_items})

    if len(compact) < 2:
        return None

    previous = compact[-2]
    current = compact[-1]
    if previous["lane_id"] == current["lane_id"]:
        return None

    return {
        "from_lane": previous["lane_id"],
        "to_lane": current["lane_id"],
        "change_time": current["items"][0].get("timestamp"),
    }


def compute_lateral_ratio_by_projection(history: List[Mapping[str, Any]], lane_direction: Mapping[str, Any]) -> float:
    projections = [_projection(item.get("point"), lane_direction) for item in history if item.get("point")]
    projections = [p for p in projections if p is not None]
    if len(projections) < 2:
        return 0.0

    lateral_delta = abs(projections[-1]["lateral"] - projections[0]["lateral"])
    longitudinal_delta = abs(projections[-1]["longitudinal"] - projections[0]["longitudinal"])
    return lateral_delta / max(lateral_delta + longitudinal_delta, 1e-6)


def compute_lateral_speed_px_s(history: List[Mapping[str, Any]], lane_direction: Mapping[str, Any]) -> float:
    if len(history) < 2:
        return 0.0
    first = history[0]
    last = history[-1]
    first_proj = _projection(first.get("point"), lane_direction)
    last_proj = _projection(last.get("point"), lane_direction)
    first_ts = first.get("timestamp")
    last_ts = last.get("timestamp")
    if first_proj is None or last_proj is None or not isinstance(first_ts, datetime) or not isinstance(last_ts, datetime):
        return 0.0
    dt = _ts(last_ts) - _ts(first_ts)
    if dt <= 1e-6:
        return 0.0
    return abs(last_proj["lateral"] - first_proj["lateral"]) / dt


def find_rear_vehicle_by_projection(
    vehicle_state: Mapping[str, Any],
    all_track_states: Iterable[Mapping[str, Any]],
    target_lane_config: Mapping[str, Any],
) -> Optional[Dict[str, Any]]:
    """Find nearest vehicle behind the lane-changing vehicle by lane projection."""
    lane_direction = _lane_direction(target_lane_config)
    if lane_direction is None:
        return None

    front_current = _current(vehicle_state)
    front_point = front_current.get("point")
    front_lane = front_current.get("lane_id")
    front_projection = _projection(front_point, lane_direction)
    if front_projection is None:
        return None

    target_lane_id = target_lane_config.get("lane_id")
    candidates = []
    for state in all_track_states:
        if state is vehicle_state:
            continue
        if state.get("track_id") == vehicle_state.get("track_id"):
            continue
        current = _current(state)
        if current.get("lane_id") != target_lane_id:
            continue
        projection = _projection(current.get("point"), lane_direction)
        if projection is None:
            continue
        gap_px = front_projection["longitudinal"] - projection["longitudinal"]
        if gap_px <= 0:
            continue
        candidates.append({"gap_px": float(gap_px), "state": state, "projection": projection})

    if not candidates:
        return None
    return min(candidates, key=lambda item: item["gap_px"])


def compute_pixel_ttc_estimate(front_state: Mapping[str, Any], rear_state: Mapping[str, Any], gap_px: float) -> Optional[float]:
    front_speed = _current(front_state).get("speed_px_s")
    rear_speed = _current(rear_state).get("speed_px_s")
    try:
        relative_speed = float(rear_speed) - float(front_speed)
    except Exception:
        return None
    if relative_speed <= 1e-6:
        return None
    return float(gap_px) / relative_speed


def compute_risk_score(
    gap_px: float,
    pixel_ttc_estimate: Optional[float],
    lateral_speed: float,
    lateral_ratio: float,
) -> float:
    gap_component = max(0.0, min(1.0, 1.0 - (float(gap_px) / max(MAX_GAP_PX, 1))))
    if pixel_ttc_estimate is None:
        ttc_component = 0.35
    else:
        ttc_component = max(0.0, min(1.0, 1.0 - (float(pixel_ttc_estimate) / max(PIXEL_TTC_WARNING, 1e-6))))
    lateral_speed_component = max(0.0, min(1.0, float(lateral_speed) / max(MIN_LATERAL_SPEED_PX_S * 2.0, 1.0)))
    lateral_ratio_component = max(0.0, min(1.0, float(lateral_ratio) / max(MIN_LATERAL_RATIO * 2.0, 1e-6)))
    score = 0.35 * ttc_component + 0.30 * gap_component + 0.20 * lateral_speed_component + 0.15 * lateral_ratio_component
    return round(max(0.0, min(1.0, score)), 4)


def _cooldown_active(camera_id: str, track_id: int, event_type: str, timestamp: datetime) -> bool:
    key = (camera_id, track_id, event_type)
    until = _cooldown_until.get(key)
    return isinstance(until, datetime) and until > timestamp


def _mark_cooldown(camera_id: str, track_id: int, event_type: str, timestamp: datetime) -> None:
    from datetime import timedelta

    _cooldown_until[(camera_id, track_id, event_type)] = timestamp + timedelta(seconds=CUTIN_COOLDOWN_SECONDS)


def detect_cut_in_event(
    camera_id: str,
    vehicle_state: Mapping[str, Any],
    all_track_states: Iterable[Mapping[str, Any]],
    lane_configs: Iterable[Mapping[str, Any]],
    timestamp: datetime,
) -> Optional[Dict[str, Any]]:
    """Return a cut-in event payload when the rule stack confirms risk."""
    try:
        history = list(vehicle_state.get("history") or [])
        if len(history) < MIN_TRACK_HISTORY_FRAMES:
            return None
        if _lane_none_ratio(history) > MAX_LANE_NONE_RATIO:
            return None

        lane_change = detect_stable_lane_change(history, MIN_LANE_STABLE_FRAMES)
        if not lane_change:
            return None

        lane_by_id = {lane.get("lane_id"): lane for lane in lane_configs or [] if lane.get("lane_id")}
        target_lane_config = lane_by_id.get(lane_change["to_lane"])
        lane_direction = _lane_direction(target_lane_config)
        if lane_direction is None:
            return None

        track_id = int(vehicle_state.get("track_id"))
        if _cooldown_active(camera_id, track_id, "cut_in", timestamp):
            return None

        lateral_ratio = compute_lateral_ratio_by_projection(history, lane_direction)
        lateral_speed = compute_lateral_speed_px_s(history, lane_direction)
        if lateral_ratio < MIN_LATERAL_RATIO and lateral_speed < MIN_LATERAL_SPEED_PX_S:
            return None

        rear = find_rear_vehicle_by_projection(vehicle_state, all_track_states, target_lane_config)
        if rear is None:
            return None

        rear_state = rear["state"]
        gap_px = float(rear["gap_px"])
        pixel_ttc_estimate = compute_pixel_ttc_estimate(vehicle_state, rear_state, gap_px)
        if gap_px > MAX_GAP_PX and (pixel_ttc_estimate is None or pixel_ttc_estimate > PIXEL_TTC_WARNING):
            return None

        risk_score = compute_risk_score(gap_px, pixel_ttc_estimate, lateral_speed, lateral_ratio)
        risk_level = "danger" if pixel_ttc_estimate is not None and pixel_ttc_estimate <= PIXEL_TTC_DANGER else "warning"
        _mark_cooldown(camera_id, track_id, "cut_in", timestamp)

        return {
            "event_type": "cut_in",
            "camera_id": camera_id,
            "vehicle_id": track_id,
            "affected_vehicle_id": rear_state.get("track_id"),
            "from_lane": lane_change["from_lane"],
            "to_lane": lane_change["to_lane"],
            "risk_level": risk_level,
            "risk_score": risk_score,
            "pixel_ttc_estimate": round(pixel_ttc_estimate, 4) if pixel_ttc_estimate is not None else None,
            "ttc_seconds": None,
            "gap_px": round(gap_px, 4),
            "gap_m": None,
            "timestamp": timestamp,
            "snapshot_path": None,
            "metadata": {
                "lateral_ratio": round(lateral_ratio, 4),
                "lateral_speed_px_s": round(lateral_speed, 4),
                "calibrated": False,
            },
        }
    except Exception as exc:
        print(f"[ANALYTICS WARNING] cut-in detection skipped: {exc}")
        return None


def save_traffic_event(db: Session, event: Mapping[str, Any]) -> Optional[TrafficEvent]:
    """Persist a detected traffic event. Failures are logged and swallowed."""
    try:
        row = TrafficEvent(
            event_type=str(event.get("event_type") or "cut_in"),
            camera_id=str(event.get("camera_id") or ""),
            vehicle_id=int(event.get("vehicle_id")),
            affected_vehicle_id=event.get("affected_vehicle_id"),
            from_lane=event.get("from_lane"),
            to_lane=event.get("to_lane"),
            risk_level=event.get("risk_level"),
            risk_score=event.get("risk_score"),
            pixel_ttc_estimate=event.get("pixel_ttc_estimate"),
            ttc_seconds=event.get("ttc_seconds"),
            gap_px=event.get("gap_px"),
            gap_m=event.get("gap_m"),
            timestamp=event.get("timestamp"),
            snapshot_path=event.get("snapshot_path"),
            metadata_json=json.dumps(event.get("metadata") or {}, ensure_ascii=False),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        print(f"[ANALYTICS WARNING] save traffic event skipped: {exc}")
        return None
