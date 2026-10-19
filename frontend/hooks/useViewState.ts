'use client';

import { useCallback, useEffect, useState } from 'react';

interface ViewStatePayload<T = any> {
  data: T;
  savedAt: number;
}

const VIEW_STATE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function useViewState<T = Record<string, any>>(
  viewKey: string,
  initialState: T
): [T, (updater: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = `crossnav_viewstate_${viewKey}`;

  const loadState = useCallback((): T => {
    if (typeof window === 'undefined') return initialState;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return initialState;
      const payload: ViewStatePayload<T> = JSON.parse(raw);
      if (Date.now() - payload.savedAt > VIEW_STATE_TTL_MS) {
        sessionStorage.removeItem(storageKey);
        return initialState;
      }
      return { ...initialState, ...payload.data };
    } catch {
      return initialState;
    }
  }, [storageKey, initialState]);

  const [state, setStateInternal] = useState<T>(loadState);

  const setState = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setStateInternal((prev) => {
        const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
        if (typeof window !== 'undefined') {
          try {
            const payload: ViewStatePayload<T> = {
              data: next,
              savedAt: Date.now(),
            };
            sessionStorage.setItem(storageKey, JSON.stringify(payload));
          } catch {}
        }
        return next;
      });
    },
    [storageKey]
  );

  const clearState = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
    }
    setStateInternal(initialState);
  }, [storageKey, initialState]);

  return [state, setState, clearState];
}
