'use client';

import React, { useMemo, useState } from 'react';
import { Calendar, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/AuthContext';

interface ReportPreviewPanelProps {
  selectedDate: string;
  onDateChange?: (date: string) => void;
  onExportPDF?: () => void;
  onExportCSV?: () => void;
  stats: {
    total_traffic: number;
    total_violations: number;
    compliance_rate: number;
    hotspot: string;
  };
  chartData: any[];
  vehicleComposition: any[];
}

export default function ReportPreviewPanel({
  selectedDate,
  onDateChange,
  onExportPDF,
  onExportCSV,
  stats,
  chartData,
  vehicleComposition,
}: ReportPreviewPanelProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [previewType, setPreviewType] = useState<'pdf' | 'csv'>('pdf');

  const previewRows = useMemo(() => {
    const source = chartData.length > 0 ? chartData : [
      { time: '07:00', violations: 12, baTrier: 86, langHa: 64, tayHo: 42 },
      { time: '08:00', violations: 18, baTrier: 112, langHa: 79, tayHo: 51 },
      { time: '09:00', violations: 9, baTrier: 73, langHa: 58, tayHo: 38 },
      { time: '10:00', violations: 7, baTrier: 61, langHa: 47, tayHo: 33 },
      { time: '11:00', violations: 14, baTrier: 94, langHa: 70, tayHo: 45 },
    ];

    const vehicleTypes = ['Xe máy', 'Ô tô', 'Xe tải', 'Xe buýt'];
    const cameras = ['CAM_01', 'CAM_02', 'CAM_03', 'CAM_04'];
    const violations = ['Không', 'Vượt đèn đỏ', 'Sai làn', 'Quá tốc độ'];

    return source.slice(-8).map((row, index) => ({
      stt: index + 1,
      time: row.time || '--:--',
      id: `TRF-${String(index + 1).padStart(4, '0')}`,
      vehicleType: vehicleTypes[index % vehicleTypes.length],
      plate: index % 3 === 0 ? '30E-499.27' : index % 3 === 1 ? '30H-727.13' : 'Đang đọc',
      confidence: `${Math.min(99, 82 + index * 2)}%`,
      camera: cameras[index % cameras.length],
      violation: violations[index % violations.length],
      traffic: (row.baTrier || 0) + (row.langHa || 0) + (row.tayHo || 0) + (row.nguyenHue || 0),
      violations: row.violations || 0,
    }));
  }, [chartData]);

  const totalVehicles = stats.total_traffic || previewRows.reduce((sum, row) => sum + row.traffic, 0);

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Báo cáo và xuất file</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Xem trước báo cáo theo ngày</h2>
            <p className="mt-1 text-sm text-slate-500">
              Chọn ngày, chọn loại preview, xem trước ngay trong trang rồi xuất file khi cần.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onDateChange && (
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                <Calendar className="h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => onDateChange(event.target.value)}
                  className="bg-transparent text-sm outline-none"
                />
              </label>
            )}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setPreviewType('pdf')}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  previewType === 'pdf' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
                }`}
              >
                <FileText className="h-4 w-4" />
                PDF
              </button>
              <button
                type="button"
                onClick={() => setPreviewType('csv')}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  previewType === 'csv' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
                }`}
              >
                <FileSpreadsheet className="h-4 w-4" />
                CSV
              </button>
            </div>
            {isAdmin && onExportPDF && (
              <button
                type="button"
                onClick={onExportPDF}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Download className="h-4 w-4" />
                Xuất PDF
              </button>
            )}
            {isAdmin && onExportCSV && (
              <button
                type="button"
                onClick={onExportCSV}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Xuất CSV
              </button>
            )}
          </div>
        </div>
      </Card>

      {previewType === 'pdf' ? (
        <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-base font-semibold text-slate-950">Xem trước PDF</h3>
            <p className="mt-1 text-sm text-slate-500">Bố cục mô phỏng trang báo cáo trước khi xuất file.</p>
          </div>
          <div className="bg-slate-100 p-4">
            <div className="mx-auto max-w-[860px] overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="bg-slate-950 px-6 py-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <img src="/favicon.png" alt="TrafficAI" className="h-12 w-12 rounded-xl bg-white p-1.5" />
                    <div>
                      <h3 className="text-xl font-black tracking-wide">BAO CAO GIAM SAT GIAO THONG</h3>
                      <p className="mt-1 text-sm text-slate-300">Smart Traffic Monitoring System</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold">PDF</span>
                </div>
              </div>

              <div className="p-5">
                <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="text-sm font-black uppercase tracking-[0.18em] text-slate-700">THONG TIN BAO CAO</h4>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                      Hệ thống trực tuyến
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                      <p className="text-xs font-semibold text-slate-500">Ngày xuất</p>
                      <p className="mt-2 text-base font-bold text-slate-950">{selectedDate}</p>
                    </div>
                    <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                      <p className="text-xs font-semibold text-slate-500">Tổng phương tiện</p>
                      <p className="mt-2 text-base font-bold text-slate-950">{totalVehicles.toLocaleString('vi-VN')}</p>
                    </div>
                    <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                      <p className="text-xs font-semibold text-slate-500">Hệ thống đang dùng</p>
                      <p className="mt-2 text-base font-bold text-slate-950">YOLO + ALPR</p>
                    </div>
                    <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                      <p className="text-xs font-semibold text-slate-500">Trạng thái</p>
                      <p className="mt-2 text-base font-bold text-emerald-700">Hoạt động</p>
                    </div>
                  </div>
                </section>

                <section className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <div className="bg-slate-100 px-5 py-3">
                    <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-600">Dữ liệu xem trước</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-950 text-left text-xs uppercase text-white">
                        <tr>
                          <th className="px-4 py-3">STT</th>
                          <th className="px-4 py-3">Thời Gian</th>
                          <th className="px-4 py-3">ID</th>
                          <th className="px-4 py-3">Loại Xe</th>
                          <th className="px-4 py-3">Biển Số</th>
                          <th className="px-4 py-3">Tin Cậy</th>
                          <th className="px-4 py-3">Camera</th>
                          <th className="px-4 py-3">Vi Phạm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row) => (
                          <tr key={row.id} className="border-t border-slate-200">
                            <td className="px-4 py-3 font-semibold">{row.stt}</td>
                            <td className="px-4 py-3">{row.time}</td>
                            <td className="px-4 py-3 font-mono text-xs">{row.id}</td>
                            <td className="px-4 py-3">{row.vehicleType}</td>
                            <td className="px-4 py-3 font-semibold">{row.plate}</td>
                            <td className="px-4 py-3">{row.confidence}</td>
                            <td className="px-4 py-3">{row.camera}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                row.violation === 'Không'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}>
                                {row.violation}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-base font-semibold text-slate-950">Xem trước CSV</h3>
            <p className="mt-1 text-sm text-slate-500">Dữ liệu dạng bảng, có thể đối chiếu nhanh trước khi xuất CSV.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">STT</th>
                  <th className="px-5 py-3">Thời Gian</th>
                  <th className="px-5 py-3">ID</th>
                  <th className="px-5 py-3">Loại Xe</th>
                  <th className="px-5 py-3">Biển Số</th>
                  <th className="px-5 py-3">Tin Cậy</th>
                  <th className="px-5 py-3">Camera</th>
                  <th className="px-5 py-3">Vi Phạm</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={`${row.id}-csv`} className="border-t border-slate-200">
                    <td className="px-5 py-3 font-semibold">{row.stt}</td>
                    <td className="px-5 py-3">{row.time}</td>
                    <td className="px-5 py-3 font-mono text-xs">{row.id}</td>
                    <td className="px-5 py-3">{row.vehicleType}</td>
                    <td className="px-5 py-3 font-semibold">{row.plate}</td>
                    <td className="px-5 py-3">{row.confidence}</td>
                    <td className="px-5 py-3">{row.camera}</td>
                    <td className="px-5 py-3 text-slate-600">{row.violation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
