export type VehicleFineGroup = 'car' | 'motorcycle' | 'truck' | 'bus' | 'unknown';

export interface ViolationFineInfo {
  violation: string;
  vehicleGroup: VehicleFineGroup;
  amountLabel: string;
  pointDeduction?: string;
  legalBasis: string;
  note?: string;
}

const LAW_BASIS = 'Nghị định 168/2024/NĐ-CP, hiệu lực từ 01/01/2025';

function normalizeText(value?: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoViolation(value: string): boolean {
  return (
    !value ||
    value === 'khong' ||
    value === 'none' ||
    value === 'normal' ||
    value === 'chua phan loai' ||
    value.includes('khong vi pham') ||
    value.includes('khong co vi pham') ||
    value.includes('khong ghi nhan') ||
    value.includes('chua ghi nhan') ||
    value.includes('binh thuong')
  );
}

export function resolveVehicleFineGroup(vehicleType?: string): VehicleFineGroup {
  const value = normalizeText(vehicleType);
  if (value.includes('may') || value.includes('moto') || value.includes('motor')) return 'motorcycle';
  if (value.includes('tai') || value.includes('truck')) return 'truck';
  if (value.includes('bus') || value.includes('buyt')) return 'bus';
  if (value.includes('oto') || value.includes('o to') || value.includes('car')) return 'car';
  return 'unknown';
}

export function getViolationFineInfo(violation?: string, vehicleType?: string): ViolationFineInfo {
  const violationKey = normalizeText(violation);
  const group = resolveVehicleFineGroup(vehicleType);
  const isCarLike = group === 'car' || group === 'truck' || group === 'bus';

  if (isNoViolation(violationKey)) {
    return {
      violation: violation || 'Không vi phạm',
      vehicleGroup: group,
      amountLabel: '0 đồng',
      legalBasis: LAW_BASIS,
      note: 'Không ghi nhận hành vi vi phạm nên không áp dụng tiền phạt.',
    };
  }

  if (group === 'unknown') {
    return {
      violation: violation || 'Chưa phân loại lỗi',
      vehicleGroup: group,
      amountLabel: 'Cần xác định loại phương tiện trước khi tính mức phạt',
      legalBasis: LAW_BASIS,
      note: 'Không tự suy đoán ô tô hay xe máy vì cùng hành vi có mức phạt và điểm trừ khác nhau.',
    };
  }

  if (violationKey.includes('den do') || violationKey.includes('tin hieu')) {
    return {
      violation: violation || 'Không chấp hành tín hiệu đèn giao thông',
      vehicleGroup: group,
      amountLabel: isCarLike ? '18.000.000 - 20.000.000 đồng' : '4.000.000 - 6.000.000 đồng',
      pointDeduction: 'Trừ 4 điểm giấy phép lái xe',
      legalBasis: isCarLike
        ? 'Điểm b khoản 9 và điểm b khoản 16 Điều 6 Nghị định 168/2024/NĐ-CP'
        : 'Điểm c khoản 7 và điểm b khoản 13 Điều 7 Nghị định 168/2024/NĐ-CP',
      note: 'Áp dụng khi phương tiện không chấp hành tín hiệu đèn giao thông.',
    };
  }

  if (violationKey.includes('nguoc chieu')) {
    return {
      violation: violation || 'Đi ngược chiều',
      vehicleGroup: group,
      amountLabel: isCarLike ? '18.000.000 - 20.000.000 đồng' : '4.000.000 - 6.000.000 đồng',
      pointDeduction: isCarLike ? 'Trừ 4 điểm giấy phép lái xe' : 'Trừ 2 điểm giấy phép lái xe',
      legalBasis: isCarLike
        ? 'Điểm d khoản 9 và điểm b khoản 16 Điều 6 Nghị định 168/2024/NĐ-CP'
        : 'Điểm a khoản 7 và điểm a khoản 13 Điều 7 Nghị định 168/2024/NĐ-CP',
      note: 'Áp dụng cho đi ngược chiều trên đường một chiều hoặc đường có biển cấm đi ngược chiều; cao tốc là hành vi khác.',
    };
  }

  if (violationKey.includes('mu bao hiem') || violationKey.includes('khong doi mu')) {
    if (group !== 'motorcycle') {
      return {
        violation: violation || 'Không đội mũ bảo hiểm',
        vehicleGroup: group,
        amountLabel: 'Không áp dụng cho loại phương tiện đã chọn',
        legalBasis: 'Điểm h, i khoản 2 Điều 7 Nghị định 168/2024/NĐ-CP',
        note: 'Quy định này áp dụng cho người điều khiển hoặc người ngồi trên xe mô tô, xe gắn máy.',
      };
    }
    return {
      violation: violation || 'Không đội mũ bảo hiểm',
      vehicleGroup: group,
      amountLabel: '400.000 - 600.000 đồng',
      legalBasis: 'Điểm h, i khoản 2 Điều 7 Nghị định 168/2024/NĐ-CP',
      note: 'Áp dụng cho xe mô tô, xe gắn máy và phương tiện tương tự.',
    };
  }

  if (violationKey.includes('dien thoai')) {
    return {
      violation: violation || 'Sử dụng điện thoại khi lái xe',
      vehicleGroup: group,
      amountLabel: isCarLike ? '4.000.000 - 6.000.000 đồng' : '800.000 - 1.000.000 đồng',
      pointDeduction: 'Trừ 4 điểm giấy phép lái xe',
      legalBasis: isCarLike
        ? 'Điểm h khoản 5 và điểm b khoản 16 Điều 6 Nghị định 168/2024/NĐ-CP'
        : 'Điểm đ khoản 4 và điểm b khoản 13 Điều 7 Nghị định 168/2024/NĐ-CP',
    };
  }

  if (violationKey.includes('vach') || violationKey.includes('ke duong') || violationKey.includes('de vach')) {
    return {
      violation: violation || 'Không chấp hành vạch kẻ đường',
      vehicleGroup: group,
      amountLabel: isCarLike ? '400.000 - 600.000 đồng' : '200.000 - 400.000 đồng',
      legalBasis: isCarLike
        ? 'Điểm a khoản 1 Điều 6 Nghị định 168/2024/NĐ-CP'
        : 'Điểm a khoản 1 Điều 7 Nghị định 168/2024/NĐ-CP',
      note: 'Cần đối chiếu loại vạch và vị trí dừng cụ thể trước khi ban hành quyết định xử phạt.',
    };
  }

  if (violationKey.includes('sai lan') || violationKey.includes('lan duong')) {
    return {
      violation: violation || 'Đi sai làn đường',
      vehicleGroup: group,
      amountLabel: isCarLike ? '4.000.000 - 6.000.000 đồng' : '600.000 - 800.000 đồng',
      pointDeduction: isCarLike ? 'Trừ 2 điểm giấy phép lái xe' : undefined,
      legalBasis: isCarLike
        ? 'Điểm b khoản 5 và điểm a khoản 16 Điều 6 Nghị định 168/2024/NĐ-CP'
        : 'Điểm d khoản 3 Điều 7 Nghị định 168/2024/NĐ-CP',
      note: 'Nếu gây tai nạn, mức phạt và trừ điểm sẽ cao hơn.',
    };
  }

  if (violationKey.includes('toc do')) {
    return {
      violation: violation || 'Quá tốc độ',
      vehicleGroup: group,
      amountLabel: 'Cần xác định số km/h vượt quá để tính đúng mức phạt',
      legalBasis: LAW_BASIS,
      note: 'Lỗi quá tốc độ chia theo ngưỡng vượt quá và tình huống gây tai nạn.',
    };
  }

  return {
    violation: violation || 'Chưa phân loại lỗi',
    vehicleGroup: group,
    amountLabel: 'Cần đối chiếu hành vi cụ thể trước khi ra quyết định xử phạt',
    legalBasis: LAW_BASIS,
    note: 'Chưa đủ dữ liệu pháp lý để tự động kết luận mức tiền phạt.',
  };
}

export function formatFineForNotice(info: ViolationFineInfo): string {
  const extra = [info.pointDeduction, info.note].filter(Boolean).join('. ');
  return `Mức phạt dự kiến: ${info.amountLabel}. Căn cứ: ${info.legalBasis}.${extra ? ` ${extra}` : ''}`;
}
