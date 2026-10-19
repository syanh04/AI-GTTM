'use client';

import React from 'react';
import ViolationCenter from '@/components/ViolationCenter';
import LegalCatalogView from './LegalCatalogView';
import type { ViolationEvent } from '@/app/page';

interface CasesViewProps {
  selectedDate: string;
  violationContext: ViolationEvent | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export default function CasesView({
  selectedDate,
  violationContext,
  activeTab = 'records',
}: CasesViewProps) {
  if (activeTab === 'legal') {
    return <LegalCatalogView />;
  }

  return (
    <div className="space-y-4">
      <ViolationCenter selectedDate={selectedDate} violationContext={violationContext} />
    </div>
  );
}
