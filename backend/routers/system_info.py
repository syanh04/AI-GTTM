"""Read-only endpoint exposing the canonical as-built system manifest and system badges."""
from __future__ import annotations

from typing import Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

try:
    from ..auth import require_any_role
    from ..database import Camera, Detection, User, get_db
    from ..inference import MODELS_DIR
    from ..runtime_manifest import build_runtime_manifest
except ImportError:
    from auth import require_any_role
    from database import Camera, Detection, User, get_db
    from inference import MODELS_DIR
    from runtime_manifest import build_runtime_manifest


router = APIRouter()


@router.get("/runtime-manifest")
def runtime_manifest() -> dict:
    return build_runtime_manifest(models_dir=MODELS_DIR)


@router.get("/badges")
def get_system_badges(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Dict[str, int]:
    cases_pending = (
        db.query(func.count(Detection.id))
        .filter(
            Detection.deleted_at.is_(None),
            Detection.violation_type.isnot(None),
            Detection.violation_type != "",
            (Detection.review_status.in_(("pending", "Chờ xử lý", "")) | Detection.review_status.is_(None)),
        )
        .scalar()
        or 0
    )

    cameras_offline = (
        db.query(func.count(Camera.id))
        .filter(
            Camera.archived == 0,
            Camera.enabled == 0,
        )
        .scalar()
        or 0
    )

    alerts_open = cases_pending

    return {
        "cases_pending": cases_pending,
        "cameras_offline": cameras_offline,
        "alerts_open": alerts_open,
    }
