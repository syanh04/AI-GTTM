'use client';

import React from 'react';
import { SummaryKPI } from './types';
import { Car, AlertTriangle, CheckCircle, HardDrive } from 'lucide-react';

interface KpiCardsProps {
  summary: SummaryKPI | null;
  onCardClick: (type: 'all' | 'vio' | 'ocr' | 'crop') => void;
}

export default function KpiCards({ summary, onCardClick }: KpiCardsProps) {
  const total = summary?.total_vehicles ?? 0;
  const violations = summary?.violations ?? 0;
  const ocrClear = summary?.ocr_clear_percent ?? 0;
  const cropGb = summary?.crop_storage_gb ?? 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Tổng lượt xe */}
      <button
        type="button"
        onClick={() => onCardClick('all')}
        className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-500 hover:shadow-md"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tổng lượt xe</span>
          <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
            <Car className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-black text-slate-900">{total.toLocaleString('vi-VN')}</div>
          {summary?.prev_total !== null && summary?.prev_total !== undefined && (
            <div className="mt-1 text-xs text-slate-500">
              {total >= summary.prev_total ? '▲' : '▼'}{' '}
              {Math.abs(Math.round(((total - summary.prev_total) / (summary.prev_total || 1)) * 100))}% so với kỳ trước
            </div>
          )}
        </div>
      </button>

      {/* 2. Vi phạm */}
      <button
        type="button"
        onClick={() => onCardClick('vio')}
        className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-rose-500 hover:shadow-md"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vi phạm ghi nhận</span>
          <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
            <AlertTriangle className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-black text-rose-600">{violations.toLocaleString('vi-VN')}</div>
          <div className="mt-1 text-xs text-slate-500">Bấm để lọc xe có vi phạm</div>
        </div>
      </button>

      {/* 3. Tỉ lệ OCR rõ */}
      <button
        type="button"
        onClick={() => onCardClick('ocr')}
        className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-amber-500 hover:shadow-md"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tỉ lệ OCR rõ (≥ 90%)</span>
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
            <CheckCircle className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-black text-slate-900">{ocrClear}%</div>
          <div className="mt-1 text-xs text-amber-600">Bấm để rà soát biển số &lt; 90%</div>
        </div>
      </button>

      {/* 4. Dung lượng crop */}
      <button
        type="button"
        onClick={() => onCardClick('crop')}
        className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-500 hover:shadow-md"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dung lượng ảnh crop</span>
          <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
            <HardDrive className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-black text-slate-900">{cropGb} GB</div>
          <div className="mt-1 text-xs text-slate-500">Bấm để mở tab Lưu trữ crop</div>
        </div>
      </button>
    </div>
  );
}
