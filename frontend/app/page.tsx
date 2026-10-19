'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  exportToCSV,
  exportToPDF,
  type DetectionExport,
} from '@/lib/exportUtils';
import { Tabs } from '@/components/ui/tabs';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AdminPanel from '@/components/AdminPanel';
import DashboardLayoutV2 from '@/components/DashboardLayoutV2';
import CameraMonitoring from '@/components/CameraMonitoring';
import AnalysisCenter from '@/components/AnalysisCenter';
import CoordinationCenter from '@/components/CoordinationCenter';
import ViolationCenter from '@/components/ViolationCenter';
import ViolationCatalog from '@/components/ViolationCatalog';
import { ToastContainer, useToast } from '@/components/Toast';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/lib/AuthContext';
import { DASHBOARD_LAYOUT_MODE } from '@/lib/dashboardLayout';
import { goTo } from '@/lib/crossNav';
import { Bot, BookOpen, ChevronRight, Monitor, Route, TrendingUp } from 'lucide-react';

export interface ViolationEvent {
  id: string;
  plateNumber: string;
  timestamp: string;
  vehicleType: string;
  vehicleImage: string;
  plateImage: string;
  violationType: string;
  violation?: string;
  location: string;
  ocr_score?: number;
  plate_crop_source?: string;
  plate_debug_reason?: string;
  plate_debug_variant?: string;
  is_simulated?: boolean;
  is_temporary?: boolean;
}

type TabId = 'camera' | 'overview' | 'analysis' | 'coordination' | 'violations' | 'catalog' | 'ai-debug';
type AdminSectionId = 'devices' | 'violations' | 'infrastructure' | 'ai-config' | 'settings' | 'users' | 'logs';
type NavigationItem = {
  id: TabId;
  label: string;
  description: string;
  icon: typeof Monitor;
  accent: string;
};
type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const getVietnamDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = parts.reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${values.year}-${values.month}-${values.day}`;
};

export default function Dashboard() {
  const [currentTab, setCurrentTab] = useState<TabId>('camera');
  const { toasts, addToast, removeToast } = useToast();
  const [selectedDate, setSelectedDate] = useState('');
  const automaticDateRef = useRef('');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSectionId>('devices');
  const [violationContext, setViolationContext] = useState<ViolationEvent | null>(null);

  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isViewer = user?.role === 'viewer';
  const systemStatus = useSystemStatus();
  const isLayoutV2 = DASHBOARD_LAYOUT_MODE === 'v2';

  useEffect(() => {
    const syncAutomaticDate = () => {
      const today = getVietnamDateKey();
      setSelectedDate((previousDate) => {
        if (!previousDate || previousDate === automaticDateRef.current) {
          automaticDateRef.current = today;
          return today;
        }
        return previousDate;
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncAutomaticDate();
      }
    };

    syncAutomaticDate();
    const timer = window.setInterval(syncAutomaticDate, 60_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', syncAutomaticDate);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', syncAutomaticDate);
    };
  }, []);

  useEffect(() => {
    if (!isAdmin && currentTab === 'coordination') {
      setCurrentTab('camera');
    }
  }, [isAdmin, currentTab]);

  const navigationGroups: NavigationGroup[] = [
    {
      label: 'Van hanh',
      items: [
        {
          id: 'camera' as const,
          label: 'Giám sát',
          description: 'Camera, nhat ky xe co va canh bao tuc thoi',
          icon: Monitor,
          accent: 'from-sky-500/20 to-cyan-500/5',
        },
        {
          id: 'analysis' as const,
          label: 'Phân tích',
          description: 'Bieu do tong quan, heatmap lan va hanh vi cut-in',
          icon: TrendingUp,
          accent: 'from-amber-500/20 to-orange-500/5',
        },
      ],
    },
    {
      label: 'Dieu hanh',
      items: [
        ...(isAdmin
          ? [{
              id: 'coordination' as const,
              label: 'Phân luồng',
              description: 'Tình huống điều phối và ưu tiên giao thông',
              icon: Route,
              accent: 'from-emerald-500/20 to-teal-500/5',
            }]
          : []),
        {
          id: 'violations' as const,
          label: 'Trợ lý AI',
          description: 'Hồ sơ vi phạm, tư vấn xử lý và truy vấn',
          icon: Bot,
          accent: 'from-violet-500/20 to-fuchsia-500/5',
        },
        {
          id: 'catalog' as const,
          label: 'Căn cứ xử phạt',
          description: 'Tra cứu mức phạt, căn cứ pháp lý theo NĐ 168/2024',
          icon: BookOpen,
          accent: 'from-slate-500/20 to-zinc-500/5',
        },
      ],
    },
  ];

  const currentTabMeta: NavigationItem =
    navigationGroups.flatMap((group) => group.items).find((item) => item.id === currentTab) ||
    navigationGroups[0].items[0];

  const handleExportPDF = async () => {
    addToast('Dang xuat bao cao PDF...', 'success', 2000);
    try {
      const res = await fetch('/api/history?limit=200&complete_evidence_only=true', { credentials: 'include' });
      if (!res.ok) throw new Error(`History API returned ${res.status}`);
      const data = await res.json();
      const items = data.items || [];
      const exportData: DetectionExport[] = items.map((v: any) => ({
        id: v.id || v.track_id,
        timestamp: v.timestamp,
        class: v.vehicle_type || v.class || '',
        plate_number: v.plate_number || '',
        confidence: v.confidence || 0,
        camera: v.camera_id || v.camera || 'CAM_01',
        violation_type: v.violation_type,
        is_simulated: Boolean(v.is_simulated),
        vehicle_image: v.vehicle_crop_b64
          ? `data:image/jpeg;base64,${v.vehicle_crop_b64}`
          : (v.vehicle_image || ''),
        plate_image: v.plate_crop_b64
          ? `data:image/jpeg;base64,${v.plate_crop_b64}`
          : (v.plate_image || ''),
      }));
      await exportToPDF(exportData, new Date().toLocaleDateString('vi-VN'));
    } catch {
      addToast('Loi xuat PDF, vui long thu lai.', 'error', 3000);
    }
  };

  const handleExportCSV = async () => {
    addToast('Dang xuat du lieu CSV...', 'success', 2000);
    try {
      const res = await fetch('/api/history?limit=200&complete_evidence_only=true', { credentials: 'include' });
      if (!res.ok) throw new Error(`History API returned ${res.status}`);
      const data = await res.json();
      const items = data.items || [];
      const exportData: DetectionExport[] = items.map((v: any) => ({
        id: v.id || v.track_id,
        timestamp: v.timestamp,
        class: v.vehicle_type || v.class || '',
        plate_number: v.plate_number || '',
        confidence: v.confidence || 0,
        camera: v.camera_id || v.camera || 'CAM_01',
        violation_type: v.violation_type,
        is_simulated: Boolean(v.is_simulated),
        vehicle_image: v.vehicle_crop_b64
          ? `data:image/jpeg;base64,${v.vehicle_crop_b64}`
          : (v.vehicle_image || ''),
        plate_image: v.plate_crop_b64
          ? `data:image/jpeg;base64,${v.plate_crop_b64}`
          : (v.plate_image || ''),
      }));
      exportToCSV(exportData);
    } catch {
      addToast('Loi xuat CSV, vui long thu lai.', 'error', 3000);
    }
  };

  const handleProcessViolation = (detection: any) => {
    const vehicleImage =
      detection.vehicle_image ||
      (detection.vehicle_crop_b64 ? `data:image/jpeg;base64,${detection.vehicle_crop_b64}` : '') ||
      detection.plate_image ||
      '';
    const plateImage =
      detection.plate_image ||
      (detection.plate_crop_b64 ? `data:image/jpeg;base64,${detection.plate_crop_b64}` : '') ||
      vehicleImage ||
      '';

    const rawPlate = (detection.plate_number || detection.licensePlate || detection.plate || '').trim();

    const violation: ViolationEvent = {
      id: String(detection.id || crypto.randomUUID()),
      plateNumber: rawPlate || 'Chưa rõ biển số',
      timestamp: detection.last_seen_at || detection.timestamp || new Date().toISOString(),
      vehicleType: detection.vehicle_type_vi || detection.class || detection.vehicle_type || 'Unknown',
      vehicleImage,
      plateImage,
      violationType: detection.violation_type || '',
      violation: detection.violation_type || 'Chưa ghi nhận vi phạm',
      location: detection.camera_id || detection.camera || 'CAM_01',
      ocr_score: Number(detection.ocr_score || 0),
      plate_crop_source: detection.plate_crop_source || '',
      plate_debug_reason: detection.plate_debug_reason || '',
      plate_debug_variant: detection.plate_debug_variant || '',
      is_simulated: !!detection.is_simulated,
      is_temporary: !!detection.is_temporary,
    };

    setViolationContext(violation);
    setIsAdminMode(false);
    setCurrentTab('violations');

    goTo(
      { view: 'cases', tab: 'records' },
      {
        case: String(detection.id || ''),
        plate: rawPlate,
        open: 1,
      }
    );
  };

  if (isAdminMode && !isLayoutV2) {
    return (
      <AuthGuard>
        <div className="flex h-screen bg-background text-foreground">
          <AdminPanel onExit={() => setIsAdminMode(false)} onProcessViolation={handleProcessViolation} />
          <ToastContainer toasts={toasts} removeToast={removeToast} />
        </div>
      </AuthGuard>
    );
  }

  if (isLayoutV2) {
    return (
      <AuthGuard>
        <DashboardLayoutV2
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          isAdmin={isAdmin}
          user={user}
          logout={logout}
          systemStatus={systemStatus}
          isAdminMode={isAdminMode}
          activeAdminSection={activeAdminSection}
          setActiveAdminSection={setActiveAdminSection}
          setIsAdminMode={setIsAdminMode}
          handleExportPDF={handleExportPDF}
          handleExportCSV={handleExportCSV}
          handleProcessViolation={handleProcessViolation}
          violationContext={violationContext}
          addToast={addToast}
        />
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="flex h-screen bg-background text-foreground">
        {!isViewer && <Sidebar onAdminClick={() => setIsAdminMode(true)} />}

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            systemStatus={systemStatus}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onExportPDF={handleExportPDF}
            onExportCSV={handleExportCSV}
            currentTab={currentTab}
          />

          <main className="flex-1 overflow-auto bg-muted/20">
            <div className="p-3 sm:p-4 lg:p-5 xl:p-6 2xl:p-8">
              <Tabs value={currentTab} onValueChange={(value) => setCurrentTab(value as TabId)} className="w-full">
                <div className="mb-6">
                  <h1 className="text-lg lg:text-xl xl:text-2xl 2xl:text-3xl font-bold mb-1 xl:mb-2 text-balance">
                    HỆ THỐNG QUẢN LÝ GIAO THÔNG
                  </h1>
                  <p className="text-xs lg:text-sm xl:text-base text-muted-foreground hidden lg:block">
                    Giám sát, phân tích và điều phối giao thông thời gian thực tại 6 nút giao chính Hà Nội
                  </p>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[288px_minmax(0,1fr)] gap-5 xl:gap-6">
                  <aside className="space-y-4">
                    <div className="rounded-3xl border border-border bg-card/95 p-3 shadow-sm">
                      <div className="mb-3 px-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          Dieu huong bang dieu khien
                        </p>
                      </div>

                      <div className="space-y-3">
                        {navigationGroups.map((group) => (
                          <div key={group.label} className="space-y-1.5">
                            <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {group.label}
                            </div>
                            {group.items.map((item) => {
                              const Icon = item.icon;
                              const active = currentTab === item.id;

                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => setCurrentTab(item.id)}
                                  className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${
                                    active
                                      ? `border-foreground/10 bg-gradient-to-r ${item.accent} shadow-sm`
                                      : 'border-transparent bg-muted/35 hover:border-border hover:bg-muted/65'
                                  }`}
                                >
                                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                                    active ? 'bg-white/85 text-foreground shadow-sm' : 'bg-background text-muted-foreground'
                                  }`}>
                                    <Icon className="h-5 w-5" />
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-foreground">{item.label}</span>
                                      {active && (
                                        <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">
                                          Dang xem
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                                  </div>

                                  <ChevronRight
                                    className={`h-4 w-4 shrink-0 transition-transform ${
                                      active ? 'translate-x-0 text-foreground' : 'text-muted-foreground group-hover:translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-border bg-card/90 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Muc dang chon</p>
                      <div className="mt-2 text-lg font-semibold text-foreground">{currentTabMeta.label}</div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{currentTabMeta.description}</p>
                    </div>
                  </aside>

                  <section className="min-w-0">
                    <div
                      style={{
                        visibility: currentTab === 'camera' ? 'visible' : 'hidden',
                        height: currentTab === 'camera' ? 'auto' : '0',
                        overflow: 'hidden',
                      }}
                    >
                      <CameraMonitoring onSelectLicensePlate={handleProcessViolation} />
                    </div>

                    <div
                      style={{
                        visibility: currentTab === 'analysis' ? 'visible' : 'hidden',
                        height: currentTab === 'analysis' ? 'auto' : '0',
                        overflow: 'hidden',
                      }}
                    >
                      <AnalysisCenter selectedDate={selectedDate} addToast={addToast} />
                    </div>

                    {isAdmin && (
                      <div
                        style={{
                          visibility: currentTab === 'coordination' ? 'visible' : 'hidden',
                          height: currentTab === 'coordination' ? 'auto' : '0',
                          overflow: 'hidden',
                        }}
                      >
                        <CoordinationCenter selectedDate={selectedDate} />
                      </div>
                    )}

                    <div
                      style={{
                        visibility: currentTab === 'violations' ? 'visible' : 'hidden',
                        height: currentTab === 'violations' ? 'auto' : '0',
                        overflow: 'hidden',
                      }}
                    >
                      <ViolationCenter selectedDate={selectedDate} violationContext={violationContext} />
                    </div>

                    <div
                      style={{
                        visibility: currentTab === 'catalog' ? 'visible' : 'hidden',
                        height: currentTab === 'catalog' ? 'auto' : '0',
                        overflow: 'hidden',
                      }}
                    >
                      <div className="rounded-lg border border-border bg-card/95 p-5 shadow-sm min-h-[600px]">
                        <ViolationCatalog />
                      </div>
                    </div>
                  </section>
                </div>
              </Tabs>
            </div>

            <footer className="border-t border-border bg-card px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium">XE UU TIEN</span>
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-xs text-muted-foreground">(BAT)</span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  {user?.role === 'admin' ? 'Admin' : 'User'}
                  <span className="font-medium text-gray-300">{user?.username}</span>
                  <span className="text-gray-600">|</span>
                  <span className="capitalize text-gray-500">{user?.role}</span>
                </span>
                <button
                  onClick={logout}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-900 hover:border-red-700 transition-colors"
                >
                  Dang xuat
                </button>
              </div>
            </footer>
          </main>
        </div>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </div>
    </AuthGuard>
  );
}
