"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";

const API_BASE = "";
type LaneDistribution = {
  lane_id: string | null;
  rows: number;
  unique_tracks: number;
};

type DiagnosticsResponse = {
  camera_id: string;
  has_lane_config: boolean;
  lane_config_count: number;
  trajectory: {
    total_rows: number;
    rows_last_1_minute: number;
    rows_last_5_minutes: number;
    unique_tracks_last_5_minutes: number;
    latest_timestamp: string | null;
    lane_distribution_last_5_minutes: LaneDistribution[];
  };
  events: {
    cut_in_total: number;
    cut_in_last_5_minutes: number;
    latest_cut_in_timestamp: string | null;
  };
  notes: string[];
};

const formatTime = (value: string | null) => value ? new Date(value).toLocaleString("vi-VN") : "--";

interface LaneAnalyticsDiagnosticsProps {
  cameraId: string;
}

export default function LaneAnalyticsDiagnostics({ cameraId }: LaneAnalyticsDiagnosticsProps) {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchDiagnostics = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/analytics/diagnostics?camera_id=${encodeURIComponent(cameraId)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Không tải được diagnostics");
      }
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được diagnostics");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
    const interval = window.setInterval(fetchDiagnostics, 5000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  const laneAllNull = useMemo(() => {
    const rows = data?.trajectory.lane_distribution_last_5_minutes || [];
    return rows.length > 0 && rows.every((item) => item.lane_id === null);
  }, [data]);

  return (
    <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Diagnostics lane analytics</h3>
          <p className="mt-1 text-sm text-slate-500">Kiểm tra nhanh stream thật đã ghi trajectory, thống kê làn và event hay chưa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={fetchDiagnostics} disabled={loading} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {loading ? "Đang tải" : "Làm mới"}
          </button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {data && data.trajectory.rows_last_5_minutes === 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Chưa thấy trajectory mới. Hãy kiểm tra stream đã chạy chưa hoặc camera_id có khớp không.</div>
      )}
      {data && laneAllNull && (
        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">Trajectory đã có nhưng chưa gán được lane_id. Kiểm tra lane polygon, frame size và camera_id.</div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Lane config" value={data ? (data.has_lane_config ? `${data.lane_config_count} làn` : "Chưa có") : "--"} />
        <Metric label="Tổng trajectory" value={data?.trajectory.total_rows ?? "--"} />
        <Metric label="Rows 1 phút" value={data?.trajectory.rows_last_1_minute ?? "--"} />
        <Metric label="Rows 5 phút" value={data?.trajectory.rows_last_5_minutes ?? "--"} />
        <Metric label="Unique tracks 5 phút" value={data?.trajectory.unique_tracks_last_5_minutes ?? "--"} />
        <Metric label="Latest trajectory" value={formatTime(data?.trajectory.latest_timestamp || null)} />
        <Metric label="Cut-in total" value={data?.events.cut_in_total ?? "--"} />
        <Metric label="Cut-in 5 phút" value={data?.events.cut_in_last_5_minutes ?? "--"} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Lane ID</th>
              <th className="px-4 py-3 font-semibold">Rows 5 phút</th>
              <th className="px-4 py-3 font-semibold">Unique tracks</th>
            </tr>
          </thead>
          <tbody>
            {data && data.trajectory.lane_distribution_last_5_minutes.length > 0 ? data.trajectory.lane_distribution_last_5_minutes.map((item) => (
              <tr key={item.lane_id || "null-lane"} className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-800">{item.lane_id || "null"}</td>
                <td className="px-4 py-3">{item.rows}</td>
                <td className="px-4 py-3">{item.unique_tracks}</td>
              </tr>
            )) : (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">Chưa có lane distribution trong 5 phút gần nhất.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.notes && data.notes.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          {data.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}
