import {
  AlertThresholds,
  AuthUser,
  HealthTelemetry,
  TelemetryLog,
  TimeCalculations,
  UserTaskNotification,
} from '../types';
import { calculateAdaptiveThresholds } from './adaptiveThresholds';
import { OHPSCalculationResult } from './ohpsCalculator';

export interface HourlyForecastPoint {
  hourLabel: string;
  hour: number;
  actualFocusScore: number | null;
  predictedFocusScore: number;
  avgBpm: number | null;
  avgSpo2: number | null;
  badPostureRatio: number | null;
  sampleCount: number;
  isFuture: boolean;
}

export interface ExploitationPurposeCard {
  id: string;
  title: string;
  category: string;
  statusLabel: string;
  inputSignals: string[];
  processingMethod: string;
  liveMetricLabel: string;
  liveMetricValue: string;
  businessValue: string;
}

export interface ThresholdDiffItem {
  key: keyof AlertThresholds;
  label: string;
  currentValue: number;
  suggestedValue: number;
  unit: string;
  reason: string;
}

export interface PredictiveAnalyticsSummary {
  sampleCount: number;
  validVitalCount: number;
  sittingSamples: number;
  badSamples: number;
  standingSamples: number;
  avgBpm: number;
  avgSpo2: number;
  goodPostureRatio: number;
  ohpsForecast: {
    currentScore: number;
    predictedScore: number;
    delta: number;
    confidencePercent: number;
    trendLabel: 'Cải thiện' | 'Ổn định' | 'Có xu hướng giảm';
    trendReason: string;
  };
  postureFatigue: {
    neckSpineRiskPercent: number;
    lumbarRiskPercent: number;
    overallRiskLevel: 'Thấp' | 'Trung bình' | 'Cao';
    predictedMinutesUntilSlouch: number;
    badPostureSharePercent: number;
  };
  vitalCorrelation: {
    goodPostureAvgBpm: number;
    badPostureAvgBpm: number;
    bpmDriftOnSlouch: number;
    goodPostureAvgSpo2: number;
    badPostureAvgSpo2: number;
    spo2DriftOnSlouch: number;
    anomalyCount: number;
    stressIndex: number;
  };
  circadian: {
    goldenHoursWindow: string;
    slumpRiskWindow: string;
    hourlyCurve: HourlyForecastPoint[];
  };
  recommendedBreakCadence: {
    sitMinutes: number;
    standMinutes: number;
    eyeBreakSeconds: number;
    rationale: string;
  };
  suggestedThresholds: AlertThresholds;
  thresholdDiffs: ThresholdDiffItem[];
  exploitationMatrix: ExploitationPurposeCard[];
}

function isBadPostureLog(log: TelemetryLog): boolean {
  if (log.postureStatus === 1 || log.postureStatus === 3) return true;
  const label = (log.postureLabel || '').toLowerCase();
  return (
    label.includes('sai') ||
    label.includes('cúi') ||
    label.includes('gù') ||
    label.includes('lệch')
  );
}

function isGoodPostureLog(log: TelemetryLog): boolean {
  if (log.postureStatus === 0) return true;
  const label = (log.postureLabel || '').toLowerCase();
  return !isBadPostureLog(log) && (label.includes('đúng') || label.includes('chuẩn') || label.includes('thẳng'));
}

function isStandingLog(log: TelemetryLog): boolean {
  if (log.postureStatus === 5) return true;
  const label = (log.postureLabel || '').toLowerCase();
  return label.includes('đứng') || label.includes('standing');
}

function isAbsentLog(log: TelemetryLog): boolean {
  if (log.postureStatus === 2 || log.postureStatus === -1) return true;
  const label = (log.postureLabel || '').toLowerCase();
  return label.includes('vắng') || label.includes('rời ghế') || label.includes('ngoài vùng') || label.includes('lỗi');
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Bộ máy phân tích & dự đoán định lượng từ dữ liệu đã thu thập
 * (Telemetry Logs + TimeCounters + Adaptive Medical Profile + OHPS)
 */
export function buildPredictiveAnalytics(params: {
  history: TelemetryLog[];
  timeStats: TimeCalculations;
  thresholds: AlertThresholds;
  currentUser: AuthUser | null;
  telemetry?: HealthTelemetry;
  ohpsData?: OHPSCalculationResult;
  tasks?: UserTaskNotification[];
}): PredictiveAnalyticsSummary {
  const { history, timeStats, thresholds, currentUser, telemetry, ohpsData, tasks = [] } = params;

  const sortedLogs = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const sampleCount = sortedLogs.length;
  const activeSittingLogs = sortedLogs.filter(l => !isStandingLog(l) && !isAbsentLog(l));
  const goodLogs = activeSittingLogs.filter(isGoodPostureLog);
  const badLogs = activeSittingLogs.filter(isBadPostureLog);
  const standingLogs = sortedLogs.filter(isStandingLog);

  const validVitalLogs = sortedLogs.filter(l => Number(l.bpm) > 0 && Number(l.spo2) > 0);
  const avgBpm =
    validVitalLogs.length > 0
      ? Math.round(validVitalLogs.reduce((s, l) => s + Number(l.bpm), 0) / validVitalLogs.length)
      : Number(telemetry?.bpm || 0);
  const avgSpo2 =
    validVitalLogs.length > 0
      ? Number((validVitalLogs.reduce((s, l) => s + Number(l.spo2), 0) / validVitalLogs.length).toFixed(1))
      : Number(telemetry?.spo2 || 0);

  const sittingTimeSec = Math.max(0, timeStats?.sittingSeconds || 0);
  const badTimeSec = Math.max(0, timeStats?.badPostureSeconds || 0);
  const standingTimeSec = Math.max(0, (timeStats?.standingSeconds || 0) + (timeStats?.movingSeconds || 0));

  const logGoodRatio =
    activeSittingLogs.length > 0
      ? Math.round((goodLogs.length / activeSittingLogs.length) * 100)
      : 100;
  const timeGoodRatio =
    sittingTimeSec > 0
      ? clamp(Math.round(((sittingTimeSec - badTimeSec) / sittingTimeSec) * 100), 0, 100)
      : logGoodRatio;
  const goodPostureRatio =
    activeSittingLogs.length > 0
      ? Math.round(logGoodRatio * 0.7 + timeGoodRatio * 0.3)
      : timeGoodRatio;

  // 1. Tương quan sinh hiệu theo tư thế (Cardio-Respiratory Correlation)
  const goodVitalLogs = validVitalLogs.filter(isGoodPostureLog);
  const badVitalLogs = validVitalLogs.filter(isBadPostureLog);

  const goodPostureAvgBpm =
    goodVitalLogs.length > 0
      ? Math.round(goodVitalLogs.reduce((s, l) => s + Number(l.bpm), 0) / goodVitalLogs.length)
      : avgBpm;
  const badPostureAvgBpm =
    badVitalLogs.length > 0
      ? Math.round(badVitalLogs.reduce((s, l) => s + Number(l.bpm), 0) / badVitalLogs.length)
      : goodPostureAvgBpm;
  const bpmDriftOnSlouch = badVitalLogs.length > 0 && goodVitalLogs.length > 0
    ? badPostureAvgBpm - goodPostureAvgBpm
    : 0;

  const goodPostureAvgSpo2 =
    goodVitalLogs.length > 0
      ? Number((goodVitalLogs.reduce((s, l) => s + Number(l.spo2), 0) / goodVitalLogs.length).toFixed(1))
      : avgSpo2;
  const badPostureAvgSpo2 =
    badVitalLogs.length > 0
      ? Number((badVitalLogs.reduce((s, l) => s + Number(l.spo2), 0) / badVitalLogs.length).toFixed(1))
      : goodPostureAvgSpo2;
  const spo2DriftOnSlouch = badVitalLogs.length > 0 && goodVitalLogs.length > 0
    ? Number((badPostureAvgSpo2 - goodPostureAvgSpo2).toFixed(1))
    : 0;

  const anomalyCount = validVitalLogs.filter(
    l =>
      Number(l.bpm) < (thresholds.hrMin || 50) ||
      Number(l.bpm) > (thresholds.hrMax || 110) ||
      Number(l.spo2) < (thresholds.spo2Min || 94)
  ).length;

  const hrStressComponent =
    avgBpm > 0
      ? clamp(Math.round(((avgBpm - 65) / Math.max(15, (thresholds.hrMax || 110) - 65)) * 55), 0, 60)
      : 15;
  const spo2Penalty = avgSpo2 > 0 && avgSpo2 < 96 ? (96 - avgSpo2) * 12 : 0;
  const badPosturePenalty = Math.round((100 - goodPostureRatio) * 0.45);
  const stressIndex = clamp(Math.round(hrStressComponent + spo2Penalty + badPosturePenalty), 5, 98);

  // 2. Dự báo rủi ro cơ xương khớp (Musculoskeletal Risk Forecast)
  const badPostureSharePercent = clamp(100 - goodPostureRatio, 0, 100);
  const continuousSitRatio =
    thresholds.longSittingSec > 0
      ? clamp((timeStats.continuousSittingSeconds || 0) / thresholds.longSittingSec, 0, 1.5)
      : 0;

  const hasSpineHistory = Boolean(
    currentUser?.medicalConditions?.some(c => c.includes('spine') || c.includes('cervical')) ||
      (currentUser?.healthNotes || '').toLowerCase().includes('cổ') ||
      (currentUser?.healthNotes || '').toLowerCase().includes('lưng')
  );

  const neckSpineRiskPercent = clamp(
    Math.round(badPostureSharePercent * 0.72 + continuousSitRatio * 20 + (hasSpineHistory ? 14 : 4)),
    5,
    96
  );
  const lumbarRiskPercent = clamp(
    Math.round(
      badPostureSharePercent * 0.52 +
        continuousSitRatio * 34 +
        (standingTimeSec < 180 && sittingTimeSec > 1800 ? 12 : 0) +
        (hasSpineHistory ? 12 : 3)
    ),
    6,
    96
  );
  const overallRiskAvg = Math.round((neckSpineRiskPercent + lumbarRiskPercent) / 2);
  const overallRiskLevel: 'Thấp' | 'Trung bình' | 'Cao' =
    overallRiskAvg >= 60 ? 'Cao' : overallRiskAvg >= 32 ? 'Trung bình' : 'Thấp';

  const baseFatigueWindowMin = hasSpineHistory ? 25 : 42;
  const predictedMinutesUntilSlouch = clamp(
    Math.round(baseFatigueWindowMin * (0.45 + (goodPostureRatio / 100) * 0.75) - continuousSitRatio * 10),
    5,
    60
  );

  // 3. Phân tích nhịp điệu tập trung theo giờ & dự đoán 2 khung giờ tiếp theo
  const currentHour = new Date().getHours();
  const hourlyBuckets: Record<
    number,
    { good: number; total: number; bpmSum: number; bpmCnt: number; spo2Sum: number; spo2Cnt: number }
  > = {};

  sortedLogs.forEach(log => {
    const d = new Date(log.timestamp);
    if (isNaN(d.getTime())) return;
    const h = d.getHours();
    if (!hourlyBuckets[h]) {
      hourlyBuckets[h] = { good: 0, total: 0, bpmSum: 0, bpmCnt: 0, spo2Sum: 0, spo2Cnt: 0 };
    }
    const bucket = hourlyBuckets[h];
    if (!isAbsentLog(log)) {
      bucket.total++;
      if (isGoodPostureLog(log) || isStandingLog(log)) {
        bucket.good++;
      }
    }
    if (Number(log.bpm) > 0) {
      bucket.bpmSum += Number(log.bpm);
      bucket.bpmCnt++;
    }
    if (Number(log.spo2) > 0) {
      bucket.spo2Sum += Number(log.spo2);
      bucket.spo2Cnt++;
    }
  });

  const hoursRange = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const hourlyCurve: HourlyForecastPoint[] = hoursRange.map(h => {
    const bucket = hourlyBuckets[h];
    const hasReal = Boolean(bucket && bucket.total > 0);
    const actualFocusScore = hasReal ? Math.round((bucket.good / bucket.total) * 100) : null;
    const badRatio = hasReal ? Math.round(((bucket.total - bucket.good) / bucket.total) * 100) : null;
    const hBpm = bucket && bucket.bpmCnt > 0 ? Math.round(bucket.bpmSum / bucket.bpmCnt) : null;
    const hSpo2 = bucket && bucket.spo2Cnt > 0 ? Number((bucket.spo2Sum / bucket.spo2Cnt).toFixed(1)) : null;

    // Circadian baseline curve (morning peak 9-11h, post-lunch dip 13-15h, afternoon recovery 16h)
    const circadianOffset =
      h >= 9 && h <= 11 ? 6 : h >= 13 && h <= 15 ? -10 : h >= 17 ? -6 : 0;
    const baseScore = goodPostureRatio > 0 ? goodPostureRatio : 82;
    const predictedFocusScore = hasReal && actualFocusScore !== null
      ? Math.round(actualFocusScore * 0.75 + clamp(baseScore + circadianOffset, 45, 98) * 0.25)
      : clamp(Math.round(baseScore + circadianOffset), 40, 98);

    return {
      hourLabel: `${String(h).padStart(2, '0')}:00`,
      hour: h,
      actualFocusScore,
      predictedFocusScore,
      avgBpm: hBpm,
      avgSpo2: hSpo2,
      badPostureRatio: badRatio,
      sampleCount: bucket?.total || 0,
      isFuture: h > currentHour,
    };
  });

  const populatedHours = hourlyCurve.filter(p => p.actualFocusScore !== null);
  let goldenHoursWindow = '09:00 - 11:00';
  let slumpRiskWindow = '14:00 - 15:30';
  if (populatedHours.length >= 2) {
    const sortedByFocus = [...populatedHours].sort(
      (a, b) => (b.actualFocusScore || 0) - (a.actualFocusScore || 0)
    );
    const bestH = sortedByFocus[0].hour;
    const worstH = sortedByFocus[sortedByFocus.length - 1].hour;
    goldenHoursWindow = `${String(bestH).padStart(2, '0')}:00 - ${String(Math.min(23, bestH + 2)).padStart(2, '0')}:00`;
    slumpRiskWindow = `${String(worstH).padStart(2, '0')}:00 - ${String(Math.min(23, worstH + 1)).padStart(2, '0')}:30`;
  }

  // 4. Dự báo OHPS ca tiếp theo bằng hồi quy nửa đầu vs nửa sau chuỗi log
  const currentOhps =
    ohpsData && ohpsData.hasActualData ? ohpsData.ohpsScore : Math.round(goodPostureRatio * 0.7 + 25);

  let trendSlope = 0;
  if (activeSittingLogs.length >= 6) {
    const mid = Math.floor(activeSittingLogs.length / 2);
    const firstHalf = activeSittingLogs.slice(0, mid);
    const secondHalf = activeSittingLogs.slice(mid);
    const firstGood = (firstHalf.filter(isGoodPostureLog).length / firstHalf.length) * 100;
    const secondGood = (secondHalf.filter(isGoodPostureLog).length / secondHalf.length) * 100;
    trendSlope = secondGood - firstGood;
  }

  const breakBonus = standingTimeSec >= (thresholds.standingTargetSec || 300) ? 3 : -2;
  const predictedDelta = clamp(Math.round(trendSlope * 0.28 + breakBonus), -15, 14);
  const predictedOhps = clamp(currentOhps + predictedDelta, 35, 99);
  const trendLabel: 'Cải thiện' | 'Ổn định' | 'Có xu hướng giảm' =
    predictedDelta >= 3 ? 'Cải thiện' : predictedDelta <= -3 ? 'Có xu hướng giảm' : 'Ổn định';
  const confidencePercent = clamp(
    Math.round(35 + Math.min(45, sampleCount * 0.9) + (validVitalLogs.length > 0 ? 15 : 0)),
    30,
    95
  );

  const trendReason =
    sampleCount < 4
      ? 'Đang tổng hợp từ nền dữ liệu khởi tạo; tiếp tục thu thập thêm log từ Pi 4 để tăng độ chính xác hồi quy.'
      : trendSlope > 4
      ? `Nửa sau chuỗi đo cho thấy tỷ lệ giữ tư thế đúng tăng +${Math.round(trendSlope)}% so với giai đoạn đầu ca.`
      : trendSlope < -4
      ? `Tỷ lệ gù lưng / cúi cổ có xu hướng tăng ${Math.abs(Math.round(trendSlope))}% về cuối phiên làm việc.`
      : 'Chỉ số tư thế và sinh hiệu duy trì ổn định đều đặn giữa các khung giờ.';

  // 5. Đề xuất tối ưu ngưỡng thông minh (Closed-Loop Adaptive Tuning)
  const medicalAdaptive = calculateAdaptiveThresholds(currentUser || {});
  const suggestedThresholds: AlertThresholds = {
    ...thresholds,
    hrMin: medicalAdaptive.thresholds.hrMin,
    hrMax: medicalAdaptive.thresholds.hrMax,
    spo2Min: medicalAdaptive.thresholds.spo2Min,
    incorrectPostureSec: medicalAdaptive.thresholds.incorrectPostureSec,
    longIncorrectSec: medicalAdaptive.thresholds.longIncorrectSec,
    longSittingSec: medicalAdaptive.thresholds.longSittingSec,
  };

  if (validVitalLogs.length >= 5 && avgBpm > 0) {
    const empiricalMax = clamp(Math.round(avgBpm + 22), 92, 125);
    const empiricalMin = clamp(Math.round(avgBpm - 20), 45, 65);
    suggestedThresholds.hrMax = Math.min(suggestedThresholds.hrMax, empiricalMax);
    suggestedThresholds.hrMin = Math.max(suggestedThresholds.hrMin, empiricalMin);
  }

  if (badPostureSharePercent >= 28) {
    suggestedThresholds.incorrectPostureSec = Math.min(suggestedThresholds.incorrectPostureSec, 15);
    suggestedThresholds.longIncorrectSec = Math.min(suggestedThresholds.longIncorrectSec, 60);
    suggestedThresholds.longSittingSec = Math.min(suggestedThresholds.longSittingSec, 1800);
  } else if (badPostureSharePercent <= 10 && sampleCount >= 10) {
    suggestedThresholds.incorrectPostureSec = Math.max(25, suggestedThresholds.incorrectPostureSec);
  }

  const thresholdDiffs: ThresholdDiffItem[] = [
    {
      key: 'incorrectPostureSec',
      label: 'Cảnh báo sai tư thế',
      currentValue: thresholds.incorrectPostureSec,
      suggestedValue: suggestedThresholds.incorrectPostureSec,
      unit: 'giây',
      reason:
        badPostureSharePercent >= 28
          ? `Tỷ lệ sai tư thế đang ở mức ${badPostureSharePercent}%, nên rút ngắn ngưỡng nhắc sớm để ngăn mỏi cổ C5-C7.`
          : 'Phù hợp với hồ sơ y tế và độ ổn định tư thế hiện tại.',
    },
    {
      key: 'longIncorrectSec',
      label: 'Cảnh báo sai tư thế lâu',
      currentValue: thresholds.longIncorrectSec ?? 120,
      suggestedValue: suggestedThresholds.longIncorrectSec,
      unit: 'giây',
      reason:
        badPostureSharePercent >= 28
          ? 'Giảm thời gian chịu tải đĩa đệm khi người dùng quên chỉnh lại lưng.'
          : 'Cân bằng giữa cảnh báo khẩn và tránh làm phiền khi cúi lấy tài liệu.',
    },
    {
      key: 'longSittingSec',
      label: 'Giới hạn ngồi liên tục',
      currentValue: thresholds.longSittingSec,
      suggestedValue: suggestedThresholds.longSittingSec,
      unit: 'giây',
      reason:
        hasSpineHistory || badPostureSharePercent >= 25
          ? 'Khuyến nghị đứng dậy sớm hơn (30-40 phút/lần) để giảm áp lực thắt lưng L4-L5.'
          : 'Chuẩn công thái học 45 phút ngồi : 5 phút đứng.',
    },
    {
      key: 'hrMax',
      label: 'Nhịp tim tối đa (HR Max)',
      currentValue: thresholds.hrMax,
      suggestedValue: suggestedThresholds.hrMax,
      unit: 'BPM',
      reason:
        avgBpm > 0
          ? `Hiệu chỉnh theo đường cơ sở nhịp tim nghỉ đo được từ MAX30102 (TB: ${avgBpm} BPM).`
          : 'Tính theo công thức Tanaka & hồ sơ bệnh nền.',
    },
  ];

  // 6. Lịch nghỉ giải lao thông minh
  const recommendedSitMin = clamp(Math.round(suggestedThresholds.longSittingSec / 60), 25, 50);
  const recommendedStandMin = clamp(Math.round((thresholds.standingTargetSec || 300) / 60), 3, 15);

  // 7. Bản đồ 6 mục đích khai thác dữ liệu thu thập được (Trả lời câu hỏi giảng viên hướng dẫn)
  const completedTasksCount = tasks.filter(t => t.status === 'completed').length;
  const exploitationMatrix: ExploitationPurposeCard[] = [
    {
      id: 'ohps_productivity',
      title: '1. Chấm điểm Năng suất & Chính sách Thưởng (OHPS)',
      category: 'Hiệu suất & Nhân sự',
      statusLabel: 'Đang vận hành',
      inputSignals: ['posture_status', 'standingSeconds', 'bpm/spo2', 'tasks'],
      processingMethod: 'Tổng hợp đa trọng số: 70% Sức khỏe Công thái học (HES) + 30% Tiến độ Task (TS).',
      liveMetricLabel: 'Điểm OHPS hiện tại / Dự báo',
      liveMetricValue: `${currentOhps}đ → ${predictedOhps}đ`,
      businessValue: 'Là cơ sở minh bạch hóa đánh giá hiệu suất làm việc lành mạnh và xét thưởng chu kỳ.',
    },
    {
      id: 'musculoskeletal_risk',
      title: '2. Dự báo Sớm Rủi ro Cơ xương khớp (C5-C7 & L4-L5)',
      category: 'Y tế Dự phòng',
      statusLabel: 'AI Dự đoán',
      inputSignals: ['badPostureSeconds', 'angleNeck', 'continuousSittingSeconds'],
      processingMethod: 'Tính tích lũy tải trọng gập cổ/cong lưng và ước lượng thời gian tới ngưỡng mỏi cơ.',
      liveMetricLabel: 'Nguy cơ Cổ / Thắt lưng',
      liveMetricValue: `${neckSpineRiskPercent}% / ${lumbarRiskPercent}%`,
      businessValue: 'Cảnh báo phòng ngừa hội chứng Text Neck và thoát vị đĩa đệm trước khi phát sinh đau mãn tính.',
    },
    {
      id: 'circadian_focus',
      title: '3. Khai phá Nhịp sinh học & Khung giờ vàng Tập trung',
      category: 'Phân tích Hành vi',
      statusLabel: 'Chuỗi thời gian',
      inputSignals: ['created_at (theo giờ)', 'posture_status', 'in_zone'],
      processingMethod: 'Phân cụm hiệu suất tư thế theo từng giờ (08:00–18:00) tìm giờ hưng phấn & giờ suy giảm.',
      liveMetricLabel: 'Giờ vàng / Giờ dễ uể oải',
      liveMetricValue: `${goldenHoursWindow} • ${slumpRiskWindow}`,
      businessValue: 'Giúp nhân viên sắp xếp việc khó vào giờ vàng và chủ động nghỉ giải lao trước giờ tụt năng lượng.',
    },
    {
      id: 'cardio_stress_air',
      title: '4. Phát hiện Căng thẳng Sinh hiệu & Thiếu Oxy phòng kín',
      category: 'Sinh trắc học MAX30102',
      statusLabel: 'Tương quan đa biến',
      inputSignals: ['bpm', 'spo2', 'posture_status'],
      processingMethod: 'Đối chiếu độ lệch BPM và SpO₂ giữa lúc ngồi chuẩn và lúc ngồi gù lưng/căng thẳng.',
      liveMetricLabel: 'Chỉ số Stress / Lệch BPM',
      liveMetricValue: `${stressIndex}/100 (${bpmDriftOnSlouch >= 0 ? '+' : ''}${bpmDriftOnSlouch} BPM)`,
      businessValue: 'Phát hiện sớm dấu hiệu stress công việc hoặc thiếu thông gió văn phòng (SpO₂ giảm) để nhắc hít thở/mở cửa.',
    },
    {
      id: 'closed_loop_pi4',
      title: '5. Vòng lặp Khép kín Tự động Tinh chỉnh Ngưỡng Pi 4',
      category: 'Điều khiển IoT thích ứng',
      statusLabel: 'Closed-Loop IoT',
      inputSignals: ['lịch sử vi phạm ngưỡng', 'hồ sơ tuổi/BMI/bệnh nền'],
      processingMethod: 'Kết hợp tiền sử y khoa và tần suất sai tư thế thực tế để cập nhật ngưỡng xuống Firestore -> Pi 4.',
      liveMetricLabel: 'Chu kỳ ngồi AI đề xuất',
      liveMetricValue: `${recommendedSitMin}p ngồi : ${recommendedStandMin}p đứng`,
      businessValue: 'Tránh cảnh báo giả gây khó chịu, đồng thời siết chặt bảo vệ cho nhóm có tiền sử bệnh cột sống/tim mạch.',
    },
    {
      id: 'org_ergonomics_audit',
      title: '6. Hoạch định Công thái học & Y tế Lao động Doanh nghiệp',
      category: 'Quản trị Doanh nghiệp',
      statusLabel: 'Báo cáo Tổng hợp',
      inputSignals: ['daily_ohps_summary', 'tỷ lệ vắng/đứng toàn đội ngũ', 'tasks'],
      processingMethod: 'Thống kê so sánh theo phòng ban/thành viên trên Supabase để định hướng đầu tư bàn ghế công thái học.',
      liveMetricLabel: 'Dữ liệu đã tích lũy',
      liveMetricValue: `${sampleCount} log • ${completedTasksCount}/${tasks.length} task`,
      businessValue: 'Chuyển đổi dữ liệu cảm biến thô thành quyết định mua sắm bàn nâng hạ, giá đỡ màn hình và phúc lợi y tế.',
    },
  ];

  return {
    sampleCount,
    validVitalCount: validVitalLogs.length,
    sittingSamples: activeSittingLogs.length,
    badSamples: badLogs.length,
    standingSamples: standingLogs.length,
    avgBpm,
    avgSpo2,
    goodPostureRatio,
    ohpsForecast: {
      currentScore: currentOhps,
      predictedScore: predictedOhps,
      delta: predictedDelta,
      confidencePercent,
      trendLabel,
      trendReason,
    },
    postureFatigue: {
      neckSpineRiskPercent,
      lumbarRiskPercent,
      overallRiskLevel,
      predictedMinutesUntilSlouch,
      badPostureSharePercent,
    },
    vitalCorrelation: {
      goodPostureAvgBpm,
      badPostureAvgBpm,
      bpmDriftOnSlouch,
      goodPostureAvgSpo2,
      badPostureAvgSpo2,
      spo2DriftOnSlouch,
      anomalyCount,
      stressIndex,
    },
    circadian: {
      goldenHoursWindow,
      slumpRiskWindow,
      hourlyCurve,
    },
    recommendedBreakCadence: {
      sitMinutes: recommendedSitMin,
      standMinutes: recommendedStandMin,
      eyeBreakSeconds: 20,
      rationale:
        hasSpineHistory || badPostureSharePercent >= 25
          ? `Với tỷ lệ sai tư thế ${badPostureSharePercent}%, chia nhỏ phiên ngồi ${recommendedSitMin} phút giúp giảm 40% áp lực nội đĩa đệm.`
          : `Nhịp độ ${recommendedSitMin} phút tập trung / ${recommendedStandMin} phút đứng tối ưu cả điểm HES và tiến độ công việc.`,
    },
    suggestedThresholds,
    thresholdDiffs,
    exploitationMatrix,
  };
}
