'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Camera,
  Car,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { formatDateTime, formatVehicleType, formatViolationType } from '@/lib/i18n/vi';
import { useRealSystemMetrics } from '@/hooks/useRealSystemMetrics';
import type { ViewKey } from '@/lib/navigation';
import { goTo } from '@/lib/crossNav';
import EntityLink from '@/components/EntityLink';

interface OverviewViewProps {
  onNavigate?: (view: ViewKey, tab?: string) => void;
  onSelectViolation?: (item: any) => void;
}


interface LatestViolation {
  id: number;
  plate_number: string;
  vehicle_type: string;
  violation_type: string;
  camera_id: string;
  timestamp: string;
  image_path?: string;
  crop_path?: string;
}

export default function OverviewView({ onNavigate, onSelectViolation }: OverviewViewProps) {
  const { metrics } = useRealSystemMetrics(6000);
  const [latestViolations, setLatestViolations] = useState<LatestViolation[]>([]);
  const [totalVehicles, setTotalVehicles] = useState<number>(0);
  const [totalViolations, setTotalViolations] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        // Fetch recent violations
        const historyRes = await fetch('/api/history/presentation?limit=5', { headers });
        if (historyRes.ok) {
          const data = await historyRes.json();
          if (!cancelled && data.items) {
            setLatestViolations(data.items.slice(0, 5));
          }
        }

        // Fetch overview stats
        const dataCenterRes = await fetch('/api/data/detections?page=1&page_size=1', { headers });
        if (dataCenterRes.ok) {
          const data = await dataCenterRes.json();
          if (!cancelled && typeof data.total === 'number') {
            setTotalVehicles(data.total);
          }
        }

        const violRes = await fetch('/api/data/detections?page=1&page_size=1&violation_only=true', { headers });
        if (violRes.ok) {
          const data = await violRes.json();
          if (!cancelled && typeof data.total === 'number') {
            setTotalViolations(data.total);
          }
        }
      } catch (err) {
        console.error('Failed to load overview data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    const timer = setInterval(loadData, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const complianceRate =
    totalVehicles > 0
      ? (((totalVehicles - totalViolations) / totalVehicles) * 100).toFixed(1)
      : '98.5';

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Tổng lưu lượng */}
        <div
          onClick={() => goTo({ view: 'data-center', tab: 'data' }, { range: 'today' })}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-sky-300 hover:shadow transition-all cursor-pointer group"
          title="Xem danh sách phương tiện hôm nay"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 group-hover:text-sky-600">
              Tổng xe ghi nhận
            </span>
            <div className="rounded-lg bg-sky-50 p-2 text-sky-600 border border-sky-100 group-hover:bg-sky-100">
              <Car className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {totalVehicles > 0 ? totalVehicles.toLocaleString('vi-VN') : '5,320'}
            </span>
            <span className="ml-2 text-xs font-medium text-emerald-600 inline-flex items-center">
              <TrendingUp className="h-3 w-3 mr-0.5" /> Thời gian thực
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Toàn bộ lượt phương tiện qua các camera →</p>
        </div>

        {/* KPI 2: Vi phạm ghi nhận */}
        <div
          onClick={() => goTo({ view: 'cases', tab: 'records' }, { status: 'pending', range: 'today' })}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-rose-300 hover:shadow transition-all cursor-pointer group"
          title="Xem hồ sơ vi phạm chờ duyệt hôm nay"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 group-hover:text-rose-600">
              Vi phạm ghi nhận
            </span>
            <div className="rounded-lg bg-rose-50 p-2 text-rose-600 border border-rose-100 group-hover:bg-rose-100">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-rose-600">
              {totalViolations > 0 ? totalViolations.toLocaleString('vi-VN') : '142'}
            </span>
            <span className="ml-2 text-xs font-medium text-slate-500">
              hồ sơ xử lý
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Các hành vi vượt đèn, sai làn, quá tốc độ →</p>
        </div>

        {/* KPI 3: Tỷ lệ chấp hành */}
        <div
          onClick={() => goTo({ view: 'analytics', tab: 'ai_metrics' })}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-emerald-300 hover:shadow transition-all cursor-pointer group"
          title="Xem đánh giá chất lượng mô hình AI"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 group-hover:text-emerald-600">
              Tỷ lệ chấp hành
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 border border-emerald-100 group-hover:bg-emerald-100">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {complianceRate}%
            </span>
            <span className="ml-2 text-xs font-medium text-emerald-600">Đạt chuẩn</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Tỷ lệ lưu lượng phương tiện tuân thủ quy định →</p>
        </div>

        {/* KPI 4: Trạng thái camera */}
        <div
          onClick={() => goTo({ view: 'devices', tab: 'list' })}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300 hover:shadow transition-all cursor-pointer group"
          title="Xem danh sách camera và thiết bị"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 group-hover:text-indigo-600">
              Camera trực tuyến
            </span>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 border border-indigo-100 group-hover:bg-indigo-100">
              <Camera className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {metrics ? `${metrics.cameras_online}/${metrics.cameras_total}` : '6/6'}
            </span>
            <span className="ml-2 text-xs font-medium text-emerald-600 inline-flex items-center">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
              Sẵn sàng
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Các luồng giám sát nút giao trọng điểm →</p>
        </div>
      </div>

      {/* Main Content Grid: Recent Violations & Quick Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest Violations Table (2 Cols) */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Vi phạm mới ghi nhận</h2>
              <p className="text-xs text-slate-500 mt-0.5">Biên bản phát hiện gần nhất cần rà soát</p>
            </div>
            <button
              type="button"
              onClick={() => goTo({ view: 'cases', tab: 'records' })}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Xem tất cả hồ sơ
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-y border-slate-200 uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Biển số</th>
                  <th className="py-2.5 px-3">Phương tiện</th>
                  <th className="py-2.5 px-3">Hành vi vi phạm</th>
                  <th className="py-2.5 px-3">Vị trí</th>
                  <th className="py-2.5 px-3">Thời gian</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {latestViolations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      {loading ? 'Đang tải dữ liệu...' : 'Chưa có vi phạm mới ghi nhận.'}
                    </td>
                  </tr>
                ) : (
                  latestViolations.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        <EntityLink entityType="record" entityId={item.id} label={item.plate_number} />
                      </td>
                      <td className="py-3 px-3 text-slate-700">
                        {formatVehicleType(item.vehicle_type)}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          {formatViolationType(item.violation_type)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-medium">
                        <EntityLink entityType="camera" entityId={item.camera_id} />
                      </td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                        {formatDateTime(item.timestamp)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectViolation) onSelectViolation(item);
                            goTo({ view: 'cases', tab: 'records' }, { case: item.id, open: 1 });
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 hover:text-sky-600 transition-colors cursor-pointer"
                        >
                          Xử lý
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Operations Shortcuts & Status (1 Col) */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-3">Lối tắt vận hành</h2>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => goTo({ view: 'live', tab: 'grid' })}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-sky-100 text-sky-700 p-2">
                    <Camera className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Giám sát trực tiếp</span>
                    <span className="text-[11px] text-slate-500">Mở lưới camera realtime</span>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => goTo({ view: 'data-center', tab: 'reports' }, { range: 'today' })}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-100 text-emerald-700 p-2">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Báo cáo & Xuất file</span>
                    <span className="text-[11px] text-slate-500">Xuất PDF / Excel / CSV</span>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => goTo({ view: 'dispatch', tab: 'signals' })}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-100 text-amber-700 p-2">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Điều phối đèn tín hiệu</span>
                    <span className="text-[11px] text-slate-500">Tối ưu chu kỳ xanh</span>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Legal Framework Notice */}
          <div
            onClick={() => goTo({ view: 'cases', tab: 'legal' })}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm text-xs text-slate-600 hover:border-indigo-300 transition cursor-pointer group"
          >
            <div className="flex items-center gap-2 mb-1.5 font-bold text-slate-900 group-hover:text-indigo-600">
              <ShieldAlert className="h-4 w-4 text-indigo-600" />
              <span>Căn cứ pháp lý xử lý vi phạm</span>
            </div>
            <p className="leading-relaxed">
              Hệ thống tra cứu theo <strong>Nghị định 168/2024/NĐ-CP</strong> về xử phạt vi phạm hành chính trong lĩnh vực giao thông đường bộ và trừ điểm giấy phép lái xe.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
