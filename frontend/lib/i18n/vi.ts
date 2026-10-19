/**
 * Từ điển thuật ngữ tiếng Việt chuẩn cho hệ thống Smart Traffic ALPR
 */

export const VEHICLE_TYPE_MAP: Record<string, string> = {
  car: 'Ô tô',
  motorcycle: 'Xe máy',
  motorbike: 'Xe máy',
  truck: 'Xe tải',
  bus: 'Xe khách',
  van: 'Xe van',
  bicycle: 'Xe đạp',
  unknown: 'Chưa xác định',
};

export const REVIEW_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Chờ duyệt', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  confirmed: { label: 'Đã xác nhận', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  rejected: { label: 'Đã bỏ qua', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200' },
  needs_review: { label: 'Cần rà soát', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
};

export const STATUS_DICT = REVIEW_STATUS_MAP;
export const VEHICLE_TYPES = VEHICLE_TYPE_MAP;

export const VIOLATION_TYPE_MAP: Record<string, string> = {
  red_light: 'Vượt đèn đỏ',
  wrong_lane: 'Đi sai làn đường',
  speeding: 'Chạy quá tốc độ',
  helmet_less: 'Không đội mũ bảo hiểm',
  retrograde: 'Đi ngược chiều',
  cut_in: 'Cắt đầu nguy hiểm',
  yellow_light: 'Vượt đèn vàng',
  illegal_parking: 'Dừng đỗ trái phép',
  none: 'Không vi phạm',
};

export const ROLE_MAP: Record<string, { label: string; badge: string }> = {
  admin: { label: 'Quản trị viên', badge: 'bg-rose-100 text-rose-800 border-rose-200' },
  operator: { label: 'Điều hành viên', badge: 'bg-sky-100 text-sky-800 border-sky-200' },
  viewer: { label: 'Người xem', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
  user: { label: 'Người dùng', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
};

export const CAMERA_STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: 'Đang hoạt động', color: 'text-emerald-600' },
  inactive: { label: 'Mất kết nối', color: 'text-rose-600' },
  archived: { label: 'Đã lưu trữ', color: 'text-slate-500' },
};

export function formatVehicleType(type?: string | null): string {
  if (!type) return 'Chưa xác định';
  const key = type.toLowerCase().trim();
  return VEHICLE_TYPE_MAP[key] || type;
}

export function formatReviewStatus(status?: string | null) {
  if (!status) return REVIEW_STATUS_MAP.pending;
  const key = status.toLowerCase().trim();
  return REVIEW_STATUS_MAP[key] || { label: status, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200' };
}

export function formatViolationType(type?: string | null): string {
  if (!type || !type.trim()) return 'Chưa ghi nhận vi phạm';
  const key = type.toLowerCase().trim();
  return VIOLATION_TYPE_MAP[key] || type;
}

export function formatRole(role?: string | null) {
  if (!role) return ROLE_MAP.viewer;
  const key = role.toLowerCase().trim();
  return ROLE_MAP[key] || { label: role, badge: 'bg-slate-100 text-slate-700 border-slate-200' };
}

export function formatDateTime(isoString?: string | null): string {
  if (!isoString) return '--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}
