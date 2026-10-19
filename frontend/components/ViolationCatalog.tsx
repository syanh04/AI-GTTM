'use client';

import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, FolderOpen } from 'lucide-react';
import { goTo } from '@/lib/crossNav';

interface Rule {
  id: string;
  group: string;
  vehicle: string;
  behavior: string;
  fine: string;
  points: string;
  license: string;
  basis: string;
  pointBasis: string;
  custom?: boolean;
}

type SortField = 'fine' | 'points';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

const BASE_RULES: Rule[] = [
  // O to, xe tuong tu o to - Dieu 6 Nghi dinh 168/2024/ND-CP
  { id: 'o1', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Vượt đèn đỏ, đèn vàng trái quy định', fine: '18.000.000 - 20.000.000', points: '4', license: '', basis: 'Điều 6 khoản 9 điểm b NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm b' },
  { id: 'o2', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Không chấp hành hiệu lệnh của người điều khiển giao thông', fine: '18.000.000 - 20.000.000', points: '4', license: '', basis: 'Điều 6 khoản 9 điểm c NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm b' },
  { id: 'o21', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Chạy quá tốc độ từ 5 km/h đến dưới 10 km/h', fine: '800.000 - 1.000.000', points: '0', license: '', basis: 'Điều 6 khoản 3 điểm a NĐ 168/2024', pointBasis: 'Không thuộc nhóm trừ điểm tại khoản 16 Điều 6' },
  { id: 'o3', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Chạy quá tốc độ từ 10 km/h đến 20 km/h', fine: '4.000.000 - 6.000.000', points: '2', license: '', basis: 'Điều 6 khoản 5 điểm đ NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm a' },
  { id: 'o4', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Chạy quá tốc độ trên 20 km/h đến 35 km/h', fine: '6.000.000 - 8.000.000', points: '4', license: '', basis: 'Điều 6 khoản 6 điểm a NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm b' },
  { id: 'o5', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Chạy quá tốc độ trên 35 km/h', fine: '12.000.000 - 14.000.000', points: '6', license: '', basis: 'Điều 6 khoản 7 điểm a NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm c' },
  { id: 'o6', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Đi ngược chiều trên đường một chiều hoặc đường có biển cấm đi ngược chiều', fine: '18.000.000 - 20.000.000', points: '4', license: '', basis: 'Điều 6 khoản 9 điểm d NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm b' },
  { id: 'o7', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Đi không đúng phần đường hoặc làn đường quy định', fine: '4.000.000 - 6.000.000', points: '2', license: '', basis: 'Điều 6 khoản 5 điểm b NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm a' },
  { id: 'o8', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Vượt xe không đúng quy định trong trường hợp bị cấm vượt', fine: '4.000.000 - 6.000.000', points: '2', license: '', basis: 'Điều 6 khoản 5 điểm a NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm a' },
  { id: 'o9', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Dùng điện thoại cầm tay khi đang điều khiển xe', fine: '4.000.000 - 6.000.000', points: '4', license: '', basis: 'Điều 6 khoản 5 điểm h NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm b' },
  { id: 'o10', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Dừng, đỗ xe trên đường cao tốc không đúng nơi quy định hoặc không đặt cảnh báo an toàn khi buộc phải dừng', fine: '12.000.000 - 14.000.000', points: '6', license: '', basis: 'Điều 6 khoản 7 điểm c NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm c' },
  { id: 'o10b', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Đi ngược chiều, lùi xe hoặc quay đầu xe trên đường cao tốc', fine: '30.000.000 - 40.000.000', points: '10', license: '', basis: 'Điều 6 khoản 11 điểm đ NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm d' },
  { id: 'o11', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Lùi xe hoặc quay đầu xe trong hầm đường bộ không đúng quy định', fine: '2.000.000 - 3.000.000', points: '2', license: '', basis: 'Điều 6 khoản 4 điểm đ NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm a' },
  { id: 'o22', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Quay đầu xe tại nơi có biển cấm quay đầu', fine: '2.000.000 - 3.000.000', points: '2', license: '', basis: 'Điều 6 khoản 4 điểm k NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm a' },
  { id: 'o12', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Không nhường đường hoặc gây cản trở xe ưu tiên đang phát tín hiệu ưu tiên', fine: '6.000.000 - 8.000.000', points: '4', license: '', basis: 'Điều 6 khoản 6 điểm b NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm b' },
  { id: 'o13', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Không giảm tốc độ hoặc không nhường đường khi điều khiển xe từ đường không ưu tiên ra đường ưu tiên', fine: '4.000.000 - 6.000.000', points: '2', license: '', basis: 'Điều 6 khoản 5 điểm n NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm a' },
  { id: 'o14', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Gây tai nạn giao thông nhưng không dừng lại, không giữ nguyên hiện trường hoặc bỏ trốn', fine: '16.000.000 - 18.000.000', points: '6', license: '', basis: 'Điều 6 khoản 8 NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm c' },
  { id: 'o15', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Có nồng độ cồn nhưng chưa vượt quá 50 mg/100 ml máu hoặc 0,25 mg/l khí thở', fine: '6.000.000 - 8.000.000', points: '4', license: '', basis: 'Điều 6 khoản 6 điểm c NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm b' },
  { id: 'o16', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Có nồng độ cồn vượt quá 50 đến 80 mg/100 ml máu hoặc vượt quá 0,25 đến 0,4 mg/l khí thở', fine: '18.000.000 - 20.000.000', points: '10', license: '', basis: 'Điều 6 khoản 9 điểm a NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm d' },
  { id: 'o17', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Có nồng độ cồn vượt quá 80 mg/100 ml máu hoặc vượt quá 0,4 mg/l khí thở', fine: '30.000.000 - 40.000.000', points: '0', license: 'Tước GPLX 22 - 24 tháng', basis: 'Điều 6 khoản 11 điểm a NĐ 168/2024', pointBasis: 'Áp dụng hình thức tước GPLX, không hiển thị trừ điểm' },
  { id: 'o18', group: 'Ô tô', vehicle: 'Ô tô', behavior: 'Điều khiển xe trên đường mà trong cơ thể có chất ma túy', fine: '30.000.000 - 40.000.000', points: '0', license: 'Tước GPLX 22 - 24 tháng', basis: 'Điều 6 khoản 11 điểm c NĐ 168/2024', pointBasis: 'Áp dụng hình thức tước GPLX, không hiển thị trừ điểm' },
  { id: 'o19', group: 'Tước GPLX / lỗi nặng', vehicle: 'Ô tô', behavior: 'Không chấp hành yêu cầu kiểm tra nồng độ cồn của người thi hành công vụ', fine: '30.000.000 - 40.000.000', points: '0', license: 'Tước GPLX 22 - 24 tháng', basis: 'Điều 6 khoản 11 điểm b NĐ 168/2024', pointBasis: 'Điều 6 khoản 15 điểm c; không áp dụng trừ điểm' },
  { id: 'o20', group: 'Tước GPLX / lỗi nặng', vehicle: 'Ô tô', behavior: 'Không chấp hành yêu cầu kiểm tra chất ma túy của người thi hành công vụ', fine: '30.000.000 - 40.000.000', points: '0', license: 'Tước GPLX 22 - 24 tháng', basis: 'Điều 6 khoản 11 điểm d NĐ 168/2024', pointBasis: 'Điều 6 khoản 15 điểm c; không áp dụng trừ điểm' },

  // Xe may - Dieu 7 Nghi dinh 168/2024/ND-CP
  { id: 'm1', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Vượt đèn đỏ, đèn vàng trái quy định', fine: '4.000.000 - 6.000.000', points: '4', license: '', basis: 'Điều 7 khoản 7 điểm c NĐ 168/2024', pointBasis: 'Điều 7 khoản 13 điểm b' },
  { id: 'm2', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Không chấp hành hiệu lệnh của người điều khiển giao thông', fine: '4.000.000 - 6.000.000', points: '4', license: '', basis: 'Điều 7 khoản 7 điểm d NĐ 168/2024', pointBasis: 'Điều 7 khoản 13 điểm b' },
  { id: 'm16', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Chạy quá tốc độ từ 5 km/h đến dưới 10 km/h', fine: '400.000 - 600.000', points: '0', license: '', basis: 'Điều 7 khoản 2 điểm b NĐ 168/2024', pointBasis: 'Không thuộc nhóm trừ điểm tại khoản 13 Điều 7' },
  { id: 'm3', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Chạy quá tốc độ từ 10 km/h đến 20 km/h', fine: '800.000 - 1.000.000', points: '0', license: '', basis: 'Điều 7 khoản 4 điểm a NĐ 168/2024', pointBasis: 'Không thuộc nhóm trừ điểm GPLX' },
  { id: 'm4', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Chạy quá tốc độ trên 20 km/h', fine: '6.000.000 - 8.000.000', points: '10', license: '', basis: 'Điều 7 khoản 8 điểm a NĐ 168/2024', pointBasis: 'Điều 7 khoản 13 điểm d' },
  { id: 'm5', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Đi ngược chiều trên đường một chiều hoặc đường có biển cấm đi ngược chiều', fine: '4.000.000 - 6.000.000', points: '2', license: '', basis: 'Điều 7 khoản 7 điểm a NĐ 168/2024', pointBasis: 'Điều 7 khoản 13 điểm a' },
  { id: 'm6', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Đi vào đường cao tốc, trừ xe phục vụ quản lý hoặc bảo trì đường cao tốc', fine: '4.000.000 - 6.000.000', points: '6', license: '', basis: 'Điều 7 khoản 7 điểm b NĐ 168/2024', pointBasis: 'Điều 7 khoản 13 điểm c' },
  { id: 'm7', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Sử dụng điện thoại cầm tay khi đang điều khiển xe', fine: '800.000 - 1.000.000', points: '4', license: '', basis: 'Điều 7 khoản 4 điểm đ NĐ 168/2024', pointBasis: 'Điều 7 khoản 13 điểm b' },
  { id: 'm8', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Lạng lách, đánh võng hoặc dùng chân chống quệt xuống đường khi xe đang chạy', fine: '8.000.000 - 10.000.000', points: '0', license: 'Tước GPLX 10 - 12 tháng', basis: 'Điều 7 khoản 9 điểm a NĐ 168/2024', pointBasis: 'Điều 7 khoản 12 điểm b; không áp dụng trừ điểm' },
  { id: 'm9', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Gây tai nạn giao thông nhưng không dừng lại, không giữ nguyên hiện trường hoặc bỏ trốn', fine: '8.000.000 - 10.000.000', points: '6', license: '', basis: 'Điều 7 khoản 9 điểm c NĐ 168/2024', pointBasis: 'Điều 7 khoản 13 điểm c' },
  { id: 'm17', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Đi không đúng phần đường hoặc làn đường quy định', fine: '600.000 - 800.000', points: '0', license: '', basis: 'Điều 7 khoản 3 điểm d NĐ 168/2024', pointBasis: 'Không thuộc nhóm trừ điểm tại khoản 13 Điều 7' },
  { id: 'm10', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Có nồng độ cồn nhưng chưa vượt quá 50 mg/100 ml máu hoặc 0,25 mg/l khí thở', fine: '2.000.000 - 3.000.000', points: '4', license: '', basis: 'Điều 7 khoản 6 NĐ 168/2024', pointBasis: 'Điều 7 khoản 13 điểm b' },
  { id: 'm11', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Có nồng độ cồn vượt quá 50 đến 80 mg/100 ml máu hoặc vượt quá 0,25 đến 0,4 mg/l khí thở', fine: '6.000.000 - 8.000.000', points: '10', license: '', basis: 'Điều 7 khoản 8 điểm b NĐ 168/2024', pointBasis: 'Điều 7 khoản 13 điểm d' },
  { id: 'm12', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Có nồng độ cồn vượt quá 80 mg/100 ml máu hoặc vượt quá 0,4 mg/l khí thở', fine: '8.000.000 - 10.000.000', points: '0', license: 'Tước GPLX 22 - 24 tháng', basis: 'Điều 7 khoản 9 NĐ 168/2024', pointBasis: 'Áp dụng hình thức tước GPLX, không hiển thị trừ điểm' },
  { id: 'm13', group: 'Xe máy', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Điều khiển xe trên đường mà trong cơ thể có chất ma túy', fine: '8.000.000 - 10.000.000', points: '0', license: 'Tước GPLX 22 - 24 tháng', basis: 'Điều 7 khoản 9 NĐ 168/2024', pointBasis: 'Áp dụng hình thức tước GPLX, không hiển thị trừ điểm' },
  { id: 'm14', group: 'Tước GPLX / lỗi nặng', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Không chấp hành yêu cầu kiểm tra nồng độ cồn của người thi hành công vụ', fine: '8.000.000 - 10.000.000', points: '0', license: 'Tước GPLX 22 - 24 tháng', basis: 'Điều 7 khoản 9 NĐ 168/2024', pointBasis: 'Áp dụng hình thức tước GPLX, không hiển thị trừ điểm' },
  { id: 'm15', group: 'Tước GPLX / lỗi nặng', vehicle: 'Xe mô tô, xe gắn máy', behavior: 'Không chấp hành yêu cầu kiểm tra chất ma túy của người thi hành công vụ', fine: '8.000.000 - 10.000.000', points: '0', license: 'Tước GPLX 22 - 24 tháng', basis: 'Điều 7 khoản 9 NĐ 168/2024', pointBasis: 'Áp dụng hình thức tước GPLX, không hiển thị trừ điểm' },

  // Xe tai, xe khach, van tai hang hoa/hanh khach
  { id: 't1', group: 'Xe tải / Xe buýt', vehicle: 'Xe tải, xe khách, xe buýt', behavior: 'Vượt đèn đỏ, đèn vàng trái quy định', fine: '18.000.000 - 20.000.000', points: '4', license: '', basis: 'Điều 6 khoản 9 điểm b NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm b' },
  { id: 't2', group: 'Xe tải / Xe buýt', vehicle: 'Xe tải, xe khách, xe buýt', behavior: 'Chạy quá tốc độ trên 35 km/h', fine: '12.000.000 - 14.000.000', points: '6', license: '', basis: 'Điều 6 khoản 7 điểm a NĐ 168/2024', pointBasis: 'Điều 6 khoản 16 điểm c' },
  { id: 't3', group: 'Xe tải / Xe buýt', vehicle: 'Xe tải', behavior: 'Chở hàng vượt trọng tải cho phép trên 10% đến 30% (trừ ngưỡng riêng của xe xi téc)', fine: '800.000 - 1.000.000', points: '0', license: '', basis: 'Điều 21 khoản 2 điểm a NĐ 168/2024', pointBasis: 'Không thuộc nhóm trừ điểm tại khoản 13 Điều 21' },
  { id: 't4', group: 'Xe tải / Xe buýt', vehicle: 'Xe tải', behavior: 'Chở hàng vượt trọng tải cho phép trên 30% đến 50%', fine: '3.000.000 - 5.000.000', points: '2', license: '', basis: 'Điều 21 khoản 5 điểm a NĐ 168/2024', pointBasis: 'Điều 21 khoản 13 điểm a' },
  { id: 't5', group: 'Xe tải / Xe buýt', vehicle: 'Xe tải', behavior: 'Chở hàng vượt trọng tải cho phép trên 50% đến 100%', fine: '5.000.000 - 7.000.000', points: '4', license: '', basis: 'Điều 21 khoản 6 điểm a NĐ 168/2024', pointBasis: 'Điều 21 khoản 13 điểm b' },
  { id: 't6', group: 'Xe tải / Xe buýt', vehicle: 'Xe tải', behavior: 'Chở hàng vượt trọng tải cho phép trên 100% đến 150%', fine: '7.000.000 - 8.000.000', points: '8', license: '', basis: 'Điều 21 khoản 7 điểm a NĐ 168/2024', pointBasis: 'Điều 21 khoản 13 điểm d' },
  { id: 't7', group: 'Xe tải / Xe buýt', vehicle: 'Xe tải', behavior: 'Chở hàng vượt trọng tải cho phép trên 150%', fine: '8.000.000 - 12.000.000', points: '10', license: '', basis: 'Điều 21 khoản 8 điểm a NĐ 168/2024', pointBasis: 'Điều 21 khoản 13 điểm đ' },
  { id: 't8', group: 'Xe tải / Xe buýt', vehicle: 'Xe khách, xe buýt', behavior: 'Đón, trả hành khách không đúng nơi quy định trên tuyến đã xác định điểm đón, trả khách', fine: '1.000.000 - 2.000.000', points: '2', license: '', basis: 'Điều 20 khoản 5 điểm c NĐ 168/2024', pointBasis: 'Điều 20 khoản 10 điểm a' },
];

const GROUPS = ['Tất cả', ...Array.from(new Set(BASE_RULES.map((rule) => rule.group)))];
const STORAGE_KEY = 'vc_custom_rules';
const EMPTY_FORM = { group: '', vehicle: '', behavior: '', fine: '', points: '0', license: '', basis: '', pointBasis: '' };

function loadCustom(): Rule[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveCustom(rules: Rule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

function pointText(points: string) {
  const value = String(points || '0').trim();
  return value !== '0' ? `-${value}` : '—';
}

function pointLongText(points: string) {
  const value = String(points || '0').trim();
  return value !== '0' ? `Trừ ${value} điểm GPLX` : 'Không trừ điểm GPLX';
}

function parseFineRange(value: string) {
  const amounts = (value.match(/\d[\d.]*/g) || [])
    .map((part) => Number(part.replace(/\./g, '')))
    .filter(Number.isFinite);

  return {
    min: amounts[0] || 0,
    max: amounts[1] ?? amounts[0] ?? 0,
  };
}

export default function ViolationCatalog() {
  const [custom, setCustom] = useState<Rule[]>(() => (typeof window !== 'undefined' ? loadCustom() : []));
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('Tất cả');
  const [selected, setSelected] = useState<Rule | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const all = useMemo(() => [...BASE_RULES, ...custom], [custom]);
  const pointStats = useMemo(() => {
    return ['2', '4', '6', '8', '10'].map((point) => ({
      point,
      count: all.filter((rule) => rule.points === point).length,
    }));
  }, [all]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return all.filter((rule) =>
      (group === 'Tất cả' || rule.group === group) &&
      (!q ||
        rule.behavior.toLowerCase().includes(q) ||
        rule.fine.includes(q) ||
        rule.basis.toLowerCase().includes(q) ||
        rule.pointBasis.toLowerCase().includes(q))
    );
  }, [all, search, group]);
  const sortedRules = useMemo(() => {
    if (!sortConfig) return filtered;

    return [...filtered].sort((left, right) => {
      let comparison = 0;

      if (sortConfig.field === 'fine') {
        const leftFine = parseFineRange(left.fine);
        const rightFine = parseFineRange(right.fine);
        comparison = leftFine.min - rightFine.min || leftFine.max - rightFine.max;
      } else {
        comparison = (Number(left.points) || 0) - (Number(right.points) || 0);
      }

      if (comparison === 0) {
        comparison = left.behavior.localeCompare(right.behavior, 'vi');
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filtered, sortConfig]);

  const addRule = () => {
    if (!form.behavior || !form.group || !form.fine || !form.basis) return;
    const next = [...custom, { ...form, id: `u${Date.now()}`, custom: true }];
    setCustom(next);
    saveCustom(next);
    setForm(EMPTY_FORM);
    setShowAdd(false);
  };

  const removeRule = (id: string) => {
    const next = custom.filter((rule) => rule.id !== id);
    setCustom(next);
    saveCustom(next);
    setDeleteId(null);
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">Bảng tra cứu căn cứ xử phạt giao thông</h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              Căn cứ pháp lý: Nghị định 168/2024/NĐ-CP (quy định xử phạt vi phạm hành chính về trật tự, an toàn giao thông đường bộ). Cột điểm GPLX thể hiện số điểm bị trừ theo từng nhóm hành vi.
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-700 lg:max-w-sm">
            Hệ thống áp dụng biểu khung tiền phạt và trừ điểm giấy phép lái xe chuẩn theo Nghị định 168/2024/NĐ-CP.
          </div>
        </div>
      </div>


      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {pointStats.map((item) => (
          <div key={item.point} className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Trừ {item.point} điểm</p>
            <p className="text-lg font-bold text-slate-950">{item.count}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm hành vi, mức phạt, căn cứ, điểm GPLX..."
          className="min-w-[180px] flex-1 rounded border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
        <select value={group} onChange={(event) => setGroup(event.target.value)} className="rounded border border-slate-200 px-3 py-2 text-sm focus:outline-none">
          {GROUPS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button onClick={() => setShowAdd(true)} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
          + Thêm quy định
        </button>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {filtered.length} quy định · {custom.length} tùy chỉnh
      </p>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nhóm</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Hành vi vi phạm</th>
              <th className="hidden w-52 px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:table-cell">
                <div className="flex items-center justify-end gap-1.5">
                  <span>Mức phạt (VNĐ)</span>
                  <span className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setSortConfig({ field: 'fine', direction: 'asc' })}
                      aria-label="Sắp xếp mức phạt từ thấp đến cao"
                      title="Thấp đến cao"
                      className={`rounded p-1 transition ${sortConfig?.field === 'fine' && sortConfig.direction === 'asc' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortConfig({ field: 'fine', direction: 'desc' })}
                      aria-label="Sắp xếp mức phạt từ cao đến thấp"
                      title="Cao đến thấp"
                      className={`rounded p-1 transition ${sortConfig?.field === 'fine' && sortConfig.direction === 'desc' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              </th>
              <th className="hidden w-36 px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 lg:table-cell">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Điểm GPLX</span>
                  <span className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setSortConfig({ field: 'points', direction: 'asc' })}
                      aria-label="Sắp xếp điểm GPLX từ thấp đến cao"
                      title="Thấp đến cao"
                      className={`rounded p-1 transition ${sortConfig?.field === 'points' && sortConfig.direction === 'asc' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortConfig({ field: 'points', direction: 'desc' })}
                      aria-label="Sắp xếp điểm GPLX từ cao đến thấp"
                      title="Cao đến thấp"
                      className={`rounded p-1 transition ${sortConfig?.field === 'points' && sortConfig.direction === 'desc' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              </th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-slate-400">Không tìm thấy quy định phù hợp.</td>
              </tr>
            )}
            {sortedRules.map((rule) => (
              <tr
                key={rule.id}
                id={`rule-${rule.id}`}
                onClick={() => setSelected(rule)}
                className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
              >
                <td className="px-3 py-2.5 align-top">
                  <span className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{rule.group}</span>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <p className="font-medium text-slate-900">{rule.behavior}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{rule.basis}</p>
                  <p className="mt-0.5 text-[11px] text-blue-600">{rule.pointBasis}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {rule.custom && <span className="text-[10px] font-semibold text-blue-600">Tùy chỉnh</span>}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        goTo({ view: 'cases', tab: 'cases' }, { violation: rule.behavior });
                      }}
                      className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
                    >
                      <FolderOpen className="h-3 w-3" />
                      Hồ sơ thuộc quy định này &rarr;
                    </button>
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 text-right align-top md:table-cell">
                  <p className="text-xs font-semibold text-slate-900">{rule.fine}</p>
                  {rule.license && <p className="mt-0.5 text-[11px] text-amber-700">{rule.license}</p>}
                </td>
                <td className="hidden px-3 py-2.5 text-center align-top lg:table-cell">
                  <span className={`text-xs font-bold ${rule.points !== '0' ? 'text-red-600' : 'text-slate-300'}`}>{pointText(rule.points)}</span>
                </td>
                <td className="px-2 py-2.5 text-center align-top">
                  {rule.custom && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteId(rule.id);
                      }}
                      className="text-lg leading-none text-slate-300 transition hover:text-red-500"
                      title="Xóa"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-5 text-slate-400">
        <span className="font-semibold text-slate-600">Lưu ý:</span> Dữ liệu phục vụ tra cứu tiêu chuẩn trên hệ thống TrafficAI, cần đối chiếu văn bản quy phạm pháp luật và tình tiết thực tế trước khi ban hành quyết định xử lý vi phạm.
      </p>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between bg-slate-950 px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-slate-400">{selected.group} · {selected.id}</p>
                <h3 className="mt-1 text-base font-bold text-white">{selected.behavior}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="px-1 text-2xl leading-none text-slate-400 hover:text-white">×</button>
            </div>
            <div className="space-y-3 p-5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Mức phạt tiền</p>
                  <p className="font-bold text-slate-950">{selected.fine} đồng</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Điểm GPLX</p>
                  <p className={`font-bold ${selected.points !== '0' ? 'text-red-600' : 'text-slate-400'}`}>{pointLongText(selected.points)}</p>
                </div>
              </div>
              {selected.license && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-amber-700">Hình thức bổ sung</p>
                  <p className="font-semibold text-amber-900">{selected.license}</p>
                </div>
              )}
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Phương tiện áp dụng</p>
                <p className="text-slate-700">{selected.vehicle}</p>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Căn cứ pháp lý</p>
                <p className="text-xs text-slate-600">{selected.basis}</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Căn cứ trừ điểm GPLX</p>
                <p className="text-xs text-slate-600">{selected.pointBasis}</p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const beh = selected.behavior;
                    setSelected(null);
                    goTo({ view: 'cases', tab: 'cases' }, { violation: beh });
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-blue-700 transition"
                >
                  <FolderOpen className="h-4 w-4" />
                  Xem danh sách hồ sơ vi phạm theo quy định này &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between bg-slate-950 px-5 py-4">
              <h3 className="font-bold text-white">Thêm quy định mới</h3>
              <button onClick={() => setShowAdd(false)} className="text-2xl text-slate-400 hover:text-white">×</button>
            </div>
            <div className="space-y-3 p-5 text-sm">
              {[
                ['Nhóm', 'group', 'Ô tô / Xe máy / ...'],
                ['Phương tiện', 'vehicle', 'Ô tô'],
                ['Hành vi vi phạm', 'behavior', 'Mô tả hành vi...'],
                ['Mức phạt (VNĐ)', 'fine', 'VD: 1.000.000 - 2.000.000'],
                ['Điểm GPLX', 'points', '0 / 2 / 4 / 6 / 8 / 10'],
                ['Hình thức bổ sung', 'license', 'VD: Tước GPLX 1 - 3 tháng'],
                ['Căn cứ pháp lý', 'basis', 'VD: Điều 6 khoản 5 NĐ 168/2024'],
                ['Căn cứ trừ điểm GPLX', 'pointBasis', 'VD: Điều 6 khoản 16 điểm a'],
              ].map(([label, key, placeholder]) => (
                <div key={key}>
                  <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{label}</label>
                  <input
                    value={(form as any)[key]}
                    onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <button onClick={addRule} className="flex-1 rounded bg-slate-900 py-2 font-semibold text-white transition hover:bg-slate-700">Thêm quy định</button>
                <button onClick={() => setShowAdd(false)} className="flex-1 rounded border border-slate-200 py-2 font-semibold text-slate-600 transition hover:bg-slate-50">Hủy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <p className="mb-2 font-bold text-slate-950">Xóa quy định?</p>
            <p className="mb-5 text-sm text-slate-500">Hành động này không thể hoàn tác.</p>
            <div className="flex gap-3">
              <button onClick={() => removeRule(deleteId)} className="flex-1 rounded bg-red-600 py-2 font-semibold text-white transition hover:bg-red-700">Xóa</button>
              <button onClick={() => setDeleteId(null)} className="flex-1 rounded border border-slate-200 py-2 font-semibold text-slate-600 transition hover:bg-slate-50">Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
