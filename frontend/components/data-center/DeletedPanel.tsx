'use client';

import React, { useEffect, useState } from 'react';
import { DataItem } from './types';
import { fetchDetections, purgeRecord, restoreRecord } from './api';
import ConfirmDialog from './ConfirmDialog';
import { RotateCcw, Trash2 } from 'lucide-react';

interface DeletedPanelProps {
  isAdmin: boolean;
}

export default function DeletedPanel({ isAdmin }: DeletedPanelProps) {
  const [items, setItems] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [purgeTargetId, setPurgeTargetId] = useState<number | null>(null);

  const loadData = () => {
    setLoading(true);
    fetchDetections({ deleted: 'only', page: 1, page_size: 50 })
      .then((res) => setItems(res.items))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRestore = async (id: number) => {
    try {
      await restoreRecord(id);
      alert('Đã khôi phục bản ghi!');
      loadData();
    } catch (e: any) {
      alert(e.message || 'Lỗi khôi phục');
    }
  };

  const handlePurge = async () => {
    if (!purgeTargetId) return;
    try {
      await purgeRecord(purgeTargetId);
      alert('Đã xóa vĩnh viễn bản ghi và file liên quan!');
      setPurgeTargetId(null);
      loadData();
    } catch (e: any) {
      alert(e.message || 'Lỗi xóa vĩnh viễn');
    }
  };

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Chỉ quản trị viên (Admin) mới có quyền truy cập thùng rác bản ghi đã xóa.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Thùng Rác & Bản Ghi Đã Xóa Mềm</h3>
          <p className="text-xs text-slate-500">Các bản ghi tại đây có thể khôi phục hoặc xóa vĩnh viễn</p>
        </div>
        <div className="text-xs font-semibold text-slate-500">{items.length} bản ghi đã xóa</div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="p-3">Mã hồ sơ</th>
              <th className="p-3">Biển số</th>
              <th className="p-3">Camera</th>
              <th className="p-3">Thời điểm xóa</th>
              <th className="p-3">Lý do xóa</th>
              <th className="p-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-slate-400">
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-slate-400">
                  Thùng rác trống.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs text-slate-500">{it.case_code}</td>
                  <td className="p-3 font-bold text-slate-900">{it.plate}</td>
                  <td className="p-3 text-slate-600">{it.camera_id}</td>
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{it.deleted_at}</td>
                  <td className="p-3 text-xs text-slate-600">{it.delete_reason || '–'}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleRestore(it.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <RotateCcw className="h-3 w-3" /> Khôi phục
                      </button>
                      <button
                        type="button"
                        onClick={() => setPurgeTargetId(it.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <Trash2 className="h-3 w-3" /> Xóa vĩnh viễn
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={Boolean(purgeTargetId)}
        title="Xóa vĩnh viễn bản ghi?"
        message="Hành động này sẽ xóa hoàn toàn bản ghi khỏi Database và xóa vĩnh viễn các file ảnh crop trên ổ đĩa. Thao tác không thể hoàn tác!"
        confirmLabel="Xác nhận xóa vĩnh viễn"
        isDestructive
        onConfirm={handlePurge}
        onCancel={() => setPurgeTargetId(null)}
      />
    </div>
  );
}
