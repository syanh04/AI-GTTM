'use client';

import React from 'react';
import { ExternalLink, MapPin, X } from 'lucide-react';

interface Camera {
  id: string;
  name: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
}

const text = {
  title: 'V\u1ecb tr\u00ed l\u1eafp \u0111\u1eb7t',
  cameraId: 'ID Camera:',
  coordinate: 'T\u1ecda \u0111\u1ed9:',
  status: 'Tr\u1ea1ng th\u00e1i:',
  active: 'Ho\u1ea1t \u0111\u1ed9ng',
  openMap: 'M\u1edf tr\u00ean OpenStreetMap',
};

const cameraLocations: Camera[] = [
  {
    id: 'CAM_01',
    name: 'CAM 01 - C\u1ea7u Gi\u1ea5y',
    district: 'C\u1ea7u Gi\u1ea5y',
    address: 'N\u00fat giao C\u1ea7u Gi\u1ea5y - Xu\u00e2n Th\u1ee7y',
    lat: 21.0369,
    lng: 105.7904,
  },
  {
    id: 'CAM_02',
    name: 'CAM 02 - L\u00e1ng H\u1ea1',
    district: '\u0110\u1ed1ng \u0110a',
    address: 'Tr\u1ee5c L\u00e1ng H\u1ea1 - Th\u00e1i H\u00e0',
    lat: 21.0122,
    lng: 105.8257,
  },
  {
    id: 'CAM_03',
    name: 'CAM 03 - T\u00e2y H\u1ed3',
    district: 'T\u00e2y H\u1ed3',
    address: 'Khu v\u1ef1c L\u1ea1c Long Qu\u00e2n - V\u00f5 Ch\u00ed C\u00f4ng',
    lat: 21.065,
    lng: 105.818,
  },
  {
    id: 'CAM_04',
    name: 'CAM 04 - Nguy\u1ec5n Hu\u1ec7',
    district: 'Ho\u00e0n Ki\u1ebfm',
    address: 'Khu v\u1ef1c Nguy\u1ec5n Hu\u1ec7 - Ho\u00e0n Ki\u1ebfm',
    lat: 21.0285,
    lng: 105.8542,
  },
  {
    id: 'CAM_05',
    name: 'CAM 05 - Tr\u1ea7n H\u01b0ng \u0110\u1ea1o',
    district: 'Ho\u00e0n Ki\u1ebfm',
    address: 'Tr\u1ea7n H\u01b0ng \u0110\u1ea1o - Qu\u00e1n S\u1ee9',
    lat: 21.0245,
    lng: 105.85,
  },
  {
    id: 'CAM_06',
    name: 'CAM 06 - Xu\u00e2n Ph\u01b0\u01a1ng',
    district: 'Nam T\u1eeb Li\u00eam',
    address: 'Khu v\u1ef1c Xu\u00e2n Ph\u01b0\u01a1ng - M\u1ef9 \u0110\u00ecnh',
    lat: 21.037,
    lng: 105.744,
  },
];

interface MapPanelProps {
  cameraId: string;
  onClose: () => void;
}

const buildOsmEmbedUrl = (camera: Camera) => {
  const deltaLat = 0.012;
  const deltaLng = 0.018;
  const bbox = [
    camera.lng - deltaLng,
    camera.lat - deltaLat,
    camera.lng + deltaLng,
    camera.lat + deltaLat,
  ].join('%2C');

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${camera.lat}%2C${camera.lng}`;
};

const buildOsmExternalUrl = (camera: Camera) =>
  `https://www.openstreetmap.org/?mlat=${camera.lat}&mlon=${camera.lng}#map=17/${camera.lat}/${camera.lng}`;

export default function MapPanel({ cameraId, onClose }: MapPanelProps) {
  const camera = cameraLocations.find((item) => item.id === cameraId);

  if (!camera) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-card border-l border-border shadow-lg flex flex-col">
      <div className="bg-primary text-primary-foreground px-6 py-4 flex items-center justify-between border-b border-border">
        <div>
          <h3 className="text-lg font-semibold uppercase tracking-wide">{text.title}</h3>
          <p className="text-xs opacity-80 mt-1">{camera.name}</p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-primary-foreground/20 rounded transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative w-full h-[420px] bg-slate-100 overflow-hidden">
        <iframe
          title={camera.name}
          src={buildOsmEmbedUrl(camera)}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
        />
        <div className="absolute left-4 top-4 rounded-lg border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <MapPin className="w-4 h-4 text-blue-600" />
            {camera.name}
          </div>
          <div className="mt-1 text-xs text-slate-600">{camera.address}</div>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-border">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{text.cameraId}</span>
            <span className="font-medium">{camera.id}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{text.coordinate}</span>
            <span className="font-mono text-xs font-medium">
              {camera.lat.toFixed(4)}, {camera.lng.toFixed(4)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{text.status}</span>
            <span className="font-medium text-green-600">{text.active}</span>
          </div>
          <div>
            <div className="text-muted-foreground">{camera.district}</div>
            <div className="font-medium text-slate-900 mt-1">{camera.address}</div>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-border">
        <a
          href={buildOsmExternalUrl(camera)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition text-center text-sm font-medium inline-flex items-center justify-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          {text.openMap}
        </a>
      </div>
    </div>
  );
}
