# AI Model Weights & Artifacts Directory

This directory hosts the deep learning weights utilized by the **AI-GTTM** cascade inference pipeline.

## Model Hierarchy & Specifications

| Model Stage | Architecture | Checkpoint Filename | Framework | Target Resolution | Precision |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Stage 1: Vehicle Detection & Tracking** | YOLOv12s / YOLOv8s | `vehicle_yolo12s_640.pt` | PyTorch / Ultralytics | 640x640 | FP16 / INT8 |
| **Stage 2: Plate Localization** | YOLOv9s Custom LP | `plate_yolov9s_640_2025.pt` | PyTorch / Ultralytics | 640x640 | FP16 |
| **Stage 3: Vietnamese Plate OCR** | PP-OCRv5 Fine-tuned | `ppocrv5_vn_plate_infer/` | PaddlePaddle / ONNX | Adaptive (48x320) | FP32 / FP16 |

---

## 🔒 Intellectual Property & Enterprise Notice

> **Notice to Evaluators & Recruiters:**  
> In compliance with intellectual property guidelines and academic non-disclosure policies, **proprietary pre-trained weights (`*.pt`, `*.pdparams`, `*.onnx`) are withheld from this public repository**.
>
> When launched without physical weight files, the system automatically runs in **Showcase Simulation Mode**, providing realistic telemetry, detection bounding boxes, and recognition payloads so all frontend views, API endpoints, and dashboards operate smoothly out-of-the-box.
>
> For full weights access, enterprise pilot evaluation, or technology transfer inquiries, please contact the author directly.
