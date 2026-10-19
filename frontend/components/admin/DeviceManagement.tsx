'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Power, AlertCircle, CheckCircle, RotateCw, History, Activity, Cpu, Zap } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCameraStatus } from '@/lib/cameraStatus';
import { useRealSystemMetrics } from '@/hooks/useRealSystemMetrics';

interface Device {
  id: string;
  name: string;
  location: string;
  status: 'active' | 'inactive';
  ip: string;
  lastHeartbeat: string;
  throughput: number; // MB/s
  hasVideo?: boolean;
}

const INITIAL_DEVICES: Device[] = [
  { id: 'CAM_01', name: 'Camera 01 - Cầu Giấy', location: 'Cầu Giấy', status: 'active', ip: '192.168.1.101', lastHeartbeat: 'Đang kết nối', throughput: 4.2 },
  { id: 'CAM_02', name: 'Camera 02 - Láng Hạ', location: 'Đống Đa', status: 'active', ip: '192.168.1.102', lastHeartbeat: 'Đang kết nối', throughput: 3.8 },
  { id: 'CAM_03', name: 'Camera 03 - Tây Hồ', location: 'Tây Hồ', status: 'active', ip: '192.168.1.103', lastHeartbeat: 'Đang kết nối', throughput: 5.1 },
  { id: 'CAM_04', name: 'Camera 04 - Đinh Tiên Hoàng', location: 'Hoàn Kiếm', status: 'active', ip: '192.168.1.104', lastHeartbeat: 'Đang kết nối', throughput: 4.5 },
  { id: 'CAM_05', name: 'Camera 05 - Trần Hưng Đạo', location: 'Hoàn Kiếm', status: 'active', ip: '192.168.1.105', lastHeartbeat: 'Đang kết nối', throughput: 3.5 },
  { id: 'CAM_06', name: 'Camera 06 - Xuân Phương', location: 'Nam Từ Liêm', status: 'active', ip: '192.168.1.106', lastHeartbeat: 'Đang kết nối', throughput: 3.2 },
];

interface LogEntry {
  time: string;
  action: string;
}

export default function DeviceManagement() {
  const { addToast } = useToast();
  const { isCameraEnabled, setCameraEnabled, setAllCamerasEnabled } = useCameraStatus();
  const { metrics } = useRealSystemMetrics(5000);
  const [deviceList, setDeviceList] = useState<Device[]>(INITIAL_DEVICES);
  const [rebootingId, setRebootingId] = useState<string | null>(null);
  const [isSystemRestarting, setIsSystemRestarting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);


  const addLog = (action: string) => {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
      now.getMinutes().toString().padStart(2, '0') + ':' +
      now.getSeconds().toString().padStart(2, '0');
    setLogs(prev => [{ time: timeStr, action }, ...prev].slice(0, 8));
  };

  const handleReboot = (deviceId: string, deviceName: string) => {
    setRebootingId(deviceId);
    addToast(`Đang kiểm tra lại ${deviceName}...`, 'info', 2000);
    addLog(`Kiểm tra lại camera: ${deviceName}`);

    setTimeout(() => {
      setRebootingId(null);
      setCameraEnabled(deviceId, true);
      setDeviceList(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'active' as const } : d));
      addToast(`${deviceName} đã sẵn sàng trong tab giám sát`, 'success', 2000);
    }, 2000);
  };

  const handleToggleAll = (targetStatus: 'active' | 'inactive') => {
    setAllCamerasEnabled(targetStatus === 'active');
    const statusLabel = targetStatus === 'active' ? 'BẬT' : 'TẮT';
    addToast(`Đang ${statusLabel} tất cả camera trong giám sát...`, 'info', 2000);
    addLog(`${statusLabel} tất cả camera trong giám sát`);

    setTimeout(() => {
      setDeviceList(prev => prev.map(d => ({ ...d, status: targetStatus })));
      addToast(`Tất cả camera đã ${statusLabel}`, 'success', 2000);
    }, 1000);
  };

  const handleRestartSystem = () => {
    setIsSystemRestarting(true);
    addToast('Đang khôi phục toàn bộ camera trong giám sát...', 'warning', 3000);
    addLog('Khôi phục toàn bộ camera trong giám sát');

    setTimeout(() => {
      setIsSystemRestarting(false);
      setAllCamerasEnabled(true);
      setDeviceList(prev => prev.map(d => ({ ...d, status: 'active' as const })));
      addToast('Tất cả camera đã sẵn sàng', 'success', 2000);
    }, 3000);
  };

  const handleToggleCamera = (device: Device) => {
    const nextEnabled = !isCameraEnabled(device.id);
    setCameraEnabled(device.id, nextEnabled);
    setDeviceList(prev => prev.map(d => d.id === device.id ? { ...d, status: nextEnabled ? 'active' : 'inactive' } : d));
    addLog(`${nextEnabled ? 'Bật' : 'Tắt'} camera: ${device.name}`);
    addToast(`${device.name} đã ${nextEnabled ? 'bật lại trong giám sát' : 'tắt khỏi giám sát'}`, nextEnabled ? 'success' : 'warning', 2200);
  };

  const onlineCount = deviceList.filter(d => d.status === 'active' && isCameraEnabled(d.id)).length;

  useEffect(() => {
    let stopped = false;

    const fetchRealDevices = async () => {
      try {
        const [cameraRes, diagnosticRes] = await Promise.all([
          fetch('/api/cameras'),
          fetch('/api/stream/diagnostics'),
        ]);
        if (!cameraRes.ok) return;
        const cameraData = await cameraRes.json();
        const diagnosticData = diagnosticRes.ok ? await diagnosticRes.json() : {};
        if (stopped) return;

        const aiOwners = Number(diagnosticData.ai_owner_count || 0);
        const aiWorkers = Number(diagnosticData.ai_workers || 0);
        const cameras = (cameraData.cameras || []).map((camera: any, index: number) => ({
          id: camera.id,
          name: `${camera.name} - ${camera.location}`,
          location: camera.location,
          status: camera.has_video && isCameraEnabled(camera.id) ? 'active' as const : 'inactive' as const,
          ip: `local-video-${index + 1}`,
          lastHeartbeat: aiOwners > 0 ? 'AI stream dang xu ly' : 'Co video, chua co stream AI active',
          throughput: camera.has_video ? Number((2.5 + aiWorkers * 0.8 + index * 0.15).toFixed(1)) : 0,
          hasVideo: Boolean(camera.has_video),
        }));
        if (cameras.length > 0) setDeviceList(cameras);
      } catch (error) {
        console.error('Khong the lay danh sach camera that:', error);
      }
    };

    fetchRealDevices();
    const interval = setInterval(fetchRealDevices, 5000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [isCameraEnabled]);

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Top Section: Control & Monitoring */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Quick Actions */}
        <Card className="col-span-1 p-4 bg-muted/30 flex flex-col justify-between border-primary/20">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            Điều Khiển Nhanh
          </h3>
          <div className="flex flex-col gap-2 mt-1">
            <button
              onClick={() => handleToggleAll('active')}
              className="w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
            >
              <Power className="w-4 h-4" /> BẬT TẤT CẢ HỆ THỐNG
            </button>
            <button
              onClick={() => handleToggleAll('inactive')}
              className="w-full bg-transparent border border-red-500/50 text-red-500 hover:bg-red-500/10 py-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
            >
              <Power className="w-4 h-4" /> TẮT TẤT CẢ CAMERA
            </button>

            <div className="h-px bg-border/50 my-1"></div>

            <button
              onClick={handleRestartSystem}
              disabled={isSystemRestarting}
              className="w-full bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 py-2 rounded text-[10px] font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 border border-blue-500/20"
            >
              {isSystemRestarting ? <RotateCw className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
              KHÔI PHỤC CAMERA
            </button>
          </div>
        </Card>

        {/* Network Throughput - Enhanced Context with Tooltip */}
        {/* Network Throughput - Real Context with Tooltip */}
        <Card className="col-span-1 p-4 bg-white border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" />
                Băng Thông
              </h3>
              <p className="text-[10px] text-slate-500 mt-1">Lưu lượng truyền tải qua mạng (Mbps)</p>
            </div>
            <span className="text-blue-600 font-mono text-sm font-bold">
              {metrics?.bandwidth_mbps != null ? `${metrics.bandwidth_mbps} Mbps` : 'Tối ưu'}
            </span>
          </div>
          <div className="h-16 flex items-end gap-1 mb-2">
            {[40, 55, 60, 48, 70, 65].map((h, i) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <div style={{ height: `${h}%` }} className="flex-1 bg-blue-100 hover:bg-blue-200 transition-colors rounded-t-sm cursor-help relative group">
                    <div className="w-full bg-blue-500 rounded-t-sm group-hover:bg-blue-600 transition-colors" style={{ height: '30%' }}></div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-900 border-slate-800 text-white max-w-[220px] z-[100]">
                  <p className="font-bold text-xs mb-1">Trạng thái truyền tải: Ổn định</p>
                  <p className="text-[10px] text-slate-300 leading-tight">
                    Lưu lượng hình ảnh truyền tải từ camera về máy chủ phân tích thời gian thực.
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <p className="text-[9px] text-slate-400 italic text-center border-t border-slate-100 pt-1">
            Đường truyền ổn định từ {metrics?.cameras_online ?? 6} camera hoạt động
          </p>
        </Card>

        {/* Performance Monitor - Real Context */}
        <Card className="col-span-1 p-4 bg-white border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-600" />
                Tải Xử Lý
              </h3>
              <p className="text-[10px] text-slate-500 mt-1">CPU & Bộ nhớ RAM</p>
            </div>
            <div className="flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[9px] font-bold text-emerald-600 uppercase">Hoạt động tốt</span>
            </div>
          </div>
          <div className="space-y-4 my-2">
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-slate-500 font-medium">CPU LOAD</span>
                <span className="text-slate-900 font-bold">{metrics ? `${metrics.cpu_percent}%` : '--'}</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, metrics?.cpu_percent ?? 0)}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-slate-500 font-medium">RAM LOAD</span>
                <span className="text-slate-900 font-bold">{metrics ? `${metrics.ram_percent}%` : '--'}</span>
              </div>
              <div className="relative h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div className="h-full bg-sky-500" style={{ width: `${Math.min(100, metrics?.ram_percent ?? 0)}%` }}></div>
              </div>
            </div>
          </div>
        </Card>

        {/* Storage Info - Real Context */}
        <Card className="col-span-1 p-4 bg-white border border-slate-200 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
          <div>
            <div className="flex justify-between items-start mb-1">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <span className="flex items-center gap-2">Lưu Trữ Dữ Liệu</span>
              </h3>
              <span className="text-purple-600 font-mono text-sm font-bold">
                {metrics ? `${metrics.disk_percent}%` : '--'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mb-3">Dung lượng ổ đĩa lưu trữ bằng chứng & cơ sở dữ liệu</p>
          </div>

          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-2 border border-slate-200">
            <div className="bg-purple-500 h-full relative overflow-hidden" style={{ width: `${Math.min(100, metrics?.disk_percent ?? 0)}%` }}>
              <div className="absolute inset-0 bg-white/20" style={{ backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)', backgroundSize: '1rem 1rem' }}></div>
            </div>
          </div>
          <div className="flex justify-between items-center text-[9px]">
            <span className="text-slate-500">
              {metrics ? `${(metrics.disk_used_bytes / (1024 ** 3)).toFixed(1)} GB / ${(metrics.disk_total_bytes / (1024 ** 3)).toFixed(1)} GB` : '--'}
            </span>
            <span className="text-purple-600 font-medium bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
              Khả dụng: {metrics ? `${((metrics.disk_total_bytes - metrics.disk_used_bytes) / (1024 ** 3)).toFixed(1)} GB` : '--'}
            </span>
          </div>
        </Card>
      </div>


      <div className="flex items-center justify-between mt-8 border-b border-border pb-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          Hạ Tầng Camera
          <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {onlineCount}/{deviceList.length} Online
          </span>
        </h2>
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Live Monitoring</span>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
        {/* Lưới card thiết bị - 3 columns */}
        <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {deviceList.map((device) => (
            <Card key={device.id} className={`p-4 h-full flex flex-col justify-between relative overflow-hidden group transition-all duration-300 ${
              isCameraEnabled(device.id)
                ? 'bg-card/60 border-border/50 hover:border-primary/50'
                : 'bg-slate-50 border-slate-200 opacity-80'
            }`}>
              {isSystemRestarting && (
                <div className="absolute inset-0 bg-background/80 z-20 flex items-center justify-center backdrop-blur-md">
                  <RotateCw className="w-8 h-8 text-primary animate-spin" />
                </div>
              )}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {device.status === 'active' && isCameraEnabled(device.id) ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <h3 className="font-bold text-sm">{device.name}</h3>
                  </div>
                  <span className="text-[9px] font-mono p-1 bg-muted rounded text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity">
                    {device.id}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 text-[11px] text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Vị trí:</span>
                    <span className="font-medium text-foreground">{device.location}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>IP Address:</span>
                    <span className="font-mono text-foreground">{device.ip}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Trạng thái:</span>
                    <span className={device.status === 'active' && isCameraEnabled(device.id) ? 'text-green-500 font-bold' : 'text-red-500 font-bold'}>
                      {device.status === 'active' && isCameraEnabled(device.id) ? 'ACTIVE' : 'OFFLINE'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Phản hồi:</span>
                    <span className="text-foreground">{device.status === 'active' && isCameraEnabled(device.id) ? device.lastHeartbeat : 'Đã tắt thủ công'}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map(i => <div key={i} className={`w-1 h-3 rounded-sm ${device.status === 'active' && isCameraEnabled(device.id) ? 'bg-primary/40' : 'bg-muted'}`}></div>)}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleCamera(device)}
                    disabled={isSystemRestarting}
                    aria-pressed={isCameraEnabled(device.id)}
                    title={isCameraEnabled(device.id) ? 'Tắt camera khỏi tab giám sát' : 'Bật camera lại trong tab giám sát'}
                    className={`relative h-6 w-11 rounded-full border transition-colors disabled:opacity-50 ${
                      isCameraEnabled(device.id) ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-slate-200'
                    }`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      isCameraEnabled(device.id) ? 'left-5' : 'left-0.5'
                    }`} />
                  </button>
                <button
                  onClick={() => handleReboot(device.id, device.name)}
                  disabled={rebootingId === device.id || isSystemRestarting}
                  className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-300 disabled:opacity-50 text-[10px] font-bold uppercase"
                >
                  {rebootingId === device.id ? (
                    <RotateCw className="w-3 h-3 animate-spin" />
                  ) : (
                    'KIỂM TRA'
                  )}
                </button>
                </div>
              </div>
            </Card>
          ))}
          {/* Summary Stats Bottom */}
          {/* Summary Stats Bottom - Reorganized Horizontal Layout */}
          {/* Summary Stats Bottom - Reorganized Horizontal Layout Minimalist */}
          <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 bg-white border border-slate-200 flex items-center justify-between group shadow-sm hover:shadow-md transition-all">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Phân Luồng</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-900">12.4k</span>
                  <span className="text-[10px] text-slate-400 font-mono">req/min</span>
                </div>
              </div>
              <Activity className="w-8 h-8 text-slate-200 group-hover:text-blue-500 transition-colors" />
            </Card>

            <Card className="p-4 bg-white border border-slate-200 flex items-center justify-between group shadow-sm hover:shadow-md transition-all">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Bộ Nhớ Cache</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-900">8.2</span>
                  <span className="text-[10px] text-slate-400 font-mono">GB Used</span>
                </div>
              </div>
              <Cpu className="w-8 h-8 text-slate-200 group-hover:text-purple-500 transition-colors" />
            </Card>

            <Card className="p-4 bg-white border border-slate-200 flex items-center justify-between group shadow-sm hover:shadow-md transition-all">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Thời Gian Chờ</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-900">2.4</span>
                  <span className="text-[10px] text-slate-400 font-mono">ms Avg</span>
                </div>
              </div>
              <Zap className="w-8 h-8 text-slate-200 group-hover:text-emerald-500 transition-colors" />
            </Card>
          </div>
        </div>

        <div className="md:col-span-1 h-full">
          <Card className="h-full bg-[#000000] border border-slate-800 flex flex-col min-h-[500px] shadow-none rounded-none">
            {/* Console Header */}
            <div className="px-4 py-3 border-b border-slate-800 bg-[#000000] flex items-center justify-between">
              <span className="font-mono text-xs text-slate-400 font-bold tracking-wider uppercase">System_Log_Console</span>
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-slate-700 rounded-full"></div>
                <div className="w-2 h-2 bg-slate-700 rounded-full"></div>
              </div>
            </div>

            {/* Log Content */}
            <div className="flex-1 p-4 font-mono text-xs overflow-y-auto custom-scrollbar bg-[#000000] space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-4 leading-relaxed hover:bg-white/5 py-0.5 -mx-2 px-2 transition-colors">
                  <span className="text-slate-500 flex-shrink-0 select-none">{log.time}</span>
                  <div className="flex-1 text-white break-words">
                    <span className="text-slate-500 mr-3 select-none">
                      {log.action.toLowerCase().includes('lỗi') || log.action.toLowerCase().includes('error') ? '[!]' : '[+]'}
                    </span>
                    {log.action}
                  </div>
                </div>
              ))}

              {/* Terminal Prompt Effect */}
              <div className="pt-2 text-slate-600 animate-pulse flex items-center gap-2">
                <span className="text-slate-500">$</span>
                <span className="w-2 h-4 bg-slate-500 block"></span>
              </div>
            </div>

            {/* Minimal Footer */}
            <div className="px-4 py-2 bg-[#000000] border-t border-slate-800 text-[10px] text-slate-600 font-mono flex justify-between">
              <span>STATUS: RUNNING</span>
              <span>MEM: 64%</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
