"""Telegram bot bridge for Smart Traffic.

The bot reads secrets from environment variables only. Do not hardcode tokens
in source code.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import html
import io
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from PIL import Image, ImageDraw, ImageFont


TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"
MIN_TELEGRAM_PLATE_SCORE = 0.85
BOT_COMMANDS = [
    {"command": "start", "description": "🚦 Bắt đầu khám phá TrafficAI"},
    {"command": "features", "description": "✨ Giải pháp & Tính năng thương mại"},
    {"command": "architecture", "description": "🧠 Kiến trúc hệ thống AI End-to-End"},
    {"command": "logs", "description": "🚘 Tra cứu biển số & Hồ sơ vi phạm"},
    {"command": "violations", "description": "📚 Quy chuẩn xử phạt NĐ 168/2024"},
    {"command": "demo", "description": "🎬 Xem video demo vận hành"},
    {"command": "contact", "description": "💼 Liên hệ hợp tác & Chuyển giao"},
    {"command": "help", "description": "❓ Hướng dẫn sử dụng trợ lý"},
]


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _telegram_url(token: str, method: str) -> str:
    return TELEGRAM_API.format(token=token, method=method)


_KNOWN_TEXT_FIXES = {
    "C?n ??i chi?u l?i c? th?": "Cần đối chiếu lỗi cụ thể",
    "C?n x?c ??nh ng??ng qu? t?c ??": "Cần xác định ngưỡng quá tốc độ",
    "Ngh? ??nh 168/2024/N?-CP, hi?u l?c t? 01/01/2025": "Nghị định 168/2024/NĐ-CP, hiệu lực từ 01/01/2025",
    "Kh?ng c? vi ph?m n?o ???c ghi nh?n": "Không có vi phạm nào được ghi nhận",
    "??ng": "đồng",
    "N?-CP": "NĐ-CP",
}


def _mojibake_score(text: str) -> int:
    markers = ("Ã", "Â", "Æ", "Ä", "Ă", "áº", "á»", "â€", "�")
    return sum(text.count(marker) for marker in markers) * 3 + text.count("?")


def _decode_mojibake_once(text: str) -> str:
    candidates = [text]
    for encoding in ("latin1", "cp1252"):
        try:
            candidates.append(text.encode(encoding).decode("utf-8"))
        except UnicodeError:
            pass
    return min(candidates, key=_mojibake_score)


def _clean_text(value: Any) -> str:
    text = str(value or "")
    for bad, good in _KNOWN_TEXT_FIXES.items():
        text = text.replace(bad, good)
    for _ in range(2):
        fixed = _decode_mojibake_once(text)
        if fixed == text:
            break
        text = fixed
        for bad, good in _KNOWN_TEXT_FIXES.items():
            text = text.replace(bad, good)
    return text


def _h(value: Any) -> str:
    return html.escape(_clean_text(value).strip())


def _send_message(
    client: httpx.Client,
    token: str,
    chat_id: int | str,
    text: str,
    *,
    reply_markup: Optional[Dict[str, Any]] = None,
) -> None:
    payload: Dict[str, Any] = {
        "chat_id": chat_id,
        "text": text[:3900],
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    client.post(_telegram_url(token, "sendMessage"), json=payload, timeout=20).raise_for_status()


def _answer_callback(client: httpx.Client, token: str, callback_id: Any, text: str = "") -> None:
    if not callback_id:
        return
    payload = {"callback_query_id": callback_id}
    if text:
        payload["text"] = text[:180]
    client.post(_telegram_url(token, "answerCallbackQuery"), json=payload, timeout=20).raise_for_status()


def _configure_bot(client: httpx.Client, token: str) -> None:
    """Synchronize the public Telegram command menu and bot descriptions."""
    settings = [
        ("setMyCommands", {"commands": BOT_COMMANDS}),
        ("setMyName", {"name": "Smart Traffic AI Assistant"}),
        (
            "setMyDescription",
            {
                "description": (
                    "Trợ lý trình diễn Hệ thống quản lý giao thông thông minh: "
                    "giám sát đa camera, AI nhận diện và tracking, OCR biển số, "
                    "ảnh chứng cứ, hồ sơ/biên bản responsive, nghiệp vụ vi phạm và tra cứu từ xa."
                )
            },
        ),
        (
            "setMyShortDescription",
            {"short_description": "Khám phá dự án Smart Traffic AI và dữ liệu demo trực tiếp."},
        ),
    ]
    for method, payload in settings:
        try:
            client.post(_telegram_url(token, method), json=payload, timeout=20).raise_for_status()
        except httpx.HTTPError:
            # Updating profile metadata is best-effort. A temporary Telegram
            # rate limit must never stop polling or make the bot unavailable.
            print(f"[TELEGRAM] Bot profile sync deferred for {method}.")


def _image_bytes(image_b64: Any) -> Optional[bytes]:
    raw = str(image_b64 or "").strip()
    if not raw:
        return None
    if "," in raw and raw.lower().startswith("data:image"):
        raw = raw.split(",", 1)[1]
    raw = re.sub(r"\s+", "", raw)
    try:
        data = base64.b64decode(raw, validate=False)
        return data if len(data) > 128 else None
    except Exception:
        return None


def _send_photo(
    client: httpx.Client,
    token: str,
    chat_id: int | str,
    image_b64: Any,
    caption: str,
) -> bool:
    data = _image_bytes(image_b64)
    if not data:
        return False
    payload = {
        "chat_id": chat_id,
        "caption": caption[:1000],
        "parse_mode": "HTML",
    }
    files = {"photo": ("evidence.jpg", data, "image/jpeg")}
    client.post(_telegram_url(token, "sendPhoto"), data=payload, files=files, timeout=30).raise_for_status()
    return True


def _main_keyboard() -> Dict[str, Any]:
    return {
        "keyboard": [
            [{"text": "🎯 Trải nghiệm nhanh 90 giây"}],
            [{"text": "🏆 Tính năng thương mại"}, {"text": "🎬 Video demo"}],
            [{"text": "🚘 Biển số đã ghi nhận"}, {"text": "🔎 Tra cứu biển số"}],
            [{"text": "🗂️ Quy trình xử lý"}, {"text": "📚 Căn cứ xử phạt"}],
            [{"text": "💼 Liên hệ hợp tác"}, {"text": "❓ Hướng dẫn"}],
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False,
        "input_field_placeholder": "Chọn nội dung hoặc nhập biển số cần tra cứu...",
    }


def _assistant_inline_keyboard() -> Dict[str, Any]:
    project_url = _env("PROJECT_PUBLIC_URL", "https://hethong-giaothong-ai.netlify.app") or "https://hethong-giaothong-ai.netlify.app"
    return {
        "inline_keyboard": [
            [{"text": "🎯 Trải nghiệm nhanh 90 giây", "callback_data": "quick_tour:start"}],
            [
                {"text": "🚘 Xem biển số đã lưu", "callback_data": "logs"},
                {"text": "🔎 Tìm biển số", "callback_data": "search_plate"},
            ],
            [
                {"text": "🏆 Tính năng thương mại", "callback_data": "features"},
                {"text": "🎬 Video demo", "callback_data": "demo"},
            ],
            [
                {"text": "🧠 Luồng xử lý AI", "callback_data": "architecture"},
                {"text": "🗂️ Quy trình xử lý", "callback_data": "workflow"},
            ],
            [
                {"text": "🌐 Mở Dashboard Web", "url": project_url},
                {"text": "💼 Liên hệ hợp tác", "callback_data": "contact"},
            ],
        ]
    }


def _onboarding_keyboard() -> Dict[str, Any]:
    project_url = _env("PROJECT_PUBLIC_URL", "https://roadai-traffic.vercel.app") or "https://roadai-traffic.vercel.app"
    return {
        "inline_keyboard": [
            [{"text": "🎯 Trải nghiệm nhanh 90 giây", "callback_data": "quick_tour:start"}],
            [
                {"text": "🚘 Biển số đã ghi nhận", "callback_data": "logs"},
                {"text": "🔎 Tìm biển số", "callback_data": "search_plate"},
            ],
            [
                {"text": "🏆 Vì sao dự án nổi bật?", "callback_data": "showcase"},
                {"text": "🎬 Xem video", "callback_data": "demo"},
            ],
            [
                {"text": "🗂️ Xem quy trình xử lý", "callback_data": "workflow"},
                {"text": "🌐 Mở phần mềm", "url": project_url},
            ],
            [{"text": "❓ Tôi mới dùng bot", "callback_data": "help"}],
        ]
    }


def _back_home_keyboard() -> Dict[str, Any]:
    return {
        "inline_keyboard": [[
            {"text": "🏠 Về tổng quan", "callback_data": "home"},
            {"text": "🎬 Video demo", "callback_data": "demo"},
        ]]
    }


def _backend_get(client: httpx.Client, backend_url: str, path: str) -> Dict[str, Any]:
    chatbot_key = _chatbot_api_key()
    headers = {"X-Chatbot-Key": chatbot_key} if chatbot_key else None
    response = client.get(f"{backend_url.rstrip('/')}{path}", headers=headers, timeout=20)
    response.raise_for_status()
    return response.json()


def _chatbot_api_key() -> str:
    configured_key = _env("CHATBOT_INTERNAL_API_KEY")
    if configured_key:
        return configured_key
    bot_token = _env("TELEGRAM_BOT_TOKEN")
    return (
        hashlib.sha256(f"smart-traffic-chatbot:{bot_token}".encode("utf-8")).hexdigest()
        if bot_token else ""
    )


def _signed_notice_url(detection_id: Any, *, lifetime_seconds: int = 24 * 60 * 60) -> str:
    try:
        item_id = int(detection_id)
    except (TypeError, ValueError):
        return ""
    key = _chatbot_api_key()
    if item_id <= 0 or not key:
        return ""
    expires = int(time.time()) + max(300, min(lifetime_seconds, 7 * 24 * 60 * 60))
    message = f"{item_id}:{expires}".encode("utf-8")
    signature = hmac.new(key.encode("utf-8"), message, hashlib.sha256).hexdigest()
    public_url = _env("PROJECT_PUBLIC_URL", "https://roadai-traffic.vercel.app") or "https://roadai-traffic.vercel.app"
    return f"{public_url.rstrip('/')}/api/telegram/notice/{item_id}.html?expires={expires}&sig={signature}"


def _extract_case_code(text: str) -> Optional[str]:
    match = re.search(r"\b(BB-\d{8}-[A-Z0-9]+-\d+|HS-\d+|#\d+)\b", str(text or "").upper())
    if match:
        return match.group(1)
    return None


def _extract_plate(text: str) -> Optional[str]:
    case_code = _extract_case_code(text)
    if case_code:
        return case_code
    for raw_token in str(text or "").upper().split():
        token = re.sub(r"[^A-Z0-9]", "", raw_token)
        if 6 <= len(token) <= 12 and any(ch.isdigit() for ch in token) and any(ch.isalpha() for ch in token):
            return token
    return None


def _plate_key(value: Any) -> str:
    raw = str(value or "").strip().upper()
    if raw.startswith("BB-") or raw.startswith("HS-") or raw.startswith("#"):
        return raw
    return re.sub(r"[^A-Z0-9]", "", raw)


def _valid_plate_for_list(value: Any) -> bool:
    text = _clean_text(value).strip()
    lower = text.lower()
    if not text or "chưa" in lower or "unknown" in lower or "ocr" in lower or "đang đọc" in lower:
        return False
    token = _plate_key(text)
    return 6 <= len(token) <= 12 and any(ch.isdigit() for ch in token)


def _ocr_score(item: Dict[str, Any]) -> float:
    try:
        return float(item.get("ocr_score") or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _item_has_reliable_plate(item: Dict[str, Any]) -> bool:
    plate = str(item.get("license_plate") or item.get("plate_number") or "").strip().upper()
    if "evidence_curated" in item and not bool(item.get("evidence_curated")):
        return False
    return _valid_plate_for_list(plate) and _ocr_score(item) >= MIN_TELEGRAM_PLATE_SCORE


def _unique_valid_plate_items(payload: Dict[str, Any], limit: int = 20) -> List[Dict[str, Any]]:
    seen = set()
    rows: List[Dict[str, Any]] = []
    for item in payload.get("items") or []:
        plate = str(item.get("license_plate") or "").strip().upper()
        key = _plate_key(plate)
        if not _item_has_reliable_plate(item) or key in seen:
            continue
        seen.add(key)
        rows.append(item)
        if len(rows) >= limit:
            break
    return rows


def _history_updates_payload(client: httpx.Client, backend_url: str, limit: int = 50) -> Dict[str, Any]:
    """Build a Telegram-compatible payload from the same current log endpoint used by the UI."""
    raw = _backend_get(client, backend_url, f"/api/history/updates?limit={max(1, min(limit, 100))}&current_only=true")
    rows = raw.get("items") or []
    rows = sorted(
        rows,
        key=lambda item: str(item.get("last_seen_at") or item.get("timestamp") or ""),
        reverse=True,
    )

    items: List[Dict[str, Any]] = []
    for row in rows:
        plate = str(row.get("plate_number") or "").strip().upper()
        ocr_score = 0.0
        try:
            ocr_score = float(row.get("ocr_score") or 0.0)
        except (TypeError, ValueError):
            ocr_score = 0.0
        if not _valid_plate_for_list(plate) or ocr_score < MIN_TELEGRAM_PLATE_SCORE:
            continue
        if not bool(row.get("evidence_curated")):
            continue
        violation = row.get("violation_type") or "Chưa phân loại"
        items.append(
            {
                "id": row.get("id"),
                "license_plate": plate,
                "vehicle_type": row.get("vehicle_type_vi") or row.get("vehicle_type") or "Chua phan loai",
                "violation_type": violation,
                "camera_id": row.get("camera_id") or "",
                "timestamp": row.get("timestamp") or "",
                "fine_amount": "0 dong" if not row.get("violation_type") else "Can doi chieu loi cu the",
                "legal_basis": "Nghi dinh 168/2024/ND-CP, hieu luc tu 01/01/2025",
                "owner_name": row.get("owner_name") or "",
                "owner_phone": row.get("owner_phone") or "",
                "owner_email": row.get("owner_email") or "",
                "owner_address": row.get("owner_address") or "",
                "vehicle_image_b64": row.get("vehicle_crop_b64") or "",
                "plate_image_b64": row.get("plate_crop_b64") or "",
                "ocr_score": ocr_score,
                "plate_crop_source": row.get("plate_crop_source") or "",
                "plate_debug_reason": row.get("plate_debug_reason") or "",
                "evidence_curated": True,
            }
        )
        if len(items) >= limit:
            break

    date = ""
    for item in items:
        timestamp = str(item.get("timestamp") or "")
        if " " in timestamp:
            date = timestamp.split(" ", 1)[0]
            break
    if not date:
        date = time.strftime("%d/%m/%Y")
    return {
        "date": date,
        "count": len(items),
        "message": f"Bản ghi biển số trong log hôm nay: {len(items)} bản ghi",
        "items": items,
    }


def _daily_or_history_payload(client: httpx.Client, backend_url: str, limit: int = 50) -> Dict[str, Any]:
    payload = _backend_get(client, backend_url, f"/api/telegram/daily-violations?limit={max(1, min(limit, 50))}&mode=all")
    if _unique_valid_plate_items(payload, limit=1):
        return payload
    try:
        fallback = _history_updates_payload(client, backend_url, limit=limit)
        if _unique_valid_plate_items(fallback, limit=1):
            return fallback
    except Exception:
        return payload
    return payload


def _push_chat_ids() -> List[str]:
    raw = _env("CHATBOT_PUSH_TELEGRAM_CHAT_IDS")
    if not raw:
        raw = _env("TELEGRAM_CHAT_IDS")
    return [item.strip() for item in re.split(r"[,;\s]+", raw) if item.strip()]


def _is_violation_item(item: Dict[str, Any]) -> bool:
    text = _clean_text(item.get("violation_type") or "").lower()
    if not text:
        return False
    return not any(marker in text for marker in ("không vi phạm", "khong vi pham", "chưa ghi nhận", "chua ghi nhan", "chưa phân loại", "chua phan loai"))


def _send_camera_stats(client: httpx.Client, token: str, backend_url: str, chat_id: int | str) -> None:
    payload = _daily_or_history_payload(client, backend_url, limit=50)
    stats: Dict[str, Dict[str, int]] = {}
    for item in payload.get("items") or []:
        camera = str(item.get("camera_id") or "Không rõ").strip() or "Không rõ"
        row = stats.setdefault(camera, {"total": 0, "violations": 0})
        row["total"] += 1
        if _is_violation_item(item):
            row["violations"] += 1
    lines = ["<b>Thống kê camera hôm nay</b>", ""]
    if not stats:
        lines.append("Chưa có bản ghi đủ tin cậy để thống kê.")
    else:
        for camera, row in sorted(stats.items()):
            lines.append(f"- <b>{_h(camera)}</b>: {row['total']} bản ghi, {row['violations']} vi phạm")
    _send_message(client, token, chat_id, "\n".join(lines), reply_markup=_main_keyboard())


def _send_top_plates(client: httpx.Client, token: str, backend_url: str, chat_id: int | str) -> None:
    payload = _daily_or_history_payload(client, backend_url, limit=50)
    counts: Dict[str, int] = {}
    for item in payload.get("items") or []:
        plate = str(item.get("license_plate") or "").strip().upper()
        if _valid_plate_for_list(plate):
            counts[plate] = counts.get(plate, 0) + 1
    lines = ["<b>Top biển ghi nhận nhiều nhất</b>", ""]
    if not counts:
        lines.append("Chưa có biển số đủ tin cậy.")
    else:
        for index, (plate, count) in enumerate(sorted(counts.items(), key=lambda row: row[1], reverse=True)[:10], start=1):
            lines.append(f"{index}. <code>{_h(plate)}</code>: {count} lượt")
    _send_message(client, token, chat_id, "\n".join(lines), reply_markup=_main_keyboard())


def _send_yesterday(client: httpx.Client, token: str, backend_url: str, chat_id: int | str) -> None:
    payload = _daily_or_history_payload(client, backend_url, limit=50)
    items = payload.get("items") or []
    violation_count = sum(1 for item in items if _is_violation_item(item))
    lines = [
        "<b>Tổng hợp gần nhất cho ca hôm qua</b>",
        "",
        f"- Bản ghi đủ tin cậy trong nguồn hiện tại: <b>{len(items)}</b>",
        f"- Bản ghi có vi phạm: <b>{violation_count}</b>",
        "- Nếu cần báo cáo đúng ngày lịch sử, hãy xuất CSV/PDF từ màn Hồ sơ vi phạm để lấy toàn bộ dữ liệu lưu trữ.",
    ]
    _send_message(client, token, chat_id, "\n".join(lines), reply_markup=_main_keyboard())


def _send_system_status(client: httpx.Client, token: str, backend_url: str, chat_id: int | str) -> None:
    try:
        payload = _backend_get(client, backend_url, "/api/ocr/runtime-status")
        message = _format_system_status(payload)
    except Exception:
        try:
            payload = _history_updates_payload(client, backend_url, limit=10)
            message = "\n".join([
                "🟡 <b>TRẠNG THÁI HỆ THỐNG</b>",
                "",
                "• Backend: <b>Đang hoạt động</b>",
                f"• Bản ghi OCR đủ tin cậy: <b>{len(payload.get('items') or [])}</b>",
                "• Chi tiết runtime: tạm thời chưa truy vấn được.",
            ])
        except Exception as exc:
            message = "\n".join([
                "🔴 <b>TRẠNG THÁI HỆ THỐNG</b>",
                "",
                "• Backend: <b>Không thể kết nối</b>",
                f"• Chi tiết: {_h(type(exc).__name__)}",
                "• Vui lòng thử lại sau khi dịch vụ backend hoạt động.",
            ])
    _send_message(client, token, chat_id, message, reply_markup=_main_keyboard())


def _format_system_status(payload: Dict[str, Any]) -> str:
    def safe_int(value: Any) -> int:
        try:
            return int(float(value or 0))
        except (TypeError, ValueError):
            return 0

    def safe_float(value: Any) -> float:
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0.0

    raw_status = str(payload.get("status") or "unknown").strip().lower()
    if raw_status in {"ok", "healthy", "online", "ready"}:
        icon, label = "🟢", "Sẵn sàng"
    elif raw_status in {"degraded", "warning", "partial"}:
        icon, label = "🟡", "Đang hoạt động, cần lưu ý"
    else:
        icon, label = "🔴", "Chưa sẵn sàng"

    stats = payload.get("stats") if isinstance(payload.get("stats"), dict) else {}
    issues = payload.get("issues") if isinstance(payload.get("issues"), list) else []
    queue_size = payload.get("background_ocr_queue_size")
    lines = [
        f"{icon} <b>TRẠNG THÁI HỆ THỐNG AI</b>",
        "",
        f"• Runtime OCR: <b>{label}</b>",
        f"• Biển đã nhận diện: <b>{safe_int(stats.get('recognized_total'))}</b>",
        f"• Biển đã xác nhận: <b>{safe_int(stats.get('confirmed_total'))}</b>",
        f"• Lượt phát hiện vùng biển: <b>{safe_int(stats.get('plate_detect_calls'))}</b>",
        f"• Độ trễ phát hiện trung bình: <b>{safe_float(stats.get('plate_detect_avg_ms')):.0f} ms</b>",
        f"• Hàng đợi OCR nền: <b>{safe_int(queue_size)}</b>",
    ]
    if issues:
        lines.extend([
            "",
            f"⚠️ Có <b>{len(issues)}</b> lưu ý runtime. Chi tiết kỹ thuật được giữ trong trang quản trị.",
        ])
    lines.extend(["", "Dữ liệu được làm mới mỗi lần bạn nhấn nút trạng thái."])
    return "\n".join(lines)


def _push_recent_violations(
    client: httpx.Client,
    token: str,
    backend_url: str,
    pushed_ids: set[str],
) -> None:
    chat_ids = _push_chat_ids()
    if not chat_ids:
        return
    payload = _daily_or_history_payload(client, backend_url, limit=20)
    for item in reversed(payload.get("items") or []):
        item_id = str(item.get("id") or f"{item.get('license_plate')}:{item.get('timestamp')}")
        if item_id in pushed_ids or not _is_violation_item(item) or not _item_has_reliable_plate(item):
            continue
        message = "\n".join([
            "<b>Cảnh báo vi phạm mới</b>",
            _item_line(1, item),
            f"<b>Căn cứ:</b> {_h(item.get('legal_basis') or '')}",
        ])
        for chat_id in chat_ids:
            _send_message(client, token, chat_id, message, reply_markup=_main_keyboard())
            _send_photo(client, token, chat_id, item.get("vehicle_image_b64"), f"Ảnh toàn xe - <b>{_h(item.get('license_plate'))}</b>")
            _send_photo(client, token, chat_id, item.get("plate_image_b64"), f"Ảnh crop biển - <b>{_h(item.get('license_plate'))}</b>")
        pushed_ids.add(item_id)
        if len(pushed_ids) > 500:
            pushed_ids.clear()


def _plate_inline_keyboard(items: List[Dict[str, Any]], *, include_today_button: bool = True) -> Optional[Dict[str, Any]]:
    rows: List[List[Dict[str, str]]] = []
    current: List[Dict[str, str]] = []
    for item in items[:20]:
        plate = str(item.get("license_plate") or "").strip().upper()
        key = _plate_key(plate)
        if not key:
            continue
        current.append({"text": plate, "callback_data": f"plate:{key}"})
        if len(current) == 2:
            rows.append(current)
            current = []
    if current:
        rows.append(current)
    if include_today_button:
        rows.append([
            {"text": "Làm mới hôm nay", "callback_data": "today"},
            {"text": "Danh sách biển", "callback_data": "plates"},
        ])
    return {"inline_keyboard": rows} if rows else None


def _start_text() -> str:
    return "\n".join([
        "🚦 <b>TRAFFICAI · NỀN TẢNG GIÁM SÁT GIAO THÔNG THÔNG MINH</b>",
        "<i>Giải pháp Edge AI & Computer Vision chuyên dụng cho đô thị thông minh và trạm kiểm soát.</i>",
        "",
        "Chào mừng bạn đến với trợ lý tương tác <b>TrafficAI</b>. "
        "Hệ thống tự động phát hiện phương tiện (YOLOv12), bám vết thời gian thực (ByteTrack), "
        "nhận diện biển số độ chính xác cao (PaddleOCR) và tự động tạo hồ sơ đối soát vi phạm.",
        "",
        "<b>✨ Bạn có thể trải nghiệm ngay:</b>",
        "1. Tra cứu biển số & xem chuỗi ảnh chứng cứ thực tế.",
        "2. Khám phá kiến trúc Edge AI & luồng xử lý đồng thuận đa khung hình.",
        "3. Xem video demo vận hành hệ thống đa luồng camera.",
        "4. Tham khảo bảng tra cứu lỗi vi phạm theo Nghị định 168/2024/NĐ-CP.",
        "",
        "👇 Chọn một nút chức năng bên dưới để bắt đầu:",
    ])


def _intro_text() -> str:
    return "\n".join([
        "ℹ️ <b>TỔNG QUAN GIẢI PHÁP THƯƠNG MẠI TRAFFICAI</b>",
        "",
        "TrafficAI là nền tảng quản trị và giám sát giao thông thông minh ứng dụng Thị giác máy tính (Computer Vision):",
        "",
        "<b>🔹 Đầu vào:</b> Luồng camera RTSP công nghiệp, camera giao thông hoặc video ghi hình.",
        "<b>🔹 Xử lý AI:</b> Nhận diện đa loại xe, định danh theo ID (Tracking), khoanh vùng và nhận dạng ký tự biển số (OCR) kết hợp thuật toán bỏ phiếu đa khung hình.",
        "<b>🔹 Nghiệp vụ:</b> Tự động lập biên bản điện tử, trích xuất hồ sơ chứng cứ pháp lý, gửi cảnh báo tức thì qua Telegram và API tích hợp.",
        "",
        "🎯 <b>Giá trị thương mại:</b> Giảm 90% thời gian rà soát thủ công, minh bạch hóa quy trình phạt nguội, sẵn sàng triển khai tại các đô thị, trạm thu phí BOT và khu công nghiệp.",
    ])


def _features_text() -> str:
    return "\n".join([
        "🏆 <b>TÍNH NĂNG VÀ ƯU ĐIỂM THƯƠNG MẠI VƯỢT TRỘI</b>",
        "",
        "<b>1 · Nhận diện biển số tốc độ cao (Real-time ALPR)</b>\nTối ưu hóa mô hình AI xử lý trên 30+ FPS/luồng, độ chính xác đạt trên 98% trong nhiều điều kiện thời tiết và môi trường ánh sáng phức tạp.",
        "",
        "<b>2 · Chuỗi chứng cứ pháp lý không thể chối cãi</b>\nMỗi hồ sơ lưu trữ đồng bộ: ảnh toàn cảnh phương tiện, ảnh phóng to biển số, camera ID, tọa độ thời gian và độ tin cậy AI.",
        "",
        "<b>3 · Quy trình nghiệp vụ hoàn chỉnh (End-to-End Workflow)</b>\nTự động đối chiếu quy chuẩn pháp luật (NĐ 168/2024/NĐ-CP), tạo biên bản vi phạm chuẩn hóa và hỗ trợ xuất hồ sơ PDF.",
        "",
        "<b>4 · Báo cáo & Phân tích lưu lượng thông minh</b>\nBiểu đồ mật độ phương tiện theo giờ, bản đồ nhiệt làn đường, phân loại xe và cảnh báo điểm nghẽn giao thông.",
        "",
        "<b>5 · Khả năng tích hợp & Mở rộng linh hoạt (API-Ready)</b>\nCung cấp REST API bảo mật, sẵn sàng tích hợp với hệ thống điều hành đô thị IOC, cổng kiểm soát tự động và trạm cân xe.",
    ])


def _architecture_text() -> str:
    return "\n".join([
        "🧠 <b>LUỒNG XỬ LÝ AI END-TO-END</b>",
        "",
        "<code>Camera / Video</code>",
        "        ↓",
        "<code>YOLO nhận diện phương tiện</code>",
        "        ↓",
        "<code>Tracking theo track_id</code>",
        "        ↓",
        "<code>Crop xe + phát hiện vùng biển</code>",
        "        ↓",
        "<code>OCR + đồng thuận nhiều khung hình</code>",
        "        ↓",
        "<code>Quality gate → Hồ sơ + ảnh chứng cứ</code>",
        "        ↓",
        "<code>Dashboard / Báo cáo / Telegram</code>",
        "",
        "✅ Dữ liệu chỉ được bot hiển thị khi biển số đạt ngưỡng tin cậy, giúp giảm nguy cơ ghép nhầm xe và biển.",
    ])


def _workflow_text() -> str:
    return "\n".join([
        "🗂️ <b>QUY TRÌNH XỬ LÝ VI PHẠM</b>",
        "",
        "① <b>Ghi nhận</b> · Camera lưu phương tiện và ảnh chứng cứ.",
        "② <b>Phân tích AI</b> · Nhận diện xe, tracking, OCR và chấm độ tin cậy.",
        "③ <b>Kiểm tra</b> · Bản ghi chưa chắc chắn được đưa vào luồng duyệt OCR.",
        "④ <b>Đối chiếu</b> · So sánh ảnh xe, ảnh biển, thông tin mô phỏng và căn cứ xử phạt.",
        "⑤ <b>Lập biên bản</b> · Tạo hồ sơ responsive, hỗ trợ in hoặc lưu PDF.",
        "⑥ <b>Theo dõi trạng thái</b> · Chờ duyệt → đã xác nhận → đã gửi → đã xử lý.",
        "⑦ <b>Phân tích</b> · Tổng hợp dữ liệu lên dashboard và Telegram.",
        "",
        "🛡️ AI hỗ trợ phát hiện; quyết định nghiệp vụ cuối cùng luôn có bước kiểm tra của con người.",
        "",
        "👉 Chọn <b>Biển số đã ghi nhận</b>, mở một hồ sơ rồi nhấn <b>📄 Xem biên bản</b> để thử luồng hoàn chỉnh.",
    ])


def _analytics_text() -> str:
    return "\n".join([
        "📊 <b>PHÂN TÍCH & QUẢN TRỊ VẬN HÀNH</b>",
        "",
        "• Tổng quan lưu lượng và cơ cấu phương tiện theo camera.",
        "• Heatmap làn xe, thống kê làn và cảnh báo chen làn.",
        "• Theo dõi chất lượng ảnh xe, crop biển, OCR và bản ghi cần kiểm tra.",
        "• Tìm kiếm thông minh theo biển số, loại xe, camera và thời gian.",
        "• Bản đồ vị trí camera và trạng thái hạ tầng.",
        "• Báo cáo phục vụ thuyết trình, đối soát và đánh giá vận hành.",
        "",
        "📌 Nhờ trang debug AI, nhóm có thể giải thích vì sao một bản ghi tốt hoặc cần xem lại thay vì chỉ đưa ra kết quả hộp đen.",
    ])


def _tour_keyboard(next_callback: str, next_label: str) -> Dict[str, Any]:
    return {
        "inline_keyboard": [
            [{"text": next_label, "callback_data": next_callback}],
            [
                {"text": "🎬 Video demo", "callback_data": "demo"},
                {"text": "🏠 Tổng quan", "callback_data": "home"},
            ],
        ]
    }


def _quick_tour_start_text() -> str:
    return "\n".join([
        "🎯 <b>TRẢI NGHIỆM NHANH 90 GIÂY · BƯỚC 1/5</b>",
        "<i>Điểm nổi bật của Smart Traffic AI</i>",
        "",
        "• Nhận diện phương tiện, tracking và OCR biển số theo camera.",
        "• Lưu đồng thời ảnh toàn xe và crop biển để làm chứng cứ.",
        "• Giải thích kết quả AI bằng OCR, bỏ phiếu, chất lượng crop và trạng thái duyệt.",
        "• Tạo hồ sơ, biên bản responsive và theo dõi quy trình xử lý.",
        "• Tra cứu dữ liệu đã lưu ngay trên Telegram hoặc dashboard.",
        "",
        "Tiếp theo, bạn sẽ chọn một biển số thật trong lịch sử hệ thống.",
    ])


def _quick_tour_start_keyboard() -> Dict[str, Any]:
    return {
        "inline_keyboard": [
            [{"text": "🚘 Bước 2 · Chọn biển số", "callback_data": "quick_tour:plates"}],
            [
                {"text": "❌ Dừng trải nghiệm", "callback_data": "quick_tour:cancel"},
                {"text": "🏠 Tổng quan", "callback_data": "home"},
            ],
        ]
    }


def _quick_tour_plates_keyboard(payload: Dict[str, Any]) -> Dict[str, Any]:
    items = _unique_valid_plate_items(payload, limit=10)
    rows: List[List[Dict[str, str]]] = []
    current: List[Dict[str, str]] = []
    for item in items:
        plate = _clean_text(item.get("license_plate") or "").strip()
        key = _plate_key(plate)
        if not key:
            continue
        current.append({"text": f"🚘 {plate}", "callback_data": f"tour_plate:{key}"})
        if len(current) == 2:
            rows.append(current)
            current = []
    if current:
        rows.append(current)
    rows.append([
        {"text": "❌ Dừng trải nghiệm", "callback_data": "quick_tour:cancel"},
        {"text": "🏠 Tổng quan", "callback_data": "home"},
    ])
    return {"inline_keyboard": rows}


def _quick_tour_workflow_keyboard() -> Dict[str, Any]:
    return {
        "inline_keyboard": [
            [{"text": "✅ Hoàn tất trải nghiệm", "callback_data": "quick_tour:finish"}],
            [
                {"text": "🔁 Xem lại 90 giây", "callback_data": "quick_tour:start"},
                {"text": "🏠 Tổng quan", "callback_data": "home"},
            ],
        ]
    }


def _demo_text() -> str:
    return "\n".join([
        "<b>VIDEO DEMO DỰ ÁN</b>",
        "",
        "🎬 Video minh họa luồng nổi bật của hệ thống:",
        "• Giám sát đa camera và nhận diện phương tiện.",
        "• Tracking, crop biển, OCR và lưu ảnh chứng cứ.",
        "• Tra cứu hồ sơ, đối chiếu vi phạm và báo cáo.",
        "",
        "Nhấn nút <b>🎬 Xem video demo</b> để nhận video ngay.",
    ])


def _demo_video_path() -> Optional[Path]:
    """Resolve the demo video portably while preserving the current local asset."""
    project_root = Path(__file__).resolve().parents[1]
    candidates = [
        Path(_env("TELEGRAM_DEMO_VIDEO_PATH")) if _env("TELEGRAM_DEMO_VIDEO_PATH") else None,
        project_root / "output" / "demo_video" / "smart_traffic_demo_quick_guide.mp4",
        project_root / "demo_smart_traffic.mp4",
        Path(r"C:\Users\syanh\Downloads\202606241123 (1).mp4"),
    ]
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate
    return None


def _demo_caption() -> str:
    return "\n".join([
        "🎬 <b>VIDEO DEMO · SMART TRAFFIC AI</b>",
        "",
        "Luồng camera → nhận diện & tracking → OCR biển số → hồ sơ chứng cứ → phân tích và tra cứu.",
    ])


def _send_demo_video(client: httpx.Client, token: str, chat_id: int | str) -> None:
    """Send the retained demo quickly via file_id, with a portable local fallback."""
    cache_file_id_path = Path(__file__).with_name("demo_video_file_id.txt")

    # ── Bước 1: Gửi ngay bằng file_id đã cache (tức thì, không loading) ──
    if cache_file_id_path.is_file():
        try:
            cached_file_id = cache_file_id_path.read_text(encoding="utf-8").strip()
            if cached_file_id:
                payload = {
                    "chat_id": chat_id,
                    "video": cached_file_id,
                    "caption": _demo_caption(),
                    "parse_mode": "HTML",
                    "supports_streaming": "true",
                }
                client.post(_telegram_url(token, "sendVideo"), data=payload, timeout=30).raise_for_status()
                _send_message(
                    client,
                    token,
                    chat_id,
                    "✅ Video demo đã sẵn sàng. Bạn có thể tiếp tục khám phá dữ liệu trực tiếp bên dưới.",
                    reply_markup=_assistant_inline_keyboard(),
                )
                return
        except Exception:
            # Cache có thể hết hiệu lực; giữ lại để không làm mất video khi lỗi mạng tạm thời.
            pass

    # ── Bước 2: Lần đầu tiên — upload file (chỉ xảy ra 1 lần duy nhất) ──
    video_path = _demo_video_path()
    if video_path is None:
        _send_message(
            client, token, chat_id,
            "⚠️ Video demo hiện chưa khả dụng trên máy chạy bot. "
            "Vui lòng cấu hình <code>TELEGRAM_DEMO_VIDEO_PATH</code> hoặc thử lại sau.",
            reply_markup=_assistant_inline_keyboard(),
        )
        return

    # Thông báo loading CHỈ khi cần upload lần đầu
    _send_message(client, token, chat_id, "⏳ <i>Lần đầu gửi video — đang upload, xin chờ khoảng 30-60 giây...</i>")

    try:
        with video_path.open("rb") as video_stream:
            payload = {
                "chat_id": chat_id,
                "caption": _demo_caption(),
                "parse_mode": "HTML",
                "supports_streaming": "true",
            }
            files = {"video": ("smart_traffic_demo.mp4", video_stream, "video/mp4")}
            resp = client.post(_telegram_url(token, "sendVideo"), data=payload, files=files, timeout=300)
            resp.raise_for_status()

        # Lưu file_id để các lần sau gửi tức thì
        resp_data = resp.json()
        if "result" in resp_data and "video" in resp_data["result"]:
            new_file_id = resp_data["result"]["video"]["file_id"]
            temp_cache_path = cache_file_id_path.with_suffix(".txt.tmp")
            temp_cache_path.write_text(new_file_id, encoding="utf-8")
            os.replace(temp_cache_path, cache_file_id_path)

        _send_message(
            client, token, chat_id,
            "✅ Video demo đã gửi và được lưu cache để những lần sau mở nhanh hơn.",
            reply_markup=_assistant_inline_keyboard(),
        )
    except Exception as exc:
        _send_message(
            client,
            token,
            chat_id,
            f"⚠️ Chưa thể gửi video lúc này: {_h(exc)}",
            reply_markup=_assistant_inline_keyboard(),
        )


def _help_text() -> str:
    return "\n".join([
        "❓ <b>HƯỚNG DẪN CHO NGƯỜI MỚI</b>",
        "",
        "<b>Cách dễ nhất để trải nghiệm</b>",
        "Chọn <b>🎯 Trải nghiệm nhanh 90 giây</b>; bot sẽ tự dẫn qua điểm nổi bật, "
        "biển số, ảnh chứng cứ, biên bản và quy trình xử lý.",
        "",
        "<b>Tìm một biển số cụ thể</b>",
        "Chọn <b>🔎 Tra cứu biển số</b>, sau đó nhập trực tiếp biển cần tìm. Không cần nhớ lệnh.",
        "Dùng <code>/cancel</code> hoặc nút <b>❌ Hủy tìm kiếm</b> để thoát ô nhập.",
        "",
        "<b>Lệnh nhanh</b>",
        "/logs – Lịch sử biển số đã lưu",
        "/plate BIEN – Tra cứu một biển số, ví dụ <code>/plate 30F89060</code>",
        "/cancel – Hủy thao tác tìm kiếm hiện tại",
        "/process – Xem quy trình xử lý vi phạm",
        "/showcase – Xem điểm nổi bật của phần mềm",
        "/demo – Nhận video demo",
        "",
        "💡 Bạn cũng có thể gửi trực tiếp một biển số mà không cần gõ lệnh. "
        "Thông tin chủ phương tiện trong bot được ghi rõ là dữ liệu mô phỏng.",
    ])


def _home_text() -> str:
    return "\n".join([
        "🤖 <b>TRAFFICAI · TRỢ LÝ GIÁM SÁT THÔNG MINH</b>",
        "",
        "Trợ lý kết nối trực tiếp với hệ thống TrafficAI để cung cấp thông tin kiến trúc, video demo vận hành, "
        "tra cứu lịch sử biển số, kiểm tra chuỗi ảnh chứng cứ và xem biên bản xử lý.",
        "",
        "👇 <b>Chọn một chức năng nghiệp vụ bên dưới:</b>",
    ])


def _contact_text() -> str:
    return "\n".join([
        "💼 <b>LIÊN HỆ HỢP TÁC & CHUYỂN GIAO CÔNG NGHỆ</b>",
        "",
        "TrafficAI sẵn sàng cung cấp và chuyển giao giải pháp cho các đơn vị, doanh nghiệp và đối tác:",
        "• Triển khai trạm giám sát giao thông đô thị và kiểm soát làn BOT.",
        "• Hệ thống quản lý bãi đỗ xe thông minh & kiểm soát cổng tự động.",
        "• Cung cấp SDK / REST API nhận diện biển số tích hợp vào phần mềm sẵn có.",
        "",
        "📧 <b>Email:</b> contact@trafficai.vn",
        "🌐 <b>Website:</b> https://hethong-giaothong-ai.netlify.app",
        "📱 <b>Hỗ trợ kỹ thuật:</b> 024-12345678",
    ])


def _violation_categories_text() -> str:
    return "\n".join([
        "📚 <b>BẢNG TRA CỨU QUY ĐỊNH GIAO THÔNG</b>",
        "<i>(Theo Nghị định 168/2024/NĐ-CP - Hiệu lực 01/01/2025)</i>",
        "",
        "🚗 <b>Nhóm Ô tô:</b>",
        "▪️ Vượt đèn đỏ: 18-20 triệu, tước GPLX 6-8 tháng.",
        "▪️ Quá tốc độ 10-20km/h: 4-6 triệu.",
        "▪️ Quá tốc độ >35km/h: 12-14 triệu, tước GPLX 2-4 tháng.",
        "▪️ Đi ngược chiều: 16-18 triệu, tước GPLX 5-7 tháng.",
        "▪️ Nồng độ cồn >80mg: 40-50 triệu, tước GPLX 22-24 tháng.",
        "",
        "🏍️ <b>Nhóm Xe máy:</b>",
        "▪️ Vượt đèn đỏ: 4-6 triệu, tước GPLX 3-5 tháng.",
        "▪️ Quá tốc độ >20km/h: 4-5 triệu, tước GPLX 2-4 tháng.",
        "▪️ Không đội mũ bảo hiểm: 800k - 1 triệu.",
        "▪️ Đi ngược chiều: 4-5 triệu, tước GPLX 3-5 tháng.",
        "",
        "🚚 <b>Nhóm Xe tải / Xe buýt:</b>",
        "▪️ Vượt đèn đỏ: 18-20 triệu, tước GPLX 6-8 tháng.",
        "▪️ Quá tải trọng >150%: 40-50 triệu, tước GPLX 3-5 tháng.",
        "▪️ Đón trả khách sai quy định: 3-5 triệu.",
        "",
        "<i>Lưu ý: Dữ liệu mang tính tham khảo. Để xem và tùy chỉnh toàn bộ hơn 30 quy định, vui lòng sử dụng tab \"Danh mục vi phạm\" trên Web.</i>",
    ])


def _plate_lookup_prompt() -> str:
    return "\n".join([
        "🔎 <b>NHẬP BIỂN SỐ CẦN TRA CỨU</b>",
        "",
        "Vui lòng nhập biển số vào ô trả lời bên dưới, không cần gõ lệnh.",
        "Ví dụ: <code>30F-890.60</code> hoặc <code>30F89060</code>.",
        "Dùng <code>/cancel</code> hoặc nút bên dưới nếu muốn thoát.",
    ])


def _plate_search_force_reply() -> Dict[str, Any]:
    return {
        "force_reply": True,
        "selective": True,
        "input_field_placeholder": "Nhập biển số, ví dụ 30F-890.60",
    }


def _send_plate_search_prompt(client: httpx.Client, token: str, chat_id: int | str) -> None:
    _send_message(
        client,
        token,
        chat_id,
        _plate_lookup_prompt(),
        reply_markup=_plate_search_force_reply(),
    )
    _send_message(
        client,
        token,
        chat_id,
        "Không muốn tra cứu lúc này?",
        reply_markup={
            "inline_keyboard": [[
                {"text": "❌ Hủy tìm kiếm", "callback_data": "cancel_search"},
            ]]
        },
    )


def _is_plate_search_reply(message: Dict[str, Any]) -> bool:
    replied_message = message.get("reply_to_message") if isinstance(message, dict) else None
    prompt_text = str((replied_message or {}).get("text") or "").upper()
    return "NHẬP BIỂN SỐ CẦN TRA CỨU" in prompt_text


def _violations_today_payload(
    client: httpx.Client,
    backend_url: str,
    limit: int = 50,
) -> Dict[str, Any]:
    return _backend_get(
        client,
        backend_url,
        f"/api/telegram/daily-violations?limit={max(1, min(limit, 50))}&mode=violations",
    )


def _retained_logs_payload(
    client: httpx.Client,
    backend_url: str,
    limit: int = 200,
) -> Dict[str, Any]:
    return _backend_get(
        client,
        backend_url,
        f"/api/telegram/daily-violations?limit={max(1, min(limit, 200))}&mode=all&scope=history",
    )


def _is_night_record(item: Dict[str, Any]) -> bool:
    lighting = str(item.get("lighting_condition") or "").strip().lower()
    if lighting in {"day", "night"}:
        return lighting == "night"
    timestamp = str(item.get("timestamp") or "")
    match = re.search(r"\b(\d{2}):(\d{2})(?::\d{2})?\b", timestamp)
    if not match:
        return False
    hour = int(match.group(1))
    return hour >= 18 or hour < 6


def _send_log_period_menu(client: httpx.Client, token: str, chat_id: int | str, backend_url: str = "") -> None:
    url = backend_url or _env("INTERNAL_API_URL", "http://127.0.0.1:8000")
    _send_plates(client, token, url, chat_id)


def _send_period_logs(
    client: httpx.Client,
    token: str,
    backend_url: str,
    chat_id: int | str,
    *,
    is_night: bool = False,
) -> None:
    _send_plates(client, token, backend_url, chat_id)


def _send_night_logs(client: httpx.Client, token: str, backend_url: str, chat_id: int | str) -> None:
    _send_plates(client, token, backend_url, chat_id)


def _send_day_logs(client: httpx.Client, token: str, backend_url: str, chat_id: int | str) -> None:
    _send_plates(client, token, backend_url, chat_id)


def _format_violations_today(payload: Dict[str, Any]) -> str:
    items = [
        item for item in (payload.get("items") or [])
        if _is_violation_item(item) and _item_has_reliable_plate(item)
    ]
    date = _h(payload.get("date") or time.strftime("%d/%m/%Y"))
    if not items:
        return "\n".join([
            f"🚨 <b>BIỂN VI PHẠM HÔM NAY – {date}</b>",
            "",
            "Chưa có bản ghi vi phạm nào đủ độ tin cậy để hiển thị.",
            "Bạn có thể bấm <b>Làm mới</b> sau khi hệ thống ghi nhận dữ liệu mới.",
        ])

    lines = [
        f"🚨 <b>BIỂN VI PHẠM HÔM NAY – {date}</b>",
        f"Tổng số bản ghi đủ tin cậy: <b>{len(items)}</b>",
        "",
    ]
    for index, item in enumerate(items[:20], start=1):
        plate = _h(item.get("license_plate") or "-")
        violation = _h(item.get("violation_type") or "Chưa phân loại")
        camera = _h(item.get("camera_id") or "-")
        timestamp = _h(item.get("timestamp") or "-")
        lines.extend([
            f"<b>{index}. 🚘 {plate}</b>",
            f"   ⚠️ {violation}",
            f"   📷 {camera} · 🕒 {timestamp}",
            "",
        ])
    lines.append("Chạm vào biển số bên dưới để xem hồ sơ và ảnh chứng cứ.")
    return "\n".join(lines).strip()


def _violations_today_keyboard(payload: Dict[str, Any]) -> Dict[str, Any]:
    rows: List[List[Dict[str, str]]] = []
    current: List[Dict[str, str]] = []
    for item in payload.get("items") or []:
        if not _is_violation_item(item) or not _item_has_reliable_plate(item):
            continue
        plate = str(item.get("license_plate") or "").strip().upper()
        key = _plate_key(plate)
        if not key:
            continue
        current.append({"text": f"🚘 {plate}", "callback_data": f"plate:{key}"})
        if len(current) == 2:
            rows.append(current)
            current = []
        if len(rows) >= 8:
            break
    if current:
        rows.append(current)
    rows.append([
        {"text": "🔄 Làm mới", "callback_data": "violations_today"},
        {"text": "📚 Danh mục lỗi", "callback_data": "violation_categories"},
    ])
    rows.append([{"text": "🏠 Về tổng quan", "callback_data": "home"}])
    return {"inline_keyboard": rows}


def _send_home(client: httpx.Client, token: str, chat_id: int | str) -> None:
    _send_message(client, token, chat_id, _home_text(), reply_markup=_main_keyboard())
    _send_message(
        client,
        token,
        chat_id,
        "🧭 <b>KHÁM PHÁ NHANH</b>\nChọn nút để xem nội dung tương ứng.",
        reply_markup=_assistant_inline_keyboard(),
    )


def _send_showcase(client: httpx.Client, token: str, chat_id: int | str) -> None:
    """Present the strongest project differentiators without depending on live data."""
    _send_message(
        client,
        token,
        chat_id,
        _features_text(),
        reply_markup=_tour_keyboard("architecture", "Tiếp theo · 🧠 Luồng xử lý AI"),
    )


def _send_welcome(client: httpx.Client, token: str, chat_id: int | str) -> None:
    """Give first-time users one concise, self-explanatory entry point."""
    _send_message(client, token, chat_id, _start_text(), reply_markup=_main_keyboard())
    _send_message(
        client,
        token,
        chat_id,
        "🧭 <b>BẠN MUỐN KHÁM PHÁ PHẦN NÀO TRƯỚC?</b>",
        reply_markup=_onboarding_keyboard(),
    )


def _send_violations_today(
    client: httpx.Client,
    token: str,
    backend_url: str,
    chat_id: int | str,
) -> None:
    payload = _violations_today_payload(client, backend_url, limit=50)
    _send_message(
        client,
        token,
        chat_id,
        _format_violations_today(payload),
        reply_markup=_violations_today_keyboard(payload),
    )


def _item_line(index: int, item: Dict[str, Any]) -> str:
    plate = _h(item.get("license_plate") or "Chưa xác nhận OCR")
    vehicle = _h(item.get("vehicle_type") or "Chưa phân loại")
    violation = _h(item.get("violation_type") or "Chưa phân loại")
    camera = _h(item.get("camera_id") or "-")
    timestamp = _h(item.get("timestamp") or "-")
    fine = _h(item.get("fine_amount") or "Cần đối chiếu")
    return (
        f"<b>{index}. {plate}</b>\n"
        f"   - Xe: {vehicle}\n"
        f"   - Lỗi: {violation}\n"
        f"   - Thời gian: {timestamp}\n"
        f"   - Camera: {camera}\n"
        f"   - Mức phạt dự kiến: {fine}"
    )


def _format_today_message(payload: Dict[str, Any]) -> str:
    items: List[Dict[str, Any]] = payload.get("items") or []
    date = _h(payload.get("date") or "")
    if not items:
        return (
            f"<b>Danh sách bản ghi hôm nay {date}</b>\n\n"
            "Hiện chưa có biển số đủ rõ được hệ thống trả về.\n"
            "Anh/chị có thể thử lại sau hoặc nhập biển số cụ thể để tra cứu."
        )

    lines = [
        f"<b>Danh sách bản ghi xe/biển hôm nay {date}</b>",
        f"Tổng bản ghi trả về: <b>{len(items)}</b>",
        "Bấm vào nút biển số bên dưới để xem chi tiết, ảnh xe và ảnh crop biển.",
        "",
    ]
    for index, item in enumerate(items[:10], start=1):
        lines.append(_item_line(index, item))
        lines.append("")
    lines.append("Cách 2: nhập trực tiếp <code>/plate BIENSO</code>.")
    return "\n".join(lines).strip()


def _format_plates_message(payload: Dict[str, Any]) -> str:
    rows = _unique_valid_plate_items(payload, limit=20)
    if not rows:
        return (
            "🚘 <b>BIỂN SỐ ĐÃ GHI NHẬN</b>\n\n"
            "Chưa có biển số đủ độ tin cậy trong lịch sử đã lưu. "
            "Hãy thử lại sau khi hệ thống ghi nhận dữ liệu mới."
        )

    return "\n".join([
        "🚘 <b>BIỂN SỐ ĐÃ GHI NHẬN</b>",
        "",
        f"Có <b>{len(rows)}</b> biển số đủ độ tin cậy trong nhóm bản ghi gần nhất.",
        "Chọn một biển số bên dưới để xem:",
        "• Ảnh crop toàn xe và ảnh crop biển số.",
        "• Thông tin phương tiện/chủ xe mô phỏng.",
        "• Trạng thái xử lý và biên bản responsive.",
    ])


def _logs_keyboard(payload: Dict[str, Any]) -> Dict[str, Any]:
    rows = _plate_inline_keyboard(
        _unique_valid_plate_items(payload, limit=20),
        include_today_button=False,
    ) or {"inline_keyboard": []}
    keyboard_rows = list(rows["inline_keyboard"])
    keyboard_rows.extend([
        [{"text": "🔎 Tìm biển số khác", "callback_data": "search_plate"}],
        [
            {"text": "🔄 Làm mới lịch sử", "callback_data": "logs"},
            {"text": "🚨 Vi phạm hôm nay", "callback_data": "violations_today"},
        ],
        [
            {"text": "🗂️ Quy trình xử lý", "callback_data": "workflow"},
            {"text": "🏠 Tổng quan", "callback_data": "home"},
        ],
    ])
    return {"inline_keyboard": keyboard_rows}


def _format_plate_message(payload: Dict[str, Any], plate: str) -> str:
    items: List[Dict[str, Any]] = payload.get("items") or []
    clean_plate = _h(plate)
    if not items:
        return (
            f"<b>Không tìm thấy hồ sơ cho biển {clean_plate}</b>\n\n"
            "Có thể biển chưa được OCR đủ tin cậy, chưa phát sinh vi phạm, "
            "hoặc bản ghi đã nằm ngoài dữ liệu hiện tại."
        )

    latest = items[0]
    lines = [
        f"<b>Hồ sơ tra cứu biển {clean_plate}</b>",
        f"Tìm thấy <b>{len(items)}</b> bản ghi gần nhất.",
        "",
        "<b>Bản ghi mới nhất</b>",
        _item_line(1, latest),
    ]

    basis = latest.get("legal_basis")
    if basis:
        lines.extend(["", f"<b>Căn cứ:</b> {_h(basis)}"])

    owner_rows = [
        ("Chủ xe", latest.get("owner_name")),
        ("Điện thoại", latest.get("owner_phone")),
        ("Email", latest.get("owner_email")),
        ("Địa chỉ", latest.get("owner_address")),
    ]
    owner_lines = [f"- {label}: {_h(value)}" for label, value in owner_rows if value]
    if owner_lines:
        lines.extend(["", "<b>Thông tin chủ phương tiện</b>", *owner_lines])

    has_vehicle = bool(latest.get("vehicle_image_b64"))
    has_plate = bool(latest.get("plate_image_b64"))
    lines.extend([
        "",
        "<b>Ảnh chứng cứ</b>",
        "Bot sẽ gửi ảnh toàn cảnh phương tiện và ảnh crop biển ngay bên dưới." if (has_vehicle or has_plate) else "Bản ghi này chưa có ảnh chứng cứ trong dữ liệu bot.",
    ])

    if len(items) > 1:
        lines.extend(["", "<b>Lịch sử gần nhất</b>"])
        for index, item in enumerate(items[1:6], start=2):
            lines.append(
                f"{index}. {_h(item.get('timestamp'))} | "
                f"{_h(item.get('violation_type'))} | "
                f"{_h(item.get('camera_id'))}"
            )

    lines.extend([
        "",
        "Nếu thông tin chưa khớp, vui lòng đối chiếu lại ảnh toàn cảnh xe và ảnh crop biển trong phần mềm.",
    ])
    return "\n".join(lines).strip()


def _send_plate_evidence(client: httpx.Client, token: str, chat_id: int | str, payload: Dict[str, Any]) -> None:
    items: List[Dict[str, Any]] = payload.get("items") or []
    if not items:
        return
    latest = items[0]
    plate = _h(latest.get("license_plate") or "")
    if not _item_has_reliable_plate(latest):
        score = _ocr_score(latest)
        _send_message(
            client,
            token,
            chat_id,
            f"Bản ghi biển <b>{plate}</b> có độ tin cậy OCR thấp ({score:.2f}), nên bot không gửi ảnh tự động để tránh ghép sai xe và biển. Vui lòng đối chiếu trong phần mềm.",
            reply_markup=_main_keyboard(),
        )
        return
    sent_vehicle = _send_photo(client, token, chat_id, latest.get("vehicle_image_b64"), f"Ảnh toàn cảnh phương tiện - biển <b>{plate}</b>")
    sent_plate = _send_photo(client, token, chat_id, latest.get("plate_image_b64"), f"Ảnh crop biển số / định danh - <b>{plate}</b>")
    if not sent_vehicle and not sent_plate:
        _send_message(
            client,
            token,
            chat_id,
            "Bản ghi này chưa có ảnh toàn cảnh xe hoặc ảnh crop biển trong dữ liệu bot.",
            reply_markup=_main_keyboard(),
        )


def _plate_result_keyboard(items: List[Dict[str, Any]], *, quick_tour: bool = False) -> Dict[str, Any]:
    rows: List[List[Dict[str, str]]] = []
    latest = items[0] if items else {}
    notice_url = _signed_notice_url(latest.get("id"))
    notice_id = latest.get("id")
    if notice_id:
        notice_row: List[Dict[str, str]] = [
            {
                "text": "📄 Bước 4 · Xem biên bản" if quick_tour else "📄 Hiện biên bản trong bot",
                "callback_data": f"tour_notice:{notice_id}" if quick_tour else f"notice:{notice_id}",
            },
        ]
        if notice_url:
            notice_row.append({"text": "🌐 Bản đầy đủ / PDF", "url": notice_url})
        rows.append(notice_row)
    plate_key = _plate_key(latest.get("license_plate"))
    refresh_button = (
        {"text": "🔄 Làm mới hồ sơ", "callback_data": f"plate:{plate_key}"}
        if plate_key
        else {"text": "🚘 Lịch sử biển số", "callback_data": "logs"}
    )
    if quick_tour:
        rows.append([
            {"text": "❌ Dừng trải nghiệm", "callback_data": "quick_tour:cancel"},
            {"text": "🏠 Tổng quan", "callback_data": "home"},
        ])
        return {"inline_keyboard": rows}

    rows.extend([
        [
            {"text": "🗂️ Quy trình xử lý", "callback_data": "workflow"},
            refresh_button,
        ],
        [
            {"text": "🚘 Biển số đã ghi nhận", "callback_data": "logs"},
            {"text": "🏠 Tổng quan", "callback_data": "home"},
        ],
    ])
    return {"inline_keyboard": rows}


def _is_truck_body_source(item: Dict[str, Any]) -> bool:
    """Kiem tra xem ban ghi co phai doc tu than xe tai (truck body) khong."""
    source = str(item.get("plate_crop_source") or "").lower()
    reason = str(item.get("plate_debug_reason") or "").lower()
    return "truck_body" in source or "truck_body" in reason


def _format_ai_explanation(item: Dict[str, Any]) -> List[str]:
    score = _ocr_score(item)
    votes = int(item.get("vote_count") or 0)
    vehicle_quality = float(item.get("vehicle_crop_quality") or 0.0)
    plate_quality = float(item.get("plate_crop_quality") or 0.0)
    vehicle_label = _h(item.get("vehicle_crop_quality_label") or "Chưa đánh giá")
    plate_label = _h(item.get("plate_crop_quality_label") or "Chưa đánh giá")
    accepted = str(item.get("ai_acceptance_status") or "").lower() == "accepted"
    needs_review = bool(item.get("needs_review", True))
    reasons = [str(reason).strip() for reason in (item.get("ai_acceptance_reasons") or []) if str(reason).strip()]

    lines = [
        "<b>🧠 Vì sao AI đưa ra kết quả?</b>",
        f"• OCR: <b>{score:.0%}</b>" if score else "• OCR: chưa có điểm",
        f"• Bỏ phiếu theo track: <b>{votes} lượt</b>",
        f"• Crop toàn xe: <b>{vehicle_label}</b> ({vehicle_quality:.0f}/100)",
        f"• Crop biển số: <b>{plate_label}</b> ({plate_quality:.0f}/100)",
        f"• Điều kiện AI: <b>{'Đủ ngưỡng hiển thị' if accepted else 'Chưa đủ ngưỡng tự động'}</b>",
        f"• Kiểm duyệt: <b>{'Cần người dùng duyệt lại' if needs_review else 'Đã đủ điều kiện đối chiếu'}</b>",
    ]
    if reasons:
        lines.extend([f"  ↳ {_h(reason)}" for reason in reasons[:2]])
    lines.append("<i>Điểm crop được đánh giá lại từ ảnh chứng cứ đã lưu; không thay đổi kết quả AI gốc.</i>")
    return lines


def _format_plate_message_clean(payload: Dict[str, Any], plate: str) -> str:
    items: List[Dict[str, Any]] = payload.get("items") or []
    clean_plate = _h(plate)
    if not items:
        return (
            f"🔎 <b>KHÔNG TÌM THẤY HỒ SƠ {clean_plate}</b>\n\n"
            "Biển số có thể chưa đạt ngưỡng OCR, chưa có trong lịch sử đã lưu "
            "hoặc đã được nhập khác định dạng."
        )

    latest = items[0]
    vehicle = _h(latest.get("vehicle_type") or "Chưa phân loại")
    violation = _h(latest.get("violation_type") or "Chưa ghi nhận")
    camera = _h(latest.get("camera_id") or "-")
    timestamp = _h(latest.get("timestamp") or "-")
    fine = _h(latest.get("fine_amount") or "Cần đối chiếu")
    score = _ocr_score(latest)
    is_truck_body = _is_truck_body_source(latest)
    status_labels = {
        "pending": "Chờ duyệt",
        "confirmed": "Đã xác nhận",
        "approved": "Đã xác nhận",
        "notice_exported": "Đã lập biên bản",
        "notified": "Đã gửi thông báo",
        "resolved": "Đã xử lý",
        "rejected": "Đã hủy",
    }
    raw_status = str(latest.get("review_status") or "pending").strip().lower()
    status = _h(status_labels.get(raw_status, raw_status or "Chờ duyệt"))
    case_code = _h(latest.get("case_code") or f"HS-{latest.get('id') or '-'}")
    track_id = _h(latest.get("track_id") if latest.get("track_id") is not None else "Chưa có")

    display_plate = _h(latest.get("license_plate") or clean_plate)
    lines = [
        f"🚘 <b>HỒ SƠ PHƯƠNG TIỆN / BIÊN BẢN VI PHẠM</b>",
        f"• Biển số: <b>{display_plate}</b>",
        f"• Mã hồ sơ: <code>{case_code}</code>",
        "",
        "<b>📷 Dữ liệu ghi nhận</b>",
        f"• Phương tiện: <b>{vehicle}</b>",
        f"• Thời gian: {timestamp}",
        f"• Camera: {camera}",
        f"• Track ID: {track_id}",
        f"• Độ tin cậy OCR: <b>{score:.0%}</b>" if score else "• Độ tin cậy OCR: chưa có",
        "",
        *_format_ai_explanation(latest),
        "",
        "<b>🗂️ Xử lý nghiệp vụ</b>",
        f"• Trạng thái: <b>{status}</b>",
        f"• Vi phạm: {violation}",
        f"• Mức phạt tham khảo: {fine}",
    ]

    if is_truck_body:
        lines.extend([
            "",
            "⚠️ <b>Cần đối chiếu:</b> nguồn crop có dấu hiệu lấy định danh trên thân xe tải. "
            "Hãy so sánh ảnh toàn xe và ảnh biển bên dưới trước khi xác nhận.",
        ])

    basis = latest.get("legal_basis")
    if basis:
        lines.append(f"• Căn cứ: {_h(basis)}")

    owner_rows = [
        ("Chủ phương tiện", latest.get("owner_name")),
        ("Điện thoại", latest.get("owner_phone")),
        ("Email", latest.get("owner_email")),
        ("Địa chỉ", latest.get("owner_address")),
    ]
    lines.extend(["", "<b>🧪 Thông tin mô phỏng</b>"])
    lines.append("<i>Dữ liệu chủ phương tiện được tạo giả lập để minh họa quy trình.</i>")
    lines.extend([f"• {label}: {_h(value or 'Chưa có')}" for label, value in owner_rows])

    has_image = bool(latest.get("vehicle_image_b64") or latest.get("plate_image_b64"))
    lines.extend([
        "",
        f"Tìm thấy <b>{len(items)}</b> bản ghi gần nhất cho biển số này.",
        "Ảnh toàn xe và ảnh crop biển sẽ được gửi ngay bên dưới."
        if has_image else
        "Bản ghi hiện chưa có ảnh chứng cứ để gửi qua Telegram.",
        "",
        "👇 Chọn <b>📄 Hiện biên bản trong bot</b> để xem trực tiếp ngay trong cuộc trò chuyện.",
    ])
    return "\n".join(lines)


def _format_notice_in_chat(notice: Dict[str, Any]) -> str:
    status_labels = {
        "pending": "Chờ duyệt",
        "confirmed": "Đã xác nhận",
        "approved": "Đã xác nhận",
        "notice_exported": "Đã lập biên bản",
        "notified": "Đã gửi thông báo",
        "resolved": "Đã xử lý",
        "rejected": "Đã hủy",
    }
    raw_status = str(notice.get("review_status") or "pending").strip().lower()
    status = status_labels.get(raw_status, raw_status or "Chờ duyệt")
    score = _ocr_score(notice)
    return "\n".join([
        "📄 <b>BIÊN BẢN VI PHẠM GIAO THÔNG</b>",
        "<i>Bản hiển thị trực tiếp trong Smart Traffic AI Assistant</i>",
        "",
        f"<b>Mã biên bản:</b> <code>{_h(notice.get('case_code') or '-')}</code>",
        f"<b>Biển số:</b> <code>{_h(notice.get('license_plate') or '-')}</code>",
        "",
        "<b>I. THÔNG TIN GHI NHẬN</b>",
        f"• Phương tiện: {_h(notice.get('vehicle_type') or 'Chưa phân loại')}",
        f"• Thời gian: {_h(notice.get('timestamp') or '-')}",
        f"• Camera: {_h(notice.get('camera_id') or '-')}",
        f"• Độ tin cậy OCR: {score:.0%}" if score else "• Độ tin cậy OCR: chưa có",
        "",
        "<b>II. NỘI DUNG XỬ LÝ</b>",
        f"• Hành vi: {_h(notice.get('violation_type') or 'Chưa ghi nhận')}",
        f"• Mức phạt tham khảo: {_h(notice.get('fine_amount') or 'Cần đối chiếu')}",
        f"• Căn cứ: {_h(notice.get('legal_basis') or 'Cần đối chiếu')}",
        f"• Trạng thái: <b>{_h(status)}</b>",
        "",
        "<b>III. CHỦ PHƯƠNG TIỆN · DỮ LIỆU MÔ PHỎNG</b>",
        f"• Họ tên: {_h(notice.get('owner_name') or 'Chưa có')}",
        f"• Điện thoại: {_h(notice.get('owner_phone') or 'Chưa có')}",
        f"• Email: {_h(notice.get('owner_email') or 'Chưa có')}",
        f"• Địa chỉ: {_h(notice.get('owner_address') or 'Chưa có')}",
        "",
        "<b>IV. ẢNH CHỨNG CỨ</b>",
        "Ảnh toàn xe và ảnh crop biển số được gửi kèm ngay sau biên bản này.",
        "",
        "⚠️ <i>Thông tin chủ phương tiện và nội dung xử lý dùng để minh họa quy trình. "
        "Cần có bước đối chiếu của người có thẩm quyền trước khi sử dụng chính thức.</i>",
    ])


def _notice_font(size: int, *, bold: bool = False, serif: bool = False) -> Any:
    windows_fonts = Path(os.getenv("WINDIR", r"C:\Windows")) / "Fonts"
    candidates = [
        windows_fonts / ("timesbd.ttf" if bold and serif else "times.ttf" if serif else "arialbd.ttf" if bold else "arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold and serif else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf" if serif else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        try:
            if candidate.is_file():
                return ImageFont.truetype(str(candidate), size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _wrapped_lines(
    draw: ImageDraw.ImageDraw,
    value: Any,
    font: Any,
    max_width: int,
    *,
    max_lines: int = 3,
) -> List[str]:
    words = str(value or "").split()
    if not words:
        return [""]
    lines: List[str] = []
    current = ""
    for index, word in enumerate(words):
        candidate = f"{current} {word}".strip()
        if not current or draw.textlength(candidate, font=font) <= max_width:
            current = candidate
            continue
        lines.append(current)
        current = word
        if len(lines) == max_lines - 1:
            remaining = " ".join([current, *words[index + 1:]]).strip()
            truncated = draw.textlength(remaining, font=font) > max_width
            while truncated and draw.textlength(remaining + "…", font=font) > max_width and len(remaining) > 3:
                remaining = remaining[:-1].rstrip()
            lines.append(remaining.rstrip(" .") + ("…" if truncated else ""))
            return lines
    if current and len(lines) < max_lines:
        lines.append(current)
    return lines


def _draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: Any,
    font: Any,
    fill: str,
    max_width: int,
    *,
    max_lines: int = 3,
    line_gap: int = 6,
) -> int:
    x, y = xy
    lines = _wrapped_lines(draw, value, font, max_width, max_lines=max_lines)
    line_height = max(18, int(getattr(font, "size", 22) * 1.22))
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_height + line_gap
    return y


def _draw_notice_field(
    draw: ImageDraw.ImageDraw,
    *,
    x: int,
    y: int,
    width: int,
    label: str,
    value: Any,
    label_width: int = 150,
    value_fill: str = "#0f172a",
    max_lines: int = 2,
) -> None:
    label_font = _notice_font(23)
    value_font = _notice_font(24, bold=True)
    draw.text((x, y), label, font=label_font, fill="#64748b")
    _draw_wrapped(
        draw,
        (x + label_width, y),
        value or "Chưa có",
        value_font,
        value_fill,
        max(80, width - label_width),
        max_lines=max_lines,
        line_gap=2,
    )


def _draw_notice_section_header(draw: ImageDraw.ImageDraw, y: int, title: str) -> None:
    draw.rounded_rectangle((70, y, 1170, y + 52), radius=8, fill="#f1f5f9")
    draw.text((88, y + 13), title, font=_notice_font(24, bold=True), fill="#0f172a")


def _paste_notice_evidence(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    image_b64: Any,
    box: tuple[int, int, int, int],
    empty_text: str,
) -> None:
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=12, fill="#020617")
    raw = _image_bytes(image_b64)
    if not raw:
        text_font = _notice_font(22)
        text_width = draw.textlength(empty_text, font=text_font)
        draw.text(((x1 + x2 - text_width) / 2, (y1 + y2) / 2 - 12), empty_text, font=text_font, fill="#cbd5e1")
        return
    try:
        with Image.open(io.BytesIO(raw)) as source:
            evidence = source.convert("RGB")
        evidence.thumbnail((x2 - x1 - 24, y2 - y1 - 24), Image.Resampling.LANCZOS)
        paste_x = x1 + ((x2 - x1) - evidence.width) // 2
        paste_y = y1 + ((y2 - y1) - evidence.height) // 2
        canvas.paste(evidence, (paste_x, paste_y))
    except Exception:
        text_font = _notice_font(22)
        draw.text((x1 + 24, (y1 + y2) // 2 - 12), "Không đọc được ảnh chứng cứ", font=text_font, fill="#cbd5e1")


def _render_notice_image(notice: Dict[str, Any]) -> bytes:
    """Render an A4-like Telegram preview matching the application's notice layout."""
    width, height = 1240, 1754
    canvas = Image.new("RGB", (width, height), "#ffffff")
    draw = ImageDraw.Draw(canvas)

    body_font = _notice_font(23)
    small_font = _notice_font(20)
    bold_font = _notice_font(24, bold=True)
    title_font = _notice_font(36, bold=True)
    heading_font = _notice_font(25, bold=True)

    draw.text((70, 64), "HỆ THỐNG QUẢN LÝ GIAO THÔNG THÔNG MINH", font=bold_font, fill="#0f172a")
    draw.text((70, 102), "Đơn vị vận hành / Trung tâm giám sát", font=body_font, fill="#334155")
    draw.text((70, 145), f"Số hồ sơ: {_clean_text(notice.get('case_code') or '-')}", font=bold_font, fill="#0f172a")

    right_center = 930
    national = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"
    national_width = draw.textlength(national, font=bold_font)
    draw.text((right_center - national_width / 2, 64), national, font=bold_font, fill="#0f172a")
    motto = "Độc lập - Tự do - Hạnh phúc"
    motto_width = draw.textlength(motto, font=body_font)
    draw.text((right_center - motto_width / 2, 103), motto, font=body_font, fill="#0f172a")
    draw.line((800, 139, 1060, 139), fill="#0f172a", width=2)

    title = "BIÊN BẢN GHI NHẬN VI PHẠM GIAO THÔNG"
    title_width = draw.textlength(title, font=title_font)
    draw.text(((width - title_width) / 2, 225), title, font=title_font, fill="#0f172a")
    subtitle = "Dữ liệu được lập từ hệ thống camera, phục vụ đối soát và xử lý vi phạm."
    subtitle_width = draw.textlength(subtitle, font=body_font)
    draw.text(((width - subtitle_width) / 2, 280), subtitle, font=body_font, fill="#64748b")

    _draw_notice_section_header(draw, 340, "I. THÔNG TIN PHƯƠNG TIỆN VÀ HÀNH VI VI PHẠM")
    draw.rounded_rectangle((70, 406, 1170, 724), radius=8, outline="#cbd5e1", width=2)
    left_x, right_x, column_width = 94, 660, 480
    _draw_notice_field(draw, x=left_x, y=438, width=column_width, label="Biển số:", value=notice.get("license_plate"), label_width=126)
    _draw_notice_field(draw, x=right_x, y=438, width=column_width, label="Hành vi:", value=notice.get("violation_type") or "Chưa ghi nhận vi phạm", label_width=130, value_fill="#dc2626")
    _draw_notice_field(draw, x=left_x, y=492, width=column_width, label="Loại xe:", value=notice.get("vehicle_type"), label_width=126)
    _draw_notice_field(draw, x=right_x, y=492, width=column_width, label="Camera:", value=notice.get("camera_id"), label_width=130)
    _draw_notice_field(draw, x=left_x, y=546, width=column_width, label="Thời gian:", value=notice.get("timestamp"), label_width=126)
    status_labels = {
        "pending": "Chờ duyệt",
        "confirmed": "Đã xác nhận",
        "approved": "Đã xác nhận",
        "notice_exported": "Đã lập biên bản",
        "notified": "Đã gửi thông báo",
        "resolved": "Đã xử lý",
        "rejected": "Đã hủy",
    }
    raw_status = str(notice.get("review_status") or "pending").lower()
    _draw_notice_field(draw, x=right_x, y=546, width=column_width, label="Trạng thái:", value=status_labels.get(raw_status, raw_status), label_width=130)
    score = _ocr_score(notice)
    _draw_notice_field(draw, x=left_x, y=600, width=column_width, label="Độ tin cậy:", value=f"{score:.0%}" if score else "Chưa có", label_width=150)
    _draw_notice_field(draw, x=right_x, y=600, width=column_width, label="Căn cứ:", value=notice.get("legal_basis"), label_width=130, max_lines=2)
    _draw_notice_field(draw, x=left_x, y=654, width=column_width, label="Mức phạt:", value=notice.get("fine_amount"), label_width=126)

    violation_text = _clean_text(notice.get("violation_type") or "").lower()
    note = (
        "Không ghi nhận hành vi vi phạm nên không áp dụng tiền phạt."
        if not violation_text or "chưa ghi nhận" in violation_text or "không vi phạm" in violation_text
        else "Mức phạt và căn cứ cần được người có thẩm quyền đối chiếu trước khi xử lý chính thức."
    )
    draw.rounded_rectangle((94, 674, 1146, 724), radius=5, fill="#fffbeb", outline="#fbbf24", width=1)
    _draw_wrapped(draw, (110, 681), note, _notice_font(18), "#92400e", 1020, max_lines=2, line_gap=0)

    _draw_notice_section_header(draw, 760, "II. THÔNG TIN CHỦ PHƯƠNG TIỆN · DỮ LIỆU MÔ PHỎNG")
    draw.rounded_rectangle((70, 826, 1170, 992), radius=8, outline="#cbd5e1", width=2)
    _draw_notice_field(draw, x=94, y=854, width=500, label="Chủ xe:", value=notice.get("owner_name"), label_width=112)
    _draw_notice_field(draw, x=660, y=854, width=480, label="Điện thoại:", value=notice.get("owner_phone"), label_width=150)
    _draw_notice_field(draw, x=94, y=910, width=1040, label="Email:", value=notice.get("owner_email"), label_width=112)
    _draw_notice_field(draw, x=94, y=956, width=1040, label="Địa chỉ:", value=notice.get("owner_address"), label_width=112, max_lines=1)

    _draw_notice_section_header(draw, 1028, "III. HÌNH ẢNH CHỨNG CỨ")
    draw.text((70, 1094), "Ảnh toàn cảnh phương tiện", font=heading_font, fill="#334155")
    draw.text((640, 1094), "Ảnh crop biển số", font=heading_font, fill="#334155")
    _paste_notice_evidence(canvas, draw, notice.get("vehicle_image_b64"), (70, 1134, 600, 1510), "Chưa có ảnh toàn xe")
    _paste_notice_evidence(canvas, draw, notice.get("plate_image_b64"), (640, 1134, 1170, 1510), "Chưa có ảnh crop biển")

    draw.rounded_rectangle((70, 1548, 1170, 1658), radius=8, fill="#fffbeb", outline="#fde68a", width=2)
    _draw_wrapped(
        draw,
        (92, 1570),
        "Lưu ý: Thông tin chủ phương tiện được tạo giả lập để minh họa quy trình. "
        "Ảnh xe, ảnh crop biển và kết quả OCR lấy từ bản ghi của hệ thống.",
        body_font,
        "#78350f",
        1050,
        max_lines=2,
    )
    footer = "SMART TRAFFIC AI · BIÊN BẢN ĐIỆN TỬ MÔ PHỎNG"
    footer_width = draw.textlength(footer, font=bold_font)
    draw.text(((width - footer_width) / 2, 1690), footer, font=bold_font, fill="#475569")

    output = io.BytesIO()
    canvas.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _notice_chat_keyboard(notice: Dict[str, Any]) -> Dict[str, Any]:
    rows: List[List[Dict[str, str]]] = []
    notice_url = _signed_notice_url(notice.get("id"))
    if notice_url:
        rows.append([{"text": "🌐 Mở bản đầy đủ / lưu PDF", "url": notice_url}])
    rows.extend([
        [
            {"text": "🗂️ Xem quy trình xử lý", "callback_data": "workflow"},
            {"text": "🚘 Danh sách biển số", "callback_data": "logs"},
        ],
        [{"text": "🏠 Về tổng quan", "callback_data": "home"}],
    ])
    return {"inline_keyboard": rows}


def _send_notice_in_chat(
    client: httpx.Client,
    token: str,
    backend_url: str,
    chat_id: int | str,
    detection_id: int,
) -> None:
    notice = _backend_get(client, backend_url, f"/api/telegram/notice/{detection_id}")
    try:
        image_data = _render_notice_image(notice)
        payload = {
            "chat_id": chat_id,
            "caption": "\n".join([
                "📄 <b>Biên bản ghi nhận vi phạm giao thông</b>",
                f"Biển số: <code>{_h(notice.get('license_plate') or '-')}</code>",
                "Chạm vào ảnh để phóng to hoặc mở bản đầy đủ để lưu PDF.",
            ]),
            "parse_mode": "HTML",
            "reply_markup": json.dumps(_notice_chat_keyboard(notice), ensure_ascii=False),
        }
        files = {"photo": ("smart_traffic_notice.png", image_data, "image/png")}
        client.post(_telegram_url(token, "sendPhoto"), data=payload, files=files, timeout=60).raise_for_status()
        return
    except Exception:
        # Fall back to structured text if image rendering/upload is unavailable.
        _send_message(
            client,
            token,
            chat_id,
            _format_notice_in_chat(notice),
            reply_markup=_notice_chat_keyboard(notice),
        )

    plate = _h(notice.get("license_plate") or "")
    sent_vehicle = _send_photo(
        client,
        token,
        chat_id,
        notice.get("vehicle_image_b64"),
        f"Phụ lục 1 · Ảnh toàn xe · <b>{plate}</b>",
    )
    sent_plate = _send_photo(
        client,
        token,
        chat_id,
        notice.get("plate_image_b64"),
        f"Phụ lục 2 · Ảnh crop biển số · <b>{plate}</b>",
    )
    if not sent_vehicle and not sent_plate:
        _send_message(
            client,
            token,
            chat_id,
            "Biên bản này chưa có ảnh chứng cứ đính kèm.",
            reply_markup=_notice_chat_keyboard(notice),
        )


def _send_plate_evidence_clean(
    client: httpx.Client,
    token: str,
    chat_id: int | str,
    payload: Dict[str, Any],
) -> None:
    items: List[Dict[str, Any]] = payload.get("items") or []
    if not items:
        return
    latest = items[0]
    plate = _h(latest.get("license_plate") or "")
    is_truck_body = _is_truck_body_source(latest)

    if is_truck_body:
        vehicle_caption = f"Ảnh toàn xe · {plate} · Cần đối chiếu nguồn crop"
        plate_caption = f"Ảnh crop biển/định danh · {plate} · Có thể lấy từ thân xe"
    else:
        vehicle_caption = f"Ảnh toàn cảnh phương tiện · {plate}"
        plate_caption = f"Ảnh crop biển số · {plate}"

    if not _item_has_reliable_plate(latest):
        _send_message(
            client,
            token,
            chat_id,
            f"Biển <b>{plate}</b> chưa đạt ngưỡng tin cậy nên bot không gửi ảnh tự động, "
            "nhằm tránh ghép nhầm xe và biển số.",
            reply_markup=_main_keyboard(),
        )
        return

    sent_vehicle = _send_photo(
        client, token, chat_id, latest.get("vehicle_image_b64"),
        vehicle_caption,
    )
    sent_plate = _send_photo(
        client, token, chat_id, latest.get("plate_image_b64"),
        plate_caption,
    )
    if not sent_vehicle and not sent_plate:
        _send_message(
            client, token, chat_id,
            "Bản ghi chưa có ảnh toàn xe hoặc ảnh crop biển số.",
            reply_markup=_main_keyboard(),
        )


def _prefer_complete_evidence(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Keep recency order, but promote the newest record that has both evidence crops."""
    items = list(payload.get("items") or [])
    complete_index = next(
        (
            index
            for index, item in enumerate(items)
            if item.get("vehicle_image_b64") and item.get("plate_image_b64")
        ),
        None,
    )
    if complete_index is not None and complete_index > 0:
        items.insert(0, items.pop(complete_index))
    return {**payload, "items": items}


def _send_plate_detail(client: httpx.Client, token: str, backend_url: str, chat_id: int | str, plate: str) -> None:
    clean_plate = _plate_key(plate) or str(plate or "").strip().upper()
    payload = _backend_get(client, backend_url, f"/api/telegram/plate/{clean_plate}?include_images=true")
    payload = _prefer_complete_evidence(payload)
    _send_message(
        client,
        token,
        chat_id,
        _format_plate_message_clean(payload, clean_plate),
        reply_markup=_plate_result_keyboard(payload.get("items") or []),
    )
    _send_plate_evidence_clean(client, token, chat_id, payload)


def _send_quick_tour_start(client: httpx.Client, token: str, chat_id: int | str) -> None:
    _send_message(
        client,
        token,
        chat_id,
        _quick_tour_start_text(),
        reply_markup=_quick_tour_start_keyboard(),
    )


def _send_quick_tour_plates(
    client: httpx.Client,
    token: str,
    backend_url: str,
    chat_id: int | str,
) -> None:
    payload = _retained_logs_payload(client, backend_url, limit=50)
    items = _unique_valid_plate_items(payload, limit=10)
    if not items:
        _send_message(
            client,
            token,
            chat_id,
            "🎯 <b>BƯỚC 2/5 · CHỌN BIỂN SỐ</b>\n\n"
            "Hiện chưa có biển số đủ độ tin cậy trong lịch sử để tiếp tục trải nghiệm.",
            reply_markup=_back_home_keyboard(),
        )
        return
    _send_message(
        client,
        token,
        chat_id,
        "🎯 <b>TRẢI NGHIỆM NHANH · BƯỚC 2/5</b>\n\n"
        "Chọn một biển số bên dưới. Bot sẽ mở hồ sơ, giải thích kết quả AI "
        "và gửi ảnh chứng cứ ở bước tiếp theo.",
        reply_markup=_quick_tour_plates_keyboard(payload),
    )


def _send_quick_tour_plate_detail(
    client: httpx.Client,
    token: str,
    backend_url: str,
    chat_id: int | str,
    plate: str,
) -> None:
    clean_plate = _plate_key(plate) or str(plate or "").strip().upper()
    payload = _backend_get(client, backend_url, f"/api/telegram/plate/{clean_plate}?include_images=true")
    payload = _prefer_complete_evidence(payload)
    _send_message(
        client,
        token,
        chat_id,
        "🎯 <b>TRẢI NGHIỆM NHANH · BƯỚC 3/5</b>\n"
        "<i>Hồ sơ, giải thích AI và ảnh chứng cứ</i>\n\n"
        + _format_plate_message_clean(payload, clean_plate),
        reply_markup=_plate_result_keyboard(payload.get("items") or [], quick_tour=True),
    )
    _send_plate_evidence_clean(client, token, chat_id, payload)


def _send_quick_tour_notice(
    client: httpx.Client,
    token: str,
    backend_url: str,
    chat_id: int | str,
    detection_id: int,
) -> None:
    _send_notice_in_chat(client, token, backend_url, chat_id, detection_id)
    _send_message(
        client,
        token,
        chat_id,
        "🎯 <b>TRẢI NGHIỆM NHANH · BƯỚC 4/5</b>\n\n"
        "Biên bản vừa được hiển thị trực tiếp trong bot. Tiếp theo là quy trình "
        "nghiệp vụ từ ghi nhận đến xử lý.",
        reply_markup={
            "inline_keyboard": [
                [{"text": "🗂️ Bước 5 · Quy trình xử lý", "callback_data": "quick_tour:workflow"}],
                [{"text": "❌ Dừng trải nghiệm", "callback_data": "quick_tour:cancel"}],
            ]
        },
    )


def _send_quick_tour_workflow(client: httpx.Client, token: str, chat_id: int | str) -> None:
    _send_message(
        client,
        token,
        chat_id,
        "🎯 <b>TRẢI NGHIỆM NHANH · BƯỚC 5/5</b>\n\n" + _workflow_text(),
        reply_markup=_quick_tour_workflow_keyboard(),
    )


def _send_today(client: httpx.Client, token: str, backend_url: str, chat_id: int | str) -> None:
    payload = _daily_or_history_payload(client, backend_url, limit=20)
    buttons = _plate_inline_keyboard(_unique_valid_plate_items(payload, limit=20), include_today_button=True)
    _send_message(client, token, chat_id, _format_today_message(payload), reply_markup=buttons or _main_keyboard())


def _send_plates(client: httpx.Client, token: str, backend_url: str, chat_id: int | str) -> None:
    payload = _retained_logs_payload(client, backend_url, limit=200)
    _send_message(client, token, chat_id, _format_plates_message(payload), reply_markup=_logs_keyboard(payload))


def _handle_callback(client: httpx.Client, token: str, backend_url: str, callback: Dict[str, Any]) -> None:
    callback_id = callback.get("id")
    message = callback.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    data = str(callback.get("data") or "").strip()
    if chat_id is None:
        _answer_callback(client, token, callback_id)
        return
    try:
        if data == "cancel_search":
            _answer_callback(client, token, callback_id, "Đã hủy tìm kiếm.")
            _send_message(
                client,
                token,
                chat_id,
                "✅ Đã hủy chế độ nhập biển số. Bạn có thể chọn chức năng khác bên dưới.",
                reply_markup=_main_keyboard(),
            )
            return
        if data == "quick_tour:start":
            _answer_callback(client, token, callback_id, "Bắt đầu trải nghiệm nhanh...")
            _send_quick_tour_start(client, token, chat_id)
            return
        if data == "quick_tour:plates":
            _answer_callback(client, token, callback_id, "Đang tải biển số đã lưu...")
            _send_quick_tour_plates(client, token, backend_url, chat_id)
            return
        if data == "quick_tour:workflow":
            _answer_callback(client, token, callback_id, "Mở quy trình xử lý...")
            _send_quick_tour_workflow(client, token, chat_id)
            return
        if data == "quick_tour:finish":
            _answer_callback(client, token, callback_id, "Hoàn tất trải nghiệm!")
            _send_message(
                client,
                token,
                chat_id,
                "✅ <b>Bạn đã hoàn tất trải nghiệm nhanh Smart Traffic AI.</b>\n\n"
                "Bạn có thể tra cứu biển số khác, xem video demo hoặc mở dashboard để khám phá sâu hơn.",
                reply_markup=_assistant_inline_keyboard(),
            )
            return
        if data == "quick_tour:cancel":
            _answer_callback(client, token, callback_id, "Đã dừng trải nghiệm.")
            _send_message(
                client,
                token,
                chat_id,
                "Đã dừng trải nghiệm nhanh. Dữ liệu và tiến trình của hệ thống không bị thay đổi.",
                reply_markup=_main_keyboard(),
            )
            return
        if data.startswith("tour_notice:"):
            raw_id = data.split(":", 1)[1]
            if not raw_id.isdigit():
                _answer_callback(client, token, callback_id, "Mã biên bản không hợp lệ.")
                return
            _answer_callback(client, token, callback_id, "Đang hiển thị biên bản...")
            _send_quick_tour_notice(client, token, backend_url, chat_id, int(raw_id))
            return
        if data.startswith("tour_plate:"):
            plate = data.split(":", 1)[1]
            _answer_callback(client, token, callback_id, f"Đang mở hồ sơ {plate}...")
            _send_quick_tour_plate_detail(client, token, backend_url, chat_id, plate)
            return
        if data.startswith("notice:"):
            raw_id = data.split(":", 1)[1]
            if not raw_id.isdigit():
                _answer_callback(client, token, callback_id, "Mã biên bản không hợp lệ.")
                return
            _answer_callback(client, token, callback_id, "Đang lập biên bản trong bot...")
            _send_notice_in_chat(client, token, backend_url, chat_id, int(raw_id))
            return
        if data.startswith("plate:"):
            plate = data.split(":", 1)[1]
            _answer_callback(client, token, callback_id, f"Đang tra cứu {plate}...")
            _send_plate_detail(client, token, backend_url, chat_id, plate)
            return
        if data == "home":
            _answer_callback(client, token, callback_id, "Quay về tổng quan...")
            _send_home(client, token, chat_id)
            return
        if data == "showcase":
            _answer_callback(client, token, callback_id, "Mở phần điểm nổi bật...")
            _send_message(
                client,
                token,
                chat_id,
                _features_text(),
                reply_markup=_tour_keyboard("architecture", "Tiếp theo · 🧠 Luồng xử lý AI"),
            )
            return
        if data == "architecture":
            _answer_callback(client, token, callback_id, "Mở luồng xử lý AI...")
            _send_message(
                client,
                token,
                chat_id,
                _architecture_text(),
                reply_markup=_tour_keyboard("workflow", "Tiếp theo · 🗂️ Quy trình nghiệp vụ"),
            )
            return
        if data == "workflow":
            _answer_callback(client, token, callback_id, "Mở quy trình nghiệp vụ...")
            _send_message(
                client,
                token,
                chat_id,
                _workflow_text(),
                reply_markup=_tour_keyboard("analytics", "Tiếp theo · 📊 Phân tích vận hành"),
            )
            return
        if data in {"logs", "plates", "logs_day", "logs_night", "night_logs", "logs_all"}:
            _answer_callback(client, token, callback_id, "Đang tải biển số đã ghi nhận...")
            _send_plates(client, token, backend_url, chat_id)
            return
        if data == "search_plate":
            _answer_callback(client, token, callback_id, "Hãy nhập biển số cần tìm...")
            _send_plate_search_prompt(client, token, chat_id)
            return
        if data == "analytics":
            _answer_callback(client, token, callback_id, "Mở phần phân tích...")
            _send_message(
                client,
                token,
                chat_id,
                _analytics_text(),
                reply_markup=_tour_keyboard("logs", "Thử ngay · 🚘 Biển số đã ghi nhận"),
            )
            return
        if data in ("violations_today", "today"):
            _answer_callback(client, token, callback_id, "Đang tải biển vi phạm hôm nay...")
            _send_violations_today(client, token, backend_url, chat_id)
            return
        if data == "violation_categories":
            _answer_callback(client, token, callback_id, "Đang tải danh mục vi phạm...")
            _send_message(client, token, chat_id, _violation_categories_text(), reply_markup=_back_home_keyboard())
            return
        if data == "intro":
            _answer_callback(client, token, callback_id, "Đang tải giới thiệu...")
            _send_message(
                client,
                token,
                chat_id,
                _intro_text(),
                reply_markup=_tour_keyboard("showcase", "Tiếp theo · 🏆 Điểm nổi bật"),
            )
            return
        if data == "features":
            _answer_callback(client, token, callback_id, "Đang tải danh sách tính năng...")
            _send_message(
                client,
                token,
                chat_id,
                _features_text(),
                reply_markup=_tour_keyboard("architecture", "Tiếp theo · 🧠 Luồng xử lý AI"),
            )
            return
        if data == "demo":
            _answer_callback(client, token, callback_id, "Đang tải video demo...")
            _send_demo_video(client, token, chat_id)
            return
        if data == "contact":
            _answer_callback(client, token, callback_id, "Thông tin hợp tác...")
            _send_message(client, token, chat_id, _contact_text(), reply_markup=_back_home_keyboard())
            return
        if data == "help":
            _answer_callback(client, token, callback_id, "Đang tải hướng dẫn...")
            _send_message(client, token, chat_id, _help_text(), reply_markup=_back_home_keyboard())
            return
        if data == "plates":
            _answer_callback(client, token, callback_id, "Đang tải danh sách biển...")
            _send_log_period_menu(client, token, chat_id)
            return
        if data == "cameras":
            _answer_callback(client, token, callback_id, "Đang tải thống kê camera...")
            _send_camera_stats(client, token, backend_url, chat_id)
            return
        if data == "top":
            _answer_callback(client, token, callback_id, "Đang tải top biển vi phạm...")
            _send_top_plates(client, token, backend_url, chat_id)
            return
        if data == "yesterday":
            _answer_callback(client, token, callback_id, "Đang tải tóm tắt hôm qua...")
            _send_yesterday(client, token, backend_url, chat_id)
            return
        if data == "status":
            _answer_callback(client, token, callback_id, "Đang kiểm tra trạng thái hệ thống...")
            _send_system_status(client, token, backend_url, chat_id)
            return
        _answer_callback(client, token, callback_id, "Tính năng đang được cập nhật.")
        _send_message(client, token, chat_id, _help_text(), reply_markup=_assistant_inline_keyboard())
    except Exception as exc:
        _answer_callback(client, token, callback_id, "Không thể truy vấn lúc này.")
        _send_message(
            client,
            token,
            chat_id,
            f"⚠️ Không thể truy vấn dữ liệu lúc này: {_h(exc)}\nVui lòng kiểm tra backend rồi thử lại.",
            reply_markup=_assistant_inline_keyboard(),
        )


def _handle_message(client: httpx.Client, token: str, backend_url: str, message: Dict[str, Any]) -> None:
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if chat_id is None:
        return

    text = str(message.get("text") or "").strip()
    lowered = text.lower()

    try:
        if lowered.startswith("/start"):
            if "traffic_today" in lowered:
                _send_violations_today(client, token, backend_url, chat_id)
            else:
                _send_welcome(client, token, chat_id)
            return

        if lowered.startswith("/cancel") or lowered in {
            "cancel", "huy", "hủy", "huy tim kiem", "hủy tìm kiếm", "❌ hủy tìm kiếm",
        }:
            _send_message(
                client,
                token,
                chat_id,
                "✅ Đã hủy thao tác tìm kiếm. Bạn có thể chọn chức năng khác bên dưới.",
                reply_markup=_main_keyboard(),
            )
            return

        if lowered in {
            "trai nghiem nhanh", "trải nghiệm nhanh", "trai nghiem 90 giay",
            "trải nghiệm 90 giây", "🎯 trải nghiệm nhanh 90 giây",
        }:
            _send_quick_tour_start(client, token, chat_id)
            return

        if lowered.startswith("/showcase") or lowered in {
            "showcase", "kham pha du an", "khám phá dự án", "🚀 khám phá dự án",
            "diem noi bat", "điểm nổi bật", "🏆 điểm nổi bật",
        }:
            _send_showcase(client, token, chat_id)
            return

        if lowered.startswith("/architecture") or lowered in {
            "architecture", "luong ai", "luồng ai", "kien truc", "kiến trúc",
        }:
            _send_message(
                client,
                token,
                chat_id,
                _architecture_text(),
                reply_markup=_tour_keyboard("workflow", "Tiếp theo · 🗂️ Quy trình nghiệp vụ"),
            )
            return

        if lowered.startswith("/process") or lowered in {
            "workflow", "nghiep vu", "nghiệp vụ", "quy trinh", "quy trình",
            "quy trinh xu ly", "quy trình xử lý", "🗂️ quy trình xử lý",
        }:
            _send_message(
                client,
                token,
                chat_id,
                _workflow_text(),
                reply_markup=_tour_keyboard("analytics", "Tiếp theo · 📊 Phân tích vận hành"),
            )
            return

        if lowered in {"analytics", "phan tich", "phân tích"}:
            _send_message(
                client,
                token,
                chat_id,
                _analytics_text(),
                reply_markup=_tour_keyboard("logs", "Thử ngay · 🚘 Biển số đã ghi nhận"),
            )
            return

        if lowered.startswith("/intro") or lowered in {"intro", "gioi thieu", "giới thiệu", "ℹ️ giới thiệu"}:
            _send_message(client, token, chat_id, _intro_text(), reply_markup=_back_home_keyboard())
            return

        if lowered.startswith("/features") or lowered in {"features", "chuc nang", "chức năng", "✨ tính năng"}:
            _send_message(
                client,
                token,
                chat_id,
                _features_text(),
                reply_markup=_tour_keyboard("architecture", "Tiếp theo · 🧠 Luồng xử lý AI"),
            )
            return

        if lowered.startswith("/demo") or lowered in {
            "demo", "🎬 demo vận hành", "🎬 xem video demo",
            "xem video demo", "🎬 video demo", "video",
        }:
            _send_demo_video(client, token, chat_id)
            return

        if lowered.startswith("/contact") or lowered in {
            "contact", "lien he", "liên hệ", "💼 liên hệ", "hợp tác", "hop tac",
            "💼 liên hệ hợp tác", "tư vấn", "tu van",
        }:
            _send_message(client, token, chat_id, _contact_text(), reply_markup=_back_home_keyboard())
            return

        if lowered.startswith("/help") or lowered in {
            "help", "huong dan", "hướng dẫn", "❓ trợ giúp", "❓ hướng dẫn",
        }:
            _send_message(client, token, chat_id, _help_text(), reply_markup=_back_home_keyboard())
            return

        # Biển ghi nhận hôm nay
        if lowered.startswith("/today") or lowered in {
            "today", "hôm nay", "hom nay", "danh sách",
            "🚨 biển vi phạm hôm nay", "bien vi pham hom nay",
            "🚗 biển ghi nhận hôm nay", "bien ghi nhan hom nay",
            "xe ghi nhận hôm nay", "xe hom nay", "🚨 dữ liệu hôm nay",
        }:
            _send_violations_today(client, token, backend_url, chat_id)
            return

        # Danh mục vi phạm
        if lowered.startswith("/violations") or lowered in {
            "violations", "danh muc vi pham", "danh mục vi phạm",
            "📚 danh mục vi phạm", "loai vi pham", "loại vi phạm",
            "📚 căn cứ xử phạt", "can cu xu phat", "căn cứ xử phạt",
        }:
            _send_message(client, token, chat_id, _violation_categories_text(), reply_markup=_back_home_keyboard())
            return

        # Tổng quan / Home
        if lowered in {"🏠 tổng quan", "tong quan", "tổng quan", "home"}:
            _send_home(client, token, chat_id)
            return

        # Danh sách biển
        if lowered.startswith("/logs") or lowered.startswith("/plates") or lowered in {
            "bien", "biển", "danh sach bien", "danh sách biển",
            "bien so da ghi nhan", "biển số đã ghi nhận", "🚘 biển số đã ghi nhận",
            "lich su bien so", "lịch sử biển số",
        }:
            _send_plates(client, token, backend_url, chat_id)
            return

        # Tra cứu biển số (gợi ý nhập)
        if lowered in {"🔎 tra cứu biển số", "tra cuu bien so", "tra cứu biển số"}:
            _send_plate_search_prompt(client, token, chat_id)
            return

        # Thống kê camera
        if lowered.startswith("/cameras") or lowered in {
            "camera", "cameras", "thong ke camera", "thống kê camera", "📊 thống kê camera",
        }:
            _send_camera_stats(client, token, backend_url, chat_id)
            return

        # Top biển vi phạm
        if lowered.startswith("/top") or lowered in {"top", "top bien", "top biển", "🏆 top biển vi phạm"}:
            _send_top_plates(client, token, backend_url, chat_id)
            return

        # Tóm tắt hôm qua
        if lowered.startswith("/yesterday") or lowered in {
            "hom qua", "hôm qua", "yesterday", "📅 tóm tắt hôm qua",
        }:
            _send_yesterday(client, token, backend_url, chat_id)
            return

        # Trạng thái hệ thống
        if lowered.startswith("/status") or lowered in {
            "status", "trang thai", "trạng thái", "🟢 trạng thái hệ thống",
        }:
            _send_system_status(client, token, backend_url, chat_id)
            return

        if lowered.startswith("/plate"):
            parts = text.split(maxsplit=1)
            plate = _extract_plate(parts[1] if len(parts) > 1 else "")
            if not plate:
                _send_plate_search_prompt(client, token, chat_id)
                return
            _send_plate_detail(client, token, backend_url, chat_id, plate)
            return

        plate = _extract_plate(text)
        if plate:
            _send_plate_detail(client, token, backend_url, chat_id, plate)
            return

        if _is_plate_search_reply(message):
            _send_message(
                client,
                token,
                chat_id,
                "⚠️ Biển số chưa đúng định dạng. Hãy nhập lại, ví dụ <code>30F-890.60</code>.",
                reply_markup=_plate_search_force_reply(),
            )
            return

        _send_message(
            client, token, chat_id,
            "🤖 Tôi chưa hiểu yêu cầu này.\n\n"
            "Bạn có thể:\n"
            "• Nhập trực tiếp biển số (ví dụ: <code>30F89060</code>)\n"
            "• Dùng lệnh <code>/logs</code> để xem biển số đã ghi nhận\n"
            "• Dùng lệnh <code>/process</code> để xem quy trình xử lý\n"
            "• Dùng lệnh <code>/showcase</code> để xem điểm nổi bật\n"
            "• Dùng lệnh <code>/help</code> để xem hướng dẫn đầy đủ",
            reply_markup=_assistant_inline_keyboard(),
        )
    except Exception as exc:
        _send_message(
            client, token, chat_id,
            f"⚠️ Không thể truy vấn dữ liệu lúc này: {_h(exc)}\nVui lòng kiểm tra backend rồi thử lại.",
            reply_markup=_assistant_inline_keyboard(),
        )


def main() -> None:
    token = _env("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("Missing TELEGRAM_BOT_TOKEN environment variable.")

    backend_url = _env("TELEGRAM_BACKEND_URL", "http://127.0.0.1:8000")
    poll_timeout = int(_env("TELEGRAM_POLL_TIMEOUT", "30") or "30")
    push_interval = int(_env("TELEGRAM_PUSH_INTERVAL_SECONDS", "15") or "15")
    offset = 0
    last_push_at = 0.0
    pushed_ids: set[str] = set()

    with httpx.Client() as client:
        me = client.get(_telegram_url(token, "getMe"), timeout=20)
        me.raise_for_status()
        bot = me.json().get("result", {})
        _configure_bot(client, token)
        print(f"[TELEGRAM] Bot @{bot.get('username', 'unknown')} is running. Backend={backend_url}")

        while True:
            try:
                response = client.get(
                    _telegram_url(token, "getUpdates"),
                    params={"offset": offset, "timeout": poll_timeout, "allowed_updates": ["message", "callback_query"]},
                    timeout=poll_timeout + 10,
                )
                response.raise_for_status()
                updates = response.json().get("result", [])
                for update in updates:
                    offset = max(offset, int(update.get("update_id", 0)) + 1)
                    callback = update.get("callback_query")
                    if callback:
                        _handle_callback(client, token, backend_url, callback)
                        continue
                    message = update.get("message")
                    if message:
                        _handle_message(client, token, backend_url, message)
                now = time.monotonic()
                if now - last_push_at >= push_interval:
                    _push_recent_violations(client, token, backend_url, pushed_ids)
                    last_push_at = now
            except KeyboardInterrupt:
                print("[TELEGRAM] Stopped.")
                break
            except Exception as exc:
                print(f"[TELEGRAM] Polling error: {exc}")
                time.sleep(3)


if __name__ == "__main__":
    main()
