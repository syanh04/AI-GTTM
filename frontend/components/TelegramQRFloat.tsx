'use client';
import React, { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

// Cập nhật URL bot Telegram của bạn tại đây hoặc đặt trong NEXT_PUBLIC_TELEGRAM_BOT_URL
const BOT_BASE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL) ||
  'https://t.me/smarttraffic_ai_bot';
const BOT_URL = `${BOT_BASE_URL.split('?')[0]}?start=project_showcase`;

export default function TelegramQRFloat() {
  const [open, setOpen] = useState(true);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(BOT_URL)}&bgcolor=ffffff&color=0f172a&margin=8`;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-sky-600 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-white" />
              <span className="text-[12px] font-bold text-white">Trợ lý ảo Telegram</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-white/70 transition hover:bg-white/20 hover:text-white"
              title="Thu nhỏ"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-3.5">
            {/* Status */}
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-[11px] font-semibold text-emerald-700">Trợ lý AI sẵn sàng 24/7</span>
            </div>

            {/* QR Code */}
            <a
              href={BOT_URL}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl border border-slate-100"
              title="Mở trợ lý TrafficAI trên Telegram"
            >
              <img
                src={qrSrc}
                alt="QR mở phần giới thiệu dự án Smart Traffic AI trên Telegram"
                className="w-full"
                loading="lazy"
              />
            </a>
            <p className="mt-2 text-center text-[10.5px] leading-4 text-slate-600 font-medium">
              Tìm hiểu dự án sâu hơn thông qua trợ lý ảo chatbot tele dưới đây
            </p>
          </div>
        </div>
      )}

      {/* Collapsed button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-[12px] font-semibold text-white shadow-lg transition hover:bg-sky-700 hover:shadow-xl"
        >
          <MessageCircle className="h-4 w-4" />
          Xem demo Telegram
        </button>
      )}
    </div>
  );
}
