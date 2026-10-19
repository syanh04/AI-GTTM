# Drawing System User Guide

## Overview
The Drawing Canvas in Tab 1 ("Cấu Hình Vùng Vi Phạm") allows operators to define violation zones on camera feeds using two types of shapes:

1. **Vạch Dừng** (Stop Line) - Red line marking stopping boundaries
2. **Vùng Rẽ Phải** (Right-Turn Zone) - Yellow polygon for prohibited turn areas

---

## VẠCH DỪNG (STOP LINE) - TWO-CLICK METHOD

### How to Draw
1. **Click the "Vạch Dừng" button** in the top toolbar
   - Button becomes disabled (grayed out)
   - Canvas cursor changes to crosshair
   
2. **First Click** on the canvas at your desired starting point
   - A red dot appears marking the start
   - A dashed red line follows your mouse as you move
   
3. **Second Click** at your desired end point
   - The stop line is created and saved to the list below
   - Drawing mode automatically exits
   - The line is now part of the configuration

### Visual Appearance
- **Color**: Neon Red (`#FF1744`)
- **Width**: 4px line with rounded caps
- **Point Markers**: 5px red circles at each endpoint
- **Live Preview**: Dashed line while moving mouse

### Example Use Case
"Vạch dừng chính" at the traffic light position:
```
Click 1: Left side of intersection
Move mouse: See red dashed preview line
Click 2: Right side of intersection
Result: Solid red stop line saved
```

---

## VÙNG RẼ PHẢI (RIGHT-TURN ZONE) - MULTI-CLICK METHOD

### How to Draw
1. **Click the "Vùng Rẽ Phải" button** in the top toolbar
   - Button becomes disabled
   - Canvas cursor changes to crosshair
   
2. **Add Points** (Single-click multiple times)
   - Click once for Point 1
   - Click for Point 2
   - Click for Point 3
   - Click for Point 4 (at least 3 points needed)
   - Continue clicking to add more vertices
   - Dashed yellow line connects all points
   
3. **Close the Polygon** (Double-click)
   - Double-click to close the shape
   - A filled yellow polygon with border appears
   - The zone is saved to the configuration list
   - Drawing mode automatically exits

### Visual Appearance
- **Color**: Translucent Yellow (`rgba(255, 223, 0, 0.25)`)
- **Border**: `#FFDF00` solid line
- **Width**: 2px border
- **Point Markers**: 4px yellow circles
- **Fill Opacity**: 25% (semi-transparent)
- **Live Preview**: Shows polygon outline while drawing

### Example Use Case
"Vùng rẽ phải" at an intersection:
```
Click 1: Upper left corner of zone
Click 2: Upper right corner
Click 3: Lower right corner
Click 4: Lower left corner
Double-Click: Anywhere (closes polygon)
Result: Yellow polygon zone saved
```

---

## INTERFACE CONTROLS

### Drawing Mode Buttons
Located at the top of the configuration panel:

| Button | Action | Status |
|--------|--------|--------|
| Vạch Dừng | Start drawing stop line | Disabled during drawing |
| Vùng Rẽ Phải | Start drawing polygon | Disabled during drawing |
| Hủy | Cancel current drawing | Visible only during drawing |

### Instruction Panel
Below the buttons, displays:
- **For Stop Line**: "Nhấn Điểm 1 để đặt điểm đầu, sau đó nhấn Điểm 2..."
- **For Polygon**: "Nhấn để thêm các điểm. Nhấn Đôi (Double-Click) để đóng hình."
- **Point Count**: Shows "Đã thêm X điểm" during drawing

### Configuration List
Below the canvas, shows all saved zones:
- Zone name (auto-generated: "Vạch Dừng 1", "Vùng Rẽ Phải 1", etc.)
- Zone type badge
- Point count
- Delete button (trash icon)

---

## TROUBLESHOOTING

### Issue: Canvas not responding to clicks
**Solution:**
- Ensure you're not in another tab
- Check that a drawing mode is active (button appears disabled)
- Click directly on the black canvas area
- Try refreshing the page

### Issue: Preview line not showing while moving mouse
**Solution:**
- Make sure at least one point has been clicked
- Move mouse slowly over the canvas
- The dashed line should appear after first click

### Issue: Can't close the polygon
**Solution:**
- Double-click on the canvas (single-click just adds another point)
- Ensure you have at least 3 points
- Click anywhere on the canvas for double-click, not necessarily near existing points

### Issue: Drawn zone disappeared
**Solution:**
- Zones are only saved when drawing completes (second click for line, double-click for polygon)
- If you clicked "Hủy" (Cancel), the drawing is discarded
- Check the configuration list below canvas to see all saved zones

---

## TECHNICAL DETAILS

### Canvas Specifications
- **Size**: 800x400 pixels (responsive to screen size)
- **Background**: Black (`#000000`)
- **Z-Index**: 50 (above video feed)
- **Border**: 1px border with theme color

### Coordinate System
- Origin (0, 0) is top-left corner
- X increases rightward
- Y increases downward
- All coordinates stored as { x: number, y: number }

### Drawing Algorithm
- **Stop Line**: Uses Bresenham line algorithm preview
- **Polygon**: Draws line segments between consecutive points
- **Real-time**: Canvas redraws on every mouse move (60 FPS)

---

## BEST PRACTICES

1. **Accuracy First**: Take time to place points precisely
2. **Clear Zones**: Don't overlap zones unnecessarily
3. **Naming**: Use descriptive zone names for clarity
4. **Backups**: Configuration persists in session memory
5. **Testing**: Test zones on actual video feeds before deployment

---

## KEYBOARD SHORTCUTS

Currently not implemented. Possible future additions:
- `Escape` - Cancel drawing mode
- `Enter` - Confirm polygon closure
- `Ctrl+Z` - Undo last point
- `Ctrl+Shift+Z` - Redo

---

## API REFERENCE

### Zone Data Structure
```typescript
interface DrawingArea {
  id: string;                    // Unique identifier
  type: 'stop-line' | 'turn-zone'; // Zone type
  name: string;                  // Display name
  points: Array<{x: number; y: number}>; // Coordinates
}
```

### Canvas Context Methods
- `ctx.strokeStyle` - Line color
- `ctx.fillStyle` - Fill color
- `ctx.lineWidth` - Line thickness
- `ctx.beginPath()` - Start drawing path
- `ctx.moveTo(x, y)` - Move to point
- `ctx.lineTo(x, y)` - Draw line to point
- `ctx.arc(x, y, radius, 0, Math.PI * 2)` - Draw circle
- `ctx.fill()` / `ctx.stroke()` - Complete drawing

---

Last Updated: 2026-02-03
Version: 1.0
