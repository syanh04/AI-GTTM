"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

const API_BASE = "";
type CutInEvent = {
  id: number;
  event_type: string;
  vehicle_id: number;
  affected_vehicle_id: number | null;
  from_lane: string | null;
  to_lane: string | null;
  risk_level: string | null;
  risk_score: number | null;
  pixel_ttc_estimate: number | null;
  gap_px: number | null;
  timestamp: string | null;
};

type CutInResponse = {
  camera_id: string;
  calibrated: boolean;
  risk_unit_note: string;
  items: CutInEvent[];
};

interface CutInEventListProps {
  cameraId: string;
}

export default function CutInEventList({ cameraId }: CutInEventListProps) {
  const [riskLevel, setRiskLevel] = useState("");
  const [limit, setLimit] = useState(100);
  const [data, setData] = useState<CutInResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchEvents = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ camera_id: cameraId, limit: String(limit) });
      if (riskLevel) params.set("risk_level", riskLevel);
      const response = await fetch(`${API_BASE}/api/analytics/cut-in-events?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Không tải được cảnh báo chen làn");
      }
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được cảnh báo chen làn");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = window.setInterval(fetchEvents, 5000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, riskLevel, limit]);

  const riskLabel = (risk: string | null) => risk === "danger" ? "Nguy hiểm" : "Cảnh báo";

  return (
    <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Cảnh báo chen làn / tạt đầu</h3>
          <p className="mt-1 text-sm text-slate-500">{data?.risk_unit_note || "pixel_ttc_estimate là ước tính theo pixel, chưa phải TTC vật lý nếu chưa calibration."}</p>
        </div>
        <button type="button" onClick={fetchEvents} disabled={loading} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {loading ? "Đang tải" : "Cập nhật"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <select value={riskLevel} onChange={(event) => setRiskLevel(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
          <option value="">Tất cả mức</option>
          <option value="warning">Cảnh báo</option>
          <option value="danger">Nguy hiểm</option>
        </select>
        <input type="number" min={1} max={500} value={limit} onChange={(event) => setLimit(Number(event.target.value) || 100)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      </div>

      {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Thời gian</th>
              <th className="px-4 py-3 font-semibold">Xe</th>
              <th className="px-4 py-3 font-semibold">Xe bị ảnh hưởng</th>
              <th className="px-4 py-3 font-semibold">Từ làn</th>
              <th className="px-4 py-3 font-semibold">Sang làn</th>
              <th className="px-4 py-3 font-semibold">Mức</th>
              <th className="px-4 py-3 font-semibold">Risk</th>
              <th className="px-4 py-3 font-semibold">Pixel TTC</th>
              <th className="px-4 py-3 font-semibold">Gap px</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Đang tải cảnh báo...</td></tr>
            ) : data && data.items.length > 0 ? data.items.map((event) => (
              <tr key={event.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{event.timestamp ? new Date(event.timestamp).toLocaleString("vi-VN") : "--"}</td>
                <td className="px-4 py-3 font-semibold">#{event.vehicle_id}</td>
                <td className="px-4 py-3">{event.affected_vehicle_id ? `#${event.affected_vehicle_id}` : "--"}</td>
                <td className="px-4 py-3">{event.from_lane || "--"}</td>
                <td className="px-4 py-3">{event.to_lane || "--"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${event.risk_level === "danger" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{riskLabel(event.risk_level)}</span>
                </td>
                <td className="px-4 py-3">{event.risk_score ?? "--"}</td>
                <td className="px-4 py-3">{event.pixel_ttc_estimate ?? "--"}</td>
                <td className="px-4 py-3">{event.gap_px ?? "--"}</td>
              </tr>
            )) : (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Chưa có cảnh báo. Hãy chạy stream video/camera để hệ thống ghi trajectory trước.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
