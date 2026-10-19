'use client';

import React from 'react';
import { Calendar, Download } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

interface GlobalFilterProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  onExportPDF: () => void;
  onExportCSV: () => void;
}

export default function GlobalFilter({
  selectedDate,
  onDateChange,
  onExportPDF,
  onExportCSV,
}: GlobalFilterProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  return (
    <div className="flex items-center gap-4">
      {/* Date Selector */}
      <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 rounded-lg border border-border">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="bg-transparent text-sm font-medium text-foreground outline-none"
        />
      </div>

      {/* Export Buttons */}
      <div className="flex items-center gap-2 border-l border-border pl-4">
        <button
          onClick={onExportPDF}
          disabled={!isAdmin}
          title={!isAdmin ? 'Chỉ admin mới có quyền này' : 'Xuất PDF'}
          className={`flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-xs font-medium ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Download className="w-4 h-4" />
          PDF
        </button>
        <button
          onClick={onExportCSV}
          disabled={!isAdmin}
          title={!isAdmin ? 'Chỉ admin mới có quyền này' : 'Xuất CSV'}
          className={`flex items-center gap-2 px-3 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors text-xs font-medium ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Download className="w-4 h-4" />
          CSV
        </button>
      </div>
    </div>
  );
}
