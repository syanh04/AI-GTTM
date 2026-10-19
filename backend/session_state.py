"""Thread-safe runtime state scoped by source mode and camera.

The original implementation kept every tracked vehicle in one process-wide
dictionary.  Clearing one camera therefore cleared the live state for all
other cameras.  This module keeps the same in-memory behaviour, but makes the
scope explicit so callers can reset or read one camera without disturbing the
rest of the process.
"""

from datetime import datetime
from threading import RLock
from typing import Any, Dict, List, Optional, Tuple


SessionScope = Tuple[str, str]
VehicleKey = Tuple[str, str, str]


# These names remain module-level for backwards compatibility with diagnostic
# code, but access must go through the functions below.
session_vehicles: Dict[VehicleKey, Dict[str, Any]] = {}
session_metadata: Dict[SessionScope, Dict[str, Any]] = {}
session_lock = RLock()


def normalize_camera_id(camera_id: Any) -> str:
    """Return a stable camera key used by all runtime state."""
    return str(camera_id or "CAM_01").strip().upper() or "CAM_01"


def normalize_source_mode(source_mode: Any) -> str:
    """Collapse transport aliases into the two source modes used by the API."""
    normalized = str(source_mode or "default").strip().lower()
    if normalized in {"rtsp", "live"}:
        return "rtsp"
    if normalized in {"", "default", "file", "upload", "video"}:
        return "default"
    return normalized


def _scope(camera_id: Any, source_mode: Any) -> SessionScope:
    return normalize_source_mode(source_mode), normalize_camera_id(camera_id)


def _copy_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "source_mode": metadata["source_mode"],
        "camera_id": metadata["camera_id"],
        "session_started_at": metadata["session_started_at"],
        "generation": int(metadata["generation"]),
    }


def ensure_session(
    camera_id: Any = "CAM_01",
    source_mode: Any = "default",
    *,
    started_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Return a session snapshot, creating the scoped session if necessary."""
    source_key, camera_key = _scope(camera_id, source_mode)
    with session_lock:
        metadata = session_metadata.get((source_key, camera_key))
        if metadata is None:
            metadata = {
                "source_mode": source_key,
                "camera_id": camera_key,
                "session_started_at": started_at or datetime.now().astimezone(),
                "generation": 0,
            }
            session_metadata[(source_key, camera_key)] = metadata
        return _copy_metadata(metadata)


def reset_session(
    camera_id: Any = "CAM_01",
    source_mode: Any = "default",
    *,
    started_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Atomically start a new session and clear only that scope's vehicles."""
    source_key, camera_key = _scope(camera_id, source_mode)
    with session_lock:
        previous = session_metadata.get((source_key, camera_key))
        metadata = {
            "source_mode": source_key,
            "camera_id": camera_key,
            "session_started_at": started_at or datetime.now().astimezone(),
            "generation": int(previous.get("generation", 0) if previous else 0) + 1,
        }
        session_metadata[(source_key, camera_key)] = metadata
        for key in list(session_vehicles):
            if key[0] == source_key and key[1] == camera_key:
                session_vehicles.pop(key, None)
        return _copy_metadata(metadata)


def list_sessions(
    camera_id: Any = "",
    source_mode: Any = "",
) -> List[Dict[str, Any]]:
    """List snapshots matching optional camera/source filters."""
    camera_filter = normalize_camera_id(camera_id) if str(camera_id or "").strip() else ""
    source_filter = normalize_source_mode(source_mode) if str(source_mode or "").strip() else ""
    with session_lock:
        items = [
            _copy_metadata(metadata)
            for (source_key, camera_key), metadata in session_metadata.items()
            if (not source_filter or source_key == source_filter)
            and (not camera_filter or camera_key == camera_filter)
        ]
    return sorted(items, key=lambda item: (item["source_mode"], item["camera_id"]))


def update_vehicle(
    track_id: Any,
    data: Dict[str, Any],
    *,
    camera_id: Any = "",
    source_mode: Any = "default",
) -> None:
    """Update one vehicle without colliding with another camera's track id."""
    camera_key = normalize_camera_id(camera_id or data.get("camera_id") or data.get("camera"))
    source_key = normalize_source_mode(source_mode)
    vehicle_key = (source_key, camera_key, str(track_id))
    payload = dict(data)
    payload.setdefault("camera", camera_key)
    payload.setdefault("camera_id", camera_key)
    with session_lock:
        session_vehicles[vehicle_key] = payload


def get_all_vehicles(
    camera_id: Any = "",
    source_mode: Any = "",
) -> List[Dict[str, Any]]:
    """Return vehicle snapshots matching optional camera/source filters."""
    camera_filter = normalize_camera_id(camera_id) if str(camera_id or "").strip() else ""
    source_filter = normalize_source_mode(source_mode) if str(source_mode or "").strip() else ""
    with session_lock:
        return [
            dict(data)
            for (source_key, camera_key, _track_id), data in session_vehicles.items()
            if (not source_filter or source_key == source_filter)
            and (not camera_filter or camera_key == camera_filter)
        ]


def clear_vehicles(camera_id: Any = "", source_mode: Any = "") -> None:
    """Clear matching vehicles; no filters retains the legacy clear-all action."""
    camera_filter = normalize_camera_id(camera_id) if str(camera_id or "").strip() else ""
    source_filter = normalize_source_mode(source_mode) if str(source_mode or "").strip() else ""
    with session_lock:
        if not camera_filter and not source_filter:
            session_vehicles.clear()
            return
        for key in list(session_vehicles):
            source_key, camera_key, _track_id = key
            if (not source_filter or source_key == source_filter) and (
                not camera_filter or camera_key == camera_filter
            ):
                session_vehicles.pop(key, None)


def get_vehicle_count(camera_id: Any = "", source_mode: Any = "") -> int:
    """Return the count in the requested scope without copying payloads."""
    camera_filter = normalize_camera_id(camera_id) if str(camera_id or "").strip() else ""
    source_filter = normalize_source_mode(source_mode) if str(source_mode or "").strip() else ""
    with session_lock:
        return sum(
            1
            for source_key, camera_key, _track_id in session_vehicles
            if (not source_filter or source_key == source_filter)
            and (not camera_filter or camera_key == camera_filter)
        )
