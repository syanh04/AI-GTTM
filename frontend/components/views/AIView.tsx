'use client';

import React from 'react';
import AIConfiguration from '@/components/admin/AIConfiguration';
import AIDebugPanel from '@/components/AIDebugPanel';
import DetectionLog from '@/components/DetectionLog';

interface AIViewProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onSelectLicensePlate?: (detection: any) => void;
}

export default function AIView({
  activeTab = 'config',
  onSelectLicensePlate,
}: AIViewProps) {
  const currentTab =
    activeTab === 'debug' ? 'debug' : activeTab === 'log' || activeTab === 'logs' ? 'log' : 'config';

  return (
    <div className="space-y-4">
      {currentTab === 'config' && <AIConfiguration />}

      {currentTab === 'debug' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <AIDebugPanel />
        </div>
      )}

      {currentTab === 'log' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-900">Nhật ký suy luận thời gian thực</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Danh sách các lượt nhận diện phương tiện và biển số trích xuất từ mô hình YOLOv11 & PaddleOCR
            </p>
          </div>
          <DetectionLog onSelectLicensePlate={onSelectLicensePlate || (() => {})} selectedCamera="CAM_01" />
        </div>
      )}
    </div>
  );
}
