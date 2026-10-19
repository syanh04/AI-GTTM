'use client';

import React, { useCallback, useMemo, useRef, useState, useEffect, useSyncExternalStore } from 'react';
import { Card } from '@/components/ui/card';
import { Send, Mail, Search, Filter, FileText, Clock3, CheckCircle2, AlertTriangle, X, Car, ShieldAlert } from 'lucide-react';
import AIChatbot from './AIChatbot';
import { useAuth } from '@/lib/AuthContext';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { exportViolationNoticePDF, type ViolationNoticeExport } from '@/lib/exportUtils';
import { formatFineForNotice, getViolationFineInfo } from '@/lib/violationFines';
import { isTransientRequestError } from '@/lib/requestError';
import { goTo } from '@/lib/crossNav';
import EntityLink from './EntityLink';
import { ExternalLink, Database, Scale } from 'lucide-react';
import {
  applyPresentationTimeline,
  getLiveDetectionsSnapshot,
  subscribeLiveDetections,
  type LiveDetectionRecord,
} from '@/lib/liveDetections';
// ← ĐÃ THÊM: useAuth

interface Violation {
  id: string;
  licensePlate: string;
  vehicleType: string;
  violation: string;
  timestamp: Date;
  camera: string;
  ocrScore?: number;
  plateCropSource?: string;
  plateDebugReason?: string;
  plateDebugVariant?: string;
  lightingCondition?: 'day' | 'night' | 'unknown';
  evidenceCurated?: boolean;
  images: {
    overview: string;
    closeup: string;
  };
  status: 'pending' | 'processing' | 'resolved' | 'approved' | 'fined_sent' | 'paid' | 'cancelled';
  ownerInfo?: {
    name: string;
    phone: string;
    email?: string;
    address: string;
    source?: string;
  };
}

type NotificationChannel = 'sms' | 'email';
type NotificationStatus = 'sent' | 'failed';

interface NotificationHistoryItem {
  id: string;
  violationId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  sentAt: Date;
  operator: string;
  recipient: string;
  message: string;
}

interface ViolationCenterProps {
  selectedDate: string;
  violationContext?: any | null;
}

function normalizePlateDisplay(raw: string): string {
  const value = (raw || '').trim();
  if (!value || value.toLowerCase() === 'unknown') return 'Chưa xác nhận OCR';
  return value;
}

function normalizeVehicleTypeLabel(raw: string): string {
  const normalized = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  const map: Record<string, string> = {
    car: 'Ô tô',
    truck: 'Xe tải',
    motorcycle: 'Xe máy',
    moto: 'Xe máy',
    bus: 'Xe buýt',
    'ô tô': 'Ô tô',
    'o to': 'Ô tô',
    'xe tải': 'Xe tải',
    'xe máy': 'Xe máy',
    'xe tai': 'Xe tải',
    'xe may': 'Xe máy',
    'xe buyt': 'Xe buýt',
  };

  if (normalized.includes('tải') || normalized.includes('tai')) return 'Xe tải';
  if (normalized.includes('máy') || normalized.includes('may')) return 'Xe máy';
  if (normalized.includes('buýt') || normalized.includes('buyt')) return 'Xe buýt';
  if (normalized.includes('ô tô') || normalized.includes('oto') || normalized.includes('o to')) return 'Ô tô';

  return map[normalized] || raw || 'Không rõ';
}

function isTruckBodyIdentifier(source?: string, reason?: string): boolean {
  const normalizedSource = String(source || '').toLowerCase();
  const normalizedReason = String(reason || '').toLowerCase();
  return normalizedSource === 'truck_body' || normalizedReason.startsWith('truck_body');
}

function imageFromBase64(value?: string): string {
  if (!value) return '';
  if (value.startsWith('data:image')) return value;
  return `data:image/jpeg;base64,${value}`;
}

function parseHistoryTime(item: any): Date {
  const raw =
    item?.last_seen_at ||
    item?.timestamp ||
    item?.created_at ||
    item?.time ||
    item?.datetime;
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

const DEMO_OWNER_PROFILES = [
  { name: 'Nguyễn Minh Quân', phone: '0912 345 678', email: 'nguyenminhquan.demo@example.com', address: 'Số 12 phố Trần Thái Tông, phường Dịch Vọng, quận Cầu Giấy, Hà Nội' },
  { name: 'Trần Thu Hà', phone: '0983 214 567', email: 'tranthuha.demo@example.com', address: 'Số 45 đường Láng, phường Láng Hạ, quận Đống Đa, Hà Nội' },
  { name: 'Lê Hoàng Nam', phone: '0976 502 319', email: 'lehoangnam.demo@example.com', address: 'Số 8 phố Nguyễn Trãi, phường Thượng Đình, quận Thanh Xuân, Hà Nội' },
  { name: 'Phạm Anh Tuấn', phone: '0904 778 215', email: 'phamanhtuan.demo@example.com', address: 'Số 19 phố Bà Triệu, phường Hàng Bài, quận Hoàn Kiếm, Hà Nội' },
  { name: 'Đỗ Thị Mai Linh', phone: '0936 118 904', email: 'dothimailinh.demo@example.com', address: 'Số 23 phố Lạc Long Quân, phường Bưởi, quận Tây Hồ, Hà Nội' },
  { name: 'Bùi Quốc Việt', phone: '0968 420 735', email: 'buiquocviet.demo@example.com', address: 'Số 31 đường Phạm Hùng, phường Mỹ Đình 2, quận Nam Từ Liêm, Hà Nội' },
  { name: 'Hoàng Gia Bảo', phone: '0915 906 332', email: 'hoanggiabao.demo@example.com', address: 'Số 66 phố Nguyễn Văn Cừ, phường Ngọc Lâm, quận Long Biên, Hà Nội' },
  { name: 'Vũ Thanh Huyền', phone: '0942 680 117', email: 'vuthanhhuyen.demo@example.com', address: 'Số 5 phố Kim Mã, phường Kim Mã, quận Ba Đình, Hà Nội' },
  { name: 'Đặng Tiến Đạt', phone: '0888 236 901', email: 'dangtien.dat.demo@example.com', address: 'Số 72 phố Tôn Đức Thắng, phường Quốc Tử Giám, quận Đống Đa, Hà Nội' },
  { name: 'Nguyễn Bảo Ngọc', phone: '0927 341 856', email: 'nguyenbaongoc.demo@example.com', address: 'Số 14 phố Huế, phường Ngô Thì Nhậm, quận Hai Bà Trưng, Hà Nội' },
  { name: 'Công Ty TNHH Vận Tải An Phát', phone: '0243 887 1022', email: 'vantai.anphat.demo@example.com', address: 'Lô B2 cụm công nghiệp Lai Xá, xã Kim Chung, huyện Hoài Đức, Hà Nội' },
  { name: 'Công Ty CP Logistics Sông Hồng', phone: '0246 655 2210', email: 'logistics.songhong.demo@example.com', address: 'Số 92 đường Nguyễn Văn Linh, phường Sài Đồng, quận Long Biên, Hà Nội' },
];

const DEMO_OWNER_BY_PLATE: Record<string, number> = {
  '30F89060': 7,
  '30G63179': 7,
  '98A26774': 0,
  '98A12268': 1,
  '11K79386': 2,
  '98C05462': 10,
  '98C29865': 11,
};

function normalizePlateKey(value?: string): string {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function matchesSearch(text: string, query: string): boolean {
  if (!query) return true;
  const qLower = query.toLowerCase().trim();
  if (!qLower) return true;
  if (text.toLowerCase().includes(qLower)) return true;
  const qClean = qLower.replace(/[^a-z0-9]/g, '');
  const tClean = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  return Boolean(qClean && tClean.includes(qClean));
}

function demoOwnerForPlate(plate: string, source?: any) {
  const key = normalizePlateKey(plate);
  const sourceOwner = {
    name: source?.owner_name || source?.name || '',
    phone: source?.owner_phone || source?.phone || '',
    email: source?.owner_email || source?.email || '',
    address: source?.owner_address || source?.address || '',
    source: source?.owner_source || source?.source || '',
  };
  if (sourceOwner.name && !String(sourceOwner.name).toLowerCase().includes('chua xac')) {
    return sourceOwner;
  }
  if (key.length < 7 || key === 'UNKNOWN' || key.includes('CHUAXACNHAN')) {
    return {
      name: 'Chưa xác định',
      phone: 'Chưa có dữ liệu',
      email: '',
      address: 'Đang chờ đối soát dữ liệu dân cư',
      source: 'demo_pending_plate',
    };
  }
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const profile = DEMO_OWNER_PROFILES[DEMO_OWNER_BY_PLATE[key] ?? hash % DEMO_OWNER_PROFILES.length];
  return { ...profile, source: DEMO_OWNER_BY_PLATE[key] !== undefined ? 'demo_registry' : 'demo_generated' };
}

function detectionIdFromViolationId(value: string): number | null {
  const match = String(value || '').match(/HIS-(\d+)/);
  return match ? Number(match[1]) : null;
}

function mapBackendReviewStatus(status?: string, hasViolation = true): Violation['status'] {
  const value = String(status || '').toLowerCase();
  if (value === 'resolved') return 'resolved';
  if (value === 'rejected' || value === 'cancelled') return 'cancelled';
  if (value === 'notified' || value === 'notice_exported') return 'fined_sent';
  if (value === 'confirmed' || value === 'approved') return 'approved';
  return hasViolation ? 'pending' : 'approved';
}

function mapHistoryItemToViolation(item: any, index = 0): Violation {
  return {
    id: `HIS-${item.id || item.detection_id || index}`,
    licensePlate: normalizePlateDisplay(item.plate_number || item.plate || item.license_plate || ''),
    vehicleType: normalizeVehicleTypeLabel(item.vehicle_type_vi || item.vehicle_type || item.class || ''),
    violation: item.violation_type || item.violation || 'Chưa ghi nhận vi phạm',
    timestamp: parseHistoryTime(item),
    camera: item.camera_id || item.camera || 'CAM_01',
    ocrScore: Number(item.ocr_score || item.plate_score || 0),
    plateCropSource: item.plate_crop_source || item.crop_source || '',
    plateDebugReason: item.plate_debug_reason || '',
    plateDebugVariant: item.plate_debug_variant || '',
    lightingCondition: item.lighting_condition || 'unknown',
    evidenceCurated: Boolean(item.evidence_curated),
    images: {
      overview: imageFromBase64(item.vehicle_crop_b64 || item.vehicle_image || item.overview_image),
      closeup: imageFromBase64(item.plate_crop_b64 || item.plate_image || item.closeup_image),
    },
    status: mapBackendReviewStatus(item.review_status, Boolean(item.violation_type || item.violation)),
    ownerInfo: demoOwnerForPlate(item.plate_number || item.plate || item.license_plate || '', item),
  };
}

function liveDetectionToHistoryItem(item: LiveDetectionRecord) {
  return {
    ...item,
    camera_id: item.camera,
    vehicle_type: item.class,
    vehicle_crop_b64: item.vehicle_image,
    plate_crop_b64: item.plate_image,
  };
}

export default function ViolationCenter({ violationContext }: ViolationCenterProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canReviewViolations = user?.role === 'admin' || user?.role === 'operator';
  // ← ĐÃ THÊM: phân quyền
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [allDetections, setAllDetections] = useState<Violation[]>([]);
  const [viewListMode, setViewListMode] = useState<'violations' | 'all_detected'>('violations');
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [stableDemoMode, setStableDemoMode] = useState(false);
  const [processingFilter, setProcessingFilter] = useState<'all' | 'ocr_review' | 'not_notified' | 'notified'>('all');
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>([]);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [plateCorrectionDraft, setPlateCorrectionDraft] = useState('');
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const selectedViolationIdRef = useRef<string | null>(null);
  const liveDetections = useSyncExternalStore(
    subscribeLiveDetections,
    getLiveDetectionsSnapshot,
    getLiveDetectionsSnapshot,
  );

  const selectViolation = useCallback((violation: Violation | null) => {
    selectedViolationIdRef.current = violation?.id || null;
    setSelectedViolation(violation);
  }, []);

  const VIOLATION_OPTIONS = useMemo(
    () => [
      'Vượt đèn đỏ',
      'Quá tốc độ',
      'Đi ngược chiều',
      'Dừng đỗ sai quy định',
      'Không đội mũ bảo hiểm',
      'Vượt vạch kẻ đường',
      'Sử dụng điện thoại khi lái xe',
    ],
    [],
  );

  type StatusFilter =
    | 'all'
    | 'pending'
    | 'approved'
    | 'fined_sent'
    | 'resolved'
    | 'paid'
    | 'cancelled';

  type TimePreset =
    | 'all'
    | 'today'
    | 'yesterday'
    | 'last7'
    | 'last30'
    | 'thisMonth'
    | 'custom';

  type CameraGroup = {
    district: string;
    cameras: Array<{ id: string; label: string }>;
  };

  const CAMERA_GROUPS: CameraGroup[] = useMemo(
    () => [
      {
        district: 'Quận Cầu Giấy',
        cameras: [
          { id: 'CAM_01', label: 'CAM_01 - Ngã tư Cầu Giấy' },
          { id: 'CAM_02', label: 'CAM_02 - Đường Cầu Giấy' },
        ],
      },
      {
        district: 'Quận Đống Đa',
        cameras: [
          { id: 'CAM_03', label: 'CAM_03 - Láng Hạ' },
          { id: 'CAM_04', label: 'CAM_04 - Ô Chợ D𞺺' },
        ],
      },
      {
        district: 'Quận Tây Hồ',
        cameras: [
          { id: 'CAM_05', label: 'CAM_05 - Tây Hồ' },
          { id: 'CAM_06', label: 'CAM_06 - Xuân La' },
        ],
      },
      {
        district: 'Dữ liệu bổ sung mở rộng',
        cameras: [
          { id: 'CAM_07', label: 'CAM_07 - Dữ liệu bổ sung 01' },
          { id: 'CAM_08', label: 'CAM_08 - Dữ liệu bổ sung 02' },
          { id: 'CAM_09', label: 'CAM_09 - Dữ liệu bổ sung 03' },
        ],
      },
    ],
    [],
  );

  const ALL_CAMERA_IDS = useMemo(
    () => CAMERA_GROUPS.flatMap((g) => g.cameras.map((c) => c.id)),
    [CAMERA_GROUPS],
  );

  type Filters = {
    violationTypes: string[];
    status: StatusFilter;
    timePreset: TimePreset;
    customFrom: string; // DD/MM/YYYY
    customTo: string; // DD/MM/YYYY
    cameras: string[]; // ids
  };

  const DEFAULT_FILTERS: Filters = useMemo(
    () => ({
      violationTypes: [],
      status: 'all',
      timePreset: 'all',
      customFrom: '',
      customTo: '',
      cameras: ALL_CAMERA_IDS,
    }),
    [ALL_CAMERA_IDS],
  );

  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [violationTypeTouched, setViolationTypeTouched] = useState(false);
  const [cameraSearch, setCameraSearch] = useState('');
  const [filterError, setFilterError] = useState<string>('');

  const toISODate = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const parseDDMMYYYY = useCallback((s: string): Date | null => {
    const m = (s || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (mm < 1 || mm > 12) return null;
    if (dd < 1 || dd > 31) return null;
    const d = new Date(yyyy, mm - 1, dd);
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
    return d;
  }, []);

  const formatDDMMYYYY = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const startOfDay = useCallback((d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0), []);
  const endOfDay = useCallback((d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999), []);
  const daysDiff = useCallback(
    (a: Date, b: Date) => Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / (24 * 60 * 60 * 1000)),
    [startOfDay],
  );

  const isSameFilters = (a: Filters, b: Filters) => {
    const sortArr = (x: string[]) => [...x].sort().join('|');
    return (
      sortArr(a.violationTypes) === sortArr(b.violationTypes) &&
      a.status === b.status &&
      a.timePreset === b.timePreset &&
      a.customFrom === b.customFrom &&
      a.customTo === b.customTo &&
      sortArr(a.cameras) === sortArr(b.cameras)
    );
  };

  const isDefaultDirty = !isSameFilters(draftFilters, DEFAULT_FILTERS);

  const activeFilterGroupCount = useMemo(() => {
    let n = 0;
    if (appliedFilters.violationTypes.length > 0) n += 1;
    if (appliedFilters.status !== 'all') n += 1;
    if (appliedFilters.timePreset !== 'all') n += 1;
    if (appliedFilters.cameras.length !== ALL_CAMERA_IDS.length) n += 1;
    return n;
  }, [ALL_CAMERA_IDS.length, appliedFilters]);

  const buildFilterParams = (f: Filters, q: string) => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (f.violationTypes.length) p.set('vtypes', f.violationTypes.join(','));
    if (f.status !== 'all') p.set('status', f.status);
    if (f.timePreset !== 'all') p.set('time', f.timePreset);
    if (f.timePreset === 'custom') {
      if (f.customFrom) p.set('from', f.customFrom);
      if (f.customTo) p.set('to', f.customTo);
    }
    if (f.cameras.length && f.cameras.length !== ALL_CAMERA_IDS.length) p.set('cams', f.cameras.join(','));
    return p;
  };

  const hydrateFromUrl = useCallback(() => {
    const q = searchParams.get('q') || searchParams.get('plate') || '';
    const vtypes = (searchParams.get('vtypes') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const singleViolation = searchParams.get('violation');
    if (singleViolation && !vtypes.includes(singleViolation)) {
      vtypes.push(singleViolation);
    }
    const status = (searchParams.get('status') as StatusFilter) || 'all';
    const rangeParam = searchParams.get('range');
    const timePreset = (searchParams.get('time') as TimePreset) || (rangeParam === 'today' ? 'today' : 'all');
    const customFrom = searchParams.get('from') || '';
    const customTo = searchParams.get('to') || '';
    const singleCamera = searchParams.get('camera') || searchParams.get('cam');
    const cams = (searchParams.get('cams') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (singleCamera && !cams.includes(singleCamera)) {
      cams.push(singleCamera);
    }

    const next: Filters = {
      violationTypes: vtypes.filter((t) => VIOLATION_OPTIONS.includes(t)),
      status: ['all', 'pending', 'approved', 'fined_sent', 'resolved', 'paid', 'cancelled'].includes(status) ? status : 'all',
      timePreset: ['all', 'today', 'yesterday', 'last7', 'last30', 'thisMonth', 'custom'].includes(timePreset) ? timePreset : 'all',
      customFrom,
      customTo,
      cameras: cams.length ? cams.filter((c) => ALL_CAMERA_IDS.includes(c)) : ALL_CAMERA_IDS,
    };

    setSearchTerm(q);
    setAppliedFilters(next);
    setDraftFilters(next);
    setViolationTypeTouched(false);
    setCameraSearch('');
    setFilterError('');
  }, [ALL_CAMERA_IDS, VIOLATION_OPTIONS, searchParams]);

  useEffect(() => {
    hydrateFromUrl();
  }, [hydrateFromUrl]);

  useEffect(() => {
    setStableDemoMode(window.localStorage.getItem('stable_violation_demo_mode') === '1');
    const syncDemoMode = () => {
      setStableDemoMode(window.localStorage.getItem('stable_violation_demo_mode') === '1');
    };
    window.addEventListener('stable_violation_demo_mode_change', syncDemoMode);
    window.addEventListener('storage', syncDemoMode);
    return () => {
      window.removeEventListener('stable_violation_demo_mode_change', syncDemoMode);
      window.removeEventListener('storage', syncDemoMode);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('violation_notification_history');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<Omit<NotificationHistoryItem, 'sentAt'> & { sentAt: string }>;
      setNotificationHistory(
        parsed.map((item) => ({
          ...item,
          sentAt: new Date(item.sentAt),
        })),
      );
    } catch {
      window.localStorage.removeItem('violation_notification_history');
    }
  }, []);

  useEffect(() => {
    if (!selectedViolation) return;
    const controller = new AbortController();
    const loadNotificationHistory = async () => {
      try {
        const params = new URLSearchParams({
          violation_id: selectedViolation.id,
          license_plate: selectedViolation.licensePlate,
          limit: '40',
        });
        const response = await fetch(`/api/notification-history?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json();
        const rows = Array.isArray(payload.items) ? payload.items : [];
        const mapped: NotificationHistoryItem[] = rows.map((item: any) => ({
          id: String(item.id),
          violationId: item.violation_id,
          channel: item.channel === 'email' ? 'email' : 'sms',
          status: item.status === 'failed' ? 'failed' : 'sent',
          sentAt: new Date(item.sent_at),
          operator: item.operator || 'admin',
          recipient: item.recipient || '',
          message: item.message || '',
        }));
        setNotificationHistory((prev) => {
          const byKey = new Map<string, NotificationHistoryItem>();
          [...mapped, ...prev].forEach((item) => byKey.set(`${item.violationId}-${item.channel}-${item.sentAt.getTime()}-${item.recipient}`, item));
          return Array.from(byKey.values()).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime()).slice(0, 100);
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('Không thể tải lịch sử gửi thông báo:', error);
        }
      }
    };
    loadNotificationHistory();
    return () => controller.abort();
  }, [selectedViolation]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!filterOpen) return;
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
        setDraftFilters(appliedFilters);
        setFilterError('');
        setViolationTypeTouched(false);
        setCameraSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [appliedFilters, filterOpen]);

  useEffect(() => {
    let cancelled = false;
    let requestRunning = false;

    const fetchHistory = async () => {
      if (requestRunning) return;
      requestRunning = true;
      try {
        const response = await fetch('/api/history/presentation', { credentials: 'include' });
        if (!response.ok) throw new Error('history-request-failed');
        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : payload.records || payload.items || payload.data || [];
        const mapped: Violation[] = applyPresentationTimeline(rows)
          .map(mapHistoryItemToViolation)
          .filter((item: Violation) => Boolean(item.images.overview && item.images.closeup));

        if (cancelled) return;
        setViolations((prev) => {
          const incomingIds = new Set(mapped.map((item) => item.id));
          const localItems = prev.filter((item) => item.id.startsWith('NEW-') && !incomingIds.has(item.id));
          return [...localItems, ...mapped];
        });

        // Also fetch all detected vehicles for the vehicle selection list
        fetch('/api/history?limit=200&complete_evidence_only=false', { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .then((allData) => {
            if (!allData || cancelled) return;
            const rowsAll = Array.isArray(allData) ? allData : allData.items || allData.records || [];
            const mappedAll: Violation[] = rowsAll.map(mapHistoryItemToViolation);
            setAllDetections((prev) => {
              const incomingAllIds = new Set(mappedAll.map((x) => x.id));
              const localAll = prev.filter((x) => !incomingAllIds.has(x.id));
              return [...mappedAll, ...localAll];
            });
          })
          .catch(() => {});

        const targetParam = searchParams.get('case') || searchParams.get('record');
        let matchedFromTarget: Violation | undefined = undefined;
        if (targetParam) {
          const cleanTarget = targetParam.replace(/^VP-|^HIS-/, '');
          matchedFromTarget = mapped.find(
            (item) =>
              item.id === targetParam ||
              item.id === `HIS-${cleanTarget}` ||
              String(detectionIdFromViolationId(item.id)) === cleanTarget
          );
        }

        if (targetParam && !matchedFromTarget) {
          const cleanTarget = targetParam.replace(/^VP-|^HIS-/, '');
          fetch(`/api/data/detections/${cleanTarget}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((extra) => {
              if (extra && !cancelled) {
                const extraV = mapHistoryItemToViolation(extra);
                setViolations((current) => [extraV, ...current.filter((x) => x.id !== extraV.id)]);
                setAllDetections((current) => [extraV, ...current.filter((x) => x.id !== extraV.id)]);
                setSelectedViolation(extraV);
                selectedViolationIdRef.current = extraV.id;
              }
            })
            .catch(() => {});
        }

        setSelectedViolation((prev) => {
          if (matchedFromTarget) {
            selectedViolationIdRef.current = matchedFromTarget.id;
            return matchedFromTarget;
          }
          const selectedId = selectedViolationIdRef.current || prev?.id;
          if (selectedId) {
            // Keep the exact record the operator selected, even if it is outside
            // the latest history page returned by a background refresh.
            return mapped.find((item) => item.id === selectedId) || prev;
          }
          const initialSelection = mapped.find((item) => item.evidenceCurated) || mapped[0] || null;
          selectedViolationIdRef.current = initialSelection?.id || null;
          return initialSelection;
        });
      } catch (error) {
        if (!cancelled && !isTransientRequestError(error)) {
          console.warn('Không thể tải hồ sơ vi phạm:', error);
        }
      } finally {
        requestRunning = false;
      }
    };

    fetchHistory();
    const interval = window.setInterval(fetchHistory, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (liveDetections.length === 0) return;
    const mapped = liveDetections
      .map((item, index) => mapHistoryItemToViolation(liveDetectionToHistoryItem(item), index))
      .filter((item) => Boolean(item.images.overview && item.images.closeup));
    if (mapped.length === 0) return;

    setViolations((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      mapped.forEach((item) => {
        const existing = byId.get(item.id);
        byId.set(item.id, existing ? { ...existing, ...item } : item);
      });
      return Array.from(byId.values());
    });
    setAllDetections((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      mapped.forEach((item) => {
        const existing = byId.get(item.id);
        byId.set(item.id, existing ? { ...existing, ...item } : item);
      });
      return Array.from(byId.values());
    });
    setSelectedViolation((current) => {
      if (current) {
        const updated = mapped.find((item) => item.id === current.id);
        return updated ? { ...current, ...updated } : current;
      }
      const first = mapped[0] || null;
      selectedViolationIdRef.current = first?.id || null;
      return first;
    });
  }, [liveDetections]);

  // Handle incoming violation from context
  useEffect(() => {
    if (violationContext && (violationContext.plateNumber || violationContext.plate_number || violationContext.plate_crop_b64 || violationContext.plateImage || violationContext.plate_image)) {
      const rawPlate = violationContext.plateNumber || violationContext.plate_number || violationContext.licensePlate || '';
      const vehicleEvidence = violationContext?.vehicle_crop_b64
        ? imageFromBase64(violationContext.vehicle_crop_b64)
        : (violationContext?.vehicleImage || violationContext?.vehicle_image || violationContext?.plateImage || '');
      const plateEvidence = violationContext?.plate_crop_b64
        ? imageFromBase64(violationContext.plate_crop_b64)
        : (violationContext?.plateImage || violationContext?.plate_image || vehicleEvidence || '');
      if (!vehicleEvidence && !plateEvidence && !rawPlate) return;
      const newViolation: Violation = {
        id: violationContext.id ? `HIS-${violationContext.id}` : `NEW-${Date.now()}`,
        licensePlate: normalizePlateDisplay(rawPlate),
        vehicleType: normalizeVehicleTypeLabel(
          violationContext.vehicleType || violationContext.class || violationContext.vehicle_type || ''
        ),
        violation: violationContext.violation || 'Vượt đèn đỏ',
        timestamp: parseHistoryTime(violationContext),
        camera: violationContext.location || violationContext.camera || violationContext.camera_id || 'CAM_01',
        ocrScore: Number(violationContext.ocr_score || 0),
        plateCropSource: violationContext.plate_crop_source || '',
        plateDebugReason: violationContext.plate_debug_reason || '',
        plateDebugVariant: violationContext.plate_debug_variant || '',
        lightingCondition: violationContext.lighting_condition || 'unknown',
        evidenceCurated: Boolean(violationContext.evidence_curated),
        images: {
          overview: vehicleEvidence,
          closeup: plateEvidence,
        },
        status:
          violationContext.violationType || violationContext.violation_type
            ? 'pending'
            : 'approved',
        ownerInfo: demoOwnerForPlate(rawPlate, violationContext),
      };

      setViolations(prev => {
        const existingIndex = prev.findIndex((item) => item.id === newViolation.id);
        if (existingIndex < 0) return [newViolation, ...prev];
        return prev.map((item) => item.id === newViolation.id ? { ...item, ...newViolation } : item);
      });
      selectViolation(newViolation);
    }
  }, [selectViolation, violationContext]);

  const handleSendNotification = () => {
    setShowConfirmModal(true);
  };

  const persistReviewStatus = async (
    violation: Violation,
    backendStatus: 'pending' | 'confirmed' | 'notice_exported' | 'notified' | 'resolved' | 'rejected',
    nextStatus: Violation['status'],
    note = '',
  ) => {
    const detectionId = detectionIdFromViolationId(violation.id);
    const previousStatus = violation.status;
    const applyStatus = (status: Violation['status']) => {
      setViolations((prev) => prev.map((item) => (item.id === violation.id ? { ...item, status } : item)));
      setSelectedViolation((prev) => (prev?.id === violation.id ? { ...prev, status } : prev));
    };

    if (!detectionId) {
      window.alert('Không tìm thấy mã phát hiện để cập nhật trạng thái hồ sơ. Vui lòng chọn lại bản ghi trong danh sách.');
      return false;
    }

    applyStatus(nextStatus);
    try {
      const response = await fetch(`/api/violations/${detectionId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: backendStatus,
          operator: user?.username || 'operator',
          note,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return true;
    } catch (error) {
      applyStatus(previousStatus);
      console.warn('Không thể lưu trạng thái duyệt xuống backend, đã hoàn nguyên trạng thái trên giao diện:', error);
      window.alert('Không thể lưu trạng thái xuống backend. Trạng thái hồ sơ đã được hoàn nguyên để tránh lệch dữ liệu giữa các tab.');
      return false;
    }
  };

  const handleConfirmViolation = () => {
    if (!selectedViolation) return;
    void persistReviewStatus(selectedViolation, 'confirmed', 'approved', 'Đã đối chiếu ảnh chứng cứ và xác nhận hồ sơ.');
  };

  const handleResolveViolation = () => {
    if (!selectedViolation) return;
    if (!['approved', 'fined_sent', 'paid'].includes(selectedViolation.status)) {
      window.alert('Hồ sơ cần được xác nhận hoặc đã phát hành tài liệu/thông báo trước khi đánh dấu Đã xử lý.');
      return;
    }
    const ok = window.confirm('Đóng hồ sơ này ở trạng thái Đã xử lý? Sau khi đóng, hồ sơ sẽ bị khóa thao tác SMS và xuất biên bản từ màn hình giám sát.');
    if (!ok) return;
    void persistReviewStatus(selectedViolation, 'resolved', 'resolved', 'Hồ sơ đã được xử lý hoàn tất.');
  };

  const persistNotificationHistory = async (item: NotificationHistoryItem) => {
    try {
      const response = await fetch('/api/notification-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          violation_id: item.violationId,
          detection_id: detectionIdFromViolationId(item.violationId),
          license_plate: selectedViolation?.licensePlate || '',
          channel: item.channel,
          status: item.status,
          recipient: item.recipient,
          message: item.message,
          operator: item.operator,
          sent_at: item.sentAt.toISOString(),
        }),
      });
      if (!response.ok) return null;
      const saved = await response.json();
      return {
        ...item,
        id: String(saved.id || item.id),
        sentAt: saved.sent_at ? new Date(saved.sent_at) : item.sentAt,
      } as NotificationHistoryItem;
    } catch (error) {
      console.warn('Không thể lưu lịch sử gửi thông báo xuống backend:', error);
      return null;
    }
  };

  const appendNotificationHistory = async (items: NotificationHistoryItem[]) => {
    const savedItems = await Promise.all(items.map((item) => persistNotificationHistory(item)));
    const finalItems = savedItems.map((item, index) => item || items[index]);
    setNotificationHistory((prev) => {
      const next = [...finalItems, ...prev].slice(0, 80);
      window.localStorage.setItem(
        'violation_notification_history',
        JSON.stringify(next.map((item) => ({ ...item, sentAt: item.sentAt.toISOString() }))),
      );
      return next;
    });
  };

  const confirmSendNotification = async () => {
    if (selectedViolation) {
      const now = new Date();
      const operator = user?.username || 'admin';
      const fineInfo = getViolationFineInfo(selectedViolation.violation, selectedViolation.vehicleType);
      const fineNotice = formatFineForNotice(fineInfo);
      const noticeMessage = `Thông báo vi phạm ${selectedViolation.licensePlate}. ${fineNotice}`;
      const send = async (channel: 'sms' | 'email', recipient?: string) => {
        if (!recipient) return false;
        try {
          const response = await fetch('/api/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, recipient, message: noticeMessage }),
          });
          return response.ok;
        } catch {
          return false;
        }
      };
      const [smsSent, emailSent] = await Promise.all([
        send('sms', selectedViolation.ownerInfo?.phone),
        send('email', selectedViolation.ownerInfo?.email),
      ]);
      await appendNotificationHistory([
        {
          id: `${selectedViolation.id}-sms-${now.getTime()}`,
          violationId: selectedViolation.id,
          channel: 'sms',
          status: smsSent ? 'sent' : 'failed',
          sentAt: now,
          operator,
          recipient: selectedViolation.ownerInfo?.phone || 'Chưa có số ?iện thoại',
          message: smsSent
            ? `Đã gửi SMS cảnh báo tới chủ xe ${selectedViolation.licensePlate}`
            : 'Không gửi được SMS: thiếu người nhận hoặc nhà cung cấp chưa sẵn sàng',
        },
        {
          id: `${selectedViolation.id}-email-${now.getTime()}`,
          violationId: selectedViolation.id,
          channel: 'email',
          status: emailSent ? 'sent' : 'failed',
          sentAt: new Date(now.getTime() + 1200),
          operator,
          recipient: selectedViolation.ownerInfo?.email || 'Chưa có email',
          message: emailSent
            ? `Đã gửi email thông báo phạt cho biển ${selectedViolation.licensePlate}`
            : 'Không gửi được email: thiếu người nhận hoặc nhà cung cấp chưa sẵn sàng',
        },
      ]);
      setShowConfirmModal(false);
      if (smsSent || emailSent) {
        await persistReviewStatus(selectedViolation, 'notified', 'fined_sent', 'Đã gửi thông báo qua ít nhất một kênh.');
      } else {
        window.alert('Không gửi được thông báo. Hồ sơ chưa được chuyển sang trạng thái đã thông báo.');
      }
    }
  };

  const toggleStableDemoMode = () => {
    setStableDemoMode((prev) => {
      const next = !prev;
      window.localStorage.setItem('stable_violation_demo_mode', next ? '1' : '0');
      return next;
    });
  };

  useEffect(() => {
    setPlateCorrectionDraft(selectedViolation?.licensePlate || '');
  }, [selectedViolation?.id, selectedViolation?.licensePlate]);

  const applyPlateCorrection = async () => {
    if (!selectedViolation) return;
    const cleanedPlate = plateCorrectionDraft.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (cleanedPlate.length < 6) {
      window.alert('Biển số cần tối thiểu 6 ký tự chữ/số.');
      return;
    }

    const nextPlate = normalizePlateDisplay(cleanedPlate);
    const detectionId = Number(selectedViolation.id.match(/\d+/)?.[0] || '');
    if (Number.isFinite(detectionId) && detectionId > 0) {
      try {
        const response = await fetch(`/api/detections/${detectionId}/plate`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plate_number: cleanedPlate,
            is_simulated: false,
            is_temporary: false,
          }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.warn('Cannot persist plate correction.', error);
        window.alert('Không thể lưu biển số mới xuống backend. Dữ liệu trên giao diện chưa được thay đổi.');
        return;
      }
    }

    setViolations((prev) =>
      prev.map((item) =>
        item.id === selectedViolation.id
          ? { ...item, licensePlate: nextPlate, ownerInfo: demoOwnerForPlate(nextPlate, item) }
          : item,
      ),
    );
    setSelectedViolation((prev) =>
      prev ? { ...prev, licensePlate: nextPlate, ownerInfo: demoOwnerForPlate(nextPlate, prev) } : prev,
    );
    setPlateCorrectionDraft(nextPlate);
  };

  const buildSelectedViolationNotice = (): ViolationNoticeExport | null => {
    if (!selectedViolation) return null;
    const fineInfo = getViolationFineInfo(selectedViolation.violation, selectedViolation.vehicleType);
    return {
      id: caseCodeForViolation(selectedViolation),
      licensePlate: selectedViolation.licensePlate,
      vehicleType: selectedViolation.vehicleType,
      violation: selectedViolation.violation,
      timestamp: `${formatDate(selectedViolation.timestamp)} ${formatTime(selectedViolation.timestamp)}`,
      camera: selectedViolation.camera,
      status: mapStatusLabel(selectedViolation.status),
      ownerName: selectedViolation.ownerInfo?.name,
      ownerPhone: selectedViolation.ownerInfo?.phone,
      ownerEmail: selectedViolation.ownerInfo?.email,
      ownerAddress: selectedViolation.ownerInfo?.address,
      vehicleImage: selectedViolation.images.overview,
      plateImage: selectedViolation.images.closeup,
      ocrScore: selectedViolation.ocrScore,
      fineAmount: fineInfo.amountLabel,
      fineBasis: fineInfo.legalBasis,
      fineNote: [
        fineInfo.pointDeduction,
        fineInfo.note,
      ].filter(Boolean).join('. '),
    };
  };

  const handleExportSelectedPdf = async () => {
    const notice = buildSelectedViolationNotice();
    if (!notice) return;
    try {
      await exportViolationNoticePDF(notice);
      if (selectedViolation) {
        void persistReviewStatus(selectedViolation, 'notice_exported', 'fined_sent', 'Đã xuất hồ sơ vi phạm PDF.');
        const now = new Date();
        await appendNotificationHistory([
          {
            id: `${selectedViolation.id}-email-notice-${now.getTime()}`,
            violationId: selectedViolation.id,
            channel: 'email',
            status: selectedViolation.ownerInfo?.email ? 'sent' : 'failed',
            sentAt: now,
            operator: user?.username || 'admin',
            recipient: selectedViolation.ownerInfo?.email || 'Chưa có email',
            message: selectedViolation.ownerInfo?.email
              ? `Đã xuất và gửi email kèm biên bản cho biển ${selectedViolation.licensePlate}`
              : 'Không gửi được email kèm biên bản vì hồ sơ chưa có địa chỉ email',
          },
        ]);
        if (selectedViolation.ownerInfo?.email) {
          setViolations((prev) =>
            prev.map((v) =>
              v.id === selectedViolation.id ? { ...v, status: 'fined_sent' } : v
            )
          );
          setSelectedViolation((prev) =>
            prev ? { ...prev, status: 'fined_sent' } : null
          );
        }
      }
      setShowPdfPreview(false);
    } catch (error) {
      console.error('Export violation PDF failed', error);
      window.alert('Không thể xuất PDF biên bản. Vui lòng kiểm tra dữ liệu hồ sơ và thử lại.');
    }
  };

  const resolveTimeRange = useCallback((preset: TimePreset, customFrom: string, customTo: string) => {
    if (preset === 'all') return null;
    const now = new Date();
    const today = startOfDay(now);
    if (preset === 'today') return { from: today, to: endOfDay(now) };
    if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    if (preset === 'last7') {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    if (preset === 'last30') {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    if (preset === 'thisMonth') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    const from = parseDDMMYYYY(customFrom);
    const to = parseDDMMYYYY(customTo);
    if (!from || !to) return null;
    return { from: startOfDay(from), to: endOfDay(to) };
  }, [endOfDay, parseDDMMYYYY, startOfDay]);

  const mapStatusLabel = (s: Violation['status']) => {
    if (s === 'pending') return 'Chờ duyệt';
    if (s === 'approved') return 'Đã duyệt';
    if (s === 'fined_sent' || s === 'processing') return 'Đã gửi phạt';
    if (s === 'paid' || s === 'resolved') return 'Đã xử lý';
    if (s === 'cancelled') return 'Đã huỷ / Bỏ qua';
    return 'Chờ duyệt';
  };

  const caseCodeForViolation = (item: Violation) => {
    const yyyy = item.timestamp.getFullYear();
    const mm = String(item.timestamp.getMonth() + 1).padStart(2, '0');
    const dd = String(item.timestamp.getDate()).padStart(2, '0');
    const cam = item.camera.replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'CAM';
    const numericId = item.id.match(/\d+/)?.[0] || String(Math.abs(normalizePlateKey(item.licensePlate).split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)));
    return `VP-${yyyy}${mm}${dd}-${cam}-${numericId.padStart(6, '0').slice(-6)}`;
  };

  const needsOcrReview = (item: Violation) => {
    const plateText = item.licensePlate.toLowerCase();
    return (
      plateText.includes('ocr') ||
      plateText.includes('unknown') ||
      !item.images.closeup ||
      (item.ocrScore !== undefined && item.ocrScore > 0 && item.ocrScore < 0.55)
    );
  };

  const hasNotificationSent = useCallback((item: Violation) => {
    if (item.status === 'processing' || item.status === 'fined_sent') return true;
    return notificationHistory.some((history) => history.violationId === item.id && history.status === 'sent');
  }, [notificationHistory]);

  const presentationViolations = useMemo(() => {
    const curated = [...violations]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const day = curated.filter((item) => item.lightingCondition !== 'night');
    const night = curated.filter((item) => item.lightingCondition === 'night');
    const mixed: Violation[] = [];

    while (day.length || night.length) {
      const firstDay = day.shift();
      const secondDay = day.shift();
      const nightItem = night.shift();
      if (firstDay) mixed.push(firstDay);
      if (secondDay) mixed.push(secondDay);
      if (nightItem) mixed.push(nightItem);
    }
    return mixed.slice(0, 120);
  }, [violations]);

  const stableDemoViolations = useMemo(() => {
    return presentationViolations
      .filter((item) => item.evidenceCurated)
      .filter((item) => {
        const plateKey = normalizePlateKey(item.licensePlate);
        const plateText = item.licensePlate.toLowerCase();
        const hasPlate = plateKey.length >= 7 && plateKey !== 'UNKNOWN' && !plateText.includes('ocr');
        const hasOwner = Boolean(item.ownerInfo?.name && !normalizePlateKey(item.ownerInfo.name).includes('CHUAXACDINH'));
        return Boolean(item.images.overview && item.images.closeup && hasPlate && hasOwner);
      })
      .sort((a, b) => {
        const aScore = (a.ocrScore || 0) + (a.images.closeup ? 1 : 0) + (a.images.overview ? 1 : 0);
        const bScore = (b.ocrScore || 0) + (b.images.closeup ? 1 : 0) + (b.images.overview ? 1 : 0);
        return bScore - aScore || b.timestamp.getTime() - a.timestamp.getTime();
      });
  }, [presentationViolations]);

  const filteredViolations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const sourceViolations = stableDemoMode ? stableDemoViolations : presentationViolations;
    const timeRange = resolveTimeRange(
      appliedFilters.timePreset,
      appliedFilters.customFrom,
      appliedFilters.customTo,
    );
    const hasCustomRange = appliedFilters.timePreset === 'custom';

    return sourceViolations.filter((v) => {
      if (processingFilter === 'ocr_review' && !needsOcrReview(v)) return false;
      if (processingFilter === 'not_notified' && (needsOcrReview(v) || hasNotificationSent(v))) return false;
      if (processingFilter === 'notified' && !hasNotificationSent(v)) return false;

      if (q) {
        const ok =
          matchesSearch(v.licensePlate, q) ||
          v.violation.toLowerCase().includes(q) ||
          v.camera.toLowerCase().includes(q) ||
          v.vehicleType.toLowerCase().includes(q);
        if (!ok) return false;
      }

      if (appliedFilters.violationTypes.length > 0 && !appliedFilters.violationTypes.includes(v.violation)) {
        return false;
      }

      if (appliedFilters.status !== 'all') {
        const label = mapStatusLabel(v.status);
        const wanted =
          appliedFilters.status === 'pending'
            ? 'Chờ duyệt'
            : appliedFilters.status === 'approved'
              ? 'Đã duyệt'
              : appliedFilters.status === 'fined_sent'
                ? 'Đã gửi phạt'
                : appliedFilters.status === 'paid'
                  ? 'Đã nộp phạt'
                  : 'Đã huỷ / Bỏ qua';
        if (label !== wanted) return false;
      }

      if (timeRange) {
        const ts = v.timestamp;
        if (ts < timeRange.from || ts > timeRange.to) return false;
      } else if (hasCustomRange) {
        // custom range invalid -> show nothing until user applies valid range
        return false;
      }

      if (appliedFilters.cameras.length > 0 && !appliedFilters.cameras.includes(v.camera)) {
        return false;
      }

      return true;
    });
  }, [appliedFilters, hasNotificationSent, presentationViolations, processingFilter, resolveTimeRange, searchTerm, stableDemoMode, stableDemoViolations]);

  const filteredAllDetections = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const timeRange = resolveTimeRange(
      appliedFilters.timePreset,
      appliedFilters.customFrom,
      appliedFilters.customTo,
    );
    const hasCustomRange = appliedFilters.timePreset === 'custom';

    return allDetections.filter((v) => {
      if (q) {
        const ok =
          matchesSearch(v.licensePlate, q) ||
          v.violation.toLowerCase().includes(q) ||
          v.camera.toLowerCase().includes(q) ||
          v.vehicleType.toLowerCase().includes(q);
        if (!ok) return false;
      }

      if (timeRange) {
        const ts = v.timestamp;
        if (ts < timeRange.from || ts > timeRange.to) return false;
      } else if (hasCustomRange) {
        return false;
      }

      if (appliedFilters.cameras.length > 0 && !appliedFilters.cameras.includes(v.camera)) {
        return false;
      }

      return true;
    });
  }, [allDetections, appliedFilters.cameras, appliedFilters.customFrom, appliedFilters.customTo, appliedFilters.timePreset, resolveTimeRange, searchTerm]);

  const totalCount = stableDemoMode ? stableDemoViolations.length : presentationViolations.length;
  const filteredCount = filteredViolations.length;

  useEffect(() => {
    if (!stableDemoMode) return;
    if (filteredViolations.length === 0) return;
    if (!selectedViolation || !filteredViolations.some((item) => item.id === selectedViolation.id)) {
      selectViolation(filteredViolations[0]);
    }
  }, [filteredViolations, selectViolation, selectedViolation, stableDemoMode]);

  const violationSummary = useMemo(() => {
    const violations = presentationViolations;
    const withPlate = violations.filter((item) => item.licensePlate !== 'Chưa xác nhận OCR').length;
    const pending = violations.filter((item) => item.status === 'pending').length;
    const ocrScores = violations.map((item) => item.ocrScore || 0).filter((score) => score > 0);
    const avgOcr = ocrScores.length
      ? Math.round((ocrScores.reduce((sum, score) => sum + score, 0) / ocrScores.length) * 100)
      : 0;
    return { withPlate, pending, avgOcr };
  }, [presentationViolations]);

  const formatDate = (ts: Date) =>
    ts.toLocaleDateString('vi-VN');
  const formatTime = (ts: Date) =>
    ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const cameraChipLabel = useMemo(() => {
    if (appliedFilters.cameras.length === ALL_CAMERA_IDS.length) return 'Tất cả camera';
    return `${appliedFilters.cameras.length} camera`;
  }, [ALL_CAMERA_IDS.length, appliedFilters.cameras.length]);

  const violationTypeChipLabel = useMemo(() => {
    if (!appliedFilters.violationTypes.length) return '';
    return `Vi phạm (${appliedFilters.violationTypes.length})`;
  }, [appliedFilters.violationTypes.length]);

  const statusChipLabel = useMemo(() => {
    if (appliedFilters.status === 'all') return '';
    if (appliedFilters.status === 'pending') return 'Chờ duyệt';
    if (appliedFilters.status === 'approved') return 'Đã duyệt';
    if (appliedFilters.status === 'fined_sent') return 'Đã gửi phạt';
    if (appliedFilters.status === 'resolved') return 'Đã xử lý';
    if (appliedFilters.status === 'paid') return 'Đã nộp phạt';
    return 'Đã huỷ / Bỏ qua';
  }, [appliedFilters.status]);

  const timeChipLabel = useMemo(() => {
    const p = appliedFilters.timePreset;
    if (p === 'all') return '';
    if (p === 'yesterday') return 'Hôm qua';
    if (p === 'last7') return '7 ngày gần nhất';
    if (p === 'last30') return '30 ngày gần nhất';
    if (p === 'thisMonth') return 'Tháng này';
    if (p === 'custom') return `Từ ${appliedFilters.customFrom} → ${appliedFilters.customTo}`;
    return '';
  }, [appliedFilters.customFrom, appliedFilters.customTo, appliedFilters.timePreset]);

  const resetAllFilters = () => {
    setAppliedFilters(DEFAULT_FILTERS);
    setDraftFilters(DEFAULT_FILTERS);
    setViolationTypeTouched(false);
    setCameraSearch('');
    setFilterError('');
    const p = buildFilterParams(DEFAULT_FILTERS, searchTerm);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const applyDraftFilters = () => {
    setFilterError('');

    // Group 1 constraint: if user touched this group, must have >= 1 selection
    if (violationTypeTouched && draftFilters.violationTypes.length === 0) {
      setFilterError('Vui lòng chọn ít nhất 1 loại vi phạm');
      return;
    }

    // Group 3 constraints
    if (draftFilters.timePreset === 'custom') {
      const from = parseDDMMYYYY(draftFilters.customFrom);
      const to = parseDDMMYYYY(draftFilters.customTo);
      if (!from || !to) {
        setFilterError('Vui lòng nhập đầy đủ Từ ngày và Đến ngày (DD/MM/YYYY)');
        return;
      }
      if (from > to) {
        setFilterError('Từ ngày không được lớn hơn Đến ngày');
        return;
      }
      const now = new Date();
      if (endOfDay(to) > endOfDay(now)) {
        setFilterError('Đến ngày không được lớn hơn ngày hiện tại');
        return;
      }
      const diff = daysDiff(from, to);
      if (diff > 90) {
        setFilterError('Khoảng thời gian tối đa là 90 ngày');
        return;
      }
    }

    // Group 4 constraints: max 10 cameras
    if (draftFilters.cameras.length > 10) {
      setFilterError('Chỉ được chọn tối đa 10 camera');
      return;
    }

    setAppliedFilters(draftFilters);
    setFilterOpen(false);

    const p = buildFilterParams(draftFilters, searchTerm);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const removeGroupFilter = (group: 'vtypes' | 'status' | 'time' | 'cams') => {
    const next: Filters = { ...appliedFilters };
    if (group === 'vtypes') next.violationTypes = [];
    if (group === 'status') next.status = 'all';
    if (group === 'time') {
      next.timePreset = 'all';
      next.customFrom = '';
      next.customTo = '';
    }
    if (group === 'cams') next.cameras = ALL_CAMERA_IDS;

    setAppliedFilters(next);
    setDraftFilters(next);
    setViolationTypeTouched(false);
    setCameraSearch('');
    setFilterError('');

    const p = buildFilterParams(next, searchTerm);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const toggleViolationType = (t: string) => {
    setViolationTypeTouched(true);
    setDraftFilters((prev) => {
      const set = new Set(prev.violationTypes);
      if (set.has(t)) set.delete(t);
      else set.add(t);
      return { ...prev, violationTypes: Array.from(set) };
    });
  };

  const setTimePreset = (p: TimePreset) => {
    setDraftFilters((prev) => {
      if (p !== 'custom') {
        return { ...prev, timePreset: p, customFrom: '', customTo: '' };
      }
      return { ...prev, timePreset: p };
    });
  };

  const toggleDistrict = (district: string) => {
    const group = CAMERA_GROUPS.find((g) => g.district === district);
    if (!group) return;
    const ids = group.cameras.map((c) => c.id);
    setDraftFilters((prev) => {
      const set = new Set(prev.cameras);
      const allIn = ids.every((id) => set.has(id));
      if (allIn) {
        ids.forEach((id) => set.delete(id));
      } else {
        ids.forEach((id) => set.add(id));
      }
      return { ...prev, cameras: Array.from(set) };
    });
  };

  const toggleCamera = (id: string) => {
    setDraftFilters((prev) => {
      const set = new Set(prev.cameras);
      if (set.has(id)) {
        set.delete(id);
        return { ...prev, cameras: Array.from(set) };
      }
      if (set.size >= 10) {
        setFilterError('Chỉ được chọn tối đa 10 camera');
        return prev;
      }
      set.add(id);
      return { ...prev, cameras: Array.from(set) };
    });
  };

  const filteredCameraGroups = useMemo(() => {
    const q = cameraSearch.trim().toLowerCase();
    if (!q) return CAMERA_GROUPS;
    return CAMERA_GROUPS.map((g) => ({
      ...g,
      cameras: g.cameras.filter((c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)),
    })).filter((g) => g.cameras.length > 0);
  }, [CAMERA_GROUPS, cameraSearch]);

  const applyButtonEnabled = isDefaultDirty;

  const selectedViolationActionsDisabled =
    selectedViolation?.status === 'cancelled' || selectedViolation?.status === 'resolved';
  const selectedViolationCanConfirm = Boolean(
    selectedViolation && !selectedViolationActionsDisabled && ['pending', 'processing'].includes(selectedViolation.status),
  );
  const selectedViolationCanResolve = Boolean(
    selectedViolation && ['approved', 'fined_sent', 'paid'].includes(selectedViolation.status),
  );
  const selectedViolationCanIssueDocument = Boolean(
    selectedViolation && !selectedViolationActionsDisabled && ['approved', 'fined_sent', 'paid'].includes(selectedViolation.status),
  );
  const selectedViolationStatusHint = (() => {
    if (!selectedViolation) return '';
    if (selectedViolation.status === 'resolved') return 'Hồ sơ đã đóng. Các thao tác phát hành từ màn hình giám sát được khóa để giữ nguyên vết xử lý.';
    if (selectedViolation.status === 'cancelled') return 'Hồ sơ đã hủy, không thể tiếp tục xử lý.';
    if (selectedViolation.status === 'pending') return 'Cần xác nhận biển số và chứng cứ trước khi gửi thông báo, xuất biên bản hoặc đóng hồ sơ.';
    if (selectedViolation.status === 'approved') return 'Hồ sơ đã xác nhận. Có thể gửi thông báo, xuất biên bản hoặc đóng khi nghiệp vụ đã hoàn tất.';
    if (selectedViolation.status === 'fined_sent') return 'Hồ sơ đã phát hành thông báo hoặc tài liệu. Có thể chuyển Đã xử lý khi đã hoàn tất nghiệp vụ.';
    return 'Theo dõi trạng thái xử lý của hồ sơ này.';
  })();
  const selectedNotificationHistory = useMemo(() => {
    if (!selectedViolation) return [];
    return notificationHistory
      .filter((item) => item.violationId === selectedViolation.id)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }, [notificationHistory, selectedViolation]);
  const selectedFineInfo = useMemo(
    () => selectedViolation ? getViolationFineInfo(selectedViolation.violation, selectedViolation.vehicleType) : null,
    [selectedViolation],
  );
  const processingStats = useMemo(() => {
    const source = stableDemoMode ? stableDemoViolations : presentationViolations;
    const ocrReview = source.filter(needsOcrReview).length;
    const notified = source.filter(hasNotificationSent).length;
    const notNotified = source.filter((item) => !needsOcrReview(item) && !hasNotificationSent(item)).length;
    return { ocrReview, notified, notNotified };
  }, [hasNotificationSent, presentationViolations, stableDemoMode, stableDemoViolations]);
  const selectedNotice = buildSelectedViolationNotice();

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(260px,0.92fr)_minmax(500px,1.52fr)] 2xl:grid-cols-[minmax(280px,0.92fr)_minmax(560px,1.58fr)_minmax(300px,0.86fr)] gap-0 h-auto 2xl:h-[calc(100vh-132px)] min-h-[640px] border border-border rounded-lg overflow-hidden bg-background shadow-sm">
      {/* Left: Danh sách vi phạm */}
      <div className="p-3 sm:p-4 flex flex-col min-h-0 border-r border-border bg-white">
        {/* Tab Switcher: Hồ sơ vi phạm vs Tất cả xe ghi nhận */}
        <div className="grid grid-cols-2 gap-1.5 mb-3 p-1 bg-slate-100 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setViewListMode('violations')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition ${
              viewListMode === 'violations'
                ? 'bg-white text-rose-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            <span>Hồ sơ vi phạm</span>
            <span className={`ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full ${
              viewListMode === 'violations' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
            }`}>
              {filteredViolations.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setViewListMode('all_detected')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition ${
              viewListMode === 'all_detected'
                ? 'bg-white text-sky-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Car className="w-3.5 h-3.5 text-sky-600" />
            <span>Xe ghi nhận</span>
            <span className={`ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full ${
              viewListMode === 'all_detected' ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-700'
            }`}>
              {filteredAllDetections.length}
            </span>
          </button>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Tổng hồ sơ</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{totalCount}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2">
            <p className="text-[10px] font-semibold uppercase text-amber-700">Chờ xử lý</p>
            <p className="mt-1 text-lg font-bold text-amber-800">{violationSummary.pending}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2">
            <p className="text-[10px] font-semibold uppercase text-emerald-700">OCR TB</p>
            <p className="mt-1 text-lg font-bold text-emerald-800">{violationSummary.avgOcr || '--'}%</p>
          </div>
        </div>
        <div className="relative" ref={filterPanelRef}>
          <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm biển số, hành vi..."
              className="w-full pl-8 pr-2 py-1.5 text-sm rounded border border-border bg-background"
            />
          </div>
          <button
            onClick={() => {
              setFilterError('');
              setViolationTypeTouched(false);
              setCameraSearch('');
              setDraftFilters(appliedFilters);
              setFilterOpen((v) => !v);
            }}
            className="relative px-3 py-1.5 text-sm rounded border border-border bg-background flex items-center gap-1"
          >
            <Filter className="w-3.5 h-3.5" />
            Bộ lọc
            {activeFilterGroupCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5 py-0.5 leading-none">
                {activeFilterGroupCount}
              </span>
            )}
          </button>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            {([
              { id: 'all', label: 'Tất cả', count: stableDemoMode ? stableDemoViolations.length : presentationViolations.length },
              { id: 'ocr_review', label: 'Cần duyệt OCR', count: processingStats.ocrReview },
              { id: 'not_notified', label: 'Chưa gửi', count: processingStats.notNotified },
              { id: 'notified', label: 'Đã gửi', count: processingStats.notified },
            ] as Array<{ id: typeof processingFilter; label: string; count: number }>).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setProcessingFilter(item.id)}
                className={`rounded-md border px-2 py-1.5 text-left font-semibold transition ${
                  processingFilter === item.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{item.label}</span>
                <span className="float-right">{item.count}</span>
              </button>
            ))}
          </div>

          {/* Active chips */}
          {(appliedFilters.violationTypes.length > 0 ||
            appliedFilters.status !== 'all' ||
            appliedFilters.timePreset !== 'all' ||
            appliedFilters.cameras.length !== ALL_CAMERA_IDS.length) && (
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {violationTypeChipLabel && (
                <button
                  onClick={() => removeGroupFilter('vtypes')}
                  className="text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 rounded px-2 py-0.5"
                  title="Bỏ lọc loại vi phạm"
                >
                  {violationTypeChipLabel} ×
                </button>
              )}
              {statusChipLabel && (
                <button
                  onClick={() => removeGroupFilter('status')}
                  className="text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 rounded px-2 py-0.5"
                  title="Bỏ lọc trạng thái"
                >
                  {statusChipLabel} ×
                </button>
              )}
              {timeChipLabel && (
                <button
                  onClick={() => removeGroupFilter('time')}
                  className="text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 rounded px-2 py-0.5"
                  title="Bỏ lọc thời gian"
                >
                  {timeChipLabel} ×
                </button>
              )}
              {(
                appliedFilters.cameras.length !== ALL_CAMERA_IDS.length
              ) && (
                <button
                  onClick={() => removeGroupFilter('cams')}
                  className="text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 rounded px-2 py-0.5"
                  title="Bỏ lọc camera"
                >
                  {cameraChipLabel} ×
                </button>
              )}
              <button
                onClick={resetAllFilters}
                className="text-[11px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Xoá tất cả
              </button>
            </div>
          )}

          {/* Dropdown panel */}
          {filterOpen && (
            <div className="absolute z-40 left-0 right-0 top-[calc(100%+4px)] bg-background border border-border rounded-lg shadow-lg p-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Group 1: Violation types */}
                <div className="border border-border rounded-md p-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold">Loại vi phạm</div>
                    <div className="text-[11px] text-muted-foreground">
                      {draftFilters.violationTypes.length > 0 ? `Đã chọn ${draftFilters.violationTypes.length}` : 'Chưa chọn'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {VIOLATION_OPTIONS.map((t) => (
                      <label key={t} className="flex items-center gap-2 text-xs select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftFilters.violationTypes.includes(t)}
                          onChange={() => toggleViolationType(t)}
                        />
                        <span>{t}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Group 2: Status */}
                <div className="border border-border rounded-md p-2">
                  <div className="text-xs font-semibold mb-2">Trạng thái xử lý</div>
                  <div className="grid grid-cols-2 gap-y-1">
                    {([
                      { id: 'all', label: 'Tất cả' },
                      { id: 'pending', label: 'Chờ duyệt' },
                      { id: 'approved', label: 'Đã duyệt' },
                      { id: 'fined_sent', label: 'Đã gửi phạt' },
                      { id: 'resolved', label: 'Đã xử lý' },
                      { id: 'paid', label: 'Đã nộp phạt' },
                      { id: 'cancelled', label: 'Đã huỷ / Bỏ qua' },
                    ] as Array<{ id: StatusFilter; label: string }>).map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 text-xs select-none cursor-pointer">
                        <input
                          type="radio"
                          name="statusFilter"
                          checked={draftFilters.status === opt.id}
                          onChange={() => setDraftFilters((prev) => ({ ...prev, status: opt.id }))}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Group 3: Time */}
                <div className="border border-border rounded-md p-2">
                  <div className="text-xs font-semibold mb-2">Khoảng thời gian</div>
                  <div className="grid grid-cols-2 gap-y-1">
                    {([
                      { id: 'all', label: 'Tất cả thời gian' },
                      { id: 'today', label: 'Hôm nay' },
                      { id: 'yesterday', label: 'Hôm qua' },
                      { id: 'last7', label: '7 ngày gần nhất' },
                      { id: 'last30', label: '30 ngày gần nhất' },
                      { id: 'thisMonth', label: 'Tháng này' },
                      { id: 'custom', label: 'Tuỳ chọn' },
                    ] as Array<{ id: TimePreset; label: string }>).map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 text-xs select-none cursor-pointer">
                        <input
                          type="radio"
                          name="timePreset"
                          checked={draftFilters.timePreset === opt.id}
                          onChange={() => setTimePreset(opt.id)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>

                  {draftFilters.timePreset === 'custom' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[11px] text-muted-foreground mb-1">Từ ngày (DD/MM/YYYY)</div>
                        <input
                          value={draftFilters.customFrom}
                          onChange={(e) => setDraftFilters((prev) => ({ ...prev, customFrom: e.target.value }))}
                          placeholder={formatDDMMYYYY(new Date())}
                          className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground mb-1">Đến ngày (DD/MM/YYYY)</div>
                        <input
                          value={draftFilters.customTo}
                          onChange={(e) => setDraftFilters((prev) => ({ ...prev, customTo: e.target.value }))}
                          placeholder={formatDDMMYYYY(new Date())}
                          className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Group 4: Cameras */}
                <div className="border border-border rounded-md p-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold">Camera / Địa điểm</div>
                    <div className="text-[11px] text-muted-foreground">
                      {draftFilters.cameras.length === ALL_CAMERA_IDS.length ? 'Tất cả camera' : `${draftFilters.cameras.length} camera`}
                    </div>
                  </div>
                  <input
                    value={cameraSearch}
                    onChange={(e) => setCameraSearch(e.target.value)}
                    placeholder="Tìm camera..."
                    className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background mb-2"
                  />
                  <div className="max-h-44 overflow-y-auto pr-1 space-y-2">
                    {filteredCameraGroups.map((g) => {
                      const ids = g.cameras.map((c) => c.id);
                      const allIn = ids.length > 0 && ids.every((id) => draftFilters.cameras.includes(id));
                      const anyIn = ids.some((id) => draftFilters.cameras.includes(id));
                      return (
                        <div key={g.district} className="border border-border/60 rounded-md p-2">
                          <label className="flex items-center gap-2 text-xs font-semibold select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allIn}
                              ref={(el) => {
                                if (el) el.indeterminate = !allIn && anyIn;
                              }}
                              onChange={() => toggleDistrict(g.district)}
                            />
                            <span>{g.district}</span>
                          </label>
                          <div className="mt-2 space-y-1 pl-5">
                            {g.cameras.map((c) => (
                              <label key={c.id} className="flex items-center gap-2 text-xs select-none cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={draftFilters.cameras.includes(c.id)}
                                  onChange={() => toggleCamera(c.id)}
                                />
                                <span className="truncate">{c.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {filterError && (
                <div className="mt-2 text-xs text-red-600 font-medium">
                  {filterError}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setDraftFilters(DEFAULT_FILTERS);
                    setViolationTypeTouched(false);
                    setCameraSearch('');
                    setFilterError('');
                  }}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Xoá tất cả bộ lọc
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setFilterOpen(false);
                      setDraftFilters(appliedFilters);
                      setFilterError('');
                      setViolationTypeTouched(false);
                      setCameraSearch('');
                    }}
                    className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
                  >
                    Đóng
                  </button>
                  <button
                    onClick={applyDraftFilters}
                    disabled={!applyButtonEnabled}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                      applyButtonEnabled ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground cursor-not-allowed'
                    }`}
                  >
                    Áp dụng
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] text-muted-foreground">
            {viewListMode === 'violations' ? (
              <>
                Hiển thị <span className="font-semibold text-foreground">{filteredCount}</span> /{' '}
                <span className="font-semibold text-foreground">{totalCount}</span> vi phạm
              </>
            ) : (
              <>
                Hiển thị <span className="font-semibold text-foreground">{filteredAllDetections.length}</span> /{' '}
                <span className="font-semibold text-foreground">{allDetections.length}</span> xe ghi nhận
              </>
            )}
          </div>
          {(activeFilterGroupCount > 0 || searchTerm) && (
            <button
              onClick={() => {
                resetAllFilters();
                setSearchTerm('');
              }}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Xoá bộ lọc & tìm kiếm
            </button>
          )}
        </div>

        <div className="space-y-2 overflow-y-auto pr-1 flex-1">
          {viewListMode === 'all_detected' ? (
            filteredAllDetections.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-10">
                <div className="font-medium">Không tìm thấy xe ghi nhận phù hợp</div>
                <div className="text-xs mt-1">Hãy thử xóa từ khoá tìm kiếm hoặc kiểm tra lại bộ lọc.</div>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="mt-3 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
                  >
                    Xoá tìm kiếm
                  </button>
                )}
              </div>
            ) : (
              filteredAllDetections.map((vehicle) => {
                const isSelected = selectedViolation?.id === vehicle.id;
                const hasViolation = vehicle.violation && vehicle.violation !== 'Chưa ghi nhận vi phạm';
                return (
                  <button
                    key={vehicle.id}
                    onClick={() => selectViolation(vehicle)}
                    className={`w-full text-left px-2 py-1.5 rounded-md border transition ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50/80 shadow-sm ring-1 ring-sky-300'
                        : 'border-border bg-white hover:border-primary/40 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex gap-2">
                      <div className="w-16 h-12 rounded overflow-hidden bg-slate-900 shrink-0 flex items-center justify-center">
                        {vehicle.images.overview?.startsWith('data:') ? (
                          <img src={vehicle.images.overview} alt="xe" className="w-full h-full object-contain bg-black" />
                        ) : (
                          <Car className="w-6 h-6 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-bold text-sm truncate font-mono text-slate-950">{vehicle.licensePlate}</p>
                          <p className="text-[11px] text-muted-foreground shrink-0">
                            {formatTime(vehicle.timestamp)}
                          </p>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {formatDate(vehicle.timestamp)} · {vehicle.camera} · {vehicle.vehicleType}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          {hasViolation ? (
                            <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded truncate">
                              {vehicle.violation}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                              Lưu thông bình thường
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">
                            {vehicle.ocrScore ? `OCR ${Math.round(vehicle.ocrScore > 1 ? vehicle.ocrScore : vehicle.ocrScore * 100)}%` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )
          ) : filteredViolations.length === 0 ? (
            <div className="space-y-3 py-1">
              {/* Panel thông báo trạng thái */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 text-center">
                <div className="font-semibold text-xs text-slate-800">Không tìm thấy vi phạm phù hợp</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {searchTerm ? `Từ khoá: "${searchTerm}" không có lỗi vi phạm.` : 'Bộ lọc hiện tại không khớp hồ sơ vi phạm nào.'}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="px-2.5 py-1 rounded border border-border text-[11px] font-medium bg-white hover:bg-slate-100"
                    >
                      Xoá tìm kiếm
                    </button>
                  )}
                  {activeFilterGroupCount > 0 && (
                    <button
                      type="button"
                      onClick={() => resetAllFilters()}
                      className="px-2.5 py-1 rounded border border-border text-[11px] font-medium bg-white hover:bg-slate-100"
                    >
                      Xoá bộ lọc
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewListMode('all_detected')}
                    className="px-2.5 py-1 rounded bg-sky-600 text-white text-[11px] font-semibold hover:bg-sky-700 inline-flex items-center gap-1 shadow-sm"
                  >
                    <Car className="w-3 h-3" />
                    Xem tất cả xe ghi nhận ({filteredAllDetections.length})
                  </button>
                </div>
              </div>

              {/* Danh sách các xe ghi nhận để người dùng bấm chọn xe */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5 text-sky-600" />
                    Danh sách xe ghi nhận ({filteredAllDetections.length})
                  </span>
                  <span className="text-[10px] text-slate-500">Nhấp chọn để xem chi tiết</span>
                </div>
                <div className="space-y-1.5">
                  {filteredAllDetections.slice(0, 40).map((vehicle) => {
                    const isSelected = selectedViolation?.id === vehicle.id;
                    const hasViolation = vehicle.violation && vehicle.violation !== 'Chưa ghi nhận vi phạm';
                    return (
                      <button
                        key={vehicle.id}
                        type="button"
                        onClick={() => selectViolation(vehicle)}
                        className={`w-full text-left px-2 py-1.5 rounded-md border transition ${
                          isSelected
                            ? 'border-sky-500 bg-sky-50/80 shadow-sm ring-1 ring-sky-300'
                            : 'border-border bg-white hover:border-primary/40 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex gap-2">
                          <div className="w-16 h-12 rounded overflow-hidden bg-slate-900 shrink-0 flex items-center justify-center">
                            {vehicle.images.overview?.startsWith('data:') ? (
                              <img src={vehicle.images.overview} alt="xe" className="w-full h-full object-contain bg-black" />
                            ) : (
                              <Car className="w-6 h-6 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className="font-bold text-sm truncate font-mono text-slate-950">{vehicle.licensePlate}</p>
                              <p className="text-[11px] text-muted-foreground shrink-0">{formatTime(vehicle.timestamp)}</p>
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {formatDate(vehicle.timestamp)} · {vehicle.camera} · {vehicle.vehicleType}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                              {hasViolation ? (
                                <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded truncate">
                                  {vehicle.violation}
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                                  Lưu thông bình thường
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500">
                                {vehicle.ocrScore ? `OCR ${Math.round(vehicle.ocrScore > 1 ? vehicle.ocrScore : vehicle.ocrScore * 100)}%` : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            filteredViolations.map((violation) => {
              const rawNumId = detectionIdFromViolationId(violation.id);
              return (
              <button
                key={violation.id}
                id={`case-${rawNumId || violation.id}`}
                onClick={() => selectViolation(violation)}
                className={`w-full text-left px-2 py-1.5 rounded-md border transition ${
                  selectedViolation?.id === violation.id
                    ? 'border-sky-400 bg-sky-50/60'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <div className="flex gap-2">
                  <div className="w-16 h-12 rounded overflow-hidden bg-muted shrink-0">
                    {violation.images.overview.startsWith('data:') ? (
                      <img src={violation.images.overview} alt="xe" className="w-full h-full object-contain bg-black" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-sm truncate">{violation.licensePlate}</p>
                      <p className="text-[11px] text-muted-foreground shrink-0">
                        {formatTime(violation.timestamp)}
                      </p>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {formatDate(violation.timestamp)} · {violation.camera}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                      {caseCodeForViolation(violation)}
                    </div>
                    <div className="mt-1">
                      <span className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                        {violation.violation}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {mapStatusLabel(violation.status)}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
          )}
        </div>
      </div>

      {/* Center: Evidence review */}
      <div className="p-3 sm:p-4 flex flex-col min-h-0 overflow-hidden border-r border-border bg-slate-50">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h4 className="text-lg font-semibold">Bằng chứng ảnh</h4>
            <p className="text-xs text-slate-500">Đối chiếu ảnh toàn xe, crop biển và OCR trước khi duyệt biên bản.</p>
          </div>
          {selectedViolation && (
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              needsOcrReview(selectedViolation)
                ? 'border border-amber-200 bg-amber-50 text-amber-700'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}>
              {needsOcrReview(selectedViolation) ? 'Cần duyệt OCR' : 'Đủ điều kiện duyệt'}
            </span>
          )}
        </div>

        {selectedViolation ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Biển OCR/log</p>
                <p className="mt-1 font-mono text-lg font-black text-slate-950">{selectedViolation.licensePlate}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Độ tin cậy OCR</p>
                <p className="mt-1 text-lg font-black text-slate-950">
                  {selectedViolation.ocrScore ? `${Math.round(selectedViolation.ocrScore * 100)}%` : 'Chưa có'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Mã hồ sơ</p>
                <p className="mt-1 font-mono text-sm font-black text-slate-950">{caseCodeForViolation(selectedViolation)}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-950">Ảnh toàn cảnh phương tiện</p>
                <span className="text-[11px] font-semibold text-slate-500">{formatDate(selectedViolation.timestamp)} {formatTime(selectedViolation.timestamp)}</span>
              </div>
              <div className="flex aspect-video min-h-[280px] max-h-[520px] items-center justify-center overflow-hidden rounded-lg bg-black">
                {selectedViolation.images.overview ? (
                  <img src={selectedViolation.images.overview} alt="Ảnh toàn cảnh xe" className="h-full w-full object-contain bg-black" />
                ) : (
                  <p className="text-sm text-slate-400">Không có ảnh toàn cảnh</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-950">Ảnh crop biển số</p>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                  So khớp với biển đã kiểm duyệt
                </span>
              </div>
              <div className="flex h-[220px] items-center justify-center overflow-hidden rounded-lg bg-black p-3">
                {selectedViolation.images.closeup ? (
                  <img src={selectedViolation.images.closeup} alt="Ảnh crop biển số" className="max-h-full max-w-full object-contain bg-black" />
                ) : (
                  <p className="text-sm text-slate-400">Không có ảnh crop biển</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <p className="font-bold text-slate-900">Checklist log và crop</p>
                <div className="mt-2 space-y-1.5 text-slate-600">
                  <p>Biển trong log: <span className="font-mono font-bold text-slate-950">{selectedViolation.licensePlate}</span></p>
                  <p className="flex items-center gap-1.5">
                    <span className="text-slate-500">Camera:</span>
                    <EntityLink entityType="camera" entityId={selectedViolation.camera} />
                  </p>
                  <p>Trạng thái: <span className="font-bold text-slate-950">{mapStatusLabel(selectedViolation.status)}</span></p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <p className="font-bold text-slate-900">Cảnh báo kiểm duyệt</p>
                <div className="mt-2 space-y-1.5">
                  {needsOcrReview(selectedViolation) ? (
                    <p className="text-amber-700">OCR/crop cần được kiểm tra trước khi xuất biên bản.</p>
                  ) : (
                    <p className="text-emerald-700">OCR đạt ngưỡng hiển thị, vẫn nên đối chiếu bằng mắt với crop.</p>
                  )}
                  {isTruckBodyIdentifier(selectedViolation.plateCropSource, selectedViolation.plateDebugReason) && (
                    <p className="text-emerald-700">Định danh xe tải từ số in trên thùng xe tải.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Chọn một hồ sơ ở cột bên trái để xem ảnh bằng chứng.
          </div>
        )}
      </div>

      {/* Right: Notice editor */}
      <div className="min-h-[520px] xl:col-span-2 2xl:col-span-1 2xl:min-h-0 p-3 sm:p-4 flex flex-col overflow-hidden bg-white">
        <div className="mb-3">
          <h4 className="text-lg font-semibold">Hồ sơ xử lý</h4>
          <p className="text-xs text-slate-500">Kiểm duyệt biển số, trạng thái hồ sơ, thông báo và tài liệu liên quan.</p>
        </div>

        {selectedViolation ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {/* Quick cross-nav actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const rawId = detectionIdFromViolationId(selectedViolation.id) || selectedViolation.id;
                  goTo({ view: 'data-center', tab: 'data' }, { record: rawId, open: 1 });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                <Database className="h-3.5 w-3.5 text-blue-600" />
                Xem bản ghi gốc
              </button>
              <button
                type="button"
                onClick={() => {
                  goTo({ view: 'cases', tab: 'legal' }, { case: selectedViolation.id, rule: selectedViolation.violation });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                <Scale className="h-3.5 w-3.5 text-indigo-600" />
                Xem căn cứ xử phạt
              </button>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3">
              <label className="text-xs font-semibold text-blue-900">Biển số kiểm duyệt</label>
              <div className="mt-1 flex gap-2">
                <input
                  value={plateCorrectionDraft}
                  onChange={(event) => setPlateCorrectionDraft(event.target.value.toUpperCase())}
                  className="min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-3 py-2 font-mono text-sm font-bold text-slate-950 outline-none focus:border-blue-500"
                  placeholder="Ví dụ: 98A25121"
                />
                <button
                  type="button"
                  onClick={applyPlateCorrection}
                  className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Lưu
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-blue-800">
                Bắt buộc đối chiếu với ảnh crop. Sau khi lưu, log/PDF dùng biển đã kiểm duyệt.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="mb-2 text-xs font-bold uppercase text-slate-500">Thông tin xử lý</p>
              <div className="grid grid-cols-1 gap-2 text-xs">
                <div className="rounded-md bg-white p-2">
                  <p className="text-slate-500">Hành vi</p>
                  <p className={`font-bold ${selectedViolation.violation === 'Chưa ghi nhận vi phạm' || !selectedViolation.violation ? 'text-emerald-700' : 'text-red-600'}`}>
                    {selectedViolation.violation || 'Lưu thông bình thường - Chưa ghi nhận lỗi vi phạm'}
                  </p>
                </div>
                <div className="rounded-md bg-white p-2">
                  <p className="text-slate-500">Loại xe</p>
                  <p className="font-bold text-slate-950">{selectedViolation.vehicleType}</p>
                </div>
                <div className="rounded-md bg-white p-2">
                  <p className="text-slate-500">Mức phạt</p>
                  <p className="font-bold text-slate-950">{selectedFineInfo?.amountLabel || '0 đồng'}</p>
                </div>
                <div className="rounded-md bg-white p-2">
                  <p className="text-slate-500">Căn cứ</p>
                  <p className="font-bold text-slate-950">{selectedFineInfo?.legalBasis || 'Nghị định 168/2024/NĐ-CP'}</p>
                </div>
                {selectedFineInfo?.note ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
                    {selectedFineInfo.note}
                  </div>
                ) : null}
              </div>
            </div>

            {selectedViolation.ownerInfo && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs font-bold uppercase text-slate-500">Chủ phương tiện</p>
                <div className="space-y-2 text-xs">
                  <p><span className="text-slate-500">Chủ xe:</span> <span className="font-bold text-slate-950">{selectedViolation.ownerInfo.name}</span></p>
                  <p><span className="text-slate-500">Điện thoại:</span> <span className="font-bold text-slate-950">{selectedViolation.ownerInfo.phone}</span></p>
                  {selectedViolation.ownerInfo.email && (
                    <p><span className="text-slate-500">Email:</span> <span className="font-bold break-all text-slate-950">{selectedViolation.ownerInfo.email}</span></p>
                  )}
                  <p><span className="text-slate-500">Địa chỉ:</span> <span className="font-bold text-slate-950">{selectedViolation.ownerInfo.address}</span></p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase text-slate-500">Trạng thái xử lý</p>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {mapStatusLabel(selectedViolation.status)}
                  </span>
                </div>
              {canReviewViolations && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmViolation}
                    disabled={!selectedViolationCanConfirm}
                    title={!selectedViolationCanConfirm ? 'Ch\u1ec9 x\u00e1c nh\u1eadn khi h\u1ed3 s\u01a1 \u0111ang ch\u1edd duy\u1ec7t.' : 'X\u00e1c nh\u1eadn h\u1ed3 s\u01a1 sau khi \u0111\u1ed1i chi\u1ebfu ch\u1ee9ng c\u1ee9'}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Xác nhận
                  </button>
                  <button
                    type="button"
                    onClick={handleResolveViolation}
                    disabled={selectedViolationActionsDisabled || !selectedViolationCanResolve}
                    title={!selectedViolationCanResolve ? 'Cần xác nhận hoặc phát hành tài liệu/thông báo trước khi đóng hồ sơ.' : 'Đóng hồ sơ ở trạng thái Đã xử lý'}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <Clock3 className="h-4 w-4" />
                    Đã xử lý
                  </button>
                </div>
              )}
                {selectedViolationStatusHint && (
                  <p className="mt-2 text-[11px] leading-4 text-slate-500">{selectedViolationStatusHint}</p>
                )}
              </div>
              <p className="mt-1 px-1 text-[11px] font-bold uppercase text-slate-500">Tài liệu và thông báo</p>
              {canReviewViolations && (
                <button
                  onClick={handleSendNotification}
                  disabled={!selectedViolationCanIssueDocument}
                  title={!selectedViolationCanIssueDocument ? 'Cần xác nhận hồ sơ trước khi gửi thông báo.' : 'Gửi thông báo vi phạm'}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <Send className="w-4 h-4" />
                  Gửi SMS
                </button>
              )}
              {canReviewViolations && (
                <button
                  onClick={() => setShowPdfPreview(true)}
                  disabled={!selectedViolationCanIssueDocument}
                  title={!selectedViolationCanIssueDocument ? 'Cần xác nhận hồ sơ trước khi xuất biên bản.' : 'Xem trước và xuất biên bản PDF'}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <FileText className="w-4 h-4" />
                  Biên bản PDF
                </button>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                  Lịch sử thông báo
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {selectedNotificationHistory.length} lượt
                </span>
              </div>
              {selectedNotificationHistory.length === 0 ? (
                <p className="text-xs text-slate-500">Chưa có SMS hoặc email nào được ghi nhận.</p>
              ) : (
                <div className="space-y-2">
                  {selectedNotificationHistory.slice(0, 3).map((item) => (
                    <div key={item.id} className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                            {item.status === 'sent' ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                            )}
                            {item.channel === 'sms' ? 'SMS cảnh báo' : 'Email biên bản'}
                          </div>
                          <p className="mt-1 truncate text-[11px] text-slate-600">{item.recipient}</p>
                        </div>
                        <p className="shrink-0 text-[10px] text-slate-500">{formatTime(item.sentAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-sm font-semibold">Trợ lý AI</p>
              <div className="h-[360px]">
                <AIChatbot
                  initialMessage={
                    violationContext
                      ? `Hãy phân tích và tư vấn xử lý vi phạm: Biển số ${
                          violationContext.plateNumber ||
                          violationContext.plate_number ||
                          violationContext.licensePlate ||
                          'không rõ'
                        }, Lỗi: ${violationContext.violationType || violationContext.violation || 'Vượt đèn đỏ'}. Cho tôi biết mức phạt theo quy định và quy trình xử lý.`
                      : undefined
                  }
                  contextHint={
                    violationContext
                      ? `Biển số ${
                          violationContext.plateNumber ||
                          violationContext.plate_number ||
                          violationContext.licensePlate ||
                          'không rõ'
                        }; loại xe ${
                          violationContext.class || violationContext.vehicle_type || 'không rõ'
                        }; lỗi ${violationContext.violationType || violationContext.violation || 'Vượt đèn đỏ'}`
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Chọn một hồ sơ để chỉnh sửa biên bản.
          </div>
        )}
      </div>
      {showPdfPreview && selectedNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">Xem trước biên bản vi phạm</h3>
                <p className="text-xs text-slate-500">Kiểm tra đầy đủ thông tin, hình ảnh chứng cứ và chủ xe trước khi xuất PDF.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPdfPreview(false)}
                className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                aria-label="Đóng xem trước biên bản"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-4">
              <div className="mx-auto min-h-[1120px] max-w-[794px] bg-white px-10 py-8 text-slate-950 shadow-lg">
                <div className="grid grid-cols-2 gap-6 text-[12px]">
                  <div>
                    <p className="font-bold uppercase">Hệ thống quản lý giao thông thông minh</p>
                    <p>Đơn vị vận hành / Trung tâm giám sát</p>
                    <p className="mt-2">Số hồ sơ: <span className="font-mono font-bold">{selectedNotice.id}</span></p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold uppercase">Cộng hòa xã hội chủ nghĩa Việt Nam</p>
                    <p>Độc lập - Tự do - Hạnh phúc</p>
                    <div className="mx-auto mt-1 h-px w-36 bg-slate-700" />
                  </div>
                </div>

                <div className="mt-8 text-center">
                  <h2 className="text-xl font-bold uppercase tracking-wide">Biên bản ghi nhận vi phạm giao thông</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Dữ liệu được lập từ hệ thống camera, phục vụ đối soát và xử lý vi phạm.
                  </p>
                </div>

                <section className="mt-8">
                  <h4 className="rounded bg-slate-100 px-3 py-2 text-sm font-bold uppercase">I. Thông tin phương tiện và hành vi vi phạm</h4>
                  <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3 rounded border border-slate-200 p-4 text-sm">
                    <div><span className="text-slate-500">Biển số:</span> <span className="font-bold">{selectedNotice.licensePlate}</span></div>
                    <div><span className="text-slate-500">Hành vi:</span> <span className="font-bold text-red-600">{selectedNotice.violation}</span></div>
                    <div><span className="text-slate-500">Loại xe:</span> <span className="font-bold">{selectedNotice.vehicleType}</span></div>
                    <div><span className="text-slate-500">Camera:</span> <span className="font-bold">{selectedNotice.camera}</span></div>
                    <div><span className="text-slate-500">Thời gian:</span> <span className="font-bold">{selectedNotice.timestamp}</span></div>
                    <div><span className="text-slate-500">Trạng thái hồ sơ:</span> <span className="font-bold">{selectedNotice.status || 'Chờ xử lý'}</span></div>
                    <div><span className="text-slate-500">Độ tin cậy OCR:</span> <span className="font-bold">{selectedNotice.ocrScore ? `${Math.round(selectedNotice.ocrScore * 100)}%` : 'Chưa xác định'}</span></div>
                    <div><span className="text-slate-500">Nguồn dữ liệu:</span> <span className="font-bold">Camera giám sát</span></div>
                    <div><span className="text-slate-500">Mức phạt dự kiến:</span> <span className="font-bold text-slate-950">{selectedNotice.fineAmount || '0 đồng'}</span></div>
                    <div><span className="text-slate-500">Căn cứ pháp lý:</span> <span className="font-bold">{selectedNotice.fineBasis || 'Nghị định 168/2024/NĐ-CP'}</span></div>
                    {selectedNotice.fineNote ? (
                      <div className="col-span-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                        {selectedNotice.fineNote}
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="mt-6">
                  <h4 className="rounded bg-slate-100 px-3 py-2 text-sm font-bold uppercase">II. Thông tin chủ phương tiện</h4>
                  <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3 rounded border border-slate-200 p-4 text-sm">
                    <div><span className="text-slate-500">Chủ xe:</span> <span className="font-bold">{selectedNotice.ownerName || 'Chưa xác định'}</span></div>
                    <div><span className="text-slate-500">Điện thoại:</span> <span className="font-bold">{selectedNotice.ownerPhone || 'Chưa xác định'}</span></div>
                    <div className="col-span-2"><span className="text-slate-500">Email:</span> <span className="font-bold break-all">{selectedNotice.ownerEmail || 'Chưa xác định'}</span></div>
                    <div className="col-span-2"><span className="text-slate-500">Địa chỉ:</span> <span className="font-bold">{selectedNotice.ownerAddress || 'Chưa xác định'}</span></div>
                  </div>
                </section>

                <section className="mt-6">
                  <h4 className="rounded bg-slate-100 px-3 py-2 text-sm font-bold uppercase">III. Hình ảnh chứng cứ</h4>
                  <div className="mt-3 space-y-4">
                    <div>
                      <p className="mb-1 text-xs font-bold text-slate-600">Ảnh toàn cảnh phương tiện</p>
                      <div className="flex h-[330px] items-center justify-center overflow-hidden rounded border border-slate-200 bg-black">
                        {selectedNotice.vehicleImage ? (
                          <img src={selectedNotice.vehicleImage} alt="Ảnh toàn cảnh phương tiện" className="max-h-full max-w-full object-contain" />
                        ) : (
                          <span className="text-sm text-slate-400">Không có ảnh toàn cảnh</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-bold text-slate-600">Ảnh crop biển số / dấu hiệu định danh</p>
                      <div className="flex h-[150px] items-center justify-center overflow-hidden rounded border border-slate-200 bg-black p-2">
                        {selectedNotice.plateImage ? (
                          <img src={selectedNotice.plateImage} alt="Ảnh crop biển số" className="max-h-full max-w-full object-contain" />
                        ) : (
                          <span className="text-sm text-slate-400">Không có ảnh crop biển</span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="mt-6">
                  <h4 className="rounded bg-slate-100 px-3 py-2 text-sm font-bold uppercase">IV. Kết luận và đề xuất xử lý</h4>
                  <div className="mt-3 rounded border border-slate-200 p-4 text-sm leading-6">
                    <p>
                      Hệ thống ghi nhận dấu hiệu vi phạm qua camera. Hồ sơ cần được cán bộ có thẩm quyền đối soát
                      với hình ảnh gốc trước khi ban hành quyết định xử phạt.
                    </p>
                    <p className="mt-2">
                      Hình thức xử lý đề xuất: lập hồ sơ đối soát, gửi thông báo qua SMS/email và chuyển trạng thái theo quy trình xử lý vi phạm.
                    </p>
                  </div>
                </section>

                <div className="mt-14 grid grid-cols-2 gap-12 text-center text-sm">
                  <div>
                    <p className="font-bold uppercase">Người lập biên bản</p>
                    <p className="mt-1 text-xs text-slate-500">(Ký, ghi rõ họ tên)</p>
                  </div>
                  <div>
                    <p className="font-bold uppercase">Đại diện đơn vị xử lý</p>
                    <p className="mt-1 text-xs text-slate-500">(Ký, ghi rõ họ tên)</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setShowPdfPreview(false)}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleExportSelectedPdf}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <FileText className="h-4 w-4" />
                Xuất PDF biên bản
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md">
            <h3 className="text-lg font-bold mb-2">Xác Nhận Gửi Thông Báo</h3>
            <p className="text-muted-foreground mb-4">
              Gửi thông báo vi phạm cho biển số{' '}
              <span className="font-mono font-bold text-primary">
                {selectedViolation?.licensePlate}
              </span>
              <br />
              qua SMS và Email?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={confirmSendNotification}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
              >
                Xác Nhận
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
