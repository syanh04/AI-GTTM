import { useState } from "react"

export type GridLayout = "1x1" | "2x2" | "2x3" | "3x3"

export interface GridConfig {
  label: string
  cols: number
  rows: number
  total: number
  colClass: string
}

export const GRID_CONFIGS: Record<GridLayout, GridConfig> = {
  "1x1": {
    label: "1×1 (Toàn màn hình)",
    cols: 1, rows: 1, total: 1,
    colClass: "grid-cols-1"
  },
  "2x2": {
    label: "2×2 (4 camera)",
    cols: 2, rows: 2, total: 4,
    colClass: "grid-cols-2"
  },
  "2x3": {
    label: "2×3 (6 camera)",
    cols: 2, rows: 3, total: 6,
    colClass: "grid-cols-2"
  },
  "3x3": {
    label: "3×3 (9 camera)",
    cols: 3, rows: 3, total: 9,
    colClass: "grid-cols-3"
  },
}

export function useGridLayout() {
  const [layout, setLayout] = useState<GridLayout>("2x3")

  const config = GRID_CONFIGS[layout]

  // Tạo array các slot theo layout
  const slots = Array.from(
    { length: config.total },
    (_, i) => `slot-${i}`
  )

  return { layout, setLayout, config, slots }
}
