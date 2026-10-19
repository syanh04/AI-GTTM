"""Evidence file storage and integrity helpers.

This module deliberately contains no FastAPI or database dependencies.  The
application configures its runtime directories once during import, while API
routes and stream workers use the same file contract.
"""
from __future__ import annotations

import base64
import os
import re
import time
from functools import lru_cache
from typing import Any, Iterable, Tuple

import cv2


_base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_processed_crops_dir = os.path.join(_base_dir, "processed", "crops")
_runtime_image_search_dirs: tuple[str, ...] = ()


def configure_evidence_storage(
    *,
    base_dir: str,
    processed_crops_dir: str,
    search_dirs: Iterable[str],
) -> None:
    """Configure runtime paths without coupling this service to inference."""
    global _base_dir, _processed_crops_dir, _runtime_image_search_dirs
    _base_dir = os.path.abspath(base_dir)
    _processed_crops_dir = os.path.abspath(processed_crops_dir)
    _runtime_image_search_dirs = tuple(os.path.abspath(path) for path in search_dirs)
    resolve_runtime_image_path.cache_clear()


def _existing_image_file(path: Any) -> str:
    candidate = str(path or "").strip().strip('"').strip("'")
    if not candidate:
        return ""
    try:
        candidate = os.path.normpath(os.path.expandvars(os.path.expanduser(candidate)))
        return candidate if os.path.isfile(candidate) else ""
    except (OSError, ValueError):
        return ""


@lru_cache(maxsize=8192)
def resolve_runtime_image_path(path: str) -> str:
    """Resolve saved evidence paths after the project directory is moved."""
    raw = str(path or "").strip().strip('"').strip("'")
    if not raw:
        return ""

    if raw.startswith("file:///"):
        raw = raw[8:]
    elif raw.startswith("file://"):
        raw = raw[7:]

    direct = _existing_image_file(raw)
    if direct:
        return direct

    candidates: list[str] = []
    if not os.path.isabs(raw):
        candidates.extend([
            os.path.join(_base_dir, raw),
            os.path.join(os.path.dirname(_base_dir), raw),
        ])

    normalized = raw.replace("\\", "/")
    parts = [part for part in normalized.split("/") if part]
    backend_indices = [index for index, part in enumerate(parts) if part.lower() == "backend"]
    for index in reversed(backend_indices):
        suffix = parts[index + 1:]
        if suffix:
            candidates.append(os.path.join(_base_dir, *suffix))

    for candidate in candidates:
        existing = _existing_image_file(candidate)
        if existing:
            return existing

    basename = os.path.basename(os.path.normpath(raw))
    if not basename:
        return ""
    for root in _runtime_image_search_dirs:
        if not os.path.isdir(root):
            continue
        for current_root, _dirs, files in os.walk(root):
            if basename in files:
                existing = _existing_image_file(os.path.join(current_root, basename))
                if existing:
                    return existing
    return ""


def get_image_b64(path: str) -> str:
    resolved_path = resolve_runtime_image_path(path)
    if not resolved_path:
        return ""
    try:
        with open(resolved_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")
    except (OSError, ValueError):
        return ""


def build_detection_crop_path(
    kind: str,
    *,
    detection_id: int | None = None,
    track_id: int | None = None,
    camera_id: str = "",
) -> str:
    if detection_id is not None:
        return os.path.join(_processed_crops_dir, f"detection_{int(detection_id)}_{kind}.jpg")
    if track_id is not None:
        camera_key = re.sub(r"[^A-Za-z0-9_-]", "", str(camera_id or "CAM").upper()) or "CAM"
        return os.path.join(_processed_crops_dir, f"{camera_key}_track_{int(track_id)}_{kind}.jpg")
    return ""


def write_b64_crop(payload: str, path: str) -> str:
    if not payload or not path:
        return ""
    try:
        raw = payload.split(",", 1)[1] if "," in payload else payload
        with open(path, "wb") as crop_file:
            crop_file.write(base64.b64decode(raw + "=="))
        resolve_runtime_image_path.cache_clear()
        return path
    except Exception as exc:
        print(f"[CROP] Khong the luu anh '{path}': {exc}")
        return ""


def evidence_pair_payload_ready(
    vehicle_payload: str,
    plate_payload: str,
    plate_source: str = "",
) -> bool:
    """Reject cached plates because a reused track id may point at another car."""
    return bool(
        str(vehicle_payload or "").strip()
        and str(plate_payload or "").strip()
        and str(plate_source or "").strip().lower() != "cache"
    )


def write_b64_evidence_pair(
    vehicle_payload: str,
    plate_payload: str,
    vehicle_path: str,
    plate_path: str,
) -> Tuple[str, str]:
    """Validate and replace both evidence files atomically as one pair."""
    if not evidence_pair_payload_ready(vehicle_payload, plate_payload) or not vehicle_path or not plate_path:
        return "", ""

    revision = str(time.time_ns())
    vehicle_temp = f"{vehicle_path}.pair-{revision}.tmp"
    plate_temp = f"{plate_path}.pair-{revision}.tmp"
    vehicle_backup = f"{vehicle_path}.pair-{revision}.bak"
    plate_backup = f"{plate_path}.pair-{revision}.bak"
    targets = ((vehicle_path, vehicle_temp, vehicle_backup), (plate_path, plate_temp, plate_backup))
    try:
        if not write_b64_crop(vehicle_payload, vehicle_temp):
            return "", ""
        if not write_b64_crop(plate_payload, plate_temp):
            return "", ""
        for temp_path in (vehicle_temp, plate_temp):
            image = cv2.imread(temp_path)
            if image is None or image.size == 0:
                return "", ""

        for target_path, _temp_path, backup_path in targets:
            if os.path.exists(target_path):
                os.replace(target_path, backup_path)
        try:
            os.replace(vehicle_temp, vehicle_path)
            os.replace(plate_temp, plate_path)
            resolve_runtime_image_path.cache_clear()
        except Exception:
            for target_path, _temp_path, backup_path in targets:
                if os.path.exists(target_path):
                    os.remove(target_path)
                if os.path.exists(backup_path):
                    os.replace(backup_path, target_path)
            raise
        for _target_path, _temp_path, backup_path in targets:
            if os.path.exists(backup_path):
                os.remove(backup_path)
        return vehicle_path, plate_path
    except Exception as exc:
        print(f"[CROP] Khong the luu cap anh chung cu: {exc}")
        return "", ""
    finally:
        for cleanup_path in (vehicle_temp, plate_temp, vehicle_backup, plate_backup):
            try:
                if os.path.exists(cleanup_path):
                    os.remove(cleanup_path)
            except OSError:
                pass


def detection_has_complete_evidence(detection: Any) -> bool:
    vehicle_path = resolve_runtime_image_path(str(getattr(detection, "image_path", "") or ""))
    plate_path = resolve_runtime_image_path(str(getattr(detection, "crop_path", "") or ""))
    return bool(
        vehicle_path
        and plate_path
        and os.path.isfile(vehicle_path)
        and os.path.isfile(plate_path)
    )
