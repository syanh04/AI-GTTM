"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

const API_BASE = "";

type LaneStat = {
  lane_id: string | null;
  total_vehicles: number;
  vehicles_per_minute: number;
  density: number;
  avg_speed_px_s: number | null;
  avg_speed_m_s: number | null;
};

type LaneStatsResponse = {
  camera_id: string;
  start: string;
  end: string;
  calibrated: boolean;
  speed_unit: string;
  unit_note?: string;
  items: LaneStat[];
  timeline: Record<string, number | string>[];
};

interface LaneStatsTableProps {
  selectedDate: string;
  cameraId: string;
}

const dateTimeValue = (date: string, end = false) => `${date}T${end ? "23:59" : "00:00"}`;
const toIso = (value: string) => (value ? new Date(value).toISOString() : "");

export default function LaneStatsTable({ selectedDate, cameraId }: LaneStatsTableProps) {
  const [start, setStart] = useState(dateTimeValue(selectedDate));
  const [end, setEnd] = useState(dateTimeValue(selectedDate, true));
  const [laneId, setLaneId] = useState("");
  const [className, setClassName] = useState("");
  const [bucketSeconds, setBucketSeconds] = useState(60);
  const [data, setData] = useState<LaneStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStart(dateTimeValue(selectedDate));
    setEnd(dateTimeValue(selectedDate, true));
  }, [selectedDate]);

  const fetchStats = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        camera_id: cameraId,
        start: toIso(start),
        end: toIso(end),
        bucket_seconds: String(bucketSeconds),
      });
      if (laneId) params.set("lane_id", laneId);
      if (className) params.set("class_name", className);
      const response = await fetch(`${API_BASE}/api/analytics/lane-stats?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Không tải được thống kê làn");
      }
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được thống kê làn");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, selectedDate]);

  return (
    <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Thống kê lưu lượng theo làn</h3>
          <p className="mt-1 text-sm text-slate-500">Dữ liệu lấy từ API lane-stats. Density là mật độ tương đối khi chưa calibration.</p>
        </div>
        <button type="button" onClick={fetchStats} disabled={loading} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {loading ? "Đang tải" : "Cập nhật"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm xl:col-span-2" />
        <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm xl:col-span-2" />
        <input type="number" min={30} value={bucketSeconds} onChange={(event) => setBucketSeconds(Number(event.target.value) || 60)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
        <input value={laneId} onChange={(event) => setLaneId(event.target.value)} placeholder="lane_id" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
        <input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="class_name" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      </div>

      {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Làn</th>
              <th className="px-4 py-3 font-semibold">Tổng xe</th>
              <th className="px-4 py-3 font-semibold">Xe/phút</th>
              <th className="px-4 py-3 font-semibold">Mật độ</th>
              <th className="px-4 py-3 font-semibold">Tốc độ px/s</th>
              <th className="px-4 py-3 font-semibold">Tốc độ m/s</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Đang tải thống kê...</td></tr>
            ) : data && data.items.length > 0 ? data.items.map((item) => (
              <tr key={item.lane_id || "unknown"} className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-800">{item.lane_id || "Chưa gán làn"}</td>
                <td className="px-4 py-3">{item.total_vehicles}</td>
                <td className="px-4 py-3">{item.vehicles_per_minute}</td>
                <td className="px-4 py-3">{item.density}</td>
                <td className="px-4 py-3">{item.avg_speed_px_s ?? "--"}</td>
                <td className="px-4 py-3">{item.avg_speed_m_s ?? "--"}</td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Chưa có dữ liệu. Hãy chạy stream video/camera để hệ thống ghi trajectory trước.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-sm font-bold text-slate-900">Timeline bucket</h4>
        <div className="mt-3 max-h-48 overflow-auto text-xs text-slate-600">
          {data && data.timeline.length > 0 ? (
            <pre className="whitespace-pre-wrap">{JSON.stringify(data.timeline.slice(0, 12), null, 2)}</pre>
          ) : (
            <p>Chưa có timeline.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
