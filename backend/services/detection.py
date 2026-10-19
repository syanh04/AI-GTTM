"""Detection presentation, demo ownership, and query helpers.

The inference pipeline owns how detections are produced.  This service only
normalizes and serializes already-persisted detections so API routes and
presentation code share one stable contract.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any, Callable

import cv2

try:
    from ..curated_evidence import is_curated_evidence
    from .evidence import resolve_runtime_image_path
except ImportError:  # pragma: no cover - direct backend script mode
    from curated_evidence import is_curated_evidence
    from services.evidence import resolve_runtime_image_path


_demo_owner_registry_path = ""
_demo_owner_registry_cache: dict[str, Any] | None = None
_detection_model: Any = None
_get_image_b64: Callable[[str], str] | None = None
_detection_has_complete_evidence: Callable[[Any], bool] | None = None
_effective_review_status: Callable[[Any], str] | None = None
_normalize_plate_number: Callable[..., tuple[str, Any]] | None = None


def configure_detection_service(
    *,
    demo_owner_registry_path: str,
    detection_model: Any,
    get_image_b64: Callable[[str], str],
    detection_has_complete_evidence: Callable[[Any], bool],
    effective_review_status: Callable[[Any], str],
    normalize_plate_number: Callable[..., tuple[str, Any]],
) -> None:
    """Inject application dependencies without importing main or inference."""
    global _demo_owner_registry_path
    global _demo_owner_registry_cache
    global _detection_model
    global _get_image_b64
    global _detection_has_complete_evidence
    global _effective_review_status
    global _normalize_plate_number

    normalized_path = os.path.abspath(demo_owner_registry_path)
    if normalized_path != _demo_owner_registry_path:
        _demo_owner_registry_cache = None
    _demo_owner_registry_path = normalized_path
    _detection_model = detection_model
    _get_image_b64 = get_image_b64
    _detection_has_complete_evidence = detection_has_complete_evidence
    _effective_review_status = effective_review_status
    _normalize_plate_number = normalize_plate_number


def _require_dependency(value: Any, name: str) -> Any:
    if value is None:
        raise RuntimeError(f"Detection service dependency '{name}' is not configured")
    return value


def normalize_demo_plate(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def evidence_lighting_condition(image_path: str) -> str:
    """Use persisted vehicle evidence to label day/night presentation records."""
    resolved = resolve_runtime_image_path(str(image_path or ""))
    if not resolved:
        return "unknown"
    try:
        image = cv2.imread(resolved, cv2.IMREAD_GRAYSCALE)
        if image is None or image.size == 0:
            return "unknown"
        return "night" if float(image.mean()) < 85.0 else "day"
    except (OSError, ValueError, cv2.error):
        return "unknown"


def load_demo_owner_registry() -> dict[str, Any]:
    global _demo_owner_registry_cache
    if _demo_owner_registry_cache is not None:
        return _demo_owner_registry_cache

    registry: dict[str, Any] = {"profiles": [], "plate_map": {}}
    try:
        with open(_demo_owner_registry_path, "r", encoding="utf-8") as registry_file:
            payload = json.load(registry_file)
        profiles = payload.get("profiles") if isinstance(payload, dict) else []
        plate_rows = payload.get("plate_map") if isinstance(payload, dict) else []
        if not isinstance(profiles, list):
            profiles = []

        plate_map: dict[str, dict[str, Any]] = {}
        for row in plate_rows if isinstance(plate_rows, list) else []:
            if not isinstance(row, dict):
                continue
            plate = normalize_demo_plate(row.get("plate_number"))
            profile_index = row.get("profile_index")
            if not plate or not isinstance(profile_index, int):
                continue
            if 0 <= profile_index < len(profiles) and isinstance(profiles[profile_index], dict):
                plate_map[plate] = profiles[profile_index]
        registry = {"profiles": profiles, "plate_map": plate_map}
    except Exception:
        registry = {"profiles": [], "plate_map": {}}

    _demo_owner_registry_cache = registry
    return registry


def demo_owner_for_plate(plate_number: Any) -> dict[str, str]:
    token = normalize_demo_plate(plate_number)
    if len(token) < 7 or token in {"UNKNOWN", "CHUAXACNHAN"}:
        return {}

    registry = load_demo_owner_registry()
    profiles = [profile for profile in registry.get("profiles", []) if isinstance(profile, dict)]
    if not profiles:
        return {}

    profile = registry.get("plate_map", {}).get(token)
    source = "demo_registry"
    if not profile:
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        profile = profiles[int(digest[:8], 16) % len(profiles)]
        source = "demo_generated"

    return {
        "owner_name": str(profile.get("name") or "Chu xe demo"),
        "owner_phone": str(profile.get("phone") or ""),
        "owner_email": str(profile.get("email") or ""),
        "owner_address": str(profile.get("address") or ""),
        "owner_source": source,
    }


VEHICLE_LABELS = {
    "car": "Ô tô",
    "truck": "Xe tải",
    "bus": "Xe buýt",
    "moto": "Xe máy",
}


def repair_mojibake_text(value: Any) -> str:
    text = str(value or "")
    if not text:
        return ""

    def badness(candidate: str) -> int:
        markers = ("Ã", "Ä", "Æ", "Â", "ï¿½", "áº", "á»", "?ã", "?óng", "?i")
        return sum(candidate.count(marker) for marker in markers)

    best = text
    best_score = badness(text)
    for codec in ("latin1", "cp1252"):
        try:
            candidate = text.encode(codec).decode("utf-8")
        except UnicodeError:
            continue
        score = badness(candidate)
        if score < best_score:
            best = candidate
            best_score = score
    return best


def normalize_display_text(value: Any) -> str:
    text = repair_mojibake_text(str(value or ""))
    replacements = (
        ("\u0102\"", "\u00d4"),
        ("\u0102\u00b4", "\u00f4"),
        ("t\u0102\u00b4", "t\u00f4"),
        ("t\u00e1\u00ba\u00a3i", "t\u1ea3i"),
        ("t\u0102\u00a1\u00c2\u00ba\u00c2\u00a3i", "t\u1ea3i"),
        ("bu\u0102\u00bdt", "bu\u00fdt"),
        ("bu\u0102\u00fft", "bu\u00fdt"),
        ("m\u0102\u00a1y", "m\u00e1y"),
        ("T\u0102\u00a2y", "T\u00e2y"),
        ("Ho\u0102\u00a0n", "Ho\u00e0n"),
        ("Ki\u00e1\u00ba\u00bfm", "Ki\u1ebfm"),
        ("Li\u0102\u00aam", "Li\u00eam"),
        ("C\u00e1\u00ba\u00a7u", "C\u1ea7u"),
        ("Gi\u00e1\u00ba\u00a5y", "Gi\u1ea5y"),
    )
    for bad, good in replacements:
        text = text.replace(
            bad.encode("utf-8").decode("unicode_escape"),
            good.encode("utf-8").decode("unicode_escape"),
        )
    return repair_mojibake_text(text)


def repair_dict_text_values(data: dict[str, Any]) -> dict[str, Any]:
    return {
        key: normalize_display_text(value) if isinstance(value, str) else value
        for key, value in data.items()
    }


def image_b64_first(*paths: Any) -> str:
    get_image = _require_dependency(_get_image_b64, "get_image_b64")
    for path in paths:
        image = get_image(str(path or ""))
        if image:
            return image
    return ""


def canonical_vehicle_type(raw_value: Any) -> str:
    value = normalize_display_text(raw_value).strip().lower()
    aliases = {
        "car": "car",
        "oto": "car",
        "o to": "car",
        "ô tô": "car",
        "? t?": "car",
        "truck": "truck",
        "xe tải": "truck",
        "xe t?i": "truck",
        "bus": "bus",
        "xe bus": "bus",
        "xe buýt": "bus",
        "xe bu?t": "bus",
        "buýt": "bus",
        "bu?t": "bus",
        "moto": "moto",
        "motorcycle": "moto",
        "motorbike": "moto",
        "xe máy": "moto",
        "xe m?y": "moto",
    }
    return aliases.get(value, value or "unknown")


def serialize_detection(detection: Any) -> dict[str, Any]:
    get_image = _require_dependency(_get_image_b64, "get_image_b64")
    has_complete_evidence = _require_dependency(
        _detection_has_complete_evidence,
        "detection_has_complete_evidence",
    )
    effective_review_status = _require_dependency(
        _effective_review_status,
        "effective_review_status",
    )
    timestamp = detection.timestamp
    last_seen_at = detection.last_seen_at or detection.timestamp
    vehicle_type = canonical_vehicle_type(detection.vehicle_type)
    owner_info = repair_dict_text_values(demo_owner_for_plate(detection.plate_number))
    return {
        "id": detection.id,
        "vehicle_crop_b64": get_image(detection.image_path),
        "plate_crop_b64": get_image(detection.crop_path),
        "plate_number": normalize_display_text(detection.plate_number or ""),
        "ocr_score": float(detection.ocr_score or 0.0),
        "vote_count": int(detection.vote_count or 0),
        "vehicle_type": vehicle_type,
        "vehicle_type_vi": VEHICLE_LABELS.get(vehicle_type, detection.vehicle_type or ""),
        "confidence": detection.confidence or 0.0,
        "timestamp": timestamp.strftime("%d/%m/%Y %H:%M:%S") if timestamp else "",
        "timestamp_iso": (timestamp.strftime("%Y-%m-%dT%H:%M:%S+07:00") if timestamp else ""),
        "timestamp_time": timestamp.strftime("%H:%M:%S") if timestamp else "",
        "timestamp_date": timestamp.strftime("%d/%m/%Y") if timestamp else "",
        "last_seen_at": (last_seen_at.strftime("%Y-%m-%dT%H:%M:%S+07:00") if last_seen_at else ""),
        "camera_id": normalize_display_text(detection.camera_id or ""),
        "track_id": detection.track_id,
        "violation_type": normalize_display_text(detection.violation_type or ""),
        "review_status": effective_review_status(detection),
        "reviewed_by": normalize_display_text(detection.reviewed_by or ""),
        "reviewed_at": (detection.reviewed_at.strftime("%Y-%m-%dT%H:%M:%S+07:00") if detection.reviewed_at else ""),
        "resolved_at": (detection.resolved_at.strftime("%Y-%m-%dT%H:%M:%S+07:00") if detection.resolved_at else ""),
        "review_note": normalize_display_text(detection.review_note or ""),

        "is_simulated": bool(detection.is_simulated),
        "is_temporary": bool(detection.is_temporary),
        "plate_crop_source": detection.plate_crop_source or "",
        "plate_debug_reason": detection.plate_debug_reason or "",
        "plate_debug_variant": detection.plate_debug_variant or "",
        "lighting_condition": evidence_lighting_condition(detection.image_path),
        "image_path": detection.image_path,
        "crop_path": detection.crop_path,
        "evidence_complete": has_complete_evidence(detection),
        "evidence_curated": is_curated_evidence(detection.id),
        "evidence_pair_id": (
            f"DET-{int(detection.id)}-{normalize_display_text(detection.camera_id or 'CAM')}-"
            f"T{int(detection.track_id) if detection.track_id is not None else 0}"
        ),
        **owner_info,
    }


def filter_complete_evidence_paths(query: Any) -> Any:
    detection_model = _require_dependency(_detection_model, "detection_model")
    return (
        query
        # Rejected evidence is retained for audit, but must never be shown as
        # a valid vehicle/plate pair in the presentation log.
        .filter((detection_model.review_status.is_(None)) | (detection_model.review_status != "rejected"))
        .filter(detection_model.image_path.isnot(None))
        .filter(detection_model.image_path != "")
        .filter(detection_model.crop_path.isnot(None))
        .filter(detection_model.crop_path != "")
    )


def normalize_plate_payload(vehicle_data: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(vehicle_data)
    raw_plate = (normalized.get("plate_number", "") or "").strip()
    if not raw_plate:
        return normalized

    expected_vehicle_type = normalized.get("class") or normalized.get("vehicle_type") or ""
    normalize_plate = _require_dependency(_normalize_plate_number, "normalize_plate_number")
    fixed_plate, _ = normalize_plate(
        raw_plate,
        verbose=False,
        expected_vehicle_type=str(expected_vehicle_type or ""),
    )
    if fixed_plate:
        normalized["plate_number"] = fixed_plate
        if fixed_plate != raw_plate:
            print(f"[DEBUG-LOG] plate normalize '{raw_plate}' -> '{fixed_plate}'")
    return normalized
