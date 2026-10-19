# HỆ THỐNG QUẢN LÝ GIAO THÔNG - Final Architecture

## System Overview
A comprehensive traffic management system for Hanoi featuring real-time monitoring, data analysis, traffic signal coordination, and AI-powered violation detection with enterprise administration panels.

---

## PART 1: MAIN APPLICATION (4 Business Tabs)

### Layout Structure
```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: HỆ THỐNG QUẢN LÝ GIAO THÔNG | Filter | Export    │
├──────────┬──────────────────────────────────────────────────┤
│ SIDEBAR  │                                                  │
│ (Admin   │     Main Content Area (4 Business Tabs)         │
│  Nav)    │     ┌────────────────────────────────────────┐  │
│          │     │ Giám Sát | Phân Tích | Điều Phối | AI │  │
│ Thiết Bị │     │                                        │  │
│ Vi Phạm  │     │     Tab Content (Dynamic)             │  │
│ Bản Đồ   │     │                                        │  │
│ Cấu Hình │     │                                        │  │
│ Cài Đặt  │     │                                        │  │
│          │     └────────────────────────────────────────┘  │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
│ Footer: XE ƯU TIÊN (BẬT) | 3 Cảnh Báo Hệ Thống          │
└─────────────────────────────────────────────────────────────┘
```

### Tab 1: Giám Sát (Monitoring)
**Component:** `CameraMonitoring.tsx`
- 2x3 responsive camera grid (6 total cameras)
- Live video feed with bounding boxes (color-coded by vehicle type)
- Zoom [+]/[-] controls per camera
- VỊ TRÍ LẮP ĐẶT button → opens map side-drawer
- Tab 2: Vẽ Vạch/Vùng Rẽ Phải (Drawing Canvas)
  - **Two-click method for Vạch Dừng (Stop Line):** Click 1 = start, Click 2 = end
  - **Multi-click polygon for Vùng Rẽ Phải (Right-turn Zone):** Click N times + double-click to close
  - Canvas z-index: 50 for mouse interaction
  - Red neon color (#FF1744) for stop lines, yellow for turn zones
  - AI Control Panel with detection toggles
  - Detection Log with clickable license plates (150ms latency to Tab 4)

### Tab 2: Phân Tích (Analytics)
**Component:** `AnalysisCenter.tsx`
- 6-location synchronized trend line chart with shared master tooltip
- Tooltip displays: Time, All 6 locations' traffic volumes, Violations
- Doughnut composition chart (Vehicle type breakdown)
- Global date/time filter from Header
- Statistics: Total traffic, violations, hotspots, compliance rate
- PDF/CSV export buttons

### Tab 3: Điều Phối (Coordination)
**Component:** `CoordinationCenter.tsx`
- Clean video feeds (NO detection overlays)
- Traffic light overlays at each camera corner
- Real-time countdown timers (Red/Yellow/Green status with seconds)
- AI Suggestion Panel: "Tăng +15s đèn xanh tại {Location}"
- Apply/Reject suggestion buttons
- Auto/Manual mode toggle
- Density monitoring per intersection

### Tab 4: Trợ Lý AI (AI Assistant)
**Component:** `ViolationCenter.tsx`
- Tab auto-switches when clicking license plate from Tab 1 (150ms delay)
- Evidence Card: Vehicle images + Owner info + Fine amount (500k VND)
- Action buttons: Send SMS Warning, Send Email Fine
- AI Chatbot: Context-aware assistant with 150ms latency
- Pending violation cases with clickable license plates
- Chat interface with real-time responses

---

## PART 2: ADMIN MANAGEMENT SIDEBAR

### Sidebar Navigation
**File:** `components/Sidebar.tsx`
- Collapsible vertical sidebar (Expanded: 288px, Collapsed: 80px)
- 5 admin menu items with icons and descriptions
- Smooth transitions and hover states
- "QUẢN TRỊ HỆ THỐNG" header

### 5 Admin Panels

#### 1. Thiết Bị (Device Management)
**File:** `components/admin/DeviceManagement.tsx`
- 6 Camera management table
- Columns: Name, Location, Status (🟢/🔴), IP Address, Last Heartbeat
- Online status count (5/6)
- Power control buttons per device
- Summary statistics card

#### 2. Hồ Sơ Vi Phạm (Violation History)
**File:** `components/admin/ViolationHistory.tsx`
- Violation records list (expandable cards)
- Fields: License Plate, Vehicle Type, Timestamp, Location, Violation Type, Status, Fine Amount
- Status badges: Chờ Xử Lý (Yellow), Đã Xử Lý (Blue), Đã Gửi (Green)
- Quick actions: Send SMS, Send Email
- Scrollable with max height
- Total violation count display

#### 3. Bản Đồ Hạ Tầng (Infrastructure Map)
**File:** `components/admin/InfrastructureMap.tsx`
- Large SVG map of Hanoi with 6 camera location markers
- Interactive zoom controls (10x-18x)
- Grid background + major road visualization
- Marker status: 🟢 Online, 🔴 Offline
- Camera list below map with coordinates (lat, lng)
- Legend showing status indicators

#### 4. Cấu Hình AI (AI Configuration)
**File:** `components/admin/AIConfiguration.tsx`
- Confidence threshold slider (0.0 - 1.0)
- Real-time percentage display with feedback text
- YOLOv12 (Vehicle Detection)
  - Status: 🟢 Đang Chạy / 🔴 Dừng
  - FPS: 25, Latency: 145ms
- YOLOv8 (Plate Recognition)
  - Status: 🟢 Đang Chạy / 🔴 Dừng
  - Accuracy: 98.5%, Latency: 156ms
- System Health: CPU, GPU, Memory % display
- Model toggle buttons

#### 5. Cài Đặt (System Settings)
**File:** `components/admin/SystemSettings.tsx`
- Unit Information: Organization name, Admin email, Admin phone
- Cloud Storage Options: AWS S3, Google Cloud Storage, Local Server (radio buttons)
- Account Management: Admin account, Password change, 2FA toggle
- Save Configuration button
- Success notification on save

---

## GLOBAL FILTER SYSTEM

### Header Filter
**File:** `components/GlobalFilter.tsx`
- Single unified date selector in Header top-right
- PDF/CSV export buttons
- Applies to all 4 business tabs simultaneously
- Removes duplicate internal tab filters

### Filter Integration
- Passed through `selectedDate` state from page.tsx
- Used by: CameraMonitoring, AnalysisCenter, CoordinationCenter, ViolationCenter
- Maintains consistent data view across all tabs

---

## INTERACTION FEATURES

### Canvas Drawing (Tab 1 - Drawing Tab)
- **Two-click method for Vạch Dừng:**
  1. Click point A (red dot appears)
  2. Mouse moves (red dashed line preview)
  3. Click point B (line completes)
- **Multi-click polygon for Vùng Rẽ Phải:**
  1. Click N points (yellow vertices)
  2. Double-click to close/complete polygon
- Canvas z-index: 50 for mouse interaction
- Cursor: crosshair during drawing

### Tab Switching
- Click license plate in Tab 1 Detection Log
- Auto-switch to Tab 4 with 150ms latency simulation
- Preserves violation details in Tab 4

### Toast Notifications
- Bottom-right corner alerts
- Auto-show new violation alerts every 8 seconds
- Display duration: 2-4 seconds
- Types: Success (green), Warning (yellow), Error (red)

### Loading Skeleton
- Shows during sidebar admin section transitions
- 300ms fade duration
- Animated pulsing effect
- Professional placeholder cards

---

## STYLING & THEME

### Color Palette
- **Primary:** Blue (#3B82F6 - Sky)
- **Background:** Slate-950 (#030712 - Industrial Dark)
- **Accent:** Orange/Red (#FF1744 - Violation Red)
- **Success:** Green (#22C55E)
- **Warning:** Yellow (#EAB308)
- **Neutral:** Slate grays (Muted, Border, etc.)

### Typography
- **Font Family:** Geist Sans (from next/font/google)
- **Headings:** Bold, 16-32px
- **Body:** Regular, 13-14px
- **Monospace:** Font-mono for license plates & IPs

### Components
- Shadcn/ui Cards, Tabs, Buttons, Inputs
- Tailwind CSS v4 with custom theme variables
- Responsive grids (2-column on mobile, 3-column on desktop)

---

## DATA FLOW & STATE MANAGEMENT

### Root State (page.tsx)
```
Dashboard
├── currentTab: string (camera, analysis, coordination, violations)
├── selectedDate: string (YYYY-MM-DD)
├── systemStatus: object (cpu, gpu, latency, version)
├── toasts: array (notifications)
└── Sidebar / AdminPanel (independent)
```

### Component Hierarchy
```
Dashboard
├── Header (Global filter + system status)
├── Sidebar (Admin navigation)
│   └── AdminPanel (Dynamic content panel)
│       ├── DeviceManagement
│       ├── ViolationHistory
│       ├── InfrastructureMap
│       ├── AIConfiguration
│       └── SystemSettings
└── Main Content (4 Business Tabs)
    ├── CameraMonitoring (Drawing Canvas)
    ├── AnalysisCenter (Trend charts)
    ├── CoordinationCenter (Traffic coordination)
    └── ViolationCenter (AI Assistant)
```

---

## FILE STRUCTURE

```
/app
  layout.tsx          (Root layout, metadata)
  page.tsx            (Main dashboard with 4 tabs)

/components
  Header.tsx
  Sidebar.tsx
  GlobalFilter.tsx
  Toast.tsx
  LoadingSkeleton.tsx
  CameraMonitoring.tsx
  DrawingCanvas.tsx
  CameraGrid.tsx
  MapPanel.tsx
  AnalysisCenter.tsx
  AdvancedAnalyticsChart.tsx
  CoordinationCenter.tsx
  ViolationCenter.tsx
  AdminPanel.tsx
  
  /admin
    DeviceManagement.tsx
    ViolationHistory.tsx
    InfrastructureMap.tsx
    AIConfiguration.tsx
    SystemSettings.tsx
  
  /ui (shadcn components)
    card.tsx
    tabs.tsx
    button.tsx
    etc.

/lib
  utils.ts            (Tailwind cn utility)
  
/public
  (Static assets)
```

---

## LANGUAGE & LOCALIZATION
- **100% Vietnamese UI**
- All labels, button text, descriptions in Vietnamese
- System name: "HỆ THỐNG QUẢN LÝ GIAO THÔNG"
- No English text in user interface

---

## SYSTEM STATUS DISPLAY
- **Header Footer Bar:**
  - XE ƯU TIÊN (BẬt) - Priority vehicle system status
  - 3 Cảnh Báo Hệ Thống - System warnings count
  - CPU, GPU, Latency metrics (real-time updates)
  - System version (v2.5.0)

---

## SUMMARY
This is a complete, enterprise-grade traffic management system for Hanoi featuring:
✓ Real-time camera monitoring with drawing tools
✓ Advanced data analytics with shared tooltips
✓ AI-powered traffic coordination
✓ Comprehensive violation management with chatbot
✓ Enterprise admin panels for system configuration
✓ Unified global filtering and export capabilities
✓ Slate-950 industrial dark theme with professional styling
✓ Full Vietnamese language support
