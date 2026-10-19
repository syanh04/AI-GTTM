'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Calendar,
  Camera,
  Loader2,
  AlertCircle,
  Eye,
  Info,
  RefreshCw,
} from 'lucide-react';
import { fetchCameras } from './api';

interface ReportsPanelProps {
  initialDateFrom?: string;
  initialDateTo?: string;
  initialCamera?: string;
  addToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
}

type ExportFormat = 'pdf' | 'xlsx' | 'csv';
type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export default function ReportsPanel({
  initialDateFrom = '',
  initialDateTo = '',
  initialCamera = '',
  addToast,
}: ReportsPanelProps) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [datePreset, setDatePreset] = useState<DatePreset>(
    initialDateFrom || initialDateTo ? 'custom' : 'today'
  );
  const [dateFrom, setDateFrom] = useState(initialDateFrom || todayStr);
  const [dateTo, setDateTo] = useState(initialDateTo || todayStr);
  const [selectedCamera, setSelectedCamera] = useState(initialCamera || '');
  const [cameras, setCameras] = useState<string[]>([]);

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Preview Data
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [excelPreview, setExcelPreview] = useState<any>(null);
  const [excelActiveSheet, setExcelActiveSheet] = useState<number>(0);
  const [totalRows, setTotalRows] = useState<number>(0);

  // In-session Cache & Abort controller
  const previewCache = useRef<Map<string, any>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<any>(null);

  // Fetch cameras list
  useEffect(() => {
    fetchCameras()
      .then((items) => setCameras(items.map((c) => c.camera_id).sort()))
      .catch(() => {});
  }, []);

  // Preset date handling
  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === 'today') {
      const d = now.toISOString().slice(0, 10);
      setDateFrom(d);
      setDateTo(d);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const d = y.toISOString().slice(0, 10);
      setDateFrom(d);
      setDateTo(d);
    } else if (preset === 'week') {
      const w = new Date(now);
      w.setDate(w.getDate() - 6);
      setDateFrom(w.toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    } else if (preset === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(m.toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    }
  };

  // Build query params
  const buildQueryParams = () => {
    const q = new URLSearchParams();
    if (dateFrom) q.append('date_from', dateFrom);
    if (dateTo) q.append('date_to', dateTo);
    if (selectedCamera) q.append('camera_id', selectedCamera);
    return q;
  };

  // Load preview data with debounce, cache, and abort
  const loadPreview = () => {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const q = buildQueryParams();
      q.append('format', format);
      const cacheKey = `${format}?${q.toString()}`;

      if (previewCache.current.has(cacheKey)) {
        const cached = previewCache.current.get(cacheKey);
        setPreviewError(null);
        if (format === 'pdf') {
          setPdfBlobUrl(cached.url);
          setTotalRows(cached.total);
        } else if (format === 'xlsx') {
          setExcelPreview(cached);
          setTotalRows(cached.total_rows || 0);
        } else {
          setCsvPreview(cached);
          setTotalRows(cached.total_rows || 0);
        }
        return;
      }

      setLoadingPreview(true);
      setPreviewError(null);

      try {
        if (format === 'pdf') {
          const res = await fetch(`/api/data/export-preview?${q.toString()}`, {
            signal: controller.signal,
            credentials: 'include',
          });
          if (!res.ok) throw new Error(`Lỗi tải xem trước PDF (${res.status})`);
          const blob = await res.blob();
          const rowsCount = Number(res.headers.get('X-Total-Rows') || 0);
          const url = URL.createObjectURL(blob);
          if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
          setPdfBlobUrl(url);
          setTotalRows(rowsCount);
          previewCache.current.set(cacheKey, { url, total: rowsCount });
        } else {
          const res = await fetch(`/api/data/export-preview?${q.toString()}`, {
            signal: controller.signal,
            credentials: 'include',
          });
          if (!res.ok) throw new Error(`Lỗi tải xem trước (${res.status})`);
          const data = await res.json();
          setTotalRows(data.total_rows || 0);
          if (format === 'xlsx') {
            setExcelPreview(data);
          } else {
            setCsvPreview(data);
          }
          previewCache.current.set(cacheKey, data);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setPreviewError(err.message || 'Không thể tạo bản xem trước');
        }
      } finally {
        setLoadingPreview(false);
      }
    }, 400);
  };

  useEffect(() => {
    loadPreview();
    return () => {
      clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [format, dateFrom, dateTo, selectedCamera]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      previewCache.current.forEach((val) => {
        if (val?.url) URL.revokeObjectURL(val.url);
      });
    };
  }, []);

  // Execute full export download
  const handleDownloadExport = async () => {
    if (totalRows === 0) {
      addToast?.('Không có dữ liệu trong khoảng thời gian đã chọn để xuất file.', 'warning', 3000);
      return;
    }
    setIsExporting(true);
    try {
      const q = buildQueryParams();
      const ext = format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
      const endpoint = `/api/data/export.${ext}?${q.toString()}`;

      const res = await fetch(endpoint, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Lỗi tải file báo cáo (${res.status})`);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;

      // Extract filename or fallback
      const nowStr = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
      a.download = `BaoCao_DuLieu_${nowStr}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      addToast?.(`Xuất báo cáo ${format.toUpperCase()} thành công!`, 'success', 3000);
    } catch (err: any) {
      addToast?.(err.message || 'Lỗi khi xuất file báo cáo.', 'error', 3500);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* HÀNG 1: TIÊU ĐỀ & BỘ CHỌN KHOẢNG THỜI GIAN, CAMERA */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-950">Xuất báo cáo</h2>
          <p className="text-xs text-slate-500">
            Xem trước cấu trúc báo cáo thực tế trước khi tải về
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset buttons */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-medium text-slate-600">
            {(
              [
                ['today', 'Hôm nay'],
                ['yesterday', 'Hôm qua'],
                ['week', '7 ngày qua'],
                ['month', 'Tháng này'],
                ['custom', 'Tùy chọn'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => handlePresetChange(key)}
                className={`rounded-md px-2.5 py-1 transition ${
                  datePreset === key
                    ? 'bg-white font-semibold text-slate-900 shadow-sm'
                    : 'hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Date Range Inputs (Only when custom) */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent font-medium text-slate-700 outline-none"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent font-medium text-slate-700 outline-none"
              />
            </div>
          )}

          {/* Camera Selector */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs">
            <Camera className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="bg-transparent font-medium text-slate-700 outline-none"
            >
              <option value="">Tất cả camera</option>
              {cameras.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* HÀNG 2: BA TAB ĐỊNH DẠNG (PDF | Excel | CSV) & NÚT XUẤT */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
          {/* PDF Tab */}
          <button
            type="button"
            onClick={() => setFormat('pdf')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${
              format === 'pdf'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="flex h-5 items-center justify-center rounded bg-rose-100 px-1.5 text-[10px] font-black text-rose-700">
              PDF
            </span>
            Báo cáo chuẩn A4
          </button>

          {/* Excel Tab */}
          <button
            type="button"
            onClick={() => setFormat('xlsx')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${
              format === 'xlsx'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="flex h-5 items-center justify-center rounded bg-emerald-100 px-1.5 text-[10px] font-black text-emerald-700">
              Excel
            </span>
            Sổ tính 3 Sheet (.xlsx)
          </button>

          {/* CSV Tab */}
          <button
            type="button"
            onClick={() => setFormat('csv')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${
              format === 'csv'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="flex h-5 items-center justify-center rounded bg-slate-200 px-1.5 text-[10px] font-black text-slate-700">
              CSV
            </span>
            Dữ liệu UTF-8 BOM
          </button>
        </div>

        {/* Nút Xuất Chính */}
        <button
          type="button"
          disabled={isExporting || totalRows === 0 || loadingPreview}
          onClick={handleDownloadExport}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tạo...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Xuất {format.toUpperCase()} ({totalRows.toLocaleString('vi-VN')} bản ghi)
            </>
          )}
        </button>
      </div>

      {/* DẢI THÔNG BÁO TÓM TẮT XEM TRƯỚC */}
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-sky-600" />
          <span>
            Xem trước {format.toUpperCase()} ·{' '}
            <strong className="text-slate-900">{totalRows.toLocaleString('vi-VN')}</strong> bản
            ghi khớp bộ lọc ·{' '}
            {format === 'pdf'
              ? 'Bản in A4 tích hợp ảnh bằng chứng & khối chữ ký'
              : format === 'xlsx'
              ? '3 sheet (Tổng quan, Chi tiết 20 cột, Chú giải)'
              : 'Phần đầu báo cáo & bảng 20 cột'}
          </span>
        </div>
        {totalRows > 50000 && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            Dữ liệu lớn, file tải về sẽ được tối ưu hóa
          </span>
        )}
      </div>

      {/* VÙNG XEM TRƯỚC THỰC TẾ NỘI DUNG FILE */}
      <div className="min-h-[560px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {loadingPreview ? (
          <div className="flex h-[520px] flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="h-7 w-7 animate-spin text-slate-600" />
            <p className="text-sm font-semibold">Đang dựng bản xem trước {format.toUpperCase()}...</p>
          </div>
        ) : previewError ? (
          <div className="flex h-[520px] flex-col items-center justify-center gap-3 text-rose-500">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm font-bold">{previewError}</p>
            <button
              type="button"
              onClick={loadPreview}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Thử lại
            </button>
          </div>
        ) : totalRows === 0 ? (
          <div className="flex h-[520px] flex-col items-center justify-center gap-2 text-slate-400">
            <Info className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">
              Không có dữ liệu trong khoảng thời gian đã chọn
            </p>
            <p className="text-xs text-slate-400">
              Hãy chọn khoảng ngày khác hoặc chọn tất cả camera để xem dữ liệu.
            </p>
          </div>
        ) : (
          <>
            {/* 1. XEM TRƯỚC PDF BẰNG BẢN PDF THẬT TRONG IFRAME */}
            {format === 'pdf' && pdfBlobUrl && (
              <div className="h-[680px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <iframe
                  src={`${pdfBlobUrl}#toolbar=0&navpanes=0`}
                  title="PDF Preview"
                  className="h-full w-full border-none"
                />
              </div>
            )}

            {/* 2. XEM TRƯỚC EXCEL: BẢNG TÍNH ĐỦ 3 SHEET */}
            {format === 'xlsx' && excelPreview && (
              <div className="flex flex-col space-y-3">
                {/* Sheet Tabs */}
                <div className="flex items-center gap-1 border-b border-slate-200 pb-2">
                  {excelPreview.sheets?.map((s: any, sIdx: number) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => setExcelActiveSheet(sIdx)}
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                        excelActiveSheet === sIdx
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>

                {/* Spreadsheet Content */}
                <div className="max-h-[580px] overflow-auto rounded-xl border border-slate-200 text-xs">
                  <table className="w-full border-collapse text-left">
                    <tbody>
                      {excelPreview.sheets?.[excelActiveSheet]?.rows?.map(
                        (row: any, rIdx: number) => {
                          const isHeader = row.kind === 'header';
                          const isTitle = row.kind === 'title';
                          const isSection = row.kind === 'section';

                          if (isTitle) {
                            return (
                              <tr key={rIdx} className="bg-slate-50">
                                <td
                                  colSpan={20}
                                  className="p-3 text-sm font-bold text-slate-900"
                                >
                                  {row.cells?.[0]?.val}
                                </td>
                              </tr>
                            );
                          }

                          if (isSection) {
                            return (
                              <tr key={rIdx} className="bg-slate-100">
                                <td
                                  colSpan={20}
                                  className="px-3 py-1.5 font-bold uppercase tracking-wider text-slate-700 text-[11px]"
                                >
                                  {row.cells?.[0]?.val}
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr
                              key={rIdx}
                              className={`border-b border-slate-100 ${
                                isHeader
                                  ? 'sticky top-0 bg-slate-900 font-bold text-white'
                                  : rIdx % 2 === 0
                                  ? 'bg-white'
                                  : 'bg-slate-50/50'
                              } hover:bg-sky-50/40`}
                            >
                              <td className="w-10 border-r border-slate-200 p-2 text-center font-mono text-[10px] text-slate-400 select-none">
                                {isHeader ? '#' : rIdx}
                              </td>
                              {row.cells?.map((c: any, cIdx: number) => {
                                let styleClass = 'text-slate-800';
                                if (c.style === 'warn') {
                                  styleClass = 'bg-amber-100 text-amber-900 font-semibold';
                                } else if (c.style === 'viol_red') {
                                  styleClass = 'bg-rose-100 text-rose-900 font-bold';
                                } else if (c.style === 'ok') {
                                  styleClass = 'bg-emerald-100 text-emerald-900 font-semibold';
                                }

                                return (
                                  <td
                                    key={cIdx}
                                    className={`whitespace-nowrap border-r border-slate-200 p-2 ${
                                      isHeader ? 'border-slate-700 text-white font-bold' : ''
                                    } ${styleClass}`}
                                  >
                                    {String(c.val ?? '')}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. XEM TRƯỚC CSV: PHẦN ĐẦU BÁO CÁO & BẢNG 20 CỘT */}
            {format === 'csv' && csvPreview && (
              <div className="flex flex-col space-y-3 font-mono text-xs">
                {/* Report Header block (4 lines) */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 leading-relaxed text-slate-700 text-[11px]">
                  {csvPreview.header_lines?.map((line: string, idx: number) => (
                    <p key={idx} className={idx === 0 ? 'font-bold text-slate-900' : ''}>
                      # {line}
                    </p>
                  ))}
                </div>

                {/* 20-col CSV Table */}
                <div className="max-h-[500px] overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full border-collapse text-left whitespace-nowrap">
                    <thead>
                      <tr className="sticky top-0 bg-slate-900 text-white font-bold">
                        {csvPreview.columns?.map((h: string, idx: number) => (
                          <th key={idx} className="border-r border-slate-700 p-2 text-[11px]">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.rows?.map((row: any[], rIdx: number) => (
                        <tr
                          key={rIdx}
                          className={`border-b border-slate-100 text-[11px] ${
                            rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                          } hover:bg-slate-100`}
                        >
                          {row.map((val: any, cIdx: number) => (
                            <td key={cIdx} className="border-r border-slate-200 p-2 text-slate-800">
                              {String(val ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
