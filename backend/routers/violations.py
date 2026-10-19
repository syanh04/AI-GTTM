"""Violation review, notice, and review-dashboard routes."""
from __future__ import annotations

import html
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable, Optional

from fastapi import Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session


class ViolationReviewUpdate(BaseModel):
    status: str
    operator: Optional[str] = ""
    note: Optional[str] = ""


@dataclass(frozen=True)
class ViolationRouteHandlers:
    update_violation_review_status: Callable[..., Any]
    get_violation_notice_payload: Callable[..., Any]
    get_violation_notice_html: Callable[..., Any]
    get_signed_telegram_notice_html: Callable[..., Any]
    get_telegram_notice_payload: Callable[..., Any]
    get_violation_review_dashboard: Callable[..., Any]


def _render_notice_html(row: Any, notice: dict[str, Any], status_labels: dict[str, str]) -> str:
    vehicle_img = (
        f"<img src='data:image/jpeg;base64,{notice['vehicle_image_b64']}' alt='vehicle evidence' />"
        if notice.get("vehicle_image_b64")
        else "<div class='empty'>Không có ảnh toàn xe</div>"
    )
    plate_img = (
        f"<img src='data:image/jpeg;base64,{notice['plate_image_b64']}' alt='plate evidence' />"
        if notice.get("plate_image_b64")
        else "<div class='empty'>Không có ảnh crop biển</div>"
    )
    status_label = status_labels.get(str(notice["review_status"]), str(notice["review_status"]))
    rows = [
        ("Mã hồ sơ", notice["case_code"]),
        ("Detection ID", int(row.id)),
        ("Track ID", row.track_id if row.track_id is not None else "Chưa có"),
        ("Biển số", notice["license_plate"]),
        ("Loại phương tiện", notice["vehicle_type"]),
        ("Hành vi vi phạm", notice["violation_type"]),
        ("Thời gian", notice["timestamp"]),
        ("Camera", notice["camera_id"]),
        ("Mức phạt dự kiến", notice["fine_amount"]),
        ("Căn cứ pháp lý", notice["legal_basis"]),
        ("Trạng thái xử lý", status_label),
        ("Người duyệt", notice["reviewed_by"] or "Chưa có"),
        ("Ghi chú", notice["review_note"] or "Không có"),
        ("Chủ phương tiện", notice["owner_name"] or "Chưa xác định"),
        ("Điện thoại", notice["owner_phone"] or "Chưa có"),
        ("Địa chỉ", notice["owner_address"] or "Chưa có"),
    ]
    rows_html = "".join(
        f"<tr><th>{html.escape(label)}</th><td>{html.escape(str(value))}</td></tr>"
        for label, value in rows
    )
    return f"""
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Biên bản vi phạm {html.escape(str(notice['case_code']))}</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: Arial, sans-serif; color: #0f172a; background: #f8fafc; }}
    .page {{ width: min(1120px, 100%); margin: 0 auto; padding: 28px; }}
    header {{ display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 14px; }}
    h1 {{ margin: 0; font-size: 24px; }}
    h2 {{ margin: 0 0 12px; font-size: 16px; }}
    .muted {{ color: #64748b; font-size: 13px; }}
    .badges {{ display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }}
    .status {{ border: 1px solid #cbd5e1; border-radius: 999px; padding: 8px 12px; font-size: 13px; font-weight: 700; background: #fff; white-space: nowrap; }}
    .demo {{ border-color: #fbbf24; background: #fffbeb; color: #92400e; }}
    .demo-note {{ margin-top: 16px; border: 1px solid #fde68a; border-radius: 12px; padding: 12px 14px; background: #fffbeb; color: #78350f; font-size: 13px; line-height: 1.55; }}
    .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 22px 0; }}
    .panel {{ border: 1px solid #dbe3ef; border-radius: 12px; background: #fff; padding: 14px; }}
    .media {{ display: flex; min-height: 260px; align-items: center; justify-content: center; overflow: hidden; border-radius: 10px; background: #020617; }}
    img {{ max-width: 100%; max-height: 420px; object-fit: contain; }}
    table {{ width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dbe3ef; }}
    th, td {{ border: 1px solid #dbe3ef; padding: 10px; text-align: left; vertical-align: top; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }}
    th {{ width: 210px; background: #f1f5f9; }}
    .actions {{ display: flex; justify-content: flex-end; margin-top: 18px; }}
    button {{ width: auto; border: 0; border-radius: 10px; padding: 12px 16px; background: #0f172a; color: #fff; font-weight: 700; cursor: pointer; }}
    .footnote {{ margin-top: 14px; color: #64748b; font-size: 12px; line-height: 1.5; }}
    @media (max-width: 720px) {{
      .page {{ padding: 16px 12px 28px; }}
      header {{ display: block; }}
      h1 {{ font-size: 20px; line-height: 1.3; }}
      .badges {{ justify-content: flex-start; margin-top: 12px; }}
      .grid {{ grid-template-columns: 1fr; gap: 12px; margin: 16px 0; }}
      .media {{ min-height: 190px; }}
      img {{ max-height: 320px; }}
      table, tbody, tr, th, td {{ display: block; width: 100%; }}
      table {{ border: 0; background: transparent; }}
      tr {{ margin-bottom: 9px; overflow: hidden; border: 1px solid #dbe3ef; border-radius: 10px; background: #fff; }}
      th, td {{ border: 0; }}
      th {{ padding-bottom: 3px; color: #475569; }}
      td {{ padding-top: 3px; font-weight: 600; }}
      .actions {{ position: sticky; bottom: 8px; }}
      button {{ width: 100%; box-shadow: 0 8px 24px rgba(15, 23, 42, .22); }}
    }}
    @media print {{ body {{ background: #fff; }} .page {{ width: 100%; padding: 0; }} .actions, .demo-note {{ display: none; }} }}
  </style>
</head>
<body>
  <main class="page">
    <header>
      <div>
        <h1>Biên bản / hồ sơ vi phạm giao thông</h1>
        <p class="muted">RoadAI Smart Traffic · Sinh từ bản ghi #{int(notice['id'])} · {html.escape(str(notice['case_code']))}</p>
      </div>
      <div class="badges">
        <div class="status demo">DỮ LIỆU MÔ PHỎNG</div>
        <div class="status">{html.escape(status_label)}</div>
      </div>
    </header>
    <div class="demo-note"><strong>Lưu ý:</strong> Thông tin chủ phương tiện trong bản demo được sinh giả lập để minh họa quy trình nghiệp vụ. Ảnh xe, ảnh crop biển và kết quả OCR lấy từ bản ghi của hệ thống.</div>
    <div class="grid">
      <section class="panel"><h2>Ảnh toàn xe</h2><div class="media">{vehicle_img}</div></section>
      <section class="panel"><h2>Ảnh crop biển số</h2><div class="media">{plate_img}</div></section>
    </div>
    <table><tbody>{rows_html}</tbody></table>
    <p class="footnote">Mức phạt và căn cứ hiển thị phục vụ minh họa, cần được người có thẩm quyền đối chiếu trước khi xử lý chính thức.</p>
    <div class="actions"><button onclick="window.print()">In / lưu PDF</button></div>
  </main>
</body>
</html>
"""


def register_violation_routes(
    app: Any,
    *,
    detection_model: Any,
    get_db_dependency: Callable[..., Any],
    require_operator_dependency: Callable[..., Any],
    require_any_role_dependency: Callable[..., Any],
    require_chatbot_or_user_dependency: Callable[..., Any],
    require_signed_chatbot_notice_dependency: Callable[..., Any],
    violation_notice_response_model: Any,
    normalize_review_status: Callable[[str], str],
    detection_has_complete_evidence: Callable[[Any], bool],
    serialize_detection: Callable[[Any], dict[str, Any]],
    build_violation_notice: Callable[[Any], dict[str, Any]],
    effective_review_status: Callable[[Any], str],
    now_provider: Callable[[], datetime],
    review_status_labels: dict[str, str],
) -> ViolationRouteHandlers:
    @app.patch(
        "/api/violations/{detection_id}/review",
        dependencies=[Depends(require_operator_dependency)],
    )
    def update_violation_review_status(
        detection_id: int,
        payload: ViolationReviewUpdate,
        db: Session = Depends(get_db_dependency),
    ) -> dict[str, Any]:
        row = db.query(detection_model).filter(detection_model.id == detection_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Detection not found")
        status = normalize_review_status(payload.status)
        if status in {"confirmed", "notice_exported", "notified", "resolved"} and not detection_has_complete_evidence(row):
            raise HTTPException(
                status_code=409,
                detail="Hồ sơ chưa có đủ cặp ảnh toàn xe và crop biển số; không thể duyệt hoặc lập biên bản.",
            )
        now = now_provider()
        row.review_status = status
        row.review_note = str(payload.note or "").strip()
        if status in {"confirmed", "notice_exported", "notified", "resolved", "rejected"}:
            row.reviewed_by = str(payload.operator or "").strip() or row.reviewed_by or "operator"
            row.reviewed_at = row.reviewed_at or now
        if status == "resolved":
            row.resolved_at = now
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"ok": True, "item": serialize_detection(row), "notice": build_violation_notice(row)}

    @app.get(
        "/api/violations/{detection_id}/notice",
        response_model=violation_notice_response_model,
        dependencies=[Depends(require_any_role_dependency)],
    )
    def get_violation_notice_payload(
        detection_id: int,
        db: Session = Depends(get_db_dependency),
    ) -> Any:
        row = db.query(detection_model).filter(detection_model.id == detection_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Detection not found")
        if not detection_has_complete_evidence(row):
            raise HTTPException(status_code=409, detail="Hồ sơ chưa có đủ cặp ảnh toàn xe và crop biển số.")
        return violation_notice_response_model(**build_violation_notice(row))

    @app.get(
        "/api/violations/{detection_id}/notice.html",
        response_class=HTMLResponse,
        dependencies=[Depends(require_any_role_dependency)],
    )
    def get_violation_notice_html(
        detection_id: int,
        db: Session = Depends(get_db_dependency),
    ) -> HTMLResponse:
        row = db.query(detection_model).filter(detection_model.id == detection_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Detection not found")
        if not detection_has_complete_evidence(row):
            raise HTTPException(status_code=409, detail="Hồ sơ chưa có đủ cặp ảnh toàn xe và crop biển số.")
        notice = build_violation_notice(row)
        return HTMLResponse(content=_render_notice_html(row, notice, review_status_labels))

    @app.get(
        "/api/telegram/notice/{detection_id}.html",
        response_class=HTMLResponse,
        dependencies=[Depends(require_signed_chatbot_notice_dependency)],
    )
    def get_signed_telegram_notice_html(
        detection_id: int,
        db: Session = Depends(get_db_dependency),
    ) -> HTMLResponse:
        return get_violation_notice_html(detection_id=detection_id, db=db)

    @app.get(
        "/api/telegram/notice/{detection_id}",
        response_model=violation_notice_response_model,
        dependencies=[Depends(require_chatbot_or_user_dependency)],
    )
    def get_telegram_notice_payload(
        detection_id: int,
        db: Session = Depends(get_db_dependency),
    ) -> Any:
        return get_violation_notice_payload(detection_id=detection_id, db=db)

    @app.get(
        "/api/violations/review-dashboard",
        dependencies=[Depends(require_any_role_dependency)],
    )
    def get_violation_review_dashboard(
        minutes: int = Query(default=1440, ge=1, le=10080),
        db: Session = Depends(get_db_dependency),
    ) -> dict[str, Any]:
        cutoff = now_provider() - timedelta(minutes=minutes)
        rows = (
            db.query(detection_model)
            .filter(detection_model.timestamp >= cutoff)
            .order_by(detection_model.timestamp.desc(), detection_model.id.desc())
            .limit(1000)
            .all()
        )
        status_counts: dict[str, int] = {}
        camera_rows: dict[str, dict[str, Any]] = {}
        total_confidence = 0.0
        confidence_count = 0
        for row in rows:
            status = effective_review_status(row)
            status_counts[status] = status_counts.get(status, 0) + 1
            camera = row.camera_id or "unknown"
            bucket = camera_rows.setdefault(camera, {
                "total": 0, "pending": 0, "confirmed": 0, "resolved": 0,
                "needs_review": 0, "ocr_total": 0.0, "ocr_count": 0,
            })
            bucket["total"] += 1
            if status == "pending":
                bucket["pending"] += 1
            if status in {"confirmed", "notice_exported", "notified"}:
                bucket["confirmed"] += 1
            if status == "resolved":
                bucket["resolved"] += 1
            if float(row.ocr_score or 0.0) < 0.85 or not str(row.plate_number or "").strip():
                bucket["needs_review"] += 1
            if row.ocr_score:
                bucket["ocr_total"] += float(row.ocr_score or 0.0)
                bucket["ocr_count"] += 1
                total_confidence += float(row.ocr_score or 0.0)
                confidence_count += 1
        cameras = []
        for camera, item in sorted(camera_rows.items()):
            avg = item["ocr_total"] / item["ocr_count"] if item["ocr_count"] else 0.0
            cameras.append({**item, "camera_id": camera, "avg_ocr_score": round(avg, 4)})
        return {
            "generated_at": now_provider().isoformat(),
            "window_minutes": minutes,
            "total": len(rows),
            "status_counts": status_counts,
            "pending": status_counts.get("pending", 0),
            "confirmed": sum(status_counts.get(key, 0) for key in ["confirmed", "notice_exported", "notified"]),
            "resolved": status_counts.get("resolved", 0),
            "rejected": status_counts.get("rejected", 0),
            "avg_ocr_score": round(total_confidence / confidence_count, 4) if confidence_count else 0.0,
            "cameras": cameras,
        }

    return ViolationRouteHandlers(
        update_violation_review_status=update_violation_review_status,
        get_violation_notice_payload=get_violation_notice_payload,
        get_violation_notice_html=get_violation_notice_html,
        get_signed_telegram_notice_html=get_signed_telegram_notice_html,
        get_telegram_notice_payload=get_telegram_notice_payload,
        get_violation_review_dashboard=get_violation_review_dashboard,
    )
