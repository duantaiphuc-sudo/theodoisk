// src/utils/adaptiveThresholds.ts
import { AlertThresholds, AuthUser } from '../types';

export interface MedicalConditionOption {
  id: string;
  name: string;
  category: 'spine' | 'cardio' | 'respiratory' | 'sedentary';
  description: string;
}

export const COMMON_MEDICAL_CONDITIONS: MedicalConditionOption[] = [
  {
    id: 'spine_degeneration',
    name: 'Thoái hóa cột sống / Đĩa đệm',
    category: 'spine',
    description: 'Thoát vị đĩa đệm, thoái hóa đốt sống cổ/thắt lưng, đau thần kinh tọa'
  },
  {
    id: 'cervical_strain',
    name: 'Hội chứng đau cổ vai gáy',
    category: 'spine',
    description: 'Căng cơ cổ mãn tính do ngồi máy tính sai tư thế lâu ngày'
  },
  {
    id: 'hypertension',
    name: 'Tăng huyết áp / Tiền cao huyết áp',
    category: 'cardio',
    description: 'Huyết áp thường xuyên dao động hoặc trên 130/85 mmHg'
  },
  {
    id: 'arrhythmia_heart',
    name: 'Bệnh tim mạch / Rối loạn nhịp',
    category: 'cardio',
    description: 'Tiền sử hồi hộp, tim đập nhanh hoặc thiếu máu cơ tim'
  },
  {
    id: 'respiratory_asthma',
    name: 'Bệnh hô hấp / Hen suyễn / COPD',
    category: 'respiratory',
    description: 'Nhạy cảm với nồng độ oxy phòng kín, dễ khó thở khi căng thẳng'
  },
  {
    id: 'sedentary_fatigue',
    name: 'Mệt mỏi suy nhược văn phòng',
    category: 'sedentary',
    description: 'Thường xuyên hoa mắt chóng mặt khi ngồi làm việc liên tục'
  }
];

export interface AdaptiveThresholdResult {
  thresholds: AlertThresholds;
  clinicalSummary: string;
  riskLevel: 'standard' | 'moderate' | 'high_attention';
  personalizedTips: string[];
}

/**
 * Tính toán tự động các ngưỡng đo y tế & công thái học (Adaptive Medical Thresholds)
 * Dựa trên Giới tính, Tuổi, Chỉ số BMI và Tiền sử bệnh nền theo hướng dẫn y khoa lao động.
 */
export function calculateAdaptiveThresholds(
  user: Partial<AuthUser> & { medicalConditions?: string[] }
): AdaptiveThresholdResult {
  const gender = user.gender || 'male';
  const age = Math.max(16, Math.min(90, Number(user.age) || 28));
  const heightM = (Number(user.height) || 170) / 100;
  const weightKg = Number(user.weight) || 65;
  const bmi = heightM > 0 ? weightKg / (heightM * heightM) : 22;

  // Lấy danh sách bệnh nền từ mảng id hoặc tìm kiếm trong ghi chú y tế
  const conditionList = Array.isArray(user.medicalConditions) ? user.medicalConditions : [];
  const healthNotes = (user.healthNotes || '').toLowerCase();

  const hasSpineIssue = conditionList.some(c => c.includes('spine') || c.includes('cervical')) ||
    healthNotes.includes('cột sống') || healthNotes.includes('đĩa đệm') || healthNotes.includes('thoái hóa') || healthNotes.includes('cổ vai gáy') || healthNotes.includes('gù lưng');

  const hasCardioIssue = conditionList.some(c => c.includes('heart') || c.includes('hypertension') || c.includes('arrhythmia')) ||
    healthNotes.includes('tim') || healthNotes.includes('huyết áp') || healthNotes.includes('nhịp tim');

  const hasRespiratoryIssue = conditionList.some(c => c.includes('respiratory') || c.includes('asthma')) ||
    healthNotes.includes('hô hấp') || healthNotes.includes('phổi') || healthNotes.includes('hen') || healthNotes.includes('khó thở');

  const isSenior = age >= 45;
  const isElderly = age >= 55;
  const isOverweight = bmi >= 25;

  // 1. Nhịp tim tối đa an toàn khi làm việc văn phòng (hrMax)
  // Công thức y khoa lao động: Nhịp tim tối đa lý thuyết Tanaka = 208 - 0.7 * age.
  // Giới hạn an toàn tại bàn làm việc tĩnh thường <= 55% - 60% HR max.
  let calculatedHrMax = 110;
  if (isElderly) {
    calculatedHrMax = 96;
  } else if (isSenior) {
    calculatedHrMax = 100;
  } else {
    calculatedHrMax = 106;
  }

  // Phụ nữ có nhịp tim nghỉ ngơi sinh lý cao hơn nam trung bình 3-5 bpm
  if (gender === 'female') {
    calculatedHrMax += 3;
  }

  // Nếu có bệnh tim mạch / cao huyết áp: Hạ thấp ngưỡng cảnh báo để phát hiện sớm căng thẳng/lo âu
  if (hasCardioIssue) {
    calculatedHrMax = Math.min(calculatedHrMax, 94);
  }

  // 2. Nhịp tim tối thiểu an toàn (hrMin)
  let calculatedHrMin = 50;
  if (hasCardioIssue || isElderly) {
    calculatedHrMin = 55; // Nâng ngưỡng phát hiện sớm nhịp tim chậm xoang / thiếu máu não
  }

  // 3. Nồng độ oxy SpO2 tối thiểu an toàn (spo2Min)
  let calculatedSpo2Min = 94;
  if (hasRespiratoryIssue || isElderly) {
    calculatedSpo2Min = 95; // Cảnh báo sớm hơn để người bệnh hô hấp mở thoáng phòng hoặc hít thở sâu
  }

  // 4. Thời gian ngồi liên tục tối đa khuyến nghị (longSittingSec)
  // Tiêu chuẩn bình thường: 45 - 60 phút (2700s - 3600s)
  let calculatedLongSittingSec = 3600; // 60 phút
  if (hasSpineIssue) {
    calculatedLongSittingSec = 1800; // 30 phút: Yêu cầu khắt khe giải phóng áp lực nội đĩa đệm
  } else if (isSenior || isOverweight) {
    calculatedLongSittingSec = 2400; // 40 phút
  } else {
    calculatedLongSittingSec = 2700; // 45 phút (chuẩn công thái học quốc tế Pomodoro)
  }

  // 5. Ngưỡng phát hiện và cảnh báo sai tư thế (incorrectPostureSec & longIncorrectSec)
  let calculatedIncorrectSec = 30;
  let calculatedLongIncorrectSec = 120; // 2 phút
  if (hasSpineIssue) {
    calculatedIncorrectSec = 20; // Báo sớm khi mới cúi gù
    calculatedLongIncorrectSec = 60; // 1 phút đã còi cảnh báo khẩn cấp
  }

  // Đánh giá mức độ rủi ro & lời khuyên lâm sàng
  let riskLevel: 'standard' | 'moderate' | 'high_attention' = 'standard';
  const tips: string[] = [];

  if (hasSpineIssue && hasCardioIssue) {
    riskLevel = 'high_attention';
  } else if (hasSpineIssue || hasCardioIssue || hasRespiratoryIssue || isSenior) {
    riskLevel = 'moderate';
  }

  // Lời khuyên cá nhân hóa
  if (hasSpineIssue) {
    tips.push('Rút ngắn chu kỳ ngồi tối đa còn 30 phút để giải phóng áp lực đốt sống L4-L5 và cổ C5-C7.');
    tips.push('Độ nhạy cảnh báo cúi đầu/gù lưng được kích hoạt ở mức cao (cảnh báo sau 60 giây).');
  } else {
    tips.push('Duy trì tỷ lệ công thái học 45 phút ngồi : 15 phút đứng làm việc.');
  }

  if (hasCardioIssue) {
    tips.push(`Ngưỡng cảnh báo nhịp tim được điều chỉnh về ${calculatedHrMin} - ${calculatedHrMax} BPM để phát hiện sớm căng thẳng.`);
  }

  if (hasRespiratoryIssue) {
    tips.push(`Ngưỡng SpO₂ cảnh báo sớm ở mức < ${calculatedSpo2Min}% hỗ trợ phát hiện thiếu oxy trong phòng máy lạnh.`);
  }

  if (gender === 'female') {
    tips.push('Đã tối ưu hóa đường cơ sở nhịp tim sinh lý phù hợp cho nữ giới.');
  }

  const genderLabel = gender === 'male' ? 'Nam' : gender === 'female' ? 'Nữ' : 'Khác';
  const conditionsText = [
    hasSpineIssue ? 'Cột sống/Cổ' : '',
    hasCardioIssue ? 'Tim mạch/Huyết áp' : '',
    hasRespiratoryIssue ? 'Hô hấp' : '',
    isSenior ? 'Lớn tuổi' : ''
  ].filter(Boolean).join(', ') || 'Thể trạng bình thường';

  const clinicalSummary = `Tự động tối ưu cho ${genderLabel}, ${age} tuổi (${conditionsText}): Ngồi tối đa ${Math.round(calculatedLongSittingSec / 60)}p • Nhịp tim ${calculatedHrMin}-${calculatedHrMax} BPM • SpO₂ ≥ ${calculatedSpo2Min}%.`;

  return {
    thresholds: {
      hrMin: calculatedHrMin,
      hrMax: calculatedHrMax,
      spo2Min: calculatedSpo2Min,
      incorrectPostureSec: calculatedIncorrectSec,
      longIncorrectSec: calculatedLongIncorrectSec,
      longSittingSec: calculatedLongSittingSec,
      standingTargetSec: 300,
      standingResetSec: 300,
      soundEnabled: true,
      voiceAlertEnabled: true,
      outOfZoneAlertEnabled: false,
      browserNotificationEnabled: true,
    },
    clinicalSummary,
    riskLevel,
    personalizedTips: tips
  };
}
