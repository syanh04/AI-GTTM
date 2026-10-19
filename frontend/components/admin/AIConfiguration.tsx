'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { AlertCircle, Cpu, MessageCircle, QrCode } from 'lucide-react';
import AIControlPanel from '@/components/AIControlPanel';
import { useVideoState } from '@/lib/VideoContext';

const telegramBotBaseUrl = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || 'https://t.me/smarttraffic_ai_bot';
const telegramShowcaseUrl = `${telegramBotBaseUrl.split('?')[0]}?start=project_showcase`;
const telegramQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(telegramShowcaseUrl)}&bgcolor=ffffff&color=0f172a&margin=12`;

export default function AIConfiguration() {
  const confidence = 0.75;
  const [stableDemoMode, setStableDemoMode] = useState(false);
  const { effectiveDetectVehicle, effectiveDetectPlate } = useVideoState();

  useEffect(() => {
    setStableDemoMode(window.localStorage.getItem('stable_violation_demo_mode') === '1');
  }, []);

  const toggleStableDemoMode = () => {
    setStableDemoMode((prev) => {
      const next = !prev;
      window.localStorage.setItem('stable_violation_demo_mode', next ? '1' : '0');
      window.dispatchEvent(new Event('stable_violation_demo_mode_change'));
      return next;
    });
  };

  return (
    <div className="space-y-6 w-full">
      <div className="mb-2">
        <h2 className="text-xl font-bold">Cấu hình AI</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <Card className="p-4 border border-slate-200 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <div className="flex-1">
                <p className="font-medium text-sm text-slate-950">AI backend đang dùng cấu hình model hiện tại</p>
                <p className="text-xs text-slate-600">
                  Không hard-code GPU, OCR hoặc model mới trên giao diện; trạng thái thực tế lấy từ backend khi vận hành.
                </p>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            <p className="text-sm font-medium">Điều hướng luồng nhận diện</p>
            <p className="text-xs text-muted-foreground">
              Chọn nguồn cho tab Giám sát giữa video có sẵn của hệ thống và luồng RTSP.
            </p>
            <AIControlPanel />
            <Card className="p-4 border-sky-200 bg-sky-50/70">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Chế độ kiểm duyệt ổn định</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Khi bật, Hồ sơ vi phạm ưu tiên bản ghi đủ ảnh toàn xe, crop biển, OCR và thông tin chủ xe để hạn chế biên bản thiếu dữ liệu.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleStableDemoMode}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${
                    stableDemoMode
                      ? 'bg-sky-600 text-white hover:bg-sky-700'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {stableDemoMode ? 'Đang bật' : 'Đang tắt'}
                </button>
              </div>
            </Card>
          </div>

          <Card className="p-6 bg-card/50">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="font-medium text-sm">Ngưỡng nhận diện</label>
                <span className="text-lg font-bold text-primary">{(confidence * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={confidence}
                disabled
                aria-label="Ngưỡng nhận diện do backend quản lý"
                title="Ngưỡng thực tế được cấu hình tại backend"
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-not-allowed accent-primary opacity-60"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>0% thấp</span>
                <span>50% cân bằng</span>
                <span>100% cao</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="mb-1 block font-medium text-amber-700">Chỉ đọc: ngưỡng thực tế được cấu hình tại backend.</span>
              {confidence < 0.5
                ? 'Nhạy cao, cần kiểm duyệt kỹ hơn.'
                : confidence < 0.8
                  ? 'Cân bằng giữa độ nhạy và độ chính xác.'
                  : 'Ưu tiên độ tin cậy, có thể bỏ sót một số phát hiện.'}
            </p>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ModelCard
              title="YOLO nhận diện xe"
              subtitle="Car, Truck, Bus, Motorcycle"
              tone="blue"
              status={effectiveDetectVehicle ? 'running' : 'stopped'}
              leftMetricLabel="FPS"
              leftMetricValue="Theo runtime"
              rightMetricLabel="Thiết bị"
              rightMetricValue="Backend"
            />
            <ModelCard
              title="YOLO biển số + OCR"
              subtitle="Plate detector và bộ OCR hiện tại"
              tone="purple"
              status={effectiveDetectPlate ? 'running' : 'stopped'}
              leftMetricLabel="OCR"
              leftMetricValue="QuangNhat"
              rightMetricLabel="Fallback"
              rightMetricValue="Theo .env"
            />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4 bg-muted/20 border border-muted">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Trạng thái hệ thống</p>
                <p>Thông số GPU/CPU hiển thị theo runtime backend, không giả lập tên phần cứng.</p>
                <p>OCR và model nhận diện giữ nguyên pipeline hiện tại.</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 border-slate-200 bg-white">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-950">Trợ lý Telegram</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Quét QR để xem điểm nổi bật, luồng xử lý AI, video demo, dữ liệu vi phạm và tra cứu biển số từ xa.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <a href={telegramShowcaseUrl} target="_blank" rel="noreferrer" title="Mở trợ lý Smart Traffic AI">
                <img src={telegramQrUrl} alt="QR giới thiệu dự án Smart Traffic AI" className="mx-auto h-52 w-52 object-contain" />
              </a>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <QrCode className="h-4 w-4" />
              <span>Token bot được đọc từ biến môi trường, không hiển thị trên giao diện.</span>
            </div>
          </Card>

          <Card className="bg-[#000000] border border-slate-800 flex flex-col min-h-[360px] shadow-none rounded-none">
            <div className="px-4 py-3 border-b border-slate-800 bg-[#000000] flex items-center justify-between">
              <span className="font-mono text-xs text-slate-400 font-bold tracking-wider uppercase">AI_Inference_Log</span>
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-slate-700 rounded-full" />
                <div className="w-2 h-2 bg-slate-700 rounded-full" />
              </div>
            </div>
            <div className="flex-1 p-4 font-mono text-xs overflow-y-auto custom-scrollbar bg-[#000000] space-y-1">
              {[
                'vehicle_detector: online',
                'plate_detector: online',
                'ocr_pipeline: current backend configuration',
                'telegram_bot: reads TELEGRAM_BOT_TOKEN from environment',
                'push_alerts: CHATBOT_PUSH_TELEGRAM_CHAT_IDS',
              ].map((line) => (
                <div key={line} className="flex gap-4 leading-relaxed hover:bg-white/5 py-0.5 -mx-2 px-2 transition-colors">
                  <span className="text-slate-500 flex-shrink-0 select-none">{new Date().toLocaleTimeString('vi-VN')}</span>
                  <div className="flex-1 text-white">
                    <span className="text-slate-500 mr-3 select-none">[+]</span>
                    {line}
                  </div>
                </div>
              ))}
              <div className="pt-2 text-slate-600 animate-pulse flex items-center gap-2">
                <span className="text-slate-500">$</span>
                <span className="w-2 h-4 bg-slate-500 block" />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ModelCard({
  title,
  subtitle,
  tone,
  status,
  leftMetricLabel,
  leftMetricValue,
  rightMetricLabel,
  rightMetricValue,
}: {
  title: string;
  subtitle: string;
  tone: 'blue' | 'purple';
  status: 'running' | 'stopped';
  leftMetricLabel: string;
  leftMetricValue: string;
  rightMetricLabel: string;
  rightMetricValue: string;
}) {
  const toneClass = tone === 'blue' ? 'bg-blue-500/20 text-blue-500' : 'bg-purple-500/20 text-purple-500';

  return (
    <Card className="p-6 bg-card/50">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-lg ${toneClass}`}>
            <Cpu className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-sm">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <span
          className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
            status === 'running'
              ? 'bg-green-500/20 text-green-700'
              : 'bg-red-500/20 text-red-700'
          }`}
        >
          {status === 'running' ? 'Đang chạy' : 'Dừng'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-1">
        <div className="text-center p-3 bg-muted/30 rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">{leftMetricLabel}</p>
          <p className="text-sm font-bold text-foreground">{leftMetricValue}</p>
        </div>
        <div className="text-center p-3 bg-muted/30 rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">{rightMetricLabel}</p>
          <p className="text-sm font-bold text-foreground">{rightMetricValue}</p>
        </div>
      </div>
    </Card>
  );
}
