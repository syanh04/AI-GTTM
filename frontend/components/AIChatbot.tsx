'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Send, Loader2, Sparkles, Lightbulb } from 'lucide-react';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatbotProps {
  initialMessage?: string;
  contextHint?: string;
}

const buildHistory = (items: Message[]) =>
  items.slice(-6).map((message) => ({
    role: message.type === 'user' ? 'user' : 'assistant',
    content: message.content,
  }));

const DEMO_PROMPTS = [
  'Tóm tắt tình hình nhận diện phương tiện đang lưu trong hệ thống.',
  'Hệ thống làm gì để tránh ghép nhầm xe và biển số?',
  'Cho tôi biết các bằng chứng của một bản ghi hợp lệ gồm những gì.',
  'Hướng dẫn quy trình xử lý một bản ghi vi phạm cần con người kiểm tra.',
];

export default function AIChatbot({ initialMessage, contextHint }: AIChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const lastInitialMessageRef = useRef<string | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setMessages([
      {
        id: crypto.randomUUID(),
        type: 'assistant',
        content: 'Tôi có thể giúp bạn phân tích hành vi vi phạm, tra cứu quy định và đề xuất xử lý.',
        timestamp: new Date(),
      },
    ]);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, mounted]);

  useEffect(() => {
    if (!suggestionsOpen) return;
    const closeSuggestions = (event: PointerEvent) => {
      if (!suggestionsRef.current?.contains(event.target as Node)) setSuggestionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSuggestionsOpen(false);
    };
    document.addEventListener('pointerdown', closeSuggestions);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeSuggestions);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [suggestionsOpen]);

  useEffect(() => {
    if (!initialMessage) {
      lastInitialMessageRef.current = undefined;
      return;
    }
    if (lastInitialMessageRef.current === initialMessage) return;
    lastInitialMessageRef.current = initialMessage;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      type: 'user',
      content: initialMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    (async () => {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: initialMessage,
            model: 'llama3.1:latest',
            history: buildHistory(messages),
            context_hint: contextHint,
          }),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = await response.json();
        const answer: string =
          (data && typeof data === 'object' && (data.answer as string)) ||
          'Xin lỗi, tôi chưa thể trả lời câu hỏi này.';

        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), type: 'assistant', content: answer, timestamp: new Date() },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: 'assistant',
            content: 'Trợ lý AI đang tạm bận. Câu hỏi của bạn vẫn được giữ lại; vui lòng gửi lại sau ít giây.',
            timestamp: new Date(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, [contextHint, initialMessage, messages]);

  const handleSendMessage = async (messageOverride?: string) => {
    const trimmedInput = (messageOverride ?? input).trim();
    if (!trimmedInput || loading) return;
    const historySnapshot = buildHistory(messages);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      type: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: trimmedInput,
          model: 'llama3.1:latest',
          history: historySnapshot,
          context_hint: contextHint,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Yêu cầu tới Trợ lý AI thất bại');
      }

      const data = await response.json();
      const answer: string =
        (data && typeof data === 'object' && (data.answer as string)) ||
        'Xin lỗi, tôi chưa thể trả lời câu hỏi này.';

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), type: 'assistant', content: answer, timestamp: new Date() },
      ]);
    } catch (error) {
      console.error('Lỗi khi gọi /api/chat:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'assistant',
          content: 'Trợ lý AI đang tạm bận. Câu hỏi của bạn vẫn được giữ lại; vui lòng gửi lại sau ít giây.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="h-full w-full overflow-hidden rounded-lg border border-border bg-white shadow-none">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-border/70 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
          <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />
          <p>Phân tích hồ sơ, tra cứu quy định và đề xuất quy trình xử lý.</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {messages.slice(1).map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-2 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.type === 'assistant' && (
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
              )}
              <div className={`max-w-[86%] ${message.type === 'user' ? 'text-right' : 'text-left'}`}>
                <div className="mb-1 text-[11px] text-slate-400" suppressHydrationWarning>
                  {message.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div
                  className={`rounded-lg px-3 py-2 text-sm leading-relaxed shadow-sm ${
                    message.type === 'user'
                      ? 'bg-blue-50 text-blue-950 ring-1 ring-blue-100'
                      : 'bg-white text-slate-900 ring-1 ring-slate-200'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang soạn câu trả lời...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="relative border-t border-border bg-white p-3" ref={suggestionsRef}>
          {suggestionsOpen && (
            <div className="absolute bottom-full left-3 right-3 z-30 mb-2 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Gợi ý câu hỏi
              </div>
              <div className="space-y-1">
                {DEMO_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setSuggestionsOpen(false);
                      void handleSendMessage(prompt);
                    }}
                    disabled={loading}
                    className="w-full rounded-md px-2.5 py-2 text-left text-xs leading-relaxed text-slate-700 transition hover:bg-blue-50 hover:text-blue-800 disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSuggestionsOpen((open) => !open)}
              disabled={loading}
              aria-label="Mở gợi ý câu hỏi"
              aria-expanded={suggestionsOpen}
              aria-haspopup="menu"
              className={`flex h-10 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-semibold transition disabled:opacity-50 ${
                suggestionsOpen
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
              }`}
            >
              <Lightbulb className="h-4 w-4" />
              <span className="hidden sm:inline">Gợi ý</span>
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void handleSendMessage();
              }}
              placeholder="Nhập câu hỏi..."
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
              disabled={loading}
            />
            <button
              onClick={() => void handleSendMessage()}
              disabled={loading || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-300 text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Gửi câu hỏi"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
