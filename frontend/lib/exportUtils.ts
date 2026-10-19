// exportUtils.ts
// Utility functions cho CSV và PDF export
// Chỉ dùng ở client side

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 1: CSV EXPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DetectionExport {
    id: string | number;
    timestamp: string;
    class: string;
    plate_number: string;
    confidence: number;
    camera: string;
    violation_type?: string;
    is_simulated?: boolean;
    vehicle_image?: string;
    plate_image?: string;
}

export interface ViolationNoticeExport {
    id: string | number;
    licensePlate: string;
    vehicleType: string;
    violation: string;
    timestamp: string;
    camera: string;
    status?: string;
    ownerName?: string;
    ownerPhone?: string;
    ownerEmail?: string;
    ownerAddress?: string;
    vehicleImage?: string;
    plateImage?: string;
    ocrScore?: number;
    fineAmount?: string;
    fineBasis?: string;
    fineNote?: string;
}

export function exportToCSV(
    detections: DetectionExport[],
    filename?: string
): void {
    // Header cột
    const headers = [
        "STT",
        "Thoi_Gian",
        "Vehicle_ID",
        "Loai_Xe",
        "Bien_So",
        "Do_Tin_Cay",
        "Camera",
        "Vi_Pham",
        "Du_Lieu_Gia"
    ].join(",");

    // Rows
    const rows = detections.map(
        (d, index) => {
            // Escape dấu phẩy trong text
            const safe = (v: any) => {
                const s = String(v || "");
                return s.includes(",")
                    ? `"${s}"`
                    : s;
            };

            return [
                index + 1,
                safe(d.timestamp || ""),
                safe(`${d.class?.toUpperCase()
                    ?.substring(0, 4)
                    || "VH"}_${String(d.id)
                        .padStart(3, "0")}`),
                safe(d.class || ""),
                safe(d.plate_number || ""),
                safe(d.confidence
                    ? d.confidence.toFixed(2)
                    : "0.00"),
                safe(d.camera || "CAM_01"),
                safe(d.violation_type || ""),
                safe(d.is_simulated
                    ? "Co" : "Khong"),
            ].join(",");
        });

    // Build CSV content
    const BOM = ""; // UTF-8 BOM
    const csvContent = BOM
        + headers + "\n"
        + rows.join("\n");

    // Trigger download
    const blob = new Blob(
        [csvContent],
        { type: "text/csv;charset=utf-8;" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date()
        .toISOString()
        .slice(0, 10);
    link.href = url;
    link.download = filename
        || `traffic_report_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 2: PDF EXPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function exportToPDF(
    detections: DetectionExport[],
    reportDate?: string,
    filename?: string
): Promise<void> {
    // Dynamic import — chỉ load khi cần
    const { default: jsPDF } =
        await import("jspdf");
    const { default: autoTable } =
        await import("jspdf-autotable");

    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    const pageW = doc.internal
        .pageSize.getWidth();
    const _date = reportDate
        || new Date().toLocaleDateString(
            "vi-VN");

    // ── HEADER ──────────────────────
    // Nền xanh tiêu đề
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 35, "F");

    // Tiêu đề chính
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(
        "BAO CAO GIAM SAT GIAO THONG",
        pageW / 2, 14,
        { align: "center" }
    );

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
        "Smart Traffic Monitoring System",
        pageW / 2, 22,
        { align: "center" }
    );

    // Badge version
    doc.setFillColor(59, 130, 246);
    doc.roundedRect(
        pageW / 2 - 12, 25, 24, 6, 2, 2, "F");
    doc.setFontSize(8);
    doc.text("v2.5.0", pageW / 2, 29.5,
        { align: "center" });

    // ── THÔNG TIN CHUNG ─────────────
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    doc.setFillColor(248, 250, 252);
    doc.rect(10, 40, pageW - 20, 22, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(10, 40, pageW - 20, 22);

    doc.setFont("helvetica", "bold");
    doc.text("THONG TIN BAO CAO",
        14, 47);
    doc.setFont("helvetica", "normal");
    doc.text(
        `Ngay xuat: ${_date}`,
        14, 54);
    doc.text(
        `Tong phuong tien: `
        + `${detections.length} xe`,
        14, 59);
    doc.text(
        `He thong: YOLOv12 + `
        + `ByteTrack + PaddleOCR`,
        pageW / 2, 54);
    doc.text(
        `Trang thai: Dang hoat dong`,
        pageW / 2, 59);

    // ── BẢNG DỮ LIỆU ────────────────
    const tableRows = detections.map(
        (d, i) => [
            String(i + 1),
            d.timestamp || "",
            `${d.class?.substring(0, 3)
                ?.toUpperCase()
            || "VH"}_`
            + String(d.id).padStart(3, "0"),
            d.class || "",
            d.plate_number || "Chua ro",
            d.confidence
                ? (d.confidence * 100)
                    .toFixed(0) + "%"
                : "0%",
            d.camera || "CAM_01",
            d.violation_type || "-",
        ]);

    autoTable(doc, {
        startY: 67,
        head: [[
            "STT", "Thoi Gian",
            "ID", "Loai Xe",
            "Bien So", "Tin Cay",
            "Camera", "Vi Pham",
        ]],
        body: tableRows,
        styles: {
            fontSize: 7,
            cellPadding: 2,
        },
        headStyles: {
            fillColor: [15, 23, 42],
            textColor: [255, 255, 255],
            fontStyle: "bold",
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252],
        },
        columnStyles: {
            0: { cellWidth: 8 },   // STT
            1: { cellWidth: 28 },  // Time
            2: { cellWidth: 18 },  // ID
            3: { cellWidth: 18 },  // Type
            4: { cellWidth: 22 },  // Plate
            5: { cellWidth: 14 },  // Conf
            6: { cellWidth: 18 },  // Camera
            7: { cellWidth: 22 },  // Violation
        },
        didParseCell: (data: any) => {
            // Tô đỏ vi phạm
            if (data.column.index === 7
                && data.section
                === "body"
                && data.cell.text[0]
                !== "-") {
                data.cell.styles
                    .textColor = [
                        220, 38, 38];
                data.cell.styles
                    .fontStyle = "bold";
            }
            // Tô vàng giả lập
            const row = detections[
                data.row.index];
            if (row?.is_simulated
                && data.column.index
                === 4) {
                data.cell.styles
                    .textColor = [
                        217, 119, 6];
            }
        },
    });

    // ── ẢNH BẰNG CHỨNG ──────────────
    // Thêm trang mới cho ảnh
    const withImages = detections.filter(
        d => d.vehicle_image
            || d.plate_image
    );

    if (withImages.length > 0) {
        doc.addPage();

        // Header trang ảnh
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageW, 18, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(
            "ANH BANG CHUNG",
            pageW / 2, 12,
            { align: "center" }
        );

        let yPos = 25;
        const imgW = 60;
        const imgH = 40;
        const gap = 5;
        let col = 0;

        for (const d of withImages) {
            // Xuống trang mới nếu hết
            if (yPos + imgH + 20 > 280) {
                doc.addPage();
                yPos = 15;
            }

            const xPos = 10
                + col * (imgW + gap + 55);

            // Label
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(7);
            doc.setFont(
                "helvetica", "bold");
            doc.text(
                `#${d.id} | `
                + `${d.plate_number
                || "Chua ro"} | `
                + `${d.class || ""}`,
                xPos, yPos - 2
            );
            doc.setFont(
                "helvetica", "normal");
            doc.text(
                d.timestamp || "",
                xPos, yPos + 2
            );

            // Ảnh xe
            if (d.vehicle_image) {
                try {
                    const imgData =
                        d.vehicle_image
                            .startsWith(
                                "data:")
                            ? d.vehicle_image
                            : `data:image/jpeg`
                            + `;base64,`
                            + d.vehicle_image;
                    doc.addImage(
                        imgData,
                        "JPEG",
                        xPos, yPos + 5,
                        imgW, imgH
                    );
                    doc.setFontSize(6);
                    doc.setTextColor(
                        100, 100, 100);
                    doc.text(
                        "Anh toan canh",
                        xPos + imgW / 2,
                        yPos + imgH + 8,
                        { align: "center" }
                    );
                } catch (_e) {
                    // skip nếu ảnh lỗi
                }
            }

            // Ảnh biển
            if (d.plate_image) {
                try {
                    const pData =
                        d.plate_image
                            .startsWith(
                                "data:")
                            ? d.plate_image
                            : `data:image/jpeg`
                            + `;base64,`
                            + d.plate_image;
                    doc.addImage(
                        pData,
                        "JPEG",
                        xPos + imgW + gap,
                        yPos + 5,
                        40, 20
                    );
                    doc.setFontSize(6);
                    doc.setTextColor(
                        100, 100, 100);
                    doc.text(
                        "Bien so: "
                        + (d.plate_number
                            || "?"),
                        xPos + imgW
                        + gap + 20,
                        yPos + 28,
                        { align: "center" }
                    );
                } catch (_ep) {
                    // skip
                }
            }

            col++;
            if (col >= 2) {
                col = 0;
                yPos += imgH + 25;
            }
        }
    }

    // ── CHỮ KÝ ──────────────────────
    doc.addPage();
    const lastY = doc.internal
        .pageSize.getHeight() - 40;

    doc.setDrawColor(226, 232, 240);
    doc.line(10, lastY,
        pageW - 10, lastY);

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "italic");
    doc.text(
        "Báo cáo được tạo tự động bởi "
        + "Smart Traffic Monitoring System",
        pageW / 2,
        lastY + 6,
        { align: "center" }
    );
    doc.text(
        `Ngay tao: ${new Date()
            .toLocaleString("vi-VN")}`,
        pageW / 2,
        lastY + 12,
        { align: "center" }
    );

    // Chữ ký người lập
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
        "Nguoi lap bao cao",
        pageW - 50, lastY + 20);
    doc.line(
        pageW - 60, lastY + 30,
        pageW - 10, lastY + 30);

    // ── DOWNLOAD ────────────────────
    const date = new Date()
        .toISOString().slice(0, 10);
    doc.save(
        filename
        || `traffic_report_${date}.pdf`
    );
}

export async function exportViolationNoticePDF(
    record: ViolationNoticeExport,
    filename?: string
): Promise<void> {
    const { default: jsPDF } = await import("jspdf");

    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const normalize = (value?: string | number) => String(value ?? "-")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D");
    const safeText = (value?: string | number) => {
        const text = normalize(value).trim();
        return text || "-";
    };
    const split = (value: string, width: number) => doc.splitTextToSize(value || "-", width);
    const createdAt = safeText(new Date().toLocaleString("vi-VN"));
    const caseId = safeText(record.id);
    const licensePlate = safeText(record.licensePlate).toUpperCase();
    const ocrScore = record.ocrScore ? `${Math.round(record.ocrScore * 100)}%` : "Chua xac dinh";

    const drawSectionTitle = (index: string, title: string, y: number) => {
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(12, y - 6, pageW - 24, 10, 1.5, 1.5, "FD");
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`${index}. ${title}`, 16, y);
    };

    const drawField = (label: string, value: string, x: number, y: number, valueW = 54) => {
        doc.setTextColor(71, 85, 105);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(`${label}:`, x, y);
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "normal");
        doc.text(split(value, valueW), x + 31, y);
    };

    const addImageSafe = (
        img: string | undefined,
        label: string,
        x: number,
        y: number,
        w: number,
        h: number
    ) => {
        doc.setDrawColor(148, 163, 184);
        doc.setFillColor(0, 0, 0);
        doc.roundedRect(x, y, w, h, 2, 2, "FD");
        if (img) {
            try {
                const imgData = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
                doc.addImage(imgData, "JPEG", x + 1.5, y + 1.5, w - 3, h - 3);
            } catch (_e) {
                doc.setTextColor(148, 163, 184);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.text("Khong doc duoc anh", x + w / 2, y + h / 2, { align: "center" });
            }
        } else {
            doc.setTextColor(148, 163, 184);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.text("Khong co anh", x + w / 2, y + h / 2, { align: "center" });
        }
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(label, x + w / 2, y + h + 5, { align: "center" });
    };

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.rect(9, 9, pageW - 18, pageH - 18);
    doc.setLineWidth(0.2);
    doc.rect(11, 11, pageW - 22, pageH - 22);

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("HE THONG QUAN LY GIAO THONG THONG MINH", 14, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("DON VI VAN HANH / TRUNG TAM GIAM SAT", 14, 26);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("CONG HOA XA HOI CHU NGHIA VIET NAM", pageW - 14, 20, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Doc lap - Tu do - Hanh phuc", pageW - 14, 26, { align: "right" });
    doc.line(pageW - 72, 28, pageW - 14, 28);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("BIEN BAN GHI NHAN VI PHAM GIAO THONG", pageW / 2, 42, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Lap tu du lieu camera, phuc vu doi soat va xu ly vi pham", pageW / 2, 48, { align: "center" });
    doc.text(`So ho so: ${caseId}`, pageW / 2, 54, { align: "center" });

    drawSectionTitle("I", "THONG TIN PHUONG TIEN VA VI PHAM", 66);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 72, pageW - 24, 48, 2, 2, "FD");
    const leftX = 16;
    const rightX = pageW / 2 + 4;
    drawField("Bien so", licensePlate, leftX, 82);
    drawField("Hanh vi", safeText(record.violation), rightX, 82, 60);
    drawField("Loai xe", safeText(record.vehicleType), leftX, 93);
    drawField("Camera", safeText(record.camera), rightX, 93, 60);
    drawField("Thoi gian", safeText(record.timestamp), leftX, 104);
    drawField("Trang thai", safeText(record.status || "Cho xu ly"), rightX, 104, 60);
    drawField("Do tin cay OCR", ocrScore, leftX, 115);
    drawField("Ngay lap", createdAt, rightX, 115, 60);

    drawSectionTitle("II", "THONG TIN CHU PHUONG TIEN", 132);
    doc.roundedRect(12, 138, pageW - 24, 38, 2, 2, "FD");
    drawField("Chu xe", safeText(record.ownerName || "Chua xac dinh"), leftX, 148, 120);
    drawField("Dien thoai", safeText(record.ownerPhone || "Chua xac dinh"), leftX, 159, 46);
    drawField("Email", safeText(record.ownerEmail || "Chua xac dinh"), rightX, 159, 58);
    drawField("Dia chi", safeText(record.ownerAddress || "Chua xac dinh"), leftX, 170, 136);

    drawSectionTitle("III", "HINH ANH CHUNG CU", 188);
    addImageSafe(record.vehicleImage, "Anh toan canh phuong tien", 14, 196, 118, 62);
    addImageSafe(record.plateImage, "Anh crop bien so / dau hieu dinh danh", 140, 211, 54, 30);

    doc.addPage();
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.rect(9, 9, pageW - 18, pageH - 18);
    doc.setLineWidth(0.2);
    doc.rect(11, 11, pageW - 22, pageH - 22);

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("PHAN KET LUAN HO SO VI PHAM", pageW / 2, 24, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`So ho so: ${caseId} - Bien so: ${licensePlate}`, pageW / 2, 31, { align: "center" });

    drawSectionTitle("IV", "KET LUAN VA DE XUAT XU LY", 46);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8.5);
    doc.text(
        split("He thong ghi nhan dau hieu vi pham qua camera. Ho so can duoc can bo co tham quyen doi soat voi hinh anh goc truoc khi ban hanh quyet dinh xu phat.", 178),
        16,
        58
    );
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 76, pageW - 28, 68, 2, 2, "FD");
    drawField("Hinh thuc xu ly", "Lap ho so doi soat / thong bao chu phuong tien", 18, 88, 124);
    drawField("Trang thai ho so", safeText(record.status || "Cho xu ly"), 18, 100, 124);
    drawField("Kenh thong bao", "SMS / Email theo thong tin chu phuong tien", 18, 112, 124);
    drawField("Muc phat du kien", safeText(record.fineAmount || "Can doi chieu"), 18, 124, 124);
    drawField("Can cu", safeText(record.fineBasis || "Nghi dinh 168/2024/ND-CP"), 18, 136, 124);
    if (record.fineNote) {
        doc.text(split(safeText(record.fineNote), 154), 18, 148);
    }

    doc.setFont("helvetica", "bold");
    doc.text("NGUOI LAP BIEN BAN", 48, pageH - 34, { align: "center" });
    doc.text("DAI DIEN DON VI XU LY", pageW - 52, pageH - 34, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("(Ky, ghi ro ho ten)", 48, pageH - 28, { align: "center" });
    doc.text("(Ky, ghi ro ho ten)", pageW - 52, pageH - 28, { align: "center" });

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    doc.text(`Tai lieu xuat tu he thong - ${createdAt}`, pageW / 2, pageH - 14, { align: "center" });

    const cleanPlate = licensePlate.replace(/[^A-Z0-9]/gi, "") || "unknown";
    const date = new Date().toISOString().slice(0, 10);
    doc.save(filename || `bien_ban_vi_pham_${cleanPlate}_${date}.pdf`);
}
// ← ĐÃ TẠO: exportUtils.ts
