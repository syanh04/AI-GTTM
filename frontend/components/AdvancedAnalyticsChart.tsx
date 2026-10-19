'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ChartDataPoint {
  time: string;
  baTrier: number;
  langHa: number;
  tayHo: number;
  nguyenHue: number;
  tranHungDao: number;
  xuanPhuong: number;
}

interface MasterTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
}

const CustomMasterTooltip = ({ active, payload, label }: MasterTooltipProps) => {
  if (!active || !payload) return null;

  const locations = [
    { key: 'baTrier', name: 'Bà Triệu', unit: 'xe' },
    { key: 'langHa', name: 'Láng Hạ', unit: 'xe' },
    { key: 'tayHo', name: 'Tây Hồ', unit: 'xe' },
    { key: 'nguyenHue', name: 'Nguyễn Huệ', unit: 'xe' },
    { key: 'tranHungDao', name: 'Trần Hưng Đạo', unit: 'xe' },
    { key: 'xuanPhuong', name: 'Xuân Phương', unit: 'xe' },
  ];

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-4 min-w-80">
      <p className="font-semibold text-sm mb-3">Thời gian: {label}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-1 font-medium">Địa điểm</th>
            <th className="text-right py-1 font-medium">Ô tô</th>
            <th className="text-right py-1 font-medium">Xe máy</th>
            <th className="text-right py-1 font-medium">Xe buýt</th>
            <th className="text-right py-1 font-medium">Xe tải</th>
          </tr>
        </thead>
        <tbody>
          {payload.map((entry: any, index: number) => {
            const location = locations[index];
            if (!location) return null;

            // Lấy dữ liệu từ payload (được backend trả về với suffix _type)
            const data = entry.payload;
            const carCount = data[`${location.key}_car`] || 0;
            const motoCount = data[`${location.key}_moto`] || 0;
            const busCount = data[`${location.key}_bus`] || 0;
            const truckCount = data[`${location.key}_truck`] || 0;

            return (
              <tr key={index} className="border-b border-border/50 hover:bg-muted/50">
                <td className="py-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  {location.name}
                </td>
                <td className="text-right font-medium">{carCount}</td>
                <td className="text-right font-medium">{motoCount}</td>
                <td className="text-right font-medium">{busCount}</td>
                <td className="text-right font-medium">{truckCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

interface AdvancedAnalyticsChartProps {
  data: ChartDataPoint[];
}

export default function AdvancedAnalyticsChart({ data }: AdvancedAnalyticsChartProps) {
  const showDots = data.length <= 1;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="time" stroke="var(--color-muted-foreground)" />
        <YAxis stroke="var(--color-muted-foreground)" />
        <Tooltip content={<CustomMasterTooltip />} />
        <Legend verticalAlign="top" align="left" wrapperStyle={{ paddingBottom: 8 }} />
        <Line
          type="monotone"
          dataKey="baTrier"
          stroke="#ef4444"
          strokeWidth={2}
          dot={showDots}
          name="Bà Triệu"
        />
        <Line
          type="monotone"
          dataKey="langHa"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={showDots}
          name="Láng Hạ"
        />
        <Line
          type="monotone"
          dataKey="tayHo"
          stroke="#22c55e"
          strokeWidth={2}
          dot={showDots}
          name="Tây Hồ"
        />
        <Line
          type="monotone"
          dataKey="nguyenHue"
          stroke="#eab308"
          strokeWidth={2}
          dot={showDots}
          name="Nguyễn Huệ"
        />
        <Line
          type="monotone"
          dataKey="tranHungDao"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={showDots}
          name="Trần Hưng Đạo"
        />
        <Line
          type="monotone"
          dataKey="xuanPhuong"
          stroke="#f97316"
          strokeWidth={2}
          dot={showDots}
          name="Xuân Phương"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
