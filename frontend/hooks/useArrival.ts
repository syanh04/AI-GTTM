'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

export interface UseArrivalOptions {
  entityType?: 'record' | 'case' | 'camera' | 'rule';
  items?: Array<{ id: string | number; [key: string]: any }>;
  isLoading?: boolean;
  onOpen?: (id: string | number) => void;
  onFetchMissing?: (id: string | number) => Promise<any | null>;
}

export function useArrival({
  entityType = 'record',
  items = [],
  isLoading = false,
  onOpen,
  onFetchMissing,
}: UseArrivalOptions) {
  const [highlightedId, setHighlightedId] = useState<string | number | null>(null);
  const [notFound, setNotFound] = useState(false);
  const handledRef = useRef(false);

  const getArrivalParams = useCallback(() => {
    if (typeof window === 'undefined') return { targetId: null, shouldOpen: false };
    const params = new URLSearchParams(window.location.search);
    let targetId: string | null = null;

    if (entityType === 'record') targetId = params.get('record');
    else if (entityType === 'case') targetId = params.get('case');
    else if (entityType === 'camera') targetId = params.get('camera');
    else if (entityType === 'rule') targetId = params.get('rule');

    const shouldOpen = params.get('open') === '1';
    return { targetId, shouldOpen };
  }, [entityType]);

  useEffect(() => {
    if (isLoading || handledRef.current) return;

    const { targetId, shouldOpen } = getArrivalParams();
    if (!targetId) return;

    const foundInList = items.some(
      (item) => String(item.id) === String(targetId)
    );

    if (foundInList) {
      handledRef.current = true;
      setHighlightedId(targetId);

      // Scroll into view if element exists
      setTimeout(() => {
        const el = document.getElementById(`${entityType}-${targetId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      // Flash highlight for 2 seconds
      const timer = setTimeout(() => {
        setHighlightedId(null);
      }, 2000);

      // Open drawer if requested
      if (shouldOpen && onOpen) {
        onOpen(targetId);
      }

      return () => clearTimeout(timer);
    } else if (onFetchMissing) {
      // If not in current page, attempt direct fetch
      handledRef.current = true;
      onFetchMissing(targetId)
        .then((fetched) => {
          if (fetched) {
            setHighlightedId(targetId);
            if (shouldOpen && onOpen) {
              onOpen(targetId);
            }
          } else {
            setNotFound(true);
          }
        })
        .catch(() => {
          setNotFound(true);
        });
    }
  }, [items, isLoading, entityType, getArrivalParams, onOpen, onFetchMissing]);

  const clearNotFound = useCallback(() => {
    setNotFound(false);
  }, []);

  return {
    highlightedId,
    notFound,
    clearNotFound,
    isHighlighted: (id: string | number) => String(id) === String(highlightedId),
  };
}
