'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useVideoState } from '@/lib/VideoContext';
import { isTransientRequestError } from '@/lib/requestError';
import {
  applyPresentationTimeline,
  interleaveDetectionLighting,
  mergeDetectionRecords,
  publishLiveDetections,
  type LiveDetectionRecord as Detection,
} from '@/lib/liveDetections';

interface DetectionLogProps {
  onSelectLicensePlate: (detection: Detection) => void;
  resetTrigger?: number;
  selectedCamera?: string;
}

const normalizeText = (value: string) => (value || '').trim();
const MAX_RETAINED_LOGS = 200;

/**
 * Nếu ảnh tối (night) → lùi ngày về hôm trước (buổi tối hôm trước).
 * Nếu ảnh sáng (day/unknown) → giữ nguyên timestamp thực.
 * Format input: "DD/MM/YYYY HH:MM:SS"
 */
function adjustTimestampForLighting(timestamp: string, lighting: string): { time: string; date: string } {
  const parts = (timestamp || '').split(' ');
  let datePart = parts[0] || '';
  const timePart = parts[1] || '';
  if (lighting === 'night') {
    const bits = datePart.split('/');
    if (bits.length === 3) {
      const [d, m, y] = bits.map(Number);
      if (d && m && y) {
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() - 1);
        datePart = [
          String(dt.getDate()).padStart(2, '0'),
          String(dt.getMonth() + 1).padStart(2, '0'),
          String(dt.getFullYear()),
        ].join('/');
      }
    }
  }
  return { time: timePart || '--:--:--', date: datePart || '--/--/----' };
}

const imageFromBase64 = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('data:image') ? raw : `data:image/jpeg;base64,${raw}`;
};

export default function DetectionLog({ onSelectLicensePlate, resetTrigger, selectedCamera = 'CAM_01' }: DetectionLogProps) {
  const { simulationMode, sourceMode } = useVideoState();
  const [realDetections, setRealDetections] = useState<Detection[]>([]);
  const [simulatedDetections, setSimulatedDetections] = useState<Detection[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const sinceRef = useRef('');
  const sinceIdRef = useRef(0);
  const realDetectionsCountRef = useRef(0);
  const itemsPerPage = 6;

  useEffect(() => {
    realDetectionsCountRef.current = realDetections.length;
  }, [realDetections.length]);

  const buildHistoryUrl = useCallback((path: 'history' | 'history/updates', extra?: Record<string, string>) => {
    const params = new URLSearchParams();
    params.set('limit', path === 'history' ? '30' : '20');
    params.set('source_mode', sourceMode);
    // Keep completed evidence across backend restarts so collected demo logs remain visible.
    params.set('current_only', 'false');
    params.set('complete_evidence_only', 'true');
    // The dashboard date selector is for analytics. Keep this evidence log
    // retained across dates so recorded day/night examples remain available.
    if (sourceMode === 'rtsp') {
      params.set('camera_id', selectedCamera);
    }
    Object.entries(extra || {}).forEach(([key, value]) => params.set(key, value));
    return `/api/${path}?${params.toString()}`;
  }, [selectedCamera, sourceMode]);

  const canonicalVehicleType = (value: string) => {
    const v = normalizeText(value).trim().toLowerCase();
    const aliases: Record<string, string> = {
      car: 'car',
      'o to': 'car',
      'ô tô': 'car',
      truck: 'truck',
      'xe tải': 'truck',
      bus: 'bus',
      'xe bus': 'bus',
      'xe buýt': 'bus',
      moto: 'moto',
      motorcycle: 'moto',
      motorbike: 'moto',
      'xe máy': 'moto',
    };
    return aliases[v] || v || 'unknown';
  };

  const mapHistoryItem = useCallback((v: any): Detection => ({
    id: String(v.id),
    track_id: Number(v.track_id || v.id || 0),
    class: canonicalVehicleType(v.vehicle_type || v.vehicle_type_vi || ''),
    color: '',
    color_hex: '',
    vehicle_image: imageFromBase64(v.vehicle_crop_b64 || v.vehicle_image_b64 || v.vehicle_image),
    plate_number: v.plate_number || '',
    plate_image: imageFromBase64(v.plate_crop_b64 || v.plate_image_b64 || v.plate_image),
    is_simulated: !!v.is_simulated,
    is_temporary: !!v.is_temporary,
    timestamp: v.timestamp || '',
    timestamp_time: v.timestamp_time || '',
    timestamp_date: v.timestamp_date || '',
    last_seen_at: v.last_seen_at || '',
    confidence: v.confidence || 0,
    ocr_score: v.ocr_score || 0,
    vote_count: v.vote_count || 0,
    plate_crop_source: v.plate_crop_source || '',
    plate_debug_reason: v.plate_debug_reason || '',
    plate_debug_variant: v.plate_debug_variant || '',
    lighting_condition: v.lighting_condition || 'unknown',
    camera: v.camera_id || 'CAM_01',
    violation: !!v.violation_type,
    violation_type: v.violation_type || undefined,
    review_status: v.review_status || '',
    evidence_curated: Boolean(v.evidence_curated),
    owner_name: v.owner_name || '',
    owner_phone: v.owner_phone || '',
    owner_email: v.owner_email || '',
    owner_address: v.owner_address || '',
    owner_source: v.owner_source || '',
  }), []);

  const mergeIntoLog = useCallback((incoming: Detection[], replace = false) => {
    if (incoming.length === 0) return;
    publishLiveDetections(incoming);
    setRealDetections((current) =>
      mergeDetectionRecords(replace ? [] : current, incoming, MAX_RETAINED_LOGS),
    );
  }, []);

  useEffect(() => {
    if (simulationMode) return;

    let stopped = false;
    let requestRunning = false;
    sinceRef.current = '';
    sinceIdRef.current = 0;
    setCurrentPage(1);

    const getAuthHeaders = (): Record<string, string> => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (token && token !== 'cookie-session') {
        return { Authorization: `Bearer ${token}` };
      }
      return {};
    };

    const fetchInitial = async () => {
      try {
        const headers = getAuthHeaders();
        const [historyResponse, curatedResponse] = await Promise.all([
          fetch(buildHistoryUrl('history'), { cache: 'no-store', credentials: 'include', headers }),
          fetch('/api/history/presentation?limit=60', { cache: 'no-store', credentials: 'include', headers }).catch(() => null),
        ]);
        if (!historyResponse.ok) throw new Error('Failed to fetch history');
        const data = await historyResponse.json();
        const curatedData = curatedResponse?.ok ? await curatedResponse.json() : { items: [] };
        if (stopped) return;
        const formatted: Detection[] = [...(data.items || []), ...(curatedData.items || [])]
          .map(mapHistoryItem)
          .filter((item: Detection) => Boolean(item.vehicle_image || item.plate_image || item.plate_number));
        mergeIntoLog(formatted, true);
        const cursorItem = formatted.reduce<Detection | null>((latest, item) => {
          if (!latest) return item;
          const itemTime = Date.parse(item.last_seen_at || '') || 0;
          const latestTime = Date.parse(latest.last_seen_at || '') || 0;
          if (itemTime !== latestTime) return itemTime > latestTime ? item : latest;
          return Number(item.id) > Number(latest.id) ? item : latest;
        }, null);
        sinceRef.current = cursorItem?.last_seen_at || '';
        sinceIdRef.current = Number(cursorItem?.id || 0);
      } catch (error) {
        if (!stopped && !isTransientRequestError(error)) {
          console.warn('Không tải được lịch sử nhận diện:', error);
        }
      }
    };

    const pollUpdates = async () => {
      if (requestRunning) return;
      requestRunning = true;
      try {
        const extra = sinceRef.current
          ? { since: sinceRef.current, since_id: String(sinceIdRef.current) }
          : undefined;
        const headers = getAuthHeaders();
        const response = await fetch(buildHistoryUrl('history/updates', extra), { cache: 'no-store', credentials: 'include', headers });
        if (!response.ok) throw new Error('Failed to fetch updates');
        const data = await response.json();
        if (stopped) return;
        const updates = (data.items || [])
          .map(mapHistoryItem)
          .filter((item: Detection) => Boolean(item.vehicle_image || item.plate_image || item.plate_number));
        if (updates.length > 0) {
          mergeIntoLog(updates);
        } else if (realDetectionsCountRef.current === 0) {
          await fetchInitial();
        }
        if (data.next_since) {
          sinceRef.current = data.next_since;
          sinceIdRef.current = Number(data.next_since_id || 0);
        }
      } catch (error) {
        if (!stopped && !isTransientRequestError(error)) {
          console.warn('Không tải được cập nhật nhận diện:', error);
        }
      } finally {
        requestRunning = false;
      }
    };

    fetchInitial();
    const interval = setInterval(pollUpdates, 2000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void pollUpdates();
      }
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', pollUpdates);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', pollUpdates);
    };
  }, [buildHistoryUrl, mapHistoryItem, mergeIntoLog, resetTrigger, simulationMode, sourceMode]);

  const generateMockDetection = useCallback((): Detection => {
    const now = new Date();
    const timestampTime = now.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const timestampDate = now.toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const provinces = ['29', '30', '31', '15', '51', '43', '75'];
    const types = ['car', 'moto', 'truck', 'bus'];
    const violationTypes = ['Vượt đèn đỏ', 'Lấn làn đường', 'Chạy quá tốc độ', 'Đi ngược chiều'];

    const type = types[Math.floor(Math.random() * types.length)];
    const camera = `CAM_0${Math.floor(Math.random() * 6) + 1}`;
    const plate = `${provinces[Math.floor(Math.random() * provinces.length)]}${String.fromCharCode(65 + Math.floor(Math.random() * 3))}-${Math.floor(Math.random() * 900) + 100}.${Math.floor(Math.random() * 90) + 10}`;
    const isViolation = Math.random() > 0.8;

    return {
      id: crypto.randomUUID(),
      track_id: Math.floor(Math.random() * 10000),
      class: type,
      color: 'Green',
      color_hex: '#00FF00',
      vehicle_image: '',
      plate_number: plate,
      plate_image: '',
      is_simulated: true,
      is_temporary: false,
      ocr_score: 0.95,
      timestamp: `${timestampDate} ${timestampTime}`,
      timestamp_time: timestampTime,
      timestamp_date: timestampDate,
      last_seen_at: now.toISOString(),
      confidence: 0.7 + Math.random() * 0.29,
      camera,
      violation: isViolation,
      violation_type: isViolation ? violationTypes[Math.floor(Math.random() * violationTypes.length)] : undefined,
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (simulationMode) {
      setRealDetections([]);
      sinceRef.current = '';
      sinceIdRef.current = 0;
      interval = setInterval(() => {
        setSimulatedDetections((prev) => [generateMockDetection(), ...prev].slice(0, 50));
      }, 2500);
    } else {
      setSimulatedDetections([]);
    }

    return () => clearInterval(interval);
  }, [generateMockDetection, simulationMode]);

  useEffect(() => {
    if (resetTrigger !== undefined && resetTrigger > 0) {
      setRealDetections([]);
      setSimulatedDetections([]);
      sinceRef.current = '';
      setCurrentPage(1);
    }
  }, [resetTrigger]);

  const activeDetections = interleaveDetectionLighting(
    applyPresentationTimeline(
      (simulationMode ? simulatedDetections : realDetections)
        .filter((item) => simulationMode || Boolean(item.vehicle_image || item.plate_image || item.plate_number)),
    ),
  );

  const paginatedDetections = activeDetections.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );
  const totalPages = Math.ceil(activeDetections.length / itemsPerPage);

  const logGridClass =
    'grid min-w-[880px] grid-cols-[96px_minmax(136px,1fr)_92px_minmax(132px,1fr)_minmax(132px,0.9fr)_minmax(160px,1.1fr)] gap-3 items-center';

  const getVehicleTypeLabel = (type: string) => {
    const normalized = canonicalVehicleType(type);
    const labels: Record<string, string> = {
      car: 'Ô tô',
      truck: 'Xe tải',
      moto: 'Xe máy',
      bus: 'Xe buýt',
    };
    return labels[normalized] || type;
  };

  const isTruckBodyIdentifier = (detection: Detection) => {
    const source = String(detection.plate_crop_source || '').toLowerCase();
    const reason = String(detection.plate_debug_reason || '').toLowerCase();
    return source === 'truck_body' || reason.startsWith('truck_body');
  };

  const getDisplayPlate = (detection: Detection) => {
    const plate = (detection.plate_number || '').trim();
    const score = Number(detection.ocr_score || 0);
    if (!plate) return 'Đang đọc...';
    if (isTruckBodyIdentifier(detection)) return plate;
    if (!detection.is_temporary && score >= 0.86) return plate;
    return `Cần xác minh biển: ${plate}`;
  };

  const getPlateTextClass = (_detection: Detection) => 'text-slate-900';

  return (
    <div className="space-y-0 text-slate-800 bg-white font-sans rounded-lg border border-slate-200 overflow-hidden shadow-sm">
      {/* Mobile view */}
      <div className="lg:hidden divide-y divide-slate-100">
        {paginatedDetections.length === 0 ? (
          <div className="text-center py-16 text-slate-300">
            <p className="text-sm font-bold tracking-tight">HỆ THỐNG ĐANG CHỜ DỮ LIỆU PHÁT HIỆN</p>
          </div>
        ) : (
          paginatedDetections.map((detection) => {
            const rawTs = detection.timestamp || `${detection.timestamp_date || ''} ${detection.timestamp_time || ''}`.trim();
            const { time, date } = adjustTimestampForLighting(rawTs, detection.lighting_condition || 'unknown');
            const displayPlate = getDisplayPlate(detection);

            return (
              <button
                key={detection.id}
                type="button"
                onClick={() => onSelectLicensePlate(detection)}
                className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
              >
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-50 shadow-sm">
                  {detection.vehicle_image ? (
                    <img src={detection.vehicle_image} className="h-full w-full object-contain bg-black" alt="Vehicle" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[8px] font-bold text-slate-300">IMAGE</div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`break-words text-[15px] font-bold leading-tight ${getPlateTextClass(detection)}`}>{displayPlate}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {detection.camera || 'CAM_01'} · {getVehicleTypeLabel(detection.class)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-slate-800">{time}</p>
                      <p className="text-[11px] font-medium text-slate-400">{date}</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    {detection.violation_type ? (
                      <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
                        {detection.violation_type}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">Không vi phạm</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block">
        <div className="overflow-x-auto">
          <div className={`${logGridClass} px-4 py-3 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider`}>
            <div className="text-center">Ảnh xe</div>
            <div>Thời gian &amp; ngày</div>
            <div>Camera</div>
            <div>Biển số</div>
            <div className="text-center">Loại phương tiện</div>
            <div className="text-center">Loại vi phạm</div>
          </div>
        </div>

        <div className="min-w-full overflow-x-auto">
          {paginatedDetections.length === 0 ? (
            <div className="text-center py-32 text-slate-300">
              <p className="text-sm font-bold tracking-tight">HỆ THỐNG ĐANG CHỜ DỮ LIỆU PHÁT HIỆN</p>
            </div>
          ) : (
            <div>
              {paginatedDetections.map((detection) => {
                const rawTs = detection.timestamp || `${detection.timestamp_date || ''} ${detection.timestamp_time || ''}`.trim();
                const { time, date } = adjustTimestampForLighting(rawTs, detection.lighting_condition || 'unknown');
                const truckBodyIdentifier = isTruckBodyIdentifier(detection);
                const displayPlate = getDisplayPlate(detection);
                return (
                  <div
                    key={detection.id}
                    className={`${logGridClass} px-4 py-4 border-b border-slate-100 transition-colors hover:bg-slate-50/80 group cursor-pointer last:border-0`}
                    onClick={() => onSelectLicensePlate(detection)}
                  >
                    <div className="flex justify-center">
                      <div className="w-[84px] aspect-[16/10] overflow-hidden rounded border border-slate-200 bg-slate-50 shadow-sm">
                        {detection.vehicle_image ? (
                          <img src={detection.vehicle_image} className="w-full h-full object-contain bg-black" alt="Vehicle" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-300 font-bold">IMAGE</div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-base font-semibold text-slate-800 tabular-nums leading-none">{time}</span>
                      <span className="text-xs font-medium text-slate-400">{date}</span>
                    </div>

                    <div className="flex flex-col items-start gap-1 text-xs font-semibold text-slate-500">
                      <span>{detection.camera || 'CAM_01'}</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <button className={`max-w-full break-words text-left text-[15px] font-bold leading-tight tracking-normal ${getPlateTextClass(detection)}`}>
                        {displayPlate}
                      </button>
                      {truckBodyIdentifier && (
                        <span className="w-fit rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-800">
                          Định danh xe tải
                        </span>
                      )}
                      {detection.is_simulated && (
                        <span className="text-[9px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full uppercase w-fit">
                          Mô phỏng
                        </span>
                      )}
                    </div>

                    <div className="text-center text-sm font-semibold text-slate-700 uppercase">
                      {getVehicleTypeLabel(detection.class)}
                    </div>

                    <div className="text-center">
                      {detection.violation_type ? (
                        <span className="text-sm font-bold text-red-600">{detection.violation_type}</span>
                      ) : (
                        <span className="text-sm font-medium text-slate-300">Không</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {paginatedDetections.length < itemsPerPage && Array.from({ length: itemsPerPage - paginatedDetections.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className={`${logGridClass} px-4 py-4 border-b border-slate-50 last:border-0 opacity-0 pointer-events-none`}
                >
                  <div className="h-[60px]" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-t border-slate-200">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {paginatedDetections.length > 0
              ? `Bản ghi ${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, activeDetections.length)}`
              : 'Sẵn sàng'}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-white disabled:opacity-20 transition-all text-slate-600 bg-white shadow-sm"
            >
              ←
            </button>
            <div className="text-xs font-bold text-slate-500 min-w-[40px] text-center">
              {currentPage} / {totalPages || 1}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages || 1, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-white disabled:opacity-20 transition-all text-slate-600 bg-white shadow-sm"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
