export type VehicleType = 'Ô tô' | 'Xe máy' | 'Xe tải' | 'Xe buýt';

export const VIOLATION_FINE_MAP = {
    'Vượt đèn đỏ': {
        'Ô tô': { min: 18000000, max: 20000000, avg: 19000000 },
        'Xe máy': { min: 4000000, max: 6000000, avg: 5000000 },
        'Xe tải': { min: 18000000, max: 20000000, avg: 19000000 },
        'Xe buýt': { min: 18000000, max: 20000000, avg: 19000000 },
    },
    'Đi ngược chiều': {
        'Ô tô': { min: 18000000, max: 20000000, avg: 19000000 },
        'Xe máy': { min: 4000000, max: 6000000, avg: 5000000 },
        'Xe tải': { min: 18000000, max: 20000000, avg: 19000000 },
        'Xe buýt': { min: 18000000, max: 20000000, avg: 19000000 },
    },
    'Quay đầu cấm': {
        'Ô tô': { min: 2000000, max: 3000000, avg: 2500000 },
        'Xe máy': { min: 400000, max: 600000, avg: 500000 },
        'Xe tải': { min: 2000000, max: 3000000, avg: 2500000 },
        'Xe buýt': { min: 2000000, max: 3000000, avg: 2500000 },
    },
    'Quay đầu nơi cấm': {
        'Ô tô': { min: 2000000, max: 3000000, avg: 2500000 },
        'Xe máy': { min: 400000, max: 600000, avg: 500000 },
        'Xe tải': { min: 2000000, max: 3000000, avg: 2500000 },
        'Xe buýt': { min: 2000000, max: 3000000, avg: 2500000 },
    },
    'Đi sai làn': {
        'Ô tô': { min: 4000000, max: 6000000, avg: 5000000 },
        'Xe máy': { min: 600000, max: 800000, avg: 700000 },
        'Xe tải': { min: 4000000, max: 6000000, avg: 5000000 },
        'Xe buýt': { min: 4000000, max: 6000000, avg: 5000000 },
    }
};

export const calculateVietnamFine = (violation: string, vehicleType: string): number => {
    // Normalize vehicle type if necessary or basic mapping
    let normalizedType: VehicleType | null = null;
    if (vehicleType.toLowerCase().includes('máy')) normalizedType = 'Xe máy';
    else if (vehicleType.toLowerCase().includes('tải')) normalizedType = 'Xe tải';
    else if (vehicleType.toLowerCase().includes('buýt')) normalizedType = 'Xe buýt';
    else if (vehicleType.toLowerCase().includes('ô tô') || vehicleType.toLowerCase().includes('oto')) normalizedType = 'Ô tô';

    if (!normalizedType) return 0;

    const violationConfig = VIOLATION_FINE_MAP[violation as keyof typeof VIOLATION_FINE_MAP];
    if (!violationConfig) return 0;

    const fineConfig = violationConfig[normalizedType];
    return fineConfig ? fineConfig.avg : 0;
};
