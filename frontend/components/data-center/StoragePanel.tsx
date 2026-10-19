'use client';

import React, { useEffect, useState } from 'react';
import { StorageInfo } from './types';
import { fetchStorage, runCleanup } from './api';
import { HardDrive, AlertTriangle, Trash2, CheckCircle } from 'lucide-react';

interface StoragePanelProps {
  isAdmin: boolean;
}

export default function StoragePanel({ isAdmin }: StoragePanelProps) {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [cleanupResult, setCleanupResult] = useState<any>(null);

  const loadData = () => {
    setLoading(true);
    fetchStorage()
      .then((data) => {
        setStorage(data);
        setRetentionDays(data.retention_days || 30);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePreviewCleanup = async () => {
    try {
      const res = await runCleanup(retentionDays, true);
      setCleanupResult(res);
    } catch (e: any) {
      alert(e.message || 'Lỗi kiểm tra dọn dẹp');
    }
  };

  const handleConfirmCleanup = async () => {
    if (!confirm(`Bạn có chắc chắn muốn dọn dẹp ảnh không vi phạm cũ hơn ${retentionDays} ngày?`)) {
      return;
    }
    try {
      const res = await runCleanup(retentionDays, false);
      alert(`Đã xóa ${res.deleted_count} file, giải phóng ${res.freed_mb} MB!`);
      setCleanupResult(null);
      loadData();
    } catch (e: any) {
      alert(e.message || 'Lỗi thực thi dọn dẹp');
    }
  };

  if (loading && !storage) {
    return <div className="p-10 text-center text-sm text-slate-500">Đang tải thông tin lưu trữ...</div>;
  }

  const pct = storage?.percent_used || 0;

  return (
    <div className="space-y-6">
      {/* Thẻ tình trạng đĩa */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Dung Lượng Lưu Trữ Ảnh Crop</h3>
            <p className="text-xs text-slate-500">Thư mục: {storage?.storage_root}</p>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
            <HardDrive className="h-6 w-6" />
          </div>
        </div>

        {/* Thanh tiến trình */}
        <div className="mt-6">
          <div className="flex justify-between text-sm font-semibold">
            <span>
              {storage?.used_gb} GB đã dùng / {storage?.quota_gb} GB hạn mức
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full transition-all ${
                pct >= 80 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-sky-500'
              }`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          {storage?.warning && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
              <AlertTriangle className="h-4 w-4" /> Cảnh báo: Dung lượng lưu trữ đã vượt ngưỡng 80% định mức!
            </p>
          )}
        </div>

        {/* Thống kê chi tiết */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
          <div className="rounded-xl border border-slate-200 p-4">
            <span className="text-xs text-slate-500">Tổng số file ảnh crop</span>
            <p className="mt-1 text-xl font-bold text-slate-900">{storage?.total_files.toLocaleString('vi-VN')}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <span className="text-xs text-slate-500">Số file mồ côi (không có DB)</span>
            <p className="mt-1 text-xl font-bold text-slate-900">{storage?.orphan_files.toLocaleString('vi-VN')}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <span className="text-xs text-slate-500">Bản ghi chưa có ảnh biển</span>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {storage?.missing_crop_records.toLocaleString('vi-VN')}
            </p>
          </div>
        </div>
      </div>

      {/* Dọn dẹp lưu trữ */}
      {isAdmin ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900">Chính Sách Lưu Giữ & Dọn Dẹp Định Kỳ</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Hệ thống chỉ xóa ảnh của các xe <strong>không vi phạm</strong> vượt quá số ngày quy định. Ảnh phương
            tiện vi phạm được lưu trữ vĩnh viễn cho tới khi hồ sơ được giải quyết dứt điểm.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <label className="text-sm font-semibold text-slate-700">Tự động xóa ảnh không vi phạm sau:</label>
            <select
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
            >
              <option value={7}>7 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={60}>60 ngày</option>
              <option value={90}>90 ngày</option>
            </select>

            <button
              type="button"
              onClick={handlePreviewCleanup}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Xem trước dọn dẹp
            </button>
          </div>

          {cleanupResult && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
                <AlertTriangle className="h-4 w-4" /> Kết quả xem trước (Dry-run):
              </div>
              <p className="text-xs text-amber-700">
                Có <strong>{cleanupResult.candidates_count}</strong> file ảnh không vi phạm cũ hơn {retentionDays} ngày.
                Dự kiến giải phóng khoảng <strong>{cleanupResult.freed_mb} MB</strong> bộ nhớ.
              </p>
              <button
                type="button"
                onClick={handleConfirmCleanup}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
              >
                <Trash2 className="h-4 w-4" /> Xác nhận dọn dẹp ngay
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
          Chỉ quản trị viên hệ thống (Admin) mới có quyền cấu hình chính sách lưu giữ và dọn dẹp ảnh crop.
        </div>
      )}
    </div>
  );
}
