'use client';

import React from 'react';
import { type ViewKey, findNavigationItem } from '@/lib/navigation';
import { linkTo, goTo, prefetch, linkForEntity, canAccess } from '@/lib/crossNav';

export interface EntityLinkProps {
  entityType: 'camera' | 'record' | 'case' | 'user' | 'rule' | 'plate' | 'setting' | 'report';
  entityId: string | number;
  label?: React.ReactNode;
  userRole?: string;
  className?: string;
  openDrawer?: boolean;
  children?: React.ReactNode;
}

export default function EntityLink({
  entityType,
  entityId,
  label,
  userRole,
  className = '',
  openDrawer = true,
  children,
}: EntityLinkProps) {
  const mapping = linkForEntity(entityType, entityId);
  const targetItem = findNavigationItem(mapping.view);

  // If user cannot access target view, render plain text
  if (!canAccess(mapping.view, userRole)) {
    return <span className={className}>{children || label || String(entityId)}</span>;
  }

  const finalParams = {
    ...mapping.params,
    ...(openDrawer ? { open: 1 } : {}),
  };

  const href = linkTo({ view: mapping.view, tab: mapping.tab }, finalParams);
  const titleText = `Mở trong ${targetItem?.label || mapping.view}`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    goTo({ view: mapping.view, tab: mapping.tab }, finalParams, {
      mode: 'push',
      title: targetItem?.label,
    });
  };

  const handleMouseEnter = () => {
    prefetch(href);
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      className={`inline-flex items-center gap-1 font-medium text-sky-600 hover:text-sky-800 hover:underline focus:outline-none focus:ring-1 focus:ring-sky-500 rounded px-0.5 transition-colors cursor-pointer ${className}`}
      title={titleText}
      aria-label={`${children || label || entityId} - ${titleText}`}
    >
      {children || label || String(entityId)}
    </a>
  );
}
