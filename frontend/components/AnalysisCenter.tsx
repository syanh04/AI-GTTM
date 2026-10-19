'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ArrowRightLeft, BarChart3, Calendar, Clock, Download, Eye, FileText, Flame, MapPinned, Radar, ShieldAlert, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import AdvancedAnalyticsChart from './AdvancedAnalyticsChart';
import ReportPreviewPanel from './ReportPreviewPanel';
import LaneHeatmapPanel from './analytics/LaneHeatmapPanel';
import LaneStatsTable from './analytics/LaneStatsTable';
import CutInEventList from './analytics/CutInEventList';
import LanePolygonEditor from './analytics/LanePolygonEditor';
import LaneAnalyticsDiagnostics from './analytics/LaneAnalyticsDiagnostics';
import SmartSearchPanel from './SmartSearchPanel';
import ModelMetricsPanel from './data-center/ModelMetricsPanel';
import { useVideoState } from '@/lib/VideoContext';
import { useAuth } from '@/lib/AuthContext';
import { isTransientRequestError } from '@/lib/requestError';

const ENABLE_ANALYTICS_HEATMAP_V2 = true;

interface AnalysisData {
  time: string;
  baTrier: number;
  langHa: number;
  tayHo: number;
  nguyenHue: number;
  tranHungDao: number;
  xuanPhuong: number;
  violations: number;
  redLight: number;
  speeding: number;
  wrongLane: number;
  noHelmet: number;
}

interface ViolationCompositionItem {
  name: string;
  value: number;
  fill: string;
}

interface HotspotItem {
  camera_id: string;
  name: string;
  violations: number;
}

const SIMULATION_CAMERA_KEYS = ['baTrier', 'langHa', 'tayHo', 'nguyenHue', 'tranHungDao', 'xuanPhuong'] as const;
const SIMULATION_VEHICLE_TYPES = ['car', 'moto', 'bus', 'truck'] as const;

const randomAround = (base: number, spread: number) =>
  Math.max(0, base + Math.floor(Math.random() * (spread * 2 + 1)) - spread);

const buildSimulatedAnalyticsPayload = () => {
  const chart_data = Array.from({ length: 13 }, (_, index) => {
    const hour = index + 7;
    const peak = [7, 8, 9, 17, 18, 19].includes(hour);
    const row: AnalysisData & Record<string, string | number> = {
      time: `${String(hour).padStart(2, '0')}:00`,
      baTrier: 0,
      langHa: 0,
      tayHo: 0,
      nguyenHue: 0,
      tranHungDao: 0,
      xuanPhuong: 0,
      violations: randomAround(peak ? 8 : 3, 2),
      redLight: randomAround(35, 6),
      speeding: randomAround(30, 5),
      wrongLane: randomAround(22, 4),
      noHelmet: randomAround(13, 3),
    };

    SIMULATION_CAMERA_KEYS.forEach((camera) => {
      const total = randomAround(peak ? 18 : 9, peak ? 5 : 3);
      row[camera] = total;
      SIMULATION_VEHICLE_TYPES.forEach((type) => {
        row[`${camera}_${type}`] = randomAround(Math.floor(total / 4), 2);
      });
    });
    return row;
  });

  const vehicle_composition = [
    { name: 'Ô tô', value: randomAround(35, 8), fill: 'var(--vehicle-car)' },
    { name: 'Xe máy', value: randomAround(55, 10), fill: 'var(--vehicle-motorcycle)' },
    { name: 'Xe buýt', value: randomAround(8, 3), fill: 'var(--vehicle-bus)' },
    { name: 'Xe tải', value: randomAround(12, 4), fill: 'var(--vehicle-truck)' },
  ];
  const violation_composition = [
    { name: 'Vượt đèn đỏ', value: randomAround(35, 8), fill: '#ef4444' },
    { name: 'Quá tốc độ', value: randomAround(30, 7), fill: '#f97316' },
    { name: 'Sai làn', value: randomAround(22, 6), fill: '#eab308' },
    { name: 'Không mũ bảo hiểm', value: randomAround(13, 5), fill: '#8b5cf6' },
  ];
  const top_hotspots = [
    { camera_id: 'CAM_01', name: 'Bà Triệu', violations: randomAround(58, 12) },
    { camera_id: 'CAM_02', name: 'Láng Hạ', violations: randomAround(46, 10) },
    { camera_id: 'CAM_03', name: 'Tây Hồ', violations: randomAround(34, 8) },
    { camera_id: 'CAM_04', name: 'Nguyễn Huệ', violations: randomAround(27, 7) },
  ];
  const total_traffic = chart_data.reduce(
    (sum, row) => sum + SIMULATION_CAMERA_KEYS.reduce((cameraSum, key) => cameraSum + Number(row[key] || 0), 0),
    0,
  );
  const total_violations = chart_data.reduce((sum, row) => sum + Number(row.violations || 0), 0);

  return {
    chart_data,
    vehicle_composition,
    violation_composition,
    top_hotspots,
    stats: {
      total_traffic,
      total_violations,
      compliance_rate: total_traffic ? Number((((total_traffic - total_violations) / total_traffic) * 100).toFixed(1)) : 100,
      hotspot: top_hotspots[0].name,
    },
  };
};

type AnalyticsPayload = ReturnType<typeof buildSimulatedAnalyticsPayload>;

// Preserve the latest confirmed real payload while the Analysis tab is
// unmounted, so disabling simulation can restore the original chart at once.
const realAnalyticsCache = new Map<string, AnalyticsPayload>();

const mergeComposition = <T extends { name: string; value: number; fill: string }>(real: T[] = [], simulated: T[] = []) => {
  const merged = new Map<string, T>();
  [...real, ...simulated].forEach((item) => {
    const previous = merged.get(item.name);
    merged.set(item.name, {
      ...item,
      value: Number(previous?.value || 0) + Number(item.value || 0),
    });
  });
  return Array.from(merged.values());
};

const mergeRealAndSimulatedAnalytics = (
  real: AnalyticsPayload | null,
  simulated: AnalyticsPayload,
): AnalyticsPayload => {
  if (!real) return simulated;

  const hotspotMap = new Map<string, HotspotItem>();
  [...(real.top_hotspots || []), ...(simulated.top_hotspots || [])].forEach((item) => {
    const previous = hotspotMap.get(item.camera_id);
    hotspotMap.set(item.camera_id, {
      ...item,
      violations: Number(previous?.violations || 0) + Number(item.violations || 0),
    });
  });
  const top_hotspots = Array.from(hotspotMap.values()).sort((a, b) => b.violations - a.violations);
  const total_traffic = Number(real.stats?.total_traffic || 0) + Number(simulated.stats.total_traffic || 0);
  const total_violations = Number(real.stats?.total_violations || 0) + Number(simulated.stats.total_violations || 0);

  return {
    chart_data: [...(real.chart_data || []), ...simulated.chart_data].sort((a, b) =>
      String(a.time).localeCompare(String(b.time)),
    ),
    vehicle_composition: mergeComposition(real.vehicle_composition, simulated.vehicle_composition),
    violation_composition: mergeComposition(real.violation_composition, simulated.violation_composition),
    top_hotspots,
    stats: {
      total_traffic,
      total_violations,
      compliance_rate: total_traffic
        ? Number((((total_traffic - total_violations) / total_traffic) * 100).toFixed(1))
        : 100,
      hotspot: top_hotspots[0]?.name || real.stats?.hotspot || 'N/A',
    },
  };
};

interface AIQualityMetric {
  ok?: number;
  count?: number;
  rate?: number;
}

interface AIQualityIssue {
  id: number;
  camera_id: string;
  vehicle_type: string;
  plate_number: string;
  plate_crop_source: string;
  plate_debug_reason: string;
  timestamp: string;
  issues: string[];
}

interface AIQualitySummary {
  generated_at: string;
  window_minutes: number;
  total: number;
  vehicle_image: AIQualityMetric;
  plate_crop: AIQualityMetric;
  ocr: AIQualityMetric;
  truck_body_fallback: { count: number };
  needs_review: AIQualityMetric;
  issue_counts: Record<string, number>;
  by_camera: Record<string, { total: number; vehicle_image_ok: number; plate_crop_ok: number; ocr_success: number; needs_review: number }>;
  recent_issues: AIQualityIssue[];
}

interface OCRRuntimeStatus {
  status: 'ready' | 'degraded' | 'blocked' | string;
  issues: string[];
  packages: Record<string, boolean>;
  env: Record<string, string>;
  paths: Record<string, string | boolean>;
  stats: {
    recognized_total?: number;
    confirmed_total?: number;
    paddle_calls?: number;
    paddle_last_variant?: string;
    paddle_last_ms?: number;
    plate_detect_calls?: number;
  };
  background_ocr_queue_size: number;
  note: string;
}

interface AnalysisCenterProps {
  selectedDate: string;
  viewMode?: 'analytics' | 'report';
  onDateChange?: (date: string) => void;
  onExportPDF?: () => void;
  onExportCSV?: () => void;
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
}

export default function AnalysisCenter({
  selectedDate,
  viewMode = 'analytics',
  onDateChange,
  onExportPDF,
  onExportCSV,
  addToast,
}: AnalysisCenterProps) {
  const { simulationMode } = useVideoState();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [chartData, setChartData] = useState<AnalysisData[]>([]);
  const [vehicleComposition, setVehicleComposition] = useState<any[]>([]);
  const [violationComposition, setViolationComposition] = useState<ViolationCompositionItem[]>([]);
  const [topHotspots, setTopHotspots] = useState<HotspotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancedViewEnabled, setAdvancedViewEnabled] = useState(false);
  const [analysisSubtab, setAnalysisSubtab] = useState<'traffic' | 'quality' | 'smart'>('traffic');
  const [laneApiView, setLaneApiView] = useState<'heatmap' | 'stats' | 'events' | 'config' | 'diagnostics'>('heatmap');
  const [analyticsCameraId, setAnalyticsCameraId] = useState('CAM_01');
  const [stats, setStats] = useState({
    total_traffic: 0,
    total_violations: 0,
    compliance_rate: 100,
    hotspot: 'N/A',
  });
  const [aiQuality, setAiQuality] = useState<AIQualitySummary | null>(null);
  const [aiQualityLoading, setAiQualityLoading] = useState(true);
  const [aiQualityError, setAiQualityError] = useState('');
  const [aiQualityRecoveryRunning, setAiQualityRecoveryRunning] = useState(false);
  const [ocrRuntimeStatus, setOcrRuntimeStatus] = useState<OCRRuntimeStatus | null>(null);
  const chartDataLengthRef = useRef(0);
  const realAnalyticsRef = useRef<AnalyticsPayload | null>(null);
  const realAnalyticsDateRef = useRef('');

  useEffect(() => {
    let stopped = false;
    let requestRunning = false;

    const applyPayload = (data: AnalyticsPayload) => {
      if (stopped) return;
      const nextChartData = data.chart_data || [];
      chartDataLengthRef.current = nextChartData.length;
      setChartData(nextChartData);
      setVehicleComposition(data.vehicle_composition || []);
      setViolationComposition(data.violation_composition || []);
      setTopHotspots(data.top_hotspots || []);
      if (data.stats) setStats(data.stats);
      setLoading(false);
    };

    const fetchRealPayload = async (): Promise<AnalyticsPayload> => {
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(new DOMException('Analytics request timed out', 'TimeoutError')),
        12000,
      );
      try {
        const response = await fetch(
          `/api/analytics/stats?is_simulated=false&selected_date=${encodeURIComponent(selectedDate)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error('Failed to fetch analytics');
        return response.json();
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const refreshData = async () => {
      if (requestRunning) return;
      requestRunning = true;

      const cachedReal = realAnalyticsCache.get(selectedDate) || null;
      if (realAnalyticsDateRef.current !== selectedDate) {
        realAnalyticsDateRef.current = selectedDate;
        realAnalyticsRef.current = cachedReal;
      }

      if (simulationMode) {
        applyPayload(mergeRealAndSimulatedAnalytics(realAnalyticsRef.current, buildSimulatedAnalyticsPayload()));
      } else if (realAnalyticsRef.current) {
        applyPayload(realAnalyticsRef.current);
      } else {
        setLoading(true);
      }

      try {
        const realData = await fetchRealPayload();
        if (stopped) return;
        realAnalyticsRef.current = realData;
        realAnalyticsDateRef.current = selectedDate;
        realAnalyticsCache.set(selectedDate, realData);
        applyPayload(
          simulationMode
            ? mergeRealAndSimulatedAnalytics(realData, buildSimulatedAnalyticsPayload())
            : realData,
        );
      } catch (error) {
        if (!stopped && !realAnalyticsRef.current && !simulationMode) {
          const isExpectedTimeout =
            error instanceof DOMException &&
            (error.name === 'AbortError' || error.name === 'TimeoutError');
          if (!isExpectedTimeout) {
            console.error('Error fetching analytics:', error);
            addToast('Không thể kết nối đến Server Analytics', 'error');
          }
          setLoading(false);
        }
      } finally {
        requestRunning = false;
      }
    };

    refreshData();
    const interval = window.setInterval(refreshData, 15000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [addToast, selectedDate, simulationMode]);

  useEffect(() => {
    let stopped = false;
    let requestRunning = false;

    const fetchAIQuality = async () => {
      if (requestRunning) return;
      requestRunning = true;
      try {
        const response = await fetch('/api/ai-quality/summary?minutes=1440&limit=150');
        if (!response.ok) throw new Error('Failed to fetch AI quality summary');
        const data = await response.json();
        if (stopped) return;
        setAiQuality(data);
        setAiQualityError('');
      } catch (error) {
        if (stopped) return;
        if (!isTransientRequestError(error)) {
          console.warn('Không tải được dữ liệu kiểm định AI:', error);
        }
        setAiQualityError('Chưa lấy được dữ liệu kiểm định AI');
      } finally {
        requestRunning = false;
        if (!stopped) setAiQualityLoading(false);
      }
    };

    fetchAIQuality();
    const interval = setInterval(fetchAIQuality, 30000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let requestRunning = false;

    const fetchOCRRuntimeStatus = async () => {
      if (requestRunning) return;
      requestRunning = true;
      try {
        const response = await fetch('/api/ocr/runtime-status');
        if (!response.ok) throw new Error('Failed to fetch OCR runtime status');
        const data = await response.json();
        if (stopped) return;
        setOcrRuntimeStatus(data);
      } catch (error) {
        if (stopped) return;
        if (!isTransientRequestError(error)) {
          console.warn('Không tải được trạng thái OCR:', error);
        }
      } finally {
        requestRunning = false;
      }
    };

    fetchOCRRuntimeStatus();
    const interval = setInterval(fetchOCRRuntimeStatus, 30000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  const exportAIQualityCsv = () => {
    if (!aiQuality) {
      addToast('Chưa có dữ liệu kiểm định AI để xuất báo cáo', 'warning');
      return;
    }
    const rows = [
      ['Mục', 'Giá trị'],
      ['Thời điểm xuất', aiQuality.generated_at],
      ['Cửa sổ dữ liệu', `${aiQuality.window_minutes} phút gần nhất`],
      ['Tổng bản ghi', String(aiQuality.total)],
      ['Ảnh toàn xe đạt', `${aiQuality.vehicle_image.ok || 0} (${aiQuality.vehicle_image.rate || 0}%)`],
      ['Crop biển/định danh đạt', `${aiQuality.plate_crop.ok || 0} (${aiQuality.plate_crop.rate || 0}%)`],
      ['OCR/định danh đạt', `${aiQuality.ocr.ok || 0} (${aiQuality.ocr.rate || 0}%)`],
      ['Xe tải dùng số trên thùng', String(aiQuality.truck_body_fallback.count || 0)],
      ['Cần kiểm tra lại', `${aiQuality.needs_review.count || 0} (${aiQuality.needs_review.rate || 0}%)`],
      [],
      ['ID', 'Camera', 'Loại xe', 'Biển/định danh', 'Nguồn crop', 'Lý do', 'Lỗi'],
      ...aiQuality.recent_issues.map((item) => [
        String(item.id),
        item.camera_id,
        item.vehicle_type,
        item.plate_number || 'Không rõ',
        item.plate_crop_source || 'none',
        item.plate_debug_reason || '',
        item.issues.join('; '),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ai-quality-audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    addToast('Đã xuất báo cáo kiểm định AI', 'success');
  };

  const exportAIQualityHtml = () => {
    window.open('/api/ai-quality/report.html?minutes=1440&limit=150', '_blank', 'noopener,noreferrer');
  };

  const runAIQualityOcrRecovery = async () => {
    if (aiQualityRecoveryRunning) return;
    setAiQualityRecoveryRunning(true);
    try {
      const response = await fetch('/api/ai-quality/recover-ocr?minutes=1440&limit=24&min_score=0.35', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to recover OCR');
      const data = await response.json();
      if (data.summary) setAiQuality(data.summary);
      const attempted = data.attempted || 0;
      const updated = data.updated || 0;
      if (attempted > 0 && updated === 0) {
        const firstFailure = data.failed?.[0];
        addToast(
          `Đã thử ${attempted} crop nhưng OCR chưa trả kết quả hợp lệ (${firstFailure?.variant || firstFailure?.reason || 'engine unavailable'})`,
          'warning',
        );
      } else {
        addToast(`Đã thử phục hồi OCR ${attempted} crop, cập nhật ${updated} bản ghi`, 'success');
      }
    } catch (error) {
      console.error('Error recovering AI quality OCR:', error);
      addToast('Không chạy được phục hồi OCR từ crop đã lưu', 'error');
    } finally {
      setAiQualityRecoveryRunning(false);
    }
  };

  const advancedAnalytics = useMemo(() => {
    const cameraDefs = [
      { key: 'baTrier', label: 'Bà Triệu' },
      { key: 'langHa', label: 'Láng Hạ' },
      { key: 'tayHo', label: 'Tây Hồ' },
      { key: 'nguyenHue', label: 'Nguyễn Huệ' },
      { key: 'tranHungDao', label: 'Trần Hưng Đạo' },
      { key: 'xuanPhuong', label: 'Xuân Phương' },
    ] as const;
    const trafficHotspots = cameraDefs
      .map((camera) => ({
        ...camera,
        traffic: chartData.reduce((sum, item) => sum + (item[camera.key] || 0), 0),
      }))
      .sort((a, b) => b.traffic - a.traffic);
    const peakHour = [...chartData].sort((a, b) => b.violations - a.violations)[0];
    const violationMix = violationComposition.filter((item) => item.value > 0);
    const topViolation = [...violationMix].sort((a, b) => b.value - a.value)[0];
    const violationHotspots = topHotspots.map((item) => ({
      key: item.camera_id,
      label: item.name,
      traffic: item.violations,
      metricLabel: 'vi phạm',
    }));
    const hotspots =
      violationHotspots.length > 0
        ? violationHotspots
        : trafficHotspots.map((item) => ({ ...item, metricLabel: 'lượt ghi nhận' }));
    return { hotspots, peakHour, violationMix, topViolation, usesViolationHotspots: violationHotspots.length > 0 };
  }, [chartData, topHotspots, violationComposition]);
  const hasViolationData = chartData.some((item) => item.violations > 0);
  const hotspotMaxTraffic = Math.max(...advancedAnalytics.hotspots.map((item) => item.traffic), 1);
  const hotspotTone = (value: number) => {
    const ratio = value / hotspotMaxTraffic;
    if (ratio >= 0.85) return 'bg-rose-600 text-white';
    if (ratio >= 0.65) return 'bg-orange-500 text-white';
    if (ratio >= 0.45) return 'bg-amber-100 text-amber-900';
    if (ratio >= 0.25) return 'bg-lime-100 text-lime-900';
    return 'bg-emerald-50 text-emerald-900';
  };
  const laneAnalytics: {
    zones: string[];
    lanes: string[];
    heatmap: Array<{ lane: string; values: Array<{ zone: string; value: number }> }>;
    maxHeat: number;
    pairStats: Array<{ from: string; to: string; count: number; risk: string }>;
    recentEvents: Array<{ id: string; time: string; camera: string; fromLane: string; toLane: string; severity: string; zone: string }>;
    hottestCell: null;
    kpis: { cutInTotal: number; hottestLane: string; hottestZone: string; dangerousRatio: string };
  } = {
    zones: [],
    lanes: [],
    heatmap: [],
    maxHeat: 1,
    pairStats: [],
    recentEvents: [],
    hottestCell: null,
    kpis: { cutInTotal: 0, hottestLane: '--', hottestZone: '--', dangerousRatio: '0%' },
  };
  const heatDotColor = (_value: number) => '';
  const heatDotCount = (_value: number) => 0;
  const heatBarColor = (_value: number) => '';
  const riskTone = (_risk: string) => '';


  if (viewMode === 'report') {
    return (
      <ReportPreviewPanel
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        onExportPDF={onExportPDF}
        onExportCSV={onExportCSV}
        stats={stats}
        chartData={chartData}
        vehicleComposition={vehicleComposition}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            simulationMode
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
              : 'bg-green-500/20 text-green-400 border border-green-500/30'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${simulationMode ? 'bg-purple-400' : 'bg-green-400'} animate-pulse`} />
          {simulationMode ? 'Dữ liệu thực + mô phỏng - cập nhật mỗi 5 giây' : 'Dữ liệu thực - cập nhật mỗi 5 giây'}
        </span>

        {ENABLE_ANALYTICS_HEATMAP_V2 && (
          <div className="flex flex-wrap items-center gap-2">
            {onDateChange && (
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                <Calendar className="h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => onDateChange(event.target.value)}
                  className="bg-transparent text-xs font-semibold outline-none"
                />
              </label>
            )}
            <a
              href={`?view=data-center&tab=reports${selectedDate ? `&date=${selectedDate}` : ''}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-blue-600 shadow-sm hover:bg-slate-50 hover:underline"
            >
              <FileText className="h-4 w-4 text-blue-500" />
              Xuất báo cáo
            </a>
            <button
              type="button"
              onClick={() => setAdvancedViewEnabled((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                advancedViewEnabled
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Nâng cao
              <span className={`h-2.5 w-2.5 rounded-full ${advancedViewEnabled ? 'bg-emerald-300' : 'bg-muted-foreground/40'}`} />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {[
          { id: 'traffic' as const, label: 'Tổng quan giao thông', icon: BarChart3 },
          { id: 'quality' as const, label: 'Chất lượng AI', icon: ShieldCheck },
          { id: 'smart' as const, label: 'Tìm kiếm thông minh', icon: Sparkles },
        ].map((item) => {
          const Icon = item.icon;
          const active = analysisSubtab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setAnalysisSubtab(item.id)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
                active
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      <Card className={`${analysisSubtab === 'traffic' ? '' : 'hidden'} rounded-2xl border-slate-200 bg-white p-5 shadow-sm`}>
        <div className="flex justify-between items-center mb-3 gap-3">
          <div>
            <h3 className="text-lg font-semibold">Biểu đồ xu hướng lưu lượng giao thông</h3>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Di chuột để xem chi tiết 6 vị trí</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-500 border border-green-500/25 font-semibold">
                Live
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span className="font-medium text-foreground">{selectedDate}</span>
            </div>
          </div>
        </div>
        <div className="h-[250px]">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Đang tải dữ liệu...</div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-slate-700">Chưa có dữ liệu lưu lượng trong khoảng thời gian đã chọn</p>
              <p className="mt-1 text-xs text-slate-500">Hãy chạy luồng Giám sát hoặc bật Chế độ mô phỏng để xem biểu đồ mẫu.</p>
            </div>
          ) : (
            <AdvancedAnalyticsChart data={chartData} />
          )}
        </div>
      </Card>

      <div className={`${analysisSubtab === 'traffic' ? 'grid' : 'hidden'} grid-cols-1 gap-5 lg:grid-cols-2`}>
        <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex justify-between items-center mb-2 gap-3">
            <div>
              <h3 className="text-lg font-semibold">Thống kê vi phạm</h3>
              <p className="text-xs text-muted-foreground mt-1">Di chuột vào cột để xem chi tiết phân loại</p>
            </div>
          </div>
          {loading ? (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground">Đang tải dữ liệu...</div>
          ) : !hasViolationData ? (
            <div className="flex h-[280px] flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-slate-700">Chưa ghi nhận vi phạm trong 24h gần nhất</p>
              <p className="mt-1 text-xs text-slate-500">Biểu đồ sẽ tự cập nhật khi tab Giám sát phát hiện lỗi mới.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} barCategoryGap="20%">
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#475569" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="violations" fill="url(#barGradient)" name="Vi phạm" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Biểu đồ cơ cấu xe cộ</h3>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Cập nhật 5s</span>
            </div>
          </div>
          {loading ? (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground">Đang tải biểu đồ...</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={vehicleComposition}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {vehicleComposition.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className={`${analysisSubtab === 'traffic' ? 'grid' : 'hidden'} grid-cols-1 gap-4 md:grid-cols-4`}>
        <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-2">Tổng lưu lượng</p>
          <p className="text-2xl font-bold mb-2">{loading ? '...' : stats.total_traffic.toLocaleString('vi-VN')}</p>
          <p className="text-xs text-muted-foreground">24h qua</p>
        </Card>
        <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-2">Tổng vi phạm</p>
          <p className="text-2xl font-bold text-violation-red mb-2">
            {loading ? '...' : stats.total_violations.toLocaleString('vi-VN')}
          </p>
          <p className="text-xs text-muted-foreground">24h qua</p>
        </Card>
        <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-2">Điểm nóng</p>
          <p className="text-2xl font-bold mb-2">{loading ? '...' : stats.hotspot}</p>
          <p className="text-xs text-muted-foreground">Lưu lượng cao nhất</p>
        </Card>
        <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-2">Tỷ lệ tuân thủ</p>
          <p className="text-2xl font-bold mb-2">{loading ? '...' : `${stats.compliance_rate}%`}</p>
          <p className="text-xs text-muted-foreground">Ổn định hôm nay</p>
        </Card>
      </div>

      <Card className={`${analysisSubtab === 'quality' ? '' : 'hidden'} rounded-2xl border-slate-200 bg-white p-5 shadow-sm space-y-6`}>
        <ModelMetricsPanel />

        <div className="flex flex-wrap items-start justify-between gap-3 pt-4 border-t border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h3 className="text-lg font-semibold text-slate-950">Kiểm định chất lượng AI</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Theo dõi ảnh toàn xe, crop biển/định danh, OCR và bản ghi cần kiểm tra từ dữ liệu thật trong 24 giờ gần nhất.
            </p>
          </div>
          <button
            type="button"
            onClick={runAIQualityOcrRecovery}
            disabled={aiQualityRecoveryRunning}
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {aiQualityRecoveryRunning ? 'Đang phục hồi...' : 'Phục hồi OCR'}
          </button>
          <button
            type="button"
            onClick={exportAIQualityCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Xuất kiểm định AI
          </button>
          <button
            type="button"
            onClick={exportAIQualityHtml}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <FileText className="h-4 w-4" />
            Báo cáo HTML
          </button>
        </div>

        {ocrRuntimeStatus && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Trạng thái OCR runtime</p>
                <p className="mt-1 text-xs text-slate-500">
                  Chẩn đoán chỉ đọc, không khởi tạo lại model và không can thiệp luồng tracking/crop realtime.
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  ocrRuntimeStatus.status === 'ready'
                    ? 'bg-emerald-100 text-emerald-700'
                    : ocrRuntimeStatus.status === 'degraded'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                }`}
              >
                {ocrRuntimeStatus.status === 'ready'
                  ? 'Sẵn sàng'
                  : ocrRuntimeStatus.status === 'degraded'
                    ? ocrRuntimeStatus.packages.paddleocr && ocrRuntimeStatus.paths.paddle_model_readable
                      ? 'Dự phòng hoạt động'
                      : 'Giảm cấp'
                    : 'Đang bị chặn'}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-white p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">TensorFlow</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{ocrRuntimeStatus.packages.tensorflow ? 'Có' : 'Thiếu'}</p>
              </div>
              <div className="rounded-lg bg-white p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">PaddleOCR</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{ocrRuntimeStatus.packages.paddleocr ? 'Có' : 'Thiếu'}</p>
              </div>
              <div className="rounded-lg bg-white p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">Model Paddle</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{ocrRuntimeStatus.paths.paddle_model_readable ? 'Đọc được' : 'Không đọc được'}</p>
              </div>
              <div className="rounded-lg bg-white p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">OCR gần nhất</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{ocrRuntimeStatus.stats.paddle_last_variant || 'Chưa có'}</p>
              </div>
            </div>
            {ocrRuntimeStatus.issues.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <span className="font-bold">Thông tin runtime:</span>{' '}
                {ocrRuntimeStatus.issues.map((issue) =>
                  issue === 'tensorflow_missing_for_quangnhat_ocr'
                    ? 'Thiếu TensorFlow; hệ thống đang dùng PaddleOCR dự phòng.'
                    : issue
                ).join(' ')}
              </div>
            )}
          </div>
        )}

        {aiQualityLoading ? (
          <div className="mt-5 flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
            Đang tải dữ liệu kiểm định...
          </div>
        ) : aiQualityError ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-700">
            {aiQualityError}
          </div>
        ) : aiQuality ? (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              {[
                { label: 'Ảnh toàn xe', value: aiQuality.vehicle_image.rate || 0, count: aiQuality.vehicle_image.ok || 0, tone: 'bg-emerald-500' },
                { label: 'Crop biển/định danh', value: aiQuality.plate_crop.rate || 0, count: aiQuality.plate_crop.ok || 0, tone: 'bg-sky-500' },
                { label: 'OCR/định danh', value: aiQuality.ocr.rate || 0, count: aiQuality.ocr.ok || 0, tone: 'bg-indigo-500' },
                { label: 'Cần kiểm tra', value: aiQuality.needs_review.rate || 0, count: aiQuality.needs_review.count || 0, tone: 'bg-rose-500' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                    <span className="text-xs font-bold text-slate-900">{item.value}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div className={`h-full rounded-full ${item.tone}`} style={{ width: `${Math.min(100, Math.max(0, item.value))}%` }} />
                  </div>
                  <p className="mt-3 text-2xl font-black text-slate-950">{item.count}</p>
                  <p className="text-xs text-slate-500">trên {aiQuality.total} bản ghi</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Tình trạng theo camera</p>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    cập nhật 5s
                  </span>
                </div>
                <div className="space-y-3">
                  {Object.entries(aiQuality.by_camera).length === 0 ? (
                    <p className="text-sm text-slate-500">Chưa có bản ghi trong cửa sổ dữ liệu hiện tại.</p>
                  ) : (
                    Object.entries(aiQuality.by_camera)
                      .sort(([, a], [, b]) => b.needs_review - a.needs_review)
                      .slice(0, 6)
                      .map(([cameraId, item]) => {
                        const okRate = item.total > 0 ? Math.round((item.ocr_success * 100) / item.total) : 0;
                        return (
                          <div key={cameraId} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-700">{cameraId}</span>
                              <span className="text-slate-500">
                                {item.ocr_success}/{item.total} đạt, {item.needs_review} cần xem
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${okRate}%` }} />
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-rose-500" />
                  <p className="text-sm font-semibold text-slate-900">Bản ghi cần kiểm tra gần nhất</p>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {aiQuality.recent_issues.length === 0 ? (
                    <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                      Không có lỗi crop/OCR trong cửa sổ dữ liệu hiện tại.
                    </p>
                  ) : (
                    aiQuality.recent_issues.slice(0, 8).map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900">#{item.id} · {item.camera_id}</span>
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                            {item.issues.join(', ')}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.vehicle_type || 'Không rõ loại xe'} · {item.plate_number || 'Chưa rõ biển'} · nguồn {item.plate_crop_source || 'none'}
                        </p>
                        <a
                          href={`/api/ai-quality/evidence-html/${item.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Trang bằng chứng
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      <div className={analysisSubtab === 'smart' ? '' : 'hidden'}>
        <SmartSearchPanel />
      </div>

      {analysisSubtab === 'traffic' && ENABLE_ANALYTICS_HEATMAP_V2 && advancedViewEnabled && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">Điểm nóng nhất</p>
                <MapPinned className="h-4 w-4 text-rose-500" />
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-950">
                {advancedAnalytics.hotspots[0]?.label || 'Chưa có dữ liệu'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {advancedAnalytics.hotspots[0]?.traffic || 0} {advancedAnalytics.hotspots[0]?.metricLabel || 'lượt ghi nhận'} trong 24h
              </p>
            </Card>
            <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">Khung giờ cao điểm</p>
                <TrendingUp className="h-4 w-4 text-orange-500" />
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-950">
                {advancedAnalytics.peakHour?.time || '--:--'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {advancedAnalytics.peakHour?.violations || 0} vi phạm trong khung giờ này
              </p>
            </Card>
            <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">Lỗi nổi bật</p>
                <Flame className="h-4 w-4 text-red-500" />
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-950">
                {advancedAnalytics.topViolation?.name || 'Chưa có dữ liệu'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {advancedAnalytics.topViolation?.value || 0} ?iểm thống kê trong chu kỳ
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Bản đồ nhiệt điểm nóng</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {advancedAnalytics.usesViolationHotspots
                    ? 'Màu càng nóng thể hiện camera có nhiều vi phạm hơn.'
                    : 'Ch\u01b0a c\u00f3 vi ph\u1ea1m m\u1edbi; \u0111ang hi\u1ec3n th\u1ecb nhi\u1ec7t theo l\u01b0u l\u01b0\u1ee3ng ghi nh\u1eadn.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {advancedAnalytics.hotspots.map((item) => (
                  <div
                    key={item.key}
                    className={`flex min-h-24 flex-col justify-between rounded-xl p-3 shadow-sm ${hotspotTone(item.traffic)}`}
                  >
                    <span className="text-xs font-semibold">{item.label}</span>
                    <span className="text-2xl font-black">{item.traffic}</span>
                    <span className="text-[11px] opacity-80">{item.metricLabel}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>Thấp</span>
                <span className="h-3 w-3 rounded-sm bg-emerald-100" />
                <span className="h-3 w-3 rounded-sm bg-lime-300" />
                <span className="h-3 w-3 rounded-sm bg-amber-300" />
                <span className="h-3 w-3 rounded-sm bg-orange-400" />
                <span className="h-3 w-3 rounded-sm bg-rose-500" />
                <span>Cao</span>
              </div>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Cơ cấu vi phạm nổi bật</h3>
                <p className="mt-1 text-xs text-slate-500">Giúp quản lý nhìn nhanh nhóm lỗi cần ưu tiên theo dõi.</p>
              </div>
              {advancedAnalytics.violationMix.length === 0 ? (
                <div className="flex h-[240px] items-center justify-center text-sm text-slate-500">Chưa có dữ liệu vi phạm.</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={advancedAnalytics.violationMix}
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={88}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {advancedAnalytics.violationMix.map((entry, index) => (
                        <Cell key={`violation-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <Card className="rounded-2xl border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-emerald-950">Nhận định nhanh cho người quản lý</h3>
                <p className="mt-1 text-sm leading-6 text-emerald-900">
                  {advancedAnalytics.hotspots[0]
                    ? `${advancedAnalytics.hotspots[0].label} \u0111ang c\u00f3 ${advancedAnalytics.usesViolationHotspots ? 's\u1ed1 vi ph\u1ea1m' : 'l\u01b0u l\u01b0\u1ee3ng ghi nh\u1eadn'} cao nh\u1ea5t; c\u1ea7n \u01b0u ti\u00ean quan s\u00e1t khi khung gi\u1edd ${advancedAnalytics.peakHour?.time || '--:--'} xu\u1ea5t hi\u1ec7n nhi\u1ec1u vi ph\u1ea1m.`
                    : 'Ch\u01b0a \u0111\u1ee7 d\u1eef li\u1ec7u \u0111\u1ec3 k\u1ebft lu\u1eadn \u0111i\u1ec3m n\u00f3ng trong chu k\u1ef3 hi\u1ec7n t\u1ea1i.'}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {false && ENABLE_ANALYTICS_HEATMAP_V2 && advancedViewEnabled && (
        <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Phân tích làn xe từ dữ liệu backend</h3>
              <p className="mt-1 text-sm text-slate-500">
                Heatmap, thống kê làn và cảnh báo chen làn dùng trực tiếp API trajectory/event đã lưu, không dùng dữ liệu giả từ biểu đồ tổng quan.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                camera_id
                <input
                  list="analytics-camera-id-options"
                  value={analyticsCameraId}
                  onChange={(event) => setAnalyticsCameraId(event.target.value.trim())}
                  className="h-8 w-36 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
                  placeholder="CAM_01"
                />
                <datalist id="analytics-camera-id-options">
                  {['CAM_01', 'CAM_02', 'CAM_03', 'CAM_04', 'CAM_05', 'CAM_06'].map((camera) => <option key={camera} value={camera} />)}
                </datalist>
              </label>
              {[
                { key: 'heatmap', label: 'Heatmap làn xe' },
                { key: 'stats', label: 'Thống kê làn' },
                { key: 'events', label: 'Cảnh báo chen làn' },
                { key: 'config', label: 'Cấu hình làn' },
                { key: 'diagnostics', label: 'Diagnostics' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setLaneApiView(item.key as 'heatmap' | 'stats' | 'events' | 'config' | 'diagnostics')}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    laneApiView === item.key
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-700">
            {'camera_id ph\u1ea3i kh\u1edbp v\u1edbi camera/video \u0111ang stream, n\u1ebfu kh\u00f4ng d\u1eef li\u1ec7u heatmap/stats s\u1ebd tr\u1ed1ng.'}
          </div>
          <div className="mt-4">
            {laneApiView === 'heatmap' && <LaneHeatmapPanel selectedDate={selectedDate} cameraId={analyticsCameraId || 'CAM_01'} />}
            {laneApiView === 'stats' && <LaneStatsTable selectedDate={selectedDate} cameraId={analyticsCameraId || 'CAM_01'} />}
            {laneApiView === 'events' && <CutInEventList cameraId={analyticsCameraId || 'CAM_01'} />}
            {laneApiView === 'config' && <LanePolygonEditor cameraId={analyticsCameraId || 'CAM_01'} />}
            {laneApiView === 'diagnostics' && <LaneAnalyticsDiagnostics cameraId={analyticsCameraId || 'CAM_01'} />}
          </div>
        </Card>
      )}

      {false && ENABLE_ANALYTICS_HEATMAP_V2 && advancedViewEnabled && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-lg border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 text-white">
                  <ArrowRightLeft className="h-5 w-5" />
                </span>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-500">Hôm nay</p>
                  <p className="mt-1 text-3xl font-black leading-none text-slate-950">{laneAnalytics.kpis.cutInTotal}</p>
                </div>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700">Tổng sự kiện cut-in</p>
              <p className="mt-1 text-xs font-semibold text-emerald-600">↑ 18.6% so với hôm qua</p>
            </Card>

            <Card className="rounded-lg border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500 text-white">
                  <Flame className="h-5 w-5" />
                </span>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-500">Hôm nay</p>
                  <p className="mt-1 text-3xl font-black leading-none text-slate-950">{laneAnalytics.kpis.hottestLane}</p>
                </div>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700">Làn nóng nhất</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">286 sự kiện</p>
            </Card>

            <Card className="rounded-lg border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500 text-white">
                  <Radar className="h-5 w-5" />
                </span>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-500">Hôm nay</p>
                  <p className="mt-1 text-3xl font-black leading-none text-slate-950">{laneAnalytics.kpis.hottestZone}</p>
                </div>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700">Đoạn đường nóng nhất</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">362 sự kiện</p>
            </Card>

            <Card className="rounded-lg border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400 text-white">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-500">Hôm nay</p>
                  <p className="mt-1 text-3xl font-black leading-none text-slate-950">{laneAnalytics.kpis.dangerousRatio}</p>
                </div>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700">Tỉ lệ chuyển làn nguy hiểm</p>
              <p className="mt-1 text-xs font-semibold text-rose-600">↑ 6.2% so với hôm qua</p>
            </Card>
          </div>

          <div className="hidden">
            <Card className="rounded-2xl border-slate-900 bg-slate-950 p-4 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/60">Tổng sự kiện cut-in</p>
                  <p className="mt-2 text-2xl font-bold">{laneAnalytics.kpis.cutInTotal}</p>
                </div>
                <ArrowRightLeft className="h-8 w-8 text-amber-300" />
              </div>
              <p className="mt-3 text-xs text-white/70">Tổng hợp từ cặp làn nóng và tín hiệu chuyển làn nguy hiểm.</p>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Làn nóng nhất</p>
                  <p className="mt-2 text-2xl font-bold">{laneAnalytics.kpis.hottestLane}</p>
                </div>
                <Flame className="h-8 w-8 text-orange-500" />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Làn có mật độ sự kiện giao cắt và chèn làn cao nhất.</p>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Đoạn đường nóng nhất</p>
                  <p className="mt-2 text-2xl font-bold">{laneAnalytics.kpis.hottestZone}</p>
                </div>
                <Radar className="h-8 w-8 text-sky-500" />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Vùng nên ưu tiên thuyết minh khi demo với giảng viên.</p>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tỉ lệ chuyển làn nguy hiểm</p>
                  <p className="mt-2 text-2xl font-bold">{laneAnalytics.kpis.dangerousRatio}</p>
                </div>
                <ShieldAlert className="h-8 w-8 text-rose-500" />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Tỉ lệ sự kiện được xếp vào nhóm cảnh báo trong khung giờ hiện tại.</p>
            </Card>
          </div>

          <Card className="overflow-hidden rounded-lg border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-bold text-slate-950">Heatmap Theo Làn Và Đoạn Đường</h3>
              <div className="flex items-center gap-2 text-xs">
                <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">Hôm nay</button>
                <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">Tất cả camera</button>
              </div>
            </div>
            <div className="grid gap-4 p-4 xl:grid-cols-[1fr_72px]">
              <div className="space-y-2">
                <div className="grid grid-cols-[64px_repeat(4,minmax(0,1fr))] gap-1.5 text-xs font-bold text-slate-700">
                  <div />
                  {laneAnalytics.zones.map((zone) => (
                    <div key={zone} className="text-center">{zone}</div>
                  ))}
                </div>
                {laneAnalytics.heatmap.map((row) => (
                  <div key={row.lane} className="grid grid-cols-[64px_repeat(4,minmax(0,1fr))] items-center gap-1.5">
                    <div className="text-xs font-bold text-slate-700">{row.lane}</div>
                    {row.values.map((cell) => (
                      <div
                        key={`${row.lane}-${cell.zone}`}
                        className={`h-7 rounded-sm bg-gradient-to-r ${heatBarColor(cell.value)}`}
                        title={`${row.lane} - ${cell.zone}: ${cell.value}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 xl:block">
                <div className="text-xs font-bold text-slate-700 xl:text-center">Số sự kiện</div>
                <div className="mt-1 h-24 w-4 rounded-sm bg-gradient-to-b from-red-500 via-yellow-300 to-emerald-400 xl:mx-auto" />
                <div className="grid h-24 content-between text-[10px] font-semibold text-slate-500 xl:mt-1">
                  <span>300</span>
                  <span>225</span>
                  <span>150</span>
                  <span>75</span>
                  <span>0</span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="hidden overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Heatmap theo làn và đoạn đường</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Trục dọc là làn xe, trục ngang là từng đoạn giao cắt. Màu càng nóng thì mật độ cut-in càng cao.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-right">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Vùng nóng hiện tại</p>
                  <p className="text-xl font-semibold">{laneAnalytics.kpis.hottestLane} / {laneAnalytics.kpis.hottestZone}</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="overflow-x-auto">
                <div className="min-w-[860px] rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-[96px_repeat(4,minmax(0,1fr))] gap-3 text-sm">
                    <div className="flex items-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Làn xe
                    </div>
                    {laneAnalytics.zones.map((zone) => (
                      <div key={zone} className="rounded-xl bg-white px-3 py-2 text-center font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                        {zone}
                      </div>
                    ))}
                    {laneAnalytics.heatmap.map((row) => (
                      <React.Fragment key={row.lane}>
                        <div className="flex items-center rounded-xl bg-slate-900 px-3 py-4 font-semibold text-white shadow-sm">
                          {row.lane}
                        </div>
                        {row.values.map((cell) => (
                          <div
                            key={`${row.lane}-${cell.zone}`}
                            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-transform hover:-translate-y-0.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{cell.zone}</div>
                                <div className="mt-1 text-xl font-bold text-slate-950">{cell.value}</div>
                              </div>
                              <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                                {Math.round((cell.value / laneAnalytics.maxHeat) * 100)}%
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-6 gap-1.5">
                              {Array.from({ length: heatDotCount(cell.value) }).map((_, dotIndex) => (
                                <span
                                  key={`${row.lane}-${cell.zone}-${dotIndex}`}
                                  className={`h-2.5 w-2.5 rounded-full shadow-sm ${heatDotColor(cell.value)}`}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
                <span className="text-slate-400">Cấp độ nhiệt:</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-300" /> Thấp</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-lime-400" /> Vừa</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Cao</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Rất cao</span>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_0.95fr]">
            <Card className="rounded-lg border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-bold text-slate-950">Sơ Đồ Chuyển Làn / Cut-in</h3>
              <div className="mt-4 rounded-lg bg-white">
                <div className="grid grid-cols-[58px_1fr] gap-3">
                  <div className="space-y-3">
                    {laneAnalytics.lanes.map((lane) => (
                      <div key={lane} className="flex h-8 items-center justify-center rounded-md bg-blue-500 text-xs font-bold text-white">
                        {lane}
                      </div>
                    ))}
                  </div>
                  <svg viewBox="0 0 620 150" className="h-[150px] w-full">
                    <defs>
                      <marker id="arrowRed" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                        <path d="M0,0 L8,4 L0,8 Z" fill="#ef4444" />
                      </marker>
                      <marker id="arrowOrange" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                        <path d="M0,0 L8,4 L0,8 Z" fill="#f97316" />
                      </marker>
                      <marker id="arrowYellow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                        <path d="M0,0 L8,4 L0,8 Z" fill="#eab308" />
                      </marker>
                    </defs>
                    {[18, 54, 90, 126].map((y) => (
                      <line key={y} x1="0" y1={y} x2="610" y2={y} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="14 10" />
                    ))}
                    <path d="M40 54 C130 20, 210 22, 275 54" fill="none" stroke="#ef4444" strokeWidth="3" markerEnd="url(#arrowRed)" />
                    <text x="160" y="43" fill="#ef4444" fontSize="13" fontWeight="700">{laneAnalytics.pairStats[0]?.count || 86}</text>
                    <path d="M280 54 C350 20, 420 18, 505 54" fill="none" stroke="#ef4444" strokeWidth="2.5" markerEnd="url(#arrowRed)" />
                    <text x="392" y="43" fill="#ef4444" fontSize="13" fontWeight="700">{laneAnalytics.pairStats[1]?.count || 41}</text>
                    <path d="M72 90 C130 58, 180 55, 245 90" fill="none" stroke="#f97316" strokeWidth="2.5" markerEnd="url(#arrowOrange)" />
                    <text x="145" y="82" fill="#f97316" fontSize="12" fontWeight="700">{laneAnalytics.pairStats[2]?.count || 22}</text>
                    <path d="M310 90 C390 58, 460 58, 560 90" fill="none" stroke="#f97316" strokeWidth="2.2" markerEnd="url(#arrowOrange)" />
                    <text x="460" y="82" fill="#f97316" fontSize="12" fontWeight="700">{laneAnalytics.pairStats[3]?.count || 11}</text>
                    <path d="M110 126 C170 102, 230 102, 290 126" fill="none" stroke="#eab308" strokeWidth="1.8" markerEnd="url(#arrowYellow)" />
                    <path d="M430 126 C490 104, 535 104, 595 126" fill="none" stroke="#eab308" strokeWidth="1.8" markerEnd="url(#arrowYellow)" />
                  </svg>
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-6 text-xs font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-2"><i className="h-0.5 w-8 bg-red-500" /> Nguy hiểm cao</span>
                  <span className="inline-flex items-center gap-2"><i className="h-0.5 w-8 bg-orange-500" /> Nguy hiểm trung bình</span>
                  <span className="inline-flex items-center gap-2"><i className="h-0.5 w-8 bg-yellow-500" /> Nguy hiểm thấp</span>
                </div>
              </div>
            </Card>

            <Card className="rounded-lg border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold text-slate-950">Cặp Làn Nóng & Vùng Nguy Hiểm</h3>
                <div className="flex items-center gap-2 text-xs">
                  <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">Hôm nay</button>
                  <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">Tất cả camera</button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1fr_82px]">
                <table className="w-full text-xs">
                  <thead className="text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-2 text-left">Cặp làn</th>
                      <th className="py-2 text-right">Số sự kiện</th>
                      <th className="py-2 text-right">Xu hướng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laneAnalytics.pairStats.map((pair, index) => (
                      <tr key={`${pair.from}-${pair.to}`} className="border-b border-slate-100">
                        <td className="py-2 font-bold text-slate-800">{pair.from.replace('Làn ', '')} → {pair.to.replace('Làn ', '')}</td>
                        <td className="py-2 text-right font-bold text-slate-800">{pair.count}</td>
                        <td className={`py-2 text-right font-bold ${pair.risk === 'Cao' ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {pair.risk === 'Cao' ? '↑' : index % 2 ? '↑' : '↓'} {pair.risk === 'Cao' ? '24%' : `${Math.max(2, 16 - index * 4)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div>
                  <div className="mb-2 text-center text-xs font-bold text-slate-700">Bản đồ vùng nguy hiểm</div>
                  <div className="relative h-32 overflow-hidden rounded-md bg-slate-200">
                    <div className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 bg-slate-100" />
                    <div className="absolute inset-y-0 left-1/2 w-8 -translate-x-1/2 bg-slate-100" />
                    <div
                      className="absolute left-1/2 top-1/2 h-24 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full blur-sm"
                      style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.95) 0%, rgba(251,146,60,0.75) 45%, rgba(254,240,138,0.18) 72%, rgba(254,240,138,0) 100%)' }}
                    />
                    <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600" />
                  </div>
                </div>
                <div className="flex flex-col justify-center gap-3 text-xs font-semibold text-slate-600">
                  <span>Mức độ</span>
                  <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-red-500" /> Cao</span>
                  <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-yellow-400" /> Trung bình</span>
                  <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-green-400" /> Thấp</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="hidden">
            <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Sơ đồ hành vi chèn làn / cut-in</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Các làn xe được xếp theo tầng; mũi tên màu nóng thể hiện luồng chuyển làn có rủi ro cao.
                  </p>
                </div>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                  Theo làn
                </span>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white">
                <div className="relative overflow-hidden rounded-xl bg-slate-900/80 p-3">
                  {laneAnalytics.lanes.map((lane, laneIndex) => (
                    <div key={lane} className="relative flex h-16 items-center border-b border-dashed border-white/15 last:border-b-0">
                      <div className="w-20 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">{lane}</div>
                      <div className="h-px flex-1 bg-white/12" />
                      <div className="ml-3 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">
                        {laneAnalytics.heatmap[laneIndex]?.values.reduce((acc, item) => acc + item.value, 0)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-2">
                  {laneAnalytics.pairStats.map((pair, index) => (
                    <div
                      key={`${pair.from}-${pair.to}`}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
                        pair.risk === 'Cao'
                          ? 'border-rose-400/40 bg-rose-500/15'
                          : pair.risk.startsWith('Trung')
                            ? 'border-amber-300/35 bg-amber-400/12'
                            : 'border-white/15 bg-white/10'
                      }`}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                        {index + 1}
                      </span>
                      <span className="min-w-[64px] text-xs font-semibold uppercase tracking-[0.14em] text-white/70">{pair.from}</span>
                      <div className={`h-2 flex-1 rounded-full ${
                        pair.risk === 'Cao'
                          ? 'bg-gradient-to-r from-rose-400 via-orange-300 to-yellow-200'
                          : pair.risk.startsWith('Trung')
                            ? 'bg-gradient-to-r from-amber-300 via-yellow-200 to-white/50'
                            : 'bg-gradient-to-r from-slate-300 to-white/30'
                      }`} />
                      <ArrowRightLeft className="h-4 w-4 shrink-0 text-white/80" />
                      <span className="min-w-[64px] text-right text-xs font-semibold uppercase tracking-[0.14em] text-white/80">{pair.to}</span>
                      <span className="rounded-full bg-black/30 px-2.5 py-1 text-xs font-bold">{pair.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">Cặp làn nóng và vùng nguy hiểm</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Tập trung vào cặp làn có nhiều hành vi tạt đầu, chuyển làn gấp và vùng giao cắt cần theo dõi.
              </p>

              <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-500">Vùng nguy hiểm nhất</div>
                <div className="mt-2 text-xl font-bold text-rose-700">{laneAnalytics.kpis.hottestLane} / {laneAnalytics.kpis.hottestZone}</div>
                <div className="mt-1 text-sm text-rose-600">Tỉ lệ rủi ro {laneAnalytics.kpis.dangerousRatio}</div>
              </div>

              <div className="mt-4 space-y-3">
                {laneAnalytics.pairStats.map((pair, index) => (
                  <div key={`${pair.from}-${pair.to}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">#{index + 1} cặp làn nổi bật</div>
                        <div className="mt-1 text-base font-semibold">{pair.from} → {pair.to}</div>
                      </div>
                      <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskTone(pair.risk)}`}>
                        {pair.risk}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Số sự kiện</span>
                      <span className="font-semibold">{pair.count}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className={`h-full rounded-full ${
                          pair.risk === 'Cao'
                            ? 'bg-gradient-to-r from-rose-500 to-orange-400'
                            : pair.risk.startsWith('Trung')
                              ? 'bg-gradient-to-r from-amber-400 to-yellow-300'
                              : 'bg-gradient-to-r from-slate-400 to-slate-300'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(22, pair.count * 3.5))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="hidden">
            <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Sơ đồ chuyển làn / cut-in</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Mũi tên dày và màu nóng biểu diễn chiều chuyển làn có nguy cơ cao hơn.
                  </p>
                </div>
                <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600">
                  Bố cục mới
                </span>
              </div>

              <div className="mt-6 space-y-4">
                {laneAnalytics.lanes.map((lane, laneIndex) => (
                  <div key={lane} className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 px-4 py-5 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-white/50">Lưu lượng quan sát</div>
                        <div className="mt-1 text-2xl font-semibold">{lane}</div>
                      </div>
                      <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold">
                        {laneAnalytics.heatmap[laneIndex]?.values.reduce((acc, item) => acc + item.value, 0)}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-2">
                      {laneAnalytics.pairStats
                        .filter((pair) => pair.from === lane || pair.to === lane)
                        .map((pair) => (
                          <div
                            key={`${pair.from}-${pair.to}`}
                            className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${
                              pair.risk === 'Cao'
                                ? 'border-rose-400/40 bg-rose-500/15'
                                : pair.risk === 'Trung bình'
                                  ? 'border-amber-300/35 bg-amber-400/12'
                                  : 'border-white/15 bg-white/10'
                            }`}
                          >
                            <div className="min-w-[72px] text-xs font-semibold uppercase tracking-[0.14em] text-white/65">
                              {pair.from}
                            </div>
                            <div className={`h-1 flex-1 rounded-full ${
                              pair.risk === 'Cao'
                                ? 'bg-gradient-to-r from-rose-300 via-orange-300 to-transparent'
                                : pair.risk === 'Trung bình'
                                  ? 'bg-gradient-to-r from-amber-200 via-yellow-200 to-transparent'
                                  : 'bg-gradient-to-r from-slate-300 via-slate-200 to-transparent'
                            }`} />
                            <ArrowRightLeft className="h-4 w-4 shrink-0 text-white/80" />
                            <div className="min-w-[72px] text-right text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
                              {pair.to}
                            </div>
                            <div className="rounded-full bg-black/25 px-2 py-1 text-xs font-bold">
                              {pair.count}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">Cặp làn nóng và vùng nguy hiểm</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Xếp hạng nhanh để giải thích xe chèn từ làn nào sang làn nào.
              </p>

              <div className="mt-5 space-y-3">
                {laneAnalytics.pairStats.map((pair, index) => (
                  <div key={`${pair.from}-${pair.to}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">#{index + 1} cặp làn nổi bật</div>
                        <div className="mt-1 text-base font-semibold">{pair.from} → {pair.to}</div>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        pair.risk === 'Cao'
                          ? 'bg-rose-500/15 text-rose-600'
                          : pair.risk === 'Trung bình'
                            ? 'bg-amber-500/15 text-amber-700'
                            : 'bg-slate-500/15 text-slate-700'
                      }`}>
                        {pair.risk}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Số sự kiện</span>
                      <span className="font-semibold">{pair.count}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${
                          pair.risk === 'Cao'
                            ? 'bg-gradient-to-r from-rose-500 to-orange-400'
                            : pair.risk === 'Trung bình'
                              ? 'bg-gradient-to-r from-amber-400 to-yellow-300'
                              : 'bg-gradient-to-r from-slate-400 to-slate-300'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(22, pair.count * 3.5))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold">Sự kiện chèn làn gần nhất</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bảng sự kiện giúp đối chiếu heatmap và luồng mũi tên bằng dữ liệu có thể giải thích được.
                </p>
              </div>
              <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground">
                Cập nhật đồng bộ cùng dữ liệu biểu đồ
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/30 text-left">
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 font-semibold">Thời gian</th>
                    <th className="px-5 py-3 font-semibold">Camera</th>
                    <th className="px-5 py-3 font-semibold">Từ làn</th>
                    <th className="px-5 py-3 font-semibold">Sang làn</th>
                    <th className="px-5 py-3 font-semibold">Mức nguy hiểm</th>
                    <th className="px-5 py-3 font-semibold">Vị trí</th>
                  </tr>
                </thead>
                <tbody>
                  {laneAnalytics.recentEvents.map((event) => (
                    <tr key={event.id} className="border-b border-border/70">
                      <td className="px-5 py-3 font-medium">{event.time}</td>
                      <td className="px-5 py-3 text-muted-foreground">{event.camera}</td>
                      <td className="px-5 py-3">{event.fromLane}</td>
                      <td className="px-5 py-3">{event.toLane}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          event.severity === 'Cao'
                            ? 'bg-rose-500/15 text-rose-600'
                            : event.severity === 'Trung bình'
                              ? 'bg-amber-500/15 text-amber-700'
                              : 'bg-slate-500/15 text-slate-700'
                        }`}>
                          {event.severity}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{event.zone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
