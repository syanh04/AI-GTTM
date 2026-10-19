'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export interface SystemBadges {
  cases_pending: number;
  cameras_offline: number;
  alerts_open: number;
}

const DEFAULT_BADGES: SystemBadges = {
  cases_pending: 0,
  cameras_offline: 0,
  alerts_open: 0,
};

export function useSystemBadges(pollIntervalMs = 15000) {
  const [badges, setBadges] = useState<SystemBadges>(DEFAULT_BADGES);
  const timerRef = useRef<any>(null);

  const fetchBadges = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    try {
      const res = await fetch('/api/system/badges', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBadges({
          cases_pending: Number(data.cases_pending || 0),
          cameras_offline: Number(data.cameras_offline || 0),
          alerts_open: Number(data.alerts_open || 0),
        });
      }
    } catch {
      // Keep previous badges on network hiccup
    }
  }, []);

  useEffect(() => {
    fetchBadges();

    const startTimer = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(fetchBadges, pollIntervalMs);
    };

    const stopTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchBadges();
        startTimer();
      } else {
        stopTimer();
      }
    };

    startTimer();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('crossnav:badge_refresh', fetchBadges);

    return () => {
      stopTimer();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('crossnav:badge_refresh', fetchBadges);
    };
  }, [fetchBadges, pollIntervalMs]);

  return {
    ...badges,
    refreshBadges: fetchBadges,
  };
}
