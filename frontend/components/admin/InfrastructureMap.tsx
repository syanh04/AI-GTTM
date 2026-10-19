'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Navigation, Search, Video } from 'lucide-react';

type CameraSite = {
  id: string;
  name: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
  status: 'live' | 'inactive';
};

const text = {
  title: 'Danh s\u00e1ch v\u1ecb tr\u00ed camera',
  search: 'T\u00ecm camera, qu\u1eadn ho\u1eb7c v\u1ecb tr\u00ed...',
  mapTitle: 'B\u1ea3n \u0111\u1ed3 h\u1ea1 t\u1ea7ng camera',
  liveLabel: 'Live',
  collapse: 'Thu g\u1ecdn danh s\u00e1ch camera',
  expand: 'M\u1edf danh s\u00e1ch camera',
};

const CAMERAS: CameraSite[] = [
  {
    id: 'CAM_01',
    name: 'Camera 01 - C\u1ea7u Gi\u1ea5y',
    district: 'C\u1ea7u Gi\u1ea5y',
    address: 'Ng\u00e3 t\u01b0 Xu\u00e2n Th\u1ee7y - Tr\u1ea7n Th\u00e1i T\u00f4ng',
    lat: 21.0363,
    lng: 105.7907,
    status: 'live',
  },
  {
    id: 'CAM_02',
    name: 'Camera 02 - L\u00e1ng H\u1ea1',
    district: '\u0110\u1ed1ng \u0110a',
    address: 'Ng\u00e3 t\u01b0 L\u00e1ng H\u1ea1 - Th\u00e1i H\u00e0',
    lat: 21.0156,
    lng: 105.8149,
    status: 'live',
  },
  {
    id: 'CAM_03',
    name: 'Camera 03 - T\u00e2y H\u1ed3',
    district: 'T\u00e2y H\u1ed3',
    address: 'Ng\u00e3 t\u01b0 V\u00f5 Ch\u00ed C\u00f4ng - Xu\u00e2n La',
    lat: 21.0573,
    lng: 105.8068,
    status: 'live',
  },
  {
    id: 'CAM_04',
    name: 'Camera 04 - \u0110inh Ti\u00ean Ho\u00e0ng',
    district: 'Ho\u00e0n Ki\u1ebfm',
    address: 'Ng\u00e3 t\u01b0 \u0110inh Ti\u00ean Ho\u00e0ng - H\u00e0ng Khay',
    lat: 21.0261,
    lng: 105.8524,
    status: 'live',
  },
  {
    id: 'CAM_05',
    name: 'Camera 05 - Tr\u1ea7n H\u01b0ng \u0110\u1ea1o',
    district: 'Ho\u00e0n Ki\u1ebfm',
    address: 'Ng\u00e3 t\u01b0 Tr\u1ea7n H\u01b0ng \u0110\u1ea1o - Qu\u00e1n S\u1ee9',
    lat: 21.0227,
    lng: 105.8450,
    status: 'live',
  },
  {
    id: 'CAM_06',
    name: 'Camera 06 - Xu\u00e2n Ph\u01b0\u01a1ng',
    district: 'Nam T\u1eeb Li\u00eam',
    address: 'Ng\u00e3 t\u01b0 Xu\u00e2n Ph\u01b0\u01a1ng - Tr\u1ecbnh V\u0103n B\u00f4',
    lat: 21.0374,
    lng: 105.7447,
    status: 'live',
  },
];

const buildOsmEmbedUrl = (camera: CameraSite, zoomed: boolean) => {
  const deltaLat = zoomed ? 0.0008 : 0.003;
  const deltaLng = zoomed ? 0.0012 : 0.005;
  const bbox = [
    camera.lng - deltaLng,
    camera.lat - deltaLat,
    camera.lng + deltaLng,
    camera.lat + deltaLat,
  ].join('%2C');

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${camera.lat}%2C${camera.lng}`;
};

export default function InfrastructureMap() {
  const [cameras, setCameras] = useState<CameraSite[]>(CAMERAS);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(CAMERAS[0].id);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  React.useEffect(() => {
    fetch('/api/cameras')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.cameras?.length > 0) {
          const mapped: CameraSite[] = data.cameras.map((c: any) => ({
            id: c.id,
            name: c.name || `Camera ${c.id}`,
            district: c.district || 'Hà Nội',
            address: c.location_name || c.location || '',
            lat: typeof c.lat === 'number' && c.lat > 0 ? c.lat : 21.0285,
            lng: typeof c.lng === 'number' && c.lng > 0 ? c.lng : 105.8542,
            status: c.status === 'active' ? 'live' : 'inactive',
          }));
          setCameras(mapped);
          if (mapped.length > 0) {
            setSelectedId(mapped[0].id);
          }
        }
      })
      .catch((err) => console.error('Failed to load cameras for map:', err));
  }, []);

  const filteredCameras = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return cameras;

    return cameras.filter((camera) =>
      `${camera.id} ${camera.name} ${camera.district} ${camera.address}`.toLowerCase().includes(keyword)
    );
  }, [cameras, query]);

  const selectedCamera = useMemo(
    () => cameras.find((camera) => camera.id === selectedId) || cameras[0] || CAMERAS[0],
    [cameras, selectedId]
  );


  return (
    <div className="h-full w-full bg-slate-100 flex overflow-hidden rounded-lg border border-slate-200 shadow-sm">
      <aside
        className={`relative bg-white border-r border-slate-200 shadow-sm flex flex-col transition-all duration-300 h-full ${
          isListCollapsed ? 'w-12' : 'w-[360px]'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsListCollapsed((value) => !value)}
          className="absolute -right-4 top-5 z-20 h-8 w-8 rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 flex items-center justify-center"
          title={isListCollapsed ? text.expand : text.collapse}
        >
          {isListCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {!isListCollapsed && (
          <>
            <div className="px-5 py-5 border-b border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold tracking-wide text-slate-900 uppercase">{text.title}</h2>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={text.search}
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredCameras.map((camera) => {
                const isSelected = camera.id === selectedCamera.id;
                return (
                  <div
                    key={camera.id}
                    onClick={() => {
                      setSelectedId(camera.id);
                      setIsZoomedIn(false);
                    }}
                    className={`w-full text-left px-5 py-4 border-b border-slate-100 transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50/50 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)]' : 'hover:bg-slate-50/80 border-l-0'
                    }`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedId(camera.id);
                        setIsZoomedIn(false);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900">{camera.name}</div>
                        <div className="flex items-center gap-1 mt-2 text-sm text-slate-500">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{camera.district}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">{camera.id}</span>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                            <Video className="w-3.5 h-3.5" />
                            {text.liveLabel}
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsZoomedIn((prev) => !prev);
                          }}
                          className={`p-1 rounded transition-colors mt-1 ${
                            isZoomedIn ? 'bg-blue-600 text-white hover:bg-blue-700' : 'hover:bg-blue-100 text-blue-600'
                          }`}
                          title={isZoomedIn ? 'Xem khoảng cách mặc định' : 'Phóng to cận cảnh camera'}
                        >
                          <Navigation className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </aside>

      <main className="relative flex-1 h-full w-full bg-slate-200">
        <iframe
          key={`${selectedCamera.id}-${isZoomedIn}`}
          title={text.mapTitle}
          src={buildOsmEmbedUrl(selectedCamera, isZoomedIn)}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
        />
      </main>
    </div>
  );
}
