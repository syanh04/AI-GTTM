# Admin Panels Documentation

## Overview
The system includes a comprehensive admin management sidebar with 5 enterprise administration modules, each with specialized functionality for managing different aspects of the traffic management system.

## 1. Thiết Bị (Device Management)
**File:** `/components/admin/DeviceManagement.tsx`
- Displays 6 camera devices with real-time status monitoring
- Shows camera name, location, IP address, and last heartbeat time
- Green/Red status indicators (Active/Inactive)
- Online count display (5/6 example)
- Statistics card showing total cameras, active devices, and errors
- Device control buttons for power management

**Features:**
- Real-time status updates
- Location and IP address display
- Heartbeat monitoring
- Summary statistics

## 2. Hồ Sơ Vi Phạm (Violation History)
**File:** `/components/admin/ViolationHistory.tsx`
- Comprehensive violation record management
- Expandable violation cards with detailed information
- Fields: License Plate, Vehicle Type, Timestamp, Location, Violation Type, Fine Amount, Status
- Status badges (Pending, Processed, Sent) with color coding
- Quick action buttons (Send SMS, Send Email)
- Sortable by status, date, and fine amount
- Scrollable list with max 5 violations visible

**Features:**
- Full violation details on expand
- Color-coded status indicators
- Fine amount display in Vietnamese format
- SMS/Email action buttons
- Sortable records

## 3. Bản Đồ Hạ Tầng (Infrastructure Map)
**File:** `/components/admin/InfrastructureMap.tsx`
- Full-width SVG map showing Hanoi traffic infrastructure
- 6 camera location markers with status indicators
- Interactive zoom controls (10x-18x magnification)
- Grid background with major road visualization
- Legend showing Online/Offline status
- Camera coordinates (lat/lng) display
- Scrollable camera list with online status badges

**Features:**
- Interactive SVG map visualization
- Zoom in/out controls
- GPS coordinate display
- Road infrastructure overlay
- Status legend
- Camera location list

## 4. Cấu Hình AI (AI Configuration)
**File:** `/components/admin/AIConfiguration.tsx`
- Confidence threshold slider (0.0 - 1.0 range)
- Real-time confidence percentage display
- YOLOv12 Vehicle Detection model status
  - FPS: 25
  - Latency: 145ms
  - Status: Running/Stopped toggle
- YOLOv8 Plate Recognition model status
  - Accuracy: 98.5%
  - Latency: 156ms
  - Status: Running/Stopped toggle
- System health monitoring (CPU, GPU, Memory)

**Features:**
- Confidence threshold adjustment with feedback
- Dual model management (YOLOv12, YOLOv8)
- Real-time performance metrics
- Model status toggle buttons
- System health indicators
- Status descriptions

## 5. Cài Đặt (System Settings)
**File:** `/components/admin/SystemSettings.tsx`
- Organization information configuration
  - Unit name input
  - Admin email
  - Admin phone number
- Cloud storage selection (AWS S3, Google Cloud, Local Server)
- Account management
  - Admin account display
  - Password change button
  - Two-factor authentication toggle
- Save configuration button
- Success notification on save

**Features:**
- Organization unit settings
- Cloud storage provider selection
- Admin account management
- Security options (2FA)
- Configuration persistence
- Success feedback messages

## Integration Points

### AdminPanel Component
**File:** `/components/AdminPanel.tsx`
- Wrapper component containing navigation sidebar + content panel
- Handles section switching with 300ms fade transition
- Loading skeleton display during transitions
- Full admin interface for management tasks

### Sidebar Navigation
**File:** `/components/Sidebar.tsx`
- Simple navigation sidebar for main app
- Links to admin panel sections
- Collapsible design (expanded: 288px, collapsed: 80px)
- Section descriptions on hover/expanded view

### LoadingSkeleton
**File:** `/components/LoadingSkeleton.tsx`
- Multiple skeleton loaders for different contexts
- AdminPanel-specific LoadingSkeleton for smooth transitions
- Pulsing animation effects during content loading

## Usage

### In AdminPanel
```tsx
<AdminPanel />
```

### Section Navigation
Click any admin menu item to navigate:
1. Thiết Bị - Device management
2. Hồ Sơ Vi Phạm - Violation records
3. Bản Đồ Hạ Tầng - Infrastructure mapping
4. Cấu Hình AI - AI model configuration
5. Cài Đặt - System settings

### Loading State
The LoadingSkeleton component shows during transitions with:
- Animated skeleton placeholders
- 300ms fade duration
- Professional pulse animations

## Styling
All admin panels follow:
- Slate-950 Industrial Dark Mode theme
- Vietnamese language labels
- Consistent card-based layouts
- Color-coded status indicators
- Responsive grid layouts
- Hover states and transitions

## Data Structure

### Device
```ts
interface Device {
  id: string;
  name: string;
  location: string;
  status: 'active' | 'inactive';
  ip: string;
  lastHeartbeat: string;
}
```

### Violation Record
```ts
interface ViolationRecord {
  id: string;
  licensePlate: string;
  vehicleType: string;
  timestamp: string;
  location: string;
  violation: string;
  status: 'pending' | 'processed' | 'sent';
  fineAmount: number;
}
```

### Camera Location
```ts
interface CameraLocation {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  status: 'active' | 'inactive';
}
```
