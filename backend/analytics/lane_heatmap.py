"""Aggregated lane heatmap and lane traffic statistics APIs."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import pytz
from sqlalchemy.orm import Session

try:
    from ..database import VehicleTrajectory
except ImportError:  # pragma: no cover - direct script execution fallback
    from database import VehicleTrajectory

from .config import (
    HEATMAP_DEFAULT_GRID_SIZE,
    HEATMAP_DEFAULT_RANGE_HOURS,
    HEATMAP_MAX_BINS,
    HEATMAP_MAX_RANGE_HOURS,
)

_VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")


def _vn_now() -> datetime:
    return datetime.now(_VN_TZ)


def _parse_datetime(value: Optional[str], field_name: str) -> Optional[datetime]:
    if value is None or str(value).strip() == "":
        return None
    raw = str(value).strip()
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception as exc:
        raise ValueError(f"{field_name} must be an ISO datetime") from exc
    if parsed.tzinfo is None:
        parsed = _VN_TZ.localize(parsed)
    return parsed


def parse_time_range(start: Optional[str], end: Optional[str]) -> Tuple[datetime, datetime]:
    """Parse and validate an analytics time range.

    Missing start/end defaults to the most recent HEATMAP_DEFAULT_RANGE_HOURS.
    Ranges longer than HEATMAP_MAX_RANGE_HOURS raise ValueError instead of
    silently clamping, so callers know their query would be too heavy.
    """
    parsed_end = _parse_datetime(end, "end") or _vn_now()
    parsed_start = _parse_datetime(start, "start") or (parsed_end - timedelta(hours=HEATMAP_DEFAULT_RANGE_HOURS))

    if parsed_start >= parsed_end:
        raise ValueError("start must be before end")

    max_delta = timedelta(hours=HEATMAP_MAX_RANGE_HOURS)
    if parsed_end - parsed_start > max_delta:
        raise ValueError(f"time range must not exceed {HEATMAP_MAX_RANGE_HOURS} hours")

    return parsed_start, parsed_end


def _base_query(
    db: Session,
    camera_id: str,
    start: datetime,
    end: datetime,
    lane_id: Optional[str] = None,
    class_name: Optional[str] = None,
):
    query = (
        db.query(VehicleTrajectory)
        .filter(VehicleTrajectory.camera_id == camera_id)
        .filter(VehicleTrajectory.timestamp >= start)
        .filter(VehicleTrajectory.timestamp <= end)
    )
    if lane_id:
        query = query.filter(VehicleTrajectory.lane_id == lane_id)
    if class_name:
        query = query.filter(VehicleTrajectory.class_name == class_name)
    return query


def aggregate_lane_heatmap_grid(
    db: Session,
    camera_id: str,
    start: datetime,
    end: datetime,
    lane_id: Optional[str] = None,
    class_name: Optional[str] = None,
    grid_size: int = HEATMAP_DEFAULT_GRID_SIZE,
) -> Dict[str, Any]:
    """Aggregate trajectory points into grid bins; never returns raw rows."""
    normalized_camera_id = str(camera_id or "").strip()
    if not normalized_camera_id:
        raise ValueError("camera_id is required")

    grid_size = int(grid_size or HEATMAP_DEFAULT_GRID_SIZE)
    if grid_size <= 0:
        raise ValueError("grid_size must be positive")

    rows = (
        _base_query(db, normalized_camera_id, start, end, lane_id, class_name)
        .with_entities(
            VehicleTrajectory.center_bottom_x,
            VehicleTrajectory.center_bottom_y,
            VehicleTrajectory.lane_id,
        )
        .all()
    )

    bins: Dict[Tuple[float, float, Optional[str]], Dict[str, Any]] = {}
    lane_totals: Dict[Optional[str], int] = defaultdict(int)

    for x, y, row_lane_id in rows:
        if x is None or y is None:
            continue
        gx = int(float(x) // grid_size) * grid_size + grid_size / 2
        gy = int(float(y) // grid_size) * grid_size + grid_size / 2
        key = (float(gx), float(gy), row_lane_id)
        if key not in bins:
            bins[key] = {"x": float(gx), "y": float(gy), "weight": 0, "lane_id": row_lane_id}
        bins[key]["weight"] += 1
        lane_totals[row_lane_id] += 1

    points = sorted(bins.values(), key=lambda item: item["weight"], reverse=True)[:HEATMAP_MAX_BINS]
    lanes = [
        {"lane_id": lane_key, "total_points": total}
        for lane_key, total in sorted(lane_totals.items(), key=lambda item: str(item[0] or ""))
    ]

    return {
        "camera_id": normalized_camera_id,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "grid_size": grid_size,
        "calibrated": False,
        "unit_note": "Heatmap ???c gom theo grid t? trajectory realtime ?? l?u.",
        "points": points,
        "lanes": lanes,
    }


def _bucket_start(timestamp: datetime, bucket_seconds: int) -> datetime:
    epoch = int(timestamp.timestamp())
    bucket_epoch = epoch - (epoch % bucket_seconds)
    if timestamp.tzinfo is None:
        return datetime.fromtimestamp(bucket_epoch)
    return datetime.fromtimestamp(bucket_epoch, tz=timestamp.tzinfo)


def aggregate_lane_stats(
    db: Session,
    camera_id: str,
    start: datetime,
    end: datetime,
    lane_id: Optional[str] = None,
    class_name: Optional[str] = None,
    bucket_seconds: int = 60,
) -> Dict[str, Any]:
    """Aggregate unique vehicles and relative density per lane."""
    normalized_camera_id = str(camera_id or "").strip()
    if not normalized_camera_id:
        raise ValueError("camera_id is required")

    bucket_seconds = int(bucket_seconds or 60)
    if bucket_seconds <= 0:
        raise ValueError("bucket_seconds must be positive")

    rows = (
        _base_query(db, normalized_camera_id, start, end, lane_id, class_name)
        .with_entities(
            VehicleTrajectory.timestamp,
            VehicleTrajectory.track_id,
            VehicleTrajectory.lane_id,
            VehicleTrajectory.speed_px_s,
            VehicleTrajectory.speed_m_s,
        )
        .all()
    )

    lane_tracks: Dict[Optional[str], set] = defaultdict(set)
    lane_points: Dict[Optional[str], int] = defaultdict(int)
    lane_speed_px: Dict[Optional[str], List[float]] = defaultdict(list)
    lane_speed_m: Dict[Optional[str], List[float]] = defaultdict(list)
    timeline_tracks: Dict[datetime, Dict[Optional[str], set]] = defaultdict(lambda: defaultdict(set))

    for ts, track_id, row_lane_id, speed_px_s, speed_m_s in rows:
        lane_tracks[row_lane_id].add(track_id)
        lane_points[row_lane_id] += 1
        if speed_px_s is not None:
            lane_speed_px[row_lane_id].append(float(speed_px_s))
        if speed_m_s is not None:
            lane_speed_m[row_lane_id].append(float(speed_m_s))
        if ts is not None:
            timeline_tracks[_bucket_start(ts, bucket_seconds)][row_lane_id].add(track_id)

    duration_minutes = max((end - start).total_seconds() / 60.0, 1e-9)
    max_points = max(lane_points.values(), default=0) or 1
    all_lanes = sorted(set(lane_tracks.keys()) | set(lane_points.keys()), key=lambda value: str(value or ""))

    items = []
    for lane_key in all_lanes:
        speeds_px = lane_speed_px.get(lane_key, [])
        speeds_m = lane_speed_m.get(lane_key, [])
        total_vehicles = len(lane_tracks.get(lane_key, set()))
        items.append({
            "lane_id": lane_key,
            "total_vehicles": total_vehicles,
            "vehicles_per_minute": round(total_vehicles / duration_minutes, 3),
            "density": round(lane_points.get(lane_key, 0) / max_points, 4),
            "avg_speed_px_s": round(sum(speeds_px) / len(speeds_px), 3) if speeds_px else None,
            "avg_speed_m_s": round(sum(speeds_m) / len(speeds_m), 3) if speeds_m else None,
        })

    timeline = []
    for bucket, lane_map in sorted(timeline_tracks.items(), key=lambda item: item[0]):
        row: Dict[str, Any] = {"time": bucket.strftime("%H:%M")}
        for lane_key, tracks in sorted(lane_map.items(), key=lambda item: str(item[0] or "")):
            row[str(lane_key or "unknown")] = len(tracks)
        timeline.append(row)

    return {
        "camera_id": normalized_camera_id,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "calibrated": False,
        "speed_unit": "px/s",
        "unit_note": "density l? m?t ?? t??ng ??i d?a tr?n s? ?i?m trajectory trong kho?ng th?i gian l?c.",
        "items": items,
        "timeline": timeline,
    }
