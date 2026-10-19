from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import Dict, Optional, Tuple


def fold_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    ascii_text = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return ascii_text.replace("đ", "d").replace("Đ", "D").lower()


TRAFFIC_LAW_KB: Dict[str, Dict[str, object]] = {
    "red_light": {
        "label": "vượt đèn đỏ",
        "aliases": (
            "vuot den do",
            "vuot den vang",
            "khong chap hanh den tin hieu",
            "khong chap hanh hieu lenh cua den tin hieu giao thong",
        ),
        "vehicles": {
            "motorbike": {
                "label": "xe máy",
                "fine": "4.000.000-6.000.000 đồng",
                "basis": "điểm c khoản 7 Điều 7 Nghị định 168/2024/NĐ-CP",
            },
            "car": {
                "label": "ô tô",
                "fine": "18.000.000-20.000.000 đồng",
                "basis": "điểm b khoản 9 Điều 6 Nghị định 168/2024/NĐ-CP",
            },
            "truck": {
                "label": "xe tải",
                "fine": "18.000.000-20.000.000 đồng",
                "basis": "điểm b khoản 9 Điều 6 Nghị định 168/2024/NĐ-CP",
            },
        },
    },
    "wrong_way": {
        "label": "đi ngược chiều",
        "aliases": ("di nguoc chieu", "nguoc chieu", "cam di nguoc chieu"),
        "vehicles": {
            "motorbike": {
                "label": "xe máy",
                "fine": "4.000.000-6.000.000 đồng",
                "basis": "điểm a khoản 7 Điều 7 Nghị định 168/2024/NĐ-CP",
            },
            "car": {
                "label": "ô tô",
                "fine": "18.000.000-20.000.000 đồng",
                "basis": "điểm d khoản 9 Điều 6 Nghị định 168/2024/NĐ-CP",
            },
            "truck": {
                "label": "xe tải",
                "fine": "18.000.000-20.000.000 đồng",
                "basis": "điểm d khoản 9 Điều 6 Nghị định 168/2024/NĐ-CP",
            },
        },
    },
    "wrong_lane": {
        "label": "đi sai làn",
        "aliases": ("sai lan", "lan lan", "khong dung lan", "khong dung phan duong"),
        "vehicles": {
            "motorbike": {
                "label": "xe máy",
                "fine": "600.000-800.000 đồng",
                "basis": "điểm d khoản 3 Điều 7 Nghị định 168/2024/NĐ-CP",
            },
            "car": {
                "label": "ô tô",
                "fine": "4.000.000-6.000.000 đồng",
                "basis": "điểm b khoản 5 Điều 6 Nghị định 168/2024/NĐ-CP",
            },
            "truck": {
                "label": "xe tải",
                "fine": "4.000.000-6.000.000 đồng",
                "basis": "điểm b khoản 5 Điều 6 Nghị định 168/2024/NĐ-CP",
            },
        },
    },
    "helmet": {
        "label": "không đội mũ bảo hiểm",
        "aliases": ("khong doi mu bao hiem", "khong cai quai mu bao hiem", "khong doi non bao hiem"),
        "vehicles": {
            "motorbike": {
                "label": "xe máy",
                "fine": "400.000-600.000 đồng",
                "basis": "điểm h, i khoản 2 Điều 7 Nghị định 168/2024/NĐ-CP",
            },
        },
    },
    "speeding_5_10": {
        "label": "quá tốc độ từ 5 đến dưới 10 km/h",
        "aliases": ("qua toc do 5", "qua toc do tu 5", "vuot toc do 5", "5 den duoi 10"),
        "vehicles": {
            "motorbike": {
                "label": "xe máy",
                "fine": "400.000-600.000 đồng",
                "basis": "điểm b khoản 2 Điều 7 Nghị định 168/2024/NĐ-CP",
            },
            "car": {
                "label": "ô tô",
                "fine": "800.000-1.000.000 đồng",
                "basis": "điểm a khoản 3 Điều 6 Nghị định 168/2024/NĐ-CP",
            },
            "truck": {
                "label": "xe tải",
                "fine": "800.000-1.000.000 đồng",
                "basis": "điểm a khoản 3 Điều 6 Nghị định 168/2024/NĐ-CP",
            },
        },
    },
    "phone_use": {
        "label": "dùng điện thoại khi đang lái xe",
        "aliases": (
            "dung dien thoai",
            "su dung dien thoai",
            "cam dien thoai",
            "nghe dien thoai khi lai xe",
        ),
        "vehicles": {
            "motorbike": {
                "label": "xe máy",
                "fine": "800.000-1.000.000 đồng",
                "basis": "điểm đ khoản 4 Điều 7 Nghị định 168/2024/NĐ-CP",
            },
            "car": {
                "label": "ô tô",
                "fine": "4.000.000-6.000.000 đồng",
                "basis": "điểm h khoản 5 Điều 6 Nghị định 168/2024/NĐ-CP",
            },
            "truck": {
                "label": "xe tải",
                "fine": "4.000.000-6.000.000 đồng",
                "basis": "điểm h khoản 5 Điều 6 Nghị định 168/2024/NĐ-CP",
            },
        },
    },
    "illegal_parking": {
        "label": "dừng đỗ sai quy định",
        "aliases": (
            "dung do sai quy dinh",
            "dung xe sai quy dinh",
            "do xe sai quy dinh",
            "dung sai quy dinh",
        ),
        "vehicles": {},
    },
    "speeding_over_20": {
        "label": "quá tốc độ trên 20 km/h",
        "aliases": ("qua toc do tren 20", "vuot toc do tren 20", "hon 20 km"),
        "vehicles": {
            "motorbike": {
                "label": "xe máy",
                "fine": "6.000.000-8.000.000 đồng",
                "basis": "điểm a khoản 8 Điều 7 Nghị định 168/2024/NĐ-CP",
            },
        },
    },
}


TRAFFIC_LAW_KB = {
    "red_light": {
        "label": "v\u01b0\u1ee3t \u0111\u00e8n \u0111\u1ecf",
        "aliases": (
            "vuot den do",
            "vuot den vang",
            "khong chap hanh den tin hieu",
            "khong chap hanh hieu lenh cua den tin hieu giao thong",
        ),
        "vehicles": {
            "motorbike": {
                "label": "xe m\u00e1y",
                "fine": "4.000.000-6.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m c kho\u1ea3n 7 \u0110i\u1ec1u 7 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
            "car": {
                "label": "\u00f4 t\u00f4",
                "fine": "18.000.000-20.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m b kho\u1ea3n 9 \u0110i\u1ec1u 6 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
            "truck": {
                "label": "xe t\u1ea3i",
                "fine": "18.000.000-20.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m b kho\u1ea3n 9 \u0110i\u1ec1u 6 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
        },
    },
    "wrong_way": {
        "label": "\u0111i ng\u01b0\u1ee3c chi\u1ec1u",
        "aliases": ("di nguoc chieu", "nguoc chieu", "cam di nguoc chieu"),
        "vehicles": {
            "motorbike": {
                "label": "xe m\u00e1y",
                "fine": "4.000.000-6.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m a kho\u1ea3n 7 \u0110i\u1ec1u 7 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
            "car": {
                "label": "\u00f4 t\u00f4",
                "fine": "18.000.000-20.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m d kho\u1ea3n 9 \u0110i\u1ec1u 6 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
            "truck": {
                "label": "xe t\u1ea3i",
                "fine": "18.000.000-20.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m d kho\u1ea3n 9 \u0110i\u1ec1u 6 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
        },
    },
    "wrong_lane": {
        "label": "\u0111i sai l\u00e0n",
        "aliases": ("sai lan", "lan lan", "khong dung lan", "khong dung phan duong"),
        "vehicles": {
            "motorbike": {
                "label": "xe m\u00e1y",
                "fine": "600.000-800.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m d kho\u1ea3n 3 \u0110i\u1ec1u 7 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
            "car": {
                "label": "\u00f4 t\u00f4",
                "fine": "4.000.000-6.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m b kho\u1ea3n 5 \u0110i\u1ec1u 6 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
            "truck": {
                "label": "xe t\u1ea3i",
                "fine": "4.000.000-6.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m b kho\u1ea3n 5 \u0110i\u1ec1u 6 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
        },
    },
    "helmet": {
        "label": "kh\u00f4ng \u0111\u1ed9i m\u0169 b\u1ea3o hi\u1ec3m",
        "aliases": ("khong doi mu bao hiem", "khong cai quai mu bao hiem", "khong doi non bao hiem"),
        "vehicles": {
            "motorbike": {
                "label": "xe m\u00e1y",
                "fine": "400.000-600.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m h, i kho\u1ea3n 2 \u0110i\u1ec1u 7 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
        },
    },
    "speeding_5_10": {
        "label": "qu\u00e1 t\u1ed1c \u0111\u1ed9 t\u1eeb 5 \u0111\u1ebfn d\u01b0\u1edbi 10 km/h",
        "aliases": ("qua toc do 5", "qua toc do tu 5", "vuot toc do 5", "5 den duoi 10"),
        "vehicles": {
            "motorbike": {
                "label": "xe m\u00e1y",
                "fine": "400.000-600.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m b kho\u1ea3n 2 \u0110i\u1ec1u 7 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
            "car": {
                "label": "\u00f4 t\u00f4",
                "fine": "800.000-1.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m a kho\u1ea3n 3 \u0110i\u1ec1u 6 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
            "truck": {
                "label": "xe t\u1ea3i",
                "fine": "800.000-1.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m a kho\u1ea3n 3 \u0110i\u1ec1u 6 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
        },
    },
    "phone_use": {
        "label": "d\u00f9ng \u0111i\u1ec7n tho\u1ea1i khi \u0111ang l\u00e1i xe",
        "aliases": ("dung dien thoai", "su dung dien thoai", "cam dien thoai", "nghe dien thoai khi lai xe"),
        "vehicles": {
            "motorbike": {
                "label": "xe m\u00e1y",
                "fine": "800.000-1.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m \u0111 kho\u1ea3n 4 \u0110i\u1ec1u 7 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
            "car": {
                "label": "\u00f4 t\u00f4",
                "fine": "4.000.000-6.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m h kho\u1ea3n 5 \u0110i\u1ec1u 6 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
            "truck": {
                "label": "xe t\u1ea3i",
                "fine": "4.000.000-6.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m h kho\u1ea3n 5 \u0110i\u1ec1u 6 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
        },
    },
    "illegal_parking": {
        "label": "d\u1eebng \u0111\u1ed7 sai quy \u0111\u1ecbnh",
        "aliases": ("dung do sai quy dinh", "dung xe sai quy dinh", "do xe sai quy dinh", "dung sai quy dinh"),
        "vehicles": {},
    },
    "speeding_over_20": {
        "label": "qu\u00e1 t\u1ed1c \u0111\u1ed9 tr\u00ean 20 km/h",
        "aliases": ("qua toc do tren 20", "vuot toc do tren 20", "hon 20 km"),
        "vehicles": {
            "motorbike": {
                "label": "xe m\u00e1y",
                "fine": "6.000.000-8.000.000 \u0111\u1ed3ng",
                "basis": "\u0111i\u1ec3m a kho\u1ea3n 8 \u0110i\u1ec1u 7 Ngh\u1ecb \u0111\u1ecbnh 168/2024/N\u0110-CP",
            },
        },
    },
}


TRAFFIC_LAW_POINTS = {
    "red_light": {
        "motorbike": "trừ 4 điểm GPLX theo điểm b khoản 13 Điều 7",
        "car": "trừ 4 điểm GPLX theo điểm b khoản 16 Điều 6",
        "truck": "trừ 4 điểm GPLX theo điểm b khoản 16 Điều 6",
    },
    "wrong_way": {
        "motorbike": "trừ 2 điểm GPLX theo điểm a khoản 13 Điều 7",
        "car": "trừ 4 điểm GPLX theo điểm b khoản 16 Điều 6",
        "truck": "trừ 4 điểm GPLX theo điểm b khoản 16 Điều 6",
    },
    "wrong_lane": {
        "motorbike": "không thuộc nhóm trừ điểm tại khoản 13 Điều 7",
        "car": "trừ 2 điểm GPLX theo điểm a khoản 16 Điều 6",
        "truck": "trừ 2 điểm GPLX theo điểm a khoản 16 Điều 6",
    },
    "helmet": {
        "motorbike": "không thuộc nhóm trừ điểm tại khoản 13 Điều 7",
    },
    "speeding_5_10": {
        "motorbike": "không thuộc nhóm trừ điểm tại khoản 13 Điều 7",
        "car": "không thuộc nhóm trừ điểm tại khoản 16 Điều 6",
        "truck": "không thuộc nhóm trừ điểm tại khoản 16 Điều 6",
    },
    "phone_use": {
        "motorbike": "trừ 4 điểm GPLX theo điểm b khoản 13 Điều 7",
        "car": "trừ 4 điểm GPLX theo điểm b khoản 16 Điều 6",
        "truck": "trừ 4 điểm GPLX theo điểm b khoản 16 Điều 6",
    },
    "speeding_over_20": {
        "motorbike": "trừ 10 điểm GPLX theo điểm d khoản 13 Điều 7",
    },
}


@dataclass(frozen=True)
class TrafficLawResult:
    mode: str
    answer: str = ""
    grounded_fact: str = ""
    rule_key: str = ""


def infer_vehicle_key(message_folded: str, vehicle_type_hint: str = "") -> Optional[str]:
    combined = f"{message_folded} {fold_text(vehicle_type_hint)}"
    if any(token in combined for token in ("xe may", "mo to", "moto", "motorbike", "motorcycle")):
        return "motorbike"
    if any(token in combined for token in ("xe tai", "truck")):
        return "truck"
    if any(token in combined for token in ("o to", "oto", "car")):
        return "car"
    return None


def format_law_vehicle(rule_key: str, vehicle_key: str, info: Dict[str, str]) -> str:
    point_text = TRAFFIC_LAW_POINTS.get(rule_key, {}).get(vehicle_key, "")
    point_suffix = f"; {point_text}" if point_text else ""
    return f"{info['label']}: phạt {info['fine']} ({info['basis']}{point_suffix})"


def analyze_traffic_law(
    user_message: str,
    vehicle_type_hint: str = "",
    violation_hint: str = "",
) -> TrafficLawResult:
    normalized_message = fold_text(user_message)
    normalized_context = fold_text(f"{user_message} {violation_hint}")
    vehicle_key = infer_vehicle_key(normalized_message, vehicle_type_hint)

    speeding_over_20_aliases = TRAFFIC_LAW_KB["speeding_over_20"]["aliases"]
    if vehicle_key in ("car", "truck") and any(alias in normalized_context for alias in speeding_over_20_aliases):
        return TrafficLawResult(
            mode="clarify",
            answer=(
                "Với ô tô, mức vượt trên 20 km/h được tách thành hai ngưỡng: trên 20 đến 35 km/h "
                "và trên 35 km/h. Bạn hãy xác nhận đúng ngưỡng để hệ thống tra mức phạt và điểm trừ chính xác."
            ),
        )

    if "qua toc do" in normalized_context and not any(
        alias in normalized_context
        for key in ("speeding_5_10", "speeding_over_20")
        for alias in TRAFFIC_LAW_KB[key]["aliases"]
    ):
        fine_lines = [
            f"{info['label']}: ph\u1ea1t {info['fine']} ({info['basis']})"
            for info in selected.values()
        ]
        fine_text = "; ".join(fine_lines)
        grounded_fact = f"L\u1ed7i {rule['label']}: {fine_text}."
        answer = (
            f"V\u1edbi l\u1ed7i {rule['label']}: {fine_text}. "
            "N\u1ebfu \u0111ang x\u1eed l\u00fd h\u1ed3 s\u01a1 t\u1eeb camera, n\u00ean x\u00e1c nh\u1eadn lo\u1ea1i xe v\u00e0 bi\u1ec3n s\u1ed1, "
            "\u0111\u1ed1i chi\u1ebfu \u1ea3nh/video, l\u01b0u b\u1eb1ng ch\u1ee9ng r\u1ed3i chuy\u1ec3n sang b\u01b0\u1edbc th\u00f4ng b\u00e1o "
            "ho\u1eb7c x\u1eed l\u00fd theo quy tr\u00ecnh n\u1ed9i b\u1ed9."
        )
        return TrafficLawResult(
            mode="clarify",
            answer=(
                "Lỗi quá tốc độ cần biết xe vượt bao nhiêu km/h mới xác định đúng mức phạt. "
                "Bạn hãy cho biết loại xe và mức vượt tốc độ, ví dụ 5-10 km/h hoặc trên 20 km/h."
            ),
        )

    if any(alias in normalized_context for alias in TRAFFIC_LAW_KB["illegal_parking"]["aliases"]):
        return TrafficLawResult(
            mode="clarify",
            answer=(
                "Lỗi dừng đỗ cần biết hành vi cụ thể mới xác định đúng mức phạt, ví dụ đỗ nơi có biển cấm, "
                "đỗ trên vỉa hè, dừng trong hầm đường bộ hoặc dừng đỗ gây cản trở. "
                "Bạn hãy cho biết loại xe và vị trí/hành vi dừng đỗ."
            ),
        )

    for rule_key, rule in TRAFFIC_LAW_KB.items():
        aliases: Tuple[str, ...] = rule["aliases"]  # type: ignore[assignment]
        if not any(alias in normalized_context for alias in aliases):
            continue

        vehicles: Dict[str, Dict[str, str]] = rule["vehicles"]  # type: ignore[assignment]
        if vehicle_key and vehicle_key in vehicles:
            selected = {vehicle_key: vehicles[vehicle_key]}
        else:
            selected = vehicles

        fine_lines = [format_law_vehicle(rule_key, selected_vehicle, info) for selected_vehicle, info in selected.items()]
        fine_text = "; ".join(fine_lines)
        grounded_fact = f"Lỗi {rule['label']}: {fine_text}."
        answer = (
            f"Với lỗi {rule['label']}: {fine_text}. "
            "Nếu đang xử lý hồ sơ từ camera, nên xác nhận loại xe và biển số, đối chiếu ảnh/video, "
            "lưu bằng chứng rồi chuyển sang bước thông báo hoặc xử lý theo quy trình nội bộ."
        )
        return TrafficLawResult(
            mode="grounded",
            answer=answer,
            grounded_fact=grounded_fact,
            rule_key=rule_key,
        )

    return TrafficLawResult(mode="none")


def analyze_traffic_law(
    user_message: str,
    vehicle_type_hint: str = "",
    violation_hint: str = "",
) -> TrafficLawResult:
    normalized_message = fold_text(user_message)
    normalized_context = fold_text(f"{user_message} {violation_hint}")
    vehicle_key = infer_vehicle_key(normalized_message, vehicle_type_hint)

    speeding_over_20_aliases = TRAFFIC_LAW_KB["speeding_over_20"]["aliases"]
    if vehicle_key in ("car", "truck") and any(alias in normalized_context for alias in speeding_over_20_aliases):
        return TrafficLawResult(
            mode="clarify",
            answer=(
                "Với ô tô, mức vượt trên 20 km/h được tách thành hai ngưỡng: trên 20 đến 35 km/h "
                "và trên 35 km/h. Bạn hãy xác nhận đúng ngưỡng để hệ thống tra mức phạt và điểm trừ chính xác."
            ),
        )

    if "qua toc do" in normalized_context and not any(
        alias in normalized_context
        for key in ("speeding_5_10", "speeding_over_20")
        for alias in TRAFFIC_LAW_KB[key]["aliases"]
    ):
        return TrafficLawResult(
            mode="clarify",
            answer=(
                "L\u1ed7i qu\u00e1 t\u1ed1c \u0111\u1ed9 c\u1ea7n bi\u1ebft xe v\u01b0\u1ee3t bao nhi\u00eau km/h m\u1edbi x\u00e1c \u0111\u1ecbnh \u0111\u00fang m\u1ee9c ph\u1ea1t. "
                "B\u1ea1n h\u00e3y cho bi\u1ebft lo\u1ea1i xe v\u00e0 m\u1ee9c v\u01b0\u1ee3t t\u1ed1c \u0111\u1ed9, v\u00ed d\u1ee5 5-10 km/h ho\u1eb7c tr\u00ean 20 km/h."
            ),
        )

    if any(alias in normalized_context for alias in TRAFFIC_LAW_KB["illegal_parking"]["aliases"]):
        return TrafficLawResult(
            mode="clarify",
            answer=(
                "L\u1ed7i d\u1eebng \u0111\u1ed7 c\u1ea7n bi\u1ebft h\u00e0nh vi c\u1ee5 th\u1ec3 m\u1edbi x\u00e1c \u0111\u1ecbnh \u0111\u00fang m\u1ee9c ph\u1ea1t. "
                "B\u1ea1n h\u00e3y cho bi\u1ebft lo\u1ea1i xe v\u00e0 v\u1ecb tr\u00ed/h\u00e0nh vi d\u1eebng \u0111\u1ed7."
            ),
        )

    for rule_key, rule in TRAFFIC_LAW_KB.items():
        aliases: Tuple[str, ...] = rule["aliases"]  # type: ignore[assignment]
        if not any(alias in normalized_context for alias in aliases):
            continue
        vehicles: Dict[str, Dict[str, str]] = rule["vehicles"]  # type: ignore[assignment]
        selected = {vehicle_key: vehicles[vehicle_key]} if vehicle_key and vehicle_key in vehicles else vehicles
        fine_lines = [format_law_vehicle(rule_key, selected_vehicle, info) for selected_vehicle, info in selected.items()]
        fine_text = "; ".join(fine_lines)
        grounded_fact = f"Lỗi {rule['label']}: {fine_text}."
        fine_bullets = "\n".join(
            f"• **{item.split(':', 1)[0]}:** {item.split(':', 1)[1].strip()}" if ":" in item else f"• {item}"
            for item in fine_lines
        )
        answer = (
            f"📌 **Quy định xử phạt lỗi {rule['label']}** (Nghị định 168/2024/NĐ-CP):\n\n"
            f"{fine_bullets}\n\n"
            "💡 *Khuyến nghị:* Đối chiếu ảnh/video bằng chứng và biển số trước khi duyệt lập biên bản xử phạt."
        )
        return TrafficLawResult(mode="grounded", answer=answer, grounded_fact=grounded_fact, rule_key=rule_key)

    return TrafficLawResult(mode="none")


def should_answer_directly(user_message: str, law_result: TrafficLawResult) -> bool:
    if law_result.mode != "grounded":
        return False
    normalized = fold_text(user_message).strip()
    direct_tokens = (
        "phat bao nhieu",
        "muc phat",
        "bi phat",
        "phat sao",
        "loi nay phat",
        "bao nhieu tien",
        "quy dinh",
        "nghi dinh",
        "dieu khoan",
        "xu phat",
        "tru diem",
        "bang lai",
        "gplx",
        "luat",
        "che tai",
    )
    if any(token in normalized for token in direct_tokens):
        return True
    # Câu hỏi ngắn gọn (<= 7 từ) hỏi trực tiếp về lỗi vi phạm (ví dụ: "vượt đèn đỏ", "sai làn", "ngược chiều")
    if len(normalized.split()) <= 7:
        return True
    return False
