"""Plate normalization utility used across backend."""
import re

_SIMILAR_CHARS = {
    "O": "0",
    "B": "8",
    "I": "1",
}

def normalize_plate(plate: str | None) -> str:
    """
    Chuẩn hóa biển số để tìm gần đúng:
    - Viết hoa, loại bỏ toàn bộ ký tự không phải chữ/số (dấu chấm, gạch ngang, khoảng trắng, đốm...)
    - Chuẩn hóa các cặp ký tự dễ nhầm: O -> 0, B -> 8, I -> 1
    """
    if not plate:
        return ""
    clean = re.sub(r"[^A-Za-z0-9]", "", str(plate)).upper()
    for char, rep in _SIMILAR_CHARS.items():
        clean = clean.replace(char, rep)
    return clean
