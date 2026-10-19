"""Geometry helpers for lane analytics.

The helpers here are pure functions. They do not touch the detector, OCR, stream,
or database, so they are safe to unit-test independently.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, Mapping, Optional, Sequence, Tuple

Point = Mapping[str, float]
Vector = Tuple[float, float]
BBox = Sequence[float]


def _point_xy(point: Any) -> Optional[Vector]:
    if isinstance(point, Mapping):
        try:
            return float(point["x"]), float(point["y"])
        except Exception:
            return None
    if isinstance(point, Sequence) and len(point) >= 2 and not isinstance(point, (str, bytes)):
        try:
            return float(point[0]), float(point[1])
        except Exception:
            return None
    return None


def normalize_vector(vector: Any) -> Optional[Dict[str, float]]:
    """Return a unit vector dict, or None when the vector is invalid."""
    xy = _point_xy(vector)
    if xy is None:
        return None

    vx, vy = xy
    length = math.hypot(vx, vy)
    if length <= 1e-9:
        return None

    return {"x": vx / length, "y": vy / length}


def point_in_polygon(point: Any, polygon: Iterable[Any]) -> bool:
    """Ray-casting point-in-polygon test for image coordinates."""
    xy = _point_xy(point)
    if xy is None:
        return False

    vertices = [_point_xy(p) for p in polygon or []]
    vertices = [p for p in vertices if p is not None]
    if len(vertices) < 3:
        return False

    x, y = xy
    inside = False
    j = len(vertices) - 1

    for i, (xi, yi) in enumerate(vertices):
        xj, yj = vertices[j]
        crosses = (yi > y) != (yj > y)
        if crosses:
            x_intersect = (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi
            if x < x_intersect:
                inside = not inside
        j = i

    return inside


def compute_projection_position(point: Any, origin: Any, direction_vector: Any) -> Optional[Dict[str, float]]:
    """Project a point onto lane direction and its perpendicular axis."""
    point_xy = _point_xy(point)
    origin_xy = _point_xy(origin)
    direction = normalize_vector(direction_vector)
    if point_xy is None or origin_xy is None or direction is None:
        return None

    px, py = point_xy
    ox, oy = origin_xy
    vx, vy = direction["x"], direction["y"]
    dx, dy = px - ox, py - oy

    return {
        "longitudinal": dx * vx + dy * vy,
        "lateral": dx * (-vy) + dy * vx,
    }


def bbox_area(bbox: BBox) -> float:
    """Return area for [x1, y1, x2, y2]. Invalid boxes return 0."""
    if not isinstance(bbox, Sequence) or isinstance(bbox, (str, bytes)) or len(bbox) < 4:
        return 0.0
    try:
        x1, y1, x2, y2 = [float(v) for v in bbox[:4]]
    except Exception:
        return 0.0
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


def is_bbox_jump_abnormal(previous_bbox: BBox, current_bbox: BBox, max_jump_ratio: float) -> bool:
    """Detect likely tracker jumps using center displacement vs bbox scale."""
    try:
        px1, py1, px2, py2 = [float(v) for v in previous_bbox[:4]]
        cx1, cy1, cx2, cy2 = [float(v) for v in current_bbox[:4]]
    except Exception:
        return True

    prev_w = max(1.0, px2 - px1)
    prev_h = max(1.0, py2 - py1)
    curr_w = max(1.0, cx2 - cx1)
    curr_h = max(1.0, cy2 - cy1)

    prev_center = ((px1 + px2) / 2.0, (py1 + py2) / 2.0)
    curr_center = ((cx1 + cx2) / 2.0, (cy1 + cy2) / 2.0)
    displacement = math.hypot(curr_center[0] - prev_center[0], curr_center[1] - prev_center[1])
    scale = max(prev_w, prev_h, curr_w, curr_h, 1.0)

    return (displacement / scale) > float(max_jump_ratio)
