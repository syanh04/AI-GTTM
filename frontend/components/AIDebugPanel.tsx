'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, ScanSearch } from 'lucide-react';
import { isTransientRequestError } from '@/lib/requestError';
import { STATUS_DICT, VEHICLE_TYPES } from '@/lib/i18n/vi';

type DebugRecord = {
  id: number;
  track_key: string;
  camera_id: string;
  track_id?: number | null;
  vehicle_crop_b64?: string;
  plate_crop_b64?: string;
  plate_number?: string;
  ocr_score?: number;
  vote_count?: number;
  vehicle_type_vi?: string;
  vehicle_type?: string;
  confidence?: number;
  timestamp?: string;
  last_seen_at?: string;
  plate_crop_source?: string;
  plate_debug_reason?: string;
  plate_debug_variant?: string;
  quality_issues?: string[];
  confirmed?: boolean;
  reading_latency_ms?: number | null;
  recommendation?: string;
};

type DebugTrack = {
  track_key: string;
  camera_id: string;
  track_id?: number | null;
  status: 'confirmed' | 'needs_review' | 'reading' | string;
  record_count: number;
  issue_counts: Record<string, number>;
  best_record?: DebugRecord;
  records?: DebugRecord[];
};

type DebugPayload = {
  generated_at: string;
  total_records: number;
  total_tracks: number;
  confirmed_records: number;
  confirmed_rate: number;
  avg_confirm_latency_ms?: number | null;
  issue_counts: Record<string, number>;
  runtime?: any;
  tracks: DebugTrack[];
};

const API_BASE = '';

function issueLabel(issue: string) {
  const labels: Record<string, string> = {
    missing_vehicle_crop: 'Thiếu crop xe',
    missing_plate_crop: 'Thiếu crop biển',
    plate_crop_without_valid_ocr: 'Có crop nhưng OCR chưa rõ',
    low_confidence_plate: 'Biển độ tin cậy thấp',
    temporary_waiting_consensus: 'Đang chờ vote',
    missing_track_id: 'Thiếu track ID',
  };
  return labels[issue] || issue;
}

function formatLatency(ms?: number | null) {
  if (ms === null || ms === undefined) return 'Chưa chốt';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function imageSrc(b64?: string) {
  return b64 ? `data:image/jpeg;base64,${b64}` : '';
}

export default function AIDebugPanel() {
  const [payload, setPayload] = useState<DebugPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTrackKey, setSelectedTrackKey] = useState('');
  const requestInFlightRef = useRef(false);

  const loadDebug = async () => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai-debug/tracks?minutes=1440&limit=30&include_images=true`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPayload(data);
      if (!selectedTrackKey && data.tracks?.length) {
        setSelectedTrackKey(data.tracks[0].track_key);
      }
    } catch (error) {
      if (!isTransientRequestError(error)) {
        console.warn('[AI Debug] Không tải được dữ liệu:', error);
      }
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDebug();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(loadDebug, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, selectedTrackKey]);

  const selectedTrack = useMemo(() => {
    return payload?.tracks?.find((track) => track.track_key === selectedTrackKey) || payload?.tracks?.[0];
  }, [payload, selectedTrackKey]);

  const best = selectedTrack?.best_record;
  const runtime = payload?.runtime || {};
  const paddleFallbackReady =
    runtime.status === 'degraded' &&
    runtime.packages?.paddleocr &&
    runtime.paths?.paddle_model_readable;
  const issues = Object.entries(payload?.issue_counts || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">AI Debug Center</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Kiểm tra crop, OCR và tracking ID</h2>
            <p className="mt-2 text-sm text-slate-500">
              Màn này giúp soi đúng lỗi nằm ở crop xe, crop biển, OCR voting hay gán nhầm track ID.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((value) => !value)}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-semibold ${
                autoRefresh ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <Activity className="h-4 w-4" /> Auto refresh {autoRefresh ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={loadDebug}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-3.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Track đang theo dõi</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{payload?.total_tracks ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Bản ghi có biển rõ</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{payload?.confirmed_rate ?? 0}%</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Thời gian Đang đọc → rõ</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{formatLatency(payload?.avg_confirm_latency_ms)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Công cụ OCR</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {runtime.status === 'ready'
              ? 'Sẵn sàng'
              : paddleFallbackReady
                ? 'Paddle dự phòng'
                : runtime.status || 'Chưa xác định'}
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Lỗi cần ưu tiên</h3>
            <div className="mt-3 space-y-2">
              {issues.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Chưa thấy lỗi lớn
                </div>
              ) : (
                issues.map(([issue, count]) => (
                  <div key={issue} className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                    <span className="text-sm font-semibold text-amber-800">{issueLabel(issue)}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-amber-700">{count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Danh sách track</h3>
            <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {(payload?.tracks || []).map((track) => {
                const active = track.track_key === selectedTrack?.track_key;
                const plate = track.best_record?.plate_number || 'Đang đọc...';
                return (
                  <button
                    key={track.track_key}
                    type="button"
                    onClick={() => setSelectedTrackKey(track.track_key)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{track.camera_id} · ID {track.track_id ?? 'N/A'}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        track.status === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : track.status === 'needs_review'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {STATUS_DICT[track.status]?.label || (track.status === 'reading' ? 'Đang đọc' : track.status)}
                      </span>
                    </div>
                    <p className={`mt-1 truncate text-xs ${active ? 'text-slate-200' : 'text-slate-500'}`}>{plate}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {best ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Chi tiết đối tượng theo dõi</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-950">
                    {best.camera_id} · Mã xe {best.track_id ?? 'N/A'} · {best.plate_number || 'Đang đọc...'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{best.recommendation}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  <Clock className="mr-1 inline h-4 w-4" /> {formatLatency(best.reading_latency_ms)}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">Ảnh toàn xe</h4>
                    <span className="text-xs font-semibold text-slate-500">Độ tin cậy {(Number(best.confidence || 0) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-lg bg-black">
                    {best.vehicle_crop_b64 ? (
                      <img src={imageSrc(best.vehicle_crop_b64)} alt="vehicle crop" className="max-h-[520px] w-full object-contain" />
                    ) : (
                      <div className="text-sm font-semibold text-slate-500">Không có ảnh toàn xe</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">Ảnh crop biển / định danh</h4>
                    <span className="text-xs font-semibold text-slate-500">Độ khớp OCR {(Number(best.ocr_score || 0) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-lg bg-black">
                    {best.plate_crop_b64 ? (
                      <img src={imageSrc(best.plate_crop_b64)} alt="plate crop" className="max-h-[520px] w-full object-contain" />
                    ) : (
                      <div className="text-sm font-semibold text-slate-500">Không có ảnh crop biển</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">Lượt khớp (Vote)</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{best.vote_count || 0}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">Nguồn crop</p>
                  <p className="mt-1 break-words text-sm font-bold text-slate-950">{best.plate_crop_source || 'Không có'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">Loại xe</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">{best.vehicle_type_vi || (best.vehicle_type ? VEHICLE_TYPES[best.vehicle_type] || best.vehicle_type : 'Không xác định')}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">Trạng thái nhận diện</p>
                  <p className={`mt-1 text-sm font-bold ${best.confirmed ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {best.confirmed ? 'Biển rõ ràng' : 'Đang đọc / cần vote'}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
                  <ScanSearch className="h-4 w-4" /> Nguyên nhân chẩn đoán (Debug reason)
                </div>
                <p className="break-words text-sm text-slate-700">{best.plate_debug_reason || 'Không có'}</p>
                {best.plate_debug_variant && (
                  <p className="mt-2 break-words text-xs font-semibold text-slate-500">Biến thể: {best.plate_debug_variant}</p>
                )}
                {!!best.quality_issues?.length && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {best.quality_issues.map((issue) => (
                      <span key={issue} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> {issueLabel(issue)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[460px] items-center justify-center text-sm font-semibold text-slate-400">
              Chưa có dữ liệu debug AI.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
