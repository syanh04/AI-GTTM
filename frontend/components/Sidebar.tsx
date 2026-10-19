'use client';

import React, { useState } from 'react';
import { Menu, X, Settings, Server, FileText, Map, Cpu } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
// ← ĐÃ THÊM: useAuth

interface SidebarProps {
  onAdminClick?: () => void;
}

export default function Sidebar({ onAdminClick }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeSection, setActiveSection] = useState('devices');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // ← ĐÃ THÊM: phân quyền

  const menuItems = [
    { icon: Server, label: 'Thiết Bị', id: 'devices', description: 'Quản lý camera và đèn' },
    { icon: FileText, label: 'Hồ Sơ Vi Phạm', id: 'violations', description: 'Dữ liệu lịch sử phạt' },
    { icon: Map, label: 'Bản Đồ Hạ Tầng', id: 'infrastructure', description: 'Vị trí camera toàn thành' },
    { icon: Cpu, label: 'Cấu Hình AI', id: 'ai-config', description: 'Tinh chỉnh YOLOv12/v8' },
  ];

  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId);
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'devices':
        return <div>Devices Content</div>;
      case 'violations':
        return <div>Violations Content</div>;
      case 'infrastructure':
        return <div>Infrastructure Content</div>;
      case 'ai-config':
        return <div>AI Config Content</div>;
      case 'settings':
        return <div>Settings Content</div>;
      default:
        return <div>Default Content</div>;
    }
  };

  return (
    <aside
      className={`bg-white border-r border-gray-200 transition-all duration-300 ease-in-out flex flex-col ${
        isExpanded ? 'w-52 lg:w-60 xl:w-64 2xl:w-72' : 'w-14 lg:w-16 xl:w-20'
      }`}
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        {isExpanded && isAdmin && (
          <div className="font-bold text-sm text-sidebar-foreground">QUẢN TRỊ HỆ THỐNG</div>
        )}
        {/* ← ĐÃ ẨN: tiêu đề Quản Trị Hệ Thống với viewer */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
        >
          {isExpanded ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Menu Items */}
      {isAdmin && (
      <nav className="flex-1 px-3 py-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={onAdminClick}
            className={`w-full flex items-center gap-3 px-3 py-2 lg:px-4 lg:py-3 rounded-lg transition-all text-sidebar-foreground hover:bg-sidebar-accent/50`}
            title={item.description}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {isExpanded && (
              <div className="flex flex-col text-left">
                <span className="text-xs lg:text-sm font-medium leading-tight">{item.label}</span>
                <span className="text-xs text-sidebar-foreground/60">{item.description}</span>
              </div>
            )}
          </button>
        ))}
      </nav>
      )}
      {/* ← ĐÃ ẨN: Nav menu với viewer */}

      {/* Settings Footer —
          ẨN: dùng Header dropdown */}
      {false && (
      <div className="px-3 py-4 border-t border-sidebar-border">
        <button
          onClick={onAdminClick}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sidebar-foreground hover:bg-sidebar-accent/50"
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {isExpanded && (
            <div className="flex flex-col text-left">
              <span className="text-sm font-medium leading-tight">Cài Đặt</span>
              <span className="text-xs text-sidebar-foreground/60">Tùy chỉnh hệ thống</span>
            </div>
          )}
        </button>
      </div>
      )}
    </aside>
  );
}
