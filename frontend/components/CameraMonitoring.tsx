'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { RotateCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import CameraGrid from './CameraGrid';
import DrawingCanvas from './DrawingCanvas';
import DetectionLog from './DetectionLog';
import { useAuth } from '@/lib/AuthContext';
import { useVideoState } from '@/lib/VideoContext';
import { useCameraStatus } from '@/lib/cameraStatus';
import { useSearchParams } from 'next/navigation';
import { goTo, getSelectedCamera, setSelectedCamera as setGlobalCamera } from '@/lib/crossNav';

interface CameraMonitoringProps {
  onSelectLicensePlate: (detection: any) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export default function CameraMonitoring({
  onSelectLicensePlate,
  activeTab: propTab,
  onTabChange,
}: CameraMonitoringProps) {
  const [internalTab, setInternalTab] = useState(
    propTab === 'zones' || propTab === 'config' ? 'config' : 'grid',
  );
  const activeTab = propTab === 'zones' || propTab === 'config' ? 'config' : internalTab;

  const handleTabChange = (val: string) => {
    setInternalTab(val);
    onTabChange?.(val === 'config' ? 'zones' : 'cameras');
  };

  const searchParams = useSearchParams();
  const urlCam = searchParams?.get('camera');
  const [selectedCamera, setSelectedCamera] = useState(urlCam || getSelectedCamera() || 'CAM_01');
  const [resetTrigger, setResetTrigger] = useState(0);
  const { user } = useAuth();
  const { sourceMode } = useVideoState();
  const { activeCameraIds, isCameraEnabled } = useCameraStatus();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (urlCam) {
      setSelectedCamera(urlCam);
      setGlobalCamera(urlCam);
    }
  }, [urlCam]);

  const handleSelectCamera = (camId: string) => {
    setSelectedCamera(camId);
    setGlobalCamera(camId);
  };

  useEffect(() => {
    if (propTab) {
      setInternalTab(propTab === 'zones' || propTab === 'config' ? 'config' : 'grid');
    }
  }, [propTab]);

  useEffect(() => {
    if (isCameraEnabled(selectedCamera)) return;
    const fallback = activeCameraIds[0] || 'CAM_01';
    setSelectedCamera(fallback);
    setGlobalCamera(fallback);
  }, [activeCameraIds, isCameraEnabled, selectedCamera]);

  useEffect(() => {
    if (!isAdmin && activeTab === 'config') {
      handleTabChange('grid');
    }
  }, [activeTab, isAdmin]);

  const handleResetSession = async () => {
    try {
      const params = new URLSearchParams({
        source_mode: sourceMode,
        camera_id: selectedCamera,
      });
      await fetch(`/api/reset-session?${params.toString()}`, {
        method: 'POST',
      });
      setResetTrigger((prev) => prev + 1);
    } catch (error) {
      console.error('Reset session failed:', error);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3">
        <div className="col-span-1">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <TabsList className={`grid w-fit gap-2 h-8 p-0.5 ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <TabsTrigger value="grid" className="py-1.5 text-xs">Giám Sát Camera</TabsTrigger>
                {isAdmin && <TabsTrigger value="config" className="py-1.5 text-xs">Cấu Hình Vùng Vi Phạm</TabsTrigger>}
              </TabsList>
            </div>

            <TabsContent value="grid" className="mt-0">
              <CameraGrid selectedCamera={selectedCamera} onSelectCamera={handleSelectCamera} />
            </TabsContent>

            <TabsContent value="config" className="mt-0">
              {activeCameraIds.length > 0 ? (
                <DrawingCanvas selectedCamera={selectedCamera} />
              ) : (
                <Card className="p-6 text-center text-sm text-slate-500">
                  {'T\u1ea5t c\u1ea3 camera \u0111ang t\u1eaft. B\u1eadt l\u1ea1i camera trong m\u1ee5c Qu\u1ea3n l\u00fd camera \u0111\u1ec3 c\u1ea5u h\u00ecnh v\u00f9ng vi ph\u1ea1m.'}
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Bảng Ghi Nhận Phương Tiện & Biển Số</h3>
          <button
            onClick={handleResetSession}
            disabled={!isAdmin}
            title={!isAdmin ? 'Chỉ admin mới có quyền này' : 'Xóa session'}
            className={`flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 ${
              !isAdmin ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            Xóa
          </button>
        </div>
        <DetectionLog onSelectLicensePlate={onSelectLicensePlate} resetTrigger={resetTrigger} selectedCamera={selectedCamera || 'CAM_01'} />
      </Card>
    </div>
  );
}
