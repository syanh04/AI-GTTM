'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export const CAMERA_STATUS_STORAGE_KEY = 'smart-traffic-camera-status-v1';
export const CAMERA_STATUS_EVENT = 'smart-traffic-camera-status-change';

export const DEFAULT_CAMERA_IDS = ['CAM_01', 'CAM_02', 'CAM_03', 'CAM_04', 'CAM_05', 'CAM_06'];

type CameraStatusMap = Record<string, boolean>;

function normalizeStatusMap(value: unknown): CameraStatusMap {
  const parsed = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(
    DEFAULT_CAMERA_IDS.map((id) => [id, typeof parsed[id] === 'boolean' ? Boolean(parsed[id]) : true]),
  );
}

function readCameraStatus(): CameraStatusMap {
  if (typeof window === 'undefined') {
    return normalizeStatusMap({});
  }
  try {
    return normalizeStatusMap(JSON.parse(window.localStorage.getItem(CAMERA_STATUS_STORAGE_KEY) || '{}'));
  } catch {
    return normalizeStatusMap({});
  }
}

function writeCameraStatus(next: CameraStatusMap) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CAMERA_STATUS_STORAGE_KEY, JSON.stringify(normalizeStatusMap(next)));
  window.dispatchEvent(new CustomEvent(CAMERA_STATUS_EVENT, { detail: normalizeStatusMap(next) }));
}

export function useCameraStatus() {
  const [statusMap, setStatusMap] = useState<CameraStatusMap>(() => readCameraStatus());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = (event?: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      setStatusMap(normalizeStatusMap(detail || readCameraStatus()));
    };
    sync();
    window.addEventListener(CAMERA_STATUS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CAMERA_STATUS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setCameraEnabled = useCallback((cameraId: string, enabled: boolean) => {
    const current = readCameraStatus();
    const next = normalizeStatusMap({ ...current, [cameraId]: enabled });
    writeCameraStatus(next);
    setStatusMap(next);
  }, []);

  const setAllCamerasEnabled = useCallback((enabled: boolean) => {
    const next = Object.fromEntries(DEFAULT_CAMERA_IDS.map((id) => [id, enabled]));
    writeCameraStatus(next);
    setStatusMap(next);
  }, []);

  const isCameraEnabled = useCallback((cameraId: string) => statusMap[cameraId] !== false, [statusMap]);

  const activeCameraIds = useMemo(
    () => DEFAULT_CAMERA_IDS.filter((id) => statusMap[id] !== false),
    [statusMap],
  );

  return {
    statusMap,
    activeCameraIds,
    isCameraEnabled,
    setCameraEnabled,
    setAllCamerasEnabled,
  };
}
