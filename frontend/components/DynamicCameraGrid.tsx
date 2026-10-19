"use client"

import { useState, useCallback } from "react"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core"
import {
  useGridLayout,
  GRID_CONFIGS,
  GridLayout,
} from "@/hooks/useGridLayout"

// ── Draggable Camera Item ──
function DraggableCameraItem({
  cameraId,
  label,
}: {
  cameraId: string
  label: string
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: cameraId,
  })

  const style = transform ? {
    transform: `translate(${transform.x}px, ${transform.y}px)`,
  } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-300 cursor-grab active:cursor-grabbing text-sm text-gray-700 hover:bg-gray-100 hover:border-blue-500 transition-all select-none ${isDragging ? "opacity-50" : ""}`}
    >
      <span className="text-blue-400">📷</span>
      <span className="font-medium">{label}</span>
      <span className="text-xs text-gray-400 ml-auto">Kéo →</span>
    </div>
  )
}

// ── Droppable Camera Slot ──
function DroppableCameraSlot({
  slotId,
  assignedCamera,
  streamSrc,
  onRemove,
  onUpload,
  onStreamError,
}: {
  slotId: string
  assignedCamera: string | null
  streamSrc: string | null
  onRemove: (slotId: string) => void
  onUpload: (slotId: string, file: File) => void
  onStreamError?: (cameraId: string) => void
}) {
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({ id: slotId })
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    transform,
    isDragging,
  } = useDraggable({
    id: assignedCamera ? `cam:${assignedCamera}:${slotId}` : `empty:${slotId}`,
    disabled: !assignedCamera,
  })

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUpload(slotId, file)
  }

  const dragStyle = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        zIndex: 50,
      }
    : undefined

  return (
    <div
      ref={setDroppableRef}
      style={dragStyle}
      className={`relative aspect-video rounded-xl border-2 transition-all overflow-hidden ${
        isOver
          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-300 scale-[1.01]"
          : assignedCamera
          ? "border-gray-300 bg-gray-50"
          : "border-dashed border-gray-300 bg-white"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      {assignedCamera && streamSrc ? (
        <>
          {/* Stream video */}
          <img
            src={streamSrc}
            alt={assignedCamera}
            className="w-full h-full object-cover"
            onError={() => onStreamError?.(assignedCamera)}
          />
          {/* Label + Drag Handle */}
          <div
            ref={setDraggableRef}
            {...listeners}
            {...attributes}
            title="Kéo để đổi vị trí camera"
            className="absolute top-2 left-2 bg-black/75 hover:bg-black/90 text-white text-xs px-2.5 py-1 rounded-md backdrop-blur-sm flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none shadow"
          >
            <span className="text-blue-400">📷</span>
            <span className="font-semibold">{assignedCamera}</span>
            <span className="text-[10px] text-gray-300">⋮⋮</span>
          </div>
          {/* Nút xóa */}
          <button
            onClick={() => onRemove(slotId)}
            className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow"
          >
            ✕
          </button>
        </>
      ) : assignedCamera ? (
        <>
          {/* Camera assigned nhưng chưa có stream */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="text-4xl">📷</span>
            <p className="text-gray-400 text-xs">{assignedCamera}</p>
            <label className="cursor-pointer text-xs text-blue-400 hover:text-blue-300 border border-blue-700 hover:border-blue-500 px-3 py-1.5 rounded-lg transition-colors">
              Tải video lên
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileInput}
              />
            </label>
          </div>
          <button
            onClick={() => onRemove(slotId)}
            className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center"
          >
            ✕
          </button>
        </>
      ) : (
        /* Ô trống */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          {isOver ? (
            <>
              <span className="text-4xl animate-pulse">📥</span>
              <p className="text-blue-400 text-xs font-medium">Thả vào đây</p>
            </>
          ) : (
            <>
              <span className="text-3xl text-gray-400">+</span>
              <p className="text-gray-400 text-xs xl:text-sm">Kéo camera vào đây</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ──
interface DynamicCameraGridProps {
  cameras: { id: string; name: string }[]
  cameraFrames: Record<string, string | null>
  onUpload: (cameraId: string, file: File) => void
  onStreamError?: (cameraId: string) => void
}

export default function DynamicCameraGrid({
  cameras,
  cameraFrames,
  onUpload,
  onStreamError,
}: DynamicCameraGridProps) {
  const { layout, setLayout, config, slots } = useGridLayout()

  // Map: slotId → cameraId (Tự động đưa CAM 01..CAM 06 vào các slot)
  const [slotMap, setSlotMap] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {}
    const defaultIds = ['CAM_01', 'CAM_02', 'CAM_03', 'CAM_04', 'CAM_05', 'CAM_06']
    slots.forEach((s, idx) => {
      initial[s] = cameras[idx]?.id || defaultIds[idx] || null
    })
    return initial
  })

  const [activeId, setActiveId] = useState<string | null>(null)

  // Tự động gán camera vào slot nếu chưa gán
  useState(() => {
    const assignedCount = Object.values(slotMap).filter(Boolean).length
    if (assignedCount === 0 && (cameras.length > 0 || slots.length > 0)) {
      const defaultIds = ['CAM_01', 'CAM_02', 'CAM_03', 'CAM_04', 'CAM_05', 'CAM_06']
      const next: Record<string, string | null> = {}
      slots.forEach((s, idx) => {
        next[s] = cameras[idx]?.id || defaultIds[idx] || null
      })
      setSlotMap(next)
    }
  })

  // Giữ camera khi đổi layout, lấp đầy slot mới nếu có
  const handleLayoutChange = (newLayout: GridLayout) => {
    setLayout(newLayout)
    const newConfig = GRID_CONFIGS[newLayout]
    const newSlots = Array.from({ length: newConfig.total }, (_, i) => `slot-${i}`)
    const assignedSet = new Set<string>()
    const nextMap: Record<string, string | null> = {}

    newSlots.forEach((slotId, index) => {
      if (slotMap[slotId] && !assignedSet.has(slotMap[slotId]!)) {
        nextMap[slotId] = slotMap[slotId]
        assignedSet.add(slotMap[slotId]!)
      } else {
        const nextCam = cameras.find(c => !assignedSet.has(c.id))
        if (nextCam) {
          nextMap[slotId] = nextCam.id
          assignedSet.add(nextCam.id)
        } else {
          nextMap[slotId] = null
        }
      }
    })
    setSlotMap(nextMap)
  }

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null)
    if (!over) return

    const rawActiveId = active.id as string
    const targetSlotId = over.id as string

    // Kiểm tra slot hợp lệ
    if (!targetSlotId.startsWith("slot-")) return

    const newMap = { ...slotMap }

    // Case 1: Kéo từ một slot khác (id: "cam:CAM_01:slot-0")
    if (rawActiveId.startsWith("cam:")) {
      const parts = rawActiveId.split(":")
      const draggedCamId = parts[1]
      const sourceSlotId = parts[2]

      if (sourceSlotId === targetSlotId) return

      // Đổi chỗ (swap) giữa 2 ô
      const targetCamId = newMap[targetSlotId] || null
      newMap[sourceSlotId] = targetCamId
      newMap[targetSlotId] = draggedCamId
      setSlotMap(newMap)
      return
    }

    // Case 2: Kéo từ danh sách bên trái (id: "CAM_01")
    const cameraId = rawActiveId
    // Xóa camera khỏi slot cũ nếu từng có
    Object.keys(newMap).forEach(k => {
      if (newMap[k] === cameraId) newMap[k] = null
    })
    // Gán vào slot mới
    newMap[targetSlotId] = cameraId
    setSlotMap(newMap)
  }

  const handleRemove = (slotId: string) => {
    setSlotMap(prev => ({ ...prev, [slotId]: null }))
  }

  const handleUpload = (slotId: string, file: File) => {
    const cameraId = slotMap[slotId]
    if (cameraId) {
      onUpload(cameraId, file)
    }
  }

  // Fallback stream source nếu chưa có trong cameraFrames
  const getStreamSrc = (camId: string | null) => {
    if (!camId) return null
    if (cameraFrames[camId]) return cameraFrames[camId]
    const origin =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? `${window.location.protocol}//${window.location.hostname}:8000`
        : ""
    return `${origin}/video_feed/${camId.toLowerCase()}`
  }

  // Camera chưa được gán vào slot
  const assignedCameras = new Set(Object.values(slotMap).filter(Boolean))
  const availableCameras = cameras.filter(c => !assignedCameras.has(c.id))

  const activeCameraId = activeId?.startsWith("cam:")
    ? activeId.split(":")[1]
    : activeId
  const activeCamera = activeCameraId ? cameras.find(c => c.id === activeCameraId) : null

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 lg:gap-3 flex-wrap">
        <span className="text-sm text-gray-600 font-medium">Layout:</span>
        <select
          value={layout}
          onChange={e => handleLayoutChange(e.target.value as GridLayout)}
          className="bg-white text-gray-700 text-xs lg:text-sm rounded-lg px-2 py-1 lg:px-3 lg:py-1.5 border border-gray-300 focus:border-blue-500 focus:outline-none cursor-pointer shadow-sm"
        >
          {Object.entries(GRID_CONFIGS).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500 font-medium">
          {Object.values(slotMap).filter(Boolean).length}/{config.total} camera đang hiển thị
        </span>
      </div>

      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 flex-1">
          {/* Camera List Sidebar */}
          <div className="w-32 lg:w-36 xl:w-40 2xl:w-48 flex-shrink-0">
            <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">
              Danh sách camera
            </p>
            <div className="flex flex-col gap-2">
              {availableCameras.length === 0 ? (
                <p className="text-xs text-gray-500 italic text-center py-4">
                  Tất cả camera đã được gán
                </p>
              ) : (
                availableCameras.map(cam => (
                  <DraggableCameraItem key={cam.id} cameraId={cam.id} label={cam.name} />
                ))
              )}
            </div>
          </div>

          {/* Grid */}
          <div className={`flex-1 grid ${config.colClass} gap-2 lg:gap-3 xl:gap-4 content-start`}>
            {slots.map(slotId => (
              <DroppableCameraSlot
                key={slotId}
                slotId={slotId}
                assignedCamera={slotMap[slotId] || null}
                streamSrc={getStreamSrc(slotMap[slotId])}
                onRemove={handleRemove}
                onUpload={handleUpload}
                onStreamError={onStreamError}
              />
            ))}
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {(activeCamera || activeCameraId) && (
            <div className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg shadow-2xl opacity-95 flex items-center gap-2 border border-blue-400">
              📷 {activeCamera?.name || activeCameraId}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
