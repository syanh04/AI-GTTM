'use client';

import React, { useEffect, useState } from 'react';
import { AuditItem } from './types';
import { fetchAuditLogs } from './api';
import { ScrollText, ArrowLeft, ArrowRight } from 'lucide-react';
import EntityLink from '../EntityLink';

export default function AuditPanel() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const loadData = (p: number) => {
    setLoading(true);
    fetchAuditLogs(p, pageSize)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setPage(p);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Nhật Ký Thao Tác Hệ Thống</h3>
          <p className="text-xs text-slate-500">Ghi lại toàn bộ hành vi sửa biển, duyệt vi phạm, xuất file, xóa dữ liệu</p>
        </div>
        <div className="text-xs font-semibold text-slate-500">Tổng cộng: {total.toLocaleString('vi-VN')} bản ghi</div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="p-3">Thời gian</th>
              <th className="p-3">Người dùng</th>
              <th className="p-3">Vai trò</th>
              <th className="p-3">Hành động</th>
              <th className="p-3">Đối tượng</th>
              <th className="p-3">Ghi chú</th>
              <th className="p-3">IP / Thiết bị</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-sm text-slate-400">
                  Đang tải nhật ký...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-sm text-slate-400">
                  Chưa có nhật ký thao tác nào.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50">
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{it.ts}</td>
                  <td className="p-3 font-bold text-slate-900">
                    <EntityLink entityType="user" entityId={it.username} />
                  </td>
                  <td className="p-3 text-xs">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                      {it.role || 'system'}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs text-sky-700">{it.action}</td>
                  <td className="p-3 text-xs text-slate-600">
                    {it.entity_id ? (
                      <EntityLink
                        entityType={
                          it.entity_type === 'record' || it.entity_type === 'detection'
                            ? 'record'
                            : it.entity_type === 'case'
                            ? 'case'
                            : it.entity_type === 'camera'
                            ? 'camera'
                            : 'record'
                        }
                        entityId={it.entity_id}
                        label={`${it.entity_type} #${it.entity_id}`}
                      />
                    ) : (
                      it.entity_type || '–'
                    )}
                  </td>
                  <td className="p-3 text-xs text-slate-600">{it.note || '–'}</td>
                  <td className="p-3 text-xs text-slate-400">{it.ip || '127.0.0.1'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Trang {page} / {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => loadData(page - 1)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
          >
            <ArrowLeft className="h-3 w-3" /> Trước
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => loadData(page + 1)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
          >
            Sau <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
