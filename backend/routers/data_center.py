"""Data Center router implementing Phase 2 specifications."""
from __future__ import annotations

import csv
import io
import math
import os
import re
import shutil
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import urllib.parse

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import case, distinct, func
from sqlalchemy.orm import Session

try:
    from ..auth import get_current_user, require_admin, require_any_role, require_operator
    from ..database import AuditLog, Camera, Detection, User, ViolationRuleMap, _vn_now, get_db, rule_for_violation
    from ..inference import PROCESSED_CROPS_DIR
    from ..services.audit import write_audit
    from ..services.evidence import resolve_runtime_image_path
    from ..services.plates import normalize_plate
    from ..services.reporting import (
        build_csv_content,
        build_csv_preview_data,
        build_xlsx_content,
        build_xlsx_preview_data,
        build_pdf_content,
    )
except ImportError:
    from auth import get_current_user, require_admin, require_any_role, require_operator
    from database import AuditLog, Camera, Detection, User, ViolationRuleMap, _vn_now, get_db, rule_for_violation
    from inference import PROCESSED_CROPS_DIR
    from services.audit import write_audit
    from services.evidence import resolve_runtime_image_path
    from services.plates import normalize_plate
    from services.reporting import (
        build_csv_content,
        build_csv_preview_data,
        build_xlsx_content,
        build_xlsx_preview_data,
        build_pdf_content,
    )

router = APIRouter()

LOW_OCR_THRESHOLD = 90  # 90%
DATA_CROP_QUOTA_GB = float(os.getenv("DATA_CROP_QUOTA_GB", "50.0"))
DATA_CROP_WARN_PERCENT = float(os.getenv("DATA_CROP_WARN_PERCENT", "80.0"))
DATA_RETENTION_DAYS = int(os.getenv("DATA_RETENTION_DAYS", "30"))

VEHICLE_TYPE_MAP = {
    "car": "Ô tô",
    "truck": "Xe tải",
    "moto": "Xe máy",
    "motor": "Xe máy",
    "bus": "Xe buýt",
}

REVIEW_STATUS_MAP = {
    "pending": "Chờ duyệt",
    "processed": "Đã xác nhận",
    "dismissed": "Bỏ qua",
    "sent": "Đã gửi",
}


def case_code_for_detection(row: Detection) -> str:
    ts = row.timestamp
    date_part = ts.strftime("%Y%m%d") if ts else datetime.now().strftime("%Y%m%d")
    loc_part = re.sub(r"[^A-Z0-9]", "", str(row.camera_id or "CAM").upper())[:8] or "CAM"
    num_part = str(row.id).zfill(6)[-6:]
    return f"TRF-{date_part}-{loc_part}-{num_part}"


def format_ocr_percent(score: Optional[float]) -> int:
    if score is None:
        return 0
    val = float(score)
    # If 0.0 - 1.0 scale
    if val <= 1.0 and val > 0:
        val = val * 100
    return int(round(val))


def mask_plate_for_viewer(plate: str) -> str:
    if not plate or len(plate) < 4:
        return "****"
    # Format e.g. 29A-***.26 or 29A***759
    mid_start = max(1, len(plate) // 3)
    mid_end = min(len(plate) - 1, len(plate) - 2)
    return plate[:mid_start] + "***" + plate[mid_end:]


def escape_csv_cell(val: Any) -> str:
    s = str(val) if val is not None else ""
    if s and s[0] in ("=", "+", "-", "@"):
        s = "'" + s
    return s


# Pydantic schemas
class PlateUpdateRequest(BaseModel):
    plate: str
    note: Optional[str] = None


class ReviewUpdateRequest(BaseModel):
    status: str  # processed | dismissed | pending
    note: Optional[str] = None


class BulkActionRequest(BaseModel):
    ids: List[int]
    action: str  # confirm | dismiss | delete
    reason: Optional[str] = None


class DeleteReasonRequest(BaseModel):
    reason: Optional[str] = None


class CleanupParams(BaseModel):
    dry_run: bool = True
    older_than_days: int = 30


# -------------------------------------------------------------
# 3.1 Danh sách
# -------------------------------------------------------------
@router.get("/detections")
def get_data_detections(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=10, le=100),
    sort_by: str = Query("timestamp"),
    sort_dir: str = Query("desc"),
    camera_id: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    violation: Optional[str] = None,
    review_status: Optional[str] = None,
    status: Optional[str] = None,
    ocr_lt: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    time_from: Optional[str] = None,
    time_to: Optional[str] = None,
    q: Optional[str] = None,
    after_id: Optional[int] = None,
    deleted: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Dict[str, Any]:
    if not review_status and status:
        review_status = status
    is_viewer = current_user.role not in ("admin", "operator")

    query = db.query(Detection)

    # Deleted filter
    if deleted == "only":
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Chỉ admin mới có quyền xem bản ghi đã xóa")
        query = query.filter(Detection.deleted_at.isnot(None))
    else:
        query = query.filter(Detection.deleted_at.is_(None))

    if after_id is not None:
        query = query.filter(Detection.id > after_id)

    if camera_id:
        query = query.filter(Detection.camera_id == camera_id)

    if vehicle_type:
        query = query.filter(Detection.vehicle_type == vehicle_type)

    if violation:
        if violation == "any":
            query = query.filter(Detection.violation_type.isnot(None), Detection.violation_type != "")
        elif violation == "none":
            query = query.filter((Detection.violation_type.is_(None)) | (Detection.violation_type == ""))
        else:
            query = query.filter(Detection.violation_type == violation)

    if review_status:
        query = query.filter(Detection.review_status == review_status)

    if ocr_lt is not None:
        # Convert threshold to float scale 0.0 - 1.0 if needed
        lt_val = ocr_lt / 100.0 if ocr_lt > 1.0 else ocr_lt
        query = query.filter(Detection.ocr_score < lt_val)

    # Date / Time filter
    if date_from:
        start_str = f"{date_from}T{time_from if time_from else '00:00:00'}"
        try:
            dt_from = datetime.fromisoformat(start_str)
            query = query.filter(Detection.timestamp >= dt_from)
        except ValueError:
            pass

    if date_to:
        end_str = f"{date_to}T{time_to if time_to else '23:59:59'}"
        try:
            dt_to = datetime.fromisoformat(end_str)
            query = query.filter(Detection.timestamp <= dt_to)
        except ValueError:
            pass

    # Approximate query on plate_norm
    if q:
        norm_q = normalize_plate(q)
        if norm_q:
            query = query.filter(Detection.plate_norm.like(f"%{norm_q}%"))

    total = query.count()
    max_id = db.query(func.max(Detection.id)).scalar() or 0

    # Sorting
    sort_column = Detection.timestamp
    if sort_by == "plate_number":
        sort_column = Detection.plate_number
    elif sort_by == "ocr_score":
        sort_column = Detection.ocr_score
    elif sort_by == "camera_id":
        sort_column = Detection.camera_id
    elif sort_by == "violation_type":
        sort_column = Detection.violation_type

    if sort_dir.lower() == "asc":
        query = query.order_by(sort_column.asc(), Detection.id.asc())
    else:
        query = query.order_by(sort_column.desc(), Detection.id.desc())

    offset = (page - 1) * page_size
    rows = query.offset(offset).limit(page_size).all()

    items = []
    for r in rows:
        plate_display = mask_plate_for_viewer(r.plate_number) if is_viewer else r.plate_number
        has_plate_crop = bool(r.crop_path and str(r.crop_path).strip())
        items.append({
            "id": r.id,
            "case_code": case_code_for_detection(r),
            "plate": plate_display,
            "plate_original": r.plate_number_original if not is_viewer else None,
            "ocr_percent": format_ocr_percent(r.ocr_score),
            "vehicle_type": r.vehicle_type,
            "violation_type": r.violation_type or "",
            "review_status": r.review_status or "pending",
            "camera_id": r.camera_id or "CAM_01",
            "timestamp": r.timestamp.strftime("%d/%m/%Y %H:%M:%S") if r.timestamp else "",
            "raw_timestamp": (r.timestamp.strftime("%Y-%m-%dT%H:%M:%S+07:00") if r.timestamp else ""),
            "track_id": r.track_id,

            "has_plate_crop": has_plate_crop,
            "plate_edited": bool(r.plate_edited_at is not None),
            "is_simulated": bool(r.is_simulated),
            "deleted_at": r.deleted_at.strftime("%d/%m/%Y %H:%M:%S") if r.deleted_at else None,
            "delete_reason": r.delete_reason,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "max_id": max_id,
    }


# -------------------------------------------------------------
# 3.2 Chi tiết, sửa, duyệt
# -------------------------------------------------------------
@router.get("/detections/{id}")
def get_data_detection_detail(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Dict[str, Any]:
    row = db.query(Detection).filter(Detection.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")

    is_viewer = current_user.role not in ("admin", "operator")

    audit_history = []
    if not is_viewer:
        audits = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == "detection", AuditLog.entity_id == str(id))
            .order_by(AuditLog.ts.desc())
            .limit(10)
            .all()
        )
        for a in audits:
            audit_history.append({
                "id": a.id,
                "ts": a.ts.strftime("%d/%m/%Y %H:%M:%S") if a.ts else "",
                "username": a.username,
                "action": a.action,
                "note": a.note,
                "before": a.before_json,
                "after": a.after_json,
            })

    plate_display = mask_plate_for_viewer(row.plate_number) if is_viewer else row.plate_number

    return {
        "id": row.id,
        "case_code": case_code_for_detection(row),
        "plate": plate_display,
        "plate_original": row.plate_number_original if not is_viewer else None,
        "plate_edited_by": row.plate_edited_by if not is_viewer else None,
        "plate_edited_at": row.plate_edited_at.strftime("%d/%m/%Y %H:%M:%S") if row.plate_edited_at else None,
        "ocr_percent": format_ocr_percent(row.ocr_score),
        "confidence": float(row.confidence or 0.0),
        "vote_count": row.vote_count or 0,
        "vehicle_type": row.vehicle_type,
        "violation_type": row.violation_type or "",
        "review_status": row.review_status or "pending",
        "reviewed_by": row.reviewed_by,
        "reviewed_at": row.reviewed_at.strftime("%d/%m/%Y %H:%M:%S") if row.reviewed_at else None,
        "review_note": row.review_note,
        "camera_id": row.camera_id,
        "timestamp": row.timestamp.strftime("%d/%m/%Y %H:%M:%S") if row.timestamp else "",
        "raw_timestamp": (row.timestamp.strftime("%Y-%m-%dT%H:%M:%S+07:00") if row.timestamp else ""),
        "track_id": row.track_id,
        "plate_crop_source": row.plate_crop_source,
        "image_path": os.path.basename(row.image_path) if row.image_path else "",
        "crop_path": os.path.basename(row.crop_path) if row.crop_path else "",
        "is_simulated": bool(row.is_simulated),
        "deleted_at": row.deleted_at.strftime("%d/%m/%Y %H:%M:%S") if row.deleted_at else None,
        "delete_reason": row.delete_reason,
        "audit_history": audit_history,
    }


@router.get("/detections/{id}/related")
def get_detection_related(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Dict[str, Any]:
    row = db.query(Detection).filter(Detection.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")

    record = {
        "id": row.id,
        "code": f"REC-{row.id:06d}",
        "camera_id": row.camera_id,
        "timestamp": row.timestamp.isoformat() if row.timestamp else None,
    }

    case_data = None
    if row.violation_type and row.violation_type.strip():
        rule_id = rule_for_violation(db, row.violation_type)
        case_data = {
            "id": row.id,
            "code": f"VP-{row.id:06d}",
            "status": row.review_status or "pending",
            "violation_type": row.violation_type,
            "rule_id": rule_id,
        }

    camera_data = None
    if row.camera_id:
        cam = db.query(Camera).filter(Camera.id == row.camera_id).first()
        if cam:
            camera_data = {
                "id": cam.id,
                "name": cam.name,
                "archived": bool(cam.archived),
                "online": bool(cam.enabled and not cam.archived),
            }

    same_plate_count = 0
    if row.plate_norm:
        same_plate_count = db.query(func.count(Detection.id)).filter(
            Detection.plate_norm == row.plate_norm,
            Detection.deleted_at.is_(None),
        ).scalar() or 0
    elif row.plate_number:
        same_plate_count = db.query(func.count(Detection.id)).filter(
            Detection.plate_number == row.plate_number,
            Detection.deleted_at.is_(None),
        ).scalar() or 0

    audit_count = 0
    if current_user.role == "admin":
        audit_count = db.query(func.count(AuditLog.id)).filter(
            (
                (AuditLog.entity_type == "detection") & (AuditLog.entity_id == str(row.id))
            ) | (
                (AuditLog.entity_type == "case") & (AuditLog.entity_id == str(row.id))
            )
        ).scalar() or 0

    return {
        "record": record,
        "case": case_data,
        "camera": camera_data,
        "same_plate_count": same_plate_count,
        "audit_count": audit_count,
    }


@router.patch("/detections/{id}/plate")
def patch_detection_plate(
    id: int,
    req: Request,
    payload: PlateUpdateRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
) -> Dict[str, Any]:
    row = db.query(Detection).filter(Detection.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")

    new_plate = payload.plate.strip().upper()
    if not new_plate or len(new_plate) > 15:
        raise HTTPException(status_code=400, detail="Biển số không hợp lệ (tối đa 15 ký tự)")

    before_state = {
        "plate_number": row.plate_number,
        "plate_norm": row.plate_norm,
    }

    if not row.plate_number_original:
        row.plate_number_original = row.plate_number

    row.plate_number = new_plate
    row.plate_norm = normalize_plate(new_plate)
    row.plate_edited_by = current_user.username
    row.plate_edited_at = _vn_now()

    after_state = {
        "plate_number": row.plate_number,
        "plate_norm": row.plate_norm,
        "note": payload.note,
    }

    write_audit(
        db,
        user=current_user,
        action="edit_plate",
        entity_type="detection",
        entity_id=id,
        before=before_state,
        after=after_state,
        note=payload.note,
        request=req,
    )
    db.commit()

    return {
        "ok": True,
        "id": id,
        "plate": row.plate_number,
        "plate_original": row.plate_number_original,
    }


@router.post("/detections/{id}/review")
def post_detection_review(
    id: int,
    req: Request,
    payload: ReviewUpdateRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
) -> Dict[str, Any]:
    row = db.query(Detection).filter(Detection.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")

    if not row.violation_type:
        raise HTTPException(status_code=400, detail="Bản ghi không có vi phạm, không thể cập nhật trạng thái xử lý")

    valid_statuses = ("processed", "dismissed", "pending", "sent")
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Trạng thái không hợp lệ. Phải là một trong: {valid_statuses}")

    before_state = {
        "review_status": row.review_status,
        "review_note": row.review_note,
    }

    row.review_status = payload.status
    row.reviewed_by = current_user.username
    row.reviewed_at = _vn_now()
    if payload.note is not None:
        row.review_note = payload.note

    after_state = {
        "review_status": row.review_status,
        "review_note": row.review_note,
    }

    write_audit(
        db,
        user=current_user,
        action="review_violation",
        entity_type="detection",
        entity_id=id,
        before=before_state,
        after=after_state,
        note=payload.note,
        request=req,
    )
    db.commit()

    return {
        "ok": True,
        "id": id,
        "review_status": row.review_status,
        "reviewed_by": row.reviewed_by,
        "reviewed_at": row.reviewed_at.strftime("%d/%m/%Y %H:%M:%S") if row.reviewed_at else None,
    }


# -------------------------------------------------------------
# 3.3 Hàng loạt
# -------------------------------------------------------------
@router.post("/detections/bulk")
def post_detections_bulk(
    req: Request,
    payload: BulkActionRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
) -> Dict[str, Any]:
    ids = payload.ids[:500]
    action = payload.action.lower()

    if action == "delete":
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Chỉ admin mới có quyền xóa hàng loạt")

    rows = db.query(Detection).filter(Detection.id.in_(ids)).all()
    ok_ids = []
    skipped_ids = []

    now = _vn_now()

    for r in rows:
        if action == "confirm":
            if r.violation_type:
                r.review_status = "processed"
                r.reviewed_by = current_user.username
                r.reviewed_at = now
                ok_ids.append(r.id)
            else:
                skipped_ids.append(r.id)
        elif action == "dismiss":
            if r.violation_type:
                r.review_status = "dismissed"
                r.reviewed_by = current_user.username
                r.reviewed_at = now
                ok_ids.append(r.id)
            else:
                skipped_ids.append(r.id)
        elif action == "delete":
            r.deleted_at = now
            r.deleted_by = current_user.username
            r.delete_reason = payload.reason or "Xóa hàng loạt"
            ok_ids.append(r.id)

    write_audit(
        db,
        user=current_user,
        action=f"bulk_{action}",
        entity_type="detection_bulk",
        entity_id=",".join(map(str, ok_ids[:50])),
        before=None,
        after={"count": len(ok_ids), "ids": ok_ids},
        note=payload.reason,
        request=req,
    )
    db.commit()

    return {
        "ok": True,
        "affected": len(ok_ids),
        "skipped": len(skipped_ids),
        "errors": [],
    }


# -------------------------------------------------------------
# 3.4 Xóa mềm, khôi phục, xóa vĩnh viễn (admin)
# -------------------------------------------------------------
@router.delete("/detections/{id}")
def delete_detection_soft(
    id: int,
    req: Request,
    payload: Optional[DeleteReasonRequest] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Dict[str, Any]:
    row = db.query(Detection).filter(Detection.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")

    reason = payload.reason if payload else None
    row.deleted_at = _vn_now()
    row.deleted_by = current_user.username
    row.delete_reason = reason

    write_audit(
        db,
        user=current_user,
        action="soft_delete",
        entity_type="detection",
        entity_id=id,
        before={"deleted_at": None},
        after={"deleted_at": str(row.deleted_at), "reason": reason},
        note=reason,
        request=req,
    )
    db.commit()

    return {"ok": True, "id": id, "message": "Đã xóa mềm bản ghi"}


@router.post("/detections/{id}/restore")
def restore_detection(
    id: int,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Dict[str, Any]:
    row = db.query(Detection).filter(Detection.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")

    old_del = row.deleted_at
    row.deleted_at = None
    row.deleted_by = None
    row.delete_reason = None

    write_audit(
        db,
        user=current_user,
        action="restore",
        entity_type="detection",
        entity_id=id,
        before={"deleted_at": str(old_del)},
        after={"deleted_at": None},
        note="Khôi phục bản ghi",
        request=req,
    )
    db.commit()

    return {"ok": True, "id": id, "message": "Đã khôi phục bản ghi"}


@router.delete("/detections/{id}/purge")
def purge_detection_permanent(
    id: int,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Dict[str, Any]:
    row = db.query(Detection).filter(Detection.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")

    if not row.deleted_at:
        raise HTTPException(status_code=400, detail="Bản ghi phải được xóa mềm trước khi xóa vĩnh viễn")

    # Xóa file ảnh an toàn qua resolver
    if row.image_path:
        p = resolve_runtime_image_path(row.image_path)
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass
    if row.crop_path:
        p = resolve_runtime_image_path(row.crop_path)
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass

    write_audit(
        db,
        user=current_user,
        action="purge_permanent",
        entity_type="detection",
        entity_id=id,
        before={"plate": row.plate_number, "camera": row.camera_id},
        after=None,
        note="Xóa vĩnh viễn và dọn dẹp file",
        request=req,
    )
    db.delete(row)
    db.commit()

    return {"ok": True, "id": id, "message": "Đã xóa vĩnh viễn bản ghi và file liên quan"}


# -------------------------------------------------------------
# 3.5 Ảnh có kiểm tra quyền
# -------------------------------------------------------------
@router.get("/images/{id}/{kind}")
def get_data_image(
    id: int,
    kind: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
):
    if kind not in ("vehicle", "plate"):
        raise HTTPException(status_code=400, detail="Kind phải là 'vehicle' hoặc 'plate'")

    # Viewer role cannot view plate crop
    if kind == "plate" and current_user.role not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Tài khoản chỉ xem không có quyền xem ảnh chi tiết biển số")

    row = db.query(Detection).filter(Detection.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")

    target_path = row.image_path if kind == "vehicle" else row.crop_path
    if not target_path:
        raise HTTPException(status_code=404, detail=f"Bản ghi chưa có ảnh {kind}")

    resolved = resolve_runtime_image_path(target_path)
    if not resolved or not os.path.exists(resolved):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy file ảnh {kind} trên máy chủ")

    headers = {"Cache-Control": "private, max-age=300"}
    return FileResponse(resolved, media_type="image/jpeg", headers=headers)


# -------------------------------------------------------------
# 3.6 KPI
# -------------------------------------------------------------
@router.get("/summary")
def get_data_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Dict[str, Any]:
    base_q = db.query(Detection).filter(Detection.deleted_at.is_(None))

    dt_from = None
    dt_to = None
    if date_from:
        try:
            dt_from = datetime.fromisoformat(f"{date_from}T00:00:00")
            base_q = base_q.filter(Detection.timestamp >= dt_from)
        except ValueError:
            pass

    if date_to:
        try:
            dt_to = datetime.fromisoformat(f"{date_to}T23:59:59")
            base_q = base_q.filter(Detection.timestamp <= dt_to)
        except ValueError:
            pass

    total = base_q.count()
    violations = base_q.filter(Detection.violation_type.isnot(None), Detection.violation_type != "").count()

    # OCR clear percent (>= 90%)
    clear_count = base_q.filter(Detection.ocr_score >= (LOW_OCR_THRESHOLD / 100.0)).count()
    ocr_clear_pct = round((clear_count / total * 100), 1) if total > 0 else 0.0

    # Crop storage usage
    crops_dir = PROCESSED_CROPS_DIR
    storage_bytes = 0
    if os.path.exists(crops_dir):
        try:
            with os.scandir(crops_dir) as it:
                for entry in it:
                    if entry.is_file():
                        storage_bytes += entry.stat().st_size
        except OSError:
            pass

    # Compare with previous period of equal length
    prev_total = None
    prev_violations = None
    prev_ocr_clear = None

    if dt_from and dt_to:
        delta = dt_to - dt_from
        prev_start = dt_from - delta
        prev_end = dt_from
        prev_q = db.query(Detection).filter(
            Detection.deleted_at.is_(None),
            Detection.timestamp >= prev_start,
            Detection.timestamp < prev_end,
        )
        prev_total = prev_q.count()
        prev_violations = prev_q.filter(Detection.violation_type.isnot(None), Detection.violation_type != "").count()
        prev_clear = prev_q.filter(Detection.ocr_score >= (LOW_OCR_THRESHOLD / 100.0)).count()
        prev_ocr_clear = round((prev_clear / prev_total * 100), 1) if prev_total > 0 else 0.0

    return {
        "total_vehicles": total,
        "violations": violations,
        "ocr_clear_percent": ocr_clear_pct,
        "crop_storage_bytes": storage_bytes,
        "crop_storage_gb": round(storage_bytes / (1024**3), 2),
        "prev_total": prev_total,
        "prev_violations": prev_violations,
        "prev_ocr_clear": prev_ocr_clear,
    }


# -------------------------------------------------------------
# 3.6b Camera
# -------------------------------------------------------------
@router.get("/cameras")
def get_data_cameras(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> List[Dict[str, Any]]:
    stats = (
        db.query(
            Detection.camera_id,
            func.count(Detection.id).label("total"),
            func.sum(
                case((Detection.violation_type.isnot(None) & (Detection.violation_type != ""), 1), else_=0)
            ).label("violations"),
            func.max(Detection.timestamp).label("last_seen"),
        )
        .filter(Detection.deleted_at.is_(None))
        .group_by(Detection.camera_id)
        .all()
    )

    result = []
    for row in stats:
        cam_id = row.camera_id or "CAM_01"
        result.append({
            "camera_id": cam_id,
            "total": int(row.total or 0),
            "violations": int(row.violations or 0),
            "last_seen_at": row.last_seen.strftime("%d/%m/%Y %H:%M:%S") if row.last_seen else None,
        })
    result.sort(key=lambda x: x["camera_id"])
    return result


# -------------------------------------------------------------
# 3.7 Lưu trữ
# -------------------------------------------------------------
@router.get("/storage")
def get_data_storage_info(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Dict[str, Any]:
    crops_dir = PROCESSED_CROPS_DIR
    total_bytes = 0
    total_files = 0
    file_basenames = set()

    if os.path.exists(crops_dir):
        try:
            with os.scandir(crops_dir) as it:
                for entry in it:
                    if entry.is_file():
                        total_files += 1
                        total_bytes += entry.stat().st_size
                        file_basenames.add(entry.name)
        except OSError:
            pass

    quota_bytes = int(DATA_CROP_QUOTA_GB * (1024**3))
    pct_used = round((total_bytes / quota_bytes * 100), 1) if quota_bytes > 0 else 0.0

    # Count orphaned files and missing files
    db_crops = db.query(Detection.crop_path).filter(Detection.crop_path.isnot(None), Detection.crop_path != "").all()
    db_crop_basenames = set()
    for row in db_crops:
        b = os.path.basename(row[0].replace("\\", "/"))
        if b:
            db_crop_basenames.add(b)

    orphan_files = len(file_basenames - db_crop_basenames)
    missing_crop_records = db.query(Detection).filter((Detection.crop_path.is_(None)) | (Detection.crop_path == "")).count()

    return {
        "storage_root": crops_dir,
        "quota_gb": DATA_CROP_QUOTA_GB,
        "used_gb": round(total_bytes / (1024**3), 2),
        "free_gb": max(0.0, round(DATA_CROP_QUOTA_GB - (total_bytes / (1024**3)), 2)),
        "percent_used": pct_used,
        "total_files": total_files,
        "warning": pct_used >= DATA_CROP_WARN_PERCENT,
        "orphan_files": orphan_files,
        "missing_crop_records": missing_crop_records,
        "retention_days": DATA_RETENTION_DAYS,
    }


@router.post("/storage/cleanup")
def post_data_storage_cleanup(
    req: Request,
    payload: CleanupParams = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Dict[str, Any]:
    crops_dir = PROCESSED_CROPS_DIR
    if not os.path.exists(crops_dir):
        return {"dry_run": payload.dry_run, "deleted_count": 0, "freed_mb": 0.0}

    cutoff_seconds = payload.older_than_days * 86400
    now = time.time()

    # Protect violations
    viol_crops = (
        db.query(Detection.crop_path, Detection.image_path)
        .filter(Detection.violation_type.isnot(None), Detection.violation_type != "")
        .all()
    )
    protected_basenames = set()
    for c, img in viol_crops:
        if c:
            protected_basenames.add(os.path.basename(c.replace("\\", "/")))
        if img:
            protected_basenames.add(os.path.basename(img.replace("\\", "/")))

    candidates = []
    freed_bytes = 0

    try:
        with os.scandir(crops_dir) as it:
            for entry in it:
                if not entry.is_file():
                    continue
                if entry.name in protected_basenames:
                    continue
                stat = entry.stat()
                if (now - stat.st_mtime) >= cutoff_seconds:
                    candidates.append(entry.path)
                    freed_bytes += stat.st_size
    except OSError as err:
        raise HTTPException(status_code=500, detail=f"Lỗi quét file: {str(err)}")

    if not payload.dry_run:
        deleted = 0
        for p in candidates:
            try:
                os.remove(p)
                deleted += 1
            except OSError:
                pass
        write_audit(
            db,
            user=current_user,
            action="storage_cleanup",
            entity_type="crops",
            entity_id=None,
            before=None,
            after={"deleted_count": deleted, "freed_mb": round(freed_bytes / (1024**2), 2)},
            note=f"Dọn dẹp ảnh quá {payload.older_than_days} ngày",
            request=req,
        )
        db.commit()
        return {
            "dry_run": False,
            "deleted_count": deleted,
            "freed_mb": round(freed_bytes / (1024**2), 2),
        }

    return {
        "dry_run": True,
        "candidates_count": len(candidates),
        "freed_mb": round(freed_bytes / (1024**2), 2),
        "older_than_days": payload.older_than_days,
    }


# -------------------------------------------------------------
# 3.8 Đánh giá mô hình (số liệu thật)
# -------------------------------------------------------------
@router.get("/model-metrics")
def get_data_model_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Dict[str, Any]:
    total = db.query(func.count(Detection.id)).filter(Detection.deleted_at.is_(None)).scalar() or 0

    # OCR score buckets
    lt_80 = db.query(func.count(Detection.id)).filter(Detection.deleted_at.is_(None), Detection.ocr_score < 0.80).scalar() or 0
    b_80_90 = db.query(func.count(Detection.id)).filter(Detection.deleted_at.is_(None), Detection.ocr_score >= 0.80, Detection.ocr_score < 0.90).scalar() or 0
    ge_90 = db.query(func.count(Detection.id)).filter(Detection.deleted_at.is_(None), Detection.ocr_score >= 0.90).scalar() or 0
    avg_ocr = db.query(func.avg(Detection.ocr_score)).filter(Detection.deleted_at.is_(None)).scalar() or 0.0

    # Vote count distribution
    vote_stats = (
        db.query(Detection.vote_count, func.count(Detection.id))
        .filter(Detection.deleted_at.is_(None))
        .group_by(Detection.vote_count)
        .all()
    )
    vote_distribution = {str(k or 0): int(v) for k, v in vote_stats}

    # Edited plate ratio
    reviewed_total = db.query(func.count(Detection.id)).filter(
        Detection.deleted_at.is_(None),
        Detection.review_status.in_(("processed", "dismissed")),
    ).scalar() or 0
    edited_total = db.query(func.count(Detection.id)).filter(
        Detection.deleted_at.is_(None),
        Detection.plate_edited_at.isnot(None),
    ).scalar() or 0
    edited_ratio = round((edited_total / reviewed_total * 100), 2) if reviewed_total > 0 else None

    # Violation confirmation precision
    confirmed = db.query(func.count(Detection.id)).filter(
        Detection.deleted_at.is_(None),
        Detection.review_status == "processed",
        Detection.violation_type.isnot(None),
        Detection.violation_type != "",
    ).scalar() or 0
    dismissed = db.query(func.count(Detection.id)).filter(
        Detection.deleted_at.is_(None),
        Detection.review_status == "dismissed",
        Detection.violation_type.isnot(None),
        Detection.violation_type != "",
    ).scalar() or 0
    review_precision = round((confirmed / (confirmed + dismissed) * 100), 1) if (confirmed + dismissed) > 0 else None

    return {
        "total_evaluated_records": total,
        "ocr_distribution": {
            "under_80": lt_80,
            "from_80_to_90": b_80_90,
            "ge_90": ge_90,
            "avg_score_percent": round(float(avg_ocr) * 100, 1),
            "clear_percent": round((ge_90 / total * 100), 1) if total > 0 else 0.0,
        },
        "vote_count_distribution": vote_distribution,
        "manual_edit_ratio": edited_ratio,
        "reviewed_records_count": reviewed_total,
        "violation_review_precision": review_precision,
        "processing_time_ms_per_frame": None,
        "note": "Chưa có dữ liệu gán nhãn thực tế cho Precision/Recall tổng thể. Các chỉ số trên được tính tự động từ nhật ký thao tác và kết quả duyệt.",
    }


# -------------------------------------------------------------
# 3.9 Nhật ký
# -------------------------------------------------------------
@router.get("/audit-logs")
def get_data_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: Optional[str] = None,
    username: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    q: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Dict[str, Any]:
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if username:
        query = query.filter(AuditLog.username == username)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == str(entity_id))
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            (AuditLog.note.ilike(term)) |
            (AuditLog.username.ilike(term)) |
            (AuditLog.action.ilike(term)) |
            (AuditLog.entity_id.ilike(term))
        )
    if date_from:
        try:
            query = query.filter(AuditLog.ts >= datetime.fromisoformat(f"{date_from}T00:00:00"))
        except ValueError:
            pass
    if date_to:
        try:
            query = query.filter(AuditLog.ts <= datetime.fromisoformat(f"{date_to}T23:59:59"))
        except ValueError:
            pass

    total = query.count()
    rows = query.order_by(AuditLog.ts.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for r in rows:
        items.append({
            "id": r.id,
            "ts": r.ts.strftime("%d/%m/%Y %H:%M:%S") if r.ts else "",
            "username": r.username,
            "role": r.role,
            "action": r.action,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "note": r.note,
            "ip": r.ip,
            "user_agent": r.user_agent,
            "before": r.before_json,
            "after": r.after_json,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# -------------------------------------------------------------
# 3.10 Xuất CSV và Excel
# -------------------------------------------------------------
def build_filtered_detection_query(db: Session, params: Dict[str, Any]):
    q = db.query(Detection).filter(Detection.deleted_at.is_(None))

    if params.get("camera_id"):
        q = q.filter(Detection.camera_id == params["camera_id"])
    if params.get("vehicle_type"):
        q = q.filter(Detection.vehicle_type == params["vehicle_type"])
    if params.get("violation"):
        v = params["violation"]
        if v == "any":
            q = q.filter(Detection.violation_type.isnot(None), Detection.violation_type != "")
        elif v == "none":
            q = q.filter((Detection.violation_type.is_(None)) | (Detection.violation_type == ""))
        else:
            q = q.filter(Detection.violation_type == v)
    if params.get("review_status"):
        q = q.filter(Detection.review_status == params["review_status"])
    if params.get("ocr_lt") is not None:
        lt_val = params["ocr_lt"] / 100.0 if params["ocr_lt"] > 1.0 else params["ocr_lt"]
        q = q.filter(Detection.ocr_score < lt_val)
    if params.get("date_from"):
        try:
            q = q.filter(Detection.timestamp >= datetime.fromisoformat(f"{params['date_from']}T00:00:00"))
        except ValueError:
            pass
    if params.get("date_to"):
        try:
            q = q.filter(Detection.timestamp <= datetime.fromisoformat(f"{params['date_to']}T23:59:59"))
        except ValueError:
            pass
    if params.get("q"):
        norm_q = normalize_plate(params["q"])
        if norm_q:
            q = q.filter(Detection.plate_norm.like(f"%{norm_q}%"))

    return q.order_by(Detection.timestamp.desc(), Detection.id.desc())


DATA_EXPORT_HEADERS = [
    "STT", "Mã hồ sơ", "Thời gian", "Camera", "Biển số",
    "Biển số OCR gốc", "Đã sửa tay", "Độ tin cậy OCR (%)", "Số lần bỏ phiếu OCR",
    "Độ tin cậy nhận dạng xe (%)", "Loại xe", "Vi phạm", "Trạng thái xử lý",
    "Người duyệt", "Thời gian duyệt", "Ghi chú duyệt", "Mã theo dõi (Track ID)",
    "Nguồn dữ liệu", "Ảnh xe", "Ảnh biển số",
]


@router.get("/export.csv")
def export_data_csv(
    req: Request,
    camera_id: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    violation: Optional[str] = None,
    review_status: Optional[str] = None,
    ocr_lt: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
    plain: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    params = {
        "camera_id": camera_id,
        "vehicle_type": vehicle_type,
        "violation": violation,
        "review_status": review_status,
        "ocr_lt": ocr_lt,
        "date_from": date_from,
        "date_to": date_to,
        "q": q,
    }
    query = build_filtered_detection_query(db, params)
    content_bytes, total_count, is_truncated = build_csv_content(
        query, params, current_user, plain=plain, limit=100000
    )

    write_audit(
        db,
        user=current_user,
        action="export_csv",
        entity_type="export",
        entity_id=None,
        before=None,
        after={"count": total_count, "truncated": is_truncated, "params": params},
        note=f"Xuất CSV {total_count} bản ghi",
        request=req,
    )
    db.commit()

    filename = f"BaoCao_DuLieu_{datetime.now().strftime('%Y%m%d-%H%M')}.csv"
    response_headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{urllib.parse.quote(filename)}",
    }
    if is_truncated:
        response_headers["X-Truncated"] = "true"

    return Response(content=content_bytes, media_type="text/csv", headers=response_headers)


@router.get("/export.xlsx")
def export_data_xlsx(
    req: Request,
    camera_id: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    violation: Optional[str] = None,
    review_status: Optional[str] = None,
    ocr_lt: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
    include_images: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    params = {
        "camera_id": camera_id,
        "vehicle_type": vehicle_type,
        "violation": violation,
        "review_status": review_status,
        "ocr_lt": ocr_lt,
        "date_from": date_from,
        "date_to": date_to,
        "q": q,
    }
    query = build_filtered_detection_query(db, params)
    content_bytes, total_count, is_truncated = build_xlsx_content(
        query, params, current_user, include_images=include_images, limit=50000
    )

    write_audit(
        db,
        user=current_user,
        action="export_xlsx",
        entity_type="export",
        entity_id=None,
        before=None,
        after={"count": total_count, "truncated": is_truncated, "include_images": include_images},
        note=f"Xuất Excel {total_count} bản ghi",
        request=req,
    )
    db.commit()

    filename = f"BaoCao_DuLieu_{datetime.now().strftime('%Y%m%d-%H%M')}.xlsx"
    response_headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{urllib.parse.quote(filename)}",
    }
    if is_truncated:
        response_headers["X-Truncated"] = "true"

    return Response(
        content=content_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=response_headers,
    )


@router.get("/export.pdf")
def export_data_pdf(
    req: Request,
    camera_id: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    violation: Optional[str] = None,
    review_status: Optional[str] = None,
    ocr_lt: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    params = {
        "camera_id": camera_id,
        "vehicle_type": vehicle_type,
        "violation": violation,
        "review_status": review_status,
        "ocr_lt": ocr_lt,
        "date_from": date_from,
        "date_to": date_to,
        "q": q,
    }
    query = build_filtered_detection_query(db, params)
    content_bytes, total_count, is_truncated = build_pdf_content(
        query, params, current_user, is_preview=False
    )

    write_audit(
        db,
        user=current_user,
        action="export_pdf",
        entity_type="export",
        entity_id=None,
        before=None,
        after={"count": total_count, "params": params},
        note=f"Xuất PDF {total_count} bản ghi",
        request=req,
    )
    db.commit()

    filename = f"BaoCao_DuLieu_{datetime.now().strftime('%Y%m%d-%H%M')}.pdf"
    response_headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{urllib.parse.quote(filename)}",
        "X-Total-Rows": str(total_count),
    }

    return Response(
        content=content_bytes,
        media_type="application/pdf",
        headers=response_headers,
    )


@router.get("/export-preview")
def get_export_preview(
    format: str = Query("csv", pattern="^(csv|xlsx|pdf)$"),
    limit: int = Query(50, ge=1, le=100),
    camera_id: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    violation: Optional[str] = None,
    review_status: Optional[str] = None,
    ocr_lt: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    params = {
        "camera_id": camera_id,
        "vehicle_type": vehicle_type,
        "violation": violation,
        "review_status": review_status,
        "ocr_lt": ocr_lt,
        "date_from": date_from,
        "date_to": date_to,
        "q": q,
    }
    query = build_filtered_detection_query(db, params)
    total_count = query.count()

    if format == "pdf":
        pdf_bytes, _, _ = build_pdf_content(
            query, params, current_user, is_preview=True
        )
        now_str = datetime.now().strftime("%Y%m%d-%H%M")
        filename = f"XemTruoc_BaoCao_{now_str}.pdf"
        response_headers = {
            "Content-Disposition": f"inline; filename*=UTF-8''{urllib.parse.quote(filename)}",
            "X-Total-Rows": str(total_count),
        }
        return Response(content=pdf_bytes, media_type="application/pdf", headers=response_headers)

    if format == "xlsx":
        return build_xlsx_preview_data(query, params, current_user, limit=limit)

    return build_csv_preview_data(query, params, current_user, limit=limit)
