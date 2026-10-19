from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional

try:
    from .curated_evidence import CURATED_DAY_EVIDENCE_IDS, CURATED_NIGHT_EVIDENCE_IDS
    from .traffic_law import TrafficLawResult, analyze_traffic_law, fold_text
except ImportError:
    from curated_evidence import CURATED_DAY_EVIDENCE_IDS, CURATED_NIGHT_EVIDENCE_IDS
    from traffic_law import TrafficLawResult, analyze_traffic_law, fold_text


PROJECT_CAPABILITIES = (
    "Hệ thống hỗ trợ giám sát 6 luồng camera/video; nhận diện và phân loại phương tiện; "
    "phát hiện, OCR và crop biển số; lưu ảnh toàn xe và ảnh biển; quản lý và tra cứu hồ sơ phương tiện; "
    "đối chiếu bằng chứng, tra cứu căn cứ xử phạt, lập hồ sơ/thông báo; thống kê vận hành; "
    "và hỗ trợ quan sát qua Trợ lý AI, Telegram và Zalo."
)


def get_casual_response(user_message: str) -> Optional[str]:
    normalized = " ".join(fold_text(user_message).strip(" .,!?:;-").split())

    greetings = {
        "alo",
        "chao",
        "chao ban",
        "chao chatbot",
        "hello",
        "hi",
        "hey",
        "xin chao",
        "xin chao ban",
        "chao buoi sang",
        "chao buoi chieu",
        "chao buoi toi",
    }
    introductions = {
        "ban la ai",
        "ban ten gi",
        "gioi thieu ban than",
        "gioi thieu ve ban",
        "tro ly nay la gi",
    }
    capabilities = {
        "ban co the lam gi",
        "ban lam duoc gi",
        "ban giup duoc gi",
        "du an co chuc nang gi",
        "gioi thieu du an",
        "he thong nay co chuc nang gi",
        "he thong nay co nhung chuc nang gi",
        "huong dan su dung chatbot",
        "toi co the hoi gi",
    }
    thanks = {
        "cam on",
        "cam on ban",
        "thanks",
        "thank you",
    }
    goodbyes = {
        "bye",
        "goodbye",
        "hen gap lai",
        "tam biet",
    }

    if normalized in greetings:
        return (
            "Xin chào! Tôi là Trợ lý AI của hệ thống quản lý giao thông thông minh. "
            "Tôi có thể trao đổi thông thường hoặc hỗ trợ bạn tra cứu dữ liệu dự án, camera, "
            "phương tiện, biển số, OCR, vi phạm và quy trình xử lý."
        )
    if normalized in introductions:
        return (
            "Tôi là Trợ lý AI tích hợp trong hệ thống quản lý giao thông thông minh TrafficAI. "
            f"{PROJECT_CAPABILITIES} Tôi cũng có thể trả lời các câu hỏi kiến thức chung bằng tiếng Việt."
        )
    if normalized in capabilities:
        return (
            f"Bạn có thể hỏi tôi về dự án hoặc kiến thức chung. Với dự án: {PROJECT_CAPABILITIES} "
            "Ví dụ, bạn có thể tra cứu một biển số, thống kê phương tiện, giải thích quy trình OCR "
            "hoặc hỏi căn cứ xử phạt."
        )
    if normalized in thanks:
        return "Không có gì! Nếu cần, bạn cứ hỏi tiếp về hệ thống hoặc các nội dung nghiệp vụ khác."
    if normalized in goodbyes:
        return "Tạm biệt bạn! Chúc bạn một ngày làm việc hiệu quả."
    return None


def is_project_question(user_message: str) -> bool:
    normalized = fold_text(user_message)
    project_terms = (
        "bang chung",
        "ban ghi",
        "bien ban",
        "bien so",
        "camera",
        "chatbot",
        "chu phuong tien",
        "chu xe",
        "crop",
        "du an",
        "du lieu",
        "giam sat",
        "gplx",
        "he thong",
        "ho so",
        "ma ho so",
        "ma ban ghi",
        "muc phat",
        "nhan dien",
        "phan mem",
        "phuong tien",
        "thong ke",
        "tro ly",
        "vi pham",
        "xu phat",
        "xe nay",
    )
    if any(term in normalized for term in project_terms):
        return True
    normalized_tokens = set(normalized.split())
    if normalized_tokens.intersection({"ai", "alpr", "fps", "log", "ocr", "ollama", "telegram", "track", "yolo", "zalo"}):
        return True
    # Case code match (e.g. BB-20261004-98A33816-04791, HS-4791, #4791, ho so 4791)
    if re.search(r"(?:BB-\d{8}-[A-Z0-9]+-\d+|HS[ -]?\d+|#\d+|ho so\s*\d+|ban ghi\s*\d+)", user_message, re.IGNORECASE):
        return True
    compact_tokens = [re.sub(r"[^A-Z0-9]", "", token.upper()) for token in user_message.split()]
    return any(re.fullmatch(r"\d{2}[A-Z]{1,2}\d{4,6}", token) for token in compact_tokens)


def select_history_for_scope(
    history: Optional[List[Dict[str, str]]],
    *,
    scope: str,
) -> List[Dict[str, str]]:
    """Keep only exchanges that match the current project/general topic."""
    selected: List[Dict[str, str]] = []
    include_assistant = False
    wanted_project_scope = scope == "project"

    for item in history or []:
        role = item.get("role")
        content = (item.get("content") or "").strip()
        if not content:
            continue
        if role == "user":
            is_project_scope = (
                is_project_question(content)
                or analyze_traffic_law(content).mode != "none"
            )
            include_assistant = is_project_scope == wanted_project_scope
            if include_assistant:
                selected.append({"role": "user", "content": content})
        elif role == "assistant" and include_assistant:
            selected.append({"role": "assistant", "content": content})

    return selected[-6:]


def get_model_unavailable_response(*, project_scope: bool, context_items: int = 0) -> str:
    if project_scope:
        record_note = f" Hiện hệ thống đang giám sát {context_items} bản ghi phương tiện." if context_items else ""
        return (
            "Trợ lý AI đang xử lý tác vụ hoặc máy chủ LLM đang khởi động."
            f"{record_note} Bạn có thể tra cứu nhanh các lỗi vi phạm (ví dụ: 'vượt đèn đỏ', 'sai làn', 'ngược chiều') để nhận ngay căn cứ và mức phạt chi tiết theo Nghị định 168/2024/NĐ-CP."
        )
    return (
        "Trợ lý AI đang bận xử lý. Bạn vui lòng thử lại sau ít giây hoặc đặt câu hỏi về luật giao thông đường bộ."
    )


def _safe_text(value: object, fallback: str = "unknown") -> str:
    text = str(value or "").strip()
    return text if text else fallback


def get_project_data_response(user_message: str, records: Iterable[object]) -> Optional[str]:
    normalized = fold_text(user_message)
    # Không áp dụng trả lời thống kê chung nếu câu hỏi đang nhắm tới một hồ sơ, mã số hoặc biển số cụ thể
    if re.search(r"\b(bb-\d|hs-\d|#\d|\d{2}[a-z])\b", normalized):
        return None
    if any(token in normalized for token in ("chu xe", "chu phuong tien", "phat bao nhieu", "muc phat", "vi pham")):
        return None

    asks_for_count = any(token in normalized for token in ("bao nhieu ban ghi", "bao nhieu ho so", "tong so ban ghi", "tong so ho so", "co may camera", "bao nhieu camera"))
    if not asks_for_count:
        return None

    if any(token in normalized for token in ("log", "ban ghi", "ho so")):
        count = len(records) if hasattr(records, "__len__") else len(list(records))
        return f"Hệ thống hiện đang quản lý {count} bản ghi nhận diện đã được kiểm chứng hình ảnh và đối soát đầy đủ."
    if "camera" in normalized:
        return "Hệ thống hiện giám sát 6 luồng camera/video, từ CAM_01 đến CAM_06."
    return None


def build_project_context(records: Iterable[object]) -> str:
    rows = list(records)
    if not rows:
        return "No recent detection records are available."

    vehicle_counts: Dict[str, int] = {}
    lighting_counts: Dict[str, int] = {"day": 0, "night": 0}
    camera_counts: Dict[str, int] = {}
    recent_lines: List[str] = []
    for record in rows:
        vehicle_type = _safe_text(getattr(record, "vehicle_type", ""), "unknown_vehicle")
        plate_number = _safe_text(getattr(record, "plate_number", ""), "unknown_plate")
        violation_type = _safe_text(getattr(record, "violation_type", ""), "unknown_violation")
        timestamp = getattr(record, "timestamp", None)
        timestamp_text = timestamp.isoformat() if hasattr(timestamp, "isoformat") else _safe_text(timestamp, "unknown_time")

        vehicle_counts[vehicle_type] = vehicle_counts.get(vehicle_type, 0) + 1
        camera_id = _safe_text(getattr(record, "camera_id", ""), "unknown_camera")
        camera_counts[camera_id] = camera_counts.get(camera_id, 0) + 1
        record_id = int(getattr(record, "id", 0) or 0)
        hour = getattr(timestamp, "hour", None)
        if record_id in CURATED_NIGHT_EVIDENCE_IDS:
            lighting = "night"
        elif record_id in CURATED_DAY_EVIDENCE_IDS:
            lighting = "day"
        else:
            lighting = "night" if isinstance(hour, int) and (hour >= 18 or hour < 6) else "day"
        lighting_counts[lighting] += 1
        if len(recent_lines) < 5:
            recent_lines.append(
                f"{timestamp_text} | camera={camera_id} | plate={plate_number} | vehicle={vehicle_type} | violation={violation_type}"
            )

    vehicle_summary = ", ".join(
        f"{vehicle_type}: {count}"
        for vehicle_type, count in sorted(vehicle_counts.items())
    ) or "none"
    camera_summary = ", ".join(
        f"{camera_id}: {count}"
        for camera_id, count in sorted(camera_counts.items())
    ) or "none"

    return (
        f"Recent detections={len(rows)}. "
        f"Vehicle mix={vehicle_summary}. "
        f"Lighting mix=day:{lighting_counts['day']}, night:{lighting_counts['night']}. "
        f"Camera mix={camera_summary}. "
        f"Latest records: {'; '.join(recent_lines)}"
    )


def resolve_ollama_host() -> str:
    """Detect available Ollama host dynamically with quick fallback."""
    import os
    import urllib.request
    env_host = os.getenv("OLLAMA_HOST")
    candidates = []
    if env_host:
        candidates.append(env_host.strip().rstrip("/"))
    candidates.extend([
        "http://host.docker.internal:11434",
        "http://127.0.0.1:11434",
        "http://localhost:11434",
        "http://ollama:11434",
    ])
    for host in candidates:
        try:
            req = urllib.request.Request(f"{host}/api/tags", headers={"User-Agent": "TrafficAI/1.0"})
            with urllib.request.urlopen(req, timeout=0.6) as response:
                if response.status == 200:
                    return host
        except Exception:
            continue
    return env_host or "http://127.0.0.1:11434"


def build_system_prompt(
    project_context: str,
    law_result: TrafficLawResult,
    *,
    scope: str = "project",
    context_hint: str = "",
) -> str:
    grounded_law = law_result.grounded_fact or ""
    safe_context_hint = (context_hint or "").strip()[:1000]

    return (
        "Bạn là Trợ lý AI Giao Thông Thông Minh chuyên nghiệp, am hiểu sâu sắc về Luật Trật tự, an toàn giao thông đường bộ Việt Nam "
        "(Nghị định 168/2024/NĐ-CP, Quy chuẩn QCVN 41:2019/BGTVT, Luật Giao thông đường bộ và các quy tắc giao thông đời sống). "
        "Bạn đồng thời hỗ trợ quản trị, giám sát camera, phân tích phương tiện, biển số OCR và nghiệp vụ xử lý vi phạm trong hệ thống.\n\n"
        "PHONG CÁCH & NGUYÊN TẮC TRẢ LỜI:\n"
        "1. Trả lời HOÀN TOÀN BẰNG TIẾNG VIỆT tự nhiên, mạch lạc, thân thiện, nhiệt tình như một chuyên gia tư vấn giao thông đời thực.\n"
        "2. Không bị giới hạn vào từ khóa cứng nhắc. Bạn có thể giải đáp phong phú, chi tiết mọi thắc mắc đời sống: "
        "kỹ năng lái xe an toàn, luật rẽ phải khi đèn đỏ, quy định nồng độ cồn, điểm trừ giấy phép lái xe (GPLX), kinh nghiệm lái xe trời mưa/đêm, "
        "ý nghĩa biển báo hiệu, vạch kẻ đường, thủ tục đăng kiểm, sang tên xe, tra cứu phạt nguội, và các tình huống giao thông thực tế.\n"
        "3. Trình bày rõ ràng, dễ đọc, sử dụng gạch đầu dòng (• hoặc số 1, 2, 3), in đậm các ý then chốt, mức phạt, điều luật.\n"
        "4. Về mức phạt & căn cứ pháp lý: Luôn ưu tiên Nghị định 168/2024/NĐ-CP. Nếu có căn cứ tra cứu bên dưới, hãy kết hợp trả lời chính xác. "
        "Nếu câu hỏi chưa rõ loại phương tiện (ô tô hay xe máy), hãy nêu rõ các trường hợp phổ biến để người dùng nắm rõ.\n"
        "5. Về hồ sơ & thông tin xe: Khi người dùng hỏi về một mã hồ sơ (BB-..., HS-..., #...), một biển số hoặc một bản ghi, HÃY DÙNG TRỰC TIẾP DỮ LIỆU ĐƯỢC CUNG CẤP TRONG 'NGỮ CẢNH HỒ SƠ PHƯƠNG TIỆN ĐANG CHỌN' bên dưới để trả lời ngay lập tức: "
        "nêu rõ mã hồ sơ, biển số, loại xe, hành vi vi phạm, mức phạt, thời gian, camera và thông tin chủ phương tiện (họ tên, SĐT, địa chỉ đăng ký). "
        "Tuyệt đối không từ chối lấy thông tin hồ sơ vì đây là dữ liệu nội bộ được hệ thống cấp phép cung cấp cho người vận hành.\n"
        "6. Với câu hỏi chào hỏi hoặc câu hỏi kiến thức chung, hãy trò chuyện tự nhiên, lịch sự rồi sẵn sàng tư vấn giao thông.\n\n"
        f"NGỮ CẢNH DỰ ÁN HIỆN TẠI:\n{project_context}\n"
        + (f"NGỮ CẢNH HỒ SƠ PHƯƠNG TIỆN ĐANG CHỌN:\n{safe_context_hint}\n" if safe_context_hint else "")
        + (f"CĂN CỨ PHÁP LÝ TRA CỨU ĐƯỢC:\n{grounded_law}\n" if grounded_law else "")
    )


def build_ollama_messages(
    system_prompt: str,
    history: Optional[List[Dict[str, str]]],
    user_message: str,
) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for item in (history or [])[-8:]:
        role = item.get("role")
        content = (item.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content[:1500]})
    messages.append({"role": "user", "content": user_message})
    return messages
