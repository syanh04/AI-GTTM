"""Canonical, read-only description of the system that is actually demoed.

This module is intentionally independent from the AI loaders.  It gives the
report, frontend and API one source of truth without loading model weights.
"""
from __future__ import annotations

import importlib.metadata
import os
from pathlib import Path
from typing import Any, Mapping


PRODUCT_NAME = "Nguyên mẫu hỗ trợ giám sát, nhận dạng phương tiện và biển số"
PRODUCT_SCOPE = "decision_support_prototype"


def _truthy(value: str) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _package_version(name: str) -> str:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return "not-installed"


def build_runtime_manifest(
    *,
    env: Mapping[str, str] | None = None,
    models_dir: str | os.PathLike[str] | None = None,
) -> dict[str, Any]:
    """Return the as-built architecture without secrets or absolute paths."""
    values = os.environ if env is None else env
    model_root = Path(models_dir or values.get("MODELS_DIR") or Path(__file__).with_name("models"))

    primary_plate = Path(
        values.get("PLATE_MODEL_PATH")
        or model_root / "plate_yolov8n_320_2024.pt"
    )
    rescue_plate = Path(
        values.get("PLATE_RESCUE_MODEL_PATH")
        or model_root / "plate_yolov9s_640_2025.pt"
    )
    vehicle_model = Path(
        values.get("VEHICLE_MODEL_PATH")
        or model_root / "vehicle_yolo12s_640.pt"
    )
    character_weights = Path(
        values.get("QUANGNHAT_CHAR_WEIGHTS")
        or model_root / "quangnhat" / "License_character_recognition_weight.h5"
    )

    paddle_rescue = _truthy(values.get("OCR_PADDLE_RESCUE", "0"))
    consensus_enabled = not _truthy(values.get("OCR_DISABLE_TEMPORAL_CONSENSUS", "0"))

    return {
        "schema_version": 1,
        "product": {
            "name": PRODUCT_NAME,
            "scope": PRODUCT_SCOPE,
            "verified_claims": [
                "Giám sát video và ghi nhận phương tiện",
                "Phát hiện, theo dõi và nhận dạng biển số",
                "Lưu cặp ảnh xe/biển số để cán bộ đối soát",
                "Hỗ trợ cấu hình vùng và lập hồ sơ cần xác nhận",
            ],
            "restricted_claims": [
                "Không tự động ban hành quyết định xử phạt",
                "Chưa tuyên bố mô-đun vi phạm đã được kiểm chứng nếu thiếu tập sự kiện dương tính",
                "Mức phạt trên giao diện chỉ là dữ liệu tra cứu cần người có thẩm quyền đối chiếu",
            ],
        },
        "transport": {
            "video": "MJPEG /video_feed/{filename}",
            "history_updates": "HTTP polling /api/history/updates",
            "websocket": "available_for_streamer_integration_not_primary_ui_path",
        },
        "storage": {
            "development": "SQLite",
            "production": "PostgreSQL required by production readiness policy",
        },
        "pipeline": {
            "vehicle_detector": {
                "family": "YOLO",
                "checkpoint": vehicle_model.name,
                "fallback": "yolov8n.pt only when the project checkpoint is unavailable",
                "exists": vehicle_model.is_file(),
            },
            "tracker": {
                "name": "ByteTrack",
                "config": "backend/bytetrack_custom.yaml",
                "track_high_thresh": 0.20,
                "track_low_thresh": 0.10,
                "new_track_thresh": 0.25,
                "track_buffer": 60,
                "match_thresh": 0.80,
            },
            "plate_detector": {
                "primary_checkpoint": primary_plate.name,
                "primary_exists": primary_plate.is_file(),
                "rescue_checkpoint": rescue_plate.name,
                "rescue_exists": rescue_plate.is_file(),
            },
            "ocr": {
                "primary": "QuangNhat MobileNet character recognizer",
                "primary_checkpoint": character_weights.name,
                "primary_exists": character_weights.is_file(),
                "fallback": "PaddleOCR recognition on an already-cropped plate",
                "fallback_enabled": paddle_rescue,
                "temporal_consensus": "advanced near-string consensus",
                "temporal_consensus_enabled": consensus_enabled,
                "experimental_only": [
                    "CRNN checkpoints under runs/ocr",
                    "SVTR-style tiny checkpoints under runs/ocr",
                ],
            },
        },
        "runtime_versions": {
            "fastapi": _package_version("fastapi"),
            "uvicorn": _package_version("uvicorn"),
            "ultralytics": _package_version("ultralytics"),
            "torch": _package_version("torch"),
            "paddleocr": _package_version("paddleocr"),
            "paddlepaddle": _package_version("paddlepaddle"),
            "sqlalchemy": _package_version("sqlalchemy"),
        },
        "evidence_policy": {
            "vehicle_and_plate_pair_required_for_approval": True,
            "human_review_required": True,
            "simulated_records_must_be_labeled": True,
        },
    }
