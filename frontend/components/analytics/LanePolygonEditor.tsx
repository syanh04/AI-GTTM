"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

const API_BASE = "";
const SAMPLE_LANES = [
  {
    lane_id: "lane_1",
    lane_name: "Làn 1",
    polygon: [{ x: 100, y: 200 }, { x: 300, y: 200 }, { x: 350, y: 600 }, { x: 80, y: 600 }],
    direction_vector: { x: 0, y: 1 },
    frame_width: 1280,
    frame_height: 720,
  },
];

interface LanePolygonEditorProps {
  cameraId: string;
}

export default function LanePolygonEditor({ cameraId }: LanePolygonEditorProps) {
  const [jsonText, setJsonText] = useState(JSON.stringify({ lanes: SAMPLE_LANES }, null, 2));
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/analytics/lane-config?camera_id=${encodeURIComponent(cameraId)}`);
      if (!response.ok) throw new Error("Không tải được cấu hình làn");
      const payload = await response.json();
      setJsonText(JSON.stringify({ lanes: payload.lanes || [] }, null, 2));
      setStatus("Đã tải cấu hình làn hiện tại.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được cấu hình làn");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  const validatePayload = (payload: unknown) => {
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { lanes?: unknown }).lanes)) {
      throw new Error("JSON phải có dạng { lanes: [...] }");
    }
    const lanes = (payload as { lanes: any[] }).lanes;
    lanes.forEach((lane, index) => {
      if (!lane.lane_id) throw new Error(`Lane ${index + 1} thiếu lane_id`);
      if (!Array.isArray(lane.polygon) || lane.polygon.length < 3) throw new Error(`Lane ${index + 1} cần polygon tối thiểu 3 điểm`);
      if (!lane.direction_vector || typeof lane.direction_vector.x !== "number" || typeof lane.direction_vector.y !== "number") throw new Error(`Lane ${index + 1} cần direction_vector {x,y}`);
    });
    return payload;
  };

  const saveConfig = async () => {
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const payload = validatePayload(JSON.parse(jsonText));
      const response = await fetch(`${API_BASE}/api/analytics/lane-config/${encodeURIComponent(cameraId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Không lưu được cấu hình làn");
      }
      const saved = await response.json();
      setJsonText(JSON.stringify({ lanes: saved.lanes || [] }, null, 2));
      setStatus("Đã lưu cấu hình làn xe.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được cấu hình làn");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Cấu hình làn xe</h3>
          <p className="mt-1 text-sm text-slate-500">Trình sửa JSON tạm thời cho lane polygon. Không ảnh hưởng cấu hình vùng vi phạm hiện tại.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={loadConfig} disabled={loading} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">Tải lại</button>
          <button type="button" onClick={saveConfig} disabled={loading} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Lưu</button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            Camera hiện tại
            <div className="mt-1 text-sm font-bold text-slate-900">{cameraId}</div>
          </div>
          <button type="button" onClick={() => setJsonText(JSON.stringify({ lanes: SAMPLE_LANES }, null, 2))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Dùng mẫu</button>
          <p className="text-xs text-slate-500">direction_vector là bắt buộc để detector chen làn hoạt động.</p>
        </div>
        <textarea value={jsonText} onChange={(event) => setJsonText(event.target.value)} className="min-h-[320px] rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs text-slate-100 outline-none" spellCheck={false} />
      </div>

      {status && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{status}</div>}
      {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    </Card>
  );
}
