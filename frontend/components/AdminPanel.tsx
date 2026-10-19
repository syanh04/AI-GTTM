'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, Cpu, FileText, Map, Menu, Server, Settings, X } from 'lucide-react';
import DeviceManagement from '@/components/admin/DeviceManagement';
import ViolationHistory from '@/components/admin/ViolationHistory';
import InfrastructureMap from '@/components/admin/InfrastructureMap';
import AIConfiguration from '@/components/admin/AIConfiguration';
import SystemSettings from '@/components/admin/SystemSettings';
import UserAccessManagement from '@/components/admin/UserAccessManagement';
import { useAuth } from '@/lib/AuthContext';

interface AdminPanelProps {
  onExit?: () => void;
  onProcessViolation?: (licensePlate: string, violation: string) => void;
  initialSection?: string;
  embedded?: boolean;
}

const text = {
  queryOk: '\u0110\u00e3 truy v\u1ea5n 256 b\u1ea3n ghi t\u1eeb SQL Database th\u00e0nh c\u00f4ng',
  adminTitle: 'QU\u1ea2N TR\u1eca H\u1ec6 TH\u1ed0NG',
  backTitle: 'Quay l\u1ea1i giao di\u1ec7n ch\u00ednh',
  settings: 'C\u00e0i \u0111\u1eb7t',
  settingsDesc: 'T\u00f9y ch\u1ec9nh h\u1ec7 th\u1ed1ng',
};

const ADMIN_ONLY_SECTIONS = ['devices', 'violations', 'infrastructure', 'ai-config', 'users', 'logs', 'settings'];

const menuItems = [
  { icon: Server, label: 'Thi\u1ebft b\u1ecb', id: 'devices', description: 'Qu\u1ea3n l\u00fd camera v\u00e0 \u0111\u00e8n' },
  { icon: FileText, label: 'H\u1ed3 s\u01a1 vi ph\u1ea1m', id: 'violations', description: 'D\u1eef li\u1ec7u l\u1ecbch s\u1eed ph\u1ea1t' },
  { icon: Map, label: 'B\u1ea3n \u0111\u1ed3 h\u1ea1 t\u1ea7ng', id: 'infrastructure', description: 'V\u1ecb tr\u00ed camera to\u00e0n th\u00e0nh' },
  { icon: Cpu, label: 'C\u1ea5u h\u00ecnh AI', id: 'ai-config', description: 'Tinh ch\u1ec9nh YOLOv12/v8' },
];

export default function AdminPanel({
  onExit,
  onProcessViolation,
  initialSection = 'devices',
  embedded = false,
}: AdminPanelProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeSection, setActiveSection] = useState(initialSection);
  const [mountedSections, setMountedSections] = useState<Set<string>>(
    () => new Set([initialSection, 'violations']),
  );

  useEffect(() => {
    setActiveSection(initialSection);
    setMountedSections((current) => {
      if (current.has(initialSection)) return current;
      return new Set([...current, initialSection]);
    });
  }, [initialSection]);

  useEffect(() => {
    if (!isAdmin && ADMIN_ONLY_SECTIONS.includes(activeSection)) {
      setActiveSection('settings');
    }
  }, [isAdmin, activeSection]);

  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId);
    setMountedSections((current) => {
      if (current.has(sectionId)) return current;
      return new Set([...current, sectionId]);
    });
  };

  const renderContent = (section: string) => {
    if (!isAdmin && ADMIN_ONLY_SECTIONS.includes(section)) {
      return null;
    }

    switch (section) {
      case 'devices':
        return <DeviceManagement />;
      case 'violations':
        return <ViolationHistory onProcessViolation={onProcessViolation} />;
      case 'infrastructure':
        return <InfrastructureMap />;
      case 'ai-config':
        return <AIConfiguration />;
      case 'settings':
        return <SystemSettings />;
      case 'users':
        return <UserAccessManagement />;
      case 'logs':
        return <DeviceManagement />;
      default:
        return <DeviceManagement />;
    }
  };

  const renderMountedSections = () => {
    const sections = Array.from(new Set([...mountedSections, activeSection]));
    return sections.map((section) => (
      <div
        key={section}
        aria-hidden={activeSection !== section}
        className={activeSection === section ? 'h-full' : 'hidden'}
      >
        {renderContent(section)}
      </div>
    ));
  };

  if (embedded) {
    return (
      <div className={`h-full bg-background ${activeSection !== 'infrastructure' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        {renderMountedSections()}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <aside
        className={`bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex flex-col ${
          isExpanded ? 'w-72' : 'w-20'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          {isExpanded && <div className="font-bold text-sm text-sidebar-foreground">{text.adminTitle}</div>}
          <div className="flex items-center gap-2">
            {isExpanded && onExit && (
              <button
                onClick={onExit}
                className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
                title={text.backTitle}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
            >
              {isExpanded ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-2">
          {menuItems.map((item) => {
            if (!isAdmin && ADMIN_ONLY_SECTIONS.includes(item.id)) return null;

            return (
              <button
                key={item.id}
                onClick={() => handleSectionChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  activeSection === item.id
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
                title={item.description}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {isExpanded && (
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-medium leading-tight">{item.label}</span>
                    <span className="text-xs text-sidebar-foreground/60">{item.description}</span>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border">
          <button
            onClick={() => handleSectionChange('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              activeSection === 'settings'
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
            }`}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {isExpanded && (
              <div className="flex flex-col text-left">
                <span className="text-sm font-medium leading-tight">{text.settings}</span>
                <span className="text-xs text-sidebar-foreground/60">{text.settingsDesc}</span>
              </div>
            )}
          </button>
        </div>
      </aside>

      <div className={`flex-1 bg-background relative ${activeSection !== 'infrastructure' ? 'p-6 overflow-y-auto' : 'p-0 overflow-hidden'}`}>
        {renderMountedSections()}
      </div>
    </div>
  );
}
