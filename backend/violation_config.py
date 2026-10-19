import copy
import json
import os
import threading
from typing import Any, Dict, List


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if (
    os.getenv("APP_ENV", "development").strip().lower() in {"production", "prod"}
    and not os.getenv("VIOLATION_CONFIG_PATH", "").strip()
):
    raise RuntimeError("VIOLATION_CONFIG_PATH is required when APP_ENV=production")
VIOLATION_CONFIG_PATH = os.path.abspath(
    os.getenv("VIOLATION_CONFIG_PATH", os.path.join(BASE_DIR, "violation_configs.json"))
)
os.makedirs(os.path.dirname(VIOLATION_CONFIG_PATH), exist_ok=True)

_CONFIG_LOCK = threading.Lock()

_AREA_TYPES = {
    "stop-line",
    "turn-zone",
    "approach-lane-zone",
    "right-turn-exit-zone",
    "straight-exit-zone",
    "arrow-signal-zone",
    "permission-sign-zone",
}
_PERMISSION_SOURCES = {"arrow-signal", "static-sign", "arrow-or-sign"}
_VEHICLE_SCOPES = {"all", "motorbike", "car", "motorbike-car"}
_MAIN_SIGNAL_STATES = {"red", "yellow", "green"}
_MOVEMENT_TYPES = {"right_turn", "straight"}
_VIOLATION_DIRECTIONS = {
    "bottom_to_top",
    "top_to_bottom",
    "left_to_right",
    "right_to_left",
}


def _default_areas() -> List[Dict[str, Any]]:
    return [
        {
            "id": "stop-main",
            "type": "stop-line",
            "name": "Vạch dừng chính",
            "points": [{"x": 110, "y": 250}, {"x": 455, "y": 250}],
        },
        {
            "id": "turn-right-1",
            "type": "turn-zone",
            "name": "Làn rẽ phải 1",
            "points": [
                {"x": 470, "y": 180},
                {"x": 610, "y": 180},
                {"x": 660, "y": 330},
                {"x": 500, "y": 340},
            ],
        },
        {
            "id": "arrow-right-1",
            "type": "arrow-signal-zone",
            "name": "Đèn mũi tên phải",
            "points": [
                {"x": 630, "y": 60},
                {"x": 740, "y": 60},
                {"x": 740, "y": 150},
                {"x": 630, "y": 150},
            ],
        },
        {
            "id": "sign-right-1",
            "type": "permission-sign-zone",
            "name": "Biển phụ rẽ phải",
            "points": [
                {"x": 560, "y": 150},
                {"x": 720, "y": 150},
                {"x": 720, "y": 230},
                {"x": 560, "y": 230},
            ],
        },
    ]


def _fallback_id(areas: List[Dict[str, Any]], area_type: str) -> str:
    for area in areas:
        if area.get("type") == area_type:
            return str(area.get("id") or "")
    return ""


def _default_right_turn_exception(areas: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "enabled": True,
        "permissionSource": "arrow-or-sign",
        "vehicleScope": "all",
        "stopLineId": _fallback_id(areas, "stop-line"),
        "turnZoneId": _fallback_id(areas, "turn-zone"),
        "arrowSignalZoneId": _fallback_id(areas, "arrow-signal-zone"),
        "permissionSignZoneId": _fallback_id(areas, "permission-sign-zone"),
        "arrowSignalActive": True,
        "permissionSignActive": True,
        "mainSignalState": "red",
        "notes": "Ví dụ: biển phụ hoặc đèn mũi tên cho phép rẽ phải khi đèn đỏ.",
    }


def build_default_violation_config() -> Dict[str, Any]:
    areas = _default_areas()
    return {
        "areas": copy.deepcopy(areas),
        "rightTurnException": _default_right_turn_exception(areas),
        "redLightRules": [],
    }


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(fallback)


def _normalize_points(points: Any, area_type: str) -> List[Dict[str, float]]:
    normalized: List[Dict[str, float]] = []
    if not isinstance(points, list):
        return normalized
    for raw_point in points:
        if not isinstance(raw_point, dict):
            continue
        normalized.append(
            {
                "x": round(_safe_float(raw_point.get("x", 0.0)), 2),
                "y": round(_safe_float(raw_point.get("y", 0.0)), 2),
            }
        )
    min_points = 2 if area_type == "stop-line" else 3
    if len(normalized) < min_points:
        return []
    return normalized


def _normalize_area(raw_area: Any, index: int) -> Dict[str, Any]:
    if not isinstance(raw_area, dict):
        return {}
    area_type = str(raw_area.get("type") or "").strip()
    if area_type not in _AREA_TYPES:
        return {}
    points = _normalize_points(raw_area.get("points", []), area_type)
    if not points:
        return {}
    return {
        "id": str(raw_area.get("id") or f"{area_type}-{index + 1}"),
        "type": area_type,
        "name": str(raw_area.get("name") or f"{area_type}-{index + 1}"),
        "points": points,
    }


def normalize_camera_violation_config(payload: Any) -> Dict[str, Any]:
    fallback = build_default_violation_config()
    raw_payload = payload if isinstance(payload, dict) else {}

    raw_areas = raw_payload.get("areas", [])
    normalized_areas = [
        area
        for idx, raw_area in enumerate(raw_areas if isinstance(raw_areas, list) else [])
        if (area := _normalize_area(raw_area, idx))
    ]
    if not normalized_areas:
        normalized_areas = copy.deepcopy(fallback["areas"])

    default_exception = _default_right_turn_exception(normalized_areas)
    raw_exception = raw_payload.get("rightTurnException", {})
    if not isinstance(raw_exception, dict):
        raw_exception = {}

    permission_source = str(raw_exception.get("permissionSource") or default_exception["permissionSource"])
    if permission_source not in _PERMISSION_SOURCES:
        permission_source = default_exception["permissionSource"]

    vehicle_scope = str(raw_exception.get("vehicleScope") or default_exception["vehicleScope"])
    if vehicle_scope not in _VEHICLE_SCOPES:
        vehicle_scope = default_exception["vehicleScope"]

    main_signal_state = str(raw_exception.get("mainSignalState") or default_exception["mainSignalState"]).lower()
    if main_signal_state not in _MAIN_SIGNAL_STATES:
        main_signal_state = default_exception["mainSignalState"]

    right_turn_exception = {
        "enabled": bool(raw_exception.get("enabled", default_exception["enabled"])),
        "permissionSource": permission_source,
        "vehicleScope": vehicle_scope,
        "stopLineId": str(raw_exception.get("stopLineId") or _fallback_id(normalized_areas, "stop-line")),
        "turnZoneId": str(raw_exception.get("turnZoneId") or _fallback_id(normalized_areas, "turn-zone")),
        "arrowSignalZoneId": str(raw_exception.get("arrowSignalZoneId") or _fallback_id(normalized_areas, "arrow-signal-zone")),
        "permissionSignZoneId": str(raw_exception.get("permissionSignZoneId") or _fallback_id(normalized_areas, "permission-sign-zone")),
        "arrowSignalActive": bool(raw_exception.get("arrowSignalActive", default_exception["arrowSignalActive"])),
        "permissionSignActive": bool(raw_exception.get("permissionSignActive", default_exception["permissionSignActive"])),
        "mainSignalState": main_signal_state,
        "notes": str(raw_exception.get("notes") or ""),
    }

    area_type_by_id = {str(area.get("id")): str(area.get("type")) for area in normalized_areas}
    if area_type_by_id.get(right_turn_exception["stopLineId"]) != "stop-line":
        right_turn_exception["stopLineId"] = _fallback_id(normalized_areas, "stop-line")
    if area_type_by_id.get(right_turn_exception["turnZoneId"]) != "turn-zone":
        right_turn_exception["turnZoneId"] = _fallback_id(normalized_areas, "turn-zone")
    if area_type_by_id.get(right_turn_exception["arrowSignalZoneId"]) != "arrow-signal-zone":
        right_turn_exception["arrowSignalZoneId"] = _fallback_id(normalized_areas, "arrow-signal-zone")
    if area_type_by_id.get(right_turn_exception["permissionSignZoneId"]) != "permission-sign-zone":
        right_turn_exception["permissionSignZoneId"] = _fallback_id(normalized_areas, "permission-sign-zone")

    raw_rules = raw_payload.get("redLightRules", [])
    normalized_rules: List[Dict[str, Any]] = []
    if isinstance(raw_rules, list):
        for idx, raw_rule in enumerate(raw_rules):
            if not isinstance(raw_rule, dict):
                continue
            rule_id = str(raw_rule.get("id") or f"red-light-rule-{idx + 1}").strip()
            traffic_light_id = str(raw_rule.get("trafficLightId") or "").strip()
            stop_line_id = str(raw_rule.get("stopLineId") or "").strip()
            direction = str(raw_rule.get("violationDirection") or "").strip().lower()
            lane_roi = _normalize_points(raw_rule.get("laneRoi", []), "turn-zone")
            if (
                not rule_id
                or not traffic_light_id
                or not stop_line_id
                or direction not in _VIOLATION_DIRECTIONS
                or len(lane_roi) < 3
            ):
                continue
            if area_type_by_id.get(traffic_light_id) != "arrow-signal-zone":
                continue
            if area_type_by_id.get(stop_line_id) != "stop-line":
                continue
            try:
                min_track_points = max(1, int(raw_rule.get("minTrackPoints", 3)))
            except Exception:
                min_track_points = 3
            movement_exceptions: List[Dict[str, Any]] = []
            raw_movement_exceptions = raw_rule.get("movementExceptions", [])
            if isinstance(raw_movement_exceptions, list):
                for ex_idx, raw_exception_rule in enumerate(raw_movement_exceptions):
                    if not isinstance(raw_exception_rule, dict):
                        continue
                    movement = str(raw_exception_rule.get("movement") or "").strip().lower()
                    exception_permission = str(
                        raw_exception_rule.get("permissionSource") or "arrow-or-sign"
                    ).strip()
                    exception_scope = str(raw_exception_rule.get("vehicleScope") or "all").strip()
                    approach_lane_roi = _normalize_points(
                        raw_exception_rule.get("approachLaneRoi", []),
                        "approach-lane-zone",
                    )
                    exit_roi = _normalize_points(
                        raw_exception_rule.get("exitRoi", []),
                        "right-turn-exit-zone",
                    )
                    if (
                        movement not in _MOVEMENT_TYPES
                        or exception_permission not in _PERMISSION_SOURCES
                        or exception_scope not in _VEHICLE_SCOPES
                        or len(approach_lane_roi) < 3
                        or len(exit_roi) < 3
                    ):
                        continue
                    try:
                        max_decision_frames = max(
                            1,
                            int(raw_exception_rule.get("maxDecisionFrames", 8)),
                        )
                    except Exception:
                        max_decision_frames = 8
                    movement_exceptions.append(
                        {
                            "id": str(
                                raw_exception_rule.get("id")
                                or f"{rule_id}-movement-exception-{ex_idx + 1}"
                            ),
                            "movement": movement,
                            "permissionSource": exception_permission,
                            "vehicleScope": exception_scope,
                            "approachLaneRoi": approach_lane_roi,
                            "exitRoi": exit_roi,
                            "maxDecisionFrames": max_decision_frames,
                        }
                    )
            normalized_rules.append(
                {
                    "id": rule_id,
                    "enabled": bool(raw_rule.get("enabled", True)),
                    "trafficLightId": traffic_light_id,
                    "stopLineId": stop_line_id,
                    "laneRoi": lane_roi,
                    "violationDirection": direction,
                    "minTrackPoints": min_track_points,
                    "requirePlateOrCrop": bool(raw_rule.get("requirePlateOrCrop", False)),
                    "movementExceptions": movement_exceptions,
                }
            )

    return {
        "areas": normalized_areas,
        "rightTurnException": right_turn_exception,
        "redLightRules": normalized_rules,
    }


def _read_all_configs_unlocked() -> Dict[str, Dict[str, Any]]:
    if not os.path.exists(VIOLATION_CONFIG_PATH):
        return {}
    try:
        with open(VIOLATION_CONFIG_PATH, "r", encoding="utf-8") as file_obj:
            data = json.load(file_obj)
        if not isinstance(data, dict):
            return {}
        normalized: Dict[str, Dict[str, Any]] = {}
        for camera_id, payload in data.items():
            normalized[str(camera_id)] = normalize_camera_violation_config(payload)
        return normalized
    except Exception:
        return {}


def load_all_violation_configs() -> Dict[str, Dict[str, Any]]:
    with _CONFIG_LOCK:
        return _read_all_configs_unlocked()


def get_violation_config(camera_id: str) -> Dict[str, Any]:
    normalized_camera_id = str(camera_id or "CAM_01").strip() or "CAM_01"
    configs = load_all_violation_configs()
    return configs.get(normalized_camera_id, build_default_violation_config())


def save_violation_config(camera_id: str, payload: Any) -> Dict[str, Any]:
    normalized_camera_id = str(camera_id or "CAM_01").strip() or "CAM_01"
    with _CONFIG_LOCK:
        configs = _read_all_configs_unlocked()
        merged_payload = copy.deepcopy(configs.get(normalized_camera_id, {}))
        if isinstance(payload, dict):
            merged_payload.update(payload)
            if "redLightRules" not in payload and configs.get(normalized_camera_id, {}).get("redLightRules"):
                merged_payload["redLightRules"] = copy.deepcopy(configs[normalized_camera_id]["redLightRules"])
        else:
            merged_payload = payload
        normalized_payload = normalize_camera_violation_config(merged_payload)
        configs[normalized_camera_id] = normalized_payload
        tmp_path = f"{VIOLATION_CONFIG_PATH}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as file_obj:
            json.dump(configs, file_obj, ensure_ascii=False, indent=2)
        os.replace(tmp_path, VIOLATION_CONFIG_PATH)
    return normalized_payload
