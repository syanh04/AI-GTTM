'use client';

import React from 'react';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Camera,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  GitMerge,
  HardDrive,
  History,
  List,
  MapPin,
  Settings,
  ShieldAlert,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { RELATIONS, canAccess, goTo, linkTo, prefetch } from '@/lib/crossNav';
import { findNavigationItem } from '@/lib/navigation';

const ICON_MAP: Record<string, LucideIcon> = {
  Database,
  ShieldAlert,
  BookOpen,
  Camera,
  Video,
  GitMerge,
  MapPin,
  List,
  BarChart3,
  AlertCircle,
  Cpu,
  FileText,
  HardDrive,
  Settings,
  History,
};

export interface RelatedActionsProps {
  sourceType: 'record' | 'case' | 'camera' | 'rule' | 'user' | 'audit' | 'analytics' | 'dispatch' | 'storage';
  entity: any;
  userRole?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export default function RelatedActions({
  sourceType,
  entity,
  userRole,
  className = '',
  size = 'sm',
}: RelatedActionsProps) {
  if (!entity) return null;

  // Filter matching relations from registry
  const availableRelations = RELATIONS.filter((rel) => {
    if (rel.sourceType !== sourceType) return false;
    if (!canAccess(rel.target.view, userRole)) return false;
    if (rel.condition && !rel.condition(entity, userRole)) return false;
    return true;
  });

  if (availableRelations.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {availableRelations.map((rel) => {
        const IconComponent = rel.iconName ? ICON_MAP[rel.iconName] || ExternalLink : ExternalLink;
        const labelText = typeof rel.label === 'function' ? rel.label(entity) : rel.label;
        const params = rel.mapParams(entity);
        const targetMeta = findNavigationItem(rel.target.view);
        const href = linkTo(rel.target, params);

        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault();
          goTo(rel.target, params, {
            mode: 'push',
            title: targetMeta?.label,
          });
        };

        const handleMouseEnter = () => {
          prefetch(href);
        };

        const btnClass =
          size === 'sm'
            ? 'px-2.5 py-1 text-xs gap-1.5'
            : 'px-3 py-1.5 text-sm gap-2';

        return (
          <a
            key={rel.id}
            href={href}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            className={`inline-flex items-center font-medium rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-sky-600 hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500/40 cursor-pointer ${btnClass}`}
            title={`Chuyển tới ${targetMeta?.label || rel.target.view}`}
          >
            <IconComponent className={size === 'sm' ? 'h-3.5 w-3.5 text-slate-500' : 'h-4 w-4 text-slate-500'} />
            <span>{labelText}</span>
          </a>
        );
      })}
    </div>
  );
}
