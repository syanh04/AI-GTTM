'use client';

import React from 'react';
import { DataItem } from './types';
import { Eye, Trash2, ArrowUpDown } from 'lucide-react';

interface DataTableProps {
  items: DataItem[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  sortBy: string;
  sortDir: string;
  onSort: (column: string) => void;
  onViewDetail: (id: number) => void;
  onDeleteRecord: (id: number) => void;
  onEditPlateClick: (id: number) => void;
  canEdit: boolean;
  canDelete: boolean;
  loading: boolean;
  highlightedId?: number | string | null;
}

import EntityLink from '@/components/EntityLink';

export default function DataTable({
  items,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  sortBy,
  sortDir,
  onSort,
  onViewDetail,
  onDeleteRecord,
  onEditPlateClick,
  canEdit,
  canDelete,
  loading,
  highlightedId,
}: DataTableProps) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  const renderSortIndicator = (col: string) => {
    if (sortBy !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 text-slate-400" />;
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const getViolationBadge = (v: string) => {
    if (!v) return <span className="text-slate-400">Không</span>;
    if (v.toLowerCase().includes('đèn đỏ')) {
      return <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">{v}</span>;
    }
    if (v.toLowerCase().includes('làn')) {
      return <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{v}</span>;
    }
    return <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">{v}</span>;
  };

  const getStatusBadge = (r: DataItem) => {
    if (!r.violation_type) return <span className="text-slate-400">–</span>;
    if (r.review_status === 'processed') {
      return <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Đã xác nhận</span>;
    }
    if (r.review_status === 'dismissed') {
      return <span className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Bỏ qua</span>;
    }
    return <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Chờ duyệt</span>;
  };

  const getVehicleLabel = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t === 'car') return 'Ô tô';
    if (t === 'truck') return 'Xe tải';
    if (t === 'moto' || t === 'motor') return 'Xe máy';
    if (t === 'bus') return 'Xe buýt';
    return type || 'Khác';
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm text-slate-700">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="p-3 w-10 text-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
            </th>
            <th className="p-3 w-24">Ảnh phương tiện</th>
            <th className="p-3 cursor-pointer select-none" onClick={() => onSort('plate_number')}>
              Biển số {renderSortIndicator('plate_number')}
            </th>
            <th className="p-3 cursor-pointer select-none" onClick={() => onSort('ocr_score')}>
              OCR {renderSortIndicator('ocr_score')}
            </th>
            <th className="p-3">Loại xe</th>
            <th className="p-3 cursor-pointer select-none" onClick={() => onSort('violation_type')}>
              Vi phạm {renderSortIndicator('violation_type')}
            </th>
            <th className="p-3">Xử lý</th>
            <th className="p-3 cursor-pointer select-none" onClick={() => onSort('camera_id')}>
              Camera {renderSortIndicator('camera_id')}
            </th>
            <th className="p-3 cursor-pointer select-none" onClick={() => onSort('timestamp')}>
              Thời gian {renderSortIndicator('timestamp')}
            </th>
            <th className="p-3 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr>
              <td colSpan={10} className="p-10 text-center text-sm text-slate-400">
                Đang tải dữ liệu...
              </td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={10} className="p-10 text-center text-sm text-slate-400">
                Không có bản ghi khớp bộ lọc. Thử bỏ bớt điều kiện lọc.
              </td>
            </tr>
          ) : (
            items.map((r) => {
              const isSelected = selectedIds.has(r.id);
              const isLowOcr = r.ocr_percent < 90;

              return (
                <tr
                  key={r.id}
                  id={`record-${r.id}`}
                  className={`transition ${
                    String(highlightedId) === String(r.id)
                      ? 'bg-amber-100/70 ring-2 ring-amber-400 font-medium'
                      : isSelected
                      ? 'bg-sky-50/50'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(r.id)}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                  </td>
                  <td className="p-3">
                    <div className="relative group inline-block">
                      <div
                        onClick={() => onViewDetail(r.id)}
                        className="h-12 w-20 cursor-pointer overflow-hidden rounded-md border border-slate-200 bg-slate-100 shadow-xs transition hover:border-sky-400"
                        title="Bấm để xem chi tiết"
                      >
                        <img
                          src={`/api/data/images/${r.id}/vehicle?size=thumb`}
                          alt="Vehicle"
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (!img.dataset.triedPlate) {
                              img.dataset.triedPlate = 'true';
                              img.src = `/api/data/images/${r.id}/plate`;
                              img.className = 'h-full w-full object-contain';
                            } else {
                              img.style.display = 'none';
                              const parent = img.parentElement;
                              if (parent && !parent.querySelector('.no-img-text')) {
                                const span = document.createElement('span');
                                span.className = 'no-img-text flex h-full w-full items-center justify-center text-[10px] text-slate-400 italic';
                                span.textContent = 'Trống';
                                parent.appendChild(span);
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 hidden -translate-y-1/2 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl group-hover:block w-[184px]">
                        <div className="h-[120px] w-[176px] overflow-hidden rounded-lg bg-slate-950 flex items-center justify-center">
                          <img
                            src={`/api/data/images/${r.id}/vehicle`}
                            alt="Vehicle Preview"
                            className="max-h-full max-w-full object-contain"
                            loading="lazy"
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (!img.dataset.triedPlate) {
                                img.dataset.triedPlate = 'true';
                                img.src = `/api/data/images/${r.id}/plate`;
                              } else {
                                img.style.display = 'none';
                              }
                            }}
                          />
                        </div>
                        <div className="mt-1 text-center font-mono text-[11px] font-bold text-white">
                          {r.plate || 'Chưa đọc được'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <span
                      onClick={() => canEdit && onEditPlateClick(r.id)}
                      className={`font-bold ${
                        isLowOcr
                          ? 'cursor-pointer border-b border-dashed border-amber-500 text-amber-700'
                          : 'text-slate-900'
                      }`}
                      title={isLowOcr ? 'OCR thấp, bấm để sửa biển số' : undefined}
                    >
                      {r.plate}
                    </span>
                    {r.plate_edited && (
                      <span className="ml-1 text-[10px] text-slate-400" title="Đã chỉnh sửa tay">
                        (đã sửa)
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        isLowOcr ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {r.ocr_percent}%
                    </span>
                  </td>
                  <td className="p-3 font-medium text-slate-700">
                    {getVehicleLabel(r.vehicle_type)}
                  </td>
                  <td className="p-3">
                    {r.violation_type ? (
                      <EntityLink entityType="case" entityId={r.id}>
                        {getViolationBadge(r.violation_type)}
                      </EntityLink>
                    ) : (
                      getViolationBadge(r.violation_type)
                    )}
                  </td>
                  <td className="p-3">{getStatusBadge(r)}</td>
                  <td className="p-3 font-medium text-slate-600">
                    <EntityLink entityType="camera" entityId={r.camera_id} />
                  </td>
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{r.timestamp}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onViewDetail(r.id)}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Xem chi tiết"
                        aria-label="Xem chi tiết"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => onDeleteRecord(r.id)}
                          className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Xóa bản ghi"
                          aria-label="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
