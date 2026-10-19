"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";

const API_BASE = "";
const VEHICLE_OPTIONS = [
  { value: "", label: "Tất cả xe" },
  { value: "car", label: "Ô tô" },
  { value: "moto", label: "Xe máy" },
  { value: "truck", label: "Xe tải" },
  { value: "bus", label: "Xe buýt" },
];

type HeatmapPoint = { x: number; y: number; weight: number; lane_id: string | null };
type LaneSummary = { lane_id: string | null; total_points: number };
type LaneConfig = { lane_id: string; lane_name?: string };
type HeatmapResponse = {
  camera_id: string;
  start: string;
  end: string;
  grid_size: number;
  calibrated: boolean;
  unit_note: string;
  points: HeatmapPoint[];
  lanes: LaneSummary[];
};

type CutInEvent = {
  id: number;
  from_lane: string | null;
  to_lane: string | null;
  risk_level: string | null;
  risk_score: number | null;
  pixel_ttc_estimate: number | null;
  gap_px: number | null;
  timestamp: string | null;
};

type CutInResponse = { items: CutInEvent[] };

type LaneBehavior = {
  lane_id: string;
  outgoing: number;
  incoming: number;
  danger: number;
  warning: number;
  avgRisk: number | null;
  minPixelTtc: number | null;
};

interface LaneHeatmapPanelProps {
  selectedDate: string;
  cameraId: string;
}

const dateTimeValue = (date: string, end = false) => `${date}T${end ? "23:59" : "00:00"}`;
const toIso = (value: string) => (value ? new Date(value).toISOString() : "");
const laneLabel = (laneId: string | null | undefined) => laneId || "Chưa gán làn";

const heatColor = (ratio: number) => {
  if (ratio >= 0.72) return "bg-rose-500";
  if (ratio >= 0.38) return "bg-amber-400";
  return "bg-emerald-500";
};

const heatText = (ratio: number) => {
  if (ratio >= 0.72) return "Cao";
  if (ratio >= 0.38) return "Trung bình";
  return "Thấp";
};

const pointColor = (ratio: number) => {
  if (ratio >= 0.72) return "#ef4444";
  if (ratio >= 0.38) return "#f59e0b";
  return "#10b981";
};

export default function LaneHeatmapPanel({ selectedDate, cameraId }: LaneHeatmapPanelProps) {
  const [start, setStart] = useState(dateTimeValue(selectedDate));
  const [end, setEnd] = useState(dateTimeValue(selectedDate, true));
  const [laneId, setLaneId] = useState("");
  const [className, setClassName] = useState("");
  const [gridSize, setGridSize] = useState(32);
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [cutInEvents, setCutInEvents] = useState<CutInEvent[]>([]);
  const [laneConfigs, setLaneConfigs] = useState<LaneConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStart(dateTimeValue(selectedDate));
    setEnd(dateTimeValue(selectedDate, true));
  }, [selectedDate]);

  useEffect(() => {
    let cancelled = false;
    const loadLaneConfig = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/analytics/lane-config?camera_id=${encodeURIComponent(cameraId)}`);
        if (!response.ok) throw new Error("Không tải được cấu hình làn xe");
        const payload = await response.json();
        if (!cancelled) setLaneConfigs(Array.isArray(payload.lanes) ? payload.lanes : []);
      } catch {
        if (!cancelled) setLaneConfigs([]);
      }
    };
    loadLaneConfig();
    return () => { cancelled = true; };
  }, [cameraId]);

  const fetchHeatmap = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        camera_id: cameraId,
        start: toIso(start),
        end: toIso(end),
        grid_size: String(gridSize),
      });
      if (laneId) params.set("lane_id", laneId);
      if (className) params.set("class_name", className);

      const eventParams = new URLSearchParams({ camera_id: cameraId, start: toIso(start), end: toIso(end), limit: "500" });
      const [heatmapResponse, eventsResponse] = await Promise.all([
        fetch(`${API_BASE}/api/analytics/lane-heatmap?${params.toString()}`),
        fetch(`${API_BASE}/api/analytics/cut-in-events?${eventParams.toString()}`),
      ]);

      if (!heatmapResponse.ok) {
        const payload = await heatmapResponse.json().catch(() => ({}));
        throw new Error(payload.detail || "Không tải được heatmap làn xe");
      }
      setData(await heatmapResponse.json());

      if (eventsResponse.ok) {
        const eventPayload = await eventsResponse.json() as CutInResponse;
        setCutInEvents(Array.isArray(eventPayload.items) ? eventPayload.items : []);
      } else {
        setCutInEvents([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được heatmap làn xe");
      setData(null);
      setCutInEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, selectedDate]);

  const frame = useMemo(() => {
    const points = data?.points || [];
    const maxX = Math.max(1280, ...points.map((point) => point.x));
    const maxY = Math.max(720, ...points.map((point) => point.y));
    const maxWeight = Math.max(1, ...points.map((point) => point.weight));
    return { width: maxX, height: maxY, maxWeight };
  }, [data]);

  const sortedPoints = useMemo(() => [...(data?.points || [])].sort((a, b) => b.weight - a.weight), [data]);
  const totalPoints = data?.lanes?.reduce((sum, lane) => sum + lane.total_points, 0) || 0;
  const maxLanePoints = Math.max(1, ...(data?.lanes || []).map((lane) => lane.total_points));
  const hottestLane = data?.lanes?.length ? [...data.lanes].sort((a, b) => b.total_points - a.total_points)[0] : null;
  const compactPoints = sortedPoints.slice(0, 80);

  const laneBehaviors = useMemo<LaneBehavior[]>((() => {
    const map = new Map<string, LaneBehavior & { riskSum: number; riskCount: number }>();
    const ensure = (lane: string | null) => {
      const key = laneLabel(lane);
      if (!map.has(key)) {
        map.set(key, { lane_id: key, outgoing: 0, incoming: 0, danger: 0, warning: 0, avgRisk: null, minPixelTtc: null, riskSum: 0, riskCount: 0 });
      }
      return map.get(key)!;
    };

    cutInEvents.forEach((event) => {
      const from = ensure(event.from_lane);
      const to = ensure(event.to_lane);
      from.outgoing += 1;
      to.incoming += 1;
      if (event.risk_level === "danger") from.danger += 1;
      else from.warning += 1;
      if (typeof event.risk_score === "number") {
        from.riskSum += event.risk_score;
        from.riskCount += 1;
      }
      if (typeof event.pixel_ttc_estimate === "number") {
        from.minPixelTtc = from.minPixelTtc === null ? event.pixel_ttc_estimate : Math.min(from.minPixelTtc, event.pixel_ttc_estimate);
      }
    });

    return Array.from(map.values())
      .map((item) => ({ ...item, avgRisk: item.riskCount ? Number((item.riskSum / item.riskCount).toFixed(2)) : null }))
      .sort((a, b) => (b.danger - a.danger) || ((b.outgoing + b.incoming) - (a.outgoing + a.incoming)));
  }), [cutInEvents]);

  return (
    <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Phân tích nhiệt làn & chen làn</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Dạng xem này ưu tiên đọc nhanh: làn nào đông, mức nóng bao nhiêu, và làn nào phát sinh hành vi chen làn nguy hiểm.</p>
        </div>
        <button type="button" onClick={fetchHeatmap} disabled={loading} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {loading ? "Đang tải" : "Cập nhật"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm xl:col-span-2" />
        <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm xl:col-span-2" />
        <input type="number" min={16} max={128} value={gridSize} onChange={(event) => setGridSize(Number(event.target.value) || 32)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
        <select value={laneId} onChange={(event) => setLaneId(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
          <option value="">Tất cả làn</option>
          {laneConfigs.map((lane) => <option key={lane.lane_id} value={lane.lane_id}>{lane.lane_name || lane.lane_id}</option>)}
        </select>
        <select value={className} onChange={(event) => setClassName(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
          {VEHICLE_OPTIONS.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}
        </select>
      </div>

      {laneConfigs.length === 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Chưa cấu hình làn xe. Heatmap vẫn có thể hiển thị tổng, nhưng chưa phân tích theo làn.</div>
      )}
      {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h4 className="text-base font-bold text-slate-950">Ma trận nhiệt theo làn</h4>
              <p className="mt-1 text-xs text-slate-500">Thanh ngang thể hiện tỷ trọng trajectory của từng làn trong khoảng thời gian đã chọn.</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Thấp</span>
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />Trung bình</span>
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />Cao</span>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {data?.lanes && data.lanes.length > 0 ? data.lanes.map((lane) => {
              const ratio = lane.total_points / maxLanePoints;
              const share = totalPoints ? Math.round((lane.total_points / totalPoints) * 100) : 0;
              return (
                <div key={lane.lane_id || "none"} className="grid gap-3 px-4 py-3 md:grid-cols-[150px_minmax(0,1fr)_92px_100px] md:items-center">
                  <div>
                    <div className="text-sm font-bold text-slate-900">{laneLabel(lane.lane_id)}</div>
                    <div className="text-xs text-slate-500">{lane.total_points} điểm</div>
                  </div>
                  <div className="h-8 overflow-hidden rounded-lg bg-slate-100">
                    <div className={`h-full rounded-lg ${heatColor(ratio)}`} style={{ width: `${Math.max(3, ratio * 100)}%` }} />
                  </div>
                  <div className="text-sm font-bold text-slate-900">{share}%</div>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${ratio >= 0.72 ? "bg-rose-100 text-rose-700" : ratio >= 0.38 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{heatText(ratio)}</span>
                </div>
              );
            }) : (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Chưa có dữ liệu heatmap. Hãy chạy stream video/camera trước.</div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Metric title="Tổng trajectory" value={totalPoints} note={`${data?.points.length || 0} ô grid`} />
          <Metric title="Làn nóng nhất" value={hottestLane ? laneLabel(hottestLane.lane_id) : "--"} note={hottestLane ? `${hottestLane.total_points} điểm` : "Chưa có dữ liệu"} />
          <Metric title="Sự kiện chen làn" value={cutInEvents.length} note="Trong cùng khoảng thời gian" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h4 className="text-base font-bold text-slate-950">Bản đồ điểm nóng rút gọn</h4>
            <p className="mt-1 text-xs text-slate-500">Chỉ hiển thị 80 ô nóng nhất để định vị, không dùng làm biểu đồ chính.</p>
          </div>
          <div className="relative aspect-[16/9] w-full bg-slate-50">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.16)_1px,transparent_1px)] bg-[size:12.5%_20%]" />
            {[1, 2, 3, 4].map((line) => <div key={line} className="absolute left-0 right-0 border-b border-dashed border-slate-300" style={{ top: `${line * 20}%` }} />)}
            <div className="absolute left-3 top-3 rounded-md bg-white/90 px-2 py-1 text-xs font-bold text-slate-600 shadow-sm">{cameraId}</div>
            {compactPoints.map((point, index) => {
              const ratio = point.weight / frame.maxWeight;
              const size = Math.min(18, 5 + ratio * 13);
              return (
                <span
                  key={`${point.x}-${point.y}-${point.lane_id || "none"}-${index}`}
                  title={`${laneLabel(point.lane_id)}: ${point.weight}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-white"
                  style={{
                    left: `${(point.x / frame.width) * 100}%`,
                    top: `${(point.y / frame.height) * 100}%`,
                    width: size,
                    height: size,
                    backgroundColor: pointColor(ratio),
                    opacity: 0.76,
                  }}
                />
              );
            })}
            {!loading && data && data.points.length === 0 && <div className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-slate-500">Chưa có điểm nóng.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h4 className="text-base font-bold text-slate-950">Hành vi chen làn theo làn xe</h4>
              <p className="mt-1 text-xs text-slate-500">Đọc theo làn xuất phát: làn nào hay chen ra, mức nguy hiểm và TTC pixel thấp nhất.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{cutInEvents.length} sự kiện</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Làn</th>
                  <th className="px-4 py-3 font-semibold">Chen ra</th>
                  <th className="px-4 py-3 font-semibold">Bị chen vào</th>
                  <th className="px-4 py-3 font-semibold">Nguy hiểm</th>
                  <th className="px-4 py-3 font-semibold">Risk TB</th>
                  <th className="px-4 py-3 font-semibold">TTC pixel min</th>
                </tr>
              </thead>
              <tbody>
                {laneBehaviors.length > 0 ? laneBehaviors.map((item) => (
                  <tr key={item.lane_id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-bold text-slate-900">{item.lane_id}</td>
                    <td className="px-4 py-3">{item.outgoing}</td>
                    <td className="px-4 py-3">{item.incoming}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">{item.danger}</span></td>
                    <td className="px-4 py-3">{item.avgRisk ?? "--"}</td>
                    <td className="px-4 py-3">{item.minPixelTtc ?? "--"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Chưa có event chen làn trong khoảng thời gian này.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">{data?.unit_note || "Heatmap được gom theo grid từ trajectory realtime đã lưu."}</p>
    </Card>
  );
}

function Metric({ title, value, note }: { title: string; value: React.ReactNode; note: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}
