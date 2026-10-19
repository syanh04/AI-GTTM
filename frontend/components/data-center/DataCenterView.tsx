'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CameraStat, DataItem, SummaryKPI } from './types';
import {
  bulkAction,
  fetchCameras,
  fetchDetections,
  fetchSummaryKPI,
  softDelete,
} from './api';
import KpiCards from './KpiCards';
import DataTable from './DataTable';
import DetailDrawer from './DetailDrawer';
import ConfirmDialog from './ConfirmDialog';
import StoragePanel from './StoragePanel';
import DeletedPanel from './DeletedPanel';
import ReportsPanel from './ReportsPanel';
import { useAuth } from '@/lib/AuthContext';
import { useArrival } from '@/hooks/useArrival';
import { goTo } from '@/lib/crossNav';
import { fetchDetectionDetail } from './api';
import {
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Check,
  X,
  Trash2,
  Calendar,
  AlertCircle,
  BarChart3,
} from 'lucide-react';

interface DataCenterViewProps {
  selectedDate: string;
  onDateChange?: (date: string) => void;
  onExportPDF?: () => void;
  onExportCSV?: () => void;
  addToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
}

export default function DataCenterView({
  selectedDate,
  onDateChange,
  onExportPDF,
  onExportCSV,
  addToast,
}: DataCenterViewProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isOperator = user?.role === 'operator' || isAdmin;
  const isViewer = !isOperator;

  const [activeSubTab, setActiveSubTab] = useState<
    'data' | 'reports' | 'storage' | 'deleted'
  >('data');

  // Filters & Pagination
  const [items, setItems] = useState<DataItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortDir, setSortDir] = useState('desc');

  const [filterCam, setFilterCam] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterViol, setFilterViol] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOcr, setFilterOcr] = useState<number | ''>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRealtime, setIsRealtime] = useState(true);

  const [cameras, setCameras] = useState<CameraStat[]>([]);
  const [summary, setSummary] = useState<SummaryKPI | null>(null);
  const [loading, setLoading] = useState(false);

  // Selection & Details
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [viewDetailId, setViewDetailId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Polling ref
  const maxIdRef = useRef<number>(0);
  const searchTimeoutRef = useRef<any>(null);

  const loadData = async (resetPage = false) => {
    setLoading(true);
    const currentPage = resetPage ? 1 : page;
    try {
      const res = await fetchDetections({
        page: currentPage,
        page_size: pageSize,
        sort_by: sortBy,
        sort_dir: sortDir,
        camera_id: filterCam,
        vehicle_type: filterType,
        violation: filterViol,
        review_status: filterStatus,
        ocr_lt: filterOcr !== '' ? filterOcr : undefined,
        date_from: filterDateFrom,
        date_to: filterDateTo,
        q: searchQuery,
      });
      setItems(res.items);
      setTotal(res.total);
      if (resetPage) setPage(1);
      maxIdRef.current = res.max_id || 0;
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMeta = () => {
    fetchCameras().then(setCameras).catch(console.error);
    fetchSummaryKPI(filterDateFrom, filterDateTo).then(setSummary).catch(console.error);
  };

  useEffect(() => {
    loadMeta();
  }, [filterDateFrom, filterDateTo]);

  useEffect(() => {
    loadData(true);
  }, [filterCam, filterType, filterViol, filterStatus, filterOcr, filterDateFrom, filterDateTo, sortBy, sortDir, pageSize]);

  // Handle Search Debounce
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadData(true);
    }, 300);
  };

  // Cross-Navigation & Arrival Sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const cam = params.get('camera');
    const viol = params.get('violation');
    const st = params.get('status');
    const ocr = params.get('ocr_lt');
    const veh = params.get('vehicle');
    const qParam = params.get('plate') || params.get('q');
    const fromParam = params.get('from');
    const toParam = params.get('to');
    const tabParam = params.get('tab');

    if (cam) setFilterCam(cam);
    if (viol) setFilterViol(viol);
    if (st) setFilterStatus(st);
    if (ocr) setFilterOcr(Number(ocr));
    if (veh) setFilterType(veh);
    if (qParam) setSearchQuery(qParam);
    if (fromParam) setFilterDateFrom(fromParam);
    if (toParam) setFilterDateTo(toParam);
    if (tabParam && ['data', 'reports', 'storage', 'trash'].includes(tabParam)) {
      setActiveSubTab(tabParam === 'trash' ? 'deleted' : (tabParam as any));
    }
  }, []);

  const { highlightedId, notFound, clearNotFound } = useArrival({
    entityType: 'record',
    items,
    isLoading: loading,
    onOpen: (id) => setViewDetailId(Number(id)),
    onFetchMissing: async (id) => {
      try {
        const det = await fetchDetectionDetail(Number(id));
        if (det) {
          setViewDetailId(Number(id));
          return det;
        }
      } catch {}
      return null;
    },
  });

  // Realtime Polling (10s)
  useEffect(() => {
    if (!isRealtime || page !== 1 || sortBy !== 'timestamp' || sortDir !== 'desc') return;

    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetchDetections({
          page: 1,
          page_size: 10,
          after_id: maxIdRef.current,
        });
        if (res.items.length > 0) {
          maxIdRef.current = Math.max(maxIdRef.current, res.max_id);
          setItems((prev) => [...res.items, ...prev].slice(0, pageSize));
          setTotal((prev) => prev + res.items.length);
          const hasVio = res.items.some((i) => i.violation_type);
          if (hasVio && addToast) {
            addToast('Phát hiện phương tiện vi phạm mới trong luồng giám sát!', 'warning', 3000);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [isRealtime, page, sortBy, sortDir, pageSize, addToast]);

  // Bulk actions
  const handleBulkAction = async (action: 'confirm' | 'dismiss' | 'delete') => {
    if (selectedIds.size === 0) return;
    try {
      await bulkAction(Array.from(selectedIds), action);
      addToast?.('Thao tác hàng loạt thành công!', 'success', 2500);
      setSelectedIds(new Set());
      loadData();
      loadMeta();
    } catch (e: any) {
      alert(e.message || 'Lỗi thao tác');
    }
  };

  const handleExportFile = (format: 'csv' | 'xlsx', includeImages = false) => {
    setIsExporting(true);
    const q = new URLSearchParams();
    if (filterCam) q.append('camera_id', filterCam);
    if (filterType) q.append('vehicle_type', filterType);
    if (filterViol) q.append('violation', filterViol);
    if (filterStatus) q.append('review_status', filterStatus);
    if (filterOcr !== '') q.append('ocr_lt', String(filterOcr));
    if (filterDateFrom) q.append('date_from', filterDateFrom);
    if (filterDateTo) q.append('date_to', filterDateTo);
    if (searchQuery) q.append('q', searchQuery);
    if (format === 'xlsx' && includeImages) q.append('include_images', 'true');

    const url = `/api/data/export.${format}?${q.toString()}`;
    window.location.href = url;
    setTimeout(() => setIsExporting(false), 2000);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const totalAll = cameras.reduce(
    (sum, c) => sum + (c.total || 0), 0);

  return (
    <div className="space-y-6">
      {/* Tiêu đề & Sub-tabs */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Trung tâm dữ liệu</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Quản Lý & Lưu Trữ Dữ Liệu Giao Thông</h2>
            <p className="mt-1 text-sm text-slate-500">
              Tra cứu, rà soát nhận diện biển số, quản lý bằng chứng và xuất báo cáo nghiệp vụ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setActiveSubTab('data')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                activeSubTab === 'data' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
              }`}
            >
              Dữ liệu
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('reports')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                activeSubTab === 'reports' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
              }`}
            >
              Báo cáo & xuất file
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('storage')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                activeSubTab === 'storage' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
              }`}
            >
              Lưu trữ crop
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveSubTab('deleted')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  activeSubTab === 'deleted' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
                }`}
              >
                Đã xóa
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Render Sub-tabs */}
      {activeSubTab === 'data' && (
        <div className="space-y-4">
          <KpiCards
            summary={summary}
            onCardClick={(type) => {
              if (type === 'all') {
                setFilterViol('');
                setFilterOcr('');
              } else if (type === 'vio') {
                setFilterViol('any');
              } else if (type === 'ocr') {
                setFilterOcr(90);
              } else if (type === 'crop') {
                setActiveSubTab('storage');
              }
            }}
          />

          {/* Thanh lọc & công cụ */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterCam}
                onChange={(e) => setFilterCam(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-blue-500 shadow-sm"
              >
                <option value="">
                  Tất cả {totalAll > 0 ? `(${totalAll.toLocaleString('vi-VN')})` : ''}
                </option>
                {[...cameras]
                  .sort((a, b) => a.camera_id.localeCompare(b.camera_id))
                  .map((c) => (
                    <option key={c.camera_id} value={c.camera_id}>
                      {c.camera_id} ({(c.total || 0).toLocaleString('vi-VN')})
                    </option>
                  ))}
              </select>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="">Mọi loại xe</option>
                <option value="car">Ô tô</option>
                <option value="truck">Xe tải</option>
                <option value="moto">Xe máy</option>
                <option value="bus">Xe buýt</option>
              </select>

              <select
                value={filterViol}
                onChange={(e) => setFilterViol(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="">Mọi vi phạm</option>
                <option value="any">Có vi phạm</option>
                <option value="none">Không vi phạm</option>
                <option value="Vượt đèn đỏ">Vượt đèn đỏ</option>
              </select>

              <select
                value={filterOcr}
                onChange={(e) => setFilterOcr(e.target.value ? Number(e.target.value) : '')}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="">Mọi mức OCR</option>
                <option value="90">OCR dưới 90%</option>
                <option value="80">OCR dưới 80%</option>
              </select>

              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="bg-transparent outline-none"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="bg-transparent outline-none"
                />
              </div>

              <div className="relative min-w-[180px] flex-1">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  placeholder="Tìm biển số (gần đúng)..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-sky-500"
                />
              </div>

              {/* Nút Xuất Báo Cáo & Xu hướng */}
              {isOperator && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => goTo({ view: 'analytics', tab: 'traffic' }, { camera: filterCam, range: 'today' })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs cursor-pointer"
                    title="Xem biểu đồ phân tích xu hướng lưu lượng"
                  >
                    <BarChart3 className="h-3.5 w-3.5 text-slate-500" /> Xem xu hướng
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('reports')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-xs cursor-pointer"
                    title="Mở Trung tâm Báo cáo & Xuất file với các bộ lọc hiện tại"
                  >
                    <Download className="h-3.5 w-3.5" /> Xuất báo cáo...
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
              <label className="flex items-center gap-2 font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={isRealtime}
                  onChange={(e) => setIsRealtime(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Chế độ thời gian thực (Polling 10s)
              </label>

              <button
                type="button"
                onClick={() => {
                  setFilterCam('');
                  setFilterType('');
                  setFilterViol('');
                  setFilterStatus('');
                  setFilterOcr('');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                  setSearchQuery('');
                  loadData(true);
                }}
                className="flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-800"
              >
                <RotateCcw className="h-3 w-3" /> Đặt lại bộ lọc
              </button>
            </div>
          </div>

          {/* Thanh tác vụ hàng loạt */}
          {selectedIds.size > 0 && isOperator && (
            <div className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              <span className="font-semibold">Đã chọn {selectedIds.size} bản ghi</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkAction('confirm')}
                  className="rounded-lg bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-700"
                >
                  Xác nhận vi phạm
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkAction('dismiss')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Bỏ qua
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleBulkAction('delete')}
                    className="rounded-lg bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-700"
                  >
                    Xóa
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="rounded-lg px-2 py-1 text-slate-600 hover:bg-sky-100"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>
          )}

          {/* Thông báo nếu không tìm thấy bản ghi theo URL deep link */}
          {notFound && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 shadow-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Không tìm thấy bản ghi được chỉ định (có thể đã bị xóa hoặc chuyển vào lưu trữ).</span>
              </div>
              <button
                type="button"
                onClick={clearNotFound}
                className="rounded-md bg-amber-200/60 px-2.5 py-1 text-xs font-semibold hover:bg-amber-200 text-amber-900 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          )}

          {/* Bảng dữ liệu chính */}
          <DataTable
            items={items}
            selectedIds={selectedIds}
            highlightedId={highlightedId}
            onToggleSelect={(id) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onToggleSelectAll={() => {
              if (items.every((i) => selectedIds.has(i.id))) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(items.map((i) => i.id)));
              }
            }}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={(col) => {
              if (sortBy === col) {
                setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
              } else {
                setSortBy(col);
                setSortDir('desc');
              }
            }}
            onViewDetail={(id) => setViewDetailId(id)}
            onDeleteRecord={(id) => setDeleteTargetId(id)}
            onEditPlateClick={(id) => setViewDetailId(id)}
            canEdit={isOperator}
            canDelete={isAdmin}
            loading={loading}
          />

          {/* Phân trang */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              Hiển thị {items.length} / {total.toLocaleString('vi-VN')} bản ghi
            </span>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 font-medium">
                Dòng mỗi trang:
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded border border-slate-200 px-2 py-1 outline-none"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="font-semibold">
                  Trang {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Báo cáo & xuất file (3 định dạng PDF, Excel, CSV với xem trước trực tiếp) */}
      {activeSubTab === 'reports' && (
        <ReportsPanel
          initialDateFrom={filterDateFrom}
          initialDateTo={filterDateTo}
          initialCamera={filterCam}
          addToast={addToast}
        />
      )}

      {/* Tab: Lưu trữ crop */}
      {activeSubTab === 'storage' && <StoragePanel isAdmin={isAdmin} />}

      {/* Tab: Đã xóa */}
      {activeSubTab === 'deleted' && isAdmin && <DeletedPanel isAdmin={isAdmin} />}

      {/* Chi tiết Modal Căn Giữa Mới */}
      <DetailDrawer
        id={viewDetailId}
        items={items}
        onSelectId={(newId) => setViewDetailId(newId)}
        onClose={() => setViewDetailId(null)}
        onRefresh={() => {
          loadData();
          loadMeta();
        }}
        onDeleteRecord={(delId) => setDeleteTargetId(delId)}
        canEdit={isOperator}
        isAdmin={isAdmin}
      />

      {/* Xác nhận xóa mềm */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetId)}
        title="Xóa bản ghi phương tiện?"
        message="Bản ghi sẽ được chuyển vào thùng rác đã xóa mềm và có thể khôi phục sau này bởi Quản trị viên."
        showReasonInput
        reasonValue={deleteReason}
        onReasonChange={setDeleteReason}
        isDestructive
        onConfirm={async () => {
          if (!deleteTargetId) return;
          try {
            await softDelete(deleteTargetId, deleteReason);
            addToast?.('Đã chuyển bản ghi vào thùng rác', 'success', 2500);
            setDeleteTargetId(null);
            setDeleteReason('');
            loadData();
            loadMeta();
          } catch (e: any) {
            alert(e.message || 'Lỗi xóa bản ghi');
          }
        }}
        onCancel={() => {
          setDeleteTargetId(null);
          setDeleteReason('');
        }}
      />
    </div>
  );
}
