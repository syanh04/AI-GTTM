export type DashboardLayoutMode = 'legacy' | 'v2';

export const DASHBOARD_LAYOUT_MODE: DashboardLayoutMode =
  process.env.NEXT_PUBLIC_DASHBOARD_LAYOUT === 'legacy' ? 'legacy' : 'v2';
