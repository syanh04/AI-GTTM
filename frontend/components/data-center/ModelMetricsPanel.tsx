'use client';

import React, { useEffect, useState } from 'react';
import { ModelMetrics } from './types';
import { fetchModelMetrics } from './api';
import { Cpu, Award, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function ModelMetricsPanel() {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchModelMetrics()
      .then((data) => setMetrics(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading && !metrics) {
    return <div className="p-10 text-center text-sm text-slate-500">Đang tính toán chỉ số mô hình...</div>;
  }

  const ocrDist = metrics?.ocr_distribution;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Đánh Giá Hiệu Năng Mô Hình ALPR (Số Liệu Thực Tế)</h3>
            <p className="text-xs text-slate-500 mt-1">{metrics?.note}</p>
          </div>
          <div className="rounded-xl bg-purple-50 p-3 text-purple-600">
            <Cpu className="h-6 w-6" />
          </div>
        </div>

        {/* Thống kê lưới */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <span className="text-xs text-slate-500">Tỉ lệ OCR rõ (≥ 90%)</span>
            <p className="mt-1 text-2xl font-black text-slate-900">{ocrDist?.clear_percent ?? 0}%</p>
            <p className="mt-1 text-xs text-slate-400">Trung bình: {ocrDist?.avg_score_percent ?? 0}%</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <span className="text-xs text-slate-500">Độ chính xác duyệt vi phạm</span>
            <p className="mt-1 text-2xl font-black text-emerald-600">
              {metrics?.violation_review_precision !== null ? `${metrics?.violation_review_precision}%` : '–'}
            </p>
            <p className="mt-1 text-xs text-slate-400">Tỷ lệ xác nhận qua kiểm tra tay</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <span className="text-xs text-slate-500">Tỉ lệ biển phải sửa tay</span>
            <p className="mt-1 text-2xl font-black text-amber-600">
              {metrics?.manual_edit_ratio !== null ? `${metrics?.manual_edit_ratio}%` : '0%'}
            </p>
            <p className="mt-1 text-xs text-slate-400">Biển số OCR bị chỉnh sửa</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <span className="text-xs text-slate-500">Tổng mẫu đánh giá</span>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {metrics?.total_evaluated_records.toLocaleString('vi-VN') ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-400">Bản ghi hợp lệ trong DB</p>
          </div>
        </div>

        {/* Phân bố khoảng điểm OCR */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Phân Bố Độ Tin Cậy OCR</h4>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>Điểm cao (≥ 90%)</span>
                <span>{ocrDist?.ge_90.toLocaleString('vi-VN')} bản ghi</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${((ocrDist?.ge_90 || 0) / (metrics?.total_evaluated_records || 1)) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>Điểm trung bình (80% - 89%)</span>
                <span>{ocrDist?.from_80_to_90.toLocaleString('vi-VN')} bản ghi</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-amber-500"
                  style={{
                    width: `${((ocrDist?.from_80_to_90 || 0) / (metrics?.total_evaluated_records || 1)) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>Điểm thấp (&lt; 80%)</span>
                <span>{ocrDist?.under_80.toLocaleString('vi-VN')} bản ghi</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-rose-500"
                  style={{
                    width: `${((ocrDist?.under_80 || 0) / (metrics?.total_evaluated_records || 1)) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
