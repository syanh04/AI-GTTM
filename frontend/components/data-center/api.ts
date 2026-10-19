import {
  AuditItem,
  CameraStat,
  DataDetail,
  DataItem,
  ModelMetrics,
  StorageInfo,
  SummaryKPI,
} from './types';

export async function fetchDetections(params: Record<string, any>): Promise<{
  items: DataItem[];
  total: number;
  page: number;
  page_size: number;
  max_id: number;
}> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      query.append(k, String(v));
    }
  });

  const res = await fetch(`/api/data/detections?${query.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Lỗi truy vấn dữ liệu (${res.status})`);
  }
  return res.json();
}

export async function fetchDetectionDetail(id: number): Promise<DataDetail> {
  const res = await fetch(`/api/data/detections/${id}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Lỗi lấy chi tiết (${res.status})`);
  return res.json();
}

export async function updatePlate(id: number, plate: string, note?: string) {
  const res = await fetch(`/api/data/detections/${id}/plate`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ plate, note }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Lỗi cập nhật biển số (${res.status})`);
  }
  return res.json();
}

export async function reviewViolation(id: number, status: string, note?: string) {
  const res = await fetch(`/api/data/detections/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status, note }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Lỗi duyệt vi phạm (${res.status})`);
  }
  return res.json();
}

export async function bulkAction(ids: number[], action: string, reason?: string) {
  const res = await fetch('/api/data/detections/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ids, action, reason }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Lỗi thực hiện thao tác hàng loạt (${res.status})`);
  }
  return res.json();
}

export async function softDelete(id: number, reason?: string) {
  const res = await fetch(`/api/data/detections/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(`Lỗi xóa bản ghi (${res.status})`);
  return res.json();
}

export async function restoreRecord(id: number) {
  const res = await fetch(`/api/data/detections/${id}/restore`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Lỗi khôi phục (${res.status})`);
  return res.json();
}

export async function purgeRecord(id: number) {
  const res = await fetch(`/api/data/detections/${id}/purge`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Lỗi xóa vĩnh viễn (${res.status})`);
  return res.json();
}

export async function fetchSummaryKPI(date_from?: string, date_to?: string): Promise<SummaryKPI> {
  const q = new URLSearchParams();
  if (date_from) q.append('date_from', date_from);
  if (date_to) q.append('date_to', date_to);
  const res = await fetch(`/api/data/summary?${q.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Lỗi lấy chỉ số KPI');
  return res.json();
}

export async function fetchCameras(): Promise<CameraStat[]> {
  const res = await fetch('/api/data/cameras', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Lỗi lấy danh sách camera');
  return res.json();
}

export async function fetchStorage(): Promise<StorageInfo> {
  const res = await fetch('/api/data/storage', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Lỗi lấy thông tin lưu trữ');
  return res.json();
}

export async function runCleanup(older_than_days: number, dry_run: boolean) {
  const res = await fetch('/api/data/storage/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ older_than_days, dry_run }),
  });
  if (!res.ok) throw new Error('Lỗi dọn dẹp lưu trữ');
  return res.json();
}

export async function fetchModelMetrics(): Promise<ModelMetrics> {
  const res = await fetch('/api/data/model-metrics', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Lỗi lấy thông số mô hình');
  return res.json();
}

export async function fetchAuditLogs(page: number, page_size: number): Promise<{
  items: AuditItem[];
  total: number;
}> {
  const res = await fetch(`/api/data/audit-logs?page=${page}&page_size=${page_size}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Lỗi lấy nhật ký');
  return res.json();
}
