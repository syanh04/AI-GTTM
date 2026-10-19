import asyncio
import os
import time
from datetime import datetime
from typing import Any, Dict, Optional

import cv2
import numpy as np
from fastapi import WebSocket
from sqlalchemy.orm import Session

try:
    from .database import get_db
    from .inference import PROCESSED_DIR, PROCESSED_CROPS_DIR, UPLOADS_DIR, run_alpr_on_frame
except ImportError:
    from database import get_db
    from inference import PROCESSED_DIR, PROCESSED_CROPS_DIR, UPLOADS_DIR, run_alpr_on_frame


os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(PROCESSED_CROPS_DIR, exist_ok=True)


async def _open_video_source(config: Dict[str, Any]) -> cv2.VideoCapture:
    source_type = config.get("source", "webcam")
    if source_type == "video":
        requested_path = str(config.get("path") or "")
        safe_name = os.path.basename(requested_path)
        if not safe_name or safe_name != requested_path:
            raise ValueError("Missing 'path' for video source.")
        path = os.path.abspath(os.path.join(UPLOADS_DIR, safe_name))
        if os.path.commonpath((os.path.abspath(UPLOADS_DIR), path)) != os.path.abspath(UPLOADS_DIR):
            raise ValueError("Invalid video path.")
        cap = cv2.VideoCapture(path)
    else:
        # Default to first webcam
        cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        raise RuntimeError("Cannot open video source.")
    return cap


async def websocket_stream_handler(websocket: WebSocket) -> None:
    """
    Handle WebSocket connection for real-time ALPR streaming.

    Protocol:
    - Client sends initial JSON:
        {"source": "webcam"}
      or
        {"source": "video", "path": "my_video.mp4", "imgsz": 1280}
    - Server then streams messages:
        {
          "type": "frame",
          "frame_index": int,
          "timestamp": str,
          "frame_b64": str,
          "results": [...]
        }
    - Client can send control messages:
        {"type": "update_quality", "imgsz": 640}
    - On error, server sends:
        {"type": "error", "message": "..."}
    """
    await websocket.accept()

    # First message must define source
    try:
        config = await websocket.receive_json()
    except Exception:
        await websocket.send_json(
            {"type": "error", "message": "Invalid initial configuration message."}
        )
        await websocket.close()
        return

    try:
        cap = await _open_video_source(config)
    except Exception as exc:
        await websocket.send_json(
            {"type": "error", "message": f"Failed to open source: {exc}"}
        )
        await websocket.close()
        return

    # Lấy FPS gốc của video để đồng bộ tốc độ phát
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    if video_fps <= 0:
        video_fps = 30.0  # Default fallback
    
    target_frame_time = 1.0 / video_fps  # Thời gian mỗi frame (giây)
    
    # Lấy imgsz từ config (mặc định 1280 cho cân bằng giữa chất lượng và hiệu suất)
    imgsz = config.get("imgsz", 1280)
    
    # Kiểm tra xem có phải video file không (để loop)
    is_video_file = config.get("source") == "video"
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if is_video_file else 0

    frame_index = 0
    try:
        # Create a dedicated DB session for this connection
        db_gen = get_db()
        db: Optional[Session] = next(db_gen)
    except Exception:
        db = None
        db_gen = None

    try:
        while True:
            loop_start_time = time.perf_counter()
            
            # Kiểm tra control messages từ client (non-blocking)
            try:
                message = await asyncio.wait_for(
                    websocket.receive_json(), 
                    timeout=0.001
                )
                
                # Xử lý control messages
                if message.get("type") == "update_quality":
                    new_imgsz = message.get("imgsz", 1280)
                    if new_imgsz in [640, 1280, 1920]:
                        imgsz = new_imgsz
                        await websocket.send_json({
                            "type": "info",
                            "message": f"Quality updated to {imgsz}px"
                        })
                elif message.get("type") == "stop":
                    break
            except asyncio.TimeoutError:
                # Không có message từ client, tiếp tục stream
                pass
            except Exception:
                # Client có thể đã disconnect
                break

            ret, frame = cap.read()
            
            # Nếu video kết thúc, loop lại từ đầu
            if not ret and is_video_file:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                frame_index = 0
                ret, frame = cap.read()
            
            if not ret:
                await websocket.send_json(
                    {"type": "end", "message": "Video source exhausted."}
                )
                break

            if not isinstance(frame, np.ndarray):
                continue

            # Resize frame nếu cần (để tiết kiệm VRAM và băng thông)
            h, w = frame.shape[:2]
            if max(h, w) > imgsz:
                scale = imgsz / max(h, w)
                new_w = int(w * scale)
                new_h = int(h * scale)
                frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

            prefix = f"ws_f{frame_index}"
            alpr_out = run_alpr_on_frame(frame, save_prefix=prefix, db=db, imgsz=imgsz)

            payload = {
                "type": "frame",
                "frame_index": frame_index,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "frame_b64": alpr_out.get("frame_b64"),
                "results": alpr_out.get("results", []),
                "fps": video_fps,
                "imgsz": imgsz,
            }

            await websocket.send_json(payload)
            frame_index += 1

            # Tính toán delay chính xác để đồng bộ với FPS gốc
            elapsed = time.perf_counter() - loop_start_time
            sleep_time = max(0, target_frame_time - elapsed)
            
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)
                
    except Exception as exc:
        await websocket.send_json(
            {"type": "error", "message": f"Streaming error: {exc}"}
        )
    finally:
        cap.release()
        if db is not None and db_gen is not None:
            try:
                next(db_gen, None)
            except StopIteration:
                pass
        await websocket.close()
