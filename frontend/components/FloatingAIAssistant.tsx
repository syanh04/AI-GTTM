'use client';

import React, { useState } from 'react';
import { Bot, X, Sparkles, Maximize2, Minimize2 } from 'lucide-react';
import AIChatbot from './AIChatbot';

interface FloatingAIAssistantProps {
  initialMessage?: string;
  contextHint?: string;
}

export default function FloatingAIAssistant({
  initialMessage,
  contextHint,
}: FloatingAIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      {/* Nút bấm nổi góc phải dưới */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full bg-indigo-600 px-4 py-3 text-white shadow-xl hover:bg-indigo-700 hover:shadow-2xl transition-all duration-200 group active:scale-95"
          aria-label="Mở Trợ lý AI"
        >
          <div className="relative">
            <Bot className="h-5 w-5 text-white" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <span className="text-sm font-semibold tracking-wide">Trợ lý AI</span>
          <Sparkles className="h-4 w-4 text-amber-300 opacity-80 group-hover:rotate-12 transition-transform" />
        </button>
      )}

      {/* Cửa sổ Trợ lý AI */}
      {isOpen && (
        <div
          className={`fixed z-50 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ${
            isExpanded
              ? 'bottom-4 right-4 w-[min(90vw,720px)] h-[min(90vh,820px)]'
              : 'bottom-6 right-6 w-[min(92vw,440px)] h-[min(85vh,640px)]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-900 to-indigo-950 px-4 py-3.5 text-white rounded-t-2xl">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-indigo-500/20 p-1.5 text-indigo-300 border border-indigo-400/20">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Trợ lý AI Giao thông</h3>
                <p className="text-[11px] text-slate-300">Tư vấn pháp lý & phân tích dữ liệu</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                title={isExpanded ? 'Thu nhỏ' : 'Mở rộng'}
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                title="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Chat Body */}
          <div className="flex-1 overflow-hidden p-2 bg-slate-50/50 rounded-b-2xl">
            <AIChatbot initialMessage={initialMessage} contextHint={contextHint} />
          </div>
        </div>
      )}
    </>
  );
}
