'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { DataDetail, DataItem } from './types';
import { fetchDetectionDetail, updatePlate, reviewViolation } from './api';
import {
  X,
  Check,
  Edit2,
  ShieldAlert,
  Clock,
  Camera,
  Car,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Trash2,
  AlertCircle,
  FileText,
  User,
} from 'lucide-react';
import RelatedActions from '@/components/RelatedActions';
import EntityLink from '@/components/EntityLink';

interface DetailDrawerProps {
  id: number | null;
  items?: DataItem[];
  onSelectId?: (id: number) => void;
  onClose: () => void;
  onRefresh: () => void;
  onDeleteRecord?: (id: number) => void;
  canEdit: boolean;
  isAdmin?: boolean;
}

const VEHICLE_NAMES: Record<string, string> = {
  car: 'Ô tô',
  truck: 'Xe tải',
  moto: 'Xe máy',
  motorcycle: 'Xe máy',
  bus: 'Xe buýt',
};

export default function DetailDrawer({
  id,
  items = [],
  onSelectId,
  onClose,
  onRefresh,
  onDeleteRecord,
  canEdit,
  isAdmin = false,
}: DetailDrawerProps) {
  const [detail, setDetail] = useState<DataDetail | null>(null);
  const [relatedData, setRelatedData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [activePhoto, setActivePhoto] = useState<'vehicle' | 'plate'>('vehicle');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isEditingPlate, setIsEditingPlate] = useState(false);
  const [editPlateVal, setEditPlateVal] = useState('');
  const [editNoteVal, setEditNoteVal] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);

  // Vị trí hiện tại trong danh sách
  const currentIndex = useMemo(() => {
    if (!id || !items.length) return -1;
    return items.findIndex((i) => i.id === id);
  }, [id, items]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < items.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev && onSelectId) {
      onSelectId(items[currentIndex - 1].id);
    }
  }, [hasPrev, onSelectId, items, currentIndex]);

  const handleNext = useCallback(() => {
    if (hasNext && onSelectId) {
      onSelectId(items[currentIndex + 1].id);
    }
  }, [hasNext, onSelectId, items, currentIndex]);

  // Load chi tiết khi id thay đổi
  useEffect(() => {
    if (!id) {
      setDetail(null);
      setRelatedData(null);
      return;
    }
    let active = true;
    setLoading(true);
    setIsEditingPlate(false);
    setZoomLevel(1);
    setActivePhoto('vehicle');

    Promise.all([
      fetchDetectionDetail(id),
      fetch(`/api/data/detections/${id}/related`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([data, rel]) => {
        if (active) {
          setDetail(data);
          setRelatedData(rel);
          setEditPlateVal(data.plate || '');
          setEditNoteVal('');
          setReviewNote(data.review_note || '');
        }
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  // Keyboard navigation: Escape đóng, ArrowLeft/Right chuyển, E sửa biển
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bỏ qua nếu đang gõ trong input / textarea
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          setIsEditingPlate(false);
        }
        return;
      }

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key.toLowerCase() === 'e' && canEdit && !isEditingPlate) {
        e.preventDefault();
        setIsEditingPlate(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handlePrev, handleNext, canEdit, isEditingPlate]);

  if (!id) return null;

  const handleSavePlate = async () => {
    if (!editPlateVal.trim()) return;
    try {
      await updatePlate(id, editPlateVal.trim(), editNoteVal.trim());
      setIsEditingPlate(false);
      onRefresh();
      // Tải lại chi tiết
      const updated = await fetchDetectionDetail(id);
      setDetail(updated);
    } catch (e: any) {
      alert(e.message || 'Lỗi cập nhật biển số');
    }
  };

  const handleReviewAction = async (status: 'processed' | 'dismissed') => {
    if (!id || !detail) return;
    setSubmittingReview(true);
    try {
      await reviewViolation(id, status, reviewNote.trim());
      onRefresh();
      if (autoAdvance && hasNext) {
        handleNext();
      } else {
        const updated = await fetchDetectionDetail(id);
        setDetail(updated);
      }
    } catch (e: any) {
      alert(e.message || 'Lỗi duyệt vi phạm');
    } finally {
      setSubmittingReview(false);
    }
  };

  const vehicleTypeName = detail ? VEHICLE_NAMES[detail.vehicle_type?.toLowerCase()] || detail.vehicle_type : 'Không rõ';
  const hasViolation = Boolean(detail?.violation_type);
  const isLowOcr = (detail?.ocr_percent ?? 100) < 90;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 md:p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[760px] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* VÙNG 1: THANH TIÊU ĐỀ */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/70">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-black text-slate-950 tracking-tight">
              {detail?.case_code || `TRF-${id}`}
            </span>
            <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              {detail?.camera_id || 'CAM_01'}
            </span>
            <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              Mã theo dõi: T-{detail?.track_id ?? 'N/A'}
            </span>
            {hasViolation ? (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  detail?.review_status === 'processed'
                    ? 'bg-emerald-100 text-emerald-800'
                    : detail?.review_status === 'dismissed'
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {detail?.review_status === 'processed'
                  ? 'Đã xác nhận'
                  : detail?.review_status === 'dismissed'
                  ? 'Đã bỏ qua'
                  : 'Chờ duyệt'}
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                Bình thường
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentIndex >= 0 && items.length > 0 && (
              <span className="text-xs font-semibold text-slate-500 mr-1">
                {currentIndex + 1} / {items.length}
              </span>
            )}
            <button
              type="button"
              disabled={!hasPrev}
              onClick={handlePrev}
              title="Bản ghi trước (Phím ←)"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={handleNext}
              title="Bản ghi kế tiếp (Phím →)"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Đóng (Esc)"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 ml-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* VÙNG 2: THÂN 2 CỘT */}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">
          {loading ? (
            <div className="flex flex-1 items-center justify-center p-12 text-sm text-slate-500">
              Đang tải thông tin chi tiết...
            </div>
          ) : detail ? (
            <>
              {/* CỘT TRÁI: KHU VỰC ẢNH */}
              <div className="flex flex-1 md:basis-7/12 flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-slate-900/5 p-4 overflow-hidden">
                {/* Thanh chuyển tab ảnh & nút zoom */}
                <div className="flex items-center justify-between mb-3">
                  <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setActivePhoto('vehicle')}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        activePhoto === 'vehicle'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Ảnh phương tiện
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePhoto('plate')}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        activePhoto === 'plate'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Ảnh biển số
                    </button>
                  </div>

                  <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                      title="Phóng to"
                      className="rounded p-1 text-slate-600 hover:bg-slate-100"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    <span className="text-[11px] font-mono px-1 text-slate-500">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoomLevel((z) => Math.max(0.75, z - 0.25))}
                      title="Thu nhỏ"
                      className="rounded p-1 text-slate-600 hover:bg-slate-100"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomLevel(1)}
                      title="Đặt lại zoom"
                      className="rounded p-1 text-slate-400 hover:bg-slate-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Khung ảnh chính */}
                <div className="relative flex-1 min-h-[260px] overflow-hidden rounded-xl border border-slate-200 bg-slate-950 flex items-center justify-center">
                  <img
                    src={`/api/data/images/${detail.id}/${activePhoto}`}
                    alt={activePhoto === 'vehicle' ? 'Ảnh xe' : 'Ảnh biển số'}
                    style={{
                      transform: `scale(${zoomLevel})`,
                      transition: 'transform 0.15s ease-out',
                    }}
                    className="max-h-full max-w-full object-contain cursor-grab active:cursor-grabbing"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-500 text-xs">
                    <span className="rounded bg-black/60 px-3 py-1.5 text-slate-300">
                      {activePhoto === 'vehicle' ? 'Ảnh phương tiện' : 'Ảnh crop biển số'}
                    </span>
                  </div>
                </div>

                {/* Dải 2 ảnh thu nhỏ bên dưới */}
                <div className="mt-3 grid grid-cols-2 gap-3 h-20">
                  <button
                    type="button"
                    onClick={() => setActivePhoto('vehicle')}
                    className={`relative overflow-hidden rounded-lg border-2 transition ${
                      activePhoto === 'vehicle' ? 'border-sky-500 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <img
                      src={`/api/data/images/${detail.id}/vehicle`}
                      alt="Thumbnail xe"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-1 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Ảnh xe
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivePhoto('plate')}
                    className={`relative overflow-hidden rounded-lg border-2 transition ${
                      activePhoto === 'plate' ? 'border-sky-500 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <img
                      src={`/api/data/images/${detail.id}/plate`}
                      alt="Thumbnail biển"
                      className="h-full w-full object-contain bg-slate-900"
                    />
                    <span className="absolute bottom-1 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Ảnh biển
                    </span>
                  </button>
                </div>
              </div>

              {/* CỘT PHẢI: THÔNG TIN CHI TIẾT & HÀNH ĐỘNG */}
              <div className="flex flex-1 md:basis-5/12 flex-col overflow-y-auto p-5 space-y-4">
                {/* (a) THẺ BIỂN SỐ NHẬN DIỆN */}
                <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Biển số nhận diện
                    </span>
                    {canEdit && !isEditingPlate && (
                      <button
                        type="button"
                        onClick={() => setIsEditingPlate(true)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Sửa biển (E)
                      </button>
                    )}
                  </div>

                  {!isEditingPlate ? (
                    <div>
                      {/* Giả lập khung biển số xe */}
                      <div className="inline-flex items-center rounded-lg border-2 border-slate-900 bg-slate-50 px-4 py-2 shadow-inner">
                        <span className="font-mono text-2xl font-black text-slate-950 tracking-wider">
                          {detail.plate || 'Chưa đọc được biển'}
                        </span>
                      </div>

                      {detail.plate_original && (
                        <p className="mt-2 text-xs text-slate-500">
                          Biển OCR gốc:{' '}
                          <span className="font-mono font-bold text-slate-700">{detail.plate_original}</span>
                        </p>
                      )}

                      {/* Thanh đo OCR */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-slate-600">Độ tin cậy OCR</span>
                          <span
                            className={`font-bold ${
                              isLowOcr ? 'text-amber-600' : 'text-emerald-700'
                            }`}
                          >
                            {detail.ocr_percent}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isLowOcr ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, detail.ocr_percent)}%` }}
                          />
                        </div>
                        {isLowOcr && (
                          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-700">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            Dưới ngưỡng 90%, nên đối chiếu với ảnh và sửa nếu cần.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div>
                        <label className="text-xs font-semibold text-slate-700">Biển số mới (tối đa 15 ký tự):</label>
                        <input
                          type="text"
                          value={editPlateVal}
                          onChange={(e) => setEditPlateVal(e.target.value.toUpperCase())}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm font-bold uppercase outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          maxLength={15}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700">Lý do điều chỉnh:</label>
                        <input
                          type="text"
                          value={editNoteVal}
                          onChange={(e) => setEditNoteVal(e.target.value)}
                          placeholder="Ví dụ: Ký tự O bị nhận nhầm thành 0..."
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSavePlate}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
                        >
                          Lưu thay đổi
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingPlate(false)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* (b) THẺ KẾT LUẬN */}
                <div
                  className={`rounded-xl border p-4 ${
                    hasViolation
                      ? 'border-rose-200 bg-rose-50/60 text-rose-900'
                      : 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                  }`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">Kết luận vi phạm</span>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-base font-black">
                      {hasViolation ? detail.violation_type : 'Lưu thông bình thường'}
                    </span>
                    {hasViolation && (
                      <span className="rounded bg-rose-200/80 px-2 py-0.5 text-xs font-bold text-rose-800">
                        Phát hiện AI
                      </span>
                    )}
                  </div>
                </div>

                {/* (c) LƯỚI THÔNG TIN CHI TIẾT */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                    <span className="text-slate-400">Loại phương tiện</span>
                    <p className="mt-0.5 font-bold text-slate-900">{vehicleTypeName}</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                    <span className="text-slate-400">Camera ghi nhận</span>
                    <p className="mt-0.5 font-bold text-slate-900">
                      <EntityLink entityType="camera" entityId={detail.camera_id || 'CAM_01'} />
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                    <span className="text-slate-400">Thời gian chụp</span>
                    <p className="mt-0.5 font-bold text-slate-900">
                      {detail.raw_timestamp
                        ? new Date(detail.raw_timestamp).toLocaleString('vi-VN')
                        : detail.timestamp || 'Chưa xác định'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                    <span className="text-slate-400">Số lần bỏ phiếu OCR</span>
                    <p className="mt-0.5 font-bold text-slate-900">{detail.vote_count ?? 1} lần</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                    <span className="text-slate-400">Độ tin cậy nhận dạng xe</span>
                    <p className="mt-0.5 font-bold text-slate-900">
                      {(() => {
                        const conf = Number(detail.confidence || 0);
                        const pct = conf > 1 ? Math.round(conf) : Math.round(conf * 100);
                        return `${Math.min(100, Math.max(0, pct))}%`;
                      })()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                    <span className="text-slate-400">Nguồn dữ liệu</span>
                    <p className="mt-0.5 font-bold text-slate-900">
                      {detail.is_simulated ? 'Mô phỏng' : 'Thực tế'}
                    </p>
                  </div>
                </div>

                {/* LIÊN KẾT LIÊN QUAN TỰ ĐỘNG TỪ REGISTRY */}
                <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800">
                      Nghiệp vụ liên quan
                    </span>
                    {relatedData?.same_plate_count > 1 && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                        {relatedData.same_plate_count} lượt xe cùng biển
                      </span>
                    )}
                  </div>
                  <RelatedActions
                    sourceType="record"
                    entity={{ ...detail, audit_count: relatedData?.audit_count }}
                    userRole={isAdmin ? 'admin' : canEdit ? 'operator' : 'viewer'}
                  />
                </div>

                {/* (e) GHI CHÚ DUYỆT (NẾU CÓ VI PHẠM) */}
                {hasViolation && canEdit && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Ghi chú đối soát của kiểm duyệt viên:</label>
                    <textarea
                      rows={2}
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="Ghi chú kết quả đối soát..."
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-100"
                    />
                  </div>
                )}

                {/* (d) LỊCH SỬ XỬ LÝ (AUDIT LOG TIMELINE) */}
                {detail.audit_history && detail.audit_history.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Lịch sử thao tác
                    </span>
                    <div className="space-y-2 max-h-36 overflow-y-auto text-xs">
                      {detail.audit_history.map((log: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-2 rounded bg-slate-50 p-2">
                          <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-slate-700">
                              {log.action} <span className="text-slate-400 font-normal">bởi {log.username}</span>
                            </p>
                            {log.note && <p className="text-[11px] text-slate-500 mt-0.5">{log.note}</p>}
                            <span className="text-[10px] text-slate-400">
                              {new Date(log.ts).toLocaleString('vi-VN')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* VÙNG 3: THANH HÀNH ĐỘNG CỐ ĐỊNH */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="hidden sm:inline">
              <kbd className="rounded border bg-white px-1 font-mono text-[11px]">←</kbd>{' '}
              <kbd className="rounded border bg-white px-1 font-mono text-[11px]">→</kbd> chuyển ·{' '}
              <kbd className="rounded border bg-white px-1 font-mono text-[11px]">Esc</kbd> đóng ·{' '}
              <kbd className="rounded border bg-white px-1 font-mono text-[11px]">E</kbd> sửa biển
            </span>
            {hasViolation && canEdit && (
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-slate-600">Tự chuyển tiếp sau khi duyệt</span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && onDeleteRecord && (
              <button
                type="button"
                onClick={() => id && onDeleteRecord(id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Xóa
              </button>
            )}

            {hasViolation && canEdit && (
              <>
                <button
                  type="button"
                  disabled={submittingReview}
                  onClick={() => handleReviewAction('dismissed')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Bỏ qua
                </button>
                <button
                  type="button"
                  disabled={submittingReview}
                  onClick={() => handleReviewAction('processed')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Xác nhận vi phạm
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
