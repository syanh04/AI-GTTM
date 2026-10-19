'use client';

import React, { useEffect, useState } from 'react';
import PageTabs, { type TabItem } from '@/components/PageTabs';
import InfrastructureMap from '@/components/admin/InfrastructureMap';
import DeviceManagement from '@/components/admin/DeviceManagement';
import { Camera, MapPin, Server, Plus, Check, X, RefreshCw, Archive, Video, Database, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { goTo } from '@/lib/crossNav';
import { useArrival } from '@/hooks/useArrival';

interface CameraItem {
  id: string;
  name: string;
  location_name: string;
  district: string;
  lat: number;
  lng: number;
  source_type: string;
  source_uri: string;
  ip_address: string;
  enabled: boolean;
  archived: boolean;
  has_video: boolean;
  status: string;
}

interface DevicesViewProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isAdmin?: boolean;
}

export default function DevicesView({
  activeTab = 'list',
  onTabChange,
  isAdmin = false,
}: DevicesViewProps) {
  const [currentTab, setCurrentTab] = useState(activeTab);
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCam, setNewCam] = useState({
    id: '',
    name: '',
    location_name: '',
    district: '',
    lat: '21.0285',
    lng: '105.8542',
    ip_address: '',
    source_uri: '',
  });
  const { addToast } = useToast();
  const { highlightedId } = useArrival({ entityType: 'camera', items: cameras, isLoading: loading });

  const loadCameras = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cameras?include_archived=true');
      if (res.ok) {
        const data = await res.json();
        setCameras(data.cameras || []);
      }
    } catch (err) {
      console.error('Failed to load cameras:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCameras();
  }, []);

  const handleTabSelect = (key: string) => {
    setCurrentTab(key);
    if (onTabChange) onTabChange(key);
  };

  const handleToggleEnable = async (cam: CameraItem) => {
    if (!isAdmin) {
      addToast('Chỉ quản trị viên mới có quyền đổi trạng thái camera.', 'warning');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/cameras/${cam.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ enabled: !cam.enabled }),
      });
      if (res.ok) {
        addToast(`Đã ${!cam.enabled ? 'bật' : 'tắt'} camera ${cam.id}`, 'success');
        loadCameras();
      } else {
        addToast('Không thể cập nhật camera.', 'error');
      }
    } catch {
      addToast('Lỗi kết nối máy chủ.', 'error');
    }
  };

  const handleCreateCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCam.id || !newCam.name) {
      addToast('Vui lòng nhập mã và tên camera.', 'warning');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          id: newCam.id.trim().toUpperCase(),
          name: newCam.name.trim(),
          location_name: newCam.location_name.trim(),
          district: newCam.district.trim(),
          lat: parseFloat(newCam.lat) || 21.0,
          lng: parseFloat(newCam.lng) || 105.8,
          ip_address: newCam.ip_address.trim(),
          source_uri: newCam.source_uri.trim(),
          enabled: true,
        }),
      });
      if (res.ok) {
        addToast(`Đã tạo camera ${newCam.id}`, 'success');
        setShowAddModal(false);
        setNewCam({
          id: '',
          name: '',
          location_name: '',
          district: '',
          lat: '21.0285',
          lng: '105.8542',
          ip_address: '',
          source_uri: '',
        });
        loadCameras();
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.detail || 'Không thể tạo camera.', 'error');
      }
    } catch {
      addToast('Lỗi kết nối máy chủ.', 'error');
    }
  };

  const tabs: TabItem[] = [
    { key: 'list', label: 'Danh sách camera', icon: Camera },
    { key: 'map', label: 'Bản đồ hạ tầng', icon: MapPin },
    { key: 'metrics', label: 'Hiệu năng máy chủ', icon: Server },
  ];

  return (
    <div className="space-y-4">
      <PageTabs tabs={tabs} activeTab={currentTab} onChange={handleTabSelect} />

      {/* Tab 1: Danh sách Camera từ DB */}
      {currentTab === 'list' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Danh sách Camera hạ tầng</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nguồn dữ liệu duy nhất lưu trong bảng `cameras` của cơ sở dữ liệu
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadCameras}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600"
                  title="Làm mới"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition"
                  >
                    <Plus className="h-4 w-4" /> Thêm camera
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-y border-slate-200 uppercase font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Mã</th>
                    <th className="py-2.5 px-3">Tên camera</th>
                    <th className="py-2.5 px-3">Địa điểm / Nút giao</th>
                    <th className="py-2.5 px-3">Quận</th>
                    <th className="py-2.5 px-3">Địa chỉ IP</th>
                    <th className="py-2.5 px-3">Luồng video</th>
                    <th className="py-2.5 px-3">Trạng thái</th>
                    {isAdmin && <th className="py-2.5 px-3 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cameras.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-slate-400">
                        {loading ? 'Đang tải danh sách camera...' : 'Chưa có camera nào.'}
                      </td>
                    </tr>
                  ) : (
                    cameras.map((c) => (
                      <tr
                        key={c.id}
                        id={`camera-${c.id}`}
                        className={`transition-colors ${
                          highlightedId === c.id
                            ? 'bg-amber-100 ring-2 ring-amber-400'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">{c.id}</td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-800">{c.name}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => goTo({ view: 'live' }, { camera: c.id })}
                              className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
                              title="Xem camera trực tiếp"
                            >
                              <Video className="h-3 w-3" /> Trực tiếp
                            </button>
                            <button
                              type="button"
                              onClick={() => goTo({ view: 'data-center', tab: 'data' }, { camera: c.id, range: 'today' })}
                              className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
                              title="Xem dữ liệu hôm nay của camera"
                            >
                              <Database className="h-3 w-3 text-blue-600" /> Dữ liệu
                            </button>
                            <button
                              type="button"
                              onClick={() => goTo({ view: 'cases', tab: 'cases' }, { camera: c.id, status: 'pending' })}
                              className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-700 transition"
                              title="Xem hồ sơ vi phạm cần duyệt của camera"
                            >
                              <AlertTriangle className="h-3 w-3 text-amber-600" /> Vi phạm
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{c.location_name || '--'}</td>
                        <td className="py-3 px-3 text-slate-600">{c.district || '--'}</td>
                        <td className="py-3 px-3 font-mono text-slate-500">{c.ip_address || '--'}</td>
                        <td className="py-3 px-3">
                          {c.has_video ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                              <Check className="h-3.5 w-3.5" /> Có video
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Không có</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {c.archived ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              Lưu trữ
                            </span>
                          ) : c.enabled ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Hoạt động
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              Tắt
                            </span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleEnable(c)}
                              className={`px-2 py-1 text-[11px] font-semibold rounded border transition ${
                                c.enabled
                                  ? 'text-rose-600 border-rose-200 hover:bg-rose-50'
                                  : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                              }`}
                            >
                              {c.enabled ? 'Tắt' : 'Bật'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Bản đồ hạ tầng */}
      {currentTab === 'map' && (
        <div className="h-[calc(100vh-220px)] rounded-xl overflow-hidden border border-slate-200 shadow-sm">
          <InfrastructureMap />
        </div>
      )}

      {/* Tab 3: Hiệu năng máy chủ */}
      {currentTab === 'metrics' && <DeviceManagement />}

      {/* Modal Thêm Camera */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Thêm Camera mới</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCamera} className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mã camera (ID) *</label>
                <input
                  type="text"
                  required
                  placeholder="CAM_10"
                  value={newCam.id}
                  onChange={(e) => setNewCam({ ...newCam, id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tên camera *</label>
                <input
                  type="text"
                  required
                  placeholder="Camera 10 - Lê Văn Lương"
                  value={newCam.name}
                  onChange={(e) => setNewCam({ ...newCam, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Địa điểm / Nút giao</label>
                  <input
                    type="text"
                    placeholder="Ngã tư Lê Văn Lương"
                    value={newCam.location_name}
                    onChange={(e) => setNewCam({ ...newCam, location_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Quận / Huyện</label>
                  <input
                    type="text"
                    placeholder="Thanh Xuân"
                    value={newCam.district}
                    onChange={(e) => setNewCam({ ...newCam, district: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vĩ độ (Lat)</label>
                  <input
                    type="text"
                    value={newCam.lat}
                    onChange={(e) => setNewCam({ ...newCam, lat: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kinh độ (Lng)</label>
                  <input
                    type="text"
                    value={newCam.lng}
                    onChange={(e) => setNewCam({ ...newCam, lng: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Địa chỉ IP / Nguồn video</label>
                <input
                  type="text"
                  placeholder="192.168.1.110 hoặc rtsp://..."
                  value={newCam.ip_address}
                  onChange={(e) => setNewCam({ ...newCam, ip_address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
                >
                  Lưu camera
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
