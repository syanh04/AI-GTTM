'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Check, Plus, RotateCcw, Trash2, Video } from 'lucide-react';
import { useVideoState } from '@/lib/VideoContext';

type VisibleAreaType = 'stop-line' | 'turn-zone';
type AreaType = VisibleAreaType | 'arrow-signal-zone' | 'permission-sign-zone';
type DrawMode = VisibleAreaType | null;
type PermissionSource = 'arrow-signal' | 'static-sign' | 'arrow-or-sign';
type VehicleScope = 'all' | 'motorbike' | 'car' | 'motorbike-car';
type MainSignalState = 'red' | 'yellow' | 'green';
type SignalType = 'straight' | 'arrow' | 'both';

interface Point {
  x: number;
  y: number;
}

interface DrawingArea {
  id: string;
  type: AreaType;
  name: string;
  points: Point[];
}

interface RightTurnExceptionConfig {
  enabled: boolean;
  permissionSource: PermissionSource;
  vehicleScope: VehicleScope;
  stopLineId: string;
  turnZoneId: string;
  arrowSignalZoneId: string;
  permissionSignZoneId: string;
  arrowSignalActive: boolean;
  permissionSignActive: boolean;
  mainSignalState: MainSignalState;
  notes: string;
}

interface CameraViolationConfigState {
  areas: DrawingArea[];
  rightTurnException: RightTurnExceptionConfig;
  redLightRules?: unknown[];
}

interface DrawingCanvasProps {
  selectedCamera: string;
}

interface DrawingSource {
  id: string;
  label: string;
  description: string;
  previewUrl: string;
}

interface UiMeta {
  signalType: SignalType;
  hasPermissionSign: boolean;
}

const STORAGE_KEY = 'traffic-violation-config-v2';
const API_BASE = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
const CANVAS_WIDTH = 820;
const CANVAS_HEIGHT = 380;
const UI_META_PREFIX = '__ui_meta__:';

const CAMERA_LABELS: Record<string, string> = {
  CAM_01: 'CAM 01 - Cầu Giấy',
  CAM_02: 'CAM 02 - Đống Đa',
  CAM_03: 'CAM 03 - Tây Hồ',
  CAM_04: 'CAM 04 - Hoàn Kiếm',
  CAM_05: 'CAM 05 - Hoàn Kiếm',
  CAM_06: 'CAM 06 - Nam Từ Liêm',
};

const DRAWABLE_TYPES: VisibleAreaType[] = ['stop-line', 'turn-zone'];

const AREA_META: Record<
  AreaType,
  { label: string; action: string; color: string; fill: string; shape: 'line' | 'polygon' | 'box'; hint: string }
> = {
  'stop-line': {
    label: 'Vạch dừng',
    action: 'Vẽ vạch dừng',
    color: '#ef4444',
    fill: 'rgba(239, 68, 68, 0.18)',
    shape: 'line',
    hint: 'Bấm 2 điểm để tạo vạch dừng.',
  },
  'turn-zone': {
    label: 'Vùng rẽ phải',
    action: 'Vẽ vùng rẽ phải',
    color: '#2563eb',
    fill: 'rgba(37, 99, 235, 0.18)',
    shape: 'polygon',
    hint: 'Bấm nhiều điểm để vẽ vùng. Có thể bấm "Hoàn tất vùng".',
  },
  'arrow-signal-zone': {
    label: 'ROI đèn mũi tên',
    action: '',
    color: '#16a34a',
    fill: 'rgba(22, 163, 74, 0.18)',
    shape: 'box',
    hint: '',
  },
  'permission-sign-zone': {
    label: 'ROI biển phụ',
    action: '',
    color: '#eab308',
    fill: 'rgba(234, 179, 8, 0.18)',
    shape: 'polygon',
    hint: '',
  },
};

const SIGNAL_TYPE_OPTIONS: Array<{ value: SignalType; label: string }> = [
  { value: 'straight', label: 'Đèn thẳng' },
  { value: 'arrow', label: 'Đèn mũi tên' },
  { value: 'both', label: 'Cả hai' },
];

const BOOLEAN_OPTIONS: Array<{ value: 'true' | 'false'; label: string }> = [
  { value: 'true', label: 'Có' },
  { value: 'false', label: 'Không' },
];

const HIDDEN_ARROW_AREA: DrawingArea = {
  id: 'arrow-config-1',
  type: 'arrow-signal-zone',
  name: 'ROI đèn mũi tên (cấu hình)',
  points: [
    { x: 680, y: 24 },
    { x: 792, y: 24 },
    { x: 792, y: 98 },
    { x: 680, y: 98 },
  ],
};

const HIDDEN_SIGN_AREA: DrawingArea = {
  id: 'sign-config-1',
  type: 'permission-sign-zone',
  name: 'ROI biển phụ (cấu hình)',
  points: [
    { x: 554, y: 110 },
    { x: 760, y: 110 },
    { x: 760, y: 180 },
    { x: 554, y: 180 },
  ],
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const defaultVisibleAreas = (): DrawingArea[] => [
  {
    id: 'stop-main',
    type: 'stop-line',
    name: 'Vạch dừng chính',
    points: [
      { x: 110, y: 250 },
      { x: 455, y: 250 },
    ],
  },
  {
    id: 'turn-right-1',
    type: 'turn-zone',
    name: 'Vùng rẽ phải 1',
    points: [
      { x: 470, y: 180 },
      { x: 610, y: 180 },
      { x: 660, y: 330 },
      { x: 500, y: 340 },
    ],
  },
];

const fallbackId = (areas: DrawingArea[], type: AreaType) => areas.find((area) => area.type === type)?.id || '';

const boxPoints = (start: Point, end: Point): Point[] => {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
};

const areaName = (type: VisibleAreaType, areas: DrawingArea[]) => {
  const count = areas.filter((area) => area.type === type).length + 1;
  if (type === 'stop-line') return count === 1 ? 'Vạch dừng chính' : `Vạch dừng ${count}`;
  return `Vùng rẽ phải ${count}`;
};

const serializeUiMeta = (meta: UiMeta) => `${UI_META_PREFIX}${JSON.stringify(meta)}`;

const parseUiMeta = (notes: string): UiMeta | null => {
  if (!notes.startsWith(UI_META_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(UI_META_PREFIX.length)) as Partial<UiMeta>;
    const signalType: SignalType =
      parsed.signalType === 'arrow' || parsed.signalType === 'both' || parsed.signalType === 'straight'
        ? parsed.signalType
        : 'straight';
    return {
      signalType,
      hasPermissionSign: Boolean(parsed.hasPermissionSign),
    };
  } catch {
    return null;
  }
};

const inferUiMetaFromConfig = (state?: Partial<RightTurnExceptionConfig>, areas?: DrawingArea[]): UiMeta => {
  const hasArrow = Boolean(state?.arrowSignalActive) || Boolean((areas || []).find((area) => area.type === 'arrow-signal-zone'));
  const hasPermissionSign =
    Boolean(state?.permissionSignActive) || Boolean((areas || []).find((area) => area.type === 'permission-sign-zone'));

  return {
    signalType: hasArrow ? 'arrow' : 'straight',
    hasPermissionSign,
  };
};

const buildPayload = (visibleAreas: DrawingArea[], uiMeta: UiMeta): CameraViolationConfigState => {
  const stopLineId = fallbackId(visibleAreas, 'stop-line');
  const turnZoneId = fallbackId(visibleAreas, 'turn-zone');
  const hasArrowSignal = uiMeta.signalType === 'arrow' || uiMeta.signalType === 'both';
  const hasPermissionSign = uiMeta.hasPermissionSign;

  let permissionSource: PermissionSource = 'static-sign';
  if (hasArrowSignal && hasPermissionSign) permissionSource = 'arrow-or-sign';
  else if (hasArrowSignal) permissionSource = 'arrow-signal';
  else if (hasPermissionSign) permissionSource = 'static-sign';

  const areas: DrawingArea[] = [...visibleAreas];
  if (hasArrowSignal) {
    areas.push(HIDDEN_ARROW_AREA);
  }
  if (hasPermissionSign) {
    areas.push(HIDDEN_SIGN_AREA);
  }

  return {
    areas,
    rightTurnException: {
      enabled: Boolean(stopLineId && turnZoneId),
      permissionSource,
      vehicleScope: 'motorbike',
      stopLineId,
      turnZoneId,
      arrowSignalZoneId: hasArrowSignal ? HIDDEN_ARROW_AREA.id : '',
      permissionSignZoneId: hasPermissionSign ? HIDDEN_SIGN_AREA.id : '',
      arrowSignalActive: hasArrowSignal,
      permissionSignActive: hasPermissionSign,
      mainSignalState: 'red',
      notes: serializeUiMeta(uiMeta),
    },
  };
};

const buildCleanPreviewUrl = (sourceUrl: string, cameraId: string) => {
  if (!sourceUrl) return '';
  if (sourceUrl.startsWith('data:')) return sourceUrl;

  try {
    const url = new URL(sourceUrl, API_BASE);
    url.searchParams.set('detect_vehicle', 'false');
    url.searchParams.set('detect_plate', 'false');
    url.searchParams.set('simulation', 'false');
    url.searchParams.set('show_box', 'false');
    url.searchParams.set('cam_id', cameraId);
    url.searchParams.set('_', String(Date.now()));
    return url.toString();
  } catch {
    return sourceUrl;
  }
};

const buildRtspPreviewUrl = (rtspUrl: string, cameraId: string) => {
  const url = new URL('/video_feed/rtsp_stream', API_BASE);
  url.searchParams.set('rtsp_url', rtspUrl);
  url.searchParams.set('cam_id', cameraId);
  url.searchParams.set('detect_vehicle', 'false');
  url.searchParams.set('detect_plate', 'false');
  url.searchParams.set('simulation', 'false');
  url.searchParams.set('show_box', 'false');
  url.searchParams.set('_', String(Date.now()));
  return url.toString();
};

const saveStatusLabel = (status: 'idle' | 'loading' | 'saving' | 'error') => {
  if (status === 'loading') return 'Đang tải cấu hình';
  if (status === 'saving') return 'Đang lưu';
  if (status === 'error') return 'Đang lưu tạm local';
  return 'Đã đồng bộ';
};

export default function DrawingCanvas({ selectedCamera }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skipNextSaveRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { cameraFrames, preferredRtspUrl } = useVideoState();

  const [areas, setAreas] = useState<DrawingArea[]>([]);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [tempPoints, setTempPoints] = useState<Point[]>([]);
  const [preview, setPreview] = useState<Point | null>(null);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'error'>('idle');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [uiMeta, setUiMeta] = useState<UiMeta>({ signalType: 'straight', hasPermissionSign: false });

  useEffect(() => {
    let cancelled = false;

    setReady(false);
    setSyncStatus('loading');
    setDrawMode(null);
    setTempPoints([]);
    setPreview(null);

    const loadState = async () => {
      let nextAreas = defaultVisibleAreas();
      let nextMeta: UiMeta = { signalType: 'straight', hasPermissionSign: false };

      try {
        const response = await fetch(`${API_BASE}/api/violation-config/${encodeURIComponent(selectedCamera)}`);
        if (!response.ok) throw new Error('load-failed');

        const data = (await response.json()) as Partial<CameraViolationConfigState>;
        const rawAreas = Array.isArray(data.areas) ? (data.areas as DrawingArea[]) : [];
        const visibleAreas = rawAreas.filter((area) => DRAWABLE_TYPES.includes(area.type as VisibleAreaType));
        nextAreas = visibleAreas.length ? visibleAreas : defaultVisibleAreas();

        const parsedMeta = parseUiMeta(data.rightTurnException?.notes || '');
        nextMeta = parsedMeta || inferUiMetaFromConfig(data.rightTurnException, rawAreas);
        if (!cancelled) setSyncStatus('idle');
      } catch {
        if (typeof window !== 'undefined') {
          try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            const stored = raw ? (JSON.parse(raw) as Record<string, CameraViolationConfigState>) : {};
            const storedState = stored[selectedCamera];
            if (storedState) {
              const visibleAreas = storedState.areas.filter((area) => DRAWABLE_TYPES.includes(area.type as VisibleAreaType));
              nextAreas = visibleAreas.length ? visibleAreas : defaultVisibleAreas();
              nextMeta =
                parseUiMeta(storedState.rightTurnException?.notes || '') ||
                inferUiMetaFromConfig(storedState.rightTurnException, storedState.areas);
            }
          } catch {
            nextAreas = defaultVisibleAreas();
          }
        }
        if (!cancelled) setSyncStatus('error');
      }

      if (cancelled) return;
      skipNextSaveRef.current = true;
      setAreas(nextAreas);
      setUiMeta(nextMeta);
      setReady(true);
    };

    loadState();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [selectedCamera]);

  const payload = useMemo(() => buildPayload(areas, uiMeta), [areas, uiMeta]);

  useEffect(() => {
    if (!ready) return;

    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const stored = raw ? (JSON.parse(raw) as Record<string, CameraViolationConfigState>) : {};
        stored[selectedCamera] = payload;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch {
        // Ignore local fallback write errors.
      }
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        setSyncStatus('saving');
        const response = await fetch(`${API_BASE}/api/violation-config/${encodeURIComponent(selectedCamera)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('save-failed');
        setSyncStatus('idle');
      } catch {
        setSyncStatus('error');
      }
    }, 350);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [payload, ready, selectedCamera]);

  const drawSources = useMemo<DrawingSource[]>(() => {
    const sources: DrawingSource[] = Object.entries(cameraFrames)
      .filter(([, url]) => Boolean(url))
      .map(([cameraId, url]) => ({
        id: `camera:${cameraId}`,
        label: CAMERA_LABELS[cameraId] || cameraId,
        description: 'Video có sẵn để căn vùng',
        previewUrl: buildCleanPreviewUrl(url || '', cameraId),
      }));

    if (preferredRtspUrl.trim()) {
      sources.push({
        id: 'rtsp:current',
        label: 'Luồng RTSP hiện tại',
        description: preferredRtspUrl.trim(),
        previewUrl: buildRtspPreviewUrl(preferredRtspUrl.trim(), selectedCamera),
      });
    }

    return sources;
  }, [cameraFrames, preferredRtspUrl, selectedCamera]);

  useEffect(() => {
    if (!drawSources.length) {
      setSelectedSourceId('');
      return;
    }

    const preferredCameraId = `camera:${selectedCamera}`;
    const hasSelected = drawSources.some((source) => source.id === selectedSourceId);
    if (hasSelected) return;

    const defaultSource =
      drawSources.find((source) => source.id === preferredCameraId) ||
      drawSources.find((source) => source.id.startsWith('camera:')) ||
      drawSources[0];

    setSelectedSourceId(defaultSource.id);
  }, [drawSources, selectedCamera, selectedSourceId]);

  const activeSource = drawSources.find((source) => source.id === selectedSourceId) || null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';

    for (let x = 0; x < canvas.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const drawArea = (area: DrawingArea, dashed = false) => {
      const meta = AREA_META[area.type];
      ctx.save();
      if (dashed) ctx.setLineDash([6, 6]);
      ctx.strokeStyle = meta.color;
      ctx.fillStyle = meta.fill;
      ctx.lineWidth = area.type === 'stop-line' ? 4 : 2;

      if (meta.shape === 'line' && area.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(area.points[0].x, area.points[0].y);
        ctx.lineTo(area.points[1].x, area.points[1].y);
        ctx.stroke();
      } else if (area.points.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(area.points[0].x, area.points[0].y);
        area.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      area.points.forEach((point) => {
        ctx.beginPath();
        ctx.fillStyle = meta.color;
        ctx.arc(point.x, point.y, meta.shape === 'line' ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    };

    areas.forEach((area) => drawArea(area));

    if (!drawMode || tempPoints.length === 0) return;

    let previewArea: DrawingArea | null = null;
    if (drawMode === 'stop-line' && tempPoints.length === 1 && preview) {
      previewArea = { id: 'preview', type: drawMode, name: 'preview', points: [tempPoints[0], preview] };
    }
    if (drawMode === 'turn-zone') {
      const points = preview ? [...tempPoints, preview] : tempPoints;
      if (points.length >= 2) {
        previewArea = { id: 'preview', type: drawMode, name: 'preview', points };
      }
    }

    if (previewArea) drawArea(previewArea, true);
  }, [areas, drawMode, preview, tempPoints]);

  const startMode = (type: VisibleAreaType) => {
    setDrawMode(type);
    setTempPoints([]);
    setPreview(null);
  };

  const cancelMode = () => {
    setDrawMode(null);
    setTempPoints([]);
    setPreview(null);
  };

  const completePolygon = () => {
    if (!drawMode || drawMode !== 'turn-zone' || tempPoints.length < 3) return;
    setAreas((prev) => [...prev, { id: createId(), type: drawMode, name: areaName(drawMode, prev), points: tempPoints }]);
    cancelMode();
  };

  const restoreDefault = () => {
    skipNextSaveRef.current = false;
    setAreas(defaultVisibleAreas());
    setUiMeta({ signalType: 'straight', hasPermissionSign: false });
    cancelMode();
  };

  const removeArea = (areaId: string) => {
    setAreas((prev) => prev.filter((area) => area.id !== areaId));
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };

    if (drawMode === 'stop-line') {
      if (tempPoints.length === 0) {
        setTempPoints([point]);
        return;
      }
      setAreas((prev) => [...prev, { id: createId(), type: drawMode, name: areaName(drawMode, prev), points: [tempPoints[0], point] }]);
      cancelMode();
      return;
    }

    if (event.detail === 2 && tempPoints.length >= 3) {
      setAreas((prev) => [...prev, { id: createId(), type: drawMode, name: areaName(drawMode, prev), points: tempPoints }]);
      cancelMode();
      return;
    }

    setTempPoints((prev) => [...prev, point]);
  };

  const handleCanvasMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode || tempPoints.length === 0) {
      setPreview(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setPreview({
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    });
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-border/70">
        <div className="border-b bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-5 py-4 text-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/90">Cấu hình vùng vi phạm</p>
              <h3 className="text-xl font-semibold">Thiết lập nhanh cho {CAMERA_LABELS[selectedCamera] || selectedCamera}</h3>
              <p className="max-w-3xl text-sm text-slate-300">
                Chỉ còn 2 vùng cần vẽ trên canvas: vạch dừng và vùng rẽ phải. Đèn và biển phụ được chọn một lần ở phần cấu hình bên dưới rồi lưu chung vào payload hiện tại.
              </p>
            </div>
            <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-100">
              {saveStatusLabel(syncStatus)}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Video className="h-4 w-4 text-cyan-600" />
              Chọn nguồn hình để vẽ
            </div>
            {drawSources.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-3">
                {drawSources.map((source) => {
                  const active = source.id === selectedSourceId;
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => setSelectedSourceId(source.id)}
                      className={`rounded-xl border px-4 py-3 text-left transition ${
                        active
                          ? 'border-cyan-500 bg-cyan-50 shadow-sm'
                          : 'border-border bg-card hover:border-cyan-300 hover:bg-cyan-50/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{source.label}</p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{source.description}</p>
                        </div>
                        {active && <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
                Chưa có nguồn hình để vẽ. Hãy tải video ở tab giám sát hoặc nhập URL RTSP trước.
              </div>
            )}
          </div>

          <Separator />

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium">Bước 1: Vẽ vùng trên khung hình</p>
                  <p className="text-xs text-muted-foreground">
                    Chỉ cần vẽ 2 vùng bắt buộc: vạch dừng và vùng rẽ phải.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DRAWABLE_TYPES.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={drawMode === type ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => startMode(type)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {AREA_META[type].action}
                    </Button>
                  ))}
                  <Button type="button" variant="ghost" size="sm" onClick={restoreDefault}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Đặt lại
                  </Button>
                </div>
              </div>

              {drawMode && (
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Đang vẽ {AREA_META[drawMode].label}.</span>{' '}
                  {AREA_META[drawMode].hint}
                  {drawMode === 'turn-zone' && tempPoints.length >= 3 && (
                    <Button type="button" variant="secondary" size="sm" className="ml-3" onClick={completePolygon}>
                      Hoàn tất vùng
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="ml-2" onClick={cancelMode}>
                    Hủy
                  </Button>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border bg-slate-950">
                <div className="relative" style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}>
                  {activeSource ? (
                    <>
                      <img
                        src={activeSource.previewUrl}
                        alt={activeSource.label}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="eager"
                        decoding="async"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-center text-sm text-slate-300">
                      Hãy chọn nguồn hình trước khi vẽ.
                    </div>
                  )}

                  <canvas
                    ref={canvasRef}
                    width={CANVAS_WIDTH}
                    height={CANVAS_HEIGHT}
                    className={`absolute inset-0 h-full w-full ${activeSource ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
                    onClick={activeSource ? handleCanvasClick : undefined}
                    onMouseMove={activeSource ? handleCanvasMove : undefined}
                    onMouseLeave={() => setPreview(null)}
                  />

                  {activeSource && (
                    <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      {activeSource.label}
                    </div>
                  )}
                </div>

                <div className="border-t bg-white/95 px-4 py-3">
                  <div className="flex flex-wrap gap-3 text-xs">
                    {DRAWABLE_TYPES.map((type) => (
                      <span key={type} className="inline-flex items-center gap-2 rounded-full border px-3 py-1">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AREA_META[type].color }} />
                        {AREA_META[type].label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Bước 2: Cấu hình giao lộ</p>
                  <p className="text-xs text-muted-foreground">
                    Không cần vẽ ROI đèn hay ROI biển phụ nữa. Hai lựa chọn bên dưới sẽ được gộp vào đúng payload hiện tại khi lưu camera.
                  </p>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Loại đèn</label>
                    <Select
                      value={uiMeta.signalType}
                      onValueChange={(value) => setUiMeta((prev) => ({ ...prev, signalType: value as SignalType }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Chọn loại đèn" />
                      </SelectTrigger>
                      <SelectContent>
                        {SIGNAL_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Có biển phụ</label>
                    <Select
                      value={uiMeta.hasPermissionSign ? 'true' : 'false'}
                      onValueChange={(value) =>
                        setUiMeta((prev) => ({ ...prev, hasPermissionSign: value === 'true' }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Chọn trạng thái biển phụ" />
                      </SelectTrigger>
                      <SelectContent>
                        {BOOLEAN_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Danh sách vùng đã vẽ</p>
                    <p className="text-xs text-muted-foreground">Chỉ hiển thị 2 vùng dùng trực tiếp trên canvas.</p>
                  </div>
                  <div className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    {areas.length} vùng
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {areas.length > 0 ? (
                    areas.map((area) => (
                      <div key={area.id} className="rounded-xl border px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="inline-flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: AREA_META[area.type].color }}
                              />
                              <p className="text-sm font-semibold">{area.name}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {AREA_META[area.type].label} • {area.points.length} điểm
                            </p>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeArea(area.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            Xóa
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                      Chưa có vùng nào. Hãy chọn nguồn hình rồi bắt đầu vẽ.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-medium text-slate-900">Payload khi lưu</p>
                <p className="mt-1 text-xs text-slate-600">
                  UI chỉ còn 2 vùng vẽ, nhưng khi gửi lên backend hệ thống vẫn đóng gói đủ `areas` và `rightTurnException`.
                  Hai lựa chọn đèn và biển phụ được map vào payload hiện tại nên không cần đổi API hoặc logic xử lý.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
