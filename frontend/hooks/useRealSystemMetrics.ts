'use client';

import { useState, useEffect } from 'react';

export interface SystemMetrics {
  cpu_percent: number;
  gpu_percent: number | null;
  ram_percent: number;
  ram_used_bytes: number;
  ram_total_bytes: number;
  disk_percent: number;
  disk_used_bytes: number;
  disk_total_bytes: number;
  inference_latency_ms: number | null;
  api_latency_ms: number | null;
  cameras_online: number;
  cameras_total: number;
  bandwidth_mbps: number | null;
  collected_at: string;
}

export function useRealSystemMetrics(pollingIntervalMs: number = 5000) {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchMetrics = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch('/api/system/metrics', { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setMetrics(data);
            setLoading(false);
            setError(null);
          }
        } else {
          if (isMounted) setError(`HTTP ${res.status}`);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Lỗi tải thông số hệ thống');
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, pollingIntervalMs);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pollingIntervalMs]);

  return { metrics, loading, error };
}
