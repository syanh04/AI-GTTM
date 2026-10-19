import random
from datetime import datetime, timedelta
from typing import List, Dict, Any
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
try:
    from ..database import get_db, Detection, TrafficEvent
    from ..analytics.lane_config import (
        LaneConfigValidationError,
        get_lane_configs,
        save_lane_configs,
        validate_lane_config,
    )
    from ..analytics.lane_heatmap import (
        aggregate_lane_heatmap_grid,
        aggregate_lane_stats,
        parse_time_range,
    )
    from ..analytics.diagnostics import build_lane_analytics_diagnostics
except ImportError:
    from database import get_db, Detection, TrafficEvent
    from analytics.lane_config import (
        LaneConfigValidationError,
        get_lane_configs,
        save_lane_configs,
        validate_lane_config,
    )
    from analytics.lane_heatmap import (
        aggregate_lane_heatmap_grid,
        aggregate_lane_stats,
        parse_time_range,
    )
    from analytics.diagnostics import build_lane_analytics_diagnostics

router = APIRouter()


def _serialize_traffic_event(row: TrafficEvent) -> Dict[str, Any]:
    return {
        "id": row.id,
        "event_type": row.event_type,
        "vehicle_id": row.vehicle_id,
        "affected_vehicle_id": row.affected_vehicle_id,
        "from_lane": row.from_lane,
        "to_lane": row.to_lane,
        "risk_level": row.risk_level,
        "risk_score": row.risk_score,
        "pixel_ttc_estimate": row.pixel_ttc_estimate,
        "ttc_seconds": row.ttc_seconds,
        "gap_px": row.gap_px,
        "gap_m": row.gap_m,
        "timestamp": row.timestamp.isoformat() if row.timestamp else None,
        "snapshot_path": row.snapshot_path,
    }


def _parse_event_datetime(value: str) -> datetime:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="since must be an ISO datetime") from exc


def _query_cut_in_events(
    db: Session,
    camera_id: str,
    start: str | None = None,
    end: str | None = None,
    risk_level: str | None = None,
    since: str | None = None,
    limit: int = 100,
) -> Dict[str, Any]:
    normalized_camera_id = str(camera_id or "").strip()
    if not normalized_camera_id:
        raise HTTPException(status_code=400, detail="camera_id is required")

    limit = max(1, min(int(limit or 100), 500))
    query = (
        db.query(TrafficEvent)
        .filter(TrafficEvent.camera_id == normalized_camera_id)
        .filter(TrafficEvent.event_type == "cut_in")
    )

    try:
        if since:
            since_dt = _parse_event_datetime(since)
            query = query.filter(TrafficEvent.timestamp > since_dt)
        else:
            start_dt, end_dt = parse_time_range(start, end)
            query = query.filter(TrafficEvent.timestamp >= start_dt).filter(TrafficEvent.timestamp <= end_dt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if risk_level:
        query = query.filter(TrafficEvent.risk_level == risk_level)

    rows = query.order_by(TrafficEvent.timestamp.desc()).limit(limit).all()
    return {
        "camera_id": normalized_camera_id,
        "calibrated": False,
        "risk_unit_note": "pixel_ttc_estimate là ước tính theo pixel, không phải TTC vật lý.",
        "items": [_serialize_traffic_event(row) for row in rows],
    }



@router.get("/diagnostics")
def api_get_lane_analytics_diagnostics(
    camera_id: str = Query(..., min_length=1, description="Camera id, for example CAM_01"),
    db: Session = Depends(get_db),
):
    normalized_camera_id = str(camera_id or "").strip()
    if not normalized_camera_id:
        raise HTTPException(status_code=400, detail="camera_id is required")
    try:
        return build_lane_analytics_diagnostics(db, normalized_camera_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="failed to build lane analytics diagnostics") from exc


@router.get("/lane-config")
def api_get_lane_config(
    camera_id: str = Query(..., min_length=1, description="Camera id, for example CAM_01"),
    db: Session = Depends(get_db),
):
    normalized_camera_id = str(camera_id or "").strip()
    if not normalized_camera_id:
        raise HTTPException(status_code=400, detail="camera_id is required")
    return {
        "camera_id": normalized_camera_id,
        "lanes": get_lane_configs(db, normalized_camera_id),
    }


@router.put("/lane-config/{camera_id}")
def api_save_lane_config(
    camera_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    normalized_camera_id = str(camera_id or "").strip()
    if not normalized_camera_id:
        raise HTTPException(status_code=400, detail="camera_id is required")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="payload must be an object")

    lanes = payload.get("lanes")
    if not isinstance(lanes, list):
        raise HTTPException(status_code=400, detail="lanes must be a list")

    try:
        saved = save_lane_configs(db, normalized_camera_id, lanes)
    except LaneConfigValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="failed to save lane config") from exc

    return {
        "camera_id": normalized_camera_id,
        "lanes": saved,
    }


@router.get("/lane-heatmap")
def api_get_lane_heatmap(
    camera_id: str = Query(..., min_length=1, description="Camera id, for example CAM_01"),
    start: str | None = Query(default=None, description="ISO datetime start"),
    end: str | None = Query(default=None, description="ISO datetime end"),
    lane_id: str | None = Query(default=None),
    class_name: str | None = Query(default=None),
    grid_size: int = Query(default=32, ge=1),
    db: Session = Depends(get_db),
):
    normalized_camera_id = str(camera_id or "").strip()
    if not normalized_camera_id:
        raise HTTPException(status_code=400, detail="camera_id is required")

    try:
        start_dt, end_dt = parse_time_range(start, end)
        return aggregate_lane_heatmap_grid(
            db,
            normalized_camera_id,
            start_dt,
            end_dt,
            lane_id=lane_id,
            class_name=class_name,
            grid_size=grid_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="failed to build lane heatmap") from exc


@router.get("/lane-stats")
def api_get_lane_stats(
    camera_id: str = Query(..., min_length=1, description="Camera id, for example CAM_01"),
    start: str | None = Query(default=None, description="ISO datetime start"),
    end: str | None = Query(default=None, description="ISO datetime end"),
    lane_id: str | None = Query(default=None),
    class_name: str | None = Query(default=None),
    bucket_seconds: int = Query(default=60, ge=1),
    db: Session = Depends(get_db),
):
    normalized_camera_id = str(camera_id or "").strip()
    if not normalized_camera_id:
        raise HTTPException(status_code=400, detail="camera_id is required")

    try:
        start_dt, end_dt = parse_time_range(start, end)
        return aggregate_lane_stats(
            db,
            normalized_camera_id,
            start_dt,
            end_dt,
            lane_id=lane_id,
            class_name=class_name,
            bucket_seconds=bucket_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="failed to build lane stats") from exc


@router.get("/cut-in-events")
def api_get_cut_in_events(
    camera_id: str = Query(..., min_length=1, description="Camera id, for example CAM_01"),
    start: str | None = Query(default=None, description="ISO datetime start"),
    end: str | None = Query(default=None, description="ISO datetime end"),
    risk_level: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return _query_cut_in_events(db, camera_id, start=start, end=end, risk_level=risk_level, limit=limit)


@router.get("/cut-in-events/recent")
def api_get_recent_cut_in_events(
    camera_id: str = Query(..., min_length=1, description="Camera id, for example CAM_01"),
    since: str | None = Query(default=None, description="ISO datetime cursor"),
    risk_level: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return _query_cut_in_events(db, camera_id, since=since, risk_level=risk_level, limit=limit)

# ---------------------------------------------------------------------------
# Simulation data helpers
# ---------------------------------------------------------------------------

_SIM_HOURS = [f"{h:02d}:00" for h in range(7, 20)]  # 07:00 – 19:00
_CAM_KEYS = ["baTrier", "langHa", "tayHo", "nguyenHue", "tranHungDao", "xuanPhuong"]
_VT_NAMES = ["car", "moto", "bus", "truck"]


def _rand(base: int, spread: int = 0) -> int:
    s = spread or max(1, base // 4)
    return max(0, base + random.randint(-s, s))


def _generate_sim_data() -> Dict[str, Any]:
    """Dynamically randomised fake analytics so charts look alive on every poll."""
    chart_data = []
    for hour in _SIM_HOURS:
        hour_int = int(hour[:2])
        # Traffic peaks at rush hours (7-9, 17-19)
        peak = hour_int in (7, 8, 9, 17, 18, 19)
        base = 220 if peak else 110

        row: Dict[str, Any] = {"time": hour}
        for cam in _CAM_KEYS:
            total = _rand(base, base // 3)
            row[cam] = total
            for vt in _VT_NAMES:
                row[f"{cam}_{vt}"] = _rand(total // len(_VT_NAMES), 10)

        total_violations = _rand(30 if peak else 10, 8)
        row["violations"] = total_violations
        # Violation percentages (must roughly sum to ~100)
        rl = _rand(35, 10)
        sp = _rand(30, 10)
        wl = _rand(20, 8)
        nh = max(0, 100 - rl - sp - wl + _rand(0, 5))
        row["redLight"] = rl
        row["speeding"] = sp
        row["wrongLane"] = wl
        row["noHelmet"] = nh
        chart_data.append(row)

    # Vehicle composition pie
    composition = [
        {"name": "Ô tô",    "value": _rand(420, 60), "fill": "var(--vehicle-car)"},
        {"name": "Xe máy",  "value": _rand(780, 80), "fill": "var(--vehicle-motorcycle)"},
        {"name": "Xe buýt", "value": _rand(95,  20), "fill": "var(--vehicle-bus)"},
        {"name": "Xe tải",  "value": _rand(130, 30), "fill": "var(--vehicle-truck)"},
    ]

    total_traffic = sum(
        sum(row.get(cam, 0) for cam in _CAM_KEYS) for row in chart_data
    )
    total_violations = sum(row["violations"] for row in chart_data)
    compliance = round(
        ((total_traffic - total_violations) / total_traffic * 100) if total_traffic else 100,
        1
    )
    hotspot_cam = random.choice(["Bà Triệu", "Láng Hạ", "Tây Hồ", "Nguyễn Huệ"])

    violation_composition = [
        {"name": "Vượt đèn đỏ", "value": _rand(35, 8), "fill": "#ef4444"},
        {"name": "Quá tốc độ", "value": _rand(30, 7), "fill": "#f97316"},
        {"name": "Sai làn", "value": _rand(22, 6), "fill": "#eab308"},
        {"name": "Không mũ bảo hiểm", "value": _rand(13, 5), "fill": "#8b5cf6"},
    ]
    top_hotspots = [
        {"camera_id": "CAM_01", "name": "Bà Triệu", "violations": _rand(58, 12)},
        {"camera_id": "CAM_02", "name": "Láng Hạ", "violations": _rand(46, 10)},
        {"camera_id": "CAM_03", "name": "Tây Hồ", "violations": _rand(34, 8)},
        {"camera_id": "CAM_04", "name": "Nguyễn Huệ", "violations": _rand(27, 7)},
    ]

    return {
        "chart_data": chart_data,
        "vehicle_composition": composition,
        "violation_composition": violation_composition,
        "top_hotspots": top_hotspots,
        "stats": {
            "total_traffic": total_traffic,
            "total_violations": total_violations,
            "compliance_rate": compliance,
            "hotspot": hotspot_cam,
        },
    }


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/stats")
def get_analytics_stats(
    is_simulated: bool = Query(default=False, description="If true, return dynamic fake data"),
    selected_date: str = Query(default="", description="Optional YYYY-MM-DD reporting date"),
    db: Session = Depends(get_db),
):
    """
    Trả về dữ liệu thống kê tổng hợp cho Dashboard Analytics (Recharts).

    - is_simulated=true  → dynamic randomised fake data (charts look alive)
    - is_simulated=false → real aggregated data from the detections table (24 h)
    """
    if is_simulated:
        return _generate_sim_data()

    # ---- REAL DATA BRANCH (unchanged logic) --------------------------------
    try:
        if selected_date:
            try:
                start_time = datetime.fromisoformat(selected_date)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="selected_date must be YYYY-MM-DD") from exc
            end_time = start_time + timedelta(days=1)
        else:
            end_time = datetime.now()
            start_time = end_time - timedelta(hours=24)

        # --- A. Traffic Trends ---
        trends_query = (
            db.query(
                func.strftime('%H:%M', Detection.timestamp).label('time'),
                Detection.camera_id,
                Detection.vehicle_type,
                func.count(Detection.id).label('count')
            )
            .filter(Detection.timestamp >= start_time)
            .filter(Detection.timestamp < end_time)
            .filter(Detection.is_simulated == 0)
            .group_by('time', Detection.camera_id, Detection.vehicle_type)
            .all()
        )

        trends_map: Dict[str, Dict[str, Any]] = {}
        for time_str, camera_id, v_type, count in trends_query:
            if not time_str:
                continue
            if time_str not in trends_map:
                trends_map[time_str] = {
                    "time": time_str,
                    "baTrier": 0, "langHa": 0, "tayHo": 0,
                    "nguyenHue": 0, "tranHungDao": 0, "xuanPhuong": 0,
                    "violations": 0, "redLight": 0, "speeding": 0,
                    "wrongLane": 0, "noHelmet": 0,
                }
                for cam in _CAM_KEYS:
                    for vt in _VT_NAMES:
                        trends_map[time_str][f"{cam}_{vt}"] = 0

            cam_key_map = {
                "CAM_01": "baTrier", "CAM_02": "langHa", "CAM_03": "tayHo",
                "CAM_04": "nguyenHue", "CAM_05": "tranHungDao", "CAM_06": "xuanPhuong",
            }
            key = cam_key_map.get(camera_id)
            if key:
                trends_map[time_str][key] += count
                vt_key = f"{key}_{v_type.lower()}"
                if vt_key in trends_map[time_str]:
                    trends_map[time_str][vt_key] += count

        # --- B. Violations ---
        violations_query = (
            db.query(
                func.strftime('%H:%M', Detection.timestamp).label('time'),
                Detection.violation_type,
                func.count(Detection.id).label('count')
            )
            .filter(Detection.timestamp >= start_time)
            .filter(Detection.timestamp < end_time)
            .filter(Detection.is_simulated == 0)
            .filter(Detection.violation_type.isnot(None))
            .filter(Detection.violation_type != "")
            .group_by('time', Detection.violation_type)
            .all()
        )

        violation_totals: Dict[str, int] = {}
        for time_str, v_type, count in violations_query:
            violation_key = v_type or "Unclassified"
            violation_totals[violation_key] = violation_totals.get(violation_key, 0) + count
            if time_str in trends_map:
                trends_map[time_str]["violations"] += count
                if v_type == "Vượt đèn đỏ":
                    trends_map[time_str]["redLight"] += count
                elif v_type == "Chạy quá tốc độ":
                    trends_map[time_str]["speeding"] += count
                elif v_type == "Lấn làn đường":
                    trends_map[time_str]["wrongLane"] += count
                elif v_type == "Không đội mũ bảo hiểm":
                    trends_map[time_str]["noHelmet"] += count

        final_trends = []
        for t in sorted(trends_map.keys()):
            data = trends_map[t]
            total_v = data["violations"]
            if total_v > 0:
                data["redLight"] = int((data["redLight"] / total_v) * 100)
                data["speeding"] = int((data["speeding"] / total_v) * 100)
                data["wrongLane"] = int((data["wrongLane"] / total_v) * 100)
                data["noHelmet"] = int((data["noHelmet"] / total_v) * 100)
            final_trends.append(data)

        # --- C. Vehicle Composition ---
        comp_query = (
            db.query(Detection.vehicle_type, func.count(Detection.id).label('count'))
            .filter(Detection.timestamp >= start_time)
            .filter(Detection.timestamp < end_time)
            .filter(Detection.is_simulated == 0)
            .group_by(Detection.vehicle_type)
            .all()
        )

        color_map = {
            "car": "var(--vehicle-car)", "truck": "var(--vehicle-truck)",
            "moto": "var(--vehicle-motorcycle)", "bus": "var(--vehicle-bus)",
        }
        name_map = {"car": "Ô tô", "truck": "Xe tải", "moto": "Xe máy", "bus": "Xe buýt"}

        name_map = {
            "car": "\u00d4 t\u00f4",
            "truck": "Xe t\u1ea3i",
            "moto": "Xe m\u00e1y",
            "bus": "Xe bu\u00fdt",
        }

        composition = [
            {"name": name_map[vt], "value": cnt, "fill": color_map.get(vt, "#8884d8")}
            for vt, cnt in comp_query if vt in name_map
        ]

        total_count = (
            db.query(func.count(Detection.id))
            .filter(Detection.timestamp >= start_time)
            .filter(Detection.timestamp < end_time)
            .filter(Detection.is_simulated == 0)
            .scalar() or 0
        )
        total_violations = (
            db.query(func.count(Detection.id))
            .filter(Detection.timestamp >= start_time)
            .filter(Detection.timestamp < end_time)
            .filter(Detection.is_simulated == 0)
            .filter(Detection.violation_type.isnot(None))
            .filter(Detection.violation_type != "")
            .scalar() or 0
        )
        compliance_rate = (
            round(((total_count - total_violations) / total_count) * 100, 1)
            if total_count > 0 else 100.0
        )
        hotspot_query = (
            db.query(Detection.camera_id, func.count(Detection.id).label("count"))
            .filter(Detection.timestamp >= start_time)
            .filter(Detection.timestamp < end_time)
            .filter(Detection.is_simulated == 0)
            .filter(Detection.violation_type.isnot(None))
            .filter(Detection.violation_type != "")
            .group_by(Detection.camera_id)
            .order_by(func.count(Detection.id).desc())
            .all()
        )
        camera_name_map = {
            "CAM_01": "Bà Triệu",
            "CAM_02": "Láng Hạ",
            "CAM_03": "Tây Hồ",
            "CAM_04": "Nguyễn Huệ",
            "CAM_05": "Trần Hưng Đạo",
            "CAM_06": "Xuân Phương",
        }
        top_hotspots = [
            {
                "camera_id": camera_id,
                "name": camera_name_map.get(camera_id, camera_id),
                "violations": count,
            }
            for camera_id, count in hotspot_query[:5]
        ]
        violation_color_map = {
            "Vượt đèn đỏ": "#ef4444",
            "Chạy quá tốc độ": "#f97316",
            "Lấn làn đường": "#eab308",
            "Không đội mũ bảo hiểm": "#0ea5e9",
        }
        violation_composition = [
            {
                "name": violation_type,
                "value": count,
                "fill": violation_color_map.get(violation_type, "#64748b"),
            }
            for violation_type, count in violation_totals.items()
        ]

        return {
            "chart_data": final_trends,
            "vehicle_composition": composition,
            "violation_composition": violation_composition,
            "top_hotspots": top_hotspots,
            "stats": {
                "total_traffic": total_count,
                "total_violations": total_violations,
                "compliance_rate": compliance_rate,
                "hotspot": top_hotspots[0]["name"] if top_hotspots else "N/A",
            },
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR in analytics: {e}")
        raise e
