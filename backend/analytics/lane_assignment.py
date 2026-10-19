"""Lane assignment helpers for tracked vehicle points."""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Optional

from .geometry import point_in_polygon


def assign_lane_by_polygon(center_bottom: Any, lane_configs: Iterable[Mapping[str, Any]]) -> Optional[str]:
    """Return the first active lane_id whose polygon contains center_bottom."""
    if center_bottom is None or not lane_configs:
        return None

    for lane in lane_configs:
        try:
            if lane.get("is_active") is False:
                continue
            lane_id = str(lane.get("lane_id") or "").strip()
            polygon = lane.get("polygon") or []
            if lane_id and point_in_polygon(center_bottom, polygon):
                return lane_id
        except Exception:
            continue
    return None
