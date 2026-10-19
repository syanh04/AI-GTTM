import { useState, useEffect } from 'react';

export interface SystemStatus {
    cpu: number;
    gpu: number;
    latency: number;
    version: string;
    timestamp: Date;
    aiOwners?: number;
    aiWorkers?: number;
    ocrQueue?: number;
}

export const useSystemStatus = () => {
    const [systemStatus, setSystemStatus] = useState<SystemStatus>({
        cpu: 12,
        gpu: 45,
        latency: 142,
        version: 'v2.5.0',
        timestamp: new Date(),
    });

    useEffect(() => {
        let stopped = false;

        const fetchStatus = async () => {
            const started = performance.now();
            try {
                const response = await fetch('/api/stream/diagnostics');
                const latency = Math.round(performance.now() - started);
                if (!response.ok) throw new Error('stream diagnostics failed');
                const data = await response.json();
                if (stopped) return;
                const aiOwners = Number(data.ai_owner_count || 0);
                const aiWorkers = Number(data.ai_workers || 0);
                const ocrQueue = Number(data.background_ocr_queue_size || 0);
                setSystemStatus((prev) => ({
                    ...prev,
                    cpu: aiOwners > 0 ? Math.min(95, 20 + aiOwners * 12) : 8,
                    gpu: aiOwners > 0 ? Math.min(95, 35 + aiWorkers * 10) : 10,
                    latency,
                    aiOwners,
                    aiWorkers,
                    ocrQueue,
                    timestamp: new Date(),
                }));
            } catch {
                if (stopped) return;
                setSystemStatus((prev) => ({
                    ...prev,
                    cpu: 0,
                    gpu: 0,
                    latency: 0,
                    aiOwners: 0,
                    aiWorkers: 0,
                    ocrQueue: 0,
                    timestamp: new Date(),
                }));
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);

        return () => {
            stopped = true;
            clearInterval(interval);
        };
    }, []);

    return systemStatus;
};
