'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Save, Cloud, User, Building2, Bot, ExternalLink, QrCode } from 'lucide-react';

export default function SystemSettings() {
  const [unitName, setUnitName] = useState('Trung Tâm Giám Sát Giao Thông Thông Minh');
  const [cloudStorage, setCloudStorage] = useState('enabled');
  const [adminEmail, setAdminEmail] = useState('admin@trafficai.vn');
  const [adminPhone, setAdminPhone] = useState('024-12345678');
  const [telegramBotUsername, setTelegramBotUsername] = useState('smarttraffic_ai_bot');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramTokenHint, setTelegramTokenHint] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    window.localStorage.setItem('telegram_bot_username', telegramBotUsername.trim());
    window.localStorage.setItem('telegram_chat_id', telegramChatId.trim());
    window.localStorage.setItem('telegram_token_hint', telegramTokenHint.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const telegramStartPayload = 'project_showcase';
  const telegramBotLink = `https://t.me/${telegramBotUsername || 'smarttraffic_ai_bot'}?start=${telegramStartPayload}`;
  const telegramQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(telegramBotLink)}&bgcolor=ffffff&color=0f172a&margin=12`;

  useEffect(() => {
    const savedBotUsername = window.localStorage.getItem('telegram_bot_username');
    setTelegramBotUsername(
      !savedBotUsername || ['smarttraffic_demo_bot', 'SmartTrafficVNBot', 'uttgiaothong_bot'].includes(savedBotUsername)
        ? 'smarttraffic_ai_bot'
        : savedBotUsername,
    );
    setTelegramChatId(window.localStorage.getItem('telegram_chat_id') || '');
    setTelegramTokenHint(window.localStorage.getItem('telegram_token_hint') || '');
  }, []);

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold">Cài Đặt Hệ Thống</h2>
      </div>

      {/* Unit Information */}
      <Card className="p-6 bg-white shadow-sm border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Thông Tin Đơn Vị</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Tên Đơn Vị</label>
            <input
              type="text"
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Nhập tên đơn vị..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Email Admin</label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="admin@..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Điện Thoại Admin</label>
              <input
                type="tel"
                value={adminPhone}
                onChange={(e) => setAdminPhone(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0..."
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Cloud Storage */}
      <Card className="p-6 bg-white shadow-sm border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <Cloud className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Lưu Trữ Đám Mây</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-gray-200">
            <div>
              <p className="font-medium text-sm">AWS S3</p>
              <p className="text-xs text-muted-foreground">Lưu trữ video và hình ảnh</p>
            </div>
            <input
              type="radio"
              name="cloud"
              value="aws"
              checked={cloudStorage === 'aws'}
              onChange={(e) => setCloudStorage(e.target.value)}
              className="w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-gray-200">
            <div>
              <p className="font-medium text-sm">Google Cloud Storage</p>
              <p className="text-xs text-muted-foreground">Lưu trữ dữ liệu phân tích</p>
            </div>
            <input
              type="radio"
              name="cloud"
              value="gcp"
              checked={cloudStorage === 'gcp'}
              onChange={(e) => setCloudStorage(e.target.value)}
              className="w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-gray-200">
            <div>
              <p className="font-medium text-sm">Local Server</p>
              <p className="text-xs text-muted-foreground">Lưu trữ tại máy chủ địa phương</p>
            </div>
            <input
              type="radio"
              name="cloud"
              value="local"
              checked={cloudStorage === 'local'}
              onChange={(e) => setCloudStorage(e.target.value)}
              className="w-4 h-4"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Hiện tại: <span className="font-medium">{cloudStorage.toUpperCase()}</span>
        </p>
      </Card>

      {/* Account Settings */}
      <Card className="p-6 bg-white shadow-sm border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Quản Lý Tài Khoản</h3>
        </div>

        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-white border border-gray-200">
            <p className="font-medium text-sm mb-1">Tài Khoản Quản Trị Chính</p>
            <p className="text-xs text-muted-foreground mb-3">{adminEmail}</p>
            <button className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:opacity-90 transition">
              Thay Đổi Mật Khẩu
            </button>
          </div>

          <div className="p-3 rounded-lg bg-white border border-gray-200">
            <p className="font-medium text-sm mb-1">Bảo Mật Hai Yếu Tố</p>
            <p className="text-xs text-muted-foreground mb-3">Chưa Bật</p>
            <button className="text-xs px-3 py-1.5 bg-muted text-foreground rounded hover:bg-muted/80 transition">
              Bật Ngay
            </button>
          </div>
        </div>
      </Card>

      {/* Telegram Bot */}
      <Card className="p-6 bg-white shadow-sm border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <Bot className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Tích Hợp Telegram Bot</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-5">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Username Bot Telegram</label>
              <input
                type="text"
                value={telegramBotUsername}
                onChange={(e) => setTelegramBotUsername(e.target.value.replace(/^@/, ''))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="smarttraffic_ai_bot"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                QR mở thẳng lộ trình giới thiệu dự án, sau đó cho phép xem video và thử dữ liệu trực tiếp.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Chat ID nhận thông báo</label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Ví dụ: -100xxxxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Ghi chú token bot</label>
                <input
                  type="password"
                  value={telegramTokenHint}
                  onChange={(e) => setTelegramTokenHint(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Token lưu demo cục bộ, không hiển thị công khai"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-900">Luồng bot đề xuất</p>
              <p className="mt-1">/showcase: trình bày 5 điểm nổi bật của dự án.</p>
              <p>/architecture: mô tả pipeline AI end-to-end.</p>
              <p>/demo: gửi video demo đã lưu.</p>
              <p>/today và /plate 30F89060: thử dữ liệu backend trực tiếp.</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-primary shadow-sm">
              <QrCode className="h-5 w-5" />
            </div>
            <img
              src={telegramQrUrl}
              alt="QR Telegram Bot"
              className="mx-auto h-[220px] w-[220px] rounded-lg border border-white bg-white object-contain shadow-sm"
            />
            <a
              href={telegramBotLink}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Mở bot Telegram
            </a>
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition flex items-center justify-center gap-2"
      >
        <Save className="w-4 h-4" />
        Lưu Cấu Hình
      </button>

      {saved && (
        <Card className="p-4 bg-green-500/20 border border-green-500/50">
          <p className="text-sm text-green-700 font-medium">✓ Cấu hình đã lưu thành công</p>
        </Card>
      )}
    </div>
  );
}
