'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export function CameraGridSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="w-full aspect-video rounded-lg" />
          <Skeleton className="w-full h-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="w-full h-80 rounded-lg" />
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="w-full h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="w-full h-80 rounded-lg" />
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="w-3/4 h-4 rounded" />
        <Skeleton className="w-1/2 h-4 rounded" />
      </div>
      <div className="space-y-2 ml-auto">
        <Skeleton className="w-2/3 h-4 rounded ml-auto" />
        <Skeleton className="w-1/3 h-4 rounded ml-auto" />
      </div>
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header Skeleton */}
      <div className="h-8 bg-muted/30 rounded-lg animate-pulse w-1/3 mb-6" />

      {/* Cards Skeleton */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3 bg-card/50 p-4 rounded-lg border border-border/30">
          <div className="flex items-center justify-between">
            <div className="h-4 bg-muted/30 rounded animate-pulse w-1/2" />
            <div className="h-4 bg-muted/30 rounded animate-pulse w-1/4" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-6 bg-muted/30 rounded animate-pulse" />
            <div className="h-6 bg-muted/30 rounded animate-pulse" />
          </div>
          <div className="h-4 bg-muted/30 rounded animate-pulse w-2/3" />
        </div>
      ))}
    </div>
  );
}
