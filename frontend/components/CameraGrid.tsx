'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { MapPin, Upload, Download, ZoomIn } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import MapPanel from './MapPanel';
import { useVideoState } from '@/lib/VideoContext';
import DynamicCameraGrid from './DynamicCameraGrid';
import { useCameraStatus } from '@/lib/cameraStatus';
// ← ĐÃ THÊM: DynamicCameraGrid

interface Camera {
  id: string;
  name: string;
  location: string;
  status: 'active' | 'inactive';
}

const cameras: Camera[] = [
  { id: 'CAM_01', name: 'CAM 01', location: 'Cầu Giấy', status: 'active' },
  { id: 'CAM_02', name: 'CAM 02', location: 'Đống Đa', status: 'active' },
  { id: 'CAM_03', name: 'CAM 03', location: 'Tây Hồ', status: 'active' },
  { id: 'CAM_04', name: 'CAM 04', location: 'Hoàn Kiếm', status: 'active' },
  { id: 'CAM_05', name: 'CAM 05', location: 'Hoàn Kiếm', status: 'active' },
  { id: 'CAM_06', name: 'CAM 06', location: 'Nam Từ Liêm', status: 'inactive' },
];

interface CameraGridProps {
  selectedCamera: string;
  onSelectCamera: (cameraId: string) => void;
}

export default function CameraGrid({ selectedCamera, onSelectCamera }: CameraGridProps) {
  // Sử dụng global state thay vì local state để video không bị mất khi chuyển tab
  const {
    cameraFrames,
    uploading,
    fileInputRef,
    handleUploadClick,
    handleFileChange,
    effectiveDetectVehicle,
    effectiveDetectPlate,
    simulationMode,
    showBox,
    simulatePlateMode,
    sourceMode,
    preferredRtspUrl,
    setPreferredRtspUrl,
    setCameraFrame,
  } = useVideoState();
  const { activeCameraIds, isCameraEnabled } = useCameraStatus();

  const [zoomedCamera, setZoomedCamera] = useState<string | null>(null);
  const [mapCamera, setMapCamera] = useState<string | null>(null);
  // ← ĐÃ THÊM: tab view
  const [activeView, setActiveView] = useState<'grid' | 'dynamic' | 'rtsp'>(
    sourceMode === 'rtsp' ? 'rtsp' : 'grid',
  );
  const rtspPriorityMode = sourceMode === 'rtsp';
  const [rtspUrl, setRtspUrl] = useState(preferredRtspUrl);
  const [rtspConnected, setRtspConnected] = useState(false);
  const [rtspStreamUrl, setRtspStreamUrl] = useState('');
  const rtspSessionKeyRef = useRef('');
  const reconnectTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const refreshStreamUrl = useCallback((streamUrl: string) => {
    const url = new URL(streamUrl, window.location.origin);
    url.searchParams.set('_', String(Date.now()));
    return url.toString();
  }, []);

  const handleCameraStreamError = useCallback((cameraId: string) => {
    if (reconnectTimersRef.current[cameraId]) return;
    reconnectTimersRef.current[cameraId] = setTimeout(() => {
      delete reconnectTimersRef.current[cameraId];
      const currentUrl = cameraFrames[cameraId];
      if (currentUrl?.includes('/video_feed/')) {
        setCameraFrame(cameraId, refreshStreamUrl(currentUrl));
      }
    }, 1200);
  }, [cameraFrames, refreshStreamUrl, setCameraFrame]);

  useEffect(() => () => {
    Object.values(reconnectTimersRef.current).forEach((timer) => clearTimeout(timer));
    reconnectTimersRef.current = {};
  }, []);

  const resetRuntimeSession = useCallback(async (mode: 'default' | 'rtsp', cameraId = selectedCamera) => {
    const params = new URLSearchParams({
      source_mode: mode,
      camera_id: cameraId,
    });
    try {
      await fetch(`/api/reset-session?${params.toString()}`, { method: 'POST' });
    } catch (error) {
      console.error('Reset runtime session failed:', error);
    }
  }, [selectedCamera]);

  const buildRtspStreamUrl = useCallback((url: string, cacheBust = false) => {
    const baseUrl = '/video_feed/rtsp_stream';
    const params = new URLSearchParams();
    params.set('rtsp_url', url);
    params.set('cam_id', selectedCamera);
    params.set('detect_vehicle', String(effectiveDetectVehicle));
    params.set('detect_plate', String(effectiveDetectPlate));
    params.set('simulation', String(simulationMode));
    params.set('simulate_plate', String(simulationMode && effectiveDetectPlate && simulatePlateMode));
    params.set('show_box', String(showBox));
    if (cacheBust) {
      params.set('_', String(Date.now()));
    }
    return `${baseUrl}?${params.toString()}`;
  }, [effectiveDetectPlate, effectiveDetectVehicle, selectedCamera, showBox, simulatePlateMode, simulationMode]);

  const handleRtspStreamError = useCallback(() => {
    if (reconnectTimersRef.current.rtsp) return;
    reconnectTimersRef.current.rtsp = setTimeout(() => {
      delete reconnectTimersRef.current.rtsp;
      if (rtspConnected && rtspUrl.trim()) {
        setRtspStreamUrl(buildRtspStreamUrl(rtspUrl.trim(), true));
      }
    }, 1500);
  }, [buildRtspStreamUrl, rtspConnected, rtspUrl]);

  useEffect(() => {
    setRtspUrl(preferredRtspUrl);
  }, [preferredRtspUrl]);

  useEffect(() => {
    if (sourceMode === 'rtsp') {
      setActiveView('rtsp');
      if (preferredRtspUrl.trim()) {
        const sessionKey = `${selectedCamera}|${preferredRtspUrl.trim()}`;
        if (rtspSessionKeyRef.current !== sessionKey) {
          rtspSessionKeyRef.current = sessionKey;
          resetRuntimeSession('rtsp', selectedCamera);
        }
        setRtspUrl(preferredRtspUrl);
        setRtspStreamUrl(buildRtspStreamUrl(preferredRtspUrl, true));
        setRtspConnected(true);
      }
      return;
    }
    rtspSessionKeyRef.current = '';
    if (activeView === 'rtsp') {
      setActiveView('grid');
    }
  }, [activeView, buildRtspStreamUrl, preferredRtspUrl, resetRuntimeSession, selectedCamera, sourceMode]);

  useEffect(() => {
    if (rtspConnected && rtspUrl) {
      setRtspStreamUrl(buildRtspStreamUrl(rtspUrl, true));
    }
  }, [buildRtspStreamUrl, rtspConnected, rtspUrl, selectedCamera]);

  // Wrapper cho DynamicCameraGrid: cần set uploadTarget trước khi trigger file dialog
  // DynamicCameraGrid tự mở file dialog riêng, không dùng fileInputRef chung
  const handleUploadForCamera = (cameraId: string, file: File) => {
    // Tạo DataTransfer object để fake ChangeEvent
    const dt = new DataTransfer();
    dt.items.add(file);
    handleUploadClick(cameraId);
    // Trigger upload trực tiếp qua fetch
    (async () => {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (response.ok) {
          const data = await response.json();
          if (data?.is_video) {
            // Stream URL sẽ được set bởi VideoContext qua handleUploadClick
          }
        }
      } catch (err) {
        console.error('Upload từ Dynamic Grid thất bại:', err);
      }
    })();
  };
  // ← ĐÃ THÊM: handleUploadForCamera

  const handleRtspConnect = async () => {
    if (!rtspUrl.trim()) return;
    const cleanedUrl = rtspUrl.trim();
    await resetRuntimeSession('rtsp', selectedCamera);
    rtspSessionKeyRef.current = `${selectedCamera}|${cleanedUrl}`;
    setPreferredRtspUrl(cleanedUrl);
    setRtspStreamUrl(buildRtspStreamUrl(cleanedUrl, true));
    setRtspConnected(true);
  };

  const handleRtspDisconnect = async () => {
    setRtspConnected(false);
    setRtspStreamUrl('');
    rtspSessionKeyRef.current = '';
    if (sourceMode === 'rtsp') {
      setPreferredRtspUrl('');
    }
    await resetRuntimeSession('default', selectedCamera);
  };
  // ← ĐÃ THÊM: RTSP handlers



  // Generate camera grid with zoom handling
  const isZoomed = zoomedCamera !== null;
  const activeCameras = cameras.filter((camera) => isCameraEnabled(camera.id));
  const displayCameras = isZoomed ? activeCameras.filter((c) => c.id === zoomedCamera) : activeCameras;
  const gridLayout = isZoomed ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-3';

  useEffect(() => {
    if (zoomedCamera && !isCameraEnabled(zoomedCamera)) {
      setZoomedCamera(null);
    }
  }, [isCameraEnabled, zoomedCamera]);

  return (
    <div className="space-y-4">
      {/* Hidden file input dùng chung cho tất cả camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Tab selector: Grid Cũ vs Grid Động */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setActiveView('grid')}
          disabled={rtspPriorityMode}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeView === 'grid'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          } ${rtspPriorityMode ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Lưới Cũ
        </button>
        <button
          onClick={() => setActiveView('dynamic')}
          disabled={rtspPriorityMode}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeView === 'dynamic'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          } ${rtspPriorityMode ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Grid Động
        </button>
        <button
          onClick={() => setActiveView('rtsp')}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeView === 'rtsp'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          Luồng Camera
        </button>
      </div>
      {/* ← ĐÃ THÊM: tab selector */}

      {rtspPriorityMode && (
        <p className="text-xs text-muted-foreground">
          {'Ch\u1ebf \u0111\u1ed9 RTSP \u0111ang b\u1eadt trong C\u1ea5u h\u00ecnh AI, nh\u00f3m video c\u00f3 s\u1eb5n \u0111ang \u0111\u01b0\u1ee3c t\u1ea1m ng\u1eaft.'}
        </p>
      )}

      {/* Dynamic Camera Grid */}
      {activeView === 'dynamic' && activeCameraIds.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold text-slate-800">Tất cả camera đang tắt</p>
          <p className="mt-1 text-xs text-slate-500">Vào Quản lý camera để bật lại camera cần giám sát.</p>
        </Card>
      )}

      {activeView === 'dynamic' && activeCameraIds.length > 0 && (
        <DynamicCameraGrid
          cameras={activeCameras.map(c => ({ id: c.id, name: c.name }))}
          cameraFrames={cameraFrames as Record<string, string | null>}
          onUpload={handleUploadForCamera}
          onStreamError={handleCameraStreamError}
        />
      )}
      {/* ← ĐÃ THÊM: DynamicCameraGrid render */}

      {/* RTSP Stream Tab */}
      {activeView === 'rtsp' && activeCameraIds.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold text-slate-800">Tất cả camera đang tắt</p>
          <p className="mt-1 text-xs text-slate-500">Luồng RTSP sẽ mở lại khi có ít nhất một camera được bật.</p>
        </Card>
      )}

      {activeView === 'rtsp' && activeCameraIds.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
            Luồng RTSP hiện đang gắn rule vi phạm của <span className="font-semibold">{selectedCamera}</span>.
          </div>
          {/* Input URL + Nút kết nối */}
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={rtspUrl}
              onChange={(e) => setRtspUrl(e.target.value)}
              placeholder="rtsp://username:password@192.168.1.x:554/stream"
              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              onKeyDown={(e) => e.key === 'Enter' && !rtspConnected && handleRtspConnect()}
            />
            {!rtspConnected ? (
              <button
                onClick={handleRtspConnect}
                disabled={!rtspUrl.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Kết Nối
              </button>
            ) : (
              <button
                onClick={handleRtspDisconnect}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Ngắt Kết Nối
              </button>
            )}
          </div>

          {/* Vùng hiển thị stream */}
          <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: 'calc(100vh - 220px)' }}>
            {rtspConnected && rtspStreamUrl ? (
              <img
                src={rtspStreamUrl}
                alt="RTSP Stream"
                className="w-full h-full object-contain"
                loading="eager"
                decoding="async"
                onError={handleRtspStreamError}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="text-5xl">📡</div>
                  <p className="text-white/60 text-sm font-medium">Luồng Camera RTSP</p>
                  <p className="text-white/30 text-xs max-w-xs">
                    Nhập RTSP URL và nhấn Kết Nối để bắt đầu phân tích AI trực tiếp
                  </p>
                </div>
              </div>
            )}
            {rtspConnected && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded px-2 py-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-white text-xs font-medium">LIVE</span>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ← ĐÃ THÊM: RTSP stream tab render */}

      {/* Camera Grid cũ: chỉ hiển thị khi ở chế độ Grid Cũ */}
      {activeView === 'grid' && (
      <>
      {/* Camera Grid 2x3 */}
      {activeCameraIds.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold text-slate-800">Tất cả camera đang tắt</p>
          <p className="mt-1 text-xs text-slate-500">Vào Quản lý camera để bật lại camera cần giám sát.</p>
        </Card>
      ) : (
      <div className={`grid ${gridLayout} gap-2`}>
        {displayCameras.map((camera) => (
          <Card
            key={camera.id}
            onClick={() => onSelectCamera(camera.id)}
            className={`overflow-hidden transition-all hover:shadow-lg cursor-pointer ${
              selectedCamera === camera.id ? 'ring-2 ring-primary shadow-lg' : ''
            }`}
          >
            {/* Video Feed — thêm decoding="async" và loading="eager" để tối ưu FPS */}
            <div className="relative w-full bg-black aspect-video">
              {cameraFrames[camera.id] ? (
                <img
                  src={cameraFrames[camera.id]!}
                  alt={camera.name}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                  onError={() => handleCameraStreamError(camera.id)}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-4xl mb-2">📹</div>
                    <p className="text-white/50 text-sm">{camera.name}</p>
                  </div>
                </div>
              )}

              {/* Overlay bar (name + location + status dot) */}
              <div className="absolute left-0 right-0 bottom-0 bg-[rgba(0,0,0,0.65)] px-2 py-[3px] flex items-center justify-between">
                <div className="text-white text-[12px] leading-none truncate">
                  {camera.name} · {camera.location}
                </div>
                <div
                  className={`w-2 h-2 rounded-full ${
                    camera.status === 'active' ? 'bg-green-400' : 'bg-red-400'
                  }`}
                  title={camera.status === 'active' ? 'Hoạt động' : 'Ngắt'}
                />
              </div>

              {/* Controls Overlay */}
              <div className="absolute bottom-2.5 right-3 flex gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleUploadClick(camera.id);
                      }}
                      className="bg-black/50 backdrop-blur-sm text-white p-1.5 rounded-md hover:bg-black/70 transition"
                    >
                      {uploading[camera.id] ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {uploading[camera.id] ? 'Đang tải...' : 'Tải Video'}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setZoomedCamera(camera.id);
                      }}
                      className="bg-black/50 backdrop-blur-sm text-white p-1.5 rounded-md hover:bg-black/70 transition"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Phóng to</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setMapCamera(camera.id);
                      }}
                      className="bg-black/50 backdrop-blur-sm text-white p-1.5 rounded-md hover:bg-black/70 transition"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Vị trí lắp đặt</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </Card>
        ))}
      </div>
      )}

      {/* Zoomed View Close Button */}
      {isZoomed && (
        <Card className="p-4">
          <button
            onClick={() => setZoomedCamera(null)}
            className="w-full bg-muted hover:bg-muted/80 text-foreground px-4 py-2 rounded-lg transition font-medium"
          >
            ← Quay Lại Chế Độ Lưới
          </button>
        </Card>
      )}

      {/* Map Panel */}
      {mapCamera && <MapPanel cameraId={mapCamera} onClose={() => setMapCamera(null)} />}
      </>
      )}
      {/* ← ĐÃ THÊM: đóng Fragment và điều kiện Grid Cũ */}
    </div>
  );
}
