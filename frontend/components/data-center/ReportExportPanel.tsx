'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Filter,
  Eye,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Loader2,
  Info,
} from 'lucide-react';
import { fetchSummaryKPI, fetchCameras } from './api';

interface ReportExportPanelProps {
  selectedDate: string;
  onDateChange?: (date: string) => void;
  onExportPDF?: () => void;
  addToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export default function ReportExportPanel({
  selectedDate,
  onDateChange,
  onExportPDF,
  addToast,
}: ReportExportPanelProps) {
  // Bộ lọc
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateFrom, setDateFrom] = useState(selectedDate || todayStr);
  const [dateTo, setDateTo] = useState(selectedDate || todayStr);
  const [selectedCamera, setSelectedCamera] = useState('all');
  const [onlyViolations, setOnlyViolations] = useState(false);
  const [cameras, setCameras] = useState<string[]>([]);

  // Định dạng xuất: 'pdf' | 'csv' | 'xlsx'
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv' | 'xlsx'>('pdf');

  // Tùy chọn nội dung xuất
  const [pdfOptions, setPdfOptions] = useState({
    summary: true,
    charts: true,
    details: true,
    evidenceImages: true,
    signatures: true,
  });
  const [csvPlain, setCsvPlain] = useState(false);
  const [excelIncludeImages, setExcelIncludeImages] = useState(false);

  // Tab mô phỏng Excel
  const [excelActiveSheet, setExcelActiveSheet] = useState<'summary' | 'detail' | 'notes'>('summary');

  // Dữ liệu xem trước từ backend
  const [previewData, setPreviewData] = useState<any>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [exporting, setExporting] = useState(false);

  // PDF Pagination trong preview
  const [pdfPage, setPdfPage] = useState(1);
  const totalPdfPages = 3;

  // Load danh sách camera
  useEffect(() => {
    fetchCameras()
      .then((cams) => setCameras(cams.map((c) => c.camera_id)))
      .catch((err) => console.error(err));
  }, []);

  // Đồng bộ selectedDate từ props nếu có
  useEffect(() => {
    if (selectedDate) {
      setDateFrom(selectedDate);
      setDateTo(selectedDate);
    }
  }, [selectedDate]);

  // Load KPI và preview dữ liệu
  useEffect(() => {
    let active = true;
    setLoadingPreview(true);

    const params = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
      format: exportFormat === 'pdf' ? 'csv' : exportFormat,
      limit: '20',
    });
    if (selectedCamera !== 'all') params.append('camera_id', selectedCamera);
    if (onlyViolations) params.append('violation', 'any');

    Promise.all([
      fetchSummaryKPI(dateFrom, dateTo).catch(() => null),
      fetch(`/api/data/export-preview?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ])
      .then(([summary, preview]) => {
        if (!active) return;
        setSummaryData(summary);
        setPreviewData(preview);
      })
      .finally(() => {
        if (active) setLoadingPreview(false);
      });

    return () => {
      active = false;
    };
  }, [dateFrom, dateTo, selectedCamera, onlyViolations, exportFormat]);

  // Quick preset dates
  const handleSetPreset = (preset: 'today' | 'yesterday' | 'week' | 'month') => {
    const today = new Date();
    const dStr = today.toISOString().slice(0, 10);
    if (preset === 'today') {
      setDateFrom(dStr);
      setDateTo(dStr);
      onDateChange?.(dStr);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      setDateFrom(yStr);
      setDateTo(yStr);
      onDateChange?.(yStr);
    } else if (preset === 'week') {
      const w = new Date(today);
      w.setDate(w.getDate() - 6);
      setDateFrom(w.toISOString().slice(0, 10));
      setDateTo(dStr);
    } else if (preset === 'month') {
      const m = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFrom(m.toISOString().slice(0, 10));
      setDateTo(dStr);
    }
  };

  // Xử lý xuất file
  const handleExecuteExport = async () => {
    if (exportFormat === 'pdf') {
      if (onExportPDF) {
        onExportPDF();
      } else {
        addToast?.('Đang tạo tệp PDF...', 'info');
      }
      return;
    }

    setExporting(true);
    try {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (selectedCamera !== 'all') params.append('camera_id', selectedCamera);
      if (onlyViolations) params.append('violation', 'any');

      let endpoint = '';
      if (exportFormat === 'csv') {
        if (csvPlain) params.append('plain', 'true');
        endpoint = `/api/data/export.csv?${params.toString()}`;
      } else {
        if (excelIncludeImages) params.append('include_images', 'true');
        endpoint = `/api/data/export.xlsx?${params.toString()}`;
      }

      const res = await fetch(endpoint);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Lỗi tải file (${res.status})`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') || '';
      let filename = `BaoCao_${dateFrom}_${dateTo}.${exportFormat}`;
      if (disposition.includes("filename*=UTF-8''")) {
        filename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1]);
      } else if (disposition.includes('filename=')) {
        filename = disposition.split('filename=')[1].replace(/["']/g, '');
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      addToast?.(`Xuất file ${exportFormat.toUpperCase()} thành công!`, 'success');
    } catch (err: any) {
      addToast?.(err.message || 'Lỗi khi xuất file', 'error');
    } finally {
      setExporting(false);
    }
  };

  const totalRecords = previewData?.total_records ?? summaryData?.total_vehicles ?? 0;
  const violationRecords = previewData?.summary?.violations ?? summaryData?.violations ?? 0;
  const ocrClearPct = summaryData?.ocr_clear_percent ?? 98.4;
  const lowOcrRecords = previewData?.summary?.low_ocr ?? 0;

  return (
    <div className="space-y-4">
      {/* A. THANH CÔNG CỤ ĐIỀU KHIỂN XUẤT */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Khoảng ngày Từ - Đến */}
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span className="font-semibold text-slate-600">Từ:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent font-semibold outline-none"
              />
              <span className="font-semibold text-slate-400">→</span>
              <span className="font-semibold text-slate-600">Đến:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent font-semibold outline-none"
              />
            </div>

            {/* Quick date presets */}
            <div className="hidden sm:inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleSetPreset('today')}
                className={`rounded-lg px-2.5 py-1 ${
                  dateFrom === todayStr && dateTo === todayStr ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset('yesterday')}
                className="rounded-lg px-2.5 py-1 text-slate-600 hover:text-slate-900"
              >
                Hôm qua
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset('week')}
                className="rounded-lg px-2.5 py-1 text-slate-600 hover:text-slate-900"
              >
                7 ngày
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset('month')}
                className="rounded-lg px-2.5 py-1 text-slate-600 hover:text-slate-900"
              >
                Tháng này
              </button>
            </div>

            {/* Lọc camera */}
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">Tất cả camera</option>
              {cameras.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Chỉ vi phạm */}
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={onlyViolations}
                onChange={(e) => setOnlyViolations(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Chỉ vi phạm
            </label>
          </div>

          {/* Bộ chọn định dạng & Nút xuất chính */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setExportFormat('pdf')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  exportFormat === 'pdf' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <FileText className="h-3.5 w-3.5" /> PDF
              </button>
              <button
                type="button"
                onClick={() => setExportFormat('csv')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  exportFormat === 'csv' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
              </button>
              <button
                type="button"
                onClick={() => setExportFormat('xlsx')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  exportFormat === 'xlsx' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </button>
            </div>

            <button
              type="button"
              disabled={exporting || loadingPreview}
              onClick={handleExecuteExport}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang xuất...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> Xuất {exportFormat.toUpperCase()} ({totalRecords} bản ghi)
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* B. HÀNG 4 THẺ KPI TỔNG HỢP */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-slate-400">Tổng lượt xe</span>
          <p className="mt-1 text-2xl font-black text-slate-900">{totalRecords.toLocaleString('vi-VN')}</p>
          <span className="text-[11px] text-slate-500">Trong kỳ dữ liệu đã chọn</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-rose-500">Lượt vi phạm</span>
          <p className="mt-1 text-2xl font-black text-rose-600">{violationRecords.toLocaleString('vi-VN')}</p>
          <span className="text-[11px] text-slate-500">
            Tỉ lệ {totalRecords ? ((violationRecords / totalRecords) * 100).toFixed(1) : 0}%
          </span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-emerald-600">Tỉ lệ OCR rõ</span>
          <p className="mt-1 text-2xl font-black text-emerald-700">{ocrClearPct}%</p>
          <span className="text-[11px] text-slate-500">Biển số đạt ngưỡng ≥ 90%</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-amber-600">Cần rà soát</span>
          <p className="mt-1 text-2xl font-black text-amber-600">{lowOcrRecords.toLocaleString('vi-VN')}</p>
          <span className="text-[11px] text-slate-500">Biển số OCR &lt; 90%</span>
        </div>
      </div>

      {/* C. KHU VỰC XEM TRƯỚC (TRÁI) VÀ NỘI DUNG XUẤT (PHẢI) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* KHUNG XEM TRƯỚC (8 CỘT) */}
        <div className="lg:col-span-8 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-h-[560px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-bold text-slate-900">
                Xem trước thực tế:{' '}
                {exportFormat === 'pdf' ? 'Bản in A4' : exportFormat === 'csv' ? 'Tệp dữ liệu CSV' : 'Sổ tính Excel'}
              </span>
            </div>
            {exportFormat === 'pdf' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-semibold">
                  Trang {pdfPage} / {totalPdfPages}
                </span>
                <button
                  type="button"
                  disabled={pdfPage <= 1}
                  onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                  className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={pdfPage >= totalPdfPages}
                  onClick={() => setPdfPage((p) => Math.min(totalPdfPages, p + 1))}
                  className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {exportFormat === 'xlsx' && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setExcelActiveSheet('summary')}
                  className={`rounded px-2.5 py-1 font-semibold ${
                    excelActiveSheet === 'summary' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-600'
                  }`}
                >
                  Tổng quan
                </button>
                <button
                  type="button"
                  onClick={() => setExcelActiveSheet('detail')}
                  className={`rounded px-2.5 py-1 font-semibold ${
                    excelActiveSheet === 'detail' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-600'
                  }`}
                >
                  Chi tiết
                </button>
                <button
                  type="button"
                  onClick={() => setExcelActiveSheet('notes')}
                  className={`rounded px-2.5 py-1 font-semibold ${
                    excelActiveSheet === 'notes' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-600'
                  }`}
                >
                  Chú giải
                </button>
              </div>
            )}
          </div>

          {loadingPreview ? (
            <div className="flex flex-1 items-center justify-center p-12 text-sm text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang dựng bản xem trước...
            </div>
          ) : (
            <div className="flex-1 overflow-auto bg-slate-100/60 p-4 rounded-xl flex justify-center">
              {/* VIEW 1: XEM TRƯỚC PDF A4 */}
              {exportFormat === 'pdf' && (
                <div className="w-full max-w-[620px] bg-white rounded-lg shadow-lg border border-slate-300 p-6 space-y-4 text-slate-900 font-sans text-xs">
                  {/* Dải tiêu đề PDF */}
                  <div className="border-b-2 border-slate-900 pb-3 text-center">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                      CÔNG AN TP HÀ NỘI — HỆ THỐNG GIÁM SÁT GIAO THÔNG THÔNG MINH
                    </p>
                    <h1 className="mt-1 text-base font-black tracking-tight text-slate-950 uppercase">
                      BÁO CÁO GIÁM SÁT VÀ XỬ LÝ VI PHẠM GIAO THÔNG
                    </h1>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Khoảng thời gian: {dateFrom} đến {dateTo} | Camera: {selectedCamera === 'all' ? 'Toàn mạng lưới' : selectedCamera}
                    </p>
                  </div>

                  {pdfOptions.summary && (
                    <div className="grid grid-cols-4 gap-2 text-center py-2 bg-slate-50 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Tổng lượt xe</span>
                        <p className="text-sm font-black text-slate-900">{totalRecords}</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-rose-600 font-bold uppercase">Vi phạm</span>
                        <p className="text-sm font-black text-rose-600">{violationRecords}</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-emerald-600 font-bold uppercase">Tỉ lệ OCR</span>
                        <p className="text-sm font-black text-emerald-700">{ocrClearPct}%</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-amber-600 font-bold uppercase">Rà soát</span>
                        <p className="text-sm font-black text-amber-600">{lowOcrRecords}</p>
                      </div>
                    </div>
                  )}

                  {pdfOptions.details && previewData?.preview_rows && (
                    <div>
                      <p className="font-bold text-[11px] text-slate-800 mb-1.5 uppercase tracking-wide">
                        Bảng trích xuất chi tiết (20 dòng đầu)
                      </p>
                      <div className="overflow-hidden border border-slate-200 rounded">
                        <table className="w-full text-left text-[10px] border-collapse">
                          <thead className="bg-slate-900 text-white font-bold">
                            <tr>
                              <th className="p-1 border border-slate-700">STT</th>
                              <th className="p-1 border border-slate-700">Mã hồ sơ</th>
                              <th className="p-1 border border-slate-700">Thời gian</th>
                              <th className="p-1 border border-slate-700">Camera</th>
                              <th className="p-1 border border-slate-700">Biển số</th>
                              <th className="p-1 border border-slate-700">Vi phạm</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewData.preview_rows.slice(0, 8).map((r: any, idx: number) => (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="p-1 border border-slate-200 text-center">{r[0]}</td>
                                <td className="p-1 border border-slate-200 font-mono font-semibold">{r[1]}</td>
                                <td className="p-1 border border-slate-200">{r[2]?.slice(0, 16)}</td>
                                <td className="p-1 border border-slate-200">{r[3]}</td>
                                <td className="p-1 border border-slate-200 font-mono font-bold text-slate-900">{r[4]}</td>
                                <td className="p-1 border border-slate-200 font-semibold text-rose-700">{r[11]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-1 text-[9px] text-slate-400 italic">
                        * Danh sách đầy đủ {totalRecords} bản ghi sẽ được kết xuất đầy đủ khi tải file Excel/CSV.
                      </p>
                    </div>
                  )}

                  {pdfOptions.signatures && (
                    <div className="grid grid-cols-2 pt-6 text-center text-[11px]">
                      <div>
                        <p className="font-bold text-slate-700">Người lập báo cáo</p>
                        <p className="text-[10px] text-slate-400 italic mt-0.5">(Ký và ghi rõ họ tên)</p>
                        <div className="h-12" />
                        <p className="font-semibold text-slate-900">Cán bộ vận hành</p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-700">Chỉ huy phê duyệt</p>
                        <p className="text-[10px] text-slate-400 italic mt-0.5">(Ký và đóng dấu)</p>
                        <div className="h-12" />
                        <p className="font-semibold text-slate-900">Trực ban tác chiến</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2: XEM TRƯỚC CSV */}
              {exportFormat === 'csv' && (
                <div className="w-full bg-white rounded-lg border border-slate-200 p-3 overflow-x-auto text-[11px] font-mono">
                  {!csvPlain && (
                    <div className="bg-slate-50 p-2.5 rounded border border-slate-200 mb-3 text-slate-700 space-y-0.5 text-[10px]">
                      <p className="font-bold"># BÁO CÁO DỮ LIỆU GIÁM SÁT GIAO THÔNG</p>
                      <p># Thời gian xuất: {new Date().toLocaleString('vi-VN')}</p>
                      <p># Khoảng dữ liệu: {dateFrom} đến {dateTo}</p>
                      <p># Bộ lọc: Camera={selectedCamera}, Chỉ vi phạm={onlyViolations ? 'Có' : 'Không'}</p>
                      <p># Tổng bản ghi: {totalRecords} dòng</p>
                    </div>
                  )}
                  <table className="w-full border-collapse text-left whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300">
                        {previewData?.headers?.map((h: string, idx: number) => (
                          <th key={idx} className="p-1.5 border-r border-slate-200 text-slate-700 font-bold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData?.preview_rows?.map((row: any[], rIdx: number) => (
                        <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                          {row.map((cell: any, cIdx: number) => (
                            <td key={cIdx} className="p-1.5 border-r border-slate-100 text-slate-800">
                              {String(cell || '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* VIEW 3: XEM TRƯỚC EXCEL (3 SHEETS) */}
              {exportFormat === 'xlsx' && (
                <div className="w-full bg-white rounded-lg border border-slate-200 p-3 overflow-x-auto text-xs">
                  {excelActiveSheet === 'summary' && (
                    <div className="space-y-4">
                      <div className="border-b pb-2">
                        <h2 className="text-base font-bold text-slate-900">BÁO CÁO TỔNG QUAN DỮ LIỆU GIAO THÔNG</h2>
                        <p className="text-xs text-slate-500">Khoảng dữ liệu: {dateFrom} - {dateTo}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded border bg-slate-50 p-2.5">
                          <span className="text-[11px] text-slate-500">Tổng lượt xe:</span>
                          <p className="font-bold text-lg text-slate-900">{totalRecords}</p>
                        </div>
                        <div className="rounded border bg-rose-50 p-2.5">
                          <span className="text-[11px] text-rose-600">Lượt vi phạm:</span>
                          <p className="font-bold text-lg text-rose-700">{violationRecords}</p>
                        </div>
                        <div className="rounded border bg-emerald-50 p-2.5">
                          <span className="text-[11px] text-emerald-600">Tỉ lệ OCR rõ:</span>
                          <p className="font-bold text-lg text-emerald-700">{ocrClearPct}%</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 italic">
                        * Sheet 1 chứa tổng hợp thống kê số lượng theo loại vi phạm, theo loại xe và camera.
                      </p>
                    </div>
                  )}

                  {excelActiveSheet === 'detail' && (
                    <div>
                      <table className="w-full border-collapse text-left whitespace-nowrap text-[11px]">
                        <thead>
                          <tr className="bg-slate-100 font-bold border-b border-slate-300">
                            {previewData?.headers?.map((h: string, idx: number) => (
                              <th key={idx} className="p-1.5 border-r border-slate-200">
                                {h}
                              </th>
                            ))}
                            {excelIncludeImages && (
                              <th className="p-1.5 border-r border-slate-200 text-sky-700 font-bold">
                                Ảnh phương tiện (xem trước)
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData?.preview_rows?.map((row: any[], rIdx: number) => (
                            <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                              {row.map((cell: any, cIdx: number) => (
                                <td
                                  key={cIdx}
                                  className={`p-1.5 border-r border-slate-100 ${
                                    cIdx === 7 && Number(cell) < 90
                                      ? 'bg-amber-100 font-bold text-amber-800'
                                      : cIdx === 11 && cell !== 'Không vi phạm'
                                      ? 'bg-rose-50 font-bold text-rose-800'
                                      : ''
                                  }`}
                                >
                                  {String(cell || '')}
                                </td>
                              ))}
                              {excelIncludeImages && (
                                <td className="p-1.5 border-r border-slate-100 text-slate-400 italic text-[10px]">
                                  [Nhúng ảnh thu nhỏ]
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {excelActiveSheet === 'notes' && (
                    <div className="space-y-2 text-xs">
                      <h3 className="font-bold text-slate-900 border-b pb-1">CHÚ GIẢI THÔNG TIN BÁO CÁO</h3>
                      <p><strong>Mã hồ sơ:</strong> Mã định danh duy nhất TRF-YYYYMMDD-CAM-STT</p>
                      <p><strong>Độ tin cậy OCR:</strong> Điểm số nhận diện ký tự biển số (0 - 100%)</p>
                      <p><strong>Ngưỡng OCR thấp:</strong> Dưới 90% được tô màu cam nhạt để rà soát</p>
                      <p><strong>Màu sắc:</strong> Đỏ: Có vi phạm | Cam: OCR thấp | Xanh: Đã xác nhận</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* CỘT NỘI DUNG XUẤT (4 CỘT) */}
        <div className="lg:col-span-4 flex flex-col space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Cấu hình nội dung xuất ({exportFormat.toUpperCase()})
            </h3>

            {exportFormat === 'pdf' && (
              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pdfOptions.summary}
                    onChange={(e) => setPdfOptions((prev) => ({ ...prev, summary: e.target.checked }))}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>Thống kê tổng hợp (4 chỉ số KPI)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pdfOptions.details}
                    onChange={(e) => setPdfOptions((prev) => ({ ...prev, details: e.target.checked }))}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>Bảng chi tiết vi phạm (tối đa 500 dòng)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pdfOptions.evidenceImages}
                    onChange={(e) => setPdfOptions((prev) => ({ ...prev, evidenceImages: e.target.checked }))}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>Ảnh bằng chứng vi phạm (tối đa 50 ảnh)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pdfOptions.signatures}
                    onChange={(e) => setPdfOptions((prev) => ({ ...prev, signatures: e.target.checked }))}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>Khối chữ ký và xác nhận của lãnh đạo</span>
                </label>
              </div>
            )}

            {exportFormat === 'csv' && (
              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={csvPlain}
                    onChange={(e) => setCsvPlain(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>Chỉ dữ liệu thô (bỏ phần đầu báo cáo)</span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Hữu ích khi cần nhập dữ liệu vào phần mềm khác hoặc cơ sở dữ liệu.
                </p>
              </div>
            )}

            {exportFormat === 'xlsx' && (
              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excelIncludeImages}
                    onChange={(e) => setExcelIncludeImages(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>Kèm ảnh phương tiện thu nhỏ (tối đa 500 dòng)</span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Nhúng ảnh xem trước vào cột riêng trong Sheet Chi tiết để in ấn đối chiếu.
                </p>
              </div>
            )}
          </div>

          {/* Hộp Thông tin file xuất */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm space-y-2.5 text-xs">
            <h4 className="font-bold text-slate-700 uppercase tracking-wide text-[11px]">Thông tin tệp xuất</h4>
            <div className="space-y-1.5 text-slate-600">
              <div className="flex justify-between">
                <span>Tên file:</span>
                <span className="font-mono font-semibold text-slate-900">{previewData?.filename || 'Đang tạo...'}</span>
              </div>
              <div className="flex justify-between">
                <span>Số bản ghi:</span>
                <span className="font-semibold text-slate-900">{totalRecords} dòng</span>
              </div>
              <div className="flex justify-between">
                <span>Số cột chi tiết:</span>
                <span className="font-semibold text-slate-900">{previewData?.columns_count || 20} cột</span>
              </div>
              <div className="flex justify-between">
                <span>Dung lượng ước tính:</span>
                <span className="font-semibold text-slate-900">~{previewData?.estimated_size_kb || 25} KB</span>
              </div>
              <div className="flex justify-between">
                <span>Khổ in ấn:</span>
                <span className="font-semibold text-slate-900">A4 Nằm ngang (Landscape)</span>
              </div>
            </div>

            {previewData?.is_truncated && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-amber-800 text-[11px] border border-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <span>Dữ liệu vượt quá {previewData.max_limit} dòng và sẽ bị cắt bớt. Hãy thu hẹp khoảng ngày.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
