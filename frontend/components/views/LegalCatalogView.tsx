'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import ViolationCatalog from '@/components/ViolationCatalog';
import { BookOpen, ArrowLeft } from 'lucide-react';
import { goTo } from '@/lib/crossNav';

export default function LegalCatalogView() {
  const searchParams = useSearchParams();
  const ruleParam = searchParams?.get('rule');
  const caseParam = searchParams?.get('case');

  return (
    <div className="space-y-4">
      {ruleParam && (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              Đang xem căn cứ pháp lý cho hồ sơ <strong>{caseParam || 'vi phạm'}</strong> · Quy tắc liên quan: <strong>{ruleParam}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => goTo({ view: 'cases' })}
            className="inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-900 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại hồ sơ
          </button>
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm min-h-[600px]">
        <ViolationCatalog />
      </div>
    </div>
  );
}
