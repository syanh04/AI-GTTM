'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/Toast';
import { Activity, ArrowLeftRight, ArrowUpDown, Clock, OctagonX, ShieldAlert, TrendingUp } from 'lucide-react';
import { useVideoState } from '@/lib/VideoContext';
import { goTo } from '@/lib/crossNav';

type SignalState = 'red' | 'yellow' | 'green' | 'unknown';
type ManualSignalState = 'red' | 'green';

interface CoordinationCamera {
  id: string;
  name: string;
  location: string;
  trafficLightStatus: SignalState;
  timer: number;
  density: number;
  traffic24h: number;
  violations24h: number;
  risk: number;
  suggestedGreen: number;
  signalSource: string;
  confidence: number;
  reason: string;
}

interface CoordinationApiCamera {
  camera_id: string;
  traffic_24h?: number;
  violations_24h?: number;
  density?: number;
  risk?: number;
  suggested_green?: number;
  reason?: string;
  signal?: {
    state?: SignalState;
    confidence?: number;
    source?: string;
  };
}

interface CoordinationCenterProps {
  selectedDate: string;
}

const CAMERA_META: Array<Pick<CoordinationCamera, 'id' | 'name' | 'location'>> = [
  { id: 'CAM_01', name: 'Ngã tư Cầu Giấy', location: 'Quận Cầu Giấy' },
  { id: 'CAM_02', name: 'Láng Hạ', location: 'Quận Đống Đa' },
  { id: 'CAM_03', name: 'Tây Hồ', location: 'Quận Tây Hồ' },
  { id: 'CAM_04', name: 'Nguyễn Huệ', location: 'Quận Hoàn Kiếm' },
  { id: 'CAM_05', name: 'Trần Hưng Đạo', location: 'Quận Hoàn Kiếm' },
  { id: 'CAM_06', name: 'Xuân Phương', location: 'Quận Nam Từ Liêm' },
];

const DEFAULT_CAMERAS: CoordinationCamera[] = CAMERA_META.map((camera, index) => ({
  ...camera,
  trafficLightStatus: index % 3 === 0 ? 'green' : index % 3 === 1 ? 'red' : 'yellow',
  timer: index % 3 === 0 ? 18 : index % 3 === 1 ? 28 : 5,
  density: 0,
  traffic24h: 0,
  violations24h: 0,
  risk: 0,
  suggestedGreen: 25,
  signalSource: 'fallback',
  confidence: 0,
  reason: 'Đang chờ dữ liệu điều phối thực tế',
}));

const safeSignalState = (value?: string): SignalState => {
  if (value === 'red' || value === 'yellow' || value === 'green') return value;
  return 'unknown';
};

const statusCycle = (status: SignalState): SignalState => {
  if (status === 'green') return 'yellow';
  if (status === 'yellow') return 'red';
  if (status === 'red') return 'green';
  return 'red';
};

const defaultTimerFor = (status: SignalState, suggestedGreen: number) => {
  if (status === 'green') return Math.max(18, suggestedGreen);
  if (status === 'yellow') return 5;
  if (status === 'red') return 25;
  return 10;
};

const getSignalText = (status: SignalState) => {
  if (status === 'red') return 'Đỏ';
  if (status === 'yellow') return 'Vàng';
  if (status === 'green') return 'Xanh';
  return 'Chưa rõ';
};

const getSignalSourceText = (source: string) => {
  if (source === 'camera_frame') return 'Khung hình camera';
  if (source === 'manual') return 'Điều khiển tay';
  if (source === 'fallback') return 'Dự phòng';
  return source || 'Chưa xác định';
};

const getConfidenceTone = (confidence: number) => {
  if (confidence >= 0.75) return 'text-emerald-700';
  if (confidence >= 0.45) return 'text-amber-700';
  return 'text-rose-700';
};

export default function CoordinationCenter({ selectedDate }: CoordinationCenterProps) {
  const { cameraFrames } = useVideoState();
  const [cameras, setCameras] = useState<CoordinationCamera[]>(DEFAULT_CAMERAS);
  const [autoMode, setAutoMode] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<'loading' | 'live' | 'fallback'>('loading');
  const { addToast } = useToast();
  const manualOverrides = useRef<Record<string, ManualSignalState>>({});

  const topSuggestion = useMemo(() => {
    const ranked = [...cameras].sort((a, b) => {
      const scoreA = a.density * 0.65 + a.risk * 0.35;
      const scoreB = b.density * 0.65 + b.risk * 0.35;
      return scoreB - scoreA;
    });
    return ranked[0] || cameras[0];
  }, [cameras]);

  useEffect(() => {
    let cancelled = false;

    // Load actual camera names and intersection locations from database
    fetch('/api/cameras')
      .then((r) => (r.ok ? r.json() : null))
      .then((camData) => {
        if (camData?.cameras?.length > 0 && !cancelled) {
          const camMap = new Map(camData.cameras.map((c: any) => [c.id, c]));
          setCameras((prev) =>
            prev.map((c) => {
              const dbCam: any = camMap.get(c.id);
              if (dbCam) {
                return {
                  ...c,
                  name: dbCam.name || c.name,
                  location: dbCam.location_name || dbCam.district || c.location,
                };
              }
              return c;
            })
          );
        }
      })
      .catch(() => {});

    const fetchCoordinationState = async () => {
      try {
        const response = await fetch(`/api/coordination/state?selected_date=${encodeURIComponent(selectedDate)}`);

        if (!response.ok) throw new Error('coordination-state-failed');
        const data = await response.json();
        const byCamera = new Map<string, CoordinationApiCamera>(
          (data.cameras || []).map((item: CoordinationApiCamera) => [item.camera_id, item]),
        );

        if (cancelled) return;
        setCameras((prev) =>
          prev.map((camera) => {
            const incoming = byCamera.get(camera.id);
            if (!incoming) return camera;
            const manual = manualOverrides.current[camera.id];
            const videoSignal = safeSignalState(incoming.signal?.state);
            const nextSignal = manual || (videoSignal === 'unknown' ? camera.trafficLightStatus : videoSignal);
            const suggestedGreen = Number(incoming.suggested_green || camera.suggestedGreen || 25);
            const timer =
              nextSignal !== camera.trafficLightStatus || Math.abs(suggestedGreen - camera.suggestedGreen) >= 3
                ? defaultTimerFor(nextSignal, suggestedGreen)
                : camera.timer;

            return {
              ...camera,
              trafficLightStatus: nextSignal,
              timer,
              density: Number(incoming.density || 0),
              traffic24h: Number(incoming.traffic_24h || 0),
              violations24h: Number(incoming.violations_24h || 0),
              risk: Number(incoming.risk || 0),
              suggestedGreen,
              signalSource: incoming.signal?.source || 'fallback',
              confidence: Number(incoming.signal?.confidence || 0),
              reason: incoming.reason || camera.reason,
            };
          }),
        );
        setLastUpdated(data.updated_at || new Date().toISOString());
        setSyncStatus('live');
      } catch {
        if (!cancelled) setSyncStatus('fallback');
      }
    };

    fetchCoordinationState();
    const interval = setInterval(fetchCoordinationState, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedDate]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCameras((prev) =>
        prev.map((camera) => {
          const manual = manualOverrides.current[camera.id];
          if (manual) {
            return { ...camera, trafficLightStatus: manual, timer: 99 };
          }

          const nextTimer = Math.max(0, camera.timer - 1);
          if (nextTimer > 0) {
            return { ...camera, timer: nextTimer };
          }

          if (syncStatus === 'live') {
            return { ...camera, timer: 0 };
          }

          const nextStatus = statusCycle(camera.trafficLightStatus);
          return {
            ...camera,
            trafficLightStatus: nextStatus,
            timer: defaultTimerFor(nextStatus, camera.suggestedGreen),
          };
        }),
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [syncStatus]);

  const handleManualCommand = (
    cameraId: string,
    cameraName: string,
    action: 'force-vertical' | 'force-horizontal' | 'all-red',
  ) => {
    const newStatus: ManualSignalState = action === 'all-red' ? 'red' : 'green';
    const actionLabel =
      action === 'all-red' ? 'Dừng khẩn cấp' : action === 'force-vertical' ? 'Ưu tiên chiều dọc' : 'Ưu tiên chiều ngang';

    manualOverrides.current[cameraId] = newStatus;
    setCameras((prev) =>
      prev.map((camera) =>
        camera.id === cameraId
          ? { ...camera, trafficLightStatus: newStatus, timer: 99, reason: `Lệnh thủ công: ${actionLabel}` }
          : camera,
      ),
    );

    addToast(`Đã ghi nhận lệnh: ${actionLabel} tại ${cameraName} bởi Admin.`, action === 'all-red' ? 'error' : 'success', 5000);
  };

  const getTrafficLightColor = (status: SignalState) => {
    if (status === 'red') return 'bg-red-500';
    if (status === 'yellow') return 'bg-yellow-500';
    if (status === 'green') return 'bg-green-500';
    return 'bg-slate-500';
  };

  const getStatusText = (status: SignalState) => {
    if (status === 'red') return 'Dừng';
    if (status === 'yellow') return 'Chuyển';
    if (status === 'green') return 'Đi';
    return 'Chưa rõ';
  };

  return (
    <div className="space-y-3">
      <Card className="px-3 py-[7px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold truncate">Chế độ điều phối</h3>
            <span
              className={`text-[10px] px-2 py-0.5 rounded border ${
                autoMode ? 'bg-green-500/15 text-green-600 border-green-500/25' : 'bg-orange-500/15 text-orange-600 border-orange-500/25'
              }`}
            >
              {autoMode ? 'AI tự động' : 'Thủ công'}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded border ${
                syncStatus === 'live'
                  ? 'bg-sky-500/15 text-sky-700 border-sky-500/25'
                  : 'bg-amber-500/15 text-amber-700 border-amber-500/25'
              }`}
            >
              {syncStatus === 'live' ? 'Đồng bộ dữ liệu thật' : syncStatus === 'loading' ? 'Đang đồng bộ' : 'Dự phòng'}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setAutoMode(true);
                manualOverrides.current = {};
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                autoMode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Tự động
            </button>
            <button
              onClick={() => setAutoMode(false)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-2 ${
                !autoMode ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              Thủ công
            </button>
          </div>
        </div>
      </Card>

      <Card className="px-3 py-2 border-l-2 border-l-green-500 bg-green-50/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              <span className="font-semibold text-foreground">Đề xuất real-time: </span>
              tăng đèn xanh tại <span className="font-medium text-foreground">{topSuggestion.name}</span> lên{' '}
              <span className="font-semibold text-green-700">{topSuggestion.suggestedGreen}s</span>
              {' - '}
              {topSuggestion.reason}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">
              Cập nhật mỗi 5s từ phân tích lưu lượng và khung camera. Lần cuối: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('vi-VN') : '--'}
            </p>
          </div>
          <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90 whitespace-nowrap text-xs font-semibold">
            Áp dụng
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cameras.map((camera) => (
          <Card key={camera.id} className="p-4 overflow-hidden">
            <div className="relative w-full bg-black rounded-lg overflow-hidden aspect-video mb-3">
              {cameraFrames[camera.id] ? (
                <img
                  src={cameraFrames[camera.id]!}
                  alt={camera.name}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white/60">
                    <Activity className="w-8 h-8 mx-auto mb-1" />
                    <p className="text-xs">{camera.name}</p>
                  </div>
                </div>
              )}

              <div className="absolute top-3 right-3 flex flex-col gap-2 bg-black/75 p-3 rounded-lg">
                <div className="flex gap-2 items-center">
                  <div className={`w-5 h-5 rounded-full transition-all ${camera.trafficLightStatus === 'red' ? 'bg-red-500 shadow-lg shadow-red-500' : 'bg-red-500/30'}`} />
                  <div className={`w-4 h-4 rounded-full ${camera.trafficLightStatus === 'yellow' ? 'bg-yellow-500' : 'bg-yellow-500/30'}`} />
                  <div className={`w-4 h-4 rounded-full ${camera.trafficLightStatus === 'green' ? 'bg-green-500' : 'bg-green-500/30'}`} />
                </div>
                <div className="flex items-center gap-1 text-sm text-white">
                  <Clock className="w-3.5 h-3.5" />
                  {camera.timer}s
                </div>
              </div>

              <div className={`absolute bottom-3 left-3 ${getTrafficLightColor(camera.trafficLightStatus)} text-white px-3 py-1 rounded text-xs font-bold`}>
                {getStatusText(camera.trafficLightStatus)}
              </div>
            </div>

            {!autoMode && (
              <div className="flex gap-1.5 px-1 py-2">
                <button
                  onClick={() => handleManualCommand(camera.id, camera.name, 'force-vertical')}
                  className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1.5 rounded-md transition-all shadow-sm"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  Chiều dọc
                </button>
                <button
                  onClick={() => handleManualCommand(camera.id, camera.name, 'force-horizontal')}
                  className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1.5 rounded-md transition-all shadow-sm"
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  Chiều ngang
                </button>
                <button
                  onClick={() => handleManualCommand(camera.id, camera.name, 'all-red')}
                  className="flex-1 flex items-center justify-center gap-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold py-1.5 rounded-md transition-all shadow-sm"
                >
                  <OctagonX className="w-3 h-3" />
                  Dừng
                </button>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-[12px] leading-snug">{camera.name}</h4>
                  <p className="text-[11px] text-muted-foreground leading-snug">{camera.location}</p>
                </div>
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => goTo({ view: 'live' }, { camera: camera.id })}
                    className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
                    title="Xem camera trực tiếp"
                  >
                    Xem
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo({ view: 'analytics', tab: 'traffic' }, { camera: camera.id })}
                    className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
                    title="Xem biểu đồ lưu lượng"
                  >
                    Lưu lượng
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo({ view: 'devices', tab: 'list' }, { camera: camera.id, open: 1 })}
                    className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
                    title="Xem cấu hình thiết bị"
                  >
                    Thiết bị
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-md bg-slate-50 p-2">
                  <div className="text-muted-foreground">Lưu lượng</div>
                  <div className="font-bold">{camera.traffic24h}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <div className="text-muted-foreground">Vi phạm</div>
                  <div className="font-bold text-red-600">{camera.violations24h}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <div className="text-muted-foreground">Xanh đề xuất</div>
                  <div className="font-bold text-green-700">{camera.suggestedGreen}s</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Mật độ {camera.density}%
                </span>
                <span>
                  Đèn: {getSignalText(camera.trafficLightStatus)} ·{' '}
                  <span className={getConfidenceTone(camera.confidence)}>
                    {camera.confidence ? `${Math.round(camera.confidence * 100)}%` : 'chưa chắc'}
                  </span>
                </span>
              </div>
              <div className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-muted-foreground">
                Nguồn: {getSignalSourceText(camera.signalSource)} · {camera.reason}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
