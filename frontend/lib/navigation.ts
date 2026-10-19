/**
 * Cấu trúc điều hướng 11 mục chia thành 5 nhóm chức năng
 * Theo tài liệu tái cấu trúc giao diện hệ thống Smart Traffic ALPR
 */

import {
  BarChart3,
  BookOpen,
  Building2,
  Bug,
  Camera,
  Cpu,
  Database,
  FileText,
  GitMerge,
  HardDrive,
  History,
  LayoutDashboard,
  MessageSquare,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  Video,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type ViewKey =
  | 'overview'
  | 'live'
  | 'dispatch'
  | 'cases'
  | 'legal'
  | 'data-center'
  | 'analytics'
  | 'devices'
  | 'ai'
  | 'ai-config'
  | 'ai-debug'
  | 'ai-logs'
  | 'settings'
  | 'settings-org'
  | 'settings-storage'
  | 'settings-integrations'
  | 'settings-maintenance'
  | 'users'
  | 'audit';

export type UserRole = 'admin' | 'operator' | 'viewer' | 'user';

export interface TabDefinition {
  key: string;
  label: string;
  description?: string;
}

export interface NavigationItem {
  key: ViewKey;
  label: string;
  description: string;
  icon: LucideIcon;
  roles: UserRole[];
  defaultTab: string;
  tabs?: TabDefinition[];
  accepts?: string[];
}

export interface NavigationGroup {
  groupKey: string;
  label: string;
  items: NavigationItem[];
}

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    groupKey: 'live_ops',
    label: 'Vận hành trực tiếp',
    items: [
      {
        key: 'overview',
        label: 'Tổng quan vận hành',
        description: 'Chỉ số KPI, lưu lượng thời gian thực, vi phạm mới nhất',
        icon: LayoutDashboard,
        roles: ['admin', 'operator', 'viewer'],
        defaultTab: 'kpi',
        accepts: ['range', 'from', 'to'],
      },
      {
        key: 'live',
        label: 'Giám sát trực tiếp',
        description: 'Lưới camera, khu vực vi phạm, danh sách phát hiện',
        icon: Video,
        roles: ['admin', 'operator', 'viewer'],
        defaultTab: 'grid',
        tabs: [
          { key: 'grid', label: 'Lưới camera', description: 'Theo dõi trực tiếp đa góc nhìn' },
          { key: 'zones', label: 'Vùng giám sát & Cấu hình vạch', description: 'Vẽ vạch dừng, làn đường và điểm kiểm soát' },
        ],
        accepts: ['camera'],
      },
      {
        key: 'dispatch',
        label: 'Điều phối tín hiệu',
        description: 'Điều khiển chu kỳ đèn giao thông, luồng ưu tiên nút giao',
        icon: GitMerge,
        roles: ['admin', 'operator'],
        defaultTab: 'signals',
        accepts: ['camera'],
      },
    ],
  },
  {
    groupKey: 'business',
    label: 'Nghiệp vụ',
    items: [
      {
        key: 'cases',
        label: 'Hồ sơ vi phạm',
        description: 'Xử lý biên bản, gửi thông báo và theo dõi quy trình xử phạt',
        icon: ShieldAlert,
        roles: ['admin', 'operator', 'viewer'],
        defaultTab: 'records',
        accepts: ['case', 'camera', 'violation', 'status', 'range', 'from', 'to', 'open', 'ret', 'plate', 'rule'],
      },
      {
        key: 'legal',
        label: 'Căn cứ xử phạt',
        description: 'Biểu khung phạt, mức phạt và điều khoản theo Nghị định 168/2024',
        icon: BookOpen,
        roles: ['admin', 'operator', 'viewer'],
        defaultTab: 'catalog',
        accepts: ['rule', 'case', 'search'],
      },
      {
        key: 'data-center',
        label: 'Trung tâm dữ liệu',
        description: 'Tra cứu dữ liệu, xuất báo cáo PDF/Excel/CSV, kho ảnh crop, thùng rác',
        icon: Database,
        roles: ['admin', 'operator', 'viewer'],
        defaultTab: 'data',
        tabs: [
          { key: 'data', label: 'Dữ liệu phát hiện' },
          { key: 'reports', label: 'Báo cáo & Xuất file' },
          { key: 'storage', label: 'Lưu trữ ảnh crop' },
          { key: 'trash', label: 'Thùng rác & Đã xóa' },
        ],
        accepts: ['record', 'camera', 'violation', 'status', 'ocr_lt', 'vehicle', 'range', 'from', 'to', 'open', 'ret', 'plate'],
      },
      {
        key: 'analytics',
        label: 'Phân tích giao thông',
        description: 'Lưu lượng giờ cao điểm, chất lượng mô hình AI, tìm kiếm thông minh',
        icon: BarChart3,
        roles: ['admin', 'operator', 'viewer'],
        defaultTab: 'traffic',
        tabs: [
          { key: 'traffic', label: 'Tổng quan giao thông' },
          { key: 'ai_metrics', label: 'Chất lượng mô hình AI' },
          { key: 'search', label: 'Tìm kiếm thông minh' },
        ],
        accepts: ['camera', 'range', 'from', 'to', 'violation', 'vehicle', 'tab'],
      },
    ],
  },
  {
    groupKey: 'infrastructure',
    label: 'Thiết bị',
    items: [
      {
        key: 'devices',
        label: 'Quản lý camera',
        description: 'Danh sách camera nguồn thực tế, bản đồ hạ tầng OSM, hiệu năng máy chủ',
        icon: Camera,
        roles: ['admin', 'operator', 'viewer'],
        defaultTab: 'list',
        tabs: [
          { key: 'list', label: 'Danh sách camera' },
          { key: 'map', label: 'Bản đồ hạ tầng' },
          { key: 'metrics', label: 'Hiệu năng máy chủ' },
        ],
        accepts: ['camera', 'open', 'ret', 'tab'],
      },
    ],
  },
  {
    groupKey: 'ai_engine',
    label: 'TRUNG TÂM NHẬN DIỆN AI',
    items: [
      {
        key: 'ai-config',
        label: 'Cấu hình nhận diện',
        description: 'Ngưỡng phát hiện YOLO, PaddleOCR và tham số nhận diện',
        icon: SlidersHorizontal,
        roles: ['admin'],
        defaultTab: 'config',
        accepts: ['camera', 'tab'],
      },
      {
        key: 'ai-debug',
        label: 'Gỡ lỗi nhận diện',
        description: 'Kiểm tra chi tiết luồng xử lý nhận diện từng khung hình (AIDebug)',
        icon: Bug,
        roles: ['admin'],
        defaultTab: 'debug',
        accepts: ['camera', 'plate', 'tab'],
      },
      {
        key: 'ai-logs',
        label: 'Nhật ký suy luận AI',
        description: 'Nhật ký phát hiện thời gian thực và lịch sử suy luận',
        icon: FileText,
        roles: ['admin'],
        defaultTab: 'logs',
        accepts: ['camera', 'tab'],
      },
    ],
  },
  {
    groupKey: 'administration',
    label: 'Cài đặt hệ thống',
    items: [
      {
        key: 'settings-org',
        label: 'Cấu hình đơn vị',
        description: 'Thông tin đơn vị quản lý, địa chỉ và thông số vận hành',
        icon: Building2,
        roles: ['admin'],
        defaultTab: 'org',
      },
      {
        key: 'settings-storage',
        label: 'Chính sách lưu trữ',
        description: 'Thời gian lưu trữ dữ liệu, ảnh vi phạm và tự động dọn dẹp',
        icon: HardDrive,
        roles: ['admin'],
        defaultTab: 'storage',
      },
      {
        key: 'settings-integrations',
        label: 'Tích hợp Telegram / Zalo',
        description: 'Cấu hình thông báo tự động qua bot Telegram và Zalo',
        icon: MessageSquare,
        roles: ['admin'],
        defaultTab: 'integrations',
      },
      {
        key: 'settings-maintenance',
        label: 'Bảo trì dữ liệu',
        description: 'Xóa cache bộ nhớ đệm OCR, tối ưu SQLite WAL, đặt lại phiên',
        icon: Wrench,
        roles: ['admin'],
        defaultTab: 'maintenance',
      },
      {
        key: 'users',
        label: 'Quản lý người dùng',
        description: 'Tài khoản, phân quyền quản trị viên / điều hành viên / người xem',
        icon: Users,
        roles: ['admin'],
        defaultTab: 'list',
        accepts: ['user'],
      },
      {
        key: 'audit',
        label: 'Nhật ký hệ thống',
        description: 'Audit log hành động người dùng và sự kiện hệ thống',
        icon: History,
        roles: ['admin'],
        defaultTab: 'actions',
        tabs: [
          { key: 'actions', label: 'Hành động người dùng' },
          { key: 'events', label: 'Sự kiện hệ thống' },
        ],
        accepts: ['user', 'entity', 'range', 'from', 'to', 'ret', 'tab'],
      },
    ],
  },
];

export function hasViewAccess(item: NavigationItem, userRole?: string | null): boolean {
  if (!userRole) return false;
  const role = userRole.toLowerCase().trim() as UserRole;
  if (role === 'admin') return true;
  return item.roles.includes(role);
}

export function findNavigationItem(key: string): NavigationItem | undefined {
  if (key === 'ai') return findNavigationItem('ai-config');
  if (key === 'settings') return findNavigationItem('settings-org');

  for (const group of NAVIGATION_GROUPS) {
    const found = group.items.find((item) => item.key === key);
    if (found) return found;
  }
  return undefined;
}
