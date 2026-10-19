'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { useVideoState } from '@/lib/VideoContext';
import { useAuth } from '@/lib/AuthContext';

export default function AIControlPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const {
    detectVehicle,
    setDetectVehicle,
    detectPlate,
    setDetectPlate,
    simulationMode,
    setSimulationMode,
    showBox,
    setShowBox,
    simulatePlateMode,
    setSimulatePlateMode,
    sourceMode,
    setSourceMode,
    preferredRtspUrl,
    setPreferredRtspUrl,
    effectiveDetectVehicle,
    effectiveDetectPlate,
  } = useVideoState();

  const [rtspDraft, setRtspDraft] = useState(preferredRtspUrl);

  useEffect(() => {
    setRtspDraft(preferredRtspUrl);
  }, [preferredRtspUrl]);

  const handleSimulationToggle = (enabled: boolean) => {
    if (enabled) setDetectVehicle(true);
    setSimulationMode(enabled);
    if (!enabled) setSimulatePlateMode(false);
  };

  const handleVehicleToggle = (enabled: boolean) => {
    setDetectVehicle(enabled);
    if (!enabled) {
      setDetectPlate(false);
      setSimulatePlateMode(false);
    }
  };

  const handlePlateToggle = (enabled: boolean) => {
    if (enabled) setDetectVehicle(true);
    setDetectPlate(enabled);
    if (!enabled) setSimulatePlateMode(false);
  };

  const handleRtspApply = () => {
    setPreferredRtspUrl(rtspDraft.trim());
  };

  const toggleClass = (enabled: boolean, activeColor: string) =>
    `relative inline-flex h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none ${
      enabled ? activeColor : 'bg-gray-300'
    } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`;

  const knobClass = (enabled: boolean) =>
    `inline-block h-5 w-5 mt-0.5 ml-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
      enabled ? 'translate-x-5' : 'translate-x-0'
    }`;

  return (
    <Card className="p-4">
      <h3 className="mb-4 text-sm font-semibold text-foreground">AI Điều Khiển</h3>

      <div className="space-y-4">
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-muted-foreground">Nhận Diện Xe</span>
          <button
            type="button"
            aria-label="Nhận diện xe"
            aria-pressed={detectVehicle}
            onClick={() => handleVehicleToggle(!detectVehicle)}
            disabled={!isAdmin}
            title={!isAdmin ? 'Chỉ admin mới có quyền này' : ''}
            className={toggleClass(detectVehicle, 'bg-green-500')}
          >
            <span className={knobClass(detectVehicle)} />
          </button>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-muted-foreground">Nhận Diện Biển Số</span>
          <button
            type="button"
            aria-label="Nhận diện biển số"
            aria-pressed={detectPlate}
            onClick={() => handlePlateToggle(!detectPlate)}
            disabled={!isAdmin}
            title={!isAdmin ? 'Chỉ admin mới có quyền này' : ''}
            className={toggleClass(detectPlate, 'bg-green-500')}
          >
            <span className={knobClass(detectPlate)} />
          </button>
        </div>

        {isAdmin && (
          <div className="flex items-center justify-between py-2 rounded bg-amber-500/5 px-2 border border-amber-500/20">
            <div>
              <span className="text-sm font-medium text-amber-700">Chế độ mô phỏng</span>
              <span className="block text-[11px] text-amber-600">Dữ liệu thử nghiệm, loại khỏi thống kê chính thức</span>
            </div>
            <button
              type="button"
              aria-label="Chế độ mô phỏng"
              aria-pressed={simulationMode}
              onClick={() => handleSimulationToggle(!simulationMode)}
              className={toggleClass(simulationMode, 'bg-amber-600')}
            >
              <span className={knobClass(simulationMode)} />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between py-2">
          <div>
            <span className="block text-sm text-muted-foreground">Hiển Thị Box</span>
            <span className="text-xs text-muted-foreground/70">
              Vẽ khung nhận diện phương tiện lên video
            </span>
          </div>
          <button
            type="button"
            aria-label="Hiển thị box nhận diện"
            aria-pressed={showBox}
            onClick={() => setShowBox(!showBox)}
            disabled={!isAdmin}
            title={!isAdmin ? 'Chỉ admin mới có quyền này' : ''}
            className={toggleClass(showBox, 'bg-blue-500')}
          >
            <span className={knobClass(showBox)} />
          </button>
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <span className="block text-sm text-muted-foreground">Mô Phỏng Biển Số</span>
            <span className="text-xs text-muted-foreground/70">Sinh biển giả cho phát hiện mới trong chế độ Simulation</span>
          </div>
          <button
            type="button"
            aria-label="Mô phỏng biển số"
            aria-pressed={simulatePlateMode}
            onClick={() => setSimulatePlateMode(!simulatePlateMode)}
            disabled={!simulationMode || !detectPlate || !isAdmin}
            title={!isAdmin ? 'Chỉ admin mới có quyền này' : !simulationMode ? 'Bật Chế độ mô phỏng trước' : !detectPlate ? 'Bật nhận diện biển số trước' : ''}
            className={`relative inline-flex h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none ${
              simulatePlateMode ? 'bg-purple-500' : 'bg-gray-300'
            } ${
              (!simulationMode || !detectPlate || !isAdmin) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <span className={knobClass(simulatePlateMode)} />
          </button>
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Nguồn Cho Tab Giám Sát</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSourceMode('default')}
                disabled={!isAdmin}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  sourceMode === 'default'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Video có sẵn
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('rtsp')}
                disabled={!isAdmin}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  sourceMode === 'rtsp'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Luồng RTSP
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground/80">
              Chọn nguồn hiển thị cho tab Giám sát giữa video có sẵn của hệ thống và luồng RTSP.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs text-muted-foreground">
              RTSP mặc định
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={rtspDraft}
                onChange={(e) => setRtspDraft(e.target.value)}
                placeholder="rtsp://192.168.1.146:8554/view100/cam13"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={handleRtspApply}
                disabled={!isAdmin}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs text-muted-foreground">Trạng Thái</p>
          <div className="flex flex-wrap gap-2">
            <div className={`rounded px-2 py-1 text-xs font-medium ${effectiveDetectVehicle ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
              {effectiveDetectVehicle ? '✓ Bật' : '✗ Tắt'} Xe
            </div>
            <div className={`rounded px-2 py-1 text-xs font-medium ${effectiveDetectPlate ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
              {effectiveDetectPlate ? '✓ Bật' : '✗ Tắt'} Biển
            </div>
            <div className={`rounded px-2 py-1 text-xs font-medium ${simulationMode ? 'bg-purple-100 text-purple-800' : 'bg-red-100 text-red-800'}`}>
              {simulationMode ? 'Đang giả lập' : 'Phát hiện thật'}
            </div>
            <div className={`rounded px-2 py-1 text-xs font-medium ${showBox ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>
              Box {showBox ? 'đang bật' : 'đang tắt'}
            </div>
            <div className={`rounded px-2 py-1 text-xs font-medium ${simulatePlateMode ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'}`}>
              Biển giả {simulatePlateMode ? 'đang bật' : 'đang tắt'}
            </div>
            <div className={`rounded px-2 py-1 text-xs font-medium ${sourceMode === 'rtsp' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>
              {sourceMode === 'rtsp' ? 'Luồng RTSP' : 'Video có sẵn'}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
