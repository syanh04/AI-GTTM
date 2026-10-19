'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
  type ChangeEvent,
} from 'react';
import { useAuth } from '@/lib/AuthContext';

export type VideoSourceMode = 'default' | 'rtsp';

const VIDEO_PREFS_STORAGE_KEY = 'smart-traffic-video-prefs-v1';

interface VideoState {
  cameraFrames: Record<string, string | null>;
  rawVideoFiles: Record<string, File | null>;
  rawVideoUrls: Record<string, string | null>;
  uploading: Record<string, boolean>;
  uploadTarget: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  detectVehicle: boolean;
  detectPlate: boolean;
  simulationMode: boolean;
  showBox: boolean;
  simulatePlateMode: boolean;
  sourceMode: VideoSourceMode;
  preferredRtspUrl: string;
  effectiveDetectVehicle: boolean;
  effectiveDetectPlate: boolean;
}

interface VideoActions {
  handleUploadClick: (cameraId: string) => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  setCameraFrame: (cameraId: string, frameUrl: string | null) => void;
  getRawVideoUrl: (cameraId: string) => string | null;
  setDetectVehicle: (val: boolean) => void;
  setDetectPlate: (val: boolean) => void;
  setSimulationMode: (val: boolean) => void;
  setShowBox: (val: boolean) => void;
  setSimulatePlateMode: (val: boolean) => void;
  setSourceMode: (mode: VideoSourceMode) => void;
  setPreferredRtspUrl: (url: string) => void;
  resetAll: () => void;
}

type VideoContextType = VideoState & VideoActions;

const VideoContext = createContext<VideoContextType | null>(null);

interface VideoProviderProps {
  children: ReactNode;
}

export function VideoProvider({ children }: VideoProviderProps) {
  const { user } = useAuth();
  const [cameraFrames, setCameraFrames] = useState<Record<string, string | null>>({});
  const [rawVideoFiles, setRawVideoFiles] = useState<Record<string, File | null>>({});
  const [rawVideoUrls, setRawVideoUrls] = useState<Record<string, string | null>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [detectVehicle, setDetectVehicle] = useState(true);
  const [detectPlate, setDetectPlate] = useState(true);
  const [simulationMode, setSimulationMode] = useState(false);
  const [showBox, setShowBox] = useState(false);
  const [simulatePlateMode, setSimulatePlateMode] = useState(false);
  const [sourceMode, setSourceMode] = useState<VideoSourceMode>('default');
  const [preferredRtspUrl, setPreferredRtspUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prefsLoadedRef = useRef(false);
  const sessionSourceRef = useRef<VideoSourceMode | ''>('');

  const effectiveDetectVehicle = detectVehicle;
  const effectiveDetectPlate = detectPlate;

  const buildStreamUrl = useCallback(
    (
      baseUrl: string,
      options?: {
        rtspUrl?: string;
        showBox?: boolean;
        cacheBust?: boolean;
        cameraId?: string;
      },
    ) => {
      const pageOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const isLocalVideoStream =
        typeof window !== 'undefined' &&
        baseUrl.startsWith('/video_feed/') &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      // Keep long-lived MJPEG requests off the Next.js origin in local mode.
      // Six camera streams can otherwise occupy the browser's per-origin
      // connection pool and starve normal /api requests and RSC navigation.
      const origin = isLocalVideoStream
        ? `${window.location.protocol}//${window.location.hostname}:8000`
        : pageOrigin;
      const url = new URL(baseUrl, origin);
      const params = url.searchParams;
      params.set('detect_vehicle', String(effectiveDetectVehicle));
      params.set('detect_plate', String(effectiveDetectPlate));
      params.set('simulation', String(simulationMode));
      params.set('simulate_plate', String(simulationMode && effectiveDetectPlate && simulatePlateMode));
      if (options?.rtspUrl) {
        params.set('rtsp_url', options.rtspUrl);
      }
      if (options?.cameraId) {
        params.set('cam_id', options.cameraId);
      }
      params.set('show_box', String(typeof options?.showBox === 'boolean' ? options.showBox : showBox));
      if (options?.cacheBust) {
        params.set('_', String(Date.now()));
      }
      return url.toString();
    },
    [effectiveDetectPlate, effectiveDetectVehicle, showBox, simulatePlateMode, simulationMode],
  );

  const loadDefaultStreams = useCallback(async () => {
    if (!user) {
      return;
    }
    if (sourceMode === 'rtsp') {
      return;
    }
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token && token !== 'cookie-session') {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/cameras', {
        credentials: 'include',
        headers,
      });
      const data = await res.json();
      const cameras = data.cameras || [];

      const newFrames: Record<string, string> = {};
      cameras.forEach((cam: {
        id: string;
        has_video: boolean;
        stream_url: string | null;
      }) => {
        if (cam.has_video && cam.stream_url) {
          const baseUrl = cam.stream_url.startsWith('http')
            ? cam.stream_url
            : `${cam.stream_url}`;
          newFrames[cam.id] = buildStreamUrl(baseUrl, { cameraId: cam.id });
        }
      });

      if (Object.keys(newFrames).length > 0) {
        setCameraFrames((prev) => ({ ...prev, ...newFrames }));
        console.log('[AUTO] Loaded streams:', Object.keys(newFrames));
      } else {
        // Fallback default 6 camera streams if backend cameras array is empty
        const fallbackFrames: Record<string, string> = {};
        ['CAM_01', 'CAM_02', 'CAM_03', 'CAM_04', 'CAM_05', 'CAM_06'].forEach((id) => {
          fallbackFrames[id] = buildStreamUrl(`/video_feed/${id.toLowerCase()}`, { cameraId: id });
        });
        setCameraFrames((prev) => ({ ...fallbackFrames, ...prev }));
      }
    } catch (err) {
      console.warn('[AUTO] Khong load duoc camera defaults:', err);
      // Fallback default 6 camera streams
      const fallbackFrames: Record<string, string> = {};
      ['CAM_01', 'CAM_02', 'CAM_03', 'CAM_04', 'CAM_05', 'CAM_06'].forEach((id) => {
        fallbackFrames[id] = buildStreamUrl(`/video_feed/${id.toLowerCase()}`, { cameraId: id });
      });
      setCameraFrames((prev) => ({ ...fallbackFrames, ...prev }));
    }
  }, [buildStreamUrl, sourceMode, user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(VIDEO_PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{
          detectVehicle: boolean;
          detectPlate: boolean;
          simulationMode: boolean;
          showBox: boolean;
          simulatePlateMode: boolean;
          sourceMode: VideoSourceMode;
          preferredRtspUrl: string;
        }>;
        if (typeof parsed.detectVehicle === 'boolean') {
          setDetectVehicle(parsed.detectVehicle);
        }
        if (typeof parsed.detectPlate === 'boolean') {
          setDetectPlate(parsed.detectPlate);
        }
        if (typeof parsed.simulationMode === 'boolean') {
          setSimulationMode(parsed.simulationMode);
        }
        if (typeof parsed.showBox === 'boolean') {
          setShowBox(parsed.showBox);
        }
        if (typeof parsed.simulatePlateMode === 'boolean') {
          setSimulatePlateMode(parsed.simulatePlateMode);
        }
        // Always begin a new browser session with the bundled demo videos.
        // RTSP remains available as a manual, session-only choice.
        setSourceMode('default');
        if (typeof parsed.preferredRtspUrl === 'string') {
          setPreferredRtspUrl(parsed.preferredRtspUrl);
        }
      }
    } catch (error) {
      console.warn('[VIDEO] Khong the nap AI config tu localStorage:', error);
    } finally {
      prefsLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!prefsLoadedRef.current || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      VIDEO_PREFS_STORAGE_KEY,
      JSON.stringify({
        detectVehicle,
        detectPlate,
        simulationMode,
        showBox,
        simulatePlateMode,
        sourceMode,
        preferredRtspUrl,
      }),
    );
  }, [detectPlate, detectVehicle, preferredRtspUrl, showBox, simulatePlateMode, simulationMode, sourceMode]);

  useEffect(() => {
    if (!prefsLoadedRef.current) {
      return;
    }
    if (!user) {
      setCameraFrames({});
      return;
    }
    if (sessionSourceRef.current !== sourceMode) {
      sessionSourceRef.current = sourceMode;
    }
    if (sourceMode === 'rtsp') {
      setCameraFrames({});
      return;
    }
    loadDefaultStreams();
  }, [loadDefaultStreams, sourceMode, user]);

  useEffect(() => {
    if (sourceMode === 'rtsp') {
      return;
    }
    setCameraFrames((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        const url = next[id];
        if (url && url.includes('/video_feed/')) {
          const baseUrl = url.split('&_=').shift() || url;
          next[id] = buildStreamUrl(baseUrl, { cacheBust: true, cameraId: id });
        }
      });
      return next;
    });
  }, [buildStreamUrl, sourceMode]);

  useEffect(() => {
    return () => {
      Object.values(rawVideoUrls).forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [rawVideoUrls]);

  const handleUploadClick = useCallback((cameraId: string) => {
    setUploadTarget(cameraId);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !uploadTarget) {
      return;
    }

    setUploading((prev) => ({ ...prev, [uploadTarget]: true }));

    try {
      setRawVideoFiles((prev) => ({ ...prev, [uploadTarget]: file }));

      const objectUrl = URL.createObjectURL(file);
      setRawVideoUrls((prev) => {
        const oldUrl = prev[uploadTarget];
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl);
        }
        return { ...prev, [uploadTarget]: objectUrl };
      });

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        console.error('Upload that bai', await response.text());
        return;
      }

      const data = await response.json();
      if (!data || typeof data !== 'object') {
        return;
      }

        if (data.is_video) {
          const filename = data.results?.filename;
          if (!filename) {
            console.error('Backend did not return a safe video filename');
            return;
          }
          const streamUrl = buildStreamUrl(
            `/video_feed/${encodeURIComponent(filename)}`,
            { cameraId: uploadTarget },
          );
          setCameraFrames((prev) => ({
            ...prev,
          [uploadTarget]: streamUrl,
        }));
      } else {
        const frameB64 = data.results?.frame_b64 ?? null;
        if (frameB64) {
          setCameraFrames((prev) => ({
            ...prev,
            [uploadTarget]: `data:image/jpeg;base64,${frameB64}`,
          }));
        }
      }
    } catch (error) {
      console.error('Loi khi tai video len:', error);
    } finally {
      setUploading((prev) => ({ ...prev, [uploadTarget]: false }));
      setUploadTarget(null);
    }
  }, [buildStreamUrl, uploadTarget]);

  const setCameraFrame = useCallback((cameraId: string, frameUrl: string | null) => {
    setCameraFrames((prev) => ({ ...prev, [cameraId]: frameUrl }));
  }, []);

  const getRawVideoUrl = useCallback((cameraId: string) => rawVideoUrls[cameraId] ?? null, [rawVideoUrls]);

  const resetAll = useCallback(() => {
    Object.values(rawVideoUrls).forEach((url) => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
    setCameraFrames({});
    setRawVideoFiles({});
    setRawVideoUrls({});
    setUploading({});
    setUploadTarget(null);
    setDetectVehicle(true);
    setDetectPlate(true);
    setSimulationMode(false);
    setShowBox(false);
    setSimulatePlateMode(false);
    setSourceMode('default');
    setPreferredRtspUrl('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(VIDEO_PREFS_STORAGE_KEY);
    }
  }, [rawVideoUrls]);

  const value: VideoContextType = {
    cameraFrames,
    rawVideoFiles,
    rawVideoUrls,
    uploading,
    uploadTarget,
    fileInputRef,
    detectVehicle,
    detectPlate,
    simulationMode,
    showBox,
    simulatePlateMode,
    sourceMode,
    preferredRtspUrl,
    effectiveDetectVehicle,
    effectiveDetectPlate,
    handleUploadClick,
    handleFileChange,
    setCameraFrame,
    getRawVideoUrl,
    setDetectVehicle,
    setDetectPlate,
    setSimulationMode,
    setShowBox,
    setSimulatePlateMode,
    setSourceMode,
    setPreferredRtspUrl,
    resetAll,
  };

  return (
    <VideoContext.Provider value={value}>
      {children}
    </VideoContext.Provider>
  );
}

export function useVideoState(): VideoContextType {
  const context = useContext(VideoContext);
  if (!context) {
    throw new Error('useVideoState phai duoc su dung trong VideoProvider');
  }
  return context;
}
