'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Search, Sparkles } from 'lucide-react';

interface SmartSearchItem {
  id: number;
  plate_number: string;
  vehicle_type_vi?: string;
  vehicle_type?: string;
  violation_type?: string;
  camera_id?: string;
  timestamp?: string;
  ocr_score?: number;
  review_status?: string;
  match_count?: number;
}

interface SmartSearchResult {
  query: string;
  intent: string;
  answer: string;
  items: SmartSearchItem[];
}

const EXAMPLES = [
  'Tìm xe 98A hôm nay',
  'Xe n\u00e0o v\u01b0\u1ee3t \u0111\u00e8n \u0111\u1ecf nhi\u1ec1u nh\u1ea5t?',
  'Camera 3 c\u00f3 bao nhi\u00eau vi ph\u1ea1m?',
  'Bi\u1ec3n 30F89060 vi ph\u1ea1m g\u00ec?',
];

export default function SmartSearchPanel() {
  const [query, setQuery] = useState(EXAMPLES[0]);
  const [result, setResult] = useState<SmartSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runSearch = async (nextQuery = query) => {
    const text = nextQuery.trim();
    if (!text) return;
    setQuery(text);
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/search/smart?q=${encodeURIComponent(text)}&limit=12`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      setResult(payload);
    } catch (err) {
      console.error('Smart search failed', err);
      setError('Không truy vấn được dữ liệu. Kiểm tra backend hoặc thử câu khác.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-950">Tìm kiếm thông minh</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Nhập câu hỏi tự nhiên để tra cứu biển số, camera, vi phạm và hồ sơ gần nhất.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch();
            }}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-medium outline-none transition focus:border-slate-900 focus:bg-white"
            placeholder="Ví dụ: Camera 3 có bao nhiêu vi phạm?"
          />
        </div>
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Đang tìm...' : 'Tìm kiếm'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => void runSearch(example)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-900 hover:text-slate-950"
          >
            {example}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-500">{result.intent}</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{result.answer}</p>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Biển số</th>
                  <th className="px-3 py-2">Vi phạm</th>
                  <th className="px-3 py-2">Camera</th>
                  <th className="px-3 py-2">Thời gian</th>
                  <th className="px-3 py-2">OCR</th>
                </tr>
              </thead>
              <tbody>
                {result.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      Không có bản ghi phù hợp.
                    </td>
                  </tr>
                ) : (
                  result.items.map((item) => (
                    <tr key={`${item.id}-${item.match_count || 0}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono font-bold text-slate-950">
                        {item.plate_number || 'Chưa rõ'}
                        {item.match_count ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-sans text-slate-600">{item.match_count} lượt</span> : null}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{item.violation_type || 'Chưa ghi nhận'}</td>
                      <td className="px-3 py-2 text-slate-600">{item.camera_id || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{item.timestamp || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{item.ocr_score ? `${Math.round(item.ocr_score * 100)}%` : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
