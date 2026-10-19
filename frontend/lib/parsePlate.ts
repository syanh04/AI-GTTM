/**
 * parsePlate.ts — Hàm chuẩn hóa biển số xe Việt Nam
 *
 * Hỗ trợ:
 * - Biển 1 dòng: "30A-123.45"
 * - Biển 2 dòng (vuông): "30A\n12345" → "30A-123.45"
 * - Xử lý khoảng trắng, ký tự đặc biệt từ OCR
 */

/**
 * Chuẩn hóa kết quả OCR biển số xe Việt Nam.
 *
 * @param raw - Chuỗi thô từ OCR (có thể chứa newline, khoảng trắng bất thường)
 * @returns Chuỗi biển số đã chuẩn hóa (ví dụ: "30A-123.45") hoặc chuỗi gốc đã trim nếu không khớp format
 *
 * @example
 * parseVietnamesePlate("30A\\n12345")   // → "30A-123.45"
 * parseVietnamesePlate("51G - 999.99")  // → "51G-999.99"
 * parseVietnamesePlate("29H 123 45")    // → "29H-123.45"
 */
export function parseVietnamesePlate(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';

    // Bước 1: Loại bỏ các ký tự đặc biệt không mong muốn, giữ lại chữ, số, dấu gạch ngang, dấu chấm
    let cleaned = raw
        .replace(/[\r\n]+/g, ' ')       // Thay newline bằng khoảng trắng (biển 2 dòng)
        .replace(/[^A-Za-z0-9\s\-\.]/g, '') // Loại bỏ ký tự lạ
        .replace(/\s+/g, ' ')           // Gộp nhiều khoảng trắng thành 1
        .trim()
        .toUpperCase();

    if (!cleaned) return '';

    // Bước 2: Thử match biển số Việt Nam (format chuẩn)
    // Pattern: 2 số + 1-2 chữ cái + tùy chọn 1 số (series) + 3-5 số
    // Ví dụ: 30A-12345, 51G1-99999, 29H-123.45
    const plateRegex = /^(\d{2})([A-Z]{1,2}\d?)\s*[-–\s]?\s*(\d{3,5})$/;
    const match = cleaned.replace(/\./g, '').replace(/-/g, ' ').trim().match(plateRegex);

    if (match) {
        const [, province, series, numbers] = match;

        // Bước 3: Format chuẩn với dấu chấm phân cách
        // Nếu phần số có 5 chữ số: 123.45, nếu 4: 1234, nếu 3: 123
        let formattedNumbers = numbers;
        if (numbers.length === 5) {
            formattedNumbers = `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
        } else if (numbers.length === 4) {
            formattedNumbers = `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
        }

        return `${province}${series}-${formattedNumbers}`;
    }

    // Bước 4: Nếu không match được pattern chuẩn, trả về chuỗi đã làm sạch
    return cleaned;
}

/**
 * Kiểm tra xem chuỗi có phải biển số Việt Nam hợp lệ không.
 *
 * @param plate - Chuỗi biển số đã chuẩn hóa
 * @returns true nếu là biển số hợp lệ
 */
export function isValidVietnamesePlate(plate: string): boolean {
    // Format: 2 số + 1-2 chữ + tùy chọn số + dấu gạch + 3-5 số (có thể có dấu chấm)
    const validPattern = /^\d{2}[A-Z]{1,2}\d?-\d{3,5}(\.\d{1,2})?$/;
    return validPattern.test(plate);
}
