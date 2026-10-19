'use client';

import React from 'react';
import {
  NAVIGATION_GROUPS,
  hasViewAccess,
  type ViewKey,
  type NavigationItem,
} from '@/lib/navigation';
import { formatRole } from '@/lib/i18n/vi';
import { useRealSystemMetrics } from '@/hooks/useRealSystemMetrics';
import { useSystemBadges } from '@/hooks/useSystemBadges';
import { LogOut } from 'lucide-react';

export type MainTabId = 'camera' | 'overview' | 'analysis' | 'coordination' | 'violations' | 'catalog' | 'ai-debug';
export type AdminSectionId = 'devices' | 'violations' | 'infrastructure' | 'ai-config' | 'settings' | 'users' | 'logs';

export type DashboardSidebarAction =
  | { type: 'tab'; tab: MainTabId }
  | { type: 'admin'; section: AdminSectionId };

interface DashboardSidebarV2Props {
  activeNavKey: string;
  isAdmin?: boolean;
  userRole?: string;
  user?: any;
  logout?: () => void;
  onSelectView?: (view: ViewKey) => void;
  onAction?: (action: DashboardSidebarAction, key: string) => void;
}

export default function DashboardSidebarV2({
  activeNavKey,
  isAdmin = false,
  userRole,
  user,
  logout,
  onSelectView,
  onAction,
}: DashboardSidebarV2Props) {
  const effectiveRole = userRole || user?.role || (isAdmin ? 'admin' : 'viewer');
  const { metrics } = useRealSystemMetrics(6000);
  const { cases_pending, cameras_offline } = useSystemBadges(15000);

  const handleItemClick = (item: NavigationItem) => {
    if (onSelectView) {
      onSelectView(item.key);
    }

    if (onAction) {
      // Legacy mapping fallback
      const keyMap: Partial<Record<ViewKey, DashboardSidebarAction>> = {
        overview: { type: 'tab', tab: 'overview' },
        live: { type: 'tab', tab: 'camera' },
        dispatch: { type: 'tab', tab: 'coordination' },
        cases: { type: 'admin', section: 'violations' },
        legal: { type: 'admin', section: 'violations' },
        'data-center': { type: 'tab', tab: 'analysis' },
        analytics: { type: 'tab', tab: 'analysis' },
        devices: { type: 'admin', section: 'devices' },
        ai: { type: 'admin', section: 'ai-config' },
        'ai-config': { type: 'admin', section: 'ai-config' },
        'ai-debug': { type: 'tab', tab: 'ai-debug' },
        'ai-logs': { type: 'tab', tab: 'ai-debug' },
        settings: { type: 'admin', section: 'settings' },
        'settings-org': { type: 'admin', section: 'settings' },
        'settings-storage': { type: 'admin', section: 'settings' },
        'settings-integrations': { type: 'admin', section: 'settings' },
        'settings-maintenance': { type: 'admin', section: 'settings' },
        users: { type: 'admin', section: 'users' },
        audit: { type: 'admin', section: 'logs' },
      };
      const action = keyMap[item.key] || { type: 'tab', tab: 'overview' };
      onAction(action, item.key);
    }
  };

  const roleInfo = formatRole(effectiveRole);

  return (
    <aside className="hidden h-screen w-[260px] shrink-0 border-r border-slate-200 bg-white px-3.5 py-4 lg:flex lg:flex-col select-none">
      {/* Brand Header */}
      <div className="mb-4 px-2 py-1">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500/30">
            <img src="/favicon.png" alt="TrafficAI" className="h-8 w-8 rounded-md object-contain" onError={(e) => {
              // fallback if icon missing
              (e.target as HTMLElement).style.display = 'none';
            }} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase leading-tight tracking-[0.08em] text-slate-950">
              SMART TRAFFIC
            </p>
            <p className="text-[10px] font-semibold text-slate-500 tracking-wide">
              Hệ thống giám sát ALPR
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1.5 scrollbar-thin">
        {NAVIGATION_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) =>
            hasViewAccess(item, effectiveRole)
          );

          if (visibleItems.length === 0) return null;

          return (
            <section key={group.groupKey} className="space-y-1">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  // Matches either new view key or old legacy keys
                  const active =
                    activeNavKey === item.key ||
                    (item.key === 'overview' && (activeNavKey === 'operations' || activeNavKey === 'overview')) ||
                    (item.key === 'live' && (activeNavKey === 'monitoring' || activeNavKey === 'camera')) ||
                    (item.key === 'dispatch' && activeNavKey === 'coordination') ||
                    (item.key === 'cases' && (activeNavKey === 'violation-records' || activeNavKey === 'violations-today' || activeNavKey === 'violations')) ||
                    (item.key === 'devices' && (activeNavKey === 'camera-admin' || activeNavKey === 'infrastructure' || activeNavKey === 'devices')) ||
                    (item.key === 'ai' && (activeNavKey === 'ai-config' || activeNavKey === 'ai-debug' || activeNavKey === 'ai-logs')) ||
                    (item.key === 'settings' && (activeNavKey === 'settings-org' || activeNavKey === 'settings-storage' || activeNavKey === 'settings-integrations' || activeNavKey === 'settings-maintenance')) ||
                    (item.key === 'audit' && activeNavKey === 'logs');

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleItemClick(item)}
                      title={item.description}
                      className={`relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition ${
                        active
                          ? 'bg-slate-900 text-white shadow-sm before:absolute before:left-0 before:top-1.5 before:h-[calc(100%-12px)] before:w-1 before:rounded-full before:bg-indigo-400'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                          active
                            ? 'bg-white/15 text-white'
                            : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/50'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.key === 'cases' && cases_pending > 0 && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            active
                              ? 'bg-amber-400 text-slate-950 font-black'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                          title={`${cases_pending} hồ sơ chờ duyệt`}
                        >
                          {cases_pending}
                        </span>
                      )}
                      {item.key === 'devices' && cameras_offline > 0 && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            active
                              ? 'bg-rose-400 text-slate-950 font-black'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                          title={`${cameras_offline} camera ngoại tuyến`}
                        >
                          {cameras_offline}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>

      {/* Real System Status Card */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm text-xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700">Hiệu năng máy chủ</span>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Trực tuyến
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center text-[11px]">
          <div className="rounded bg-white p-1 border border-slate-100">
            <span className="block text-[10px] text-slate-600 font-medium">CPU</span>
            <span className="font-bold text-slate-800">
              {metrics ? `${metrics.cpu_percent}%` : '--'}
            </span>
          </div>
          <div className="rounded bg-white p-1 border border-slate-100">
            <span className="block text-[10px] text-slate-600 font-medium">RAM</span>
            <span className="font-bold text-slate-800">
              {metrics ? `${metrics.ram_percent}%` : '--'}
            </span>
          </div>
          <div className="rounded bg-white p-1 border border-slate-100">
            <span className="block text-[10px] text-slate-600 font-medium">Ổ đĩa</span>
            <span className="font-bold text-slate-800">
              {metrics ? `${metrics.disk_percent}%` : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* User Footer with Role & Logout */}
      {user && (
        <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="min-w-0 pr-2">
            <p className="font-medium text-slate-900 truncate">{user.username}</p>
            <span className={`inline-block mt-0.5 px-1.5 py-0.2 text-[10px] font-medium rounded border ${roleInfo.badge}`}>
              {roleInfo.label}
            </span>
          </div>
          {logout && (
            <button
              type="button"
              onClick={logout}
              title="Đăng xuất"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
