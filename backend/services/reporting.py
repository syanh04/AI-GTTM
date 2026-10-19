"""Reporting service generating CSV, Excel (.xlsx), and PDF reports and previews."""
from __future__ import annotations

import csv
import io
import os
import re
import urllib.parse
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import openpyxl
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    Image as RLImage,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

try:
    from ..database import Detection, User, _vn_now
    from ..services.evidence import resolve_runtime_image_path
except ImportError:
    from database import Detection, User, _vn_now
    from services.evidence import resolve_runtime_image_path

# Register Unicode fonts
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_REGULAR = os.path.join(BASE_DIR, "assets", "fonts", "Roboto-Regular.ttf")
FONT_BOLD = os.path.join(BASE_DIR, "assets", "fonts", "Roboto-Bold.ttf")

if os.path.exists(FONT_REGULAR):
    pdfmetrics.registerFont(TTFont("Roboto", FONT_REGULAR))
if os.path.exists(FONT_BOLD):
    pdfmetrics.registerFont(TTFont("Roboto-Bold", FONT_BOLD))

LOW_OCR_THRESHOLD = 90  # 90%

VEHICLE_TYPE_MAP = {
    "car": "Ô tô",
    "truck": "Xe tải",
    "moto": "Xe máy",
    "motor": "Xe máy",
    "motorcycle": "Xe máy",
    "bus": "Xe buýt",
}

REVIEW_STATUS_MAP = {
    "pending": "Chờ duyệt",
    "processed": "Đã xác nhận",
    "dismissed": "Bỏ qua",
    "sent": "Đã gửi",
}

DATA_EXPORT_HEADERS = [
    "STT",
    "Mã hồ sơ",
    "Thời gian",
    "Camera",
    "Biển số",
    "Biển số OCR gốc",
    "Đã sửa tay",
    "Độ tin cậy OCR (%)",
    "Số lần bỏ phiếu OCR",
    "Độ tin cậy nhận dạng xe (%)",
    "Loại xe",
    "Vi phạm",
    "Trạng thái xử lý",
    "Người duyệt",
    "Thời gian duyệt",
    "Ghi chú duyệt",
    "Mã theo dõi (Track ID)",
    "Nguồn dữ liệu",
    "Ảnh xe",
    "Ảnh biển số",
]


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
    if 0.0 < val <= 1.0:
        val = val * 100.0
    return int(round(val))


def escape_csv_cell(val: Any) -> str:
    s = str(val) if val is not None else ""
    if s and s[0] in ("=", "+", "-", "@"):
        s = "'" + s
    return s


def build_row_data(idx: int, r: Detection) -> List[Any]:
    vtype = VEHICLE_TYPE_MAP.get(str(r.vehicle_type or "").lower(), r.vehicle_type or "Không rõ")
    viol_name = r.violation_type if r.violation_type else "Không vi phạm"
    r_status = (
        REVIEW_STATUS_MAP.get(str(r.review_status or "").lower(), r.review_status or "Chờ duyệt")
        if r.violation_type
        else "Không áp dụng"
    )
    is_edited = "Có" if r.plate_edited_at else "Không"
    orig_plate = r.plate_number_original if r.plate_edited_at else ""
    source_name = "Mô phỏng" if r.is_simulated else "Thực tế"
    img_name = os.path.basename(r.image_path) if r.image_path else ""
    crop_name = os.path.basename(r.crop_path) if r.crop_path else "Chưa có ảnh biển"

    return [
        idx,
        case_code_for_detection(r),
        r.timestamp.strftime("%d/%m/%Y %H:%M:%S") if r.timestamp else "",
        r.camera_id or "CAM_01",
        r.plate_number or "Chưa rõ",
        orig_plate,
        is_edited,
        format_ocr_percent(r.ocr_score),
        r.vote_count or 0,
        int(round((r.confidence or 0.0) * 100)),
        vtype,
        viol_name,
        r_status,
        r.reviewed_by or "",
        r.reviewed_at.strftime("%d/%m/%Y %H:%M:%S") if r.reviewed_at else "",
        r.review_note or "",
        r.track_id or "",
        source_name,
        img_name,
        crop_name,
    ]


# ---------------------------------------------------------------------------
# CSV EXPORT & PREVIEW
# ---------------------------------------------------------------------------
def build_csv_content(
    query,
    params: Dict[str, Any],
    current_user: User,
    plain: bool = False,
    limit: int = 100000,
) -> Tuple[bytes, int, bool]:
    total_count = query.count()
    rows = query.limit(limit).all()
    is_truncated = total_count > limit

    output = io.StringIO()
    output.write("\ufeff")  # UTF-8 BOM
    writer = csv.writer(output, lineterminator="\r\n")

    if not plain:
        now_str = _vn_now().strftime("%d/%m/%Y %H:%M:%S")
        writer.writerow(["BÁO CÁO DỮ LIỆU GIÁM SÁT GIAO THÔNG"])
        writer.writerow(["Thời gian xuất:", now_str])
        writer.writerow(["Người xuất:", f"{current_user.username} ({current_user.role})"])
        writer.writerow(
            ["Khoảng thời gian dữ liệu:", f"{params.get('date_from') or 'Tất cả'} đến {params.get('date_to') or 'Tất cả'}"]
        )
        writer.writerow(["Bộ lọc Camera:", params.get("camera_id") or "Tất cả"])
        writer.writerow(["Bộ lọc Loại xe:", params.get("vehicle_type") or "Tất cả"])
        writer.writerow(["Bộ lọc Vi phạm:", params.get("violation") or "Tất cả"])
        writer.writerow(["Bộ lọc Trạng thái:", params.get("review_status") or "Tất cả"])
        writer.writerow(["Bộ lọc Ngưỡng OCR:", f"< {params.get('ocr_lt')}%" if params.get("ocr_lt") else "Tất cả"])
        writer.writerow(["Từ khóa tìm kiếm:", params.get("q") or "Không"])
        writer.writerow(["Tổng số bản ghi:", len(rows)])
        writer.writerow([])

    writer.writerow(DATA_EXPORT_HEADERS)

    for idx, r in enumerate(rows, 1):
        row_vals = build_row_data(idx, r)
        writer.writerow([escape_csv_cell(c) for c in row_vals])

    if is_truncated and not plain:
        writer.writerow([])
        writer.writerow(["Dữ liệu bị cắt ở 100.000 dòng, hãy thu hẹp bộ lọc"])

    return output.getvalue().encode("utf-8-sig"), total_count, is_truncated


def build_csv_preview_data(
    query,
    params: Dict[str, Any],
    current_user: User,
    limit: int = 50,
) -> Dict[str, Any]:
    total_count = query.count()
    rows = query.limit(limit).all()
    is_truncated = total_count > 100000

    now_str = _vn_now().strftime("%d/%m/%Y %H:%M:%S")
    header_lines = [
        "BÁO CÁO DỮ LIỆU GIÁM SÁT GIAO THÔNG",
        f"Thời gian xuất: {now_str} | Người xuất: {current_user.username} ({current_user.role})",
        f"Kỳ dữ liệu: {params.get('date_from') or 'Tất cả'} đến {params.get('date_to') or 'Tất cả'} | Camera: {params.get('camera_id') or 'Tất cả'}",
        f"Tổng số bản ghi khớp bộ lọc: {total_count:,} dòng (Hiển thị 50 dòng đầu)",
    ]

    formatted_rows = []
    for idx, r in enumerate(rows, 1):
        formatted_rows.append(build_row_data(idx, r))

    file_name = f"BaoCao_DuLieu_{datetime.now().strftime('%Y%m%d-%H%M')}.csv"
    return {
        "format": "csv",
        "file_name": file_name,
        "total_rows": total_count,
        "total_records": total_count,
        "truncated": is_truncated,
        "header_lines": header_lines,
        "columns": DATA_EXPORT_HEADERS,
        "headers": DATA_EXPORT_HEADERS,
        "rows": formatted_rows,
        "preview_rows": formatted_rows,
    }


# ---------------------------------------------------------------------------
# EXCEL EXPORT & PREVIEW
# ---------------------------------------------------------------------------
def build_xlsx_content(
    query,
    params: Dict[str, Any],
    current_user: User,
    include_images: bool = False,
    limit: int = 50000,
) -> Tuple[bytes, int, bool]:
    total_count = query.count()
    rows = query.limit(limit).all()
    is_truncated = total_count > limit

    wb = openpyxl.Workbook()
    ws_summary = wb.active
    ws_summary.title = "Tổng quan"
    ws_detail = wb.create_sheet(title="Chi tiết")
    ws_notes = wb.create_sheet(title="Chú giải")

    font_title = Font(name="Calibri", size=16, bold=True, color="0F172A")
    font_section = Font(name="Calibri", size=12, bold=True, color="1E293B")
    font_bold = Font(name="Calibri", size=11, bold=True)
    font_reg = Font(name="Calibri", size=11)

    fill_header = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    font_header = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    fill_warn_ocr = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    fill_viol_red = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    fill_viol_amber = PatternFill(start_color="FFEDD5", end_color="FFEDD5", fill_type="solid")
    fill_viol_green = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")

    border_thin = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    # 1. SHEET TỔNG QUAN
    now_str = _vn_now().strftime("%d/%m/%Y %H:%M:%S")
    ws_summary["A1"] = "BÁO CÁO TỔNG QUAN GIÁM SÁT GIAO THÔNG"
    ws_summary["A1"].font = font_title

    ws_summary["A3"] = "Thời gian xuất:"
    ws_summary["B3"] = now_str
    ws_summary["A4"] = "Người xuất:"
    ws_summary["B4"] = f"{current_user.username} ({current_user.role})"
    ws_summary["A5"] = "Khoảng thời gian:"
    ws_summary["B5"] = f"{params.get('date_from') or 'Tất cả'} đến {params.get('date_to') or 'Tất cả'}"
    ws_summary["A6"] = "Camera:"
    ws_summary["B6"] = params.get("camera_id") or "Tất cả"

    viol_count = sum(1 for r in rows if r.violation_type)
    clear_count = sum(1 for r in rows if format_ocr_percent(r.ocr_score) >= LOW_OCR_THRESHOLD)
    low_ocr_count = len(rows) - clear_count
    edited_count = sum(1 for r in rows if r.plate_edited_at)

    ws_summary["A8"] = "CHỈ SỐ TỔNG HỢP"
    ws_summary["A8"].font = font_section
    ws_summary["A9"] = "Tổng lượt xe:"
    ws_summary["B9"] = len(rows)
    ws_summary["A10"] = "Tổng số vi phạm:"
    ws_summary["B10"] = viol_count
    ws_summary["A11"] = "Tỉ lệ vi phạm:"
    ws_summary["B11"] = f"{(viol_count / len(rows) * 100):.1f}%" if rows else "0%"
    ws_summary["A12"] = "Tỉ lệ OCR rõ (>= 90%):"
    ws_summary["B12"] = f"{(clear_count / len(rows) * 100):.1f}%" if rows else "0%"
    ws_summary["A13"] = "Số bản ghi OCR thấp cần rà soát:"
    ws_summary["B13"] = low_ocr_count
    ws_summary["A14"] = "Số bản ghi đã sửa biển tay:"
    ws_summary["B14"] = edited_count

    # 3 mini tables: Vi phạm, Loại xe, Camera
    # Bảng vi phạm
    ws_summary["D8"] = "THỐNG KÊ THEO LOẠI VI PHẠM"
    ws_summary["D8"].font = font_bold
    ws_summary["D9"] = "Loại vi phạm"
    ws_summary["E9"] = "Số lượng"
    ws_summary["F9"] = "Tỉ lệ %"
    ws_summary["D9"].font = font_bold
    ws_summary["E9"].font = font_bold
    ws_summary["F9"].font = font_bold

    viol_map: Dict[str, int] = {}
    for r in rows:
        v = r.violation_type if r.violation_type else "Không vi phạm"
        viol_map[v] = viol_map.get(v, 0) + 1

    r_idx = 10
    for vname, vcnt in sorted(viol_map.items(), key=lambda x: x[1], reverse=True):
        ws_summary[f"D{r_idx}"] = vname
        ws_summary[f"E{r_idx}"] = vcnt
        ws_summary[f"F{r_idx}"] = f"{(vcnt / len(rows) * 100):.1f}%" if rows else "0%"
        r_idx += 1

    # Bảng loại xe
    r_idx += 2
    ws_summary[f"D{r_idx}"] = "THỐNG KÊ THEO LOẠI XE"
    ws_summary[f"D{r_idx}"].font = font_bold
    r_idx += 1
    ws_summary[f"D{r_idx}"] = "Loại xe"
    ws_summary[f"E{r_idx}"] = "Số lượng"
    ws_summary[f"F{r_idx}"] = "Tỉ lệ %"
    ws_summary[f"D{r_idx}"].font = font_bold
    ws_summary[f"E{r_idx}"].font = font_bold
    ws_summary[f"F{r_idx}"].font = font_bold
    r_idx += 1

    vtype_counts: Dict[str, int] = {}
    for r in rows:
        vt = VEHICLE_TYPE_MAP.get(str(r.vehicle_type or "").lower(), r.vehicle_type or "Không rõ")
        vtype_counts[vt] = vtype_counts.get(vt, 0) + 1

    for vt_name, vt_cnt in sorted(vtype_counts.items(), key=lambda x: x[1], reverse=True):
        ws_summary[f"D{r_idx}"] = vt_name
        ws_summary[f"E{r_idx}"] = vt_cnt
        ws_summary[f"F{r_idx}"] = f"{(vt_cnt / len(rows) * 100):.1f}%" if rows else "0%"
        r_idx += 1

    if is_truncated:
        ws_summary[f"A{max(r_idx, 16)}"] = "LƯU Ý: Dữ liệu đã vượt 50.000 dòng và bị cắt bớt. Hãy thu hẹp khoảng thời gian hoặc camera lọc."
        ws_summary[f"A{max(r_idx, 16)}"].font = Font(color="DC2626", bold=True)

    # 2. SHEET CHI TIẾT
    headers = list(DATA_EXPORT_HEADERS)
    if include_images:
        headers.append("Ảnh phương tiện (xem trước)")

    ws_detail.append(headers)
    ws_detail.freeze_panes = "D2"  # Freeze header & first 3 columns
    ws_detail.auto_filter.ref = f"A1:{openpyxl.utils.get_column_letter(len(headers))}1"

    for col_idx in range(1, len(headers) + 1):
        cell = ws_detail.cell(row=1, column=col_idx)
        cell.font = font_header
        cell.fill = fill_header
        cell.alignment = Alignment(horizontal="center", vertical="center")

    max_img_rows = 500 if include_images else 0
    for row_num, r in enumerate(rows, start=2):
        row_vals = build_row_data(row_num - 1, r)
        ws_detail.append(row_vals)

        ocr_val = format_ocr_percent(r.ocr_score)
        cell_ocr = ws_detail.cell(row=row_num, column=8)
        if ocr_val < LOW_OCR_THRESHOLD:
            cell_ocr.fill = fill_warn_ocr

        cell_viol = ws_detail.cell(row=row_num, column=12)
        if r.violation_type:
            cell_viol.fill = fill_viol_red
        else:
            cell_viol.fill = fill_viol_green

        cell_status = ws_detail.cell(row=row_num, column=13)
        if r.review_status == "processed":
            cell_status.fill = fill_viol_green
        elif r.review_status == "dismissed":
            cell_status.fill = fill_warn_ocr

        for c_i in range(1, len(row_vals) + 1):
            ws_detail.cell(row=row_num, column=c_i).border = border_thin

        # Optional image embedding (first 500 rows)
        if include_images and row_num - 2 < max_img_rows and r.image_path:
            resolved = resolve_runtime_image_path(r.image_path)
            if resolved and os.path.exists(resolved):
                try:
                    img = XLImage(resolved)
                    img.width = 75
                    img.height = 45
                    img_col_letter = openpyxl.utils.get_column_letter(len(headers))
                    ws_detail.add_image(img, f"{img_col_letter}{row_num}")
                    ws_detail.row_dimensions[row_num].height = 40
                except Exception:
                    pass

    # Column widths
    for col in ws_detail.columns:
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws_detail.column_dimensions[col_letter].width = max(12, min(32, max(len(str(cell.value or "")) for cell in col) + 3))

    # 3. SHEET CHÚ GIẢI
    ws_notes["A1"] = "CHÚ GIẢI VÀ HƯỚNG DẪN ĐỌC BÁO CÁO"
    ws_notes["A1"].font = font_title
    notes_data = [
        ("Mã hồ sơ", "Mã định danh duy nhất của lượt phát hiện theo cú pháp TRF-YYYYMMDD-CAM-STT"),
        ("Độ tin cậy OCR", "Điểm số nhận dạng chuỗi ký tự biển số từ mô hình Deep Learning (tỉ lệ %)"),
        ("Ngưỡng OCR thấp", "Mặc định 90%. Các bản ghi dưới ngưỡng được tô nền vàng/cam để rà soát thủ công"),
        ("Đã sửa tay", "Đánh dấu bản ghi có biển số đã được nhân viên kiểm soát hiệu chỉnh"),
        ("Trạng thái xử lý", "Chờ duyệt: Chưa thẩm định; Đã xác nhận: Vi phạm hợp lệ; Bỏ qua: Báo động giả"),
        ("Ý nghĩa màu sắc", "Đỏ nhạt: Phát hiện vi phạm; Xanh nhạt: Lưu thông chuẩn; Vàng nhạt: OCR cần rà soát"),
    ]
    for n_idx, (k, v) in enumerate(notes_data, start=3):
        ws_notes[f"A{n_idx}"] = k
        ws_notes[f"A{n_idx}"].font = font_bold
        ws_notes[f"B{n_idx}"] = v

    # Print setup (A4 landscape fit to width 1)
    for ws in [ws_summary, ws_detail]:
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.print_title_rows = "1:1"
        ws.HeaderFooter.oddFooter.right.text = "Trang &[Page] / &[Pages]"
        ws.HeaderFooter.oddFooter.left.text = f"Xuất lúc {now_str}"

    bio = io.BytesIO()
    wb.save(bio)
    return bio.getvalue(), total_count, is_truncated


def build_xlsx_preview_data(
    query,
    params: Dict[str, Any],
    current_user: User,
    limit: int = 50,
) -> Dict[str, Any]:
    total_count = query.count()
    rows = query.limit(limit).all()
    now_str = _vn_now().strftime("%d/%m/%Y %H:%M:%S")

    # Sheet 1: Tổng quan
    viol_count = query.filter(Detection.violation_type.isnot(None), Detection.violation_type != "").count()
    clear_count = query.filter(Detection.ocr_score >= (LOW_OCR_THRESHOLD / 100.0)).count()

    summary_rows = [
        {"kind": "title", "cells": [{"val": "BÁO CÁO TỔNG QUAN GIÁM SÁT GIAO THÔNG"}]},
        {"kind": "meta", "cells": [{"val": "Thời gian xuất:"}, {"val": now_str}]},
        {"kind": "meta", "cells": [{"val": "Người xuất:"}, {"val": f"{current_user.username} ({current_user.role})"}]},
        {"kind": "meta", "cells": [{"val": "Kỳ báo cáo:"}, {"val": f"{params.get('date_from') or 'Tất cả'} đến {params.get('date_to') or 'Tất cả'}"}]},
        {"kind": "meta", "cells": [{"val": "Camera lọc:"}, {"val": params.get("camera_id") or "Tất cả"}]},
        {"kind": "section", "cells": [{"val": "CHỈ SỐ TỔNG HỢP"}]},
        {"kind": "row", "cells": [{"val": "Tổng lượt xe:"}, {"val": total_count}]},
        {"kind": "row", "cells": [{"val": "Tổng số vi phạm:"}, {"val": viol_count}]},
        {"kind": "row", "cells": [{"val": "Tỉ lệ OCR rõ (>= 90%):"}, {"val": f"{(clear_count / total_count * 100):.1f}%" if total_count else "0%"}]},
        {"kind": "row", "cells": [{"val": "Số bản ghi cần rà soát:"}, {"val": max(0, total_count - clear_count)}]},
    ]

    # Sheet 2: Chi tiết (50 rows)
    detail_rows = [{"kind": "header", "cells": [{"val": h} for h in DATA_EXPORT_HEADERS]}]
    for idx, r in enumerate(rows, 1):
        row_vals = build_row_data(idx, r)
        cells = []
        ocr_val = format_ocr_percent(r.ocr_score)
        for c_idx, val in enumerate(row_vals):
            style = None
            if c_idx == 7 and ocr_val < LOW_OCR_THRESHOLD:
                style = "warn"
            elif c_idx == 11 and r.violation_type:
                style = "viol_red"
            elif c_idx == 12 and r.review_status == "processed":
                style = "ok"
            cells.append({"val": val, "style": style})
        detail_rows.append({"kind": "row", "cells": cells})

    # Sheet 3: Chú giải
    notes_rows = [
        {"kind": "title", "cells": [{"val": "CHÚ GIẢI THUẬT NGỮ VÀ MÀU SẮC"}]},
        {"kind": "row", "cells": [{"val": "Mã hồ sơ"}, {"val": "Mã định danh duy nhất của lượt phát hiện (TRF-YYYYMMDD-CAM-STT)"}]},
        {"kind": "row", "cells": [{"val": "Độ tin cậy OCR"}, {"val": "Điểm số nhận dạng ký tự biển số (tỉ lệ %)"}]},
        {"kind": "row", "cells": [{"val": "Màu cam/vàng"}, {"val": "Biển số OCR < 90%, khuyến nghị rà soát thủ công"}]},
        {"kind": "row", "cells": [{"val": "Màu đỏ"}, {"val": "Phương tiện bị ghi nhận vi phạm giao thông"}]},
        {"kind": "row", "cells": [{"val": "Màu xanh lá"}, {"val": "Phương tiện lưu thông bình thường hoặc hồ sơ đã xác nhận hợp lệ"}]},
    ]

    file_name = f"BaoCao_DuLieu_{datetime.now().strftime('%Y%m%d-%H%M')}.xlsx"
    return {
        "format": "xlsx",
        "file_name": file_name,
        "total_rows": total_count,
        "total_records": total_count,
        "truncated": total_count > 50000,
        "sheets": [
            {"name": "Tổng quan", "rows": summary_rows},
            {"name": "Chi tiết", "rows": detail_rows},
            {"name": "Chú giải", "rows": notes_rows},
        ],
    }


# ---------------------------------------------------------------------------
# PDF REPORT & PREVIEW GENERATION
# ---------------------------------------------------------------------------
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Roboto", 8)
        self.setFillColor(colors.HexColor("#64748B"))

        # Footer divider and text
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.6)
        self.line(15 * mm, 12 * mm, A4[0] - 15 * mm, 12 * mm)

        self.drawString(15 * mm, 8 * mm, "Smart Traffic · Hệ thống Giám sát & Báo cáo Tự động")
        self.drawRightString(A4[0] - 15 * mm, 8 * mm, f"Trang {self._pageNumber} / {page_count}")
        self.restoreState()


def build_pdf_content(
    query,
    params: Dict[str, Any],
    current_user: User,
    is_preview: bool = False,
) -> Tuple[bytes, int, bool]:
    total_count = query.count()
    now_str = _vn_now().strftime("%d/%m/%Y %H:%M:%S")

    # In preview: table max 15 rows, evidence max 6 images
    # In full: all violations + up to 500 non-violations, evidence max 50 images
    if is_preview:
        rows = query.limit(15).all()
        max_evidence = 6
    else:
        # Full report: all violations + up to 500 normal
        viol_rows = query.filter(Detection.violation_type.isnot(None), Detection.violation_type != "").all()
        norm_rows = query.filter((Detection.violation_type.is_(None)) | (Detection.violation_type == "")).limit(500).all()
        rows = sorted(viol_rows + norm_rows, key=lambda x: (x.timestamp or datetime.min), reverse=True)
        max_evidence = 50

    viol_count = query.filter(Detection.violation_type.isnot(None), Detection.violation_type != "").count()
    clear_count = query.filter(Detection.ocr_score >= (LOW_OCR_THRESHOLD / 100.0)).count()
    low_ocr_count = max(0, total_count - clear_count)
    ocr_pct = f"{(clear_count / total_count * 100):.1f}%" if total_count else "100%"

    bio = io.BytesIO()
    doc = SimpleDocTemplate(
        bio,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=18 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle",
        fontName="Roboto-Bold",
        fontSize=15,
        leading=19,
        textColor=colors.HexColor("#0F172A"),
        alignment=1,
    )
    sub_title_style = ParagraphStyle(
        "SubTitle",
        fontName="Roboto",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#475569"),
        alignment=1,
    )
    meta_style = ParagraphStyle(
        "MetaText",
        fontName="Roboto",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#334155"),
    )
    sec_title = ParagraphStyle(
        "SecTitle",
        fontName="Roboto-Bold",
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor("#0F172A"),
    )
    table_cell = ParagraphStyle(
        "TableCell",
        fontName="Roboto",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#1E293B"),
    )
    table_cell_bold = ParagraphStyle(
        "TableCellBold",
        fontName="Roboto-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#0F172A"),
    )
    table_cell_viol = ParagraphStyle(
        "TableCellViol",
        fontName="Roboto-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#DC2626"),
    )

    story = []

    # 1. Dark Banner Header
    banner_data = [
        [
            Paragraph("HỆ THỐNG GIÁM SÁT GIAO THÔNG THÔNG MINH · SMART TRAFFIC", ParagraphStyle("B1", fontName="Roboto-Bold", fontSize=8, textColor=colors.HexColor("#38BDF8"))),
        ],
        [
            Paragraph("BÁO CÁO GIÁM SÁT VÀ XỬ LÝ VI PHẠM GIAO THÔNG", ParagraphStyle("B2", fontName="Roboto-Bold", fontSize=14, leading=18, textColor=colors.white)),
        ],
        [
            Paragraph(
                f"Kỳ báo cáo: {params.get('date_from') or 'Toàn thời gian'} đến {params.get('date_to') or 'Hiện tại'} | Camera: {params.get('camera_id') or 'Toàn mạng lưới'}",
                ParagraphStyle("B3", fontName="Roboto", fontSize=8.5, textColor=colors.HexColor("#CBD5E1")),
            )
        ],
    ]
    banner_table = Table(banner_data, colWidths=[182 * mm])
    banner_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0F172A")),
            ("PADDING", (0, 0), (-1, -1), 6),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 2), (-1, 2), 10),
            ("TOPPADDING", (0, 0), (-1, 0), 10),
        ])
    )
    story.append(banner_table)
    story.append(Spacer(1, 4 * mm))

    # 2. Metadata row
    meta_row = [
        [
            Paragraph(f"<b>Ngày xuất:</b> {now_str}", meta_style),
            Paragraph(f"<b>Cán bộ xuất:</b> {current_user.username} ({current_user.role})", meta_style),
            Paragraph(f"<b>Tổng lượt xe:</b> {total_count:,}", meta_style),
        ]
    ]
    t_meta = Table(meta_row, colWidths=[60 * mm, 62 * mm, 60 * mm])
    t_meta.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 4 * mm))

    # 3. KPI Summary cards (4 cards)
    card_data = [
        [
            Paragraph(f"<font color='#64748B' size=6.5>TỔNG LƯỢT XE</font><br/><b><font size=12>{total_count:,}</font></b>", meta_style),
            Paragraph(f"<font color='#DC2626' size=6.5>TỔNG VI PHẠM</font><br/><b><font color='#DC2626' size=12>{viol_count:,}</font></b>", meta_style),
            Paragraph(f"<font color='#059669' size=6.5>TỈ LỆ OCR RÕ</font><br/><b><font color='#059669' size=12>{ocr_pct}</font></b>", meta_style),
            Paragraph(f"<font color='#D97706' size=6.5>RÀ SOÁT OCR</font><br/><b><font color='#D97706' size=12>{low_ocr_count:,}</font></b>", meta_style),
        ]
    ]
    t_cards = Table(card_data, colWidths=[45.5 * mm, 45.5 * mm, 45.5 * mm, 45.5 * mm])
    t_cards.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFFFF")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(t_cards)
    story.append(Spacer(1, 5 * mm))

    # 4. Detail Table
    story.append(Paragraph("DANH SÁCH CHI TIẾT PHƯƠNG TIỆN VÀ HỒ SƠ VI PHẠM", sec_title))
    story.append(Spacer(1, 2 * mm))

    t_headers = ["STT", "Mã hồ sơ", "Thời gian", "Camera", "Biển số", "Loại xe", "Vi phạm", "Trạng thái"]
    t_rows = [[Paragraph(f"<b><font color='white'>{h}</font></b>", table_cell_bold) for h in t_headers]]

    for idx, r in enumerate(rows, 1):
        vtype = VEHICLE_TYPE_MAP.get(str(r.vehicle_type or "").lower(), r.vehicle_type or "Không rõ")
        viol_name = r.violation_type if r.violation_type else "Bình thường"
        r_status = (
            REVIEW_STATUS_MAP.get(str(r.review_status or "").lower(), r.review_status or "Chờ duyệt")
            if r.violation_type
            else "–"
        )
        row_style = table_cell_viol if r.violation_type else table_cell

        t_rows.append([
            Paragraph(str(idx), table_cell),
            Paragraph(case_code_for_detection(r), table_cell_bold),
            Paragraph(r.timestamp.strftime("%d/%m %H:%M") if r.timestamp else "", table_cell),
            Paragraph(r.camera_id or "", table_cell),
            Paragraph(r.plate_number or "", table_cell_bold),
            Paragraph(vtype, table_cell),
            Paragraph(viol_name, row_style),
            Paragraph(r_status, table_cell),
        ])

    table_detail = Table(
        t_rows,
        colWidths=[10 * mm, 34 * mm, 22 * mm, 18 * mm, 24 * mm, 18 * mm, 36 * mm, 20 * mm],
    )
    table_detail.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("PADDING", (0, 0), (-1, -1), 3.5),
        ])
    )
    story.append(table_detail)

    if is_preview:
        story.append(Spacer(1, 2 * mm))
        story.append(
            Paragraph(
                f"<i>* Chế độ xem trước hiển thị 15 dòng đầu. Báo cáo tải về đầy đủ sẽ kết xuất toàn bộ dữ liệu.</i>",
                sub_title_style,
            )
        )

    # 5. Evidence Images for violations
    viol_with_crops = [r for r in rows if r.violation_type and r.image_path][:max_evidence]
    if viol_with_crops:
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph(f"HÌNH ẢNH BẰNG CHỨNG VI PHẠM (TỐI ĐA {len(viol_with_crops)} PHƯƠNG TIỆN)", sec_title))
        story.append(Spacer(1, 2 * mm))

        img_cells = []
        for r in viol_with_crops:
            resolved = resolve_runtime_image_path(r.image_path)
            if resolved and os.path.exists(resolved):
                try:
                    img = RLImage(resolved, width=42 * mm, height=26 * mm)
                    caption = Paragraph(
                        f"<b>{r.plate_number}</b> · {r.camera_id}<br/><font color='#DC2626'>{r.violation_type}</font>",
                        table_cell,
                    )
                    cell_table = Table([[img], [caption]], colWidths=[44 * mm])
                    cell_table.setStyle(TableStyle([
                        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                        ("PADDING", (0, 0), (-1, -1), 3),
                    ]))
                    img_cells.append(cell_table)
                except Exception:
                    pass

        # Arrange images in rows of 4
        img_grid = []
        for i in range(0, len(img_cells), 4):
            row_items = img_cells[i: i + 4]
            while len(row_items) < 4:
                row_items.append("")
            img_grid.append(row_items)

        if img_grid:
            grid_table = Table(img_grid, colWidths=[45.5 * mm, 45.5 * mm, 45.5 * mm, 45.5 * mm])
            grid_table.setStyle(TableStyle([
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("PADDING", (0, 0), (-1, -1), 2),
            ]))
            story.append(grid_table)

    # 6. Signatures block
    story.append(Spacer(1, 6 * mm))
    sig_data = [
        [
            Paragraph("<b>NGƯỜI LẬP BÁO CÁO</b><br/><i>(Ký và ghi rõ họ tên)</i><br/><br/><br/><br/><b>Cán bộ vận hành</b>", ParagraphStyle("S1", fontName="Roboto", fontSize=8.5, leading=12, alignment=1)),
            Paragraph("<b>CHỈ HUY PHÊ DUYỆT</b><br/><i>(Ký, đóng dấu xác nhận)</i><br/><br/><br/><br/><b>Trực ban tác chiến</b>", ParagraphStyle("S2", fontName="Roboto", fontSize=8.5, leading=12, alignment=1)),
        ]
    ]
    t_sig = Table(sig_data, colWidths=[91 * mm, 91 * mm])
    t_sig.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(KeepTogether(t_sig))

    doc.build(story, canvasmaker=NumberedCanvas)
    return bio.getvalue(), total_count, is_preview
