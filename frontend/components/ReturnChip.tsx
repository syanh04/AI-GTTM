'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { goBack, peekReturnStack } from '@/lib/crossNav';

interface ReturnChipProps {
  className?: string;
}

export default function ReturnChip({ className = '' }: ReturnChipProps) {
  const [returnTitle, setReturnTitle] = useState<string | null>(null);

  useEffect(() => {
    const updateReturnInfo = () => {
      const top = peekReturnStack();
      if (top) {
        setReturnTitle(top.title || top.view);
        return;
      }
      if (typeof window !== 'undefined') {
        const ret = new URLSearchParams(window.location.search).get('ret');
        if (ret) {
          const view = ret.split(':')[0];
          setReturnTitle(view);
          return;
        }
      }
      setReturnTitle(null);
    };

    updateReturnInfo();
    window.addEventListener('popstate', updateReturnInfo);
    window.addEventListener('crossnav:navigate', updateReturnInfo);

    return () => {
      window.removeEventListener('popstate', updateReturnInfo);
      window.removeEventListener('crossnav:navigate', updateReturnInfo);
    };
  }, []);

  if (!returnTitle) return null;

  return (
    <button
      type="button"
      onClick={() => goBack()}
      className={`inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100 hover:text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-500/50 ${className}`}
      title={`Quay lại ${returnTitle}`}
      aria-label={`Quay lại ${returnTitle}`}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span>Quay lại {returnTitle}</span>
    </button>
  );
}
