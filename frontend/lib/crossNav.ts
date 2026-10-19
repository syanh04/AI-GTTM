/**
 * Cross-Navigation Infrastructure (Prompt 03)
 * Registry quan hệ P1 -> P13, điều hướng sâu, ngăn xếp quay lại và quản lý trạng thái.
 */

import { type ViewKey, findNavigationItem, hasViewAccess } from './navigation';

export interface RelationDefinition {
  id: string;
  sourceType: 'record' | 'case' | 'camera' | 'rule' | 'user' | 'audit' | 'analytics' | 'dispatch' | 'storage';
  label: string | ((entity: any) => string);
  target: {
    view: ViewKey;
    tab?: string;
  };
  mapParams: (entity: any) => Record<string, string | number>;
  condition?: (entity: any, role?: string) => boolean;
  iconName?: string;
}

export const RELATIONS: RelationDefinition[] = [
  // P1: Hồ sơ vi phạm <-> Trung tâm dữ liệu
  {
    id: 'P1_CASE_TO_RECORD',
    sourceType: 'case',
    label: 'Xem bản ghi gốc',
    target: { view: 'data-center', tab: 'data' },
    mapParams: (item) => ({ record: item.id || item.record_id, open: 1 }),
    iconName: 'Database',
  },
  {
    id: 'P1_RECORD_TO_CASE',
    sourceType: 'record',
    label: 'Mở hồ sơ vi phạm',
    target: { view: 'cases', tab: 'records' },
    mapParams: (item) => ({ case: item.id, open: 1 }),
    condition: (item) => Boolean(item.violation_type && item.violation_type.trim()),
    iconName: 'ShieldAlert',
  },

  // P2: Hồ sơ vi phạm <-> Căn cứ pháp lý
  {
    id: 'P2_CASE_TO_LEGAL',
    sourceType: 'case',
    label: 'Xem căn cứ xử phạt',
    target: { view: 'cases', tab: 'legal' },
    mapParams: (item) => ({ rule: item.rule_id || '' }),
    condition: (item) => Boolean(item.rule_id),
    iconName: 'BookOpen',
  },
  {
    id: 'P2_LEGAL_TO_CASES',
    sourceType: 'rule',
    label: (rule) => `Hồ sơ thuộc quy định này${rule.count !== undefined ? ` (${rule.count})` : ''}`,
    target: { view: 'cases', tab: 'records' },
    mapParams: (rule) => ({ violation: rule.violation_type || '' }),
    iconName: 'ShieldAlert',
  },

  // P3: Giám sát trực tiếp <-> Camera & thiết bị
  {
    id: 'P3_LIVE_TO_DEVICE',
    sourceType: 'camera',
    label: 'Chi tiết camera',
    target: { view: 'devices', tab: 'list' },
    mapParams: (cam) => ({ camera: cam.id || cam, open: 1 }),
    iconName: 'Camera',
  },
  {
    id: 'P3_DEVICE_TO_LIVE',
    sourceType: 'camera',
    label: 'Xem trực tiếp',
    target: { view: 'live', tab: 'grid' },
    mapParams: (cam) => ({ camera: cam.id || cam }),
    iconName: 'Video',
  },

  // P4: Giám sát trực tiếp <-> Điều phối
  {
    id: 'P4_LIVE_TO_DISPATCH',
    sourceType: 'camera',
    label: 'Điều phối tín hiệu',
    target: { view: 'dispatch', tab: 'signals' },
    mapParams: (cam) => ({ camera: cam.id || cam }),
    condition: (_, role) => role === 'admin' || role === 'operator',
    iconName: 'GitMerge',
  },
  {
    id: 'P4_DISPATCH_TO_LIVE',
    sourceType: 'dispatch',
    label: 'Xem camera',
    target: { view: 'live', tab: 'grid' },
    mapParams: (item) => ({ camera: item.camera_id || item.id || item }),
    iconName: 'Video',
  },

  // P5: Camera List <-> Map
  {
    id: 'P5_LIST_TO_MAP',
    sourceType: 'camera',
    label: 'Xem trên bản đồ',
    target: { view: 'devices', tab: 'map' },
    mapParams: (cam) => ({ camera: cam.id || cam }),
    iconName: 'MapPin',
  },
  {
    id: 'P5_MAP_TO_LIST',
    sourceType: 'camera',
    label: 'Xem danh sách',
    target: { view: 'devices', tab: 'list' },
    mapParams: (cam) => ({ camera: cam.id || cam }),
    iconName: 'List',
  },

  // P6: Camera <-> Trung tâm dữ liệu / Hồ sơ vi phạm
  {
    id: 'P6_DEVICE_TO_DATA',
    sourceType: 'camera',
    label: 'Dữ liệu camera',
    target: { view: 'data-center', tab: 'data' },
    mapParams: (cam) => ({ camera: cam.id || cam, range: 'today' }),
    iconName: 'Database',
  },
  {
    id: 'P6_DEVICE_TO_CASES',
    sourceType: 'camera',
    label: (cam) => `Vi phạm camera${cam.pending_cases !== undefined ? ` (${cam.pending_cases})` : ''}`,
    target: { view: 'cases', tab: 'records' },
    mapParams: (cam) => ({ camera: cam.id || cam, status: 'pending' }),
    iconName: 'ShieldAlert',
  },

  // P7: Phân tích <-> Dữ liệu
  {
    id: 'P7_ANALYTICS_TO_DATA',
    sourceType: 'analytics',
    label: 'Xem dữ liệu chi tiết',
    target: { view: 'data-center', tab: 'data' },
    mapParams: (params) => ({ ...params }),
    iconName: 'Database',
  },
  {
    id: 'P7_DATA_TO_ANALYTICS',
    sourceType: 'record',
    label: 'Xem xu hướng lưu lượng',
    target: { view: 'analytics', tab: 'traffic' },
    mapParams: (item) => ({ camera: item.camera_id || '', range: 'today' }),
    iconName: 'BarChart3',
  },

  // P8: Chất lượng AI <-> Gỡ lỗi nhận diện
  {
    id: 'P8_QUALITY_TO_LOW_OCR',
    sourceType: 'analytics',
    label: 'Xem bản ghi OCR thấp (<90%)',
    target: { view: 'data-center', tab: 'data' },
    mapParams: () => ({ ocr_lt: 90 }),
    iconName: 'AlertCircle',
  },
  {
    id: 'P8_QUALITY_TO_DEBUG',
    sourceType: 'analytics',
    label: 'Gỡ lỗi nhận diện AI',
    target: { view: 'ai', tab: 'debug' },
    mapParams: (item) => ({ camera: item?.camera_id || '' }),
    condition: (_, role) => role === 'admin',
    iconName: 'Cpu',
  },

  // P9: Dữ liệu <-> Báo cáo
  {
    id: 'P9_DATA_TO_REPORTS',
    sourceType: 'record',
    label: 'Xuất báo cáo kỳ này',
    target: { view: 'data-center', tab: 'reports' },
    mapParams: (filters) => ({ camera: filters?.camera_id || '', range: filters?.range || 'today' }),
    iconName: 'FileText',
  },

  // P10: Cấu hình Lưu trữ <-> Trung tâm dữ liệu Kho ảnh
  {
    id: 'P10_STORAGE_TO_CLEANUP',
    sourceType: 'storage',
    label: 'Xem dung lượng & dọn dẹp',
    target: { view: 'data-center', tab: 'storage' },
    mapParams: () => ({}),
    iconName: 'HardDrive',
  },
  {
    id: 'P10_CLEANUP_TO_SETTINGS',
    sourceType: 'storage',
    label: 'Cấu hình chính sách lưu',
    target: { view: 'settings', tab: 'storage' },
    mapParams: () => ({}),
    condition: (_, role) => role === 'admin',
    iconName: 'Settings',
  },

  // P11: Người dùng <-> Nhật ký
  {
    id: 'P11_USER_TO_AUDIT',
    sourceType: 'user',
    label: 'Xem nhật ký thao tác',
    target: { view: 'audit', tab: 'actions' },
    mapParams: (u) => ({ user: u.username || u.name || u }),
    condition: (_, role) => role === 'admin',
    iconName: 'History',
  },

  // P12: Nhật ký <-> Lịch sử thao tác đối tượng
  {
    id: 'P12_ENTITY_TO_AUDIT',
    sourceType: 'record',
    label: (item) => `Lịch sử thao tác${item.audit_count !== undefined ? ` (${item.audit_count})` : ''}`,
    target: { view: 'audit', tab: 'actions' },
    mapParams: (item) => ({ entity: `detection:${item.id}` }),
    condition: (_, role) => role === 'admin',
    iconName: 'History',
  },

  // P13: Điều phối <-> Phân tích lưu lượng
  {
    id: 'P13_DISPATCH_TO_ANALYTICS',
    sourceType: 'dispatch',
    label: 'Xem phân tích lưu lượng',
    target: { view: 'analytics', tab: 'traffic' },
    mapParams: (item) => ({ camera: item.camera_id || item.id || item }),
    iconName: 'BarChart3',
  },
  {
    id: 'P13_ANALYTICS_TO_DISPATCH',
    sourceType: 'analytics',
    label: 'Mở điều phối nút giao',
    target: { view: 'dispatch', tab: 'signals' },
    mapParams: (item) => ({ camera: item.camera_id || item.id || item }),
    condition: (_, role) => role === 'admin' || role === 'operator',
    iconName: 'GitMerge',
  },
];

export interface ReturnStackItem {
  view: ViewKey;
  tab?: string;
  params: Record<string, string>;
  title: string;
}

const RETURN_STACK_KEY = 'crossnav_return_stack';
const VIEW_STATE_PREFIX = 'crossnav_viewstate_';
const SELECTED_CAMERA_KEY = 'crossnav_selected_camera';
const PREFETCH_CACHE = new Map<string, { data: any; expiry: number }>();

/** Check role access */
export function canAccess(view: ViewKey, role?: string): boolean {
  const item = findNavigationItem(view);
  if (!item) return false;
  return hasViewAccess(item, role);
}

/** Build deep-link href with target accepts filter */
export function linkTo(
  target: { view: ViewKey; tab?: string },
  params: Record<string, any> = {},
  ret?: string
): string {
  const item = findNavigationItem(target.view);
  const accepted = new Set(item?.accepts || []);

  const searchParams = new URLSearchParams();
  searchParams.set('view', target.view);
  if (target.tab) {
    searchParams.set('tab', target.tab);
  }

  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      // If accepts is specified, only include accepted params (or universal params)
      if (accepted.size === 0 || accepted.has(key) || key === 'ret' || key === 'open') {
        searchParams.set(key, String(val));
      }
    }
  }

  if (ret && !searchParams.has('ret')) {
    searchParams.set('ret', ret);
  }

  return `/?${searchParams.toString()}`;
}

/** Navigate to target view with history push or replace */
export function goTo(
  target: { view: ViewKey; tab?: string },
  params: Record<string, any> = {},
  options: {
    mode?: 'push' | 'replace';
    title?: string;
    preserveReturn?: boolean;
  } = {}
): void {
  if (typeof window === 'undefined') return;

  const currentUrl = new URL(window.location.href);
  const currentView = (currentUrl.searchParams.get('view') as ViewKey) || 'overview';
  const currentTab = currentUrl.searchParams.get('tab') || undefined;

  // Manage return stack on push navigation
  if (options.mode !== 'replace' && !options.preserveReturn) {
    const currentParams: Record<string, string> = {};
    currentUrl.searchParams.forEach((v, k) => {
      if (k !== 'view' && k !== 'tab') currentParams[k] = v;
    });

    const returnItem: ReturnStackItem = {
      view: currentView,
      tab: currentTab,
      params: currentParams,
      title: options.title || findNavigationItem(currentView)?.label || currentView,
    };
    pushReturnStack(returnItem);
  }

  const retParam = `${currentView}${currentTab ? `:${currentTab}` : ''}`;
  const href = linkTo(target, params, retParam);

  if (options.mode === 'replace') {
    window.history.replaceState({}, '', href);
  } else {
    window.history.pushState({}, '', href);
  }

  // Dispatch custom navigation event so views react without full page refresh
  window.dispatchEvent(
    new CustomEvent('crossnav:navigate', {
      detail: {
        view: target.view,
        tab: target.tab,
        params,
      },
    })
  );
}

/** Return Stack Operations */
export function getReturnStack(): ReturnStackItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(RETURN_STACK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function pushReturnStack(item: ReturnStackItem): void {
  if (typeof window === 'undefined') return;
  try {
    let stack = getReturnStack();
    // Deduplicate consecutive identical views
    if (stack.length > 0 && stack[stack.length - 1].view === item.view && stack[stack.length - 1].tab === item.tab) {
      stack[stack.length - 1] = item;
    } else {
      stack.push(item);
    }
    // Limit to max 5 items
    if (stack.length > 5) {
      stack = stack.slice(stack.length - 5);
    }
    sessionStorage.setItem(RETURN_STACK_KEY, JSON.stringify(stack));
  } catch {}
}

export function popReturnStack(): ReturnStackItem | null {
  if (typeof window === 'undefined') return null;
  try {
    const stack = getReturnStack();
    if (stack.length === 0) return null;
    const popped = stack.pop();
    sessionStorage.setItem(RETURN_STACK_KEY, JSON.stringify(stack));
    return popped || null;
  } catch {
    return null;
  }
}

export function peekReturnStack(): ReturnStackItem | null {
  const stack = getReturnStack();
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/** Return back to previous view */
export function goBack(): void {
  const previous = popReturnStack();
  if (previous) {
    goTo(
      { view: previous.view, tab: previous.tab },
      previous.params,
      { mode: 'replace', preserveReturn: true }
    );
    return;
  }

  // Check URL `ret` param if stack is empty
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const ret = params.get('ret');
    if (ret) {
      const [view, tab] = ret.split(':') as [ViewKey, string | undefined];
      if (findNavigationItem(view)) {
        goTo({ view, tab }, {}, { mode: 'replace', preserveReturn: true });
        return;
      }
    }
  }

  // Default fallback
  goTo({ view: 'overview' }, {}, { mode: 'replace', preserveReturn: true });
}

/** Selected Camera Sync Across Monitoring / Dispatch / Devices */
export function getSelectedCamera(): string {
  if (typeof window === 'undefined') return 'CAM_01';
  const urlParam = new URLSearchParams(window.location.search).get('camera');
  if (urlParam) return urlParam;
  try {
    return localStorage.getItem(SELECTED_CAMERA_KEY) || 'CAM_01';
  } catch {
    return 'CAM_01';
  }
}

export function setSelectedCamera(cameraId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SELECTED_CAMERA_KEY, cameraId);
    window.dispatchEvent(
      new CustomEvent('crossnav:camera_changed', { detail: { cameraId } })
    );
  } catch {}
}

/** Prefetch with 150ms debounce and 10s TTL */
let prefetchTimer: any = null;
export function prefetch(url: string): void {
  if (typeof window === 'undefined') return;
  if (prefetchTimer) clearTimeout(prefetchTimer);

  prefetchTimer = setTimeout(async () => {
    const cached = PREFETCH_CACHE.get(url);
    if (cached && cached.expiry > Date.now()) return;

    try {
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        PREFETCH_CACHE.set(url, { data, expiry: Date.now() + 10_000 });
      }
    } catch {}
  }, 150);
}

/** Entity Type Resolver for Audit Logs and General Object Links */
export function linkForEntity(
  entityType: string,
  entityId: string | number
): { view: ViewKey; tab?: string; params: Record<string, any> } {
  const normType = entityType.toLowerCase().trim();
  const idStr = String(entityId);

  switch (normType) {
    case 'detection':
    case 'record':
      return {
        view: 'data-center',
        tab: 'data',
        params: { record: idStr, open: 1 },
      };
    case 'case':
    case 'violation':
      return {
        view: 'cases',
        tab: 'records',
        params: { case: idStr, open: 1 },
      };
    case 'camera':
      return {
        view: 'devices',
        tab: 'list',
        params: { camera: idStr, open: 1 },
      };
    case 'user':
      return {
        view: 'users',
        tab: 'list',
        params: { user: idStr },
      };
    case 'setting':
    case 'settings':
      return {
        view: 'settings',
        tab: 'general',
        params: {},
      };
    case 'report':
      return {
        view: 'data-center',
        tab: 'reports',
        params: {},
      };
    default:
      return {
        view: 'data-center',
        tab: 'data',
        params: { q: idStr },
      };
  }
}
