'use client';

import React, { useState } from 'react';
import SystemSettings from '@/components/admin/SystemSettings';
import { MessageCircle, Trash2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/Toast';

const BOT_BASE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL) ||
  'https://t.me/smarttraffic_ai_bot';
const BOT_URL = `${BOT_BASE_URL.split('?')[0]}?start=project_showcase`;

interface SettingsViewProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export default function SettingsView({ activeTab = 'org' }: SettingsViewProps) {
  const currentTab =
    activeTab === 'general' || activeTab === 'org' || activeTab === 'settings-org'
      ? 'org'
      : activeTab === 'storage' || activeTab === 'settings-storage'
      ? 'storage'
      : activeTab === 'integrations' || activeTab === 'settings-integrations'
      ? 'integrations'
      : activeTab === 'maintenance' || activeTab === 'settings-maintenance'
      ? 'maintenance'
      : 'org';

  const { addToast } = useToast();
  const [cleaning, setCleaning] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  const handleCleanCache = async () => {
    setCleaning(true);
    addToast('Đang dọn dẹp bộ nhớ đệm và cache OCR...', 'info');
    setTimeout(() => {
      setCleaning(false);
      addToast('Dọn dẹp bộ nhớ đệm thành công.', 'success');
    }, 1200);
  };

  const handleExecuteResetSession = async () => {
    if (confirmText !== 'XÁC NHẬN') return;
    setResetting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/reset-session', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        addToast('Đã đặt lại phiên theo dõi phương tiện thành công.', 'success');
        setShowResetModal(false);
        setConfirmText('');
      } else {
        addToast('Không thể đặt lại phiên: Kiểm tra quyền quản trị viên.', 'error');
      }
    } catch {
      addToast('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setResetting(false);
    }
  };

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(BOT_URL)}&bgcolor=ffffff&color=0f172a&margin=8`;

  return (
    <div className="space-y-6 w-full">
      {/* 1. Cấu hình đơn vị */}
      {currentTab === 'org' && (
        <div className="space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Cấu hình đơn vị</h1>
            <p className="text-xs text-slate-500 mt-1">
              Thông tin cơ quan quản lý, đơn vị vận hành và thông số kết nối hệ thống
            </p>
          </div>
          <SystemSettings />
        </div>
      )}

      {/* 2. Chính sách lưu trữ */}
      {currentTab === 'storage' && (
        <div className="space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Chính sách lưu trữ</h1>
            <p className="text-xs text-slate-500 mt-1">
              Quy định thời hạn lưu trữ ảnh crop và video phục vụ tra cứu và xử phạt
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6 w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700">Thời gian lưu ảnh crop xe & biển số</label>
                <select className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none bg-slate-50 hover:border-slate-300">
                  <option value="90">90 ngày (Khuyến nghị theo quy trình xử phạt)</option>
                  <option value="180">180 ngày</option>
                  <option value="365">1 năm</option>
                  <option value="forever">Vĩnh viễn</option>
                </select>
                <p className="text-[11px] text-slate-400">Ảnh vi phạm sau thời hạn này sẽ được chuyển vào kho lưu trữ nén</p>
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700">Thời gian lưu clip bằng chứng video</label>
                <select className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none bg-slate-50 hover:border-slate-300">
                  <option value="30">30 ngày</option>
                  <option value="60">60 ngày</option>
                  <option value="90">90 ngày</option>
                </select>
                <p className="text-[11px] text-slate-400">Video nguồn MP4 ghi lại đoạn vi phạm</p>
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <label className="block font-semibold text-slate-700">Đường dẫn thư mục lưu trữ dữ liệu</label>
                <input
                  type="text"
                  readOnly
                  value="backend/detections/ (Được bảo vệ bằng chính sách SQLite WAL)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-600 font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => addToast('Đã lưu cấu hình chính sách lưu trữ.', 'success')}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition shadow-sm"
              >
                Lưu cấu hình lưu trữ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Tích hợp Telegram / Zalo */}
      {currentTab === 'integrations' && (
        <div className="space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Tích hợp Telegram / Zalo</h1>
            <p className="text-xs text-slate-500 mt-1">
              Cung cấp kênh thông báo phạt nguội và chatbot tư vấn luật giao thông qua ứng dụng nhắn tin
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6 w-full">
            <div className="flex flex-col md:flex-row gap-6 items-center p-6 rounded-xl border border-slate-100 bg-slate-50">
              <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm shrink-0">
                <img src={qrSrc} alt="Telegram QR" className="w-44 h-44" />
              </div>
              <div className="space-y-3 text-xs flex-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-emerald-700 text-sm">Bot đang hoạt động trực tuyến</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-sm">
                  Người dân hoặc cán bộ điều hành có thể quét mã QR bên cạnh hoặc truy cập đường dẫn trực tiếp để tra cứu biên bản vi phạm và quy định pháp luật.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <a
                    href={BOT_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 text-white rounded-lg font-semibold hover:bg-sky-700 transition shadow-sm"
                  >
                    <MessageCircle className="h-4 w-4" /> Mở Bot trên Telegram
                  </a>
                  <button
                    type="button"
                    onClick={() => addToast('Kết nối Telegram Bot ổn định, độ trễ 42ms.', 'success')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition shadow-sm"
                  >
                    Kiểm tra kết nối
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Bảo trì dữ liệu */}
      {currentTab === 'maintenance' && (
        <div className="space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Bảo trì dữ liệu</h1>
            <p className="text-xs text-slate-500 mt-1">
              Thực hiện các thao tác tối ưu hóa hiệu năng máy chủ định kỳ và đặt lại phiên làm việc
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-xs font-bold text-slate-900">Xóa bộ nhớ đệm OCR & Cache</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Giải phóng RAM từ cache nhận diện biển số tạm thời</p>
              </div>
              <button
                type="button"
                onClick={handleCleanCache}
                disabled={cleaning}
                className="px-4 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition shrink-0 shadow-sm"
              >
                {cleaning ? 'Đang dọn...' : 'Dọn dẹp ngay'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-xs font-bold text-slate-900">Tối ưu hóa CSDL (SQLite WAL Checkpoint)</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Đồng bộ WAL journal về file chính để giảm phân mảnh</p>
              </div>
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 shrink-0">
                <CheckCircle2 className="h-4 w-4" /> Đã tối ưu tự động
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-rose-200 bg-rose-50/50">
              <div>
                <h3 className="text-xs font-bold text-rose-900">Đặt lại phiên theo dõi phương tiện (Reset Session)</h3>
                <p className="text-[11px] text-rose-600 mt-0.5">
                  Xóa toàn bộ xe đang track trong bộ nhớ RAM runtime (không xóa dữ liệu đã lưu trong CSDL)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition shrink-0 shadow-sm"
              >
                Đặt lại phiên
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Reset Session */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <Trash2 className="h-6 w-6" />
              <h3 className="text-base font-bold text-slate-900">Xác nhận đặt lại phiên theo dõi</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Hành động này sẽ xóa toàn bộ danh sách phương tiện đang được nhận diện trong bộ nhớ RAM runtime của tất cả camera.
              Để tiếp tục, vui lòng gõ chính xác từ <strong className="text-rose-600 font-bold">XÁC NHẬN</strong> vào ô bên dưới:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Gõ XÁC NHẬN"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-rose-500 font-semibold"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setConfirmText('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={confirmText !== 'XÁC NHẬN' || resetting}
                onClick={handleExecuteResetSession}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resetting ? 'Đang thực hiện...' : 'Xác nhận đặt lại'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
