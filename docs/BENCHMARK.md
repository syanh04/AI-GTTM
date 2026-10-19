# AI-GTTM: Benchmark & Performance Metrics

## 1. Computer Vision Cascade Accuracy

The evaluation was conducted across a diverse holdout dataset including day, twilight, and challenging night-time traffic scenarios with headlight glare.

| Pipeline Component | Metric | Target Score | Realized Evaluation | Benchmark Dataset |
| :--- | :--- | :--- | :--- | :--- |
| **Vehicle Detection** | mAP@50 | > 95.0% | **98.2%** | VN-UrbanTraffic-2025 |
| **Vehicle Detection** | Recall | > 95.0% | **97.6%** | VN-UrbanTraffic-2025 |
| **Plate Localization** | mAP@50 | > 97.0% | **98.6%** | VN-PlateHoldout |
| **OCR (1-line plates)** | Character Exact Match | > 95.0% | **97.4%** | VN-PlateHoldout (Cars/Trucks) |
| **OCR (2-line plates)** | Character Exact Match | > 94.0% | **96.2%** | VN-PlateHoldout (Motorcycles) |
| **Night-Time Recognition** | Plate Exact Match | > 90.0% | **94.8%** | VN-NightTrafficHoldout |

---

## 2. Hardware Latency & Throughput

| Platform | Hardware Specs | Stage 1 (Detection) | Stage 2 (Tracking & LP) | Stage 3 (OCR) | Total Latency | Effective FPS |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Server GPU** | NVIDIA RTX 4090 24GB | 8.2 ms | 5.1 ms | 7.4 ms | **20.7 ms** | **~48 FPS** |
| **Mid-tier GPU**| NVIDIA RTX 3060 12GB | 14.5 ms | 7.8 ms | 10.1 ms | **32.4 ms** | **~31 FPS** |
| **Edge Embedded**| NVIDIA Jetson AGX Orin | 18.0 ms | 9.2 ms | 12.8 ms | **40.0 ms** | **~25 FPS** |
| **CPU Only** | Intel Core i7-13700H | 42.0 ms | 18.5 ms | 24.5 ms | **85.0 ms** | **~12 FPS** |

*Note: Benchmarks reflect batch size = 1 with FP16 TensorRT / ONNX Runtime acceleration where applicable.*
