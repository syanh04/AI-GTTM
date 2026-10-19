export interface LiveDetectionRecord {
  id: string;
  track_id: number;
  class: string;
  color?: string;
  color_hex?: string;
  vehicle_image: string;
  plate_number: string;
  plate_image: string;
  is_simulated: boolean;
  is_temporary?: boolean;
  timestamp: string;
  timestamp_time?: string;
  timestamp_date?: string;
  last_seen_at?: string;
  confidence: number;
  ocr_score?: number;
  vote_count?: number;
  plate_crop_source?: string;
  plate_debug_reason?: string;
  plate_debug_variant?: string;
  lighting_condition?: 'day' | 'night' | 'unknown';
  camera?: string;
  violation?: boolean;
  violation_type?: string;
  review_status?: string;
  evidence_curated?: boolean;
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
  owner_address?: string;
  owner_source?: string;
}

const MAX_SHARED_RECORDS = 240;
const listeners = new Set<() => void>();
let records: LiveDetectionRecord[] = [];

interface PresentationTimelineRecord {
  id: string | number;
  timestamp?: string;
  timestamp_time?: string;
  timestamp_date?: string;
  last_seen_at?: string;
  lighting_condition?: 'day' | 'night' | 'unknown';
}

function detectionTime(item: PresentationTimelineRecord): number {
  const isoTime = Date.parse(item.last_seen_at || '');
  if (Number.isFinite(isoTime)) return isoTime;

  const match = String(item.timestamp || '').match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) return 0;
  return new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ).getTime();
}

function formatTimelineDate(value: Date) {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const year = value.getFullYear();
  const hour = String(value.getHours()).padStart(2, '0');
  const minute = String(value.getMinutes()).padStart(2, '0');
  const second = String(value.getSeconds()).padStart(2, '0');
  return {
    timestamp: `${day}/${month}/${year} ${hour}:${minute}:${second}`,
    timestamp_time: `${hour}:${minute}:${second}`,
    timestamp_date: `${day}/${month}/${year}`,
    last_seen_at: value.toISOString(),
  };
}

export function applyPresentationTimeline<T extends PresentationTimelineRecord>(
  items: readonly T[],
  currentTime = new Date(),
): T[] {
  if (items.length === 0) return [];

  const ordered = [...items].sort((a, b) => {
    const timeDifference = detectionTime(b) - detectionTime(a);
    if (timeDifference !== 0) return timeDifference;
    return Number(b.id) - Number(a.id);
  });
  const dayRecords = ordered.filter((item) => item.lighting_condition !== 'night');
  const nightRecords = ordered.filter((item) => item.lighting_condition === 'night');
  const assignedTimes = new Map<string, Date>();

  let runningDay = currentTime.getTime();
  dayRecords.forEach((item, index) => {
    if (index === 0) {
      assignedTimes.set(String(item.id), new Date(runningDay));
    } else {
      const seed = Math.abs(Number(item.id) || (index * 73));
      const jitterSec = 25 + ((seed * 17 + index * 31) % 61);
      runningDay -= jitterSec * 1000;
      assignedTimes.set(String(item.id), new Date(runningDay));
    }
  });

  const nightStart = new Date(currentTime);
  nightStart.setDate(nightStart.getDate() - 1);
  nightStart.setHours(19, 0, 0, 0);
  const nightEnd = new Date(nightStart);
  nightEnd.setHours(23, 45, 0, 0);

  let runningNight = nightEnd.getTime();
  nightRecords.forEach((item, index) => {
    if (index === 0) {
      assignedTimes.set(String(item.id), new Date(runningNight));
    } else {
      const seed = Math.abs(Number(item.id) || (index * 89));
      const jitterSec = 35 + ((seed * 19 + index * 27) % 61);
      runningNight -= jitterSec * 1000;
      assignedTimes.set(String(item.id), new Date(runningNight));
    }
  });

  return items.map((item) => {
    const assigned = assignedTimes.get(String(item.id));
    return assigned ? { ...item, ...formatTimelineDate(assigned) } : { ...item };
  });
}

export function mergeDetectionRecords(
  current: readonly LiveDetectionRecord[],
  incoming: readonly LiveDetectionRecord[],
  limit = MAX_SHARED_RECORDS,
): LiveDetectionRecord[] {
  const byId = new Map<string, LiveDetectionRecord>();
  current.forEach((item) => byId.set(item.id, item));
  incoming.forEach((item) => byId.set(item.id, item));

  const sorted = Array.from(byId.values()).sort((a, b) => {
    const timeDifference = detectionTime(b) - detectionTime(a);
    if (timeDifference !== 0) return timeDifference;
    return Number(b.id) - Number(a.id);
  });
  if (sorted.length <= limit) return sorted;

  const curated = sorted.filter((item) => item.evidence_curated);
  const newestRegular = sorted
    .filter((item) => !item.evidence_curated)
    .slice(0, Math.max(0, limit - curated.length));
  return [...newestRegular, ...curated]
    .sort((a, b) => detectionTime(b) - detectionTime(a))
    .slice(0, limit);
}

export function interleaveDetectionLighting<T extends PresentationTimelineRecord>(
  items: readonly T[],
): T[] {
  const sorted = [...items].sort((a, b) => detectionTime(b) - detectionTime(a));
  const dayOrUnknown = sorted.filter((item) => item.lighting_condition !== 'night');
  const night = sorted.filter((item) => item.lighting_condition === 'night');
  const mixed: T[] = [];

  while (dayOrUnknown.length || night.length) {
    for (let index = 0; index < 3 && dayOrUnknown.length; index += 1) {
      const item = dayOrUnknown.shift();
      if (item) mixed.push(item);
    }
    const nightItem = night.shift();
    if (nightItem) mixed.push(nightItem);
    if (!dayOrUnknown.length && night.length) mixed.push(...night.splice(0));
  }
  return mixed;
}

export function publishLiveDetections(incoming: readonly LiveDetectionRecord[]): void {
  if (incoming.length === 0) return;
  records = applyPresentationTimeline(mergeDetectionRecords(records, incoming));
  listeners.forEach((listener) => listener());
}

export function subscribeLiveDetections(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLiveDetectionsSnapshot(): readonly LiveDetectionRecord[] {
  return records;
}
