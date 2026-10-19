'use client';

import React, { useEffect, useState } from 'react';
import PageTabs, { type TabItem } from '@/components/PageTabs';
import AuditPanel from '@/components/data-center/AuditPanel';
import { History, Shield, RefreshCw, Filter } from 'lucide-react';
import { formatDateTime } from '@/lib/i18n/vi';
import EntityLink from '@/components/EntityLink';

interface AuditEvent {
  id: number;
  time: string;
  timestamp: string;
  username: string;
  role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  note: string;
  action_display: string;
}

interface AuditViewProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export default function AuditView({ activeTab = 'actions', onTabChange }: AuditViewProps) {
  const [currentTab, setCurrentTab] = useState(
    activeTab === 'system' || activeTab === 'events' ? 'system' : 'actions',
  );
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/system/events?limit=50', { headers });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load audit events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleTabSelect = (key: string) => {
    setCurrentTab(key);
    if (onTabChange) onTabChange(key);
  };

  const tabs: TabItem[] = [
    { key: 'actions', label: 'Nhật ký thao tác (Audit Log)', icon: History },
    { key: 'system', label: 'Sự kiện hệ thống & Cảnh báo', icon: Shield },
  ];

  return (
    <div className="space-y-4">
      <PageTabs tabs={tabs} activeTab={currentTab} onChange={handleTabSelect} />

      {currentTab === 'actions' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <AuditPanel />
        </div>
      )}

      {currentTab === 'system' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Sự kiện bảo mật & Hệ thống</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Các sự kiện kết nối camera, pipeline cảnh báo và biến cố hệ thống thời gian thực
              </p>
            </div>
            <button
              type="button"
              onClick={loadEvents}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600"
              title="Làm mới"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-y border-slate-200 uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Thời gian</th>
                  <th className="py-2.5 px-3">Tài khoản</th>
                  <th className="py-2.5 px-3">Vai trò</th>
                  <th className="py-2.5 px-3">Hành động</th>
                  <th className="py-2.5 px-3">Đối tượng</th>
                  <th className="py-2.5 px-3">Chi tiết ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      {loading ? 'Đang tải sự kiện...' : 'Chưa có sự kiện hệ thống ghi nhận.'}
                    </td>
                  </tr>
                ) : (
                  events.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 whitespace-nowrap text-slate-500 font-mono">
                        {formatDateTime(e.timestamp)}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900">
                        <EntityLink entityType="user" entityId={e.username} />
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {e.role || 'user'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800">{e.action}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {e.entity_id ? (
                          <EntityLink
                            entityType={
                              e.entity_type === 'record' || e.entity_type === 'detection'
                                ? 'record'
                                : e.entity_type === 'case'
                                ? 'case'
                                : e.entity_type === 'camera'
                                ? 'camera'
                                : 'record'
                            }
                            entityId={e.entity_id}
                            label={`${e.entity_type} #${e.entity_id}`}
                          />
                        ) : (
                          e.entity_type || '--'
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{e.note || e.action_display || '--'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
