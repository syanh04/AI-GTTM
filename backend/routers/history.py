"""Detection history and smart-search routes."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable

from fastapi import Depends, Query
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class HistoryRouteHandlers:
    get_history: Callable[..., Any]
    get_detections_alias: Callable[..., Any]
    get_history_updates: Callable[..., Any]
    smart_search: Callable[..., Any]


def register_history_routes(
    app: Any,
    *,
    detection_model: Any,
    get_db_dependency: Callable[..., Any],
    require_any_role_dependency: Callable[..., Any],
    history_response_model: Any,
    history_updates_response_model: Any,
    smart_search_response_model: Any,
    filter_current_runtime_session: Callable[..., Any],
    runtime_session_windows: Callable[..., Any],
    filter_complete_evidence_paths: Callable[..., Any],
    detection_has_complete_evidence: Callable[..., bool],
    serialize_detection: Callable[[Any], dict[str, Any]],
    normalize_query_text: Callable[[str], str],
    now_provider: Callable[[], datetime],
) -> HistoryRouteHandlers:
    """Register routes while keeping application-owned dependencies explicit."""

    @app.get(
        "/api/history",
        response_model=history_response_model,
        dependencies=[Depends(require_any_role_dependency)],
    )
    def get_history(
        limit: int = 100,
        camera_id: str = Query(default=""),
        source_mode: str = Query(default=""),
        current_only: bool = Query(default=False),
        complete_evidence_only: bool = Query(default=True),
        start: str = Query(default=""),
        end: str = Query(default=""),
        date_from: str = Query(default=""),
        date_to: str = Query(default=""),
        violation: str = Query(default=""),
        status: str = Query(default=""),
        vehicle_type: str = Query(default=""),
        ocr_lt: float = Query(default=0.0),
        q: str = Query(default=""),
        db: Session = Depends(get_db_dependency),
    ) -> Any:
        limit = max(1, min(limit, 1000))
        query = db.query(detection_model)
        normalized_source = str(source_mode or "").strip().lower()
        normalized_camera = str(camera_id or "").strip()
        if current_only:
            query = filter_current_runtime_session(
                query,
                source_mode=normalized_source,
                camera_id=normalized_camera,
            )
        start_val = start or date_from
        end_val = end or date_to
        try:
            if start_val:
                query = query.filter(detection_model.timestamp >= datetime.fromisoformat(start_val.replace("Z", "+00:00")))
            if end_val:
                query = query.filter(detection_model.timestamp <= datetime.fromisoformat(end_val.replace("Z", "+00:00")))
        except ValueError as exc:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="start/end must be ISO datetime values") from exc
        if normalized_source == "rtsp":
            query = query.filter(detection_model.camera_id == (normalized_camera or "CAM_01"))
        elif normalized_camera:
            query = query.filter(detection_model.camera_id == normalized_camera)

        if violation:
            if violation == "any":
                query = query.filter(detection_model.violation_type.isnot(None), detection_model.violation_type != "")
            elif violation == "none":
                query = query.filter((detection_model.violation_type.is_(None)) | (detection_model.violation_type == ""))
            else:
                query = query.filter(detection_model.violation_type == violation)

        if status:
            query = query.filter(detection_model.review_status == status)

        if vehicle_type:
            query = query.filter(detection_model.vehicle_type == vehicle_type)

        if ocr_lt > 0.0:
            lt_val = ocr_lt / 100.0 if ocr_lt > 1.0 else ocr_lt
            query = query.filter(detection_model.ocr_score < lt_val)

        if q:
            query = query.filter(detection_model.plate_number.ilike(f"%{q.strip()}%"))

        if complete_evidence_only:
            query = filter_complete_evidence_paths(query)
        rows = (
            query.order_by(detection_model.timestamp.desc())
            .limit(min(1000, max(limit, limit * 4)) if complete_evidence_only else limit)
            .all()
        )
        if complete_evidence_only:
            rows = [row for row in rows if detection_has_complete_evidence(row)][:limit]
        return history_response_model(items=[serialize_detection(row) for row in rows])

    @app.get(
        "/api/detections",
        response_model=history_response_model,
        dependencies=[Depends(require_any_role_dependency)],
    )
    def get_detections_alias(
        limit: int = 100,
        camera_id: str = Query(default=""),
        source_mode: str = Query(default=""),
        current_only: bool = Query(default=False),
        complete_evidence_only: bool = Query(default=True),
        start: str = Query(default=""),
        end: str = Query(default=""),
        date_from: str = Query(default=""),
        date_to: str = Query(default=""),
        violation: str = Query(default=""),
        status: str = Query(default=""),
        vehicle_type: str = Query(default=""),
        ocr_lt: float = Query(default=0.0),
        q: str = Query(default=""),
        db: Session = Depends(get_db_dependency),
    ) -> Any:
        return get_history(
            limit=limit,
            camera_id=camera_id,
            source_mode=source_mode,
            current_only=current_only,
            complete_evidence_only=complete_evidence_only,
            start=start,
            end=end,
            date_from=date_from,
            date_to=date_to,
            violation=violation,
            status=status,
            vehicle_type=vehicle_type,
            ocr_lt=ocr_lt,
            q=q,
            db=db,
        )

    @app.get(
        "/api/history/updates",
        response_model=history_updates_response_model,
        dependencies=[Depends(require_any_role_dependency)],
    )
    def get_history_updates(
        since: str = Query(default=""),
        since_id: int = Query(default=0, ge=0),
        limit: int = 100,
        camera_id: str = Query(default=""),
        source_mode: str = Query(default=""),
        current_only: bool = Query(default=False),
        complete_evidence_only: bool = Query(default=True),
        start: str = Query(default=""),
        end: str = Query(default=""),
        db: Session = Depends(get_db_dependency),
    ) -> Any:
        limit = max(1, min(limit, 500))
        query = db.query(detection_model)
        normalized_source = str(source_mode or "").strip().lower()
        normalized_camera = str(camera_id or "").strip()
        since_dt = None
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            except ValueError:
                since_dt = None

        if current_only:
            query = filter_current_runtime_session(
                query,
                source_mode=normalized_source,
                camera_id=normalized_camera,
            )
        try:
            if start:
                query = query.filter(detection_model.timestamp >= datetime.fromisoformat(start.replace("Z", "+00:00")))
            if end:
                query = query.filter(detection_model.timestamp <= datetime.fromisoformat(end.replace("Z", "+00:00")))
        except ValueError as exc:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="start/end must be ISO datetime values") from exc
        if normalized_source == "rtsp":
            query = query.filter(detection_model.camera_id == (normalized_camera or "CAM_01"))
        elif normalized_camera:
            query = query.filter(detection_model.camera_id == normalized_camera)
        if complete_evidence_only:
            query = filter_complete_evidence_paths(query)
        if since_dt is not None:
            query = query.filter(
                or_(
                    detection_model.last_seen_at > since_dt,
                    and_(detection_model.last_seen_at == since_dt, detection_model.id > since_id),
                )
            )

        rows = (
            query.order_by(detection_model.last_seen_at.asc(), detection_model.id.asc())
            .limit(min(2000, max(limit, limit * 4)) if complete_evidence_only else limit)
            .all()
        )
        if complete_evidence_only:
            rows = [row for row in rows if detection_has_complete_evidence(row)][:limit]
        items = [serialize_detection(row) for row in rows]
        if items:
            next_since = items[-1]["last_seen_at"]
        elif since:
            next_since = since
        elif current_only:
            windows = runtime_session_windows(source_mode=normalized_source, camera_id=normalized_camera)
            next_since = max(item["session_started_at"] for item in windows).isoformat()
        else:
            next_since = ""
        next_since_id = int(items[-1]["id"]) if items else since_id
        return history_updates_response_model(
            items=items,
            next_since=next_since,
            next_since_id=next_since_id,
        )

    @app.get(
        "/api/search/smart",
        response_model=smart_search_response_model,
        dependencies=[Depends(require_any_role_dependency)],
    )
    def smart_search(
        q: str = Query(default=""),
        limit: int = Query(default=10, ge=1, le=50),
        db: Session = Depends(get_db_dependency),
    ) -> Any:
        query = str(q or "").strip()
        normalized = normalize_query_text(query)
        compact = re.sub(r"[^A-Z0-9]", "", query.upper())
        today_start = now_provider().replace(hour=0, minute=0, second=0, microsecond=0)
        base = db.query(detection_model)
        if "hom nay" in normalized or "today" in normalized:
            base = base.filter(detection_model.timestamp >= today_start)

        camera_match = re.search(r"(?:camera|cam)\s*0?(\d+)", normalized)
        if camera_match:
            camera_id = f"CAM_{int(camera_match.group(1)):02d}"
            rows = (
                base.filter(func.upper(detection_model.camera_id) == camera_id)
                .filter(detection_model.violation_type.isnot(None))
                .filter(detection_model.violation_type != "")
                .order_by(detection_model.timestamp.desc(), detection_model.id.desc())
                .limit(limit)
                .all()
            )
            return smart_search_response_model(
                query=query,
                intent="camera_violation_count",
                answer=f"{camera_id} có {len(rows)} bản ghi vi phạm trong phạm vi truy vấn.",
                items=[serialize_detection(row) for row in rows],
            )

        plate_token = ""
        if len(compact) >= 6 and compact[:2].isdigit():
            plate_token = compact
        else:
            plate_match = re.search(r"\b\d{2}[A-Z]\d{3,6}\b", query.upper())
            if plate_match:
                plate_token = re.sub(r"[^A-Z0-9]", "", plate_match.group(0))

        if plate_token:
            compact_plate = func.upper(func.replace(func.replace(detection_model.plate_number, "-", ""), ".", ""))
            rows = (
                base.filter(compact_plate.like(f"%{plate_token}%"))
                .order_by(detection_model.timestamp.desc(), detection_model.id.desc())
                .limit(limit)
                .all()
            )
            if rows:
                latest = rows[0]
                answer = (
                    f"Tìm thấy {len(rows)} bản ghi liên quan biển {plate_token}. "
                    f"Gần nhất: {latest.camera_id or 'không rõ camera'}, "
                    f"{latest.violation_type or 'chưa ghi nhận vi phạm'}, OCR {float(latest.ocr_score or 0.0):.2f}."
                )
            else:
                answer = f"Không tìm thấy bản ghi cho biển {plate_token}."
            return smart_search_response_model(
                query=query,
                intent="plate_lookup",
                answer=answer,
                items=[serialize_detection(row) for row in rows],
            )

        prefix_match = re.search(r"\b(\d{2}[a-z]?)\b", normalized)
        if "tim xe" in normalized and prefix_match:
            prefix = prefix_match.group(1).upper()
            rows = (
                base.filter(func.upper(detection_model.plate_number).like(f"{prefix}%"))
                .order_by(detection_model.timestamp.desc(), detection_model.id.desc())
                .limit(limit)
                .all()
            )
            return smart_search_response_model(
                query=query,
                intent="plate_prefix_lookup",
                answer=f"Tìm thấy {len(rows)} xe/biển bắt đầu bằng {prefix}.",
                items=[serialize_detection(row) for row in rows],
            )

        if "nhieu nhat" in normalized or "top" in normalized:
            violation_filter = base.filter(detection_model.violation_type.isnot(None)).filter(detection_model.violation_type != "")
            if "den do" in normalized:
                violation_filter = violation_filter.filter(detection_model.violation_type.like("%đèn đỏ%"))
            rows = violation_filter.all()
            counts: dict[str, int] = {}
            latest_by_plate: dict[str, Any] = {}
            for row in rows:
                plate = re.sub(r"[^A-Z0-9]", "", str(row.plate_number or "").upper())
                if len(plate) < 6:
                    continue
                counts[plate] = counts.get(plate, 0) + 1
                latest_by_plate.setdefault(plate, row)
            top = sorted(counts.items(), key=lambda item: item[1], reverse=True)[:limit]
            items = []
            for plate, count in top:
                item = serialize_detection(latest_by_plate[plate])
                item["match_count"] = count
                items.append(item)
            leader = top[0] if top else None
            answer = (
                f"Biển {leader[0]} có số lượt phù hợp nhiều nhất: {leader[1]} lượt."
                if leader
                else "Chưa có dữ liệu phù hợp để xếp hạng."
            )
            return smart_search_response_model(
                query=query,
                intent="top_violation_plate",
                answer=answer,
                items=items,
            )

        rows = (
            base.filter(detection_model.violation_type.isnot(None))
            .filter(detection_model.violation_type != "")
            .order_by(detection_model.timestamp.desc(), detection_model.id.desc())
            .limit(limit)
            .all()
        )
        return smart_search_response_model(
            query=query,
            intent="recent_violations",
            answer=f"Mình chưa nhận diện được ý định cụ thể, đang hiển thị {len(rows)} vi phạm gần nhất.",
            items=[serialize_detection(row) for row in rows],
        )

    return HistoryRouteHandlers(
        get_history=get_history,
        get_detections_alias=get_detections_alias,
        get_history_updates=get_history_updates,
        smart_search=smart_search,
    )
