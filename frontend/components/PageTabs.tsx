'use client';

import React from 'react';
import { type LucideIcon } from 'lucide-react';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

interface PageTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabKey: string) => void;
  className?: string;
}

export default function PageTabs({ tabs, activeTab, onChange, className = '' }: PageTabsProps) {
  return (
    <div className={`border-b border-slate-200 mb-6 ${className}`}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {Icon && <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-500'}`} />}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                    isActive ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
