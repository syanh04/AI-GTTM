'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Clock,
  Cpu,
  LogOut,
  Server,
  Zap,
} from 'lucide-react';
import DashboardSidebarV2 from '@/components/DashboardSidebarV2';
import CameraMonitoring from '@/components/CameraMonitoring';
import CoordinationCenter from '@/components/CoordinationCenter';
import AnalysisCenter from '@/components/AnalysisCenter';
import DataCenterView from '@/components/data-center/DataCenterView';
import UserAccessManagement from '@/components/admin/UserAccessManagement';
import FloatingAIAssistant from '@/components/FloatingAIAssistant';
import OverviewView from '@/components/views/OverviewView';
import CasesView from '@/components/views/CasesView';
import LegalCatalogView from '@/components/views/LegalCatalogView';
import DevicesView from '@/components/views/DevicesView';
import AIView from '@/components/views/AIView';
import SettingsView from '@/components/views/SettingsView';
import AuditView from '@/components/views/AuditView';
import { type ViewKey, findNavigationItem } from '@/lib/navigation';
import { formatRole } from '@/lib/i18n/vi';
import { useRealSystemMetrics } from '@/hooks/useRealSystemMetrics';
import type { ViolationEvent } from '@/app/page';

import ReturnChip from '@/components/ReturnChip';

interface SystemStatus {
  cpu: number;
  gpu: number;
  latency: number;
  version: string;
  timestamp: Date;
}

interface DashboardLayoutV2Props {
  currentTab?: any;
  setCurrentTab?: (tab: any) => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  isAdmin: boolean;
  user: any;
  logout: () => void;
  systemStatus: SystemStatus;
  isAdminMode?: boolean;
  activeAdminSection?: any;
  setActiveAdminSection?: (section: any) => void;
  setIsAdminMode?: (value: boolean) => void;
  handleExportPDF: () => void;
  handleExportCSV: () => void;
  handleProcessViolation: (detection: any) => void;
  violationContext: ViolationEvent | null;
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
}

export default function DashboardLayoutV2({
  selectedDate,
  onDateChange,
  isAdmin,
  user,
  logout,
  systemStatus,
  handleExportPDF,
  handleExportCSV,
  handleProcessViolation,
  violationContext,
  addToast,
}: DashboardLayoutV2Props) {
  const [activeView, setActiveView] = useState<ViewKey>('overview');
  const [activeTab, setActiveTab] = useState<string>('');
  const { metrics } = useRealSystemMetrics(5000);

  // Sync with URL query params ?view=...&tab=... and crossnav events
  useEffect(() => {
    const handleUrlSync = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view') as ViewKey;
      const tabParam = params.get('tab');

      if (viewParam === 'cases' && tabParam === 'legal') {
        setActiveView('legal');
        setActiveTab('catalog');
        return;
      }

      if (viewParam === 'ai') {
        if (tabParam === 'debug') {
          setActiveView('ai-debug');
          setActiveTab('debug');
          return;
        }
        if (tabParam === 'logs' || tabParam === 'log') {
          setActiveView('ai-logs');
          setActiveTab('logs');
          return;
        }
        setActiveView('ai-config');
        setActiveTab('config');
        return;
      }

      if (viewParam === 'settings') {
        if (tabParam === 'storage') {
          setActiveView('settings-storage');
          setActiveTab('storage');
          return;
        }
        if (tabParam === 'integrations') {
          setActiveView('settings-integrations');
          setActiveTab('integrations');
          return;
        }
        if (tabParam === 'maintenance') {
          setActiveView('settings-maintenance');
          setActiveTab('maintenance');
          return;
        }
        setActiveView('settings-org');
        setActiveTab('org');
        return;
      }

      if (viewParam && findNavigationItem(viewParam)) {
        setActiveView(viewParam);
        if (tabParam) {
          setActiveTab(tabParam);
        } else {
          setActiveTab(findNavigationItem(viewParam)?.defaultTab || '');
        }
      }
    };

    handleUrlSync();

    const handleCustomNav = (e: any) => {
      const detail = e.detail;
      if (detail && detail.view && findNavigationItem(detail.view)) {
        setActiveView(detail.view);
        setActiveTab(detail.tab || findNavigationItem(detail.view)?.defaultTab || '');
      }
    };

    window.addEventListener('popstate', handleUrlSync);
    window.addEventListener('crossnav:navigate', handleCustomNav);

    return () => {
      window.removeEventListener('popstate', handleUrlSync);
      window.removeEventListener('crossnav:navigate', handleCustomNav);
    };
  }, []);

  const handleSelectView = (view: ViewKey, tab?: string) => {
    setActiveView(view);
    const item = findNavigationItem(view);
    const targetTab = tab || item?.defaultTab || '';
    setActiveTab(targetTab);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', view);
      if (targetTab) {
        url.searchParams.set('tab', targetTab);
      } else {
        url.searchParams.delete('tab');
      }
      window.history.pushState({}, '', url.toString());
    }
  };

  const handleSubTabChange = (tab: string) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.pushState({}, '', url.toString());
    }
  };

  const roleInfo = formatRole(user?.role || (isAdmin ? 'admin' : 'viewer'));

  return (
    <div className="flex h-screen bg-slate-50 text-slate-950 overflow-hidden">
      {/* 11-Item Sidebar */}
      <DashboardSidebarV2
        activeNavKey={activeView}
        isAdmin={isAdmin}
        userRole={user?.role}
        user={user}
        logout={logout}
        onSelectView={handleSelectView}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-2 shadow-sm xl:px-6">
          <div className="flex min-h-[52px] items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ReturnChip />
              <span className="text-sm font-bold tracking-tight text-slate-900">
                {findNavigationItem(activeView)?.label || 'Tổng quan'}
              </span>
              <span className="text-xs text-slate-400">|</span>
              <span className="text-xs text-slate-500 hidden sm:inline">
                {findNavigationItem(activeView)?.description || ''}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 text-xs">
              {/* Server Clock */}
              <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600 md:flex font-mono">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  {systemStatus.timestamp.toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>

              {/* Online status */}
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-700 font-medium">
                <Server className="h-3.5 w-3.5" />
                <span>Hệ thống trực tuyến</span>
              </div>

              {/* Real Server Load */}
              <div className="hidden items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600 lg:flex font-medium">
                <span className="inline-flex items-center gap-1">
                  <Cpu className="h-3.5 w-3.5 text-sky-500" />
                  CPU: {metrics ? `${metrics.cpu_percent}%` : `${systemStatus.cpu.toFixed(0)}%`}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-indigo-500" />
                  RAM: {metrics ? `${metrics.ram_percent}%` : '--'}
                </span>
              </div>

              {/* User Profile Badge */}
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 shadow-sm">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
                  {user?.username?.charAt(0).toUpperCase() || 'A'}
                </div>
                <div className="hidden leading-tight sm:block text-left">
                  <p className="text-[12px] font-semibold text-slate-900">{user?.username || 'Quản trị viên'}</p>
                  <p className="text-[10px] text-slate-500">{roleInfo.label}</p>
                </div>
              </div>

              {/* Logout */}
              {logout && (
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100"
                  title="Đăng xuất"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area: Full-width layout with uniform 24px (p-6) padding */}
        <main className="min-h-0 flex-1 overflow-auto bg-slate-50 p-6">
          <div className="w-full">
            {/* 1. Overview */}
            {activeView === 'overview' && (
              <OverviewView
                onNavigate={handleSelectView}
                onSelectViolation={handleProcessViolation}
              />
            )}

            {/* 2. Live Monitoring */}
            {activeView === 'live' && (
              <CameraMonitoring
                onSelectLicensePlate={(detection) => {
                  handleProcessViolation(detection);
                  setActiveView('cases');
                  setActiveTab('records');
                }}
                activeTab={activeTab}
                onTabChange={handleSubTabChange}
              />
            )}

            {/* 3. Dispatch / Signals */}
            {activeView === 'dispatch' && (
              <CoordinationCenter selectedDate={selectedDate} />
            )}

            {/* 4. Cases */}
            {activeView === 'cases' && (
              <CasesView
                selectedDate={selectedDate}
                violationContext={violationContext}
                activeTab={activeTab || 'records'}
                onTabChange={handleSubTabChange}
              />
            )}

            {/* 4b. Legal Basis */}
            {activeView === 'legal' && <LegalCatalogView />}

            {/* 5. Data Center */}
            {activeView === 'data-center' && (
              <DataCenterView
                selectedDate={selectedDate}
                onDateChange={onDateChange}
                onExportPDF={handleExportPDF}
                onExportCSV={handleExportCSV}
                addToast={addToast}
              />
            )}

            {/* 6. Analytics */}
            {activeView === 'analytics' && (
              <AnalysisCenter
                selectedDate={selectedDate}
                viewMode="analytics"
                onDateChange={onDateChange}
                onExportPDF={handleExportPDF}
                onExportCSV={handleExportCSV}
                addToast={addToast}
              />
            )}

            {/* 7. Devices */}
            {activeView === 'devices' && (
              <DevicesView
                activeTab={activeTab || 'list'}
                onTabChange={handleSubTabChange}
                isAdmin={isAdmin}
              />
            )}

            {/* 8. AI Center Views */}
            {activeView === 'ai-config' && (
              <AIView activeTab="config" onSelectLicensePlate={handleProcessViolation} />
            )}
            {activeView === 'ai-debug' && (
              <AIView activeTab="debug" onSelectLicensePlate={handleProcessViolation} />
            )}
            {activeView === 'ai-logs' && (
              <AIView activeTab="logs" onSelectLicensePlate={handleProcessViolation} />
            )}
            {activeView === 'ai' && (
              <AIView
                activeTab={activeTab || 'config'}
                onTabChange={handleSubTabChange}
                onSelectLicensePlate={handleProcessViolation}
              />
            )}

            {/* 9. Settings Views */}
            {activeView === 'settings-org' && <SettingsView activeTab="org" />}
            {activeView === 'settings-storage' && <SettingsView activeTab="storage" />}
            {activeView === 'settings-integrations' && <SettingsView activeTab="integrations" />}
            {activeView === 'settings-maintenance' && <SettingsView activeTab="maintenance" />}
            {activeView === 'settings' && (
              <SettingsView
                activeTab={activeTab || 'general'}
                onTabChange={handleSubTabChange}
              />
            )}

            {/* 10. Users */}
            {activeView === 'users' && <UserAccessManagement />}

            {/* 11. Audit Logs */}
            {activeView === 'audit' && (
              <AuditView
                activeTab={activeTab || 'actions'}
                onTabChange={handleSubTabChange}
              />
            )}
          </div>
        </main>
      </div>

      {/* Global Floating AI Assistant Widget */}
      <FloatingAIAssistant />
    </div>
  );
}
