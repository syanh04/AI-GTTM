export interface DataItem {
  id: number;
  case_code: string;
  plate: string;
  plate_original?: string | null;
  ocr_percent: number;
  vehicle_type: string;
  violation_type: string;
  review_status: string;
  camera_id: string;
  timestamp: string;
  raw_timestamp?: string;
  track_id?: number | null;
  has_plate_crop: boolean;
  plate_edited: boolean;
  is_simulated: boolean;
  deleted_at?: string | null;
  delete_reason?: string | null;
}

export interface DataDetail extends DataItem {
  confidence: number;
  vote_count: number;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  plate_edited_by?: string | null;
  plate_edited_at?: string | null;
  plate_crop_source?: string | null;
  image_path?: string;
  crop_path?: string;
  audit_history?: Array<{
    id: number;
    ts: string;
    username: string;
    action: string;
    note?: string | null;
    before?: string | null;
    after?: string | null;
  }>;
}

export interface SummaryKPI {
  total_vehicles: number;
  violations: number;
  ocr_clear_percent: number;
  crop_storage_bytes: number;
  crop_storage_gb: number;
  prev_total?: number | null;
  prev_violations?: number | null;
  prev_ocr_clear?: number | null;
}

export interface CameraStat {
  camera_id: string;
  total: number;
  violations: number;
  last_seen_at?: string | null;
}

export interface StorageInfo {
  storage_root: string;
  quota_gb: number;
  used_gb: number;
  free_gb: number;
  percent_used: number;
  total_files: number;
  warning: boolean;
  orphan_files: number;
  missing_crop_records: number;
  retention_days: number;
}

export interface ModelMetrics {
  total_evaluated_records: number;
  ocr_distribution: {
    under_80: number;
    from_80_to_90: number;
    ge_90: number;
    avg_score_percent: number;
    clear_percent: number;
  };
  vote_count_distribution: Record<string, number>;
  manual_edit_ratio: number | null;
  reviewed_records_count: number;
  violation_review_precision: number | null;
  processing_time_ms_per_frame: number | null;
  note: string;
}

export interface AuditItem {
  id: number;
  ts: string;
  username: string;
  role?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  note?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  before?: string | null;
  after?: string | null;
}
