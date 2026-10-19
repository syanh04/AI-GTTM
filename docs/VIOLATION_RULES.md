# Nghị định 168/2024/NĐ-CP Violation Engine

The **AI-GTTM Legal Verification Engine** maps real-time spatial violations directly to Vietnamese administrative traffic penalties defined in **Nghị định số 168/2024/NĐ-CP** (replacing Nghị định 100/2019/NĐ-CP & 123/2021/NĐ-CP).

## Supported Violation Types & Sanctions

| Violation Type | Vehicle Category | Legal Basis | Fine Range (VND) | Auxiliary Penalties |
| :--- | :--- | :--- | :--- | :--- |
| **Vượt đèn đỏ / Không chấp hành hiệu lệnh** | Ô tô / Xe tải | Điểm b Khoản 9 Điều 6 | 18.000.000 - 20.000.000 | Tước GPLX 2 - 4 tháng |
| **Vượt đèn đỏ / Không chấp hành hiệu lệnh** | Xe máy | Điểm c Khoản 7 Điều 7 | 4.000.000 - 6.000.000 | Tước GPLX 1 - 3 tháng |
| **Đi ngược chiều** | Ô tô / Xe tải | Điểm d Khoản 9 Điều 6 | 18.000.000 - 20.000.000 | Tước GPLX 2 - 4 tháng |
| **Đi ngược chiều** | Xe máy | Điểm a Khoản 7 Điều 7 | 4.000.000 - 6.000.000 | Tước GPLX 2 - 4 tháng |
| **Lấn làn / Sai làn đường** | Ô tô | Điểm d Khoản 5 Điều 6 | 4.000.000 - 6.000.000 | Tước GPLX 1 - 3 tháng |
| **Lấn làn / Sai làn đường** | Xe máy | Điểm a Khoản 2 Điều 7 | 400.000 - 600.000 | - |
| **Không đội mũ bảo hiểm** | Xe máy | Điểm b Khoản 3 Điều 7 | 400.000 - 600.000 | - |
| **Chạy quá tốc độ (10 - 20 km/h)** | Ô tô | Điểm i Khoản 5 Điều 6 | 4.000.000 - 6.000.000 | - |
| **Chạy quá tốc độ (10 - 20 km/h)** | Xe máy | Điểm a Khoản 4 Điều 7 | 800.000 - 1.000.000 | - |

---

## Ticket Generation & Evidentiary Export

Each detected violation automatically generates a complete evidentiary package:
1. **Timestamp & Microsecond Precision**: Synchronized with NTP server.
2. **Camera Identifier & GPS Coordinates**: Physical camera calibration context.
3. **Dual Evidence Image Pair**:
   - Wide-angle contextual frame (with vehicle trajectory & violation polygon overlay).
   - Zoomed vehicle crop & localized license plate crop.
4. **Legal Citation & Fine Computation**: Generated directly from the vehicle type and violation classification.
5. **PDF / Excel Citation Export**: Exportable for administrative sanctioning workflows.
