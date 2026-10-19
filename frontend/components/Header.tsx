import React, { useEffect, useRef, useState } from 'react';
import { Clock, Cpu, Zap, Bell } from 'lucide-react';
import GlobalFilter from './GlobalFilter';
import SettingsModal
  from "@/components/SettingsModal"
import { useAuth } from "@/lib/AuthContext";
// ← ĐÃ THÊM: auth + dropdown

interface SystemStatus {
  cpu: number;
  gpu: number;
  latency: number;
  version: string;
  timestamp: Date;
}

interface HeaderProps {
  systemStatus: SystemStatus;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onExportPDF: () => void;
  onExportCSV: () => void;
  currentTab?: string;
}

export default function Header({
  systemStatus,
  selectedDate,
  onDateChange,
  onExportPDF,
  onExportCSV,
  currentTab,
}: HeaderProps) {
  const { user, logout, isLoading } = useAuth();
  const isAdmin =
    user?.role === "admin"
  const [settingsOpen,
    setSettingsOpen] =
    useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // ← ĐÃ THÊM: dropdown state

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  // ← ĐÃ THÊM: click outside handler
  return (
    <header className="border-b border-border bg-card shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 lg:px-4 lg:py-3 xl:px-6 xl:py-4">
        <div className="flex items-center gap-3">
          <div className="text-lg font-bold text-primary">HỆ THỐNG QUẢN LÝ GIAO THÔNG</div>
          <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">v{systemStatus.version.replace('v', '')}</span>
        </div>

        {/* Global Filter - Hidden on Camera + Analysis (moved inline) */}
        {currentTab !== 'camera' && currentTab !== 'analysis' && (
          <GlobalFilter
            selectedDate={selectedDate}
            onDateChange={onDateChange}
            onExportPDF={onExportPDF}
            onExportCSV={onExportCSV}
          />
        )}

        <div className="flex items-center gap-8">
          {/* System Status */}
          <div className="flex items-center gap-5 text-xs lg:text-sm border-r border-border pr-8">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-chart-2" />
              <span className="text-muted-foreground">CPU:</span>
              <span className="font-medium">{systemStatus.cpu.toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-chart-3" />
              <span className="text-muted-foreground">GPU:</span>
              <span className="font-medium">{systemStatus.gpu.toFixed(0)}%</span>
            </div>
          </div>

          {/* Server & Latency */}
          <div className="flex items-center gap-5 text-xs lg:text-sm border-r border-border pr-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-muted-foreground">Server:</span>
              <span className="font-medium">Online</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-chart-1" />
              <span className="text-muted-foreground">Độ trễ:</span>
              <span className="font-medium">{systemStatus.latency.toFixed(0)}ms</span>
            </div>
          </div>

          {/* Notifications */}
          <button className="relative p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="absolute top-1 right-1 w-3 h-3 bg-violation-red rounded-full flex items-center justify-center text-white text-xs font-bold">3</span>
          </button>

          {/* User Dropdown Menu */}
          <div className="relative" ref={dropdownRef}>
            {/* Nút Avatar */}
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white hover:bg-gray-100 border border-gray-300 hover:border-gray-400 transition-all duration-200 focus:outline-none"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                {isLoading
                  ? "..."
                  : user
                    ? user.username.charAt(0).toUpperCase()
                    : "?"}
              </div>
              {!isLoading && user && (
                <span className="text-xs text-gray-700 font-medium hidden sm:block">
                  {user.username}
                </span>
              )}
              <svg
                className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Dropdown Panel */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                {user ? (
                  <>
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                      <p className="text-sm font-semibold text-gray-900">
                        {user.username}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 capitalize">
                        {user.role === "admin" ? "Quản trị viên" : "Người dùng"}
                      </p>
                    </div>

                    {/* Menu Items — admin only */}
                    {user.role === "admin" && (
                      <div className="py-1">
                        <button
                          onClick={() => setDropdownOpen(false)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                        >
                          Quản lý người dùng
                        </button>
                      </div>
                    )}
                    {(user.role === "admin" ||
                      user.role === "user") && (
                      <div className="py-1
                        border-t border-gray-200">
                        <button
                          onClick={() => {
                            setDropdownOpen(false)
                            setSettingsOpen(true)
                          }}
                          className="w-full text-left
                            px-4 py-2 text-sm
                            text-gray-700
                            hover:bg-gray-100
                            hover:text-gray-900
                            transition-colors"
                        >
                          Cài đặt hệ thống
                        </button>
                      </div>
                    )}

                    {/* Thông tin cá nhân */}
                    <div className="py-1 border-t border-gray-200">
                      <button
                        onClick={() => setDropdownOpen(false)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                      >
                        Thông tin cá nhân
                      </button>
                    </div>

                    {/* Logout */}
                    <div className="py-1 border-t border-gray-200">
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          logout();
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        Đăng xuất
                      </button>
                    </div>
                  </>
                ) : (
                  /* Chưa đăng nhập */
                  <div className="py-1">
                    <a
                      href="/login"
                      onClick={() => setDropdownOpen(false)}
                      className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors block"
                    >
                      Đăng nhập
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
          <SettingsModal
            isOpen={settingsOpen}
            onClose={() =>
              setSettingsOpen(false)}
          />
          {/* ← ĐÃ THAY THẾ: QL → Dropdown */}
        </div>
      </div>
    </header>
  );
}
