'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Trash2, Plus } from 'lucide-react';

interface ViolationArea {
  id: string;
  type: 'stop-line' | 'turn-zone';
  name: string;
  coordinates: string;
}

interface ViolationAreaConfigProps {
  selectedCamera: string;
}

export default function ViolationAreaConfig({ selectedCamera }: ViolationAreaConfigProps) {
  const [areas, setAreas] = useState<ViolationArea[]>([
    {
      id: '1',
      type: 'stop-line',
      name: 'Vạch Dừng Chính',
      coordinates: '[(100, 250), (400, 250)]',
    },
    {
      id: '2',
      type: 'turn-zone',
      name: 'Vùng Rẽ Phải',
      coordinates: '[(400, 200), (450, 200), (450, 300), (400, 300)]',
    },
  ]);
  const [drawMode, setDrawMode] = useState<'stop-line' | 'turn-zone' | null>(null);

  const addArea = (type: 'stop-line' | 'turn-zone') => {
    setDrawMode(type);
  };

  const removeArea = (id: string) => {
    setAreas(areas.filter((area) => area.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Canvas Area */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Vùng Cấu Hình ({selectedCamera})</h3>

        {/* Canvas */}
        <div className="relative w-full bg-black rounded-lg overflow-hidden aspect-video mb-4 border border-border">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-white/40">
              <p className="text-sm">Nhấp chuột để vẽ vạch dừng hoặc vùng rẽ phải</p>
              {drawMode && (
                <p className="text-xs mt-2 text-primary">
                  Chế độ: {drawMode === 'stop-line' ? 'Vạch Dừng' : 'Vùng Rẽ Phải'}
                </p>
              )}
            </div>
          </div>

          {/* Sample Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {/* Stop Line */}
            <line
              x1="100"
              y1="250"
              x2="400"
              y2="250"
              stroke="rgb(255, 200, 0)"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
            {/* Turn Zone */}
            <rect
              x="400"
              y="200"
              width="50"
              height="100"
              fill="rgba(255, 100, 100, 0.2)"
              stroke="rgb(255, 100, 100)"
              strokeWidth="2"
            />
          </svg>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => addArea('stop-line')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              drawMode === 'stop-line'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            <Plus className="w-4 h-4" />
            Vẽ Vạch Dừng
          </button>
          <button
            onClick={() => addArea('turn-zone')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              drawMode === 'turn-zone'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            <Plus className="w-4 h-4" />
            Vẽ Vùng Rẽ Phải
          </button>
          {drawMode && (
            <button
              onClick={() => setDrawMode(null)}
              className="px-4 py-2 rounded-lg font-medium transition-colors bg-muted hover:bg-muted/80"
            >
              Hủy
            </button>
          )}
        </div>
      </Card>

      {/* Areas List */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Danh Sách Vùng Vi Phạm</h3>
        <div className="space-y-3">
          {areas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Chưa có vùng vi phạm nào được cấu hình
            </p>
          ) : (
            areas.map((area) => (
              <div
                key={area.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded ${
                        area.type === 'stop-line'
                          ? 'bg-vehicle-motorcycle'
                          : 'bg-violation-red'
                      }`}
                    ></div>
                    <div>
                      <h4 className="font-medium text-sm">{area.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {area.type === 'stop-line' ? 'Vạch Dừng' : 'Vùng Rẽ Phải'} • {area.coordinates}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeArea(area.id)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors text-violation-red"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
