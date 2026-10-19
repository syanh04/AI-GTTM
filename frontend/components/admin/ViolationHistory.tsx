'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Search, FileDown, Flame, Info, Eye, MapPin, Calendar, Clock, Car, FileText, ExternalLink, Loader2 } from 'lucide-react';
import { calculateVietnamFine } from '@/lib/trafficLaw';
import { applyPresentationTimeline, interleaveDetectionLighting } from '@/lib/liveDetections';
import { isTransientRequestError } from '@/lib/requestError';

interface ViolationRecord {
  id: string;
  backendId?: number;
  trackId?: number | null;
  evidenceKey: string;
  licensePlate: string;
  vehicleType: string;
  timestamp: string;
  location: string;
  violation: string;
  status: 'pending' | 'processed' | 'sent';
  vehicleImage: string;
  plateImage: string;
  lightingCondition: 'day' | 'night' | 'unknown';
}

const statusColors = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  processed: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  sent: 'bg-green-500/20 text-green-700 border-green-500/30',
};

const statusLabels = {
  pending: 'Chờ xử lý',
  processed: 'Đã xử lý',
  sent: 'Đã gửi',
};

function caseCodeForRecord(record: ViolationRecord): string {
  const compactDate = String(record.timestamp || '').split(' ')[0].replace(/\D/g, '');
  const datePart =
    compactDate.length === 8
      ? `${compactDate.slice(4, 8)}${compactDate.slice(2, 4)}${compactDate.slice(0, 2)}`
      : new Date().toISOString().slice(0, 10).replace(/\D/g, '');
  const locationPart = String(record.location || 'CAM').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'CAM';
  const numericId = String(record.id || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
  return `VP-${datePart}-${locationPart}-${numericId}`;
}

/**
 * Nếu ảnh tối (night) → lùi ngày về hôm trước để phản ánh thực tế buổi tối.
 * Nếu ảnh sáng (day) → giữ nguyên timestamp thực.
 * Format input/output: "DD/MM/YYYY HH:MM:SS"
 */
function adjustTimestamp(timestamp: string, lighting: 'day' | 'night' | 'unknown'): string {
  if (lighting !== 'night') return timestamp;
  const parts = timestamp.split(' ');
  if (parts.length < 1) return timestamp;
  const datePart = parts[0];
  const timePart = parts[1] || '';
  const dateBits = datePart.split('/');
  if (dateBits.length !== 3) return timestamp;
  const [day, month, year] = dateBits.map(Number);
  if (!day || !month || !year) return timestamp;
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() - 1);
  const newDay = String(d.getDate()).padStart(2, '0');
  const newMonth = String(d.getMonth() + 1).padStart(2, '0');
  const newYear = d.getFullYear();
  return timePart ? `${newDay}/${newMonth}/${newYear} ${timePart}` : `${newDay}/${newMonth}/${newYear}`;
}

function vehicleLabel(value: string) {
  const normalized = (value || '').toLowerCase();
  if (normalized.includes('moto') || normalized.includes('motor')) return 'Xe máy';
  if (normalized.includes('truck')) return 'Xe tải';
  if (normalized.includes('bus')) return 'Xe buýt';
  if (normalized.includes('car')) return 'Ô tô';
  return value || 'Chưa rõ';
}

function mapReviewStatus(item: any): ViolationRecord['status'] {
  const status = String(item.review_status || item.status || '').toLowerCase();
  if (status.includes('notified') || status.includes('sent') || status.includes('notice_exported')) return 'sent';
  if (status.includes('resolved') || status.includes('processed')) return 'processed';
  if (item.violation_type) return 'pending';
  return 'processed';
}

function imageFromBase64(value: string = ''): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image/')) return raw;
  return `data:image/jpeg;base64,${raw}`;
}

interface ViolationHistoryProps {
  onProcessViolation?: (licensePlate: string, violation: string) => void;
}

export default function ViolationHistory({ onProcessViolation }: ViolationHistoryProps) {
  const [searchLicensePlate, setSearchLicensePlate] = useState('');
  const [filterViolationType, setFilterViolationType] = useState('all');
  const [filterVehicleType, setFilterVehicleType] = useState('all');
  const [records, setRecords] = useState<ViolationRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ViolationRecord | null>(null);
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let stopped = false;
    let requestRunning = false;

    const fetchHistory = async () => {
      if (requestRunning) return;
      requestRunning = true;
      try {
        const responses = await Promise.all([
          fetch('/api/history?limit=100', { cache: 'no-store', credentials: 'include' }).catch(() => null),
          fetch('/api/history/presentation', { cache: 'no-store', credentials: 'include' }).catch(() => null),
        ]);
        const successfulResponses = responses.filter(
          (response): response is Response => Boolean(response?.ok),
        );
        if (successfulResponses.length === 0) {
          if (!stopped) setHistoryState('error');
          return;
        }
        const payloads = await Promise.all(successfulResponses.map((response) => response.json()));
        if (stopped) return;
        const rowsById = new Map<number, any>();
        payloads.forEach((payload) => {
          (payload.items || []).forEach((item: any) => rowsById.set(Number(item.id), item));
        });
        const timelineRows = interleaveDetectionLighting(
          applyPresentationTimeline(Array.from(rowsById.values())),
        );
        const mapped = timelineRows.map((item: any): ViolationRecord => {
          const backendId = Number(item.id);
          const timestamp = String(item.timestamp || '');
          const cameraId = String(item.camera_id || 'Chưa rõ camera');
          const trackId = item.track_id === null || item.track_id === undefined ? null : Number(item.track_id);
          return {
            id: `D${backendId}`,
            backendId,
            trackId,
            evidenceKey: `${backendId}|${cameraId}|${trackId ?? 'no-track'}`,
            licensePlate: item.plate_number || 'Chưa xác nhận OCR',
            vehicleType: vehicleLabel(item.vehicle_type || item.vehicle_type_vi || ''),
            timestamp,
            location: cameraId,
            violation: item.violation_type || 'Chưa ghi nhận vi phạm',
            status: mapReviewStatus(item),
            vehicleImage: imageFromBase64(item.vehicle_crop_b64 || item.vehicle_image || item.overview_image),
            plateImage: imageFromBase64(item.plate_crop_b64 || item.plate_image || item.closeup_image),
            lightingCondition: item.lighting_condition || 'unknown',
          };
        });
        setRecords(mapped);
        setSelectedRecord((prev) => {
          if (!prev) return mapped[0] || null;
          return mapped.find((item: ViolationRecord) => item.backendId === prev.backendId) || mapped[0] || null;
        });
        setHistoryState('ready');
      } catch (error) {
        if (!stopped && !isTransientRequestError(error)) {
          console.warn('Không thể lấy hồ sơ vi phạm:', error);
        }
        if (!stopped) setHistoryState((current) => (current === 'ready' ? current : 'error'));
      } finally {
        requestRunning = false;
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 15000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  const violationsWithFine = useMemo(() => {
    return records.map((record) => ({
      ...record,
      fineAmount: calculateVietnamFine(record.violation, record.vehicleType),
    }));
  }, [records]);

  const filteredViolations = useMemo(() => {
    return violationsWithFine.filter((record) => {
      const matchPlate = record.licensePlate.toLowerCase().includes(searchLicensePlate.toLowerCase());
      const matchViolation = filterViolationType === 'all' || record.violation === filterViolationType;
      const matchVehicle = filterVehicleType === 'all' || record.vehicleType === filterVehicleType;
      return matchPlate && matchViolation && matchVehicle;
    });
  }, [searchLicensePlate, filterViolationType, filterVehicleType, violationsWithFine]);

  const totalEstimatedFine = useMemo(() => {
    return filteredViolations.reduce((acc, curr) => acc + curr.fineAmount, 0);
  }, [filteredViolations]);

  const locationStats = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((record) => counts.set(record.location, (counts.get(record.location) || 0) + 1));
    const sorted = Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const maxCount = sorted[0]?.count || 1;
    return sorted.slice(0, 5).map((item) => ({
      ...item,
      percentage: Math.round((item.count / maxCount) * 100),
    }));
  }, [records]);

  const handleExportPDF = () => {
    window.print();
  };

  const handleOpenAutoDossier = () => {
    if (!selectedRecord?.backendId) {
      window.alert('Hồ sơ mẫu chưa có ID backend để mở hồ sơ tự động.');
      return;
    }
    window.open(`/api/violations/${selectedRecord.backendId}/notice.html`, '_blank', 'noopener,noreferrer');
  };

  const sentRate = Math.round((records.filter((record) => record.status === 'sent').length / Math.max(records.length, 1)) * 100);

  return (
    <div className="flex h-full w-full flex-col space-y-4 pb-4">
      <div className="flex flex-col items-stretch gap-4 md:flex-row">
        <div className="grid flex-1 grid-cols-2 gap-4 md:grid-cols-4">
          <Card className="flex flex-col justify-center border-primary/20 bg-primary/5 p-4">
            <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tổng phạt ước tính</h3>
            <div className="text-xl font-black text-primary">
              {totalEstimatedFine.toLocaleString('vi-VN')} <span className="text-[10px] font-normal opacity-70">VND</span>
            </div>
          </Card>
          <Card className="flex flex-col justify-center border-border bg-muted/20 p-4">
            <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Số bản ghi lọc</h3>
            <div className="text-xl font-black text-foreground">
              {filteredViolations.length} <span className="text-[10px] font-normal opacity-70">hồ sơ</span>
            </div>
          </Card>
          <Card className="flex flex-col justify-center border-border bg-muted/20 p-4">
            <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tỷ lệ đã gửi</h3>
            <div className="text-xl font-black text-emerald-500">{sentRate}%</div>
          </Card>
          <Card className="flex flex-col justify-center border-border bg-muted/20 p-4">
            <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Điểm nóng</h3>
            <div className="flex items-center gap-1 text-lg font-black text-orange-500">
              {locationStats[0]?.name || 'Chưa có dữ liệu'} <Flame className="h-3 w-3" />
            </div>
          </Card>
        </div>

        <button
          onClick={handleExportPDF}
          className="flex flex-col items-center justify-center gap-1 rounded-xl bg-emerald-600 text-xs font-black text-white shadow-md shadow-emerald-900/20 transition-all hover:bg-emerald-700 md:w-48"
        >
          <FileDown className="h-5 w-5" />
          Xuất báo cáo PDF
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-12">
        <div className="flex flex-col gap-4 overflow-hidden lg:col-span-9">
          <div className="sticky top-0 z-20 flex flex-col items-center gap-3 rounded-lg bg-background/80 p-1 backdrop-blur-sm md:flex-row">
            <div className="group relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <input
                type="text"
                placeholder="Tìm kiếm biển số..."
                value={searchLicensePlate}
                onChange={(event) => setSearchLicensePlate(event.target.value)}
                className="w-full rounded-lg border border-border bg-muted/40 py-2 pl-10 pr-3 font-mono text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                {['all', 'Ô tô', 'Xe máy', 'Xe tải'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterVehicleType(type)}
                    className={`rounded-md px-3 py-1 text-[10px] font-bold uppercase transition-all ${
                      filterVehicleType === type ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:bg-background/40'
                    }`}
                  >
                    {type === 'all' ? 'Tất cả' : type}
                  </button>
                ))}
              </div>

              <select
                value={filterViolationType}
                onChange={(event) => setFilterViolationType(event.target.value)}
                className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase focus:outline-none"
              >
                <option value="all">Loại vi phạm</option>
                <option value="Vượt đèn đỏ">Vượt đèn đỏ</option>
                <option value="Quay đầu nơi cấm">Quay đầu nơi cấm</option>
                <option value="Dừng sai quy định">Dừng sai quy định</option>
                <option value="Vượt quá tốc độ">Vượt quá tốc độ</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card/30 shadow-inner">
            <div className="custom-scrollbar h-full w-full overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/80">
                  <tr className="font-black uppercase tracking-tighter text-muted-foreground">
                    <th className="px-4 py-4">Biển số / ID</th>
                    <th className="px-4 py-4">Phương tiện</th>
                    <th className="px-4 py-4">Nội dung vi phạm</th>
                    <th className="px-4 py-4">Trạng thái</th>
                    <th className="px-4 py-4 text-right">Mức phạt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {historyState === 'loading' && (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải hồ sơ thật từ hệ thống...</span>
                      </td>
                    </tr>
                  )}
                  {historyState === 'error' && records.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center text-sm text-red-600">
                        Chưa kết nối được dữ liệu hồ sơ. Hệ thống sẽ tự thử lại sau 5 giây.
                      </td>
                    </tr>
                  )}
                  {historyState === 'ready' && filteredViolations.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center text-sm text-muted-foreground">
                        Không có hồ sơ phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  )}
                  {filteredViolations.map((record) => {
                    const displayTs = adjustTimestamp(record.timestamp, record.lightingCondition);
                    return (
                      <tr
                        key={record.id}
                        onClick={() => setSelectedRecord(record)}
                        className={`group cursor-pointer transition-all ${
                          selectedRecord?.id === record.id ? 'border-l-2 border-l-primary bg-primary/10' : 'hover:bg-muted/50'
                        }`}
                      >
                        <td className="px-4 py-4">
                          <div className="flex flex-col">
                            <span className="font-mono text-sm font-black text-foreground transition-colors group-hover:text-primary">{record.licensePlate}</span>
                            <span className="text-[10px] text-muted-foreground opacity-60">ID: {record.id}</span>
                            <span className="font-mono text-[10px] text-slate-500">Mã hồ sơ: {caseCodeForRecord(record)}</span>
                            <span className="mt-1 text-[9px] text-slate-400">{displayTs}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`rounded border px-2 py-0.5 text-[9px] font-bold uppercase ${
                            record.vehicleType === 'Ô tô' ? 'border-blue-500/20 bg-blue-500/10 text-blue-500' : 'border-purple-500/20 bg-purple-500/10 text-purple-500'
                          }`}>
                            {record.vehicleType}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1 font-bold">
                            {record.violation}
                            {record.violation === 'Vượt đèn đỏ' && <div className="h-1.5 w-1.5 animate-ping rounded-full bg-red-500" />}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <MapPin className="h-2.5 w-2.5" /> {record.location}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-black uppercase ${statusColors[record.status]}`}>
                            {statusLabels[record.status]}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="font-mono font-black text-foreground">{record.fineAmount.toLocaleString('vi-VN')}</div>
                          <div className="text-[9px] text-muted-foreground opacity-50">VND</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 overflow-hidden lg:col-span-3">
          <Card className="flex flex-col gap-4 border-primary/20 bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-primary">
                <Eye className="h-4 w-4" /> Chi tiết hồ sơ
              </h3>
            </div>

            {selectedRecord ? (() => {
              const displayTs = adjustTimestamp(selectedRecord.timestamp, selectedRecord.lightingCondition);
              const [displayDate, displayTime] = displayTs.split(' ');
              return (
                <div className="space-y-4">
                  <div className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-white/5 bg-slate-900">
                    {selectedRecord.vehicleImage ? (
                      <img
                        key={selectedRecord.evidenceKey}
                        src={selectedRecord.vehicleImage}
                        alt={`Ảnh toàn xe của hồ sơ ${caseCodeForRecord(selectedRecord)}`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="font-mono text-[8px] italic text-slate-500">Chưa có ảnh toàn xe cho hồ sơ {selectedRecord.id}</span>
                    )}
                    <div className="absolute inset-0 border-2 border-primary/30 opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="absolute left-2 top-2 rounded bg-red-500 px-1 text-[8px] font-bold text-white">ẢNH TOÀN XE</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[10px]">
                    <div className="col-span-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                      <span className="block text-[8px] font-bold uppercase text-muted-foreground">Mã hồ sơ vi phạm</span>
                      <span className="font-mono text-sm font-black text-foreground">{caseCodeForRecord(selectedRecord)}</span>
                      <span className="mt-1 block font-mono text-[9px] text-slate-500">
                        Detection ID: {selectedRecord.backendId ?? '--'}{selectedRecord.trackId !== null && selectedRecord.trackId !== undefined ? ` | Track ID: ${selectedRecord.trackId}` : ''}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[8px] font-bold uppercase text-muted-foreground">Biển số</span>
                      <span className="font-mono text-lg font-black text-primary">{selectedRecord.licensePlate}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[8px] font-bold uppercase text-muted-foreground">Loại xe</span>
                      <span className="flex items-center gap-1 font-bold"><Car className="h-3 w-3 text-blue-500" /> {selectedRecord.vehicleType}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[8px] font-bold uppercase text-muted-foreground">Thời gian</span>
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1 font-bold"><Calendar className="h-3 w-3" /> {displayDate || '--'}</span>
                        <span className="flex items-center gap-1 opacity-70"><Clock className="h-3 w-3" /> {displayTime || '--'}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[8px] font-bold uppercase text-muted-foreground">Pháp lý</span>
                      <span className="block text-[9px] italic leading-tight text-muted-foreground">Theo Nghị định<br />168/2024/NĐ-CP</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={handleOpenAutoDossier}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 text-[10px] font-black uppercase text-slate-700 shadow-sm transition-all hover:bg-slate-50"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Mở hồ sơ tự động
                      <ExternalLink className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => {
                        if (selectedRecord && onProcessViolation) {
                          onProcessViolation(selectedRecord.licensePlate, selectedRecord.violation);
                        }
                      }}
                      className="w-full rounded-lg bg-primary py-2 text-[10px] font-black uppercase text-primary-foreground shadow-md transition-all hover:opacity-90"
                    >
                      Xử lý vi phạm này
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div className="flex flex-1 flex-col items-center justify-center py-10 text-xs italic text-muted-foreground opacity-50">
                <Info className="mb-2 h-10 w-10 opacity-10" />
                Chọn một bản ghi để xem chi tiết.
              </div>
            )}
          </Card>

          <Card className="flex min-h-[500px] flex-1 flex-col gap-4 border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-500">
                <Flame className="h-4 w-4" /> Top tuyến đường vi phạm
              </h3>
            </div>

            <div className="flex-1 space-y-6 py-4">
              {locationStats.map((loc, index) => (
                <div key={loc.name} className="group space-y-2">
                  <div className="flex items-end justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-4 font-mono text-[10px] font-black text-white/30">0{index + 1}</span>
                      <span className="text-xs font-black uppercase tracking-wide text-white">{loc.name}</span>
                    </div>
                    <span className={`font-mono text-[10px] font-bold italic ${loc.percentage >= 80 ? 'text-red-500' : 'text-orange-500'}`}>
                      {loc.count} hồ sơ · {loc.percentage}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full border border-white/5 bg-white/5">
                    <div className={`h-full ${index === 0 ? 'bg-red-500' : 'bg-orange-500'} shadow-[0_0_10px_rgba(249,115,22,0.3)] transition-all duration-1000 ease-out`} style={{ width: `${loc.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto border-t border-white/5 pt-4">
              <div className="rounded-lg border border-red-500/10 bg-red-500/5 p-3">
                <p className="text-[8px] font-black uppercase leading-relaxed tracking-widest text-red-400">
                  {locationStats[0]
                    ? `Camera có nhiều hồ sơ nhất hiện tại: ${locationStats[0].name} (${locationStats[0].count} hồ sơ).`
                    : 'Chưa có dữ liệu để xác định điểm nóng.'}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
