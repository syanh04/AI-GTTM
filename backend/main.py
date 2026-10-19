import os
import traceback
import re
import json
import importlib.util
import unicodedata
import secrets
import string
from urllib.parse import urlparse

from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timedelta
from queue import Empty, Full, Queue
from typing import Any, Dict, List, Optional, Tuple
import time
import threading
from random import randint
# ← ÄĂƒ THÊM: randint cho simulation plate
import random
import shutil
import psutil
import numpy as np
import httpx
import uvicorn
import cv2
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from starlette.concurrency import iterate_in_threadpool
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_

try:
    from .database import Detection, NotificationHistory, User, Camera, AuditLog, get_db, init_db, _vn_now, SessionLocal
    from .inference import (
        MODELS_DIR,
        RUNTIME_DATA_DIR,
        DEBUG_SEGMENTS_DIR,
        DETECTIONS_DIR,
        PROCESSED_DIR,
        PROCESSED_CROPS_DIR,
        UPLOADS_DIR,
        annotate_frame_only,
        annotate_frame_with_tracking,
        process_image_file,
        process_video_file,
        clear_ocr_cache,   # XĂ³a cache OCR khi bắt đầu session má»›i
        clear_id_mapping,  # FIX 2: Dat lai bo dem ID tuan tu
        clear_violation_state,
        get_ocr_statistics,
        match_vn_plate,
        normalize_plate_number,
        preload_ai_runtime,
        recognize_plate_crop_file,
        recognize_plate_from_vehicle_file,
    )
    from .violation_config import get_violation_config, save_violation_config
    from .runtime_cleanup import CleanupPolicy, cleanup_runtime, directory_usage_bytes
    from .services.evidence import (
        build_detection_crop_path as _build_detection_crop_path,
        configure_evidence_storage,
        detection_has_complete_evidence as _detection_has_complete_evidence,
        evidence_pair_payload_ready as _evidence_pair_payload_ready,
        get_image_b64 as _get_image_b64,
        resolve_runtime_image_path,
        write_b64_crop as _write_b64_crop,
        write_b64_evidence_pair as _write_b64_evidence_pair,
    )
    from .services.case_workflow import (
        REVIEW_STATUS_LABELS as _REVIEW_STATUS_LABELS,
        case_code_for_detection,
        effective_review_status as _effective_review_status,
        normalize_review_status,
    )
    from .services.plates import normalize_plate as _normalize_plate_safe
    from .services.notification import (
        NotificationDeliveryError,
        deliver_notification,
        parse_notification_sent_at,
        serialize_notification_history as _serialize_notification_history,
    )
    from .services.detection import (
        VEHICLE_LABELS as _VEHICLE_LABELS,
        canonical_vehicle_type as _canonical_vehicle_type,
        configure_detection_service,
        demo_owner_for_plate as _demo_owner_for_plate,
        filter_complete_evidence_paths as _filter_complete_evidence_paths,
        image_b64_first as _image_b64_first,
        normalize_display_text as _normalize_display_text,
        normalize_plate_payload as _normalize_plate_payload,
        repair_dict_text_values as _repair_dict_text_values,
        repair_mojibake_text as _repair_mojibake_text,
        serialize_detection as _serialize_detection,
    )
    from .analytics.trajectory_store import update_lane_trajectory_analytics
    from .streamer import websocket_stream_handler
    from .session_state import (
        ensure_session as _ensure_runtime_session,
        get_all_vehicles,
        get_vehicle_count,
        list_sessions as _list_runtime_sessions,
        normalize_camera_id as _normalize_runtime_camera_id,
        normalize_source_mode as _normalize_runtime_source_mode,
        reset_session as _reset_runtime_session_state,
        update_vehicle as _session_update_vehicle,
    )
    from .routers import analytics, data_center, system_info, zalo
    from .routers.history import register_history_routes
    from .routers.notifications import register_notification_routes
    from .routers.violations import ViolationReviewUpdate, register_violation_routes
    from .assistant_service import (
        build_ollama_messages,
        build_project_context,
        build_system_prompt,
        get_casual_response,
        get_model_unavailable_response,
        get_project_data_response,
        is_project_question,
        resolve_ollama_host,
        select_history_for_scope,
    )
    from .curated_evidence import (
        CURATED_EVIDENCE_IDS,
        CURATED_DAY_EVIDENCE_IDS,
        CURATED_NIGHT_EVIDENCE_IDS,
    )
    from .traffic_law import analyze_traffic_law, should_answer_directly
    from .auth import (
        get_current_user,
        require_admin,
        require_any_role,
        require_chatbot_or_user,
        require_signed_chatbot_notice,
        require_operator,
        hash_password,
        verify_password,
        create_token,
        authenticate_token,
    )
except ImportError:
    from database import Detection, NotificationHistory, User, Camera, AuditLog, get_db, init_db, _vn_now, SessionLocal
    from inference import (
        MODELS_DIR,
        RUNTIME_DATA_DIR,
        DEBUG_SEGMENTS_DIR,
        DETECTIONS_DIR,
        PROCESSED_DIR,
        PROCESSED_CROPS_DIR,
        UPLOADS_DIR,
        annotate_frame_only,
        annotate_frame_with_tracking,
        process_image_file,
        process_video_file,
        clear_ocr_cache,   # XĂ³a cache OCR khi bắt đầu session má»›i
        clear_id_mapping,  # FIX 2: Dat lai bo dem ID tuan tu
        clear_violation_state,
        get_ocr_statistics,
        match_vn_plate,
        normalize_plate_number,
        preload_ai_runtime,
        recognize_plate_crop_file,
        recognize_plate_from_vehicle_file,
    )
    from violation_config import get_violation_config, save_violation_config
    from runtime_cleanup import CleanupPolicy, cleanup_runtime, directory_usage_bytes
    from services.evidence import (
        build_detection_crop_path as _build_detection_crop_path,
        configure_evidence_storage,
        detection_has_complete_evidence as _detection_has_complete_evidence,
        evidence_pair_payload_ready as _evidence_pair_payload_ready,
        get_image_b64 as _get_image_b64,
        resolve_runtime_image_path,
        write_b64_crop as _write_b64_crop,
        write_b64_evidence_pair as _write_b64_evidence_pair,
    )
    from services.case_workflow import (
        REVIEW_STATUS_LABELS as _REVIEW_STATUS_LABELS,
        case_code_for_detection,
        effective_review_status as _effective_review_status,
        normalize_review_status,
    )
    from services.plates import normalize_plate as _normalize_plate_safe
    from services.notification import (
        NotificationDeliveryError,
        deliver_notification,
        parse_notification_sent_at,
        serialize_notification_history as _serialize_notification_history,
    )
    from services.detection import (
        VEHICLE_LABELS as _VEHICLE_LABELS,
        canonical_vehicle_type as _canonical_vehicle_type,
        configure_detection_service,
        demo_owner_for_plate as _demo_owner_for_plate,
        filter_complete_evidence_paths as _filter_complete_evidence_paths,
        image_b64_first as _image_b64_first,
        normalize_display_text as _normalize_display_text,
        normalize_plate_payload as _normalize_plate_payload,
        repair_dict_text_values as _repair_dict_text_values,
        repair_mojibake_text as _repair_mojibake_text,
        serialize_detection as _serialize_detection,
    )
    from analytics.trajectory_store import update_lane_trajectory_analytics
    from streamer import websocket_stream_handler
    from session_state import (
        ensure_session as _ensure_runtime_session,
        get_all_vehicles,
        get_vehicle_count,
        list_sessions as _list_runtime_sessions,
        normalize_camera_id as _normalize_runtime_camera_id,
        normalize_source_mode as _normalize_runtime_source_mode,
        reset_session as _reset_runtime_session_state,
        update_vehicle as _session_update_vehicle,
    )
    from routers import analytics, data_center, system_info, zalo
    from routers.history import register_history_routes
    from routers.notifications import register_notification_routes
    from routers.violations import ViolationReviewUpdate, register_violation_routes
    from assistant_service import (
        build_ollama_messages,
        build_project_context,
        build_system_prompt,
        get_casual_response,
        get_model_unavailable_response,
        get_project_data_response,
        is_project_question,
        resolve_ollama_host,
        select_history_for_scope,
    )
    from curated_evidence import (
        CURATED_EVIDENCE_IDS,
        CURATED_DAY_EVIDENCE_IDS,
        CURATED_NIGHT_EVIDENCE_IDS,
    )
    from traffic_law import analyze_traffic_law, should_answer_directly
    from auth import (
        get_current_user,
        require_admin,
        require_any_role,
        require_chatbot_or_user,
        require_signed_chatbot_notice,
        require_operator,
        hash_password,
        verify_password,
        create_token,
        authenticate_token,
    )
from fastapi.security import OAuth2PasswordRequestForm
# ← ÄĂƒ THÊM: auth imports


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

configure_evidence_storage(
    base_dir=BASE_DIR,
    processed_crops_dir=PROCESSED_CROPS_DIR,
    search_dirs=(
        PROCESSED_DIR,
        PROCESSED_CROPS_DIR,
        UPLOADS_DIR,
        DETECTIONS_DIR,
        DEBUG_SEGMENTS_DIR,
    ),
)

DEMO_OWNER_REGISTRY_PATH = os.path.join(BASE_DIR, "demo_owner_registry.json")
configure_detection_service(
    demo_owner_registry_path=DEMO_OWNER_REGISTRY_PATH,
    detection_model=Detection,
    get_image_b64=_get_image_b64,
    detection_has_complete_evidence=_detection_has_complete_evidence,
    effective_review_status=_effective_review_status,
    normalize_plate_number=normalize_plate_number,
)

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(PROCESSED_CROPS_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# Thư mục chứa video mặc định cho 6 camera
DEFAULT_VIDEOS_DIR = os.path.join(BASE_DIR, "videos")
os.makedirs(DEFAULT_VIDEOS_DIR, exist_ok=True)
# ← ÄĂƒ THÊM: thư mục video mặc định

# Bộ nhớ tạm lưu source cho từng camera
camera_sources: Dict[str, str] = {}
_CAMERA_SOURCES_LOCK = threading.RLock()
_PROCESS_STARTED_AT = _vn_now()
_KNOWN_CAMERA_IDS = ("CAM_01", "CAM_02", "CAM_03", "CAM_04", "CAM_05", "CAM_06")


_COORDINATION_MAIN_SIGNAL_ROIS: Dict[str, List[Dict[str, float]]] = {
    camera_id: [
        {"x": 792.0, "y": 82.0},
        {"x": 844.0, "y": 82.0},
        {"x": 844.0, "y": 206.0},
        {"x": 792.0, "y": 206.0},
    ]
    for camera_id in ["CAM_01", "CAM_02", "CAM_03", "CAM_04", "CAM_05", "CAM_06"]
}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


_STREAM_VERBOSE_LOGS = _env_bool("STREAM_VERBOSE_LOGS", False)
_STREAM_PLATE_CROP_QUALITY_EXPERIMENT_ENABLED = _env_bool(
    "STREAM_PLATE_CROP_QUALITY_EXPERIMENT_ENABLED",
    False,
)
_STREAM_VEHICLE_FIRST_LOG_ENABLED = _env_bool(
    "STREAM_VEHICLE_FIRST_LOG_ENABLED",
    False,
)
_STREAM_VEHICLE_FIRST_LOG_MIN_QUALITY = _env_float(
    "STREAM_VEHICLE_FIRST_LOG_MIN_QUALITY",
    0.0,
)
_STREAM_MOTO_VEHICLE_FIRST_LOG_ENABLED = _env_bool("STREAM_MOTO_VEHICLE_FIRST_LOG_ENABLED", False)
_STREAM_MIN_FULL_VEHICLE_CROP_SCORE = _env_float(
    "STREAM_MIN_FULL_VEHICLE_CROP_SCORE",
    55.0,
)
_STREAM_AI_WORKERS = max(1, _env_int("STREAM_AI_WORKERS", 1))
_STREAM_AI_EXECUTOR = ThreadPoolExecutor(max_workers=_STREAM_AI_WORKERS)
_AI_INFERENCE_LOCK = threading.Lock()
_CAMERA_AI_OWNERS_LOCK = threading.Lock()
_CAMERA_AI_OWNERS: Dict[str, str] = {}
_CAMERA_AI_OWNER_LAST_SEEN: Dict[str, float] = {}
_CAMERA_AI_OWNER_STALE_SEC = max(5.0, _env_float("STREAM_AI_OWNER_STALE_SEC", 15.0))
_STREAM_RUNTIME_STATS_LOCK = threading.Lock()
_STREAM_RUNTIME_STATS: Dict[str, Dict[str, Any]] = {}
_BACKGROUND_OCR_ENABLED = _env_bool("BACKGROUND_OCR_ENABLED", True)
_BACKGROUND_OCR_MIN_SCORE = _env_float("BACKGROUND_OCR_MIN_SCORE", 0.58)
_BACKGROUND_OCR_VERIFY_CONFIRMED_ENABLED = _env_bool("BACKGROUND_OCR_VERIFY_CONFIRMED_ENABLED", True)
_BACKGROUND_OCR_VERIFY_MIN_GAIN = _env_float("BACKGROUND_OCR_VERIFY_MIN_GAIN", 0.02)
_BACKGROUND_OCR_QUEUE: "Queue[Dict[str, Any]]" = Queue(maxsize=max(8, _env_int("BACKGROUND_OCR_QUEUE_SIZE", 128)))
_background_ocr_seen: set[int] = set()
_background_ocr_lock = threading.Lock()
_RUNTIME_CLEANUP_ENABLED = _env_bool(
    "RUNTIME_CLEANUP_ENABLED",
    os.getenv("APP_ENV", "development").strip().lower() in {"production", "prod"},
)
_RUNTIME_CLEANUP_INTERVAL_SECONDS = max(300, _env_int("RUNTIME_CLEANUP_INTERVAL_SECONDS", 3600))
_RUNTIME_CLEANUP_THREAD_LOCK = threading.Lock()
_RUNTIME_CLEANUP_THREAD_STARTED = False


def _runtime_cleanup_policy() -> CleanupPolicy:
    return CleanupPolicy(
        debug_retention_hours=max(1.0, _env_float("DEBUG_RETENTION_HOURS", 168.0)),
        temporary_retention_hours=max(1.0, _env_float("TEMP_RETENTION_HOURS", 24.0)),
        dry_run=_env_bool("RUNTIME_CLEANUP_DRY_RUN", True),
    )


def _run_runtime_cleanup_once() -> Dict[str, int]:
    result = cleanup_runtime(
        debug_directory=DEBUG_SEGMENTS_DIR,
        temporary_directories=[UPLOADS_DIR, PROCESSED_DIR, DETECTIONS_DIR],
        policy=_runtime_cleanup_policy(),
    )
    payload = result.as_dict()
    print(f"[RUNTIME-CLEANUP] {json.dumps(payload, ensure_ascii=True)}")
    return payload


def _runtime_cleanup_worker() -> None:
    while True:
        try:
            _run_runtime_cleanup_once()
        except Exception as exc:
            print(f"[RUNTIME-CLEANUP] failed: {exc}")
        threading.Event().wait(_RUNTIME_CLEANUP_INTERVAL_SECONDS)


def _start_runtime_cleanup_worker() -> None:
    global _RUNTIME_CLEANUP_THREAD_STARTED
    if not _RUNTIME_CLEANUP_ENABLED:
        return
    with _RUNTIME_CLEANUP_THREAD_LOCK:
        if _RUNTIME_CLEANUP_THREAD_STARTED:
            return
        threading.Thread(
            target=_runtime_cleanup_worker,
            daemon=True,
            name="runtime-cleanup-worker",
        ).start()
        _RUNTIME_CLEANUP_THREAD_STARTED = True


def _stream_debug(message: str) -> None:
    if _STREAM_VERBOSE_LOGS:
        print(message)


def _make_camera_ai_owner_key(camera_id: str, source_kind: str, video_path: str) -> str:
    source = str(video_path or "")
    if not source.lower().startswith("rtsp://"):
        source = os.path.abspath(source)
    return f"{str(camera_id or 'CAM_01').upper()}|{source_kind}|{source}"


def _try_acquire_camera_ai_owner(owner_key: str, owner_token: str) -> bool:
    now = time.monotonic()
    with _CAMERA_AI_OWNERS_LOCK:
        current = _CAMERA_AI_OWNERS.get(owner_key)
        last_seen = _CAMERA_AI_OWNER_LAST_SEEN.get(owner_key, 0.0)
        if current is None:
            _CAMERA_AI_OWNERS[owner_key] = owner_token
            _CAMERA_AI_OWNER_LAST_SEEN[owner_key] = now
            return True
        if current == owner_token:
            _CAMERA_AI_OWNER_LAST_SEEN[owner_key] = now
            return True
        if last_seen and (now - last_seen) > _CAMERA_AI_OWNER_STALE_SEC:
            _CAMERA_AI_OWNERS[owner_key] = owner_token
            _CAMERA_AI_OWNER_LAST_SEEN[owner_key] = now
            print(f"[Stream] Reclaimed stale AI owner for {owner_key}")
            return True
        return False


def _touch_camera_ai_owner(owner_key: str, owner_token: str) -> None:
    with _CAMERA_AI_OWNERS_LOCK:
        if _CAMERA_AI_OWNERS.get(owner_key) == owner_token:
            _CAMERA_AI_OWNER_LAST_SEEN[owner_key] = time.monotonic()


def _release_camera_ai_owner(owner_key: str, owner_token: str) -> None:
    with _CAMERA_AI_OWNERS_LOCK:
        if _CAMERA_AI_OWNERS.get(owner_key) == owner_token:
            _CAMERA_AI_OWNERS.pop(owner_key, None)
            _CAMERA_AI_OWNER_LAST_SEEN.pop(owner_key, None)


def _clear_camera_ai_owners() -> None:
    with _CAMERA_AI_OWNERS_LOCK:
        _CAMERA_AI_OWNERS.clear()
        _CAMERA_AI_OWNER_LAST_SEEN.clear()
    with _STREAM_RUNTIME_STATS_LOCK:
        _STREAM_RUNTIME_STATS.clear()


def _update_stream_runtime_stats(owner_key: str, **updates: Any) -> None:
    with _STREAM_RUNTIME_STATS_LOCK:
        stats = _STREAM_RUNTIME_STATS.setdefault(owner_key, {})
        stats.update(updates)
        stats["updated_at"] = time.monotonic()


def _summarize_tracking_batch(tracking_batch: List[Dict[str, Any]]) -> Dict[str, Any]:
    vehicle_count = len(tracking_batch or [])
    plate_crop_count = 0
    plate_text_count = 0
    temporary_count = 0
    reasons: Dict[str, int] = {}
    for item in tracking_batch or []:
        if item.get("plate_crop_b64"):
            plate_crop_count += 1
        if (item.get("plate_number") or "").strip():
            plate_text_count += 1
        if item.get("is_temporary"):
            temporary_count += 1
        reason = str(item.get("plate_debug_reason") or "unknown")
        reasons[reason] = reasons.get(reason, 0) + 1
    return {
        "last_vehicle_count": vehicle_count,
        "last_plate_crop_count": plate_crop_count,
        "last_plate_text_count": plate_text_count,
        "last_temporary_count": temporary_count,
        "last_plate_reasons": dict(sorted(reasons.items(), key=lambda kv: (-kv[1], kv[0]))[:8]),
    }


def _enqueue_background_ocr(
    detection_id: int,
    crop_path: str,
    vehicle_type: str,
    vehicle_path: str = "",
) -> None:
    if not _BACKGROUND_OCR_ENABLED or not detection_id:
        return
    if (not crop_path or not os.path.exists(crop_path)) and (not vehicle_path or not os.path.exists(vehicle_path)):
        return
    with _background_ocr_lock:
        if int(detection_id) in _background_ocr_seen:
            return
        _background_ocr_seen.add(int(detection_id))
    try:
        _BACKGROUND_OCR_QUEUE.put_nowait(
            {
                "detection_id": int(detection_id),
                "crop_path": crop_path,
                "vehicle_type": vehicle_type or "",
                "vehicle_path": vehicle_path or "",
                "crop_revision": _evidence_file_revision(crop_path),
                "vehicle_revision": _evidence_file_revision(vehicle_path),
            }
        )
    except Full:
        with _background_ocr_lock:
            _background_ocr_seen.discard(int(detection_id))
        print(f"[OCR-BG] Queue full, skip detection_id={detection_id}")


def _evidence_file_revision(path: str) -> Optional[Tuple[str, int, int]]:
    """Return a cheap immutable marker for one evidence file."""
    if not path:
        return None
    resolved = resolve_runtime_image_path(str(path or "")) or str(path or "")
    try:
        stat = os.stat(resolved)
    except OSError:
        return None
    return (os.path.normcase(os.path.abspath(resolved)), int(stat.st_size), int(stat.st_mtime_ns))


def _background_ocr_job_is_current(job: Dict[str, Any]) -> bool:
    return bool(
        _evidence_file_revision(str(job.get("crop_path") or "")) == job.get("crop_revision")
        and _evidence_file_revision(str(job.get("vehicle_path") or "")) == job.get("vehicle_revision")
    )


def _enqueue_startup_evidence_recovery() -> int:
    """Retry recent vehicle-only staging rows without exposing them as complete records."""
    if not _BACKGROUND_OCR_ENABLED:
        return 0
    limit = max(0, min(_env_int("BACKGROUND_OCR_STARTUP_RECOVERY_LIMIT", 12), 50))
    if limit == 0:
        return 0
    db = SessionLocal()
    queued = 0
    try:
        rows = (
            db.query(Detection)
            .filter(Detection.is_temporary == 1)
            .filter(Detection.image_path.isnot(None))
            .filter(Detection.image_path != "")
            .order_by(Detection.timestamp.desc(), Detection.id.desc())
            .limit(limit * 4)
            .all()
        )
        for row in rows:
            vehicle_path = resolve_runtime_image_path(str(row.image_path or ""))
            plate_path = resolve_runtime_image_path(str(row.crop_path or ""))
            if not vehicle_path or plate_path:
                continue
            _enqueue_background_ocr(
                int(row.id),
                "",
                _canonical_vehicle_type(row.vehicle_type),
                vehicle_path,
            )
            queued += 1
            if queued >= limit:
                break
    finally:
        db.close()
    return queued


def _background_ocr_worker() -> None:
    while True:
        job = _BACKGROUND_OCR_QUEUE.get()
        detection_id = int(job.get("detection_id") or 0)
        try:
            crop_path = str(job.get("crop_path") or "")
            vehicle_type = str(job.get("vehicle_type") or "")
            vehicle_path = str(job.get("vehicle_path") or "")
            if not _background_ocr_job_is_current(job):
                print(f"[OCR-BG] stale evidence before OCR detection_id={detection_id}, skip")
                with _background_ocr_lock:
                    _background_ocr_seen.discard(detection_id)
                continue
            if crop_path and os.path.exists(crop_path):
                result = recognize_plate_crop_file(
                    crop_path,
                    expected_vehicle_type=vehicle_type,
                    accurate=True,
                )
            else:
                result = {
                    "plate_number": "",
                    "ocr_score": 0.0,
                    "variant": "crop-missing",
                    "elapsed_ms": 0.0,
                }
            plate = (result.get("plate_number") or "").strip()
            score = float(result.get("ocr_score") or 0.0)
            vehicle_result: Optional[Dict[str, Any]] = None
            if not plate or score < _BACKGROUND_OCR_MIN_SCORE:
                if not vehicle_path:
                    db_lookup = SessionLocal()
                    try:
                        row_lookup = db_lookup.query(Detection).filter(Detection.id == detection_id).first()
                        if row_lookup is not None:
                            vehicle_path = row_lookup.image_path or ""
                    finally:
                        db_lookup.close()
                if vehicle_path and os.path.exists(vehicle_path):
                    vehicle_result = recognize_plate_from_vehicle_file(
                        vehicle_path,
                        expected_vehicle_type=vehicle_type,
                    )
                    vehicle_plate = (vehicle_result.get("plate_number") or "").strip()
                    vehicle_score = float(vehicle_result.get("ocr_score") or 0.0)
                    if vehicle_plate and vehicle_score > score:
                        result = vehicle_result
                        plate = vehicle_plate
                        score = vehicle_score
                if not plate or score < _BACKGROUND_OCR_MIN_SCORE:
                    recrop_b64 = str((vehicle_result or {}).get("plate_crop_b64") or "")
                    if recrop_b64 and _env_bool("BACKGROUND_OCR_SAVE_CROP_ONLY", False):
                        db_crop = SessionLocal()
                        try:
                            row_crop = db_crop.query(Detection).filter(Detection.id == detection_id).first()
                            if (
                                row_crop is not None
                                and bool(row_crop.is_temporary)
                                and _background_ocr_job_is_current(job)
                            ):
                                target_crop_path = row_crop.crop_path or _build_detection_crop_path("plate", detection_id=detection_id)
                                written_crop = _write_b64_crop(recrop_b64, target_crop_path)
                                if written_crop:
                                    row_crop.crop_path = written_crop
                                    row_crop.plate_crop_source = "background_vehicle_recrop"
                                    row_crop.plate_debug_reason = "background_vehicle_recrop_crop_only"
                                    row_crop.plate_debug_variant = str((vehicle_result or {}).get("variant") or "")
                                    row_crop.last_seen_at = _vn_now()
                                    db_crop.commit()
                        except Exception as exc:
                            db_crop.rollback()
                            print(f"[OCR-BG] crop-only update failed detection_id={detection_id}: {exc}")
                        finally:
                            db_crop.close()
                    print(
                        f"[OCR-BG] no plate detection_id={detection_id} "
                        f"score={score:.3f} variant={result.get('variant', '')} "
                        f"vehicle_variant={(vehicle_result or {}).get('variant', '')} "
                        f"elapsed_ms={result.get('elapsed_ms', 0)}"
                    )
                    with _background_ocr_lock:
                        _background_ocr_seen.discard(detection_id)
                    continue

            db = SessionLocal()
            try:
                row = db.query(Detection).filter(Detection.id == detection_id).first()
                if row is None:
                    with _background_ocr_lock:
                        _background_ocr_seen.discard(detection_id)
                    continue
                if not _background_ocr_job_is_current(job):
                    print(f"[OCR-BG] stale evidence after OCR detection_id={detection_id}, skip")
                    with _background_ocr_lock:
                        _background_ocr_seen.discard(detection_id)
                    continue
                reviewed_by = str(row.reviewed_by or "").strip().lower()
                if row.reviewed_at is not None and (
                    str(row.review_status or "").lower() == "confirmed"
                    or reviewed_by.startswith("visual_audit")
                ):
                    print(f"[OCR-BG] reviewed evidence locked detection_id={detection_id}, skip")
                    continue
                current_score = float(row.ocr_score or 0.0)
                current_plate = (row.plate_number or "").strip().upper()
                current_plate_valid = bool(
                    current_plate
                    and match_vn_plate(current_plate, expected_vehicle_type=vehicle_type)
                )
                new_plate_valid = bool(
                    plate
                    and match_vn_plate(plate, expected_vehicle_type=vehicle_type)
                )
                compact_current = _normalize_plate_compact(current_plate)
                compact_new = _normalize_plate_compact(plate)
                plate_changed = bool(compact_new and compact_new != compact_current)
                verification_upgrade = bool(
                    _BACKGROUND_OCR_VERIFY_CONFIRMED_ENABLED
                    and new_plate_valid
                    and plate_changed
                    and (
                        not current_plate_valid
                        or score >= current_score + _BACKGROUND_OCR_VERIFY_MIN_GAIN
                    )
                )
                should_update = bool(row.is_temporary) or not row.plate_number or score >= current_score or verification_upgrade
                if should_update:
                    confirmed = _is_confirmed_plate(
                        plate,
                        score,
                        int(row.vote_count or 0),
                        expected_vehicle_type=vehicle_type,
                    )
                    row.plate_number = plate
                    row.ocr_score = score
                    row.is_temporary = 0 if confirmed else 1
                    row.is_simulated = 0
                    if result is vehicle_result:
                        row.plate_debug_reason = "background_vehicle_recrop_success" if confirmed else "background_vehicle_recrop_candidate"
                    elif verification_upgrade:
                        row.plate_debug_reason = "background_crop_verify_upgrade"
                    else:
                        row.plate_debug_reason = "background_ocr_success" if confirmed else "background_ocr_candidate"
                    row.plate_debug_variant = str(result.get("variant") or "")
                    recrop_b64 = str(result.get("plate_crop_b64") or "")
                    if recrop_b64:
                        target_crop_path = row.crop_path or _build_detection_crop_path("plate", detection_id=detection_id)
                        written_crop = _write_b64_crop(recrop_b64, target_crop_path)
                        if written_crop:
                            row.crop_path = written_crop
                            row.plate_crop_source = "background_vehicle_recrop"
                    row.last_seen_at = _vn_now()
                    db.commit()
                    print(
                        f"[OCR-BG] update detection_id={detection_id} plate='{plate}' "
                        f"score={score:.3f} elapsed_ms={result.get('elapsed_ms', 0)}"
                    )
                else:
                    with _background_ocr_lock:
                        _background_ocr_seen.discard(detection_id)
            except Exception as exc:
                db.rollback()
                with _background_ocr_lock:
                    _background_ocr_seen.discard(detection_id)
                print(f"[OCR-BG] DB update failed detection_id={detection_id}: {exc}")
            finally:
                db.close()
        except Exception as exc:
            with _background_ocr_lock:
                _background_ocr_seen.discard(detection_id)
            print(f"[OCR-BG] failed detection_id={detection_id}: {exc}")
        finally:
            _BACKGROUND_OCR_QUEUE.task_done()


def _resize_to_max_width(frame: np.ndarray, max_width: int) -> np.ndarray:
    if frame is None or frame.size == 0 or max_width <= 0:
        return frame
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / float(w)
    return cv2.resize(frame, (max_width, max(1, int(round(h * scale)))), interpolation=cv2.INTER_AREA)

def get_camera_source(cam_id: str) -> str:
    camera_key = _normalize_runtime_camera_id(cam_id)
    with _CAMERA_SOURCES_LOCK:
        return camera_sources.get(camera_key, "")

def set_camera_source(cam_id: str, path: str) -> None:
    camera_key = _normalize_runtime_camera_id(cam_id)
    with _CAMERA_SOURCES_LOCK:
        camera_sources[camera_key] = path


def _clear_runtime_session(source_mode: str = "default", camera_id: str = "CAM_01") -> Dict[str, Any]:
    """Reset one camera/source session without disturbing other live streams."""
    session = _reset_runtime_session_state(
        camera_id=camera_id,
        source_mode=source_mode,
        started_at=_vn_now(),
    )
    normalized_camera = session["camera_id"]

    # Inference state is already partitioned by camera.  Always pass the
    # camera id here: calling these functions without it clears every camera.
    clear_ocr_cache(normalized_camera)
    clear_id_mapping(normalized_camera)
    clear_violation_state(normalized_camera)

    # AI ownership represents a running stream, not session contents.  Removing
    # owners here lets a second stream process the same camera concurrently,
    # while the original generator keeps running.  Leave ownership intact and
    # let the generator release it when its client disconnects.
    return {
        "source_mode": session["source_mode"],
        "camera_id": normalized_camera,
        "session_started_at": session["session_started_at"].isoformat(),
        "generation": session["generation"],
    }


def _runtime_session_windows(source_mode: str = "default", camera_id: str = "") -> List[Dict[str, Any]]:
    """Return per-camera time windows used by ``current_only`` history reads."""
    normalized_source = _normalize_runtime_source_mode(source_mode)
    normalized_camera = (
        _normalize_runtime_camera_id(camera_id)
        if str(camera_id or "").strip()
        else ""
    )
    if normalized_camera:
        return [
            _ensure_runtime_session(
                camera_id=normalized_camera,
                source_mode=normalized_source,
                started_at=_PROCESS_STARTED_AT,
            )
        ]

    existing = _list_runtime_sessions(source_mode=normalized_source)
    by_camera = {item["camera_id"]: item for item in existing}
    # The default dashboard combines all configured cameras.  Give every camera
    # its own process-start window so resetting CAM_02 cannot hide CAM_01 rows.
    camera_ids = set(by_camera)
    if normalized_source == "default":
        camera_ids.update(_KNOWN_CAMERA_IDS)
    if not camera_ids:
        camera_ids.add("CAM_01")
    for camera_key in camera_ids:
        by_camera.setdefault(
            camera_key,
            _ensure_runtime_session(
                camera_id=camera_key,
                source_mode=normalized_source,
                started_at=_PROCESS_STARTED_AT,
            ),
        )
    return [by_camera[key] for key in sorted(by_camera)]


def _filter_current_runtime_session(
    query: Any,
    *,
    source_mode: str = "default",
    camera_id: str = "",
) -> Any:
    windows = _runtime_session_windows(source_mode=source_mode, camera_id=camera_id)
    predicates = [
        and_(
            Detection.camera_id == item["camera_id"],
            Detection.last_seen_at >= item["session_started_at"],
        )
        for item in windows
    ]
    return query.filter(or_(*predicates))


def infer_camera_id(source: str, fallback: str = "CAM_01") -> str:
    source_name = os.path.basename(str(source or "")).lower()
    mapping = {
        "cam1": "CAM_01",
        "cam2": "CAM_02",
        "cam3": "CAM_03",
        "cam4": "CAM_04",
        "cam5": "CAM_05",
        "cam6": "CAM_06",
    }
    for key, value in mapping.items():
        if source_name.startswith(key):
            return value
    return str(fallback or "CAM_01")

def _find_default_video(cam_num: int) -> str:
    """Tìm video mặc định cho camera."""
    _exts = (
        ['.mp4', '.avi', '.mkv', '.mov']
        if _env_bool("USE_LEGACY_DEFAULT_VIDEOS", False)
        else ['.mkv', '.mp4', '.avi', '.mov']
    )
    for _ext in _exts:
        _p = os.path.join(DEFAULT_VIDEOS_DIR, f"cam{cam_num}{_ext}")
        if os.path.exists(_p):
            return _p
    return ""
# ← ÄĂƒ THÊM: há»— trợ nhiều định dạng


# --- HELPERS ---
# Evidence path resolution and binary operations live in services/evidence.py.
# ← ÄĂƒ THÊM: helper đọc ảnh từ file


# Detection presentation and query helpers live in services/detection.py.
_TRACK_VOTE_BUFFER_SIZE = 10
_TRACK_VOTE_MIN_HITS = _env_int("TRACK_VOTE_MIN_HITS", 1)
_TRACK_VOTE_MIN_SCORE = _env_float("TRACK_VOTE_MIN_SCORE", 0.58)
_TRACK_CONFIRMED_MIN_SCORE = _env_float("TRACK_CONFIRMED_MIN_SCORE", 0.86)
_TRACK_CONFIRMED_MIN_VOTES = _env_int("TRACK_CONFIRMED_MIN_VOTES", 2)
_TRACK_CONFIRMED_VOTE_MIN_SCORE = _env_float("TRACK_CONFIRMED_VOTE_MIN_SCORE", 0.72)
_TRACK_CONSENSUS_MIN_VOTES = _env_int("TRACK_CONSENSUS_MIN_VOTES", 3)
_TRACK_CONSENSUS_MIN_AVG_SCORE = _env_float("TRACK_CONSENSUS_MIN_AVG_SCORE", 0.56)
_TRACK_CONSENSUS_MIN_AGREEMENT = _env_float("TRACK_CONSENSUS_MIN_AGREEMENT", 0.62)
_STREAM_PLATE_OCR_ADVANCED_CONSENSUS_ENABLED = os.getenv(
    "STREAM_PLATE_OCR_ADVANCED_CONSENSUS_ENABLED",
    "false",
).strip().lower() in ("1", "true", "yes", "on")
_STREAM_PLATE_OCR_ADVANCED_CONSENSUS_DEBUG = os.getenv(
    "STREAM_PLATE_OCR_ADVANCED_CONSENSUS_DEBUG",
    "false",
).strip().lower() in ("1", "true", "yes", "on")
_TEMP_DB_REFRESH_INTERVAL_SEC = 0.8
_TRACK_SOFT_MERGE_WINDOW_SEC = 6.0
_TRACK_SOFT_MERGE_MAX_CENTER_DIST = 0.18
_TRACK_DB_SESSION_TIMEOUT_SEC = max(5.0, _env_float("TRACK_DB_SESSION_TIMEOUT_SEC", 15.0))


def _normalize_plate_compact(value: str) -> str:
    return "".join(ch for ch in (value or "").strip().upper() if ch.isalnum())


def _plate_edit_distance(a: str, b: str) -> int:
    a = _normalize_plate_compact(a)
    b = _normalize_plate_compact(b)
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            cur.append(min(cur[-1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def _advanced_track_consensus_candidate(
    buffer_items: List[Dict[str, Any]],
    *,
    expected_vehicle_type: str = "",
) -> Tuple[str, Optional[Dict[str, Any]]]:
    candidates: List[Dict[str, Any]] = []
    for item in buffer_items:
        raw_plate = _normalize_plate_compact(str(item.get("plate_number", "") or ""))
        if not (7 <= len(raw_plate) <= 9):
            continue
        fixed_plate, penalty = normalize_plate_number(
            raw_plate,
            verbose=False,
            expected_vehicle_type=expected_vehicle_type,
        )
        if not fixed_plate:
            continue
        item_copy = dict(item)
        item_copy["raw_text"] = raw_plate
        item_copy["plate_number"] = fixed_plate
        score = max(0.0, min(1.0, float(item.get("ocr_score", 0.0) or 0.0)))
        det = max(0.0, min(1.0, float(item.get("plate_det_conf", 0.0) or 0.0)))
        item_copy["weight"] = max(0.01, score * (1.0 + det * 0.20) + (0.08 if len(fixed_plate) in {8, 9} else 0.03) - int(penalty) * 0.025)
        candidates.append(item_copy)

    if len(candidates) < 2:
        return "", None

    candidates.sort(key=lambda item: float(item.get("weight", 0.0) or 0.0), reverse=True)
    clusters: List[List[Dict[str, Any]]] = []
    for item in candidates:
        plate = str(item.get("plate_number", "") or "")
        placed = False
        for cluster in clusters:
            seed = str(cluster[0].get("plate_number", "") or "")
            if (
                abs(len(plate) - len(seed)) <= 1
                and plate[:2] == seed[:2]
                and _plate_edit_distance(plate, seed) <= (1 if len(plate) <= 7 else 2)
            ):
                cluster.append(item)
                placed = True
                break
        if not placed:
            clusters.append([item])

    best_plate = ""
    best_meta: Optional[Dict[str, Any]] = None
    for cluster in clusters:
        if len(cluster) < 2:
            continue
        lengths: Dict[int, float] = {}
        for item in cluster:
            plate = str(item.get("plate_number", "") or "")
            lengths[len(plate)] = lengths.get(len(plate), 0.0) + float(item.get("weight", 0.0) or 0.0)
        target_len = max(lengths.items(), key=lambda pair: (pair[1], pair[0]))[0]
        usable = [item for item in cluster if len(str(item.get("plate_number", "") or "")) == target_len]
        if len(usable) < 2:
            continue

        char_votes: List[Dict[str, float]] = [dict() for _ in range(target_len)]
        total_weight = 0.0
        total_scores = 0.0
        best_item = max(usable, key=lambda row: float(row.get("ocr_score", 0.0) or 0.0))
        raw_texts: List[str] = []
        normalized_candidates: List[str] = []
        for item in usable:
            plate = str(item.get("plate_number", "") or "")
            raw_texts.append(str(item.get("raw_text", plate) or plate))
            normalized_candidates.append(plate)
            weight = float(item.get("weight", 0.0) or 0.0)
            total_weight += weight
            total_scores += float(item.get("ocr_score", 0.0) or 0.0)
            for idx, char in enumerate(plate):
                char_votes[idx][char] = char_votes[idx].get(char, 0.0) + weight

        voted_raw = "".join(max(votes.items(), key=lambda pair: pair[1])[0] for votes in char_votes if votes)
        fixed_raw, penalty = normalize_plate_number(
            voted_raw,
            verbose=False,
            expected_vehicle_type=expected_vehicle_type,
        )
        if not fixed_raw or len(fixed_raw) != target_len:
            continue
        agreement = sum(max(votes.values()) / max(0.01, sum(votes.values())) for votes in char_votes if votes) / max(1, target_len)
        avg_score = total_scores / max(1, len(usable))
        best_score = max(float(item.get("ocr_score", 0.0) or 0.0) for item in usable)
        consensus_score = min(0.99, (avg_score * 0.55) + (best_score * 0.25) + (agreement * 0.20))
        rank = (len(usable), round(total_weight, 4), round(consensus_score, 4), round(agreement, 4), target_len)
        if agreement < 0.56 or total_weight < 1.35:
            continue
        if best_meta is None or rank > best_meta["rank"]:
            best_plate = fixed_raw
            best_meta = {
                "rank": rank,
                "count": len(usable),
                "avg_score": avg_score,
                "best_score": best_score,
                "agreement": agreement,
                "consensus_score": consensus_score,
                "total_weight": total_weight,
                "best_item": best_item,
                "raw_ocr_texts": raw_texts[-8:],
                "normalized_candidates": normalized_candidates[-8:],
                "correction_applied": sorted(set(raw for raw in raw_texts if raw != fixed_raw))[-8:],
                "reason": "advanced_track_near_string_consensus",
            }

    return best_plate, best_meta


def _is_publishable_vote_candidate(
    plate_number: str,
    ocr_score: float,
    *,
    expected_vehicle_type: str = "",
) -> bool:
    fixed_plate, _ = normalize_plate_number(
        plate_number or "",
        verbose=False,
        expected_vehicle_type=expected_vehicle_type,
    )
    return bool(fixed_plate) and fixed_plate == (plate_number or "").strip().upper() and 7 <= len(fixed_plate) <= 9 and float(ocr_score or 0.0) >= _TRACK_VOTE_MIN_SCORE


def _build_track_consensus_candidate(
    buffer_items: List[Dict[str, Any]],
    *,
    expected_vehicle_type: str = "",
) -> Tuple[str, Optional[Dict[str, Any]]]:
    candidates: Dict[Tuple[int, str], List[Dict[str, Any]]] = {}
    for item in buffer_items:
        plate = _normalize_plate_compact(str(item.get("plate_number", "") or ""))
        if not (7 <= len(plate) <= 9):
            continue
        fixed_plate, _ = normalize_plate_number(
            plate,
            verbose=False,
            expected_vehicle_type=expected_vehicle_type,
        )
        if not fixed_plate:
            continue
        item_copy = dict(item)
        item_copy["plate_number"] = fixed_plate
        key = (len(fixed_plate), fixed_plate[:2])
        candidates.setdefault(key, []).append(item_copy)

    best_plate = ""
    best_meta: Optional[Dict[str, Any]] = None
    for (_length, _province), items in candidates.items():
        if len(items) < _TRACK_CONSENSUS_MIN_VOTES:
            continue
        char_votes: List[Dict[str, float]] = [dict() for _ in range(_length)]
        total_scores = 0.0
        best_item = max(items, key=lambda row: float(row.get("ocr_score", 0.0) or 0.0))
        for item in items:
            plate = str(item.get("plate_number", "") or "")
            score = max(0.0, min(1.0, float(item.get("ocr_score", 0.0) or 0.0)))
            det = max(0.0, min(1.0, float(item.get("plate_det_conf", 0.0) or 0.0)))
            weight = max(0.01, score * (1.0 + det * 0.20))
            total_scores += score
            for idx, char in enumerate(plate):
                char_votes[idx][char] = char_votes[idx].get(char, 0.0) + weight

        raw = "".join(
            max(votes.items(), key=lambda pair: pair[1])[0]
            for votes in char_votes
            if votes
        )
        fixed_raw, _ = normalize_plate_number(
            raw,
            verbose=False,
            expected_vehicle_type=expected_vehicle_type,
        )
        if not fixed_raw or len(fixed_raw) != _length:
            continue

        agreement = sum(
            max(votes.values()) / max(0.01, sum(votes.values()))
            for votes in char_votes
            if votes
        ) / max(1, _length)
        avg_score = total_scores / max(1, len(items))
        best_score = max(float(item.get("ocr_score", 0.0) or 0.0) for item in items)
        rank = (
            len(items),
            round(agreement, 4),
            round(avg_score, 4),
            round(best_score, 4),
            len(fixed_raw),
        )
        if (
            avg_score >= _TRACK_CONSENSUS_MIN_AVG_SCORE
            and agreement >= _TRACK_CONSENSUS_MIN_AGREEMENT
            and (best_meta is None or rank > best_meta["rank"])
        ):
            best_plate = fixed_raw
            best_meta = {
                "rank": rank,
                "count": len(items),
                "avg_score": avg_score,
                "best_score": best_score,
                "agreement": agreement,
                "best_item": best_item,
            }

    return best_plate, best_meta


def _apply_track_vote(
    track_id: int,
    vehicle_data: Dict[str, Any],
    vote_buffers: Dict[int, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    normalized = _normalize_plate_payload(vehicle_data)
    plate_number = (normalized.get("plate_number", "") or "").strip().upper()
    ocr_score = float(normalized.get("ocr_score", 0.0) or 0.0)
    plate_det_conf = float(normalized.get("plate_det_conf", 0.0) or 0.0)
    expected_vehicle_type = str(
        normalized.get("class")
        or normalized.get("vehicle_type")
        or ""
    )
    buffer_items = list(vote_buffers.get(track_id, []))

    if _is_publishable_vote_candidate(
        plate_number,
        ocr_score,
        expected_vehicle_type=expected_vehicle_type,
    ):
        buffer_items.append(
            {
                "plate_number": plate_number,
                "ocr_score": ocr_score,
                "plate_det_conf": plate_det_conf,
                "plate_crop_b64": normalized.get("plate_crop_b64", "") or "",
            }
        )
        buffer_items.sort(
            key=lambda item: (
                float(item.get("ocr_score", 0.0)),
                float(item.get("plate_det_conf", 0.0)),
            ),
            reverse=True,
        )
        buffer_items = buffer_items[:_TRACK_VOTE_BUFFER_SIZE]

    vote_buffers[track_id] = buffer_items
    if not buffer_items:
        normalized["plate_number"] = ""
        return normalized

    grouped: Dict[str, Dict[str, Any]] = {}
    for item in buffer_items:
        key = item["plate_number"]
        bucket = grouped.setdefault(
            key,
            {"count": 0, "score_sum": 0.0, "best_score": 0.0, "det_sum": 0.0, "best_item": item},
        )
        bucket["count"] += 1
        bucket["score_sum"] += float(item.get("ocr_score", 0.0))
        bucket["det_sum"] += float(item.get("plate_det_conf", 0.0))
        if float(item.get("ocr_score", 0.0)) >= float(bucket["best_score"]):
            bucket["best_score"] = float(item.get("ocr_score", 0.0))
            bucket["best_item"] = item

    winner_plate = ""
    winner_meta: Optional[Dict[str, Any]] = None
    for plate_key, bucket in grouped.items():
        avg_score = bucket["score_sum"] / max(1, bucket["count"])
        avg_det = bucket["det_sum"] / max(1, bucket["count"])
        rank = (
            bucket["count"],
            round(avg_score, 4),
            round(float(bucket["best_score"]), 4),
            round(avg_det, 4),
            len(plate_key),
        )
        if winner_meta is None or rank > winner_meta["rank"]:
            winner_plate = plate_key
            winner_meta = {
                "rank": rank,
                "count": bucket["count"],
                "avg_score": avg_score,
                "best_score": float(bucket["best_score"]),
                "best_item": bucket["best_item"],
            }

    consensus_plate, consensus_meta = _build_track_consensus_candidate(
        buffer_items,
        expected_vehicle_type=expected_vehicle_type,
    )
    if consensus_meta and (
        winner_meta is None
        or consensus_meta["count"] > winner_meta["count"]
        or (
            consensus_meta["count"] == winner_meta["count"]
            and consensus_meta["best_score"] >= float(winner_meta.get("best_score", 0.0)) - 0.03
        )
    ):
        winner_plate = consensus_plate
        winner_meta = consensus_meta
        normalized["plate_debug_reason"] = "track_consensus_vote"

    if _STREAM_PLATE_OCR_ADVANCED_CONSENSUS_ENABLED:
        advanced_plate, advanced_meta = _advanced_track_consensus_candidate(
            buffer_items,
            expected_vehicle_type=expected_vehicle_type,
        )
        if advanced_meta and (
            winner_meta is None
            or int(advanced_meta.get("count", 0) or 0) > int(winner_meta.get("count", 0) or 0)
            or (
                int(advanced_meta.get("count", 0) or 0) == int(winner_meta.get("count", 0) or 0)
                and float(advanced_meta.get("consensus_score", 0.0) or 0.0) >= float(winner_meta.get("best_score", 0.0) or 0.0) - 0.02
                and float(advanced_meta.get("agreement", 0.0) or 0.0) >= 0.62
            )
        ):
            if _STREAM_PLATE_OCR_ADVANCED_CONSENSUS_DEBUG and winner_plate and advanced_plate != winner_plate:
                print(
                    f"[DEBUG-LOG-CONSENSUS] track={track_id} old='{winner_plate}' new='{advanced_plate}' "
                    f"reason={advanced_meta.get('reason')} score={float(advanced_meta.get('consensus_score', 0.0)):.3f} "
                    f"count={int(advanced_meta.get('count', 0) or 0)}"
                )
            winner_plate = advanced_plate
            winner_meta = advanced_meta
            normalized["plate_debug_reason"] = str(advanced_meta.get("reason", "advanced_track_consensus"))
            normalized["consensus_score"] = round(float(advanced_meta.get("consensus_score", 0.0) or 0.0), 4)
            normalized["consensus_reason"] = str(advanced_meta.get("reason", "") or "")
            normalized["raw_ocr_texts"] = list(advanced_meta.get("raw_ocr_texts", []) or [])
            normalized["normalized_candidates"] = list(advanced_meta.get("normalized_candidates", []) or [])
            normalized["correction_applied"] = list(advanced_meta.get("correction_applied", []) or [])

    if winner_meta and winner_meta["count"] >= _TRACK_VOTE_MIN_HITS:
        normalized["plate_number"] = winner_plate
        normalized["ocr_score"] = round(float(winner_meta["best_score"]), 4)
        normalized["plate_crop_b64"] = winner_meta["best_item"].get("plate_crop_b64", normalized.get("plate_crop_b64", ""))
        normalized["vote_count"] = int(winner_meta["count"])
    else:
        normalized["plate_number"] = winner_plate if winner_meta else ""
        normalized["vote_count"] = int(winner_meta["count"]) if winner_meta else 0

    return normalized


def update_vehicle(
    track_id: int,
    data: Dict[str, Any],
    vote_buffers: Dict[int, List[Dict[str, Any]]],
    camera_id: str = "",
    source_mode: str = "default",
) -> Dict[str, Any]:
    voted_payload = _apply_track_vote(track_id, data, vote_buffers)
    _session_update_vehicle(
        track_id,
        voted_payload,
        camera_id=camera_id,
        source_mode=source_mode,
    )
    return voted_payload


def _is_confirmed_plate(
    plate_number: str,
    ocr_score: float = 0.0,
    vote_count: int = 0,
    *,
    expected_vehicle_type: str = "",
) -> bool:
    fixed_plate, _ = normalize_plate_number(
        plate_number or "",
        verbose=False,
        expected_vehicle_type=expected_vehicle_type,
    )
    if not fixed_plate or fixed_plate != (plate_number or "").strip().upper():
        return False
    if not (7 <= len(fixed_plate) <= 9):
        return False
    score = float(ocr_score or 0.0)
    votes = int(vote_count or 0)
    return bool(
        votes >= _TRACK_CONFIRMED_MIN_VOTES
        and score >= _TRACK_CONFIRMED_VOTE_MIN_SCORE
    )


def _is_better_track_candidate(current: Dict[str, Any], previous: Optional[Dict[str, Any]]) -> bool:
    if previous is None:
        return True

    current_plate = (current.get("plate_number", "") or "").strip()
    previous_plate = (previous.get("plate_number", "") or "").strip()
    if not current_plate:
        return False
    if not previous_plate:
        return True

    current_ocr = float(current.get("ocr_score", 0.0) or 0.0)
    previous_ocr = float(previous.get("ocr_score", 0.0) or 0.0)
    current_det = float(current.get("plate_det_conf", 0.0) or 0.0)
    previous_det = float(previous.get("plate_det_conf", 0.0) or 0.0)
    current_focus = float(current.get("plate_crop_focus", 0.0) or 0.0)
    previous_focus = float(previous.get("plate_crop_focus", 0.0) or 0.0)
    current_area = float(current.get("vehicle_area_ratio", 0.0) or 0.0)
    previous_area = float(previous.get("vehicle_area_ratio", 0.0) or 0.0)
    current_bottom = float(current.get("vehicle_bottom_ratio", 0.0) or 0.0)
    previous_bottom = float(previous.get("vehicle_bottom_ratio", 0.0) or 0.0)

    if current_plate != previous_plate and current_ocr >= previous_ocr + 0.05:
        return True
    if current_ocr > previous_ocr + 0.01:
        return True
    if current_ocr >= previous_ocr - 0.01 and current_det > previous_det + 0.05:
        return True
    if current_ocr >= previous_ocr - 0.02 and current_focus > previous_focus + 10.0:
        return True
    if current_ocr >= previous_ocr - 0.02 and current_area > previous_area * 1.20:
        return True
    if current_ocr >= previous_ocr - 0.02 and current_bottom > previous_bottom + 0.08:
        return True
    if current_ocr >= previous_ocr - 0.035 and current_area > previous_area * 1.35 and current_bottom >= previous_bottom - 0.02:
        return True
    if current_ocr >= previous_ocr - 0.035 and current_bottom > previous_bottom + 0.12 and current_focus >= previous_focus - 8.0:
        return True
    if len(current_plate) > len(previous_plate) and current_ocr >= previous_ocr - 0.02:
        return True
    return False


def _track_candidate_quality(item: Dict[str, Any]) -> Tuple[float, float, float, float, int, int]:
    return (
        float(item.get("ocr_score", 0.0) or 0.0),
        float(item.get("plate_crop_quality", item.get("plate_crop_focus", 0.0)) or 0.0),
        float(item.get("vehicle_crop_quality", 0.0) or 0.0),
        float(item.get("vehicle_crop_completeness", 0.0) or 0.0),
        1 if item.get("plate_crop_b64") else 0,
        1 if item.get("vehicle_crop_b64") else 0,
    )


def _should_replace_vehicle_crop(current: Dict[str, Any], previous: Optional[Dict[str, Any]]) -> bool:
    if previous is None:
        return True
    if not current.get("vehicle_crop_b64"):
        return False
    current_q = float(current.get("vehicle_crop_quality", 0.0) or 0.0)
    previous_q = float(previous.get("vehicle_crop_quality", 0.0) or 0.0)
    current_full = float(current.get("vehicle_crop_completeness", 100.0) or 0.0)
    previous_full = float(previous.get("vehicle_crop_completeness", 100.0) or 0.0)
    current_area = float(current.get("vehicle_area_ratio", 0.0) or 0.0)
    previous_area = float(previous.get("vehicle_area_ratio", 0.0) or 0.0)
    if current_full < _STREAM_MIN_FULL_VEHICLE_CROP_SCORE:
        return False
    if previous_full >= _STREAM_MIN_FULL_VEHICLE_CROP_SCORE and current_full < previous_full - 18.0:
        return False
    return (
        current_q > previous_q + 3.0
        or current_area > previous_area * 1.18
        or current_full > previous_full + 15.0
    )


def _should_replace_plate_crop(current: Dict[str, Any], previous: Optional[Dict[str, Any]]) -> bool:
    if previous is None:
        return True
    if not current.get("plate_crop_b64"):
        return False
    current_q = float(current.get("plate_crop_quality", current.get("plate_crop_focus", 0.0)) or 0.0)
    previous_q = float(previous.get("plate_crop_quality", previous.get("plate_crop_focus", 0.0)) or 0.0)
    current_ocr = float(current.get("ocr_score", 0.0) or 0.0)
    previous_ocr = float(previous.get("ocr_score", 0.0) or 0.0)
    if _STREAM_PLATE_CROP_QUALITY_EXPERIMENT_ENABLED:
        current_evidence = bool(current.get("plate_crop_has_evidence", False))
        previous_evidence = bool(previous.get("plate_crop_has_evidence", False))
        if previous_evidence and not current_evidence:
            return current_ocr > previous_ocr + 0.01
        if current_evidence and not previous_evidence:
            return True
        if not current_evidence and not previous_evidence:
            return current_ocr > previous_ocr + 0.01
    return current_q > previous_q + 6.0 or current_ocr > previous_ocr + 0.01


def _center_distance(a: Optional[Dict[str, Any]], b: Optional[Dict[str, Any]]) -> float:
    if not a or not b:
        return 999.0
    try:
        return abs(float(a.get("x", 0.0)) - float(b.get("x", 0.0))) + abs(float(a.get("y", 0.0)) - float(b.get("y", 0.0)))
    except Exception:
        return 999.0


class DetectionOut(BaseModel):
    id: int
    plate_number: str
    ocr_score: float = 0.0
    vote_count: int = 0
    vehicle_type: str
    vehicle_type_vi: Optional[str] = ""  # ← ÄĂƒ THÊM
    confidence: float
    timestamp: Any  # ← ÄĂƒ SỬA: chấp nhận cả str format
    timestamp_time: Optional[str] = ""
    timestamp_date: Optional[str] = ""
    last_seen_at: Optional[str] = ""
    image_path: Optional[str] = ""
    crop_path: Optional[str] = ""
    vehicle_crop_b64: Optional[str] = ""  # ← ÄĂƒ THÊM
    plate_crop_b64: Optional[str] = ""    # ← ÄĂƒ THÊM
    camera_id: Optional[str] = ""         # ← ÄĂƒ THÊM
    track_id: Optional[int] = None
    violation_type: Optional[str] = ""    # ← ÄĂƒ THÊM
    review_status: Optional[str] = ""
    reviewed_by: Optional[str] = ""
    reviewed_at: Optional[str] = ""
    resolved_at: Optional[str] = ""
    review_note: Optional[str] = ""
    is_simulated: bool = False
    is_temporary: bool = False
    plate_crop_source: Optional[str] = ""
    plate_debug_reason: Optional[str] = ""
    plate_debug_variant: Optional[str] = ""
    evidence_complete: bool = False
    evidence_curated: bool = False
    evidence_pair_id: Optional[str] = ""
    lighting_condition: Optional[str] = "unknown"
    owner_name: Optional[str] = ""
    owner_phone: Optional[str] = ""
    owner_email: Optional[str] = ""
    owner_address: Optional[str] = ""
    owner_source: Optional[str] = ""

    model_config = ConfigDict(from_attributes=True)


class UploadResponse(BaseModel):
    message: str
    is_video: bool
    results: Any


class HistoryResponse(BaseModel):
    items: List[DetectionOut]


class HistoryUpdatesResponse(BaseModel):
    items: List[DetectionOut]
    next_since: str = ""
    next_since_id: int = 0


class NotificationHistoryCreate(BaseModel):
    violation_id: str
    detection_id: Optional[int] = None
    license_plate: Optional[str] = ""
    channel: str
    status: str
    recipient: Optional[str] = ""
    message: Optional[str] = ""
    operator: Optional[str] = ""
    sent_at: Optional[str] = ""


class NotificationSendRequest(BaseModel):
    channel: str = Field(min_length=3, max_length=5)
    recipient: str = Field(min_length=1, max_length=320)
    message: str = Field(min_length=1, max_length=5000)
    subject: str = Field(default="RoadAI - Thông báo vi phạm giao thông", max_length=200)


class NotificationHistoryOut(BaseModel):
    id: int
    violation_id: str
    detection_id: Optional[int] = None
    license_plate: Optional[str] = ""
    channel: str
    status: str
    recipient: Optional[str] = ""
    message: Optional[str] = ""
    operator: Optional[str] = ""
    sent_at: str


class NotificationHistoryResponse(BaseModel):
    items: List[NotificationHistoryOut]


class ViolationNoticeResponse(BaseModel):
    id: int
    case_code: str
    license_plate: str
    vehicle_type: str
    violation_type: str
    timestamp: str
    camera_id: str
    fine_amount: str
    legal_basis: str
    review_status: str
    reviewed_by: str = ""
    reviewed_at: str = ""
    resolved_at: str = ""
    review_note: str = ""
    owner_name: str = ""
    owner_phone: str = ""
    owner_email: str = ""
    owner_address: str = ""
    vehicle_image_b64: str = ""
    plate_image_b64: str = ""
    ocr_score: float = 0.0


class SmartSearchResponse(BaseModel):
    query: str
    intent: str
    answer: str
    items: List[Dict[str, Any]] = Field(default_factory=list)


class TelegramViolationItem(BaseModel):
    id: int
    license_plate: str
    vehicle_type: str
    violation_type: str
    camera_id: str
    timestamp: str
    fine_amount: str
    legal_basis: str
    owner_name: str = ""
    owner_phone: str = ""
    owner_email: str = ""
    owner_address: str = ""
    vehicle_image_b64: str = ""
    plate_image_b64: str = ""
    ocr_score: float = 0.0
    vote_count: int = 0
    detection_confidence: float = 0.0
    vehicle_crop_quality: float = 0.0
    plate_crop_quality: float = 0.0
    vehicle_crop_quality_label: str = ""
    plate_crop_quality_label: str = ""
    ai_acceptance_status: str = "insufficient"
    ai_acceptance_reasons: List[str] = Field(default_factory=list)
    needs_review: bool = True
    case_code: str = ""
    review_status: str = "pending"
    track_id: Optional[int] = None
    owner_data_simulated: bool = True
    lighting_condition: str = "unknown"
    evidence_curated: bool = False


class TelegramDailyViolationsResponse(BaseModel):
    date: str
    count: int
    message: str
    items: List[TelegramViolationItem]


def _telegram_crop_quality(path: str, *, kind: str) -> Tuple[float, str]:
    """Recompute a presentation-only crop score from the persisted evidence image."""
    resolved = resolve_runtime_image_path(path)
    if not resolved:
        return 0.0, "Thiếu ảnh"
    try:
        image = cv2.imread(resolved)
        if image is None or image.size == 0:
            return 0.0, "Ảnh không đọc được"
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        height, width = gray.shape[:2]
        short_side_target = 28.0 if kind == "plate" else 120.0
        resolution_score = min(1.0, min(height, width) / short_side_target)
        focus = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        focus_score = min(1.0, np.log1p(max(0.0, focus)) / np.log1p(800.0))
        score = round(100.0 * (0.55 * resolution_score + 0.45 * focus_score), 1)
    except (OSError, ValueError, cv2.error):
        return 0.0, "Ảnh không đọc được"

    if score >= 75:
        label = "Tốt"
    elif score >= 55:
        label = "Khá"
    elif score >= 35:
        label = "Trung bình"
    else:
        label = "Cần kiểm tra"
    return score, label


def _telegram_lighting_condition(path: str) -> str:
    """Classify retained evidence by the image itself, not its demo timestamp."""
    resolved = resolve_runtime_image_path(path)
    if not resolved:
        return "unknown"
    try:
        image = cv2.imread(resolved, cv2.IMREAD_GRAYSCALE)
        if image is None or image.size == 0:
            return "unknown"
        # Only visibly low-light evidence belongs to Telegram's night list.
        return "night" if float(image.mean()) < 85.0 else "day"
    except (OSError, ValueError, cv2.error):
        return "unknown"


def _telegram_ai_explanation(row: Detection) -> Dict[str, Any]:
    """Explain the existing acceptance rule without changing its thresholds."""
    score = float(getattr(row, "ocr_score", 0.0) or 0.0)
    votes = int(getattr(row, "vote_count", 0) or 0)
    vehicle_type = _canonical_vehicle_type(row.vehicle_type)
    accepted = _is_confirmed_plate(
        row.plate_number or "",
        score,
        votes,
        expected_vehicle_type=vehicle_type,
    )
    vehicle_quality, vehicle_label = _telegram_crop_quality(row.image_path or "", kind="vehicle")
    plate_quality, plate_label = _telegram_crop_quality(row.crop_path or "", kind="plate")
    review_status = _effective_review_status(row)

    reasons: List[str] = []
    if score >= _TRACK_CONFIRMED_MIN_SCORE:
        reasons.append(
            f"OCR {score:.0%} đạt ngưỡng xác nhận {_TRACK_CONFIRMED_MIN_SCORE:.0%}."
        )
    elif votes >= _TRACK_CONFIRMED_MIN_VOTES and score >= _TRACK_CONFIRMED_VOTE_MIN_SCORE:
        reasons.append(
            f"{votes} lượt bỏ phiếu đồng thuận và OCR {score:.0%} đạt ngưỡng kết hợp."
        )
    else:
        reasons.append(
            f"OCR {score:.0%} và {votes} lượt bỏ phiếu chưa đủ ngưỡng tự động."
        )

    if vehicle_quality > 0 and plate_quality > 0:
        reasons.append("Có đủ ảnh toàn xe và ảnh crop biển số để đối chiếu.")
    else:
        reasons.append("Ảnh chứng cứ chưa đầy đủ, cần đối chiếu thủ công.")

    needs_review = bool(
        not accepted
        or review_status in {"pending", "rejected", "cancelled"}
        or vehicle_quality < 35
        or plate_quality < 35
    )
    return {
        "vote_count": votes,
        "detection_confidence": float(getattr(row, "confidence", 0.0) or 0.0),
        "vehicle_crop_quality": vehicle_quality,
        "plate_crop_quality": plate_quality,
        "vehicle_crop_quality_label": vehicle_label,
        "plate_crop_quality_label": plate_label,
        "ai_acceptance_status": "accepted" if accepted else "insufficient",
        "ai_acceptance_reasons": reasons,
        "needs_review": needs_review,
    }



_TELEGRAM_FINE_BASIS = "Nghị định 168/2024/NĐ-CP, hiệu lực từ 01/01/2025"


def _normalize_fine_text(value: str = "") -> str:
    raw = str(value or "").strip().lower()
    decomposed = unicodedata.normalize("NFD", raw)
    without_marks = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", without_marks).strip()


def _normalize_query_text(value: str = "") -> str:
    return _normalize_fine_text(value)


def _fine_group(vehicle_type: str = "") -> str:
    value = _normalize_fine_text(vehicle_type)
    if value in {"truck", "bus", "car"}:
        return "car_like"
    if value in {"moto", "motorcycle", "motorbike"}:
        return "motorcycle"
    if "tai" in value or "truck" in value or "bus" in value or "car" in value or "oto" in value or "o to" in value:
        return "car_like"
    if "moto" in value or "may" in value or "motor" in value:
        return "motorcycle"
    return "unknown"


def _fine_amount_for_violation(violation_type: str = "", vehicle_type: str = "") -> str:
    violation = _normalize_fine_text(violation_type)
    group = _fine_group(vehicle_type)
    is_car_like = group == "car_like"

    if (
        not violation
        or violation in {"khong", "none", "normal", "chua phan loai"}
        or "khong vi pham" in violation
        or "khong co vi pham" in violation
        or "khong ghi nhan" in violation
        or "chua ghi nhan" in violation
        or "binh thuong" in violation
    ):
        return "0 đồng"

    if "den do" in violation or "tin hieu" in violation:
        return "18.000.000 - 20.000.000 đồng" if is_car_like else "4.000.000 - 6.000.000 đồng"
    if "nguoc chieu" in violation:
        return "18.000.000 - 20.000.000 đồng" if is_car_like else "4.000.000 - 6.000.000 đồng"
    if "mu bao hiem" in violation or "khong doi mu" in violation:
        return "400.000 - 600.000 đồng"
    if "dien thoai" in violation:
        return "4.000.000 - 6.000.000 đồng" if is_car_like else "800.000 - 1.000.000 đồng"
    if "vach" in violation or "ke duong" in violation or "de vach" in violation:
        return "400.000 - 600.000 đồng" if is_car_like else "200.000 - 400.000 đồng"
    if "sai lan" in violation or "lan duong" in violation:
        return "4.000.000 - 6.000.000 đồng" if is_car_like else "600.000 - 800.000 đồng"
    if "toc do" in violation:
        return "Cần xác định ngưỡng quá tốc độ"
    return "Cần đối chiếu lỗi cụ thể"


def _normalize_review_status(value: str) -> str:
    try:
        return normalize_review_status(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _case_code_for_detection(detection: Detection) -> str:
    return case_code_for_detection(detection, fallback_time=_vn_now())


def _build_violation_notice(row: Detection) -> Dict[str, Any]:
    vehicle_type = _canonical_vehicle_type(row.vehicle_type)
    owner_info = _repair_dict_text_values(_demo_owner_for_plate(row.plate_number))
    timestamp = row.timestamp.strftime("%d/%m/%Y %H:%M:%S") if row.timestamp else ""
    notice = {
        "id": row.id,
        "case_code": _case_code_for_detection(row),
        "license_plate": row.plate_number or "Chưa xác nhận OCR",
        "vehicle_type": _VEHICLE_LABELS.get(vehicle_type, vehicle_type),
        "violation_type": row.violation_type or "Chưa phân loại",
        "timestamp": timestamp,
        "camera_id": _normalize_display_text(row.camera_id or ""),
        "fine_amount": _fine_amount_for_violation(row.violation_type or "", vehicle_type),
        "legal_basis": _TELEGRAM_FINE_BASIS,
        "review_status": _effective_review_status(row),
        "reviewed_by": _normalize_display_text(row.reviewed_by or ""),
        "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else "",
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else "",
        "review_note": _normalize_display_text(row.review_note or ""),
        "owner_name": owner_info.get("owner_name", ""),
        "owner_phone": owner_info.get("owner_phone", ""),
        "owner_email": owner_info.get("owner_email", ""),
        "owner_address": owner_info.get("owner_address", ""),
        "vehicle_image_b64": _get_image_b64(row.image_path),
        "plate_image_b64": _get_image_b64(row.crop_path),
        "ocr_score": float(row.ocr_score or 0.0),
    }
    notice["license_plate"] = _normalize_display_text(notice.get("license_plate") or "Chưa xác nhận OCR")
    notice["violation_type"] = _normalize_display_text(notice.get("violation_type") or "Chưa phân loại")
    return notice


def _parse_notification_sent_at(value: str = "") -> datetime:
    return parse_notification_sent_at(value, now_provider=_vn_now)


def _quality_plate_token(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def _quality_has_plate_like_token(value: Any, *, allow_numeric_identifier: bool = False) -> bool:
    token = _quality_plate_token(value)
    if 7 <= len(token) <= 9 and any(ch.isdigit() for ch in token) and any(ch.isalpha() for ch in token):
        return True
    if allow_numeric_identifier and token.isdigit() and 6 <= len(token) <= 12:
        return True
    return False


def _quality_needs_ocr_recovery(detection: Detection) -> bool:
    if not detection.crop_path or not os.path.exists(detection.crop_path):
        return False
    if _quality_has_plate_like_token(
        detection.plate_number,
        allow_numeric_identifier=_quality_is_truck_body_source(detection),
    ):
        return False
    raw_plate = str(detection.plate_number or "").strip().upper()
    return raw_plate in {"", "UNKNOWN", "KHONG RO BIEN SO", "KHONGROBIENSO"} or len(_quality_plate_token(raw_plate)) < 7


def _quality_normalize_ocr_candidate(value: Any, vehicle_type: str = "") -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    fixed_plate, _ = normalize_plate_number(
        raw,
        verbose=False,
        expected_vehicle_type=vehicle_type or None,
    )
    return _quality_plate_token(fixed_plate or raw)


def _quality_is_truck_body_source(detection: Detection) -> bool:
    source = str(detection.plate_crop_source or "").lower()
    reason = str(detection.plate_debug_reason or "").lower()
    return source == "truck_body" or "truck_body" in reason


def get_ai_quality_summary(
    minutes: int = Query(default=1440, ge=1, le=1440),
    limit: int = Query(default=150, ge=1, le=500),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Summarize recognition evidence quality from persisted detections.

    This endpoint is intentionally read-only. It does not invoke tracking,
    vehicle detection, plate crop, OCR, or any model path.
    """
    cutoff = datetime.now() - timedelta(minutes=minutes)
    rows = (
        db.query(Detection)
        .filter(Detection.timestamp >= cutoff)
        .order_by(Detection.timestamp.desc(), Detection.id.desc())
        .limit(limit)
        .all()
    )

    counters = {
        "total": len(rows),
        "vehicle_image_ok": 0,
        "plate_crop_ok": 0,
        "ocr_success": 0,
        "truck_body_fallback": 0,
        "needs_review": 0,
    }
    issue_counts: Dict[str, int] = {}
    by_camera: Dict[str, Dict[str, int]] = {}
    recent_issues: List[Dict[str, Any]] = []

    for row in rows:
        camera_id = row.camera_id or "UNKNOWN"
        camera_stats = by_camera.setdefault(
            camera_id,
            {"total": 0, "vehicle_image_ok": 0, "plate_crop_ok": 0, "ocr_success": 0, "needs_review": 0},
        )
        camera_stats["total"] += 1

        vehicle_ok = bool(row.image_path and os.path.exists(row.image_path))
        plate_crop_ok = bool(row.crop_path and os.path.exists(row.crop_path))
        truck_body_source = _quality_is_truck_body_source(row)
        plate_ok = _quality_has_plate_like_token(row.plate_number, allow_numeric_identifier=truck_body_source)
        truck_body_ok = bool(plate_crop_ok and truck_body_source and plate_ok)

        if vehicle_ok:
            counters["vehicle_image_ok"] += 1
            camera_stats["vehicle_image_ok"] += 1
        if plate_crop_ok:
            counters["plate_crop_ok"] += 1
            camera_stats["plate_crop_ok"] += 1
        if plate_ok:
            counters["ocr_success"] += 1
            camera_stats["ocr_success"] += 1
        if truck_body_ok:
            counters["truck_body_fallback"] += 1

        issues: List[str] = []
        if not vehicle_ok:
            issues.append("missing_vehicle_image")
        if not plate_crop_ok:
            issues.append("missing_plate_crop")
        elif not plate_ok:
            issues.append("crop_present_but_ocr_empty")
        if truck_body_ok:
            issue_counts["truck_body_identifier_accepted"] = issue_counts.get("truck_body_identifier_accepted", 0) + 1

        if issues:
            counters["needs_review"] += 1
            camera_stats["needs_review"] += 1
            for issue in issues:
                issue_counts[issue] = issue_counts.get(issue, 0) + 1
            if len(recent_issues) < 24:
                recent_issues.append(
                    {
                        "id": row.id,
                        "camera_id": camera_id,
                        "vehicle_type": getattr(row, "vehicle_type_vi", "") or row.vehicle_type,
                        "plate_number": row.plate_number or "",
                        "plate_crop_source": row.plate_crop_source or "",
                        "plate_debug_reason": row.plate_debug_reason or "",
                        "timestamp": row.timestamp.isoformat() if hasattr(row.timestamp, "isoformat") else str(row.timestamp),
                        "issues": issues,
                    }
                )

    def _rate(ok: int) -> float:
        total = max(counters["total"], 1)
        return round(ok * 100.0 / total, 1)

    return {
        "generated_at": _vn_now().isoformat(),
        "window_minutes": minutes,
        "limit": limit,
        "total": counters["total"],
        "vehicle_image": {"ok": counters["vehicle_image_ok"], "rate": _rate(counters["vehicle_image_ok"])},
        "plate_crop": {"ok": counters["plate_crop_ok"], "rate": _rate(counters["plate_crop_ok"])},
        "ocr": {"ok": counters["ocr_success"], "rate": _rate(counters["ocr_success"])},
        "truck_body_fallback": {"count": counters["truck_body_fallback"]},
        "needs_review": {"count": counters["needs_review"], "rate": _rate(counters["needs_review"])},
        "issue_counts": issue_counts,
        "by_camera": by_camera,
        "recent_issues": recent_issues,
    }


def get_ai_quality_evidence(
    detection_id: int,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = db.query(Detection).filter(Detection.id == detection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Detection not found")

    payload = _serialize_detection(row)
    vehicle_ok = bool(row.image_path and os.path.exists(row.image_path))
    plate_crop_ok = bool(row.crop_path and os.path.exists(row.crop_path))
    truck_body_source = _quality_is_truck_body_source(row)
    plate_ok = _quality_has_plate_like_token(row.plate_number, allow_numeric_identifier=truck_body_source)
    truck_body_ok = bool(plate_crop_ok and truck_body_source and plate_ok)
    issues: List[str] = []
    if not vehicle_ok:
        issues.append("missing_vehicle_image")
    if not plate_crop_ok:
        issues.append("missing_plate_crop")
    elif not plate_ok:
        issues.append("crop_present_but_ocr_empty")

    payload["quality"] = {
        "vehicle_image_ok": vehicle_ok,
        "plate_crop_ok": plate_crop_ok,
        "ocr_success": plate_ok,
        "truck_body_identifier": truck_body_ok,
        "issues": issues,
        "identifier_label": "Định danh xe tải" if truck_body_ok else ("Biển số" if plate_ok else "Chưa xác nhận OCR"),
    }
    return payload


def get_ai_quality_evidence_html(
    detection_id: int,
    db: Session = Depends(get_db),
) -> HTMLResponse:
    payload = get_ai_quality_evidence(detection_id=detection_id, db=db)
    vehicle_img = (
        f"<img src='data:image/jpeg;base64,{payload.get('vehicle_crop_b64', '')}' alt='vehicle evidence' />"
        if payload.get("vehicle_crop_b64")
        else "<div class='empty'>Không có ảnh toàn xe</div>"
    )
    plate_img = (
        f"<img src='data:image/jpeg;base64,{payload.get('plate_crop_b64', '')}' alt='plate evidence' />"
        if payload.get("plate_crop_b64")
        else "<div class='empty'>Không có ảnh crop biển/định danh</div>"
    )
    quality = payload.get("quality", {})
    issues = ", ".join(quality.get("issues", [])) or "Không có"
    html = f"""
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Bằng chứng kiểm định AI #{payload.get('id')}</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 28px; color: #0f172a; background: #f8fafc; }}
    h1 {{ margin: 0 0 6px; font-size: 25px; }}
    .muted {{ color: #64748b; font-size: 13px; }}
    .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; }}
    .panel {{ border: 1px solid #dbe3ef; border-radius: 12px; background: #fff; padding: 16px; }}
    .media {{ display: flex; min-height: 320px; align-items: center; justify-content: center; overflow: hidden; border-radius: 10px; background: #000; }}
    img {{ max-width: 100%; max-height: 520px; object-fit: contain; }}
    .empty {{ color: #94a3b8; }}
    .meta {{ margin-top: 18px; border: 1px solid #dbe3ef; border-radius: 12px; background: #fff; padding: 16px; line-height: 1.7; }}
  </style>
</head>
<body>
  <h1>Bằng chứng kiểm định AI #{payload.get('id')}</h1>
  <p class="muted">{payload.get('timestamp')} · {payload.get('camera_id')} · {payload.get('vehicle_type_vi') or payload.get('vehicle_type')}</p>
  <div class="grid">
    <section class="panel"><h2>Ảnh toàn xe</h2><div class="media">{vehicle_img}</div></section>
    <section class="panel"><h2>{quality.get('identifier_label', 'Ảnh biển số')}</h2><div class="media">{plate_img}</div></section>
  </div>
  <div class="meta">
    <div><strong>Biển/định danh:</strong> {payload.get('plate_number') or 'Không rõ'}</div>
    <div><strong>Nguồn crop:</strong> {payload.get('plate_crop_source') or 'none'}</div>
    <div><strong>Lý do/debug:</strong> {payload.get('plate_debug_reason') or 'Không có'}</div>
    <div><strong>Vấn đề:</strong> {issues}</div>
  </div>
</body>
</html>
"""
    return HTMLResponse(content=html)


def get_ai_quality_report_html(
    minutes: int = Query(default=1440, ge=1, le=1440),
    limit: int = Query(default=150, ge=1, le=500),
    db: Session = Depends(get_db),
) -> HTMLResponse:
    summary = get_ai_quality_summary(minutes=minutes, limit=limit, db=db)
    ocr_runtime = get_ocr_runtime_status()
    ocr_issue_text = ", ".join(ocr_runtime.get("issues", [])) or "Không có"
    ocr_status = str(ocr_runtime.get("status") or "unknown")
    rows_html = "".join(
        f"""
        <tr>
          <td>#{item['id']}</td>
          <td>{item['camera_id']}</td>
          <td>{item['vehicle_type'] or '-'}</td>
          <td>{item['plate_number'] or 'Chưa rõ'}</td>
          <td>{item['plate_crop_source'] or 'none'}</td>
          <td>{', '.join(item['issues'])}</td>
        </tr>
        """
        for item in summary["recent_issues"]
    )
    if not rows_html:
        rows_html = "<tr><td colspan='6'>Không có bản ghi cần kiểm tra trong cửa sổ dữ liệu hiện tại.</td></tr>"

    html = f"""
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Báo cáo kiểm định AI</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }}
    h1 {{ margin: 0 0 8px; font-size: 26px; }}
    .muted {{ color: #64748b; font-size: 13px; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }}
    .card {{ border: 1px solid #dbe3ef; border-radius: 10px; padding: 16px; background: #f8fafc; }}
    .card strong {{ display: block; font-size: 28px; margin-top: 10px; }}
    .runtime {{ border: 1px solid #dbe3ef; border-radius: 10px; padding: 16px; margin: 10px 0 24px; background: #fff; }}
    .runtime-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; }}
    .runtime-item {{ border-radius: 8px; background: #f8fafc; padding: 10px; }}
    .runtime-item span {{ display: block; color: #64748b; font-size: 12px; margin-bottom: 4px; }}
    table {{ border-collapse: collapse; width: 100%; margin-top: 20px; font-size: 13px; }}
    th, td {{ border: 1px solid #dbe3ef; padding: 9px; text-align: left; }}
    th {{ background: #f1f5f9; }}
    .warn {{ color: #e11d48; font-weight: 700; }}
  </style>
</head>
<body>
  <h1>Báo cáo kiểm định chất lượng AI</h1>
  <p class="muted">Tạo lúc {summary['generated_at']} · Dữ liệu {summary['window_minutes']} phút gần nhất · {summary['total']} bản ghi.</p>
  <div class="grid">
    <div class="card">Ảnh toàn xe<strong>{summary['vehicle_image']['rate']}%</strong><span>{summary['vehicle_image']['ok']} bản ghi đạt</span></div>
    <div class="card">Crop biển/định danh<strong>{summary['plate_crop']['rate']}%</strong><span>{summary['plate_crop']['ok']} bản ghi đạt</span></div>
    <div class="card">OCR/định danh<strong>{summary['ocr']['rate']}%</strong><span>{summary['ocr']['ok']} bản ghi đạt</span></div>
    <div class="card">Cần kiểm tra<strong class="warn">{summary['needs_review']['rate']}%</strong><span>{summary['needs_review']['count']} bản ghi</span></div>
  </div>
  <div class="runtime">
    <h2>Trạng thái OCR runtime</h2>
    <p class="muted">Chẩn đoán chỉ đọc, không khởi tạo lại model và không can thiệp tracking/crop/stream realtime.</p>
    <div class="runtime-grid">
      <div class="runtime-item"><span>Trạng thái</span><strong>{ocr_status}</strong></div>
      <div class="runtime-item"><span>TensorFlow</span><strong>{'Có' if ocr_runtime['packages']['tensorflow'] else 'Thiếu'}</strong></div>
      <div class="runtime-item"><span>PaddleOCR</span><strong>{'Có' if ocr_runtime['packages']['paddleocr'] else 'Thiếu'}</strong></div>
      <div class="runtime-item"><span>Model Paddle</span><strong>{'Đọc được' if ocr_runtime['paths']['paddle_model_readable'] else 'Không đọc được'}</strong></div>
    </div>
    <p class="muted">Cần xử lý: {ocr_issue_text}</p>
  </div>
  <h2>Bản ghi cần kiểm tra</h2>
  <table>
    <thead><tr><th>ID</th><th>Camera</th><th>Loại xe</th><th>Biển/định danh</th><th>Nguồn crop</th><th>Vấn đề</th></tr></thead>
    <tbody>{rows_html}</tbody>
  </table>
</body>
</html>
"""
    return HTMLResponse(content=html)


def post_ai_quality_recover_ocr(
    minutes: int = Query(default=1440, ge=1, le=1440),
    limit: int = Query(default=24, ge=1, le=100),
    min_score: float = Query(default=0.35, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Retry OCR only for persisted rows that already have a saved plate/identifier crop.

    This is a manual recovery path for audit/demo data. It does not change camera
    streaming, tracking, detection thresholds, realtime crop rules, or model config.
    """
    cutoff = datetime.now() - timedelta(minutes=minutes)
    rows = (
        db.query(Detection)
        .filter(Detection.timestamp >= cutoff)
        .order_by(Detection.timestamp.desc(), Detection.id.desc())
        .limit(max(limit * 4, limit))
        .all()
    )

    candidates = [row for row in rows if _quality_needs_ocr_recovery(row)][:limit]
    updated: List[Dict[str, Any]] = []
    failed: List[Dict[str, Any]] = []

    for row in candidates:
        try:
            result = recognize_plate_crop_file(
                row.crop_path or "",
                expected_vehicle_type=row.vehicle_type or None,
                accurate=True,
            )
            raw_plate = str(result.get("plate_number") or "").strip()
            score = float(result.get("ocr_score") or 0.0)
            plate = _quality_normalize_ocr_candidate(raw_plate, row.vehicle_type or "")
            truck_body_source = _quality_is_truck_body_source(row)
            valid_plate = _quality_has_plate_like_token(plate, allow_numeric_identifier=truck_body_source)
            if valid_plate and score >= float(min_score):
                row.plate_number = plate
                row.ocr_score = score
                row.is_temporary = 0 if match_vn_plate(plate, expected_vehicle_type=row.vehicle_type or None) else row.is_temporary
                row.is_simulated = 0
                previous_reason = str(row.plate_debug_reason or "").strip()
                row.plate_debug_reason = (
                    f"{previous_reason}|ocr_recovered_saved_crop"
                    if previous_reason
                    else "ocr_recovered_saved_crop"
                )
                row.plate_debug_variant = str(result.get("variant") or row.plate_debug_variant or "")
                row.last_seen_at = _vn_now()
                db.add(row)
                updated.append(
                    {
                        "id": row.id,
                        "camera_id": row.camera_id,
                        "vehicle_type": row.vehicle_type,
                        "plate_number": plate,
                        "ocr_score": round(score, 4),
                        "variant": result.get("variant") or "",
                    }
                )
            else:
                failed.append(
                    {
                        "id": row.id,
                        "camera_id": row.camera_id,
                        "vehicle_type": row.vehicle_type,
                        "plate_number": raw_plate,
                        "ocr_score": round(score, 4),
                        "variant": result.get("variant") or "",
                        "reason": "no_valid_plate_or_low_score",
                    }
                )
        except Exception as exc:
            failed.append(
                {
                    "id": row.id,
                    "camera_id": row.camera_id,
                    "vehicle_type": row.vehicle_type,
                    "plate_number": "",
                    "ocr_score": 0.0,
                    "variant": "",
                    "reason": f"{type(exc).__name__}: {exc}",
                }
            )

    if updated:
        db.commit()
    else:
        db.rollback()

    return {
        "attempted": len(candidates),
        "updated": len(updated),
        "failed": failed[:24],
        "items": updated,
        "summary": get_ai_quality_summary(minutes=minutes, limit=150, db=db),
    }


class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = None
    history: List[Dict[str, str]] = Field(default_factory=list)
    context_hint: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    context_items: int


class UserCreateRequest(BaseModel):
    username: str
    password: Optional[str] = None
    role: str = "operator"


class UserRoleUpdateRequest(BaseModel):
    role: str


class UserPasswordUpdateRequest(BaseModel):
    password: str


class UserStatusUpdateRequest(BaseModel):
    is_active: bool


class ViolationPointPayload(BaseModel):
    x: float
    y: float


class ViolationAreaPayload(BaseModel):
    id: str
    type: str
    name: str
    points: List[ViolationPointPayload] = Field(default_factory=list)


class RightTurnExceptionPayload(BaseModel):
    enabled: bool = True
    permissionSource: str = "arrow-or-sign"
    vehicleScope: str = "all"
    stopLineId: str = ""
    turnZoneId: str = ""
    arrowSignalZoneId: str = ""
    permissionSignZoneId: str = ""
    arrowSignalActive: bool = True
    permissionSignActive: bool = True
    mainSignalState: str = "red"
    notes: str = ""


class MovementExceptionPayload(BaseModel):
    id: str = ""
    movement: str = "right_turn"
    permissionSource: str = "arrow-or-sign"
    vehicleScope: str = "all"
    approachLaneRoi: List[ViolationPointPayload] = Field(default_factory=list)
    exitRoi: List[ViolationPointPayload] = Field(default_factory=list)
    maxDecisionFrames: int = 8


class RedLightRulePayload(BaseModel):
    id: str = ""
    enabled: bool = True
    trafficLightId: str = ""
    stopLineId: str = ""
    laneRoi: List[ViolationPointPayload] = Field(default_factory=list)
    violationDirection: str = "bottom_to_top"
    minTrackPoints: int = 3
    requirePlateOrCrop: bool = False
    movementExceptions: List[MovementExceptionPayload] = Field(default_factory=list)


class CameraViolationConfigPayload(BaseModel):
    areas: List[ViolationAreaPayload] = Field(default_factory=list)
    rightTurnException: RightTurnExceptionPayload = Field(default_factory=RightTurnExceptionPayload)
    redLightRules: List[RedLightRulePayload] = Field(default_factory=list)


app = FastAPI(title="ALPR Backend", version="1.0.0")

_RATE_LIMIT_LOCK = threading.Lock()
_RATE_LIMIT_BUCKETS: Dict[str, List[float]] = {}
_RATE_LIMIT_RULES = {
    "/api/auth/login": (10, 60),
    "/api/upload": (20, 60),
    "/api/chat": (60, 60),
    "/api/notifications/send": (30, 60),
}


@app.middleware("http")
async def rate_limit_sensitive_endpoints(request: Request, call_next):
    rule = _RATE_LIMIT_RULES.get(request.url.path)
    if rule:
        limit, window_seconds = rule
        forwarded = (
            request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            if _env_bool("TRUST_PROXY_HEADERS", False)
            else ""
        )
        client_ip = forwarded or (request.client.host if request.client else "unknown")
        key = f"{request.url.path}:{client_ip}"
        now = time.monotonic()
        with _RATE_LIMIT_LOCK:
            if len(_RATE_LIMIT_BUCKETS) > 10_000:
                for bucket_key, stamps in list(_RATE_LIMIT_BUCKETS.items()):
                    if not stamps or now - stamps[-1] >= window_seconds:
                        _RATE_LIMIT_BUCKETS.pop(bucket_key, None)
            recent = [stamp for stamp in _RATE_LIMIT_BUCKETS.get(key, []) if now - stamp < window_seconds]
            if len(recent) >= limit:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests; please retry later"},
                    headers={"Retry-After": str(window_seconds)},
                )
            recent.append(now)
            _RATE_LIMIT_BUCKETS[key] = recent
    return await call_next(request)

_default_frontend_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
_extra_frontend_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[*_default_frontend_origins, *_extra_frontend_origins],
    allow_origin_regex=(
        r"https://.*\.vercel\.app"
        if _env_bool("ALLOW_VERCEL_PREVIEW_ORIGINS", False)
        else None
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    data_center.router,
    prefix="/api/data",
    tags=["Data Center"],
    dependencies=[Depends(require_any_role)],
)
app.include_router(
    analytics.router,
    prefix="/api/analytics",
    tags=["Analytics"],
    dependencies=[Depends(require_any_role)],
)
app.include_router(
    system_info.router,
    prefix="/api/system",
    tags=["System"],
    dependencies=[Depends(require_any_role)],
)
app.include_router(zalo.router, prefix="/api/zalo", tags=["Zalo Chatbot"])
app.get("/api/ai-quality/summary", dependencies=[Depends(require_any_role)])(get_ai_quality_summary)
app.post("/api/ai-quality/recover-ocr", dependencies=[Depends(require_admin)])(post_ai_quality_recover_ocr)
app.get("/api/ai-quality/evidence/{detection_id}", dependencies=[Depends(require_any_role)])(get_ai_quality_evidence)
app.get("/api/ai-quality/evidence-html/{detection_id}", response_class=HTMLResponse, dependencies=[Depends(require_any_role)])(get_ai_quality_evidence_html)
app.get("/api/ai-quality/report.html", response_class=HTMLResponse, dependencies=[Depends(require_any_role)])(get_ai_quality_report_html)


def _safe_ms_between(start: Any, end: Any) -> Optional[int]:
    try:
        if not start or not end:
            return None
        delta = end - start
        return max(0, int(delta.total_seconds() * 1000))
    except Exception:
        return None


def _debug_issue_labels(row: Detection) -> List[str]:
    issues: List[str] = []
    vehicle_ok = bool(row.image_path and os.path.exists(row.image_path))
    plate_crop_ok = bool(row.crop_path and os.path.exists(row.crop_path))
    truck_body_source = _quality_is_truck_body_source(row)
    plate_ok = _quality_has_plate_like_token(row.plate_number, allow_numeric_identifier=truck_body_source)
    score = float(row.ocr_score or 0.0)
    votes = int(row.vote_count or 0)

    if not vehicle_ok:
        issues.append("missing_vehicle_crop")
    if not plate_crop_ok:
        issues.append("missing_plate_crop")
    if plate_crop_ok and not plate_ok:
        issues.append("plate_crop_without_valid_ocr")
    if plate_ok and score < _TRACK_CONFIRMED_VOTE_MIN_SCORE and votes < _TRACK_CONFIRMED_MIN_VOTES:
        issues.append("low_confidence_plate")
    if row.is_temporary:
        issues.append("temporary_waiting_consensus")
    if not row.track_id:
        issues.append("missing_track_id")
    return issues


def _debug_recommendation(issues: List[str], row: Detection) -> str:
    if "missing_track_id" in issues:
        return "Kiểm tra tracker: bản ghi thiếu track_id nên dễ ghép nhầm crop/biển."
    if "missing_vehicle_crop" in issues:
        return "Kiểm tra crop xe: chưa có ảnh toàn xe được lưu cho bản ghi này."
    if "missing_plate_crop" in issues:
        return "Kiểm tra detector biển hoặc fallback crop: chưa có crop biển để OCR."
    if "plate_crop_without_valid_ocr" in issues:
        return "Crop đã có nhưng OCR chưa ổn: nên chờ best-frame/vote thêm hoặc chạy Recover OCR."
    if "temporary_waiting_consensus" in issues:
        return "Đang chờ đủ vote theo track_id trước khi chốt biển rõ ràng."
    if _quality_is_truck_body_source(row):
        return "Đang dùng định danh thân xe tải; nên đối chiếu ảnh xe và quy tắc vận hành."
    return "Bản ghi ổn: có crop xe, crop biển/định danh và OCR đã qua kiểm tra cơ bản."


@app.get("/api/ai-debug/tracks", dependencies=[Depends(require_admin)])
def get_ai_debug_tracks(
    minutes: int = Query(default=1440, ge=1, le=1440),
    limit: int = Query(default=80, ge=1, le=300),
    include_images: bool = Query(default=True),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Realtime-friendly AI debug feed grouped by camera + vehicle track id.

    This endpoint is read-only. It helps the frontend show whether vehicle crop,
    plate crop, OCR voting, and tracking association are behaving coherently.
    """
    cutoff = datetime.now() - timedelta(minutes=minutes)
    rows = (
        db.query(Detection)
        .filter(Detection.timestamp >= cutoff)
        .order_by(Detection.last_seen_at.desc(), Detection.timestamp.desc(), Detection.id.desc())
        .limit(limit)
        .all()
    )

    track_groups: Dict[str, Dict[str, Any]] = {}
    total_latency_ms = 0
    latency_count = 0
    issue_counts: Dict[str, int] = {}
    confirmed_count = 0

    for row in rows:
        camera_id = row.camera_id or "UNKNOWN"
        track_key = f"{camera_id}:{row.track_id if row.track_id is not None else 'no-track'}"
        issues = _debug_issue_labels(row)
        for issue in issues:
            issue_counts[issue] = issue_counts.get(issue, 0) + 1

        confirmed = _is_confirmed_plate(
            row.plate_number or "",
            row.ocr_score or 0.0,
            row.vote_count or 0,
            expected_vehicle_type=row.vehicle_type or "",
        )
        if confirmed:
            confirmed_count += 1

        latency_ms = _safe_ms_between(row.timestamp, row.last_seen_at or row.timestamp)
        if confirmed and latency_ms is not None:
            total_latency_ms += latency_ms
            latency_count += 1

        item = _serialize_detection(row)
        if not include_images:
            item["vehicle_crop_b64"] = ""
            item["plate_crop_b64"] = ""

        item.update(
            {
                "track_key": track_key,
                "quality_issues": issues,
                "confirmed": confirmed,
                "reading_latency_ms": latency_ms,
                "recommendation": _debug_recommendation(issues, row),
            }
        )

        group = track_groups.setdefault(
            track_key,
            {
                "track_key": track_key,
                "camera_id": camera_id,
                "track_id": row.track_id,
                "records": [],
                "best_record": None,
                "first_seen": row.timestamp.isoformat() if row.timestamp else "",
                "last_seen": (row.last_seen_at or row.timestamp).isoformat() if (row.last_seen_at or row.timestamp) else "",
                "confirmed": False,
                "issue_counts": {},
            },
        )
        group["records"].append(item)
        group["confirmed"] = bool(group["confirmed"] or confirmed)
        group["last_seen"] = item.get("last_seen_at") or group["last_seen"]
        for issue in issues:
            group["issue_counts"][issue] = group["issue_counts"].get(issue, 0) + 1

        current_best = group.get("best_record")
        best_rank = (
            1 if confirmed else 0,
            float(row.ocr_score or 0.0),
            int(row.vote_count or 0),
            1 if row.crop_path and os.path.exists(row.crop_path) else 0,
            1 if row.image_path and os.path.exists(row.image_path) else 0,
            int(row.id or 0),
        )
        previous_rank = tuple(current_best.get("_rank", ())) if current_best else ()
        if not current_best or best_rank > previous_rank:
            best_item = dict(item)
            best_item["_rank"] = best_rank
            group["best_record"] = best_item

    groups = list(track_groups.values())
    for group in groups:
        best_record = group.get("best_record") or {}
        if "_rank" in best_record:
            best_record.pop("_rank", None)
        group["record_count"] = len(group.get("records") or [])
        group["status"] = "confirmed" if group.get("confirmed") else ("needs_review" if group.get("issue_counts") else "reading")

    groups.sort(
        key=lambda group: (
            1 if group.get("status") == "needs_review" else 0,
            str(group.get("last_seen") or ""),
        ),
        reverse=True,
    )

    return {
        "generated_at": _vn_now().isoformat(),
        "window_minutes": minutes,
        "total_records": len(rows),
        "total_tracks": len(groups),
        "confirmed_records": confirmed_count,
        "confirmed_rate": round(confirmed_count * 100.0 / max(1, len(rows)), 1),
        "avg_confirm_latency_ms": int(total_latency_ms / latency_count) if latency_count else None,
        "issue_counts": issue_counts,
        "runtime": get_ocr_runtime_status(),
        "tracks": groups,
    }


@app.on_event("startup")
def on_startup() -> None:
    # Run database migrations
    try:
        from backend.migrations import run_migrations
        run_migrations()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Migration failed: {e}")

    # Increase threadpool capacity: each /video_feed stream holds a worker thread.
    # If many streams are open, default threadpool can starve normal API endpoints
    # (e.g. /health, /api/history) causing timeouts.
    try:
        import anyio
        _limiter = anyio.to_thread.current_default_thread_limiter()
        if getattr(_limiter, "total_tokens", 0) < 200:
            _limiter.total_tokens = 200
            print(f"[BOOT] Increased threadpool tokens to {_limiter.total_tokens}")
    except Exception:
        pass

    # Ensure required directories and database exist
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    os.makedirs(PROCESSED_CROPS_DIR, exist_ok=True)
    os.makedirs(MODELS_DIR, exist_ok=True)
    init_db()
    _start_runtime_cleanup_worker()

    # Mapping camera ID → file prefix
    _CAM_TO_FILE = {
        "CAM_01": 1, "CAM_02": 2, "CAM_03": 3,
        "CAM_04": 4, "CAM_05": 5, "CAM_06": 6
    }
    
    # Auto load video mặc định từ thư mục videos/
    _loaded = 0
    for _cam_id, _num in _CAM_TO_FILE.items():
        _vpath = _find_default_video(_num)
        if _vpath:
            # Chỉ load nếu camera chưa cĂ³ video
            _current = get_camera_source(_cam_id)
            if not _current:
                set_camera_source(_cam_id, _vpath)
                _loaded += 1
                print(f"[AUTO LOAD] {_cam_id} ← {os.path.basename(_vpath)}")
                print(
                    f"[AUTO LOAD] Stream URL: "
                    f"/video_feed/{os.path.basename(_vpath)}"
                    f"?cam_id={_cam_id}"
                )
                # ← ÄĂƒ THÊM: log URL để debug frontend
    
    if _loaded > 0:
        print(f"[AUTO LOAD] ÄĂ£ load {_loaded} video mặc định")
    else:
        print(f"[AUTO LOAD] KhĂ´ng tìm thấy video trong {DEFAULT_VIDEOS_DIR}")
        print(f"[AUTO LOAD] Đặt video vĂ o thư mục trĂªn vá»›i tĂªn: cam1.mp4, cam2.mp4, ...")
    # ← ÄĂƒ THÊM: auto load video khi startup

    # Tạo tĂ i khoản mặc định
    _auth_db = SessionLocal()
    try:
        seed_demo_users = _env_bool(
            "SEED_DEMO_USERS",
            os.getenv("APP_ENV", "development").strip().lower() not in {"production", "prod"},
        )
        if seed_demo_users and not _auth_db.query(User).filter(User.username == "admin").first():
            _auth_db.add(User(
                username="admin",
                hashed_password=hash_password("admin123"),
                role="admin"))
            _auth_db.commit()
            print("[AUTH] admin OK")
        if seed_demo_users and not _auth_db.query(User).filter(User.username == "viewer").first():
            _auth_db.add(User(
                username="viewer",
                hashed_password=hash_password("viewer123"),
                role="viewer"))
            _auth_db.commit()
            print("[AUTH] viewer OK")
        if seed_demo_users and not _auth_db.query(User).filter(User.username == "operator").first():
            _auth_db.add(User(
                username="operator",
                hashed_password=hash_password("operator123"),
                role="operator"))
            _auth_db.commit()
            print("[AUTH] operator OK")
        if seed_demo_users and not _auth_db.query(User).filter(User.username == "user").first():
            _auth_db.add(User(
                username="user",
                hashed_password=hash_password("user123"),
                role="user"))
            _auth_db.commit()
            print("[AUTH] user OK")
    finally:
        _auth_db.close()
    # ← ÄĂƒ THÊM: tạo user mặc định khi startup

    if _BACKGROUND_OCR_ENABLED:
        threading.Thread(target=_background_ocr_worker, daemon=True, name="background-ocr-worker").start()
        recovery_count = _enqueue_startup_evidence_recovery()
        print(f"[OCR-BG] Background OCR worker started; startup recovery queued={recovery_count}")

    if _env_int("AI_PRELOAD_ON_START", 1):
        threading.Thread(target=preload_ai_runtime, daemon=True, name="ai-runtime-warmup").start()


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"}


@app.post("/api/auth/login")
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    username = (form.username or "").strip()
    password = form.password or ""
    print(f"[AUTH] Login attempt: '{username}'")
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        print(f"[AUTH] Login FAILED for: '{username}'")
        raise HTTPException(
            status_code=401,
            detail="Sai tài khoản hoặc mật khẩu")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị khóa.")
    token = create_token({"sub": user.username, "role": user.role})
    response = JSONResponse({
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
    })
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Vary"] = "Cookie, Authorization"
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        secure=os.getenv("APP_ENV", "development").strip().lower() in {"production", "prod"},
        samesite="lax",
        max_age=24 * 60 * 60,
        path="/",
    )
    return response


@app.post("/api/auth/logout")
def logout() -> JSONResponse:
    response = JSONResponse({"ok": True})
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Vary"] = "Cookie, Authorization"
    response.delete_cookie("auth_token", path="/", samesite="lax")
    return response


@app.get("/api/auth/me")
def get_me(
    response: Response,
    current_user: User = Depends(get_current_user)
):
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Vary"] = "Cookie, Authorization"
    return {
        "username": current_user.username,
        "role": current_user.role,
        "is_active": current_user.is_active}


@app.get("/api/auth/users")
def get_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    users = db.query(User).all()
    return [{
        "id": u.id,
        "username": u.username,
        "role": u.role,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in users]


def _validate_user_role(role: str) -> str:
    role_value = (role or "").strip().lower()
    if role_value not in {"admin", "operator", "viewer", "user"}:
        raise HTTPException(status_code=400, detail="Role không hợp lệ.")
    return role_value


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@app.post("/api/auth/users")
def create_user(
    payload: UserCreateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    username = re.sub(r"[^a-zA-Z0-9_.-]", "", (payload.username or "").strip())
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Tên đăng nhập phải có ít nhất 3 ký tự.")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="Tên đăng nhập đã tồn tại.")
    role = _validate_user_role(payload.role)
    password = payload.password or _generate_temp_password()
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Mật khẩu phải có ít nhất 8 ký tự.")
    user = User(username=username, hashed_password=hash_password(password), role=role, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "is_active": user.is_active,
        "temporary_password": password,
    }


@app.patch("/api/auth/users/{user_id}/role")
def update_user_role(
    user_id: int,
    payload: UserRoleUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    if user.username == current_user.username and payload.role != "admin":
        raise HTTPException(status_code=400, detail="Không thể tự hạ quyền admin của chính mình.")
    user.role = _validate_user_role(payload.role)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "role": user.role, "is_active": user.is_active}


@app.patch("/api/auth/users/{user_id}/password")
def update_user_password(
    user_id: int,
    payload: UserPasswordUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    if len(payload.password or "") < 8:
        raise HTTPException(status_code=400, detail="Mật khẩu phải có ít nhất 8 ký tự.")
    user.hashed_password = hash_password(payload.password)
    db.commit()
    return {"ok": True}


@app.patch("/api/auth/users/{user_id}/status")
def update_user_status(
    user_id: int,
    payload: UserStatusUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    if user.username == current_user.username and not payload.is_active:
        raise HTTPException(status_code=400, detail="Không thể tự khóa tài khoản đang đăng nhập.")
    user.is_active = bool(payload.is_active)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "role": user.role, "is_active": user.is_active}


@app.delete("/api/auth/users/{user_id}")
def delete_user_account(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    if user.username == current_user.username:
        raise HTTPException(status_code=400, detail="Không thể xóa tài khoản đang đăng nhập.")
    if user.role == "admin":
        active_admin_count = db.query(User).filter(
            User.role == "admin",
            User.is_active == True,  # noqa: E712
            User.id != user.id,
        ).count()
        if active_admin_count == 0:
            raise HTTPException(status_code=400, detail="Phải còn ít nhất một admin đang hoạt động.")
    deleted_username = user.username
    db.delete(user)
    db.commit()
    return {"ok": True, "username": deleted_username}
# ← ÄĂƒ THÊM: auth endpoints


@app.get("/api/users", dependencies=[Depends(require_admin)])
def get_users_alias(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    return get_users(current_user=current_user, db=db)


class CameraCreateRequest(BaseModel):
    id: str
    name: str
    location_name: Optional[str] = None
    district: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    source_type: Optional[str] = "file"
    source_uri: Optional[str] = None
    ip_address: Optional[str] = None
    enabled: Optional[bool] = True
    is_simulated: Optional[bool] = False
    sort_order: Optional[int] = 0


class CameraUpdateRequest(BaseModel):
    name: Optional[str] = None
    location_name: Optional[str] = None
    district: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    source_type: Optional[str] = None
    source_uri: Optional[str] = None
    ip_address: Optional[str] = None
    enabled: Optional[bool] = None
    is_simulated: Optional[bool] = None
    archived: Optional[bool] = None
    sort_order: Optional[int] = None


@app.get("/api/cameras", dependencies=[Depends(require_any_role)])
def get_cameras(
    include_archived: bool = Query(False, description="Bao gom ca camera da luu tru"),
    archived_only: bool = Query(False, description="Chi lay camera da luu tru"),
    db: Session = Depends(get_db)
) -> dict:
    """Tra ve danh sach camera tu DB kem stream_url va trang thai hoat dong."""
    query = db.query(Camera)
    if archived_only:
        query = query.filter(Camera.archived == 1)
    elif not include_archived:
        query = query.filter(Camera.archived == 0)

    cameras_db = query.order_by(Camera.sort_order.asc(), Camera.id.asc()).all()
    cameras_out = []
    for cam in cameras_db:
        src = get_camera_source(cam.id)
        if not src and cam.source_uri:
            resolved_uri = os.path.join(BASE_DIR, "..", cam.source_uri) if not os.path.isabs(cam.source_uri) else cam.source_uri
            if os.path.exists(resolved_uri) or os.path.exists(cam.source_uri):
                src = cam.source_uri

        has_video = bool(src)
        stream_url = f"/video_feed/{os.path.basename(src)}?cam_id={cam.id}" if src else None

        cameras_out.append({
            "id": cam.id,
            "name": cam.name,
            "location_name": cam.location_name or "",
            "location": cam.location_name or cam.district or "",
            "district": cam.district or "",
            "lat": cam.lat,
            "lng": cam.lng,
            "source_type": cam.source_type or "file",
            "source_uri": cam.source_uri or "",
            "ip_address": cam.ip_address or "",
            "ip": cam.ip_address or "",
            "enabled": bool(cam.enabled),
            "is_simulated": bool(cam.is_simulated),
            "archived": bool(cam.archived),
            "sort_order": cam.sort_order,
            "has_video": has_video,
            "stream_url": stream_url,
            "status": "active" if (cam.enabled and not cam.archived) else "inactive",
            "created_at": cam.created_at.strftime("%Y-%m-%dT%H:%M:%S+07:00") if cam.created_at else None,
            "updated_at": cam.updated_at.strftime("%Y-%m-%dT%H:%M:%S+07:00") if cam.updated_at else None,
        })
    return {"cameras": cameras_out}


@app.get("/api/cameras/{camera_id}/summary", dependencies=[Depends(require_any_role)])
def get_camera_summary(
    camera_id: str,
    date: str = Query("today"),
    db: Session = Depends(get_db)
) -> dict:
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy camera {camera_id}")

    now_vn = _vn_now()
    if date == "today":
        start_of_day = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        try:
            parsed = datetime.fromisoformat(date)
            start_of_day = parsed.replace(hour=0, minute=0, second=0, microsecond=0)
        except Exception:
            start_of_day = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)

    detections_today = db.query(func.count(Detection.id)).filter(
        Detection.camera_id == cam.id,
        Detection.deleted_at.is_(None),
        Detection.timestamp >= start_of_day
    ).scalar() or 0

    violations_today = db.query(func.count(Detection.id)).filter(
        Detection.camera_id == cam.id,
        Detection.deleted_at.is_(None),
        Detection.timestamp >= start_of_day,
        Detection.violation_type.isnot(None),
        Detection.violation_type != ""
    ).scalar() or 0

    pending_cases = db.query(func.count(Detection.id)).filter(
        Detection.camera_id == cam.id,
        Detection.deleted_at.is_(None),
        Detection.violation_type.isnot(None),
        Detection.violation_type != "",
        (Detection.review_status.in_(("pending", "Chờ xử lý", "")) | Detection.review_status.is_(None))
    ).scalar() or 0

    latest_det = db.query(Detection.timestamp).filter(
        Detection.camera_id == cam.id
    ).order_by(Detection.timestamp.desc()).first()
    last_seen_at = latest_det[0].isoformat() if (latest_det and latest_det[0]) else None

    is_online = bool(cam.enabled and not cam.archived)

    return {
        "online": is_online,
        "last_seen_at": last_seen_at,
        "detections_today": detections_today,
        "violations_today": violations_today,
        "pending_cases": pending_cases
    }


@app.post("/api/cameras", dependencies=[Depends(require_admin)])
def create_camera(
    payload: CameraCreateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> dict:
    cam_id = (payload.id or "").strip().upper()
    if not cam_id:
        raise HTTPException(status_code=400, detail="Mã camera không được để trống.")
    if db.query(Camera).filter(Camera.id == cam_id).first():
        raise HTTPException(status_code=409, detail=f"Camera {cam_id} đã tồn tại.")

    new_cam = Camera(
        id=cam_id,
        name=payload.name.strip(),
        location_name=payload.location_name,
        district=payload.district,
        lat=payload.lat,
        lng=payload.lng,
        source_type=payload.source_type or "file",
        source_uri=payload.source_uri,
        ip_address=payload.ip_address,
        enabled=1 if payload.enabled else 0,
        is_simulated=1 if payload.is_simulated else 0,
        archived=0,
        sort_order=payload.sort_order or 0,
    )
    db.add(new_cam)

    audit = AuditLog(
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role,
        action="camera_create",
        entity_type="camera",
        entity_id=cam_id,
        after_json=json.dumps({"name": new_cam.name, "location": new_cam.location_name, "district": new_cam.district}, ensure_ascii=False),
        note=f"Tạo camera {cam_id}"
    )
    db.add(audit)
    db.commit()
    db.refresh(new_cam)
    return {"ok": True, "camera": {"id": new_cam.id, "name": new_cam.name}}


@app.patch("/api/cameras/{camera_id}", dependencies=[Depends(require_admin)])
def update_camera(
    camera_id: str,
    payload: CameraUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> dict:
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Không tìm thấy camera.")

    before_state = {
        "name": cam.name, "location_name": cam.location_name, "district": cam.district,
        "lat": cam.lat, "lng": cam.lng, "source_type": cam.source_type, "source_uri": cam.source_uri,
        "ip_address": cam.ip_address, "enabled": cam.enabled, "archived": cam.archived
    }

    if payload.name is not None:
        cam.name = payload.name.strip()
    if payload.location_name is not None:
        cam.location_name = payload.location_name.strip()
    if payload.district is not None:
        cam.district = payload.district.strip()
    if payload.lat is not None:
        cam.lat = payload.lat
    if payload.lng is not None:
        cam.lng = payload.lng
    if payload.source_type is not None:
        cam.source_type = payload.source_type.strip()
    if payload.source_uri is not None:
        cam.source_uri = payload.source_uri.strip()
    if payload.ip_address is not None:
        cam.ip_address = payload.ip_address.strip()
    if payload.enabled is not None:
        cam.enabled = 1 if payload.enabled else 0
    if payload.is_simulated is not None:
        cam.is_simulated = 1 if payload.is_simulated else 0
    if payload.archived is not None:
        cam.archived = 1 if payload.archived else 0
    if payload.sort_order is not None:
        cam.sort_order = payload.sort_order
    cam.updated_at = _vn_now()

    after_state = {
        "name": cam.name, "location_name": cam.location_name, "district": cam.district,
        "lat": cam.lat, "lng": cam.lng, "source_type": cam.source_type, "source_uri": cam.source_uri,
        "ip_address": cam.ip_address, "enabled": cam.enabled, "archived": cam.archived
    }

    audit = AuditLog(
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role,
        action="camera_update",
        entity_type="camera",
        entity_id=cam.id,
        before_json=json.dumps(before_state, ensure_ascii=False),
        after_json=json.dumps(after_state, ensure_ascii=False),
        note=f"Cập nhật camera {cam.id}"
    )
    db.add(audit)
    db.commit()
    db.refresh(cam)
    return {"ok": True, "camera": {"id": cam.id, "name": cam.name, "enabled": bool(cam.enabled)}}


@app.delete("/api/cameras/{camera_id}", dependencies=[Depends(require_admin)])
def delete_camera(
    camera_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> dict:
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Không tìm thấy camera.")

    cam.archived = 1
    cam.enabled = 0
    cam.updated_at = _vn_now()

    audit = AuditLog(
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role,
        action="camera_archive",
        entity_type="camera",
        entity_id=cam.id,
        note=f"Lưu trữ camera {cam.id}"
    )
    db.add(audit)
    db.commit()
    return {"ok": True, "id": cam.id, "archived": True}


_METRICS_CACHE = {"data": None, "ts": 0.0}
_LAST_NET_IO = None

@app.get("/api/system/metrics", dependencies=[Depends(require_any_role)])
def get_system_metrics(db: Session = Depends(get_db)) -> dict:
    global _METRICS_CACHE, _LAST_NET_IO
    now = time.time()
    if _METRICS_CACHE["data"] and (now - _METRICS_CACHE["ts"]) < 3.0:
        return _METRICS_CACHE["data"]

    cpu_percent = round(psutil.cpu_percent(interval=None), 1)

    vm = psutil.virtual_memory()
    ram_percent = round(vm.percent, 1)
    ram_used_bytes = vm.used
    ram_total_bytes = vm.total

    du = shutil.disk_usage(BASE_DIR)
    disk_percent = round((du.used / du.total) * 100, 1) if du.total > 0 else 0.0
    disk_used_bytes = du.used
    disk_total_bytes = du.total

    gpu_percent = None
    try:
        import torch
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            mem_allocated = torch.cuda.memory_allocated(0)
            gpu_percent = round((mem_allocated / props.total_memory) * 100, 1)
    except Exception:
        gpu_percent = None

    bandwidth_mbps = None
    try:
        net = psutil.net_io_counters()
        if _LAST_NET_IO is not None:
            prev_time, prev_bytes = _LAST_NET_IO
            elapsed = now - prev_time
            if elapsed > 0:
                current_bytes = net.bytes_sent + net.bytes_recv
                bytes_diff = max(0, current_bytes - prev_bytes)
                bandwidth_mbps = round((bytes_diff * 8) / (elapsed * 1000 * 1000), 2)
        _LAST_NET_IO = (now, net.bytes_sent + net.bytes_recv)
    except Exception:
        bandwidth_mbps = None

    cameras_online = db.query(Camera).filter(Camera.enabled == 1, Camera.archived == 0).count()
    cameras_total = db.query(Camera).filter(Camera.archived == 0).count()

    inference_latency_ms = None
    api_latency_ms = None

    collected_at = _vn_now().strftime("%Y-%m-%dT%H:%M:%S+07:00")

    metrics = {
        "cpu_percent": cpu_percent,
        "gpu_percent": gpu_percent,
        "ram_percent": ram_percent,
        "ram_used_bytes": ram_used_bytes,
        "ram_total_bytes": ram_total_bytes,
        "disk_percent": disk_percent,
        "disk_used_bytes": disk_used_bytes,
        "disk_total_bytes": disk_total_bytes,
        "inference_latency_ms": inference_latency_ms,
        "api_latency_ms": api_latency_ms,
        "cameras_online": cameras_online,
        "cameras_total": cameras_total,
        "bandwidth_mbps": bandwidth_mbps,
        "collected_at": collected_at,
    }
    _METRICS_CACHE["data"] = metrics
    _METRICS_CACHE["ts"] = now
    return metrics


@app.get("/api/system/events", dependencies=[Depends(require_any_role)])
def get_system_events(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: Optional[str] = None,
    db: Session = Depends(get_db)
) -> dict:
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    total = q.count()
    logs = q.order_by(AuditLog.ts.desc()).offset(offset).limit(limit).all()

    events_out = []
    for l in logs:
        events_out.append({
            "id": l.id,
            "time": l.ts.strftime("%H:%M:%S") if l.ts else "",
            "timestamp": l.ts.strftime("%Y-%m-%dT%H:%M:%S+07:00") if l.ts else "",
            "username": l.username,
            "role": l.role or "",
            "action": l.action,
            "entity_type": l.entity_type or "",
            "entity_id": l.entity_id or "",
            "note": l.note or "",
            "action_display": l.note or f"{l.username} thực hiện {l.action}"
        })
    return {"events": events_out, "total": total}



def _coordination_crop_polygon(frame: np.ndarray, points: Any) -> Optional[np.ndarray]:
    if frame is None or getattr(frame, "size", 0) == 0 or not isinstance(points, list) or len(points) < 3:
        return None
    frame_h, frame_w = frame.shape[:2]
    base_w = max(1.0, float(os.getenv("VIOLATION_CONFIG_BASE_WIDTH", "960") or 960))
    base_h = max(1.0, float(os.getenv("VIOLATION_CONFIG_BASE_HEIGHT", "543") or 543))
    xs: List[int] = []
    ys: List[int] = []
    for point in points:
        if not isinstance(point, dict):
            continue
        try:
            xs.append(int(round(float(point.get("x", 0.0)) * frame_w / base_w)))
            ys.append(int(round(float(point.get("y", 0.0)) * frame_h / base_h)))
        except Exception:
            continue
    if len(xs) < 3 or len(ys) < 3:
        return None
    x1, x2 = max(0, min(xs)), min(frame_w, max(xs))
    y1, y2 = max(0, min(ys)), min(frame_h, max(ys))
    if x2 <= x1 or y2 <= y1:
        return None
    crop = frame[y1:y2, x1:x2]
    return crop if crop.size else None


def _coordination_signal_state_from_crop(crop: Optional[np.ndarray]) -> Dict[str, Any]:
    if crop is None or getattr(crop, "size", 0) == 0:
        return {"state": "unknown", "confidence": 0.0}
    height, width = crop.shape[:2]
    hsv_full = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)

    # The traffic pole also contains red countdown digits and a green right-turn arrow.
    # Read only the three main lamp slots, not the whole ROI color balance.
    slot_ranges = {
        "red": (0.28, 0.50),
        "yellow": (0.46, 0.68),
        "green": (0.62, 0.84),
    }
    slot_masks = {
        "red": lambda hsv: (
            ((hsv[:, :, 0] <= 10) | (hsv[:, :, 0] >= 170))
            & (hsv[:, :, 1] >= 80)
            & (hsv[:, :, 2] >= 115)
        ),
        "yellow": lambda hsv: (
            (hsv[:, :, 0] >= 18)
            & (hsv[:, :, 0] <= 42)
            & (hsv[:, :, 1] >= 70)
            & (hsv[:, :, 2] >= 120)
        ),
        "green": lambda hsv: (
            (hsv[:, :, 0] >= 45)
            & (hsv[:, :, 0] <= 95)
            & (hsv[:, :, 1] >= 65)
            & (hsv[:, :, 2] >= 105)
        ),
    }

    slot_counts: Dict[str, int] = {}
    slot_scores: Dict[str, float] = {}
    for state, (start_ratio, end_ratio) in slot_ranges.items():
        y1 = max(0, min(height - 1, int(round(height * start_ratio))))
        y2 = max(y1 + 1, min(height, int(round(height * end_ratio))))
        slot = hsv_full[y1:y2, :]
        mask = slot_masks[state](slot)
        count = int(np.count_nonzero(mask))
        slot_counts[state] = count
        slot_scores[state] = count / max(1, int(slot.shape[0] * slot.shape[1]))

    state, best_score = max(slot_scores.items(), key=lambda item: item[1])
    best_count = slot_counts[state]
    second_score = max((value for key, value in slot_scores.items() if key != state), default=0.0)
    min_pixels = max(6, int(width * height * 0.0009))
    if best_count < min_pixels or (second_score > 0 and best_score < second_score * 1.2):
        return {
            "state": "unknown",
            "confidence": round(best_score, 4),
            "counts": slot_counts,
            "method": "main-lamp-slots",
        }
    return {
        "state": state,
        "confidence": round(best_score, 4),
        "counts": slot_counts,
        "method": "main-lamp-slots",
    }


def _coordination_video_signal_state(camera_id: str) -> Dict[str, Any]:
    source = get_camera_source(camera_id)
    if not source or not os.path.exists(source):
        return {"camera_id": camera_id, "state": "unknown", "confidence": 0.0, "source": "no-video"}
    cap = cv2.VideoCapture(source)
    try:
        if not cap.isOpened():
            return {"camera_id": camera_id, "state": "unknown", "confidence": 0.0, "source": "open-failed"}
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if frame_count > 0 and fps > 0:
            frame_index = int((time.time() * fps) % frame_count)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ok, frame = cap.read()
        if not ok or frame is None:
            return {"camera_id": camera_id, "state": "unknown", "confidence": 0.0, "source": "no-frame"}

        signal_area = {
            "id": "coordination-main-traffic-light",
            "type": "coordination-main-signal-zone",
            "points": _COORDINATION_MAIN_SIGNAL_ROIS.get(camera_id, []),
        }
        result = _coordination_signal_state_from_crop(
            _coordination_crop_polygon(frame, signal_area.get("points") if isinstance(signal_area, dict) else None)
        )
        return {
            "camera_id": camera_id,
            "state": result.get("state", "unknown"),
            "confidence": result.get("confidence", 0.0),
            "counts": result.get("counts", {}),
            "source": "main-traffic-light-roi",
            "frame_index": int(cap.get(cv2.CAP_PROP_POS_FRAMES) or 0),
            "roi": signal_area.get("points", []),
        }
    finally:
        cap.release()


@app.get("/api/coordination/state", dependencies=[Depends(require_any_role)])
def api_coordination_state(
    selected_date: str = Query(default=""),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    camera_ids = ["CAM_01", "CAM_02", "CAM_03", "CAM_04", "CAM_05", "CAM_06"]
    try:
        start_time = datetime.fromisoformat(selected_date) if selected_date else datetime.now() - timedelta(hours=24)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="selected_date must be YYYY-MM-DD") from exc
    end_time = start_time + timedelta(days=1) if selected_date else datetime.now()
    traffic_rows = (
        db.query(Detection.camera_id, func.count(Detection.id).label("count"))
        .filter(Detection.timestamp >= start_time)
        .filter(Detection.timestamp < end_time)
        .group_by(Detection.camera_id)
        .all()
    )
    violation_rows = (
        db.query(Detection.camera_id, func.count(Detection.id).label("count"))
        .filter(Detection.timestamp >= start_time)
        .filter(Detection.timestamp < end_time)
        .filter(Detection.violation_type.isnot(None))
        .filter(Detection.violation_type != "")
        .group_by(Detection.camera_id)
        .all()
    )
    traffic_by_camera = {str(camera_id): int(count) for camera_id, count in traffic_rows}
    violation_by_camera = {str(camera_id): int(count) for camera_id, count in violation_rows}
    max_traffic = max([traffic_by_camera.get(camera_id, 0) for camera_id in camera_ids] + [1])
    max_violation = max([violation_by_camera.get(camera_id, 0) for camera_id in camera_ids] + [1])

    cameras = []
    for camera_id in camera_ids:
        traffic = traffic_by_camera.get(camera_id, 0)
        violations = violation_by_camera.get(camera_id, 0)
        density = int(round((traffic / max_traffic) * 100)) if max_traffic else 0
        risk = int(round((violations / max_violation) * 100)) if max_violation else 0
        suggested_green = int(max(18, min(65, 22 + density * 0.28 + risk * 0.16)))
        signal = _coordination_video_signal_state(camera_id)
        cameras.append(
            {
                "camera_id": camera_id,
                "traffic_24h": traffic,
                "violations_24h": violations,
                "density": density,
                "risk": risk,
                "suggested_green": suggested_green,
                "signal": signal,
                "reason": (
                    f"Luu luong {density}%, vi pham {risk}%, "
                    f"den video={signal.get('state', 'unknown')}"
                ),
            }
        )

    return {
        "updated_at": _vn_now().isoformat(),
        "source": "analytics+detection-db+video-roi",
        "cameras": cameras,
    }


@app.get("/api/violation-config/{camera_id}", dependencies=[Depends(require_any_role)])
def api_get_violation_config(camera_id: str) -> Dict[str, Any]:
    normalized_camera_id = str(camera_id or "CAM_01").strip() or "CAM_01"
    return {
        "camera_id": normalized_camera_id,
        **get_violation_config(normalized_camera_id),
    }


@app.put("/api/violation-config/{camera_id}", dependencies=[Depends(require_admin)])
def api_save_violation_config(
    camera_id: str,
    payload: CameraViolationConfigPayload,
) -> Dict[str, Any]:
    normalized_camera_id = str(camera_id or "CAM_01").strip() or "CAM_01"
    saved = save_violation_config(
        normalized_camera_id,
        payload.model_dump(mode="python"),
    )
    return {
        "camera_id": normalized_camera_id,
        **saved,
    }


@app.post("/api/upload", response_model=UploadResponse, dependencies=[Depends(require_operator)])
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> UploadResponse:
    """
    Upload an image or video file and run ALPR.

    - Saves to `/backend/uploads`
    - For images: returns per-frame plate results
    - For videos: samples frames and returns summary
    """
    original_filename = os.path.basename(file.filename or "")
    if not original_filename:
        raise HTTPException(status_code=400, detail="File must have a name.")

    extension = os.path.splitext(original_filename)[1].lower()
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".avi", ".mov", ".mkv", ".webm"}
    if extension not in allowed_extensions:
        raise HTTPException(status_code=415, detail="Unsupported image or video type")
    is_video = extension in {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    filename = f"{secrets.token_hex(16)}{extension}"
    max_upload_bytes = max(1, _env_int("MAX_UPLOAD_MB", 250)) * 1024 * 1024
    runtime_quota_bytes = int(max(1.0, _env_float("RUNTIME_MAX_GB", 50.0)) * 1024 * 1024 * 1024)
    runtime_usage_before = directory_usage_bytes(RUNTIME_DATA_DIR)
    if runtime_usage_before >= runtime_quota_bytes:
        if _RUNTIME_CLEANUP_ENABLED:
            _run_runtime_cleanup_once()
            runtime_usage_before = directory_usage_bytes(RUNTIME_DATA_DIR)
        if runtime_usage_before >= runtime_quota_bytes:
            raise HTTPException(status_code=507, detail="Runtime storage quota has been reached")

    try:
        save_path = os.path.join(UPLOADS_DIR, filename)
        total_bytes = 0
        with open(save_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > max_upload_bytes:
                    raise HTTPException(status_code=413, detail="Upload exceeds configured size limit")
                if runtime_usage_before + total_bytes > runtime_quota_bytes:
                    raise HTTPException(status_code=507, detail="Upload would exceed runtime storage quota")
                f.write(chunk)
        print(f"[Upload] Receiving file: {filename}, Size: {total_bytes} bytes, Type: {extension}")
    except HTTPException:
        if 'save_path' in locals() and os.path.exists(save_path):
            os.remove(save_path)
        raise
    except Exception as exc:
        print(f"[Error] Failed to save upload: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}")
    
    try:
        if is_video:
            print(f"[Upload] Recognized as video. Skipping heavy processing.")
            alpr_result = {
                "status": "ready_for_streaming",
                "filename": filename,
                "original_filename": original_filename,
            }
        else:
            print(f"[Upload] Recognized as image. Running ALPR.")
            alpr_result = process_image_file(save_path, db=db)
    except Exception as exc:
        print(f"[Error] Processing failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Processing error: {exc}")

    print(f"[Upload] Success. Returning response.")
    return UploadResponse(
        message="Uploaded successfully. Ready for playback." if is_video else "Processed successfully.",
        is_video=is_video,
        results=alpr_result,
    )


_history_handlers = register_history_routes(
    app,
    detection_model=Detection,
    get_db_dependency=get_db,
    require_any_role_dependency=require_any_role,
    history_response_model=HistoryResponse,
    history_updates_response_model=HistoryUpdatesResponse,
    smart_search_response_model=SmartSearchResponse,
    filter_current_runtime_session=_filter_current_runtime_session,
    runtime_session_windows=_runtime_session_windows,
    filter_complete_evidence_paths=_filter_complete_evidence_paths,
    detection_has_complete_evidence=_detection_has_complete_evidence,
    serialize_detection=_serialize_detection,
    normalize_query_text=_normalize_query_text,
    now_provider=_vn_now,
)
get_history = _history_handlers.get_history
get_detections_alias = _history_handlers.get_detections_alias
get_history_updates = _history_handlers.get_history_updates
smart_search = _history_handlers.smart_search


@app.get(
    "/api/history/presentation",
    response_model=HistoryResponse,
    dependencies=[Depends(require_any_role)],
)
def get_presentation_history(
    limit: int = 50,
    db: Session = Depends(get_db),
) -> HistoryResponse:
    """Return curated night evidence to interleave into the real daytime log."""
    night_rows = (
        _filter_complete_evidence_paths(
            db.query(Detection).filter(
                Detection.id.in_(CURATED_NIGHT_EVIDENCE_IDS),
                Detection.plate_number != "",
                Detection.plate_number.isnot(None),
                Detection.deleted_at.is_(None),
            )
        )
        .order_by(Detection.timestamp.desc(), Detection.id.desc())
        .limit(max(limit * 2, 100))
        .all()
    )
    night_rows = [row for row in night_rows if _detection_has_complete_evidence(row)][:limit]
    return HistoryResponse(items=[_serialize_detection(row) for row in night_rows])



_notification_handlers = register_notification_routes(
    app,
    notification_history_model=NotificationHistory,
    get_db_dependency=get_db,
    require_any_role_dependency=require_any_role,
    require_operator_dependency=require_operator,
    notification_history_create_model=NotificationHistoryCreate,
    notification_send_request_model=NotificationSendRequest,
    notification_history_out_model=NotificationHistoryOut,
    notification_history_response_model=NotificationHistoryResponse,
    serialize_notification_history=_serialize_notification_history,
    parse_notification_sent_at=_parse_notification_sent_at,
    deliver_notification=deliver_notification,
    notification_delivery_error=NotificationDeliveryError,
)
get_notification_history = _notification_handlers.get_notification_history
create_notification_history = _notification_handlers.create_notification_history
send_notification = _notification_handlers.send_notification

_violation_handlers = register_violation_routes(
    app,
    detection_model=Detection,
    get_db_dependency=get_db,
    require_operator_dependency=require_operator,
    require_any_role_dependency=require_any_role,
    require_chatbot_or_user_dependency=require_chatbot_or_user,
    require_signed_chatbot_notice_dependency=require_signed_chatbot_notice,
    violation_notice_response_model=ViolationNoticeResponse,
    normalize_review_status=_normalize_review_status,
    detection_has_complete_evidence=_detection_has_complete_evidence,
    serialize_detection=_serialize_detection,
    build_violation_notice=_build_violation_notice,
    effective_review_status=_effective_review_status,
    now_provider=_vn_now,
    review_status_labels=_REVIEW_STATUS_LABELS,
)
update_violation_review_status = _violation_handlers.update_violation_review_status
get_violation_notice_payload = _violation_handlers.get_violation_notice_payload
get_violation_notice_html = _violation_handlers.get_violation_notice_html
get_signed_telegram_notice_html = _violation_handlers.get_signed_telegram_notice_html
get_telegram_notice_payload = _violation_handlers.get_telegram_notice_payload
get_violation_review_dashboard = _violation_handlers.get_violation_review_dashboard
@app.get("/api/telegram/daily-violations", response_model=TelegramDailyViolationsResponse, dependencies=[Depends(require_chatbot_or_user)])
def get_telegram_daily_violations(
    limit: int = 20,
    include_images: bool = Query(default=False),
    mode: str = Query(default="violations"),
    scope: str = Query(default="today"),
    db: Session = Depends(get_db),
) -> TelegramDailyViolationsResponse:
    """Return a compact daily list for Telegram bot commands.

    mode=violations keeps the old behavior.
    mode=all/log/plates returns OCR-valid plate rows.
    scope=history returns retained records instead of limiting the query to today.
    """
    # History menus need a wider window so their day/night split is meaningful.
    # Today's compact Telegram views remain bounded by their callers.
    limit = max(1, min(limit, 200))
    now = _vn_now()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    normalized_mode = str(mode or "violations").strip().lower()
    normalized_scope = str(scope or "today").strip().lower()
    is_history_scope = normalized_scope in {"history", "all", "retained", "previous"}

    query = db.query(Detection).filter(Detection.id.in_(CURATED_EVIDENCE_IDS))
    query = query.filter((Detection.review_status.is_(None)) | (Detection.review_status != "rejected"))
    if not is_history_scope:
        query = query.filter(Detection.timestamp >= start)
    if normalized_mode in {"all", "log", "plates", "detections"}:
        invalid_plates = (
            "UNKNOWN",
            "KHONG RO BIEN SO",
            "KHONGROBIENSO",
            "CHUA XAC NHAN OCR",
            "DANG DOC",
            "ĐANG ĐỌC",
        )
        query = (
            query
            .filter(Detection.plate_number.isnot(None))
            .filter(Detection.plate_number != "")
            .filter(func.length(Detection.plate_number) >= 6)
            .filter(func.upper(Detection.plate_number).notin_(invalid_plates))
            .filter(Detection.ocr_score >= 0.85)
        )
        title = "Biển số trong lịch sử đã lưu" if is_history_scope else "Bản ghi biển số trong log hôm nay"
        empty_text = (
            "Không có biển số đủ rõ trong lịch sử đã lưu."
            if is_history_scope
            else "Không có bản ghi biển số đủ rõ trong log hôm nay."
        )
    else:
        query = (
            query
            .filter(Detection.violation_type.isnot(None))
            .filter(Detection.violation_type != "")
        )
        title = "Vi phạm hôm nay"
        empty_text = "Không có vi phạm nào được ghi nhận trong hôm nay."

    query = _filter_complete_evidence_paths(query)
    rows = (
        query
        .order_by(Detection.timestamp.desc(), Detection.id.desc())
        .limit(500 if is_history_scope else min(200, limit * 4))
        .all()
    )
    rows = [row for row in rows if _detection_has_complete_evidence(row)]
    if is_history_scope:
        # Telegram's history menu should demonstrate retained day/night and
        # supplementary-camera evidence, not only the most recent live burst.
        recent_rows = rows[:limit]
        selected_ids = {int(row.id) for row in recent_rows}
        representative_rows = [
            row
            for row in rows
            if row.timestamp
            and (row.timestamp.hour >= 18 or row.timestamp.hour < 6 or str(row.camera_id or "") in {"CAM_07", "CAM_08", "CAM_09"})
            and int(row.id) not in selected_ids
        ][:10]
        replace_count = min(len(representative_rows), len(recent_rows))
        rows = recent_rows[: limit - replace_count] + representative_rows
    else:
        rows = rows[:limit]

    items: List[TelegramViolationItem] = []
    for row in rows:
        vehicle_type = _canonical_vehicle_type(row.vehicle_type)
        owner_info = _demo_owner_for_plate(row.plate_number)
        items.append(
            TelegramViolationItem(
                id=row.id,
                license_plate=row.plate_number or "Chưa xác nhận OCR",
                vehicle_type=_VEHICLE_LABELS.get(vehicle_type, vehicle_type),
                violation_type=row.violation_type or "Chưa phân loại",
                camera_id=row.camera_id or "",
                timestamp=row.timestamp.strftime("%d/%m/%Y %H:%M:%S") if row.timestamp else "",
                fine_amount=_fine_amount_for_violation(row.violation_type or "", vehicle_type),
                legal_basis=_TELEGRAM_FINE_BASIS,
                owner_name=owner_info.get("owner_name", ""),
                owner_phone=owner_info.get("owner_phone", ""),
                owner_email=owner_info.get("owner_email", ""),
                owner_address=owner_info.get("owner_address", ""),
                vehicle_image_b64=_get_image_b64(row.image_path) if include_images else "",
                plate_image_b64=_get_image_b64(row.crop_path) if include_images else "",
                ocr_score=float(getattr(row, "ocr_score", 0.0) or 0.0),
                **_telegram_ai_explanation(row),
                case_code=_case_code_for_detection(row),
                review_status=_effective_review_status(row),
                track_id=row.track_id,
                owner_data_simulated=True,
                lighting_condition=_telegram_lighting_condition(row.image_path),
                evidence_curated=True,
            )
        )

    if items:
        lines = [
            f"{title} ({now.strftime('%d/%m/%Y')}): {len(items)} bản ghi gần nhất",
            *[
                f"{idx + 1}. {item.license_plate} | {item.vehicle_type} | {item.violation_type} | {item.fine_amount} | {item.camera_id}"
                for idx, item in enumerate(items[:10])
            ],
        ]
    else:
        lines = [f"{empty_text} Ngày {now.strftime('%d/%m/%Y')}."]
    return TelegramDailyViolationsResponse(
        date=now.strftime("%d/%m/%Y"),
        count=len(items),
        message="\n".join(lines),
        items=items,
    )


@app.get("/api/telegram/plate/{plate_number}", response_model=TelegramDailyViolationsResponse, dependencies=[Depends(require_chatbot_or_user)])
def get_telegram_plate_lookup(
    plate_number: str,
    include_images: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> TelegramDailyViolationsResponse:
    raw_str = str(plate_number or "").strip()
    case_match = re.search(r"\b(?:BB-\d{8}-[A-Z0-9]+-(\d+)|HS-(\d+)|#(\d+))\b", raw_str.upper())
    explicit_id = int(case_match.group(1) or case_match.group(2) or case_match.group(3)) if case_match else None
    if not explicit_id and raw_str.isdigit():
        explicit_id = int(raw_str)

    if explicit_id:
        target_row = db.query(Detection).filter(Detection.id == explicit_id).first()
        rows = [target_row] if target_row else []
        token = raw_str
    else:
        token = re.sub(r"[^A-Z0-9]", "", raw_str.upper())
        query = db.query(Detection).filter(Detection.id.in_(CURATED_EVIDENCE_IDS))
        if token:
            compact_plate = func.upper(func.replace(func.replace(Detection.plate_number, "-", ""), ".", ""))
            query = query.filter(compact_plate == token)
        rows = (
            _filter_complete_evidence_paths(query)
            .filter(Detection.ocr_score >= 0.85)
            .order_by(Detection.timestamp.desc(), Detection.id.desc())
            .limit(40)
            .all()
        )
        rows = [row for row in rows if _detection_has_complete_evidence(row)][:10]
        # Fallback if no curated evidence found for this plate: query from all detections
        if not rows and token:
            fallback_query = db.query(Detection)
            compact_plate = func.upper(func.replace(func.replace(Detection.plate_number, "-", ""), ".", ""))
            rows = (
                fallback_query.filter(compact_plate == token)
                .order_by(Detection.timestamp.desc(), Detection.id.desc())
                .limit(10)
                .all()
            )
    items: List[TelegramViolationItem] = []
    for row in rows:
        vehicle_type = _canonical_vehicle_type(row.vehicle_type)
        owner_info = _demo_owner_for_plate(row.plate_number)
        items.append(
            TelegramViolationItem(
                id=row.id,
                license_plate=row.plate_number or "Chưa xác nhận OCR",
                vehicle_type=_VEHICLE_LABELS.get(vehicle_type, vehicle_type),
                violation_type=row.violation_type or "Chưa phân loại",
                camera_id=row.camera_id or "",
                timestamp=row.timestamp.strftime("%d/%m/%Y %H:%M:%S") if row.timestamp else "",
                fine_amount=_fine_amount_for_violation(row.violation_type or "", vehicle_type),
                legal_basis=_TELEGRAM_FINE_BASIS,
                owner_name=owner_info.get("owner_name", ""),
                owner_phone=owner_info.get("owner_phone", ""),
                owner_email=owner_info.get("owner_email", ""),
                owner_address=owner_info.get("owner_address", ""),
                vehicle_image_b64=_get_image_b64(row.image_path) if include_images else "",
                plate_image_b64=_get_image_b64(row.crop_path) if include_images else "",
                ocr_score=float(getattr(row, "ocr_score", 0.0) or 0.0),
                **_telegram_ai_explanation(row),
                case_code=_case_code_for_detection(row),
                review_status=_effective_review_status(row),
                track_id=row.track_id,
                owner_data_simulated=True,
                lighting_condition=_telegram_lighting_condition(row.image_path),
                evidence_curated=True,
            )
        )
    if items:
        lines = [
            f"Tra cứu biển {token}: {len(items)} bản ghi gần nhất",
            *[
                f"{idx + 1}. {item.timestamp} | {item.violation_type} | {item.fine_amount} | {item.camera_id}"
                for idx, item in enumerate(items[:10])
            ],
        ]
    else:
        lines = [f"Không tìm thấy bản ghi cho biển {token or plate_number}."]
    return TelegramDailyViolationsResponse(
        date=_vn_now().strftime("%d/%m/%Y"),
        count=len(items),
        message="\n".join(lines),
        items=items,
    )


class PlateUpdate(BaseModel):
    plate_number: str
    is_simulated: bool = True
    is_temporary: bool = False

@app.patch("/api/detections/{det_id}/plate", dependencies=[Depends(require_operator)])
def update_plate(det_id: int, body: PlateUpdate, db: Session = Depends(get_db)):
    det = db.query(Detection).filter(Detection.id == det_id).first()
    if not det:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    fixed_plate, _ = normalize_plate_number(body.plate_number or "", verbose=False)
    det.plate_number = fixed_plate or (body.plate_number or "").strip().upper()
    det.is_simulated = body.is_simulated
    det.is_temporary = body.is_temporary
    det.last_seen_at = _vn_now()
    db.commit()
    db.refresh(det)
    return {
        "id": det.id,
        "plate_number": det.plate_number,
        "is_simulated": det.is_simulated,
        "is_temporary": det.is_temporary,
    }
    # ← ÄĂƒ THÊM: PATCH endpoint


@app.websocket("/api/stream")
async def stream_endpoint(websocket: WebSocket) -> None:
    token = websocket.cookies.get("auth_token")
    db = SessionLocal()
    try:
        user = authenticate_token(token, db) if token else None
        if user is None:
            await websocket.close(code=4401, reason="Authentication required")
            return
        if user.role not in {"admin", "operator"}:
            await websocket.close(code=4403, reason="Operator or admin role required")
            return
    finally:
        db.close()
    await websocket_stream_handler(websocket)


@app.post("/api/chat", response_model=ChatResponse, dependencies=[Depends(require_any_role)])
async def chat_with_assistant(
    payload: ChatRequest,
    db: Session = Depends(get_db),
) -> ChatResponse:
    """
    Trợ lĂ½ AI thĂ´ng minh được há»— trợ bởi Ollama (Llama 3.1) vĂ  dữ liệu giao thĂ´ng real-time.
    
    Context Injection:
    - Lịch sá»­ phĂ¡t hiện xe (detection history)
    - Thống kĂª giao thĂ´ng hiện tại (vehicle counts, violation trends)
    - PhĂ¢n tĂ­ch thĂ´ng minh dá»±a trĂªn dữ liệu thá»±c tế
    """
    user_message = payload.message.strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Message must not be empty.")

    casual_answer = get_casual_response(user_message)
    if casual_answer:
        return ChatResponse(answer=casual_answer, context_items=0)

    project_scope = is_project_question(user_message)
    context_hint = (payload.context_hint or "").strip()
    analysis_message = user_message
    if project_scope and context_hint:
        analysis_message = f"{user_message}\nNgữ cảnh vi phạm hiện tại: {context_hint}"

    case_code_match = re.search(
        r"(?:BB-\d{8}-[A-Z0-9]+-(\d+)|HS[ -]?(\d+)|#(\d+)|ho so\s*(\d+)|ban ghi\s*(\d+))",
        analysis_message,
        re.IGNORECASE,
    )
    explicit_id = None
    if case_code_match:
        matched_groups = [g for g in case_code_match.groups() if g]
        if matched_groups and matched_groups[0].isdigit():
            explicit_id = int(matched_groups[0])

    # Tìm kiếm biển số hoặc mã hồ sơ trong câu hỏi
    plate_like: Optional[str] = None
    if not explicit_id:
        tokens = analysis_message.replace(",", " ").split()
        for tok in tokens:
            clean_tok = re.sub(r"[^A-Z0-9]", "", tok.upper())
            if len(clean_tok) >= 6 and any(ch.isdigit() for ch in clean_tok) and any(ch.isalpha() for ch in clean_tok):
                plate_like = clean_tok
                break

    hinted_detection: Optional[Detection] = None
    if explicit_id:
        hinted_detection = db.query(Detection).filter(Detection.id == explicit_id).first()
        if hinted_detection and hinted_detection.plate_number:
            plate_like = re.sub(r"[^A-Z0-9]", "", hinted_detection.plate_number.upper())
    elif plate_like:
        hinted_detection = (
            db.query(Detection)
            .filter(func.upper(func.replace(func.replace(Detection.plate_number, "-", ""), ".", "")).contains(plate_like))
            .order_by(Detection.timestamp.desc())
            .first()
        )

    # Nếu tìm thấy bản ghi hồ sơ cụ thể, tạo context hồ sơ chi tiết (gồm chủ xe, vi phạm, camera, thời gian)
    case_context_str = ""
    if hinted_detection:
        owner_info = _demo_owner_for_plate(hinted_detection.plate_number)
        c_code = _case_code_for_detection(hinted_detection)
        c_time = hinted_detection.timestamp.strftime("%d/%m/%Y %H:%M:%S") if hinted_detection.timestamp else "Chưa rõ"
        c_status = _REVIEW_STATUS_LABELS.get(hinted_detection.review_status, hinted_detection.review_status or "Chờ duyệt")
        c_vehicle = _VEHICLE_LABELS.get(hinted_detection.vehicle_type, hinted_detection.vehicle_type or "Phương tiện")
        c_violation = hinted_detection.violation_type or "Không ghi nhận vi phạm"
        c_fine = _fine_amount_for_violation(hinted_detection.violation_type or "", hinted_detection.vehicle_type or "")
        case_context_str = (
            f"Mã hồ sơ: {c_code} (ID: #{hinted_detection.id})\n"
            f"Biển số: {hinted_detection.plate_number}\n"
            f"Loại xe: {c_vehicle}\n"
            f"Hành vi vi phạm: {c_violation}\n"
            f"Mức phạt dự kiến: {c_fine}\n"
            f"Thời gian ghi nhận: {c_time}\n"
            f"Camera giám sát: {hinted_detection.camera_id or 'CAM_01'}\n"
            f"Trạng thái duyệt: {c_status}\n"
            f"Chủ phương tiện (hồ sơ đăng ký): {owner_info.get('owner_name', 'Chưa có thông tin')}\n"
            f"Số điện thoại: {owner_info.get('owner_phone', 'Chưa có')}\n"
            f"Địa chỉ đăng ký: {owner_info.get('owner_address', 'Chưa có')}\n"
        )
        if not context_hint:
            context_hint = case_context_str
        else:
            context_hint = f"{case_context_str}\n{context_hint}"

    law_result = analyze_traffic_law(
        analysis_message,
        vehicle_type_hint=(hinted_detection.vehicle_type if hinted_detection else ""),
        violation_hint=(hinted_detection.violation_type if hinted_detection else ""),
    )
    project_scope = project_scope or law_result.mode != "none" or hinted_detection is not None
    if law_result.mode == "clarify":
        return ChatResponse(
            answer=law_result.answer,
            context_items=1 if hinted_detection else 0,
        )
    if should_answer_directly(user_message, law_result) and not explicit_id:
        return ChatResponse(
            answer=law_result.answer,
            context_items=1 if hinted_detection else 0,
        )

    # Lấy dữ liệu detection history
    query = db.query(Detection)

    if not project_scope:
        records = []
    elif explicit_id and hinted_detection:
        records = [hinted_detection]
    elif plate_like:
        records = (
            query.filter(func.upper(func.replace(func.replace(Detection.plate_number, "-", ""), ".", "")).contains(plate_like))
            .order_by(Detection.timestamp.desc())
            .limit(10)
            .all()
        )
    else:
        # Include retained day/night and supplementary-video evidence in the
        # assistant summary, while the prompt builder keeps the text compact.
        recent_records = query.order_by(Detection.timestamp.desc()).limit(200).all()
        curated_records = query.filter(Detection.id.in_(CURATED_EVIDENCE_IDS)).all()
        records_by_id = {int(record.id): record for record in recent_records}
        for record in curated_records:
            records_by_id.setdefault(int(record.id), record)
        records = list(records_by_id.values())

    project_data_answer = get_project_data_response(user_message, records) if project_scope else None
    if project_data_answer:
        return ChatResponse(answer=project_data_answer, context_items=len(records))

    # Tạo context chi tiết vá»›i thống kĂª
    context_lines: List[str] = []
    
    # Thống kĂª tổng quan
    total_detections = len(records)
    vehicle_counts = {}
    for r in records:
        vehicle_counts[r.vehicle_type] = vehicle_counts.get(r.vehicle_type, 0) + 1
    
    stats_summary = f"Tổng số phát hiện: {total_detections}\n"
    stats_summary += "Phân loại phương tiện:\n"
    for vtype, count in vehicle_counts.items():
        stats_summary += f"  - {vtype}: {count} xe ({count/total_detections*100:.1f}%)\n"
    
    # Chi tiết detection history (giá»›i hạn 50 records gần nhất để trĂ¡nh context quĂ¡ dĂ i)
    for r in records[:5]:
        context_lines.append(
            f"{r.timestamp.isoformat()} | {r.plate_number} | "
            f"{r.vehicle_type} | confidence={r.confidence:.2f}"
        )
    
    context_text = stats_summary + "\n" + "\n".join(context_lines) if context_lines else "Chưa có dữ liệu phát hiện."

    system_prompt = (
        "Bạn là trợ lý AI quản lý giao thông thông minh cho Hà Nội. "
        "Bạn phân tích dữ liệu giao thông thời gian thực và trả lời bằng tiếng Việt ngắn gọn, rõ ràng.\n\n"
        "DỮ LIỆU GIAO THÔNG HIỆN TẠI:\n"
        f"{context_text}\n\n"
        "HƯỚNG DẪN:\n"
        "- Ưu tiên dữ liệu thực tế trong hệ thống.\n"
        "- Nếu thiếu thông tin thì nói rõ là chưa đủ dữ liệu, không tự đoán.\n"
        "- Khi có số liệu thống kê, hãy dùng số liệu để hỗ trợ kết luận.\n"
        "- Không khẳng định đã thay đổi camera, OCR, model hoặc database nếu người dùng chỉ hỏi thông tin."
    )

    # Keep the runtime prompt compact and ASCII-clean so local models answer quickly.
    vehicle_summary = ", ".join(
        f"{vehicle_type}: {count}"
        for vehicle_type, count in vehicle_counts.items()
    ) or "khong co"
    recent_summary = "; ".join(context_lines) if context_lines else "chua co lich su"
    compact_context = (
        f"tong_phat_hien={total_detections}; "
        f"phan_loai={vehicle_summary}; "
        f"gan_day={recent_summary}"
    )
    system_prompt = (
        "Ban la tro ly AI chuyen ve giao thong duong bo Viet Nam. "
        "Chi tra loi cac cau hoi ve loi vi pham, muc phat va tu van xu ly giao thong. "
        "Khong tu choi cac cau hoi hop phap ve vi pham giao thong nhu vuot den do. "
        "Tra loi bang tieng Viet, ngan gon, ro rang. "
        "Neu co du lieu luat trong prompt thi phai uu tien dung du lieu do, khong duoc tu bia. "
        "Neu thieu du lieu thi noi ro la chua du thong tin. "
        f"Du lieu hien tai: {compact_context}"
    )
    project_context = (
        build_project_context(records)
        if project_scope
        else "No project records were requested for this general conversation."
    )
    system_prompt = build_system_prompt(
        project_context,
        law_result,
        scope="project" if project_scope else "general",
        context_hint=context_hint if project_scope else "",
    )
    scoped_history = select_history_for_scope(
        payload.history,
        scope="project" if project_scope else "general",
    )
    ollama_host = resolve_ollama_host()
    # Ưu tiên model từ request payload, nếu không có mới dùng env hoặc mặc định là llama3.1.
    ollama_model = payload.model if payload.model else os.getenv("OLLAMA_MODEL", "llama3.1:latest")

    try:
        timeout = httpx.Timeout(connect=6.0, read=120.0, write=30.0, pool=30.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{ollama_host}/api/chat",
                json={
                    "model": ollama_model,
                    "messages": build_ollama_messages(system_prompt, scoped_history, user_message),
                    "stream": False,
                    "keep_alive": "30m",
                    "options": {
                        "temperature": 0.45,
                        "top_p": 0.9,
                        "repeat_penalty": 1.1,
                        "num_predict": 800,
                    },
                },
            )
    except Exception as exc:
        print(f"[CHAT WARNING] Ollama unavailable: {type(exc).__name__}: {exc}")
        if law_result.mode == "grounded" and law_result.answer:
            return ChatResponse(
                answer=law_result.answer,
                context_items=1 if hinted_detection else 0,
            )
        return ChatResponse(
            answer=get_model_unavailable_response(
                project_scope=project_scope,
                context_items=len(records),
            ),
            context_items=len(records),
        )

    if resp.status_code != 200:
        print(f"[CHAT WARNING] Ollama returned HTTP {resp.status_code}: {resp.text[:300]}")
        if law_result.mode == "grounded" and law_result.answer:
            return ChatResponse(
                answer=law_result.answer,
                context_items=1 if hinted_detection else 0,
            )
        return ChatResponse(
            answer=get_model_unavailable_response(
                project_scope=project_scope,
                context_items=len(records),
            ),
            context_items=len(records),
        )

    data = resp.json()
    answer = ""
    # Non-streaming chat API returns a single message object
    if isinstance(data, dict):
        msg = data.get("message") or {}
        answer = msg.get("content", "") or ""
    if not answer:
        answer = law_result.answer or get_model_unavailable_response(
            project_scope=project_scope,
            context_items=len(records),
        )

    return ChatResponse(answer=answer, context_items=len(records))



def _generate_mjpeg(
    video_path: str,
    camera_id: str = "",
    detect_vehicle: bool = True,
    detect_plate: bool = True,
    simulation: bool = False,
    simulate_plate: bool = False,
    show_box: bool = False,
):
    """Generator for MJPEG stream with conditional AI processing."""
    source_kind = "RTSP" if str(video_path).lower().startswith(("rtsp://", "rtsps://")) else "FILE"
    is_rtsp_source = source_kind == "RTSP"
    AI_PROCESS_MAX_WIDTH = _env_int("STREAM_AI_MAX_WIDTH", 960 if is_rtsp_source else 960)
    STREAM_OUTPUT_MAX_WIDTH = _env_int("STREAM_OUTPUT_MAX_WIDTH", 960)
    STREAM_TARGET_FPS = max(1.0, _env_float("STREAM_TARGET_FPS", 12.0 if is_rtsp_source else 10.0))
    STREAM_AI_FPS = max(0.25, _env_float("STREAM_AI_FPS", 1.0))
    STREAM_JPEG_QUALITY = max(45, min(90, _env_int("STREAM_JPEG_QUALITY", 62 if is_rtsp_source else 68)))
    if is_rtsp_source:
        os.environ.setdefault(
            "OPENCV_FFMPEG_CAPTURE_OPTIONS",
            "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;500000",
        )
    print(f"[Stream] Starting MJPEG stream for: {video_path}")
    print(f"[DEBUG-LOG] source_kind={source_kind} detect_vehicle={detect_vehicle} detect_plate={detect_plate} simulation={simulation} simulate_plate={simulate_plate} show_box={show_box}")
    print(
        f"[DEBUG-LOG] AI_PROCESS_MAX_WIDTH={AI_PROCESS_MAX_WIDTH} "
        f"STREAM_OUTPUT_MAX_WIDTH={STREAM_OUTPUT_MAX_WIDTH} "
        f"STREAM_TARGET_FPS={STREAM_TARGET_FPS:.1f} STREAM_AI_FPS={STREAM_AI_FPS:.1f} "
        f"STREAM_JPEG_QUALITY={STREAM_JPEG_QUALITY} STREAM_AI_WORKERS={_STREAM_AI_WORKERS}"
    )
    cap = cv2.VideoCapture(video_path)
    # Tối ưu buffer để giảm giật
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    
    # Doc FPS goc cua video (truoc khi kiem tra cap.isOpened)
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 120:
        fps = 25.0 if is_rtsp_source else 15.0

    # Voi nguon file: dong bo toc do stream = FPS that cua video
    # (tru khi nguoi dung set env STREAM_TARGET_FPS de override)
    if not is_rtsp_source and not os.getenv("STREAM_TARGET_FPS"):
        STREAM_TARGET_FPS = max(1.0, min(fps, STREAM_TARGET_FPS))
        STREAM_AI_FPS = max(0.25, min(STREAM_AI_FPS, STREAM_TARGET_FPS))

    delay = 1.0 / STREAM_TARGET_FPS
    frame_counter = 0
    _src_fps = fps
    SKIP_INTERVAL = max(1, round(STREAM_TARGET_FPS / STREAM_AI_FPS))
    print(f"[FPS] source={_src_fps:.1f} stream={STREAM_TARGET_FPS:.1f} ai={STREAM_AI_FPS:.1f} skip={SKIP_INTERVAL}")


    if is_rtsp_source:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, STREAM_OUTPUT_MAX_WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, int(round(STREAM_OUTPUT_MAX_WIDTH * 9 / 16)))
        cap.set(cv2.CAP_PROP_FPS, STREAM_TARGET_FPS)
    if not cap.isOpened():
        # Thử lại với RTSP options (hỗ trợ rtsp:// URL)
        cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)

    if not cap.isOpened():
        print(f"[Error] Could not open video file: {video_path}")
        return
    print(f"[DEBUG-LOG] Video source opened successfully: {video_path}")

    last_annotated = None
    effective_camera_id = str(camera_id or "").strip() or infer_camera_id(video_path, fallback="CAM_01")
    ai_owner_key = _make_camera_ai_owner_key(effective_camera_id, source_kind, video_path)
    ai_owner_token = f"{threading.get_ident()}:{id(cap)}:{time.monotonic():.6f}"
    owns_camera_ai = _try_acquire_camera_ai_owner(ai_owner_key, ai_owner_token)
    print(f"[Stream] camera={effective_camera_id} ai_owner={owns_camera_ai} source={source_kind}")
    
    # Cache để trĂ¡nh lưu cĂ¹ng track_id nhiều lần trong má»™t phiĂªn
    db_detection_ids_by_track: Dict[int, int] = {}
    last_db_write_by_track: Dict[int, float] = {}
    best_detection_by_track: Dict[int, Dict[str, Any]] = {}
    recent_detection_matches: List[Dict[str, Any]] = []
    track_vote_buffers: Dict[int, List[Dict[str, Any]]] = {}
    last_track_seen_by_track: Dict[int, float] = {}
    if owns_camera_ai:
        clear_ocr_cache(effective_camera_id)
        clear_id_mapping(effective_camera_id)
        clear_violation_state(effective_camera_id)
    pending_ai: Optional[Future] = None
    last_ai_submit_at = 0.0
    pending_ai_started_at = 0.0
    ai_submit_count = 0
    ai_complete_count = 0
    _update_stream_runtime_stats(
        ai_owner_key,
        camera_id=effective_camera_id,
        source_kind=source_kind,
        owns_camera_ai=owns_camera_ai,
        ai_pending=False,
        ai_submit_count=0,
        ai_complete_count=0,
        last_ai_ms=0.0,
        last_ai_error="",
        last_vehicle_count=0,
        last_plate_crop_count=0,
        last_plate_text_count=0,
        last_temporary_count=0,
        last_plate_reasons={},
    )

    def _run_ai_async(frame_process: np.ndarray, frame_original: np.ndarray):
        return annotate_frame_with_tracking(
            frame_process,
            camera_id=effective_camera_id,
            detect_vehicle=detect_vehicle,
            detect_plate=detect_plate,
            simulation=simulation,
            simulate_plate=simulate_plate,
            original_frame_hd=frame_original,
        )

    log_queue: "Queue[Optional[List[Dict[str, Any]]]]" = Queue(maxsize=max(8, _env_int("STREAM_LOG_QUEUE_SIZE", 64)))
    dropped_log_batches = 0

    def _process_tracking_batch(tracking_batch: List[Dict[str, Any]]) -> None:
        if not tracking_batch:
            return

        _analytics_db = None
        try:
            _analytics_db = SessionLocal()
            update_lane_trajectory_analytics(
                _analytics_db,
                effective_camera_id,
                tracking_batch,
                _vn_now(),
            )
        except Exception as exc:
            print(f"[ANALYTICS WARNING] {exc}")
        finally:
            if _analytics_db is not None:
                _analytics_db.close()

        for vehicle_data in tracking_batch:
            vehicle_data = _normalize_plate_payload(vehicle_data)
            track_id = vehicle_data.get("track_id")
            if track_id is None:
                continue

            _track_now_mono = time.monotonic()
            _track_last_seen = float(last_track_seen_by_track.get(track_id, 0.0) or 0.0)
            if _track_last_seen and (_track_now_mono - _track_last_seen) > _TRACK_DB_SESSION_TIMEOUT_SEC:
                db_detection_ids_by_track.pop(track_id, None)
                last_db_write_by_track.pop(track_id, None)
                best_detection_by_track.pop(track_id, None)
                track_vote_buffers.pop(track_id, None)
                print(f"[DEBUG-LOG] new session for reused track={track_id}")
            last_track_seen_by_track[track_id] = _track_now_mono

            _session_vehicle = dict(vehicle_data)
            _session_vehicle["camera"] = effective_camera_id
            _session_vehicle["camera_id"] = effective_camera_id

            _session_vb = _session_vehicle.get("vehicle_crop_b64", "") or ""
            _session_pb = _session_vehicle.get("plate_crop_b64", "") or ""
            # Do not push large vehicle/plate images through the live event bus.
            # The DB worker writes source-frame crops to disk, and the UI reads
            # them back from /api/history. This avoids accidentally showing stale
            # low-quality stream-sized images in the violation panel.
            _session_vehicle["vehicle_image"] = ""
            _session_vehicle["plate_image"] = ""

            _session_vehicle = update_vehicle(
                track_id,
                _session_vehicle,
                track_vote_buffers,
                effective_camera_id,
                "rtsp" if is_rtsp_source else "default",
            )
            vehicle_data = dict(_session_vehicle)
            _vt = _canonical_vehicle_type(vehicle_data.get("class", ""))
            _raw_plate = (vehicle_data.get("plate_number", "") or "").strip()
            _ocr_score = float(vehicle_data.get("ocr_score", 0.0) or 0.0)
            _vote_count = int(vehicle_data.get("vote_count", 0) or 0)
            _is_temporary = 0
            _is_simulated = 1 if simulation else 0

            if _is_confirmed_plate(
                _raw_plate,
                _ocr_score,
                _vote_count,
                expected_vehicle_type=_vt,
            ):
                _pt = _raw_plate
            elif simulation and simulate_plate:
                _pt = f"30A-{randint(100, 999)}.{randint(10, 99)}"
                _is_simulated = 1
            elif _raw_plate and _ocr_score >= _TRACK_VOTE_MIN_SCORE:
                _pt = _raw_plate
                _is_temporary = 1
            else:
                _pt = ""
                _is_temporary = 1

            _existing_detection_id = db_detection_ids_by_track.get(track_id)

            _vehicle_crop_completeness = float(vehicle_data.get("vehicle_crop_completeness", 100.0) or 0.0)
            _vehicle_crop_b64_for_db = vehicle_data.get("vehicle_crop_b64", "") or ""
            if _vt != "moto" and _vehicle_crop_completeness < _STREAM_MIN_FULL_VEHICLE_CROP_SCORE:
                # Do not persist roof/corner crops from vehicles entering or leaving the frame.
                # A later full crop from the same track is still allowed to update the record.
                _vehicle_crop_b64_for_db = ""
            _plate_crop_b64_for_db = vehicle_data.get("plate_crop_b64", "") or ""
            _plate_source_for_db = vehicle_data.get("plate_crop_source", "") or ""
            _plate_has_evidence_for_db = bool(vehicle_data.get("plate_crop_has_evidence", False))
            if (
                _plate_crop_b64_for_db
                and not _pt
                and not _plate_has_evidence_for_db
                and str(_plate_source_for_db).startswith(("candidate:", "fallback", "background_vehicle_recrop"))
            ):
                _plate_crop_b64_for_db = ""
            _cp = ""
            _pp = ""

            _candidate_for_db = dict(vehicle_data)
            _candidate_for_db["plate_number"] = _pt
            _candidate_for_db["camera_id"] = effective_camera_id
            _candidate_for_db["is_temporary"] = _is_temporary
            _candidate_for_db["ocr_score"] = _ocr_score
            _candidate_for_db["vote_count"] = _vote_count
            _candidate_for_db["plate_crop_source"] = vehicle_data.get("plate_crop_source", "") or ""
            _candidate_for_db["plate_debug_reason"] = vehicle_data.get("plate_debug_reason", "") or ""
            _candidate_for_db["plate_debug_variant"] = vehicle_data.get("plate_debug_variant", "") or ""
            _candidate_for_db["vehicle_crop_quality"] = float(vehicle_data.get("vehicle_crop_quality", 0.0) or 0.0)
            _candidate_for_db["vehicle_crop_completeness"] = _vehicle_crop_completeness
            _candidate_for_db["vehicle_crop_b64"] = _vehicle_crop_b64_for_db
            _candidate_for_db["plate_crop_b64"] = _plate_crop_b64_for_db
            _candidate_for_db["plate_crop_quality"] = float(vehicle_data.get("plate_crop_quality", vehicle_data.get("plate_crop_focus", 0.0)) or 0.0)

            if _existing_detection_id is None:
                _now_mono = time.monotonic()
                _center = vehicle_data.get("center_bottom")
                _compact_plate = _normalize_plate_compact(_pt)
                for _recent in list(recent_detection_matches):
                    if (_now_mono - float(_recent.get("last_seen_mono", 0.0) or 0.0)) > _TRACK_SOFT_MERGE_WINDOW_SEC:
                        continue
                    if _recent.get("camera_id") != effective_camera_id:
                        continue
                    _recent_plate = str(_recent.get("plate_compact", "") or "")
                    _same_plate = bool(_compact_plate and _recent_plate and _compact_plate == _recent_plate)
                    if _same_plate:
                        _existing_detection_id = int(_recent.get("detection_id") or 0) or None
                        if _existing_detection_id is not None:
                            db_detection_ids_by_track[track_id] = _existing_detection_id
                            print(
                                f"[DEBUG-LOG] soft-merge track={track_id} -> detection_id={_existing_detection_id} "
                                f"plate='{_pt}' same_plate={_same_plate}"
                            )
                            break

                # RÀ SOÁT CHỐNG TRÙNG CSDL: Nếu xe đã có trong database trên camera này, tái sử dụng bản ghi cũ
                if _existing_detection_id is None and _compact_plate:
                    try:
                        with SessionLocal() as _check_db:
                            _existing_record = (
                                _check_db.query(Detection)
                                .filter(
                                    Detection.deleted_at.is_(None),
                                    Detection.camera_id == effective_camera_id,
                                    Detection.plate_norm == _normalize_plate_safe(_pt)
                                )
                                .order_by(Detection.id.desc())
                                .first()
                            )
                            if _existing_record is not None:
                                _existing_detection_id = int(_existing_record.id)
                                db_detection_ids_by_track[track_id] = _existing_detection_id
                                print(
                                    f"[DEBUG-LOG] db-dedup match track={track_id} -> detection_id={_existing_detection_id} "
                                    f"plate='{_pt}'"
                                )
                    except Exception as _dedup_err:
                        pass

            _vehicle_path = _build_detection_crop_path(
                "vehicle",
                detection_id=_existing_detection_id,
                track_id=(None if _existing_detection_id is not None else track_id),
                camera_id=effective_camera_id,
            )
            _plate_path = _build_detection_crop_path(
                "plate",
                detection_id=_existing_detection_id,
                track_id=(None if _existing_detection_id is not None else track_id),
                camera_id=effective_camera_id,
            )
            if _existing_detection_id is None:
                if _evidence_pair_payload_ready(
                    _vehicle_crop_b64_for_db,
                    _plate_crop_b64_for_db,
                    _plate_source_for_db,
                ):
                    _cp, _pp = _write_b64_evidence_pair(
                        _vehicle_crop_b64_for_db,
                        _plate_crop_b64_for_db,
                        _vehicle_path,
                        _plate_path,
                    )
            else:
                # Existing detections keep their current evidence files until a
                # candidate is accepted. Writing before the quality gate can
                # silently replace detection_{id}_plate.jpg with another crop
                # while the DB still points to the old plate number.
                _cp = _vehicle_path if _vehicle_crop_b64_for_db else ""
                _pp = _plate_path if _plate_crop_b64_for_db else ""

            _previous_track_best = best_detection_by_track.get(track_id)

            if _existing_detection_id is None:
                _should_update_db = True
            elif not _is_temporary:
                _should_update_db = _is_better_track_candidate(_candidate_for_db, _previous_track_best)
                if _should_update_db:
                    best_detection_by_track[track_id] = dict(_candidate_for_db)
            else:
                _last_write = float(last_db_write_by_track.get(track_id, 0.0) or 0.0)
                _should_update_db = (time.monotonic() - _last_write) >= _TEMP_DB_REFRESH_INTERVAL_SEC

            if _should_update_db:
                best_detection_by_track[track_id] = dict(_candidate_for_db)

            _db2 = None
            try:
                _db2 = SessionLocal()
                if _existing_detection_id is not None and _should_update_db:
                    _row = (
                        _db2.query(Detection)
                        .filter(Detection.id == _existing_detection_id)
                        .first()
                    )
                    if _row is not None:
                        _existing_plate = (_row.plate_number or "").strip()
                        _existing_score = float(_row.ocr_score or 0.0)
                        _candidate_has_pair = _evidence_pair_payload_ready(
                            _vehicle_crop_b64_for_db,
                            _plate_crop_b64_for_db,
                            _plate_source_for_db,
                        )
                        _row_has_pair = _detection_has_complete_evidence(_row)
                        _replace_vehicle_crop = bool(
                            _candidate_has_pair
                            and (
                                not _row_has_pair
                                or _should_replace_vehicle_crop(_candidate_for_db, _previous_track_best)
                            )
                        )
                        _existing_plate_key = _normalize_plate_compact(_existing_plate)
                        _new_plate_key = _normalize_plate_compact(_pt)
                        if (
                            _replace_vehicle_crop
                            and _existing_plate_key
                            and (
                                bool(_row.image_path)
                                or str(vehicle_data.get("plate_crop_source", "") or "") == "cache"
                                or _new_plate_key != _existing_plate_key
                            )
                        ):
                            # Freeze an established vehicle/plate evidence pair. A tracker
                            # ID can be reassigned after occlusion, while its OCR cache
                            # still contains the previous vehicle's plate.
                            _replace_vehicle_crop = False
                        _replace_plate_crop = bool(
                            _candidate_has_pair
                            and (
                                not _row_has_pair
                                or _should_replace_plate_crop(_candidate_for_db, _previous_track_best)
                            )
                        )
                        _plate_identity_changes = bool(
                            _existing_plate_key
                            and _new_plate_key
                            and _existing_plate_key != _new_plate_key
                        )
                        _identity_change_has_pair = bool(
                            _plate_identity_changes
                            and _vehicle_crop_b64_for_db
                            and _plate_crop_b64_for_db
                            and str(vehicle_data.get("plate_crop_source", "") or "") != "cache"
                        )
                        _row_pair_is_locked = bool(
                            _row_has_pair and int(_row.is_temporary or 0) == 0
                        )
                        if _plate_identity_changes:
                            if _identity_change_has_pair and not _row_pair_is_locked:
                                # Replace both sides atomically so the row can
                                # never show a plate crop from one vehicle and a
                                # full-vehicle crop from another.
                                _replace_vehicle_crop = True
                                _replace_plate_crop = True
                            else:
                                _replace_vehicle_crop = False
                                _replace_plate_crop = False
                        _written_cp = ""
                        _written_pp = ""
                        _replace_evidence_pair = bool(
                            _candidate_has_pair and (_replace_vehicle_crop or _replace_plate_crop)
                        )
                        if _replace_evidence_pair:
                            _written_cp, _written_pp = _write_b64_evidence_pair(
                                _vehicle_crop_b64_for_db,
                                _plate_crop_b64_for_db,
                                _vehicle_path,
                                _plate_path,
                            )
                            if _written_cp and _written_pp:
                                _row.image_path = _written_cp
                                _row.crop_path = _written_pp

                        _replace_plate_text = bool(
                            _pt
                            and (
                                not _existing_plate
                                or _existing_plate.lower() in {"unknown", "khong ro", "khong ro bien so"}
                                or _is_temporary == 0
                                or _ocr_score > _existing_score + 0.01
                            )
                        )
                        _plate_text_changes = bool(
                            _replace_plate_text
                            and _existing_plate_key
                            and _new_plate_key
                            and _existing_plate_key != _new_plate_key
                        )
                        if _plate_text_changes and _row_pair_is_locked:
                            _replace_plate_text = False
                        if _plate_text_changes and not _identity_change_has_pair:
                            _replace_plate_text = False
                        if _plate_text_changes and not _written_pp:
                            # Do not let a new plate text point to an older crop
                            # file. The next accepted crop from the same track
                            # can update both text and image together.
                            _replace_plate_text = False
                        if _replace_plate_text:
                            _row.plate_number = _pt
                            _row.ocr_score = _ocr_score
                            _row.vote_count = _vote_count
                        _row.vehicle_type = _vt or "unknown"
                        _row.confidence = float(vehicle_data.get("confidence", 0.0))
                        _row.timestamp = _vn_now()
                        _row.last_seen_at = _vn_now()
                        _row.camera_id = effective_camera_id
                        _row.track_id = int(track_id)
                        _row.violation_type = vehicle_data.get("violation_type", "") or ""
                        _row.is_simulated = _is_simulated
                        _row.is_temporary = 0 if int(_row.is_temporary or 0) == 0 or (_replace_plate_text and _is_temporary == 0) else _is_temporary
                        if _written_pp:
                            _row.plate_crop_source = vehicle_data.get("plate_crop_source", "") or ""
                            _row.plate_debug_reason = vehicle_data.get("plate_debug_reason", "") or ""
                            _row.plate_debug_variant = vehicle_data.get("plate_debug_variant", "") or ""
                        _db2.commit()
                        last_db_write_by_track[track_id] = time.monotonic()
                        best_detection_by_track[track_id] = dict(_candidate_for_db)
                        recent_detection_matches.append({
                            "detection_id": int(_row.id),
                            "track_id": int(track_id),
                            "camera_id": effective_camera_id,
                            "vehicle_type": _vt or "unknown",
                            "plate_compact": _normalize_plate_compact(_row.plate_number or _pt),
                            "center_bottom": vehicle_data.get("center_bottom"),
                            "last_seen_mono": time.monotonic(),
                        })
                        del recent_detection_matches[:-80]
                        print(
                            f"[DEBUG-LOG] update detection_id={int(_row.id)} track={track_id} "
                            f"plate='{_row.plate_number}' temp={_row.is_temporary} "
                            f"vehicle_crop={bool(_written_cp)} plate_crop={bool(_written_pp)} "
                            f"vq={float(_candidate_for_db.get('vehicle_crop_quality', 0.0)):.1f} "
                            f"pq={float(_candidate_for_db.get('plate_crop_quality', 0.0)):.1f}"
                        )
                        if (_is_temporary or _BACKGROUND_OCR_VERIFY_CONFIRMED_ENABLED) and (_written_pp or _written_cp):
                            _enqueue_background_ocr(int(_row.id), _written_pp, _vt or "unknown", _written_cp)
                    else:
                        db_detection_ids_by_track.pop(track_id, None)
                        _existing_detection_id = None
                        _vehicle_path = _build_detection_crop_path(
                            "vehicle",
                            track_id=track_id,
                            camera_id=effective_camera_id,
                        )
                        _plate_path = _build_detection_crop_path(
                            "plate",
                            track_id=track_id,
                            camera_id=effective_camera_id,
                        )
                        _cp = ""
                        _pp = ""
                        if _evidence_pair_payload_ready(
                            _vehicle_crop_b64_for_db,
                            _plate_crop_b64_for_db,
                            _plate_source_for_db,
                        ):
                            _cp, _pp = _write_b64_evidence_pair(
                                _vehicle_crop_b64_for_db,
                                _plate_crop_b64_for_db,
                                _vehicle_path,
                                _plate_path,
                            )

                if track_id not in db_detection_ids_by_track:
                    if not (_cp and _pp):
                        print(
                            f"[DEBUG-LOG] skip create track={track_id} camera={effective_camera_id} "
                            "reason=incomplete_evidence_pair"
                        )
                        continue
                    _now = _vn_now()
                    _new = Detection(
                        plate_number=_pt,
                        ocr_score=_ocr_score,
                        vote_count=_vote_count,
                        vehicle_type=_vt or "unknown",
                        confidence=float(vehicle_data.get("confidence", 0.0)),
                        timestamp=_now,
                        last_seen_at=_now,
                        image_path=_cp,
                        crop_path=_pp,
                        camera_id=effective_camera_id,
                        track_id=int(track_id),
                        violation_type=vehicle_data.get("violation_type", "") or "",
                        is_simulated=_is_simulated,
                        is_temporary=_is_temporary,
                        plate_crop_source=vehicle_data.get("plate_crop_source", "") or "",
                        plate_debug_reason=vehicle_data.get("plate_debug_reason", "") or "",
                        plate_debug_variant=vehicle_data.get("plate_debug_variant", "") or "",
                        plate_norm=_normalize_plate_safe(_pt),
                    )
                    _db2.add(_new)
                    _db2.commit()
                    _db2.refresh(_new)
                    _new_id = int(_new.id)
                    db_detection_ids_by_track[track_id] = _new_id
                    last_db_write_by_track[track_id] = time.monotonic()

                    _canonical_vehicle = _build_detection_crop_path("vehicle", detection_id=_new_id)
                    _canonical_plate = _build_detection_crop_path("plate", detection_id=_new_id)
                    if _cp and _cp != _canonical_vehicle:
                        try:
                            os.replace(_cp, _canonical_vehicle)
                            _cp = _canonical_vehicle
                        except Exception:
                            _cp = _canonical_vehicle if os.path.exists(_canonical_vehicle) else _cp
                    if _pp and _pp != _canonical_plate:
                        try:
                            os.replace(_pp, _canonical_plate)
                            _pp = _canonical_plate
                        except Exception:
                            _pp = _canonical_plate if os.path.exists(_canonical_plate) else _pp

                    _new.image_path = _cp
                    _new.crop_path = _pp
                    _db2.commit()
                    best_detection_by_track[track_id] = dict(_candidate_for_db)
                    recent_detection_matches.append({
                        "detection_id": _new_id,
                        "track_id": int(track_id),
                        "camera_id": effective_camera_id,
                        "vehicle_type": _vt or "unknown",
                        "plate_compact": _normalize_plate_compact(_pt),
                        "center_bottom": vehicle_data.get("center_bottom"),
                        "last_seen_mono": time.monotonic(),
                    })
                    del recent_detection_matches[:-80]
                    print(
                        f"[DEBUG-LOG] create detection_id={_new_id} track={track_id} "
                        f"plate='{_pt}' temp={_is_temporary} vehicle_crop={bool(_cp)} plate_crop={bool(_pp)} "
                        f"vq={float(_candidate_for_db.get('vehicle_crop_quality', 0.0)):.1f} "
                        f"pq={float(_candidate_for_db.get('plate_crop_quality', 0.0)):.1f}"
                    )
                    if (_is_temporary or _BACKGROUND_OCR_VERIFY_CONFIRMED_ENABLED) and (_pp or _cp):
                        _enqueue_background_ocr(_new_id, _pp, _vt or "unknown", _cp)
            except Exception as _ed:
                print(f"[DB Loi] {_ed}")
                traceback.print_exc()
                if _db2:
                    _db2.rollback()
            finally:
                if _db2:
                    _db2.close()

    def _tracking_log_worker() -> None:
        while True:
            try:
                batch = log_queue.get(timeout=0.5)
            except Empty:
                continue
            if batch is None:
                log_queue.task_done()
                break
            try:
                _process_tracking_batch(batch)
            finally:
                log_queue.task_done()

    log_thread: Optional[threading.Thread] = None
    if owns_camera_ai:
        log_thread = threading.Thread(target=_tracking_log_worker, daemon=True, name="stream-log-worker")
        log_thread.start()

    try:
        while True:
            _frame_start = time.time()
            # ← ÄĂƒ THÊM: Ä'o thời gian xá»­ lĂ½ frame
            loop_start = time.perf_counter()
            ret, frame = cap.read()
            read_ms = (time.perf_counter() - loop_start) * 1000.0
            if owns_camera_ai:
                _touch_camera_ai_owner(ai_owner_key, ai_owner_token)
            # Keep the emitted stream bounded; 4K MJPEG at source FPS will freeze weaker machines.
            _frame_delay = delay
            if ret and frame is not None:
                frame_stream = _resize_to_max_width(frame, STREAM_OUTPUT_MAX_WIDTH)
            if not ret:
                if is_rtsp_source:
                    print(f"[RTSP] No frame from {video_path}; retrying...")
                    time.sleep(0.2)
                    continue
                # Loop file sources immediately. Waiting for queued database writes or
                # an in-flight AI job here leaves the browser stuck on the final frame.
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                frame_counter = 0
                ret, frame = cap.read()
                if not ret or frame is None:
                    # Some codecs cannot seek reliably after EOF. Reopen the file
                    # instead of ending the multipart response.
                    cap.release()
                    cap = cv2.VideoCapture(video_path)
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    ret, frame = cap.read()
                if not ret:
                    print(f"[Stream] Could not restart {video_path}; retrying...")
                    time.sleep(0.25)
                    continue
                print(f"[Stream] Looping video from first frame: {video_path}")
                frame_stream = _resize_to_max_width(frame, STREAM_OUTPUT_MAX_WIDTH)

            tracking_data = []
            stream_out = frame_stream

            if pending_ai is not None and pending_ai.done():
                try:
                    annotated, tracking_data = pending_ai.result()
                    ai_complete_count += 1
                    _ai_ms = max(0.0, (time.monotonic() - pending_ai_started_at) * 1000.0)
                    _update_stream_runtime_stats(
                        ai_owner_key,
                        ai_pending=False,
                        ai_complete_count=ai_complete_count,
                        last_ai_ms=round(_ai_ms, 1),
                        last_ai_error="",
                        **_summarize_tracking_batch(tracking_data),
                    )
                    last_annotated = annotated if show_box else None
                except Exception as e:
                    print(f"[Lá»—i AI] {e}")
                    _update_stream_runtime_stats(
                        ai_owner_key,
                        ai_pending=False,
                        last_ai_error=f"{type(e).__name__}: {e}",
                    )
                finally:
                    pending_ai = None

            if (
                pending_ai is None
                and owns_camera_ai
                and (time.monotonic() - last_ai_submit_at) >= (1.0 / STREAM_AI_FPS)
                and (detect_vehicle or detect_plate or simulation)
            ):
                frame_original = frame.copy()
                frame_process = _resize_to_max_width(frame_original, AI_PROCESS_MAX_WIDTH)
                pending_ai = _STREAM_AI_EXECUTOR.submit(
                    _run_ai_async,
                    frame_process.copy(),
                    frame_original,
                )
                last_ai_submit_at = time.monotonic()
                pending_ai_started_at = last_ai_submit_at
                ai_submit_count += 1
                _update_stream_runtime_stats(
                    ai_owner_key,
                    ai_pending=True,
                    ai_submit_count=ai_submit_count,
                    last_submit_seconds_ago=0.0,
                )
            # ← ÄĂƒ SỬA: tĂ¡ch stream khỏi DB
            # XĂ¡c định Camera ID từ query hoặc tĂªn nguồn
            cam_id = effective_camera_id

            if owns_camera_ai and tracking_data:
                try:
                    log_queue.put([dict(item) for item in tracking_data], timeout=0.05)
                except Full:
                    dropped_log_batches += 1
                    if dropped_log_batches == 1 or dropped_log_batches % 25 == 0:
                        print(f"[Stream] Dropped {dropped_log_batches} tracking log batches because DB worker is busy")
                tracking_data = []

            if show_box and last_annotated is not None:
                stream_out = _resize_to_max_width(last_annotated, STREAM_OUTPUT_MAX_WIDTH)
            else:
                stream_out = frame_stream

            frame_counter += 1

            # TĂŒM dĂ²ng nĂ y:
            # cv2.imencode('.jpg', annotated)
            # hoặc:
            # cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 95])
            
            # Lower JPEG quality keeps RTSP->MJPEG responsive on weaker machines.
            _, jpeg = cv2.imencode(".jpg", stream_out, [cv2.IMWRITE_JPEG_QUALITY, STREAM_JPEG_QUALITY])
            # ← ÄĂƒ SỬA: giảm quality 95→75

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + jpeg.tobytes() + b"\r\n"
            )

            # Giữ Ä'Ăºng tốc độ video gốc
            _elapsed = time.time() - _frame_start
            _sleep = max(0, _frame_delay - _elapsed)
            if _sleep > 0:
                time.sleep(_sleep)
            # ← ÄĂƒ THÊM: sleep để Ä'Ăºng FPS gốc
    finally:
        cap.release()
        _release_camera_ai_owner(ai_owner_key, ai_owner_token)
        if log_thread is not None:
            try:
                log_queue.put(None, timeout=0.5)
            except Full:
                pass
        if pending_ai is not None and not pending_ai.done():
            pending_ai.cancel()
            _update_stream_runtime_stats(ai_owner_key, ai_pending=False, last_ai_error="cancelled")


def _query_bool(value: Optional[str], default: bool) -> bool:
    """Parse query string to bool so 'false' is never treated as True."""
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _validated_rtsp_url(value: str) -> str:
    parsed = urlparse(str(value or "").strip())
    if parsed.scheme.lower() not in {"rtsp", "rtsps"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Invalid RTSP URL")
    allowed_hosts = {
        host.strip().lower()
        for host in os.getenv("RTSP_ALLOWED_HOSTS", "").split(",")
        if host.strip()
    }
    is_production = os.getenv("APP_ENV", "development").strip().lower() in {"production", "prod"}
    if is_production and not allowed_hosts:
        raise HTTPException(status_code=503, detail="RTSP host allowlist is not configured")
    if allowed_hosts and parsed.hostname.lower() not in allowed_hosts:
        raise HTTPException(status_code=403, detail="RTSP host is not allowed")
    return parsed.geturl()


def _safe_video_file(filename: str) -> str:
    safe_name = os.path.basename(str(filename or ""))
    if not safe_name or safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid video filename")
    for root in (UPLOADS_DIR, DEFAULT_VIDEOS_DIR):
        candidate = os.path.abspath(os.path.join(root, safe_name))
        if os.path.commonpath((os.path.abspath(root), candidate)) == os.path.abspath(root) and os.path.isfile(candidate):
            return candidate
    raise HTTPException(status_code=404, detail=f"Video '{safe_name}' không tìm thấy.")


@app.get("/video_feed/{filename}", dependencies=[Depends(require_any_role)])
def video_feed(
    filename: str,
    detect_vehicle: Optional[str] = Query(default="true", description="Enable vehicle detection"),
    detect_plate: Optional[str] = Query(default="true", description="Enable plate recognition"),
    simulation: Optional[str] = Query(default="false", description="Simulation mode"),
    simulate_plate: Optional[str] = Query(default="false", description="Generate fake plates in simulation mode"),
    show_box: bool = Query(default=False),
    cam_id: str = Query(default="CAM_01", description="Camera id for stream routing"),
    rtsp_url: Optional[str] = Query(default="", description="RTSP stream URL"),
    current_user: User = Depends(require_any_role),
):
    """Stream MJPEG video with YOLO annotations and object tracking. Toggle state from frontend is passed here."""
    dv = _query_bool(detect_vehicle, True)
    dp = _query_bool(detect_plate, True)
    sim = _query_bool(simulation, False)
    sim_plate = sim and dp and _query_bool(simulate_plate, False)

    # ← ÄĂƒ THÊM: nhĂ¡nh RTSP — dĂ¹ng rtsp_url trá»±c tiếp lĂ m nguồn video
    if filename == "rtsp_stream" and rtsp_url:
        if current_user.role not in {"admin", "operator"}:
            raise HTTPException(status_code=403, detail="Operator or admin role required for RTSP")
        validated_rtsp_url = _validated_rtsp_url(rtsp_url)
        print(f"[RTSP] Connecting to approved host: {urlparse(validated_rtsp_url).hostname}")
        return StreamingResponse(
            iterate_in_threadpool(
                _generate_mjpeg(
                    validated_rtsp_url,
                    camera_id=cam_id,
                    detect_vehicle=dv,
                    detect_plate=dp,
                    simulation=sim,
                    simulate_plate=sim_plate,
                    show_box=show_box,
                )
            ),
            media_type="multipart/x-mixed-replace; boundary=frame",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    video_path = _safe_video_file(filename)
    # ← ÄĂƒ SỬA: tìm cả uploads/ vĂ  videos/
    return StreamingResponse(
        iterate_in_threadpool(
            _generate_mjpeg(
                video_path,
                camera_id=cam_id or infer_camera_id(video_path),
                detect_vehicle=dv,
                detect_plate=dp,
                simulation=sim,
                simulate_plate=sim_plate,
                show_box=show_box,
            )
        ),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/vehicles", dependencies=[Depends(require_any_role)])
def get_tracked_vehicles():
    """Get all currently tracked vehicles with real-time data."""
    vehicles = get_all_vehicles()
    print(f"[DEBUG-LOG] /api/vehicles count={len(vehicles)}")
    return {
        "vehicles": vehicles,
        "count": get_vehicle_count(),
    }


@app.get("/api/stats/ocr", dependencies=[Depends(require_any_role)])
def get_ocr_stats():
    """Expose OCR runtime statistics for reporting and charts."""
    stats = get_ocr_statistics()
    print(
        "[DEBUG-LOG] /api/stats/ocr "
        f"recognized={stats.get('recognized_total', 0)} "
        f"confirmed={stats.get('confirmed_total', 0)} "
        f"remaps={stats.get('successful_remap_total', 0)}"
    )
    return stats


@app.get("/api/ocr/runtime-status", dependencies=[Depends(require_chatbot_or_user)])
def get_ocr_runtime_status():
    """Read-only OCR runtime diagnostics; does not initialize OCR models."""
    stats = get_ocr_statistics()
    tensorflow_available = importlib.util.find_spec("tensorflow") is not None
    paddleocr_available = importlib.util.find_spec("paddleocr") is not None
    keras_available = importlib.util.find_spec("keras") is not None
    paddle_cache_home = os.getenv("PADDLE_PDX_CACHE_HOME") or os.path.join(os.path.expanduser("~"), ".paddlex")
    paddle_model_name = os.getenv("PADDLE_REC_MODEL", "PP-OCRv4_mobile_rec")
    paddle_model_dir = os.path.join(paddle_cache_home, "official_models", paddle_model_name)
    paddle_model_readable = bool(os.path.isdir(paddle_model_dir) and os.access(paddle_model_dir, os.R_OK))

    issues: List[str] = []
    if not tensorflow_available:
        issues.append("tensorflow_missing_for_quangnhat_ocr")
    if not paddleocr_available:
        issues.append("paddleocr_missing")
    elif not paddle_model_readable:
        issues.append("paddle_model_cache_not_readable")
    if stats.get("paddle_last_variant") == "fallback-unavailable":
        issues.append("last_paddle_fallback_unavailable")

    if not issues:
        status = "ready"
    elif len(issues) <= 1 and "tensorflow_missing_for_quangnhat_ocr" in issues and paddleocr_available and paddle_model_readable:
        status = "degraded"
    else:
        status = "blocked"

    return {
        "status": status,
        "issues": issues,
        "packages": {
            "tensorflow": tensorflow_available,
            "keras": keras_available,
            "paddleocr": paddleocr_available,
        },
        "env": {
            "PADDLE_REC_MODEL": paddle_model_name,
            "PADDLE_PDX_CACHE_HOME": paddle_cache_home,
            "OCR_PADDLE_RESCUE": os.getenv("OCR_PADDLE_RESCUE", "0"),
            "OCR_PADDLE_FULL_RESCUE": os.getenv("OCR_PADDLE_FULL_RESCUE", "0"),
        },
        "paths": {
            "paddle_model_dir": paddle_model_dir,
            "paddle_model_readable": paddle_model_readable,
        },
        "stats": stats,
        "background_ocr_queue_size": _BACKGROUND_OCR_QUEUE.qsize(),
        "note": "Read-only endpoint; it does not initialize OCR, tracking, stream, crop, or model pipelines.",
    }


@app.get("/api/stream/diagnostics", dependencies=[Depends(require_admin)])
def stream_diagnostics():
    """Expose lightweight stream ownership diagnostics."""
    now = time.monotonic()
    with _CAMERA_AI_OWNERS_LOCK:
        owners = [
            {
                "key": key,
                "last_seen_seconds_ago": round(now - _CAMERA_AI_OWNER_LAST_SEEN.get(key, now), 3),
            }
            for key in sorted(_CAMERA_AI_OWNERS.keys())
        ]
    with _STREAM_RUNTIME_STATS_LOCK:
        runtime = {
            key: {
                **value,
                "updated_seconds_ago": round(now - float(value.get("updated_at", now) or now), 3),
            }
            for key, value in sorted(_STREAM_RUNTIME_STATS.items())
        }
    return {
        "ai_owner_count": len(owners),
        "ai_owners": owners,
        "ai_workers": _STREAM_AI_WORKERS,
        "ai_owner_stale_seconds": _CAMERA_AI_OWNER_STALE_SEC,
        "runtime": runtime,
        "background_ocr_queue_size": _BACKGROUND_OCR_QUEUE.qsize(),
    }


@app.post("/api/reset-session")
def reset_session(
    request: Request,
    source_mode: str = Query(default="default"),
    camera_id: str = Query(default="CAM_01"),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Clear all tracked vehicles and reset session state with audit log."""
    session = _clear_runtime_session(source_mode=source_mode, camera_id=camera_id)
    try:
        try:
            from services.audit import write_audit
        except ImportError:
            from backend.services.audit import write_audit
        write_audit(
            db=db,
            user=current_user,
            action="reset_session",
            entity_type="session",
            entity_id=camera_id,
            after={"source_mode": source_mode, "camera_id": camera_id},
            note=f"Quản trị viên {current_user.username} thực hiện đặt lại phiên theo dõi ({camera_id}, {source_mode})",
            request=request,
        )
        db.commit()
    except Exception as e:
        logger.warning(f"Failed to record audit log for reset_session: {e}")
    return {
        "status": "success",
        "message": "Session cleared successfully",
        **session,
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
