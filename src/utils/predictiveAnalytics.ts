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

export interface SuggestedInterventionTask {
  id: string;
  title: string;
  content: string;
  priority: 'normal' | 'high' | 'urgent';
  suggestedTime: string;
}

export interface VitalForecastSummary {
  predictedNextBpm: number;
  bpmSlope: number;
  predictedNextSpo2: number;
  spo2DropRisk: 'Thấp' | 'Trung bình' | 'Cao';
  summaryText: string;
}

export interface Immediate2hForecast {
  postureRiskPercent: number;
  minutesToNextBreak: number;
  headline: string;
}

export interface ThresholdDiffItem {
  key: keyof AlertThresholds;
  label: string;
  currentValue: number;
  suggestedValue: number;
  unit: string;
  reason: string;
}

export interface ModelDiagnosticsMetrics {
  rSquared: number;
  mae: number;
  ewmaScore: number;
  regressionSlope: number;
  sqiScore: number;
  baselineBpmMean: number;
  baselineBpmStd: number;
  zScoreAnomalyCount: number;
  latestBpmZScore: number;
  anomalyDetails: Array<{
    timestamp: string;
    bpm: number;
    spo2: number;
    zScore: number;
    reason: string;
  }>;
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
  modelMetrics: ModelDiagnosticsMetrics;
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
  vitalForecast: VitalForecastSummary;
  immediate2hRisk: Immediate2hForecast;
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
  suggestedTasks: SuggestedInterventionTask[];
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
 * Weighted Linear Regression (WLS) + EWMA trên chuỗi điểm tư thế theo cửa sổ trượt
 */
function computeWeightedLinearRegression(values: number[]): {
  slope: number;
  intercept: number;
  rSquared: number;
  mae: number;
  ewma: number;
  predictedNext: number;
} {
  if (values.length === 0) {
    return { slope: 0, intercept: 80, rSquared: 0, mae: 0, ewma: 80, predictedNext: 80 };
  }
  if (values.length === 1) {
    return { slope: 0, intercept: values[0], rSquared: 0, mae: 0, ewma: values[0], predictedNext: values[0] };
  }

  // EWMA smoothing (lambda = 0.35)
  const lambda = 0.35;
  let ewma = values[0];
  for (let i = 1; i < values.length; i++) {
    ewma = lambda * values[i] + (1 - lambda) * ewma;
  }

  // Trọng số tăng dần tuyến tính cho dữ liệu mới hơn
  const n = values.length;
  const weights = values.map((_, i) => (i + 1) / n);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const meanX = weights.reduce((a, w, i) => a + w * i, 0) / sumW;
  const meanY = weights.reduce((a, w, i) => a + w * values[i], 0) / sumW;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    const dy = values[i] - meanY;
    num += weights[i] * dx * dy;
    den += weights[i] * dx * dx;
  }

  const slope = den > 1e-6 ? num / den : 0;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  let absErrSum = 0;
  for (let i = 0; i < n; i++) {
    const yHat = intercept + slope * i;
    const err = values[i] - yHat;
    ssRes += weights[i] * err * err;
    ssTot += weights[i] * Math.pow(values[i] - meanY, 2);
    absErrSum += Math.abs(err);
  }

  const rSquared = ssTot > 1e-6 ? clamp(Number((1 - ssRes / ssTot).toFixed(2)), 0, 1) : 0;
  const mae = Number((absErrSum / n).toFixed(1));
  const predictedNext = clamp(intercept + slope * n, 0, 100);

  return {
    slope: Number(slope.toFixed(2)),
    intercept: Number(intercept.toFixed(2)),
    rSquared,
    mae,
    ewma: Number(ewma.toFixed(1)),
    predictedNext: Number(predictedNext.toFixed(1)),
  };
}

/**
 * Phát hiện bất thường sinh trắc học bằng Z-Score động dựa trên Baseline cá nhân
 */
function computeBiometricZScoreAnomalies(validLogs: TelemetryLog[]): {
  baselineBpmMean: number;
  baselineBpmStd: number;
  sqiScore: number;
  latestBpmZScore: number;
  anomalies: Array<{
    timestamp: string;
    bpm: number;
    spo2: number;
    zScore: number;
    reason: string;
  }>;
} {
  if (validLogs.length === 0) {
    return {
      baselineBpmMean: 0,
      baselineBpmStd: 0,
      sqiScore: 0,
      latestBpmZScore: 0,
      anomalies: [],
    };
  }

  const bpms = validLogs.map(l => Number(l.bpm));
  const mean = bpms.reduce((a, b) => a + b, 0) / bpms.length;
  const variance = bpms.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / bpms.length;
  const std = Math.max(4.5, Math.sqrt(variance)); // sàn std = 4.5 BPM để tránh nhạy quá mức khi mẫu ít

  // SQI thực tế
  const physiologicalValid = validLogs.filter(
    l => Number(l.bpm) >= 40 && Number(l.bpm) <= 200 && Number(l.spo2) >= 80 && Number(l.spo2) <= 100
  ).length;
  let motionArtifacts = 0;
  for (let i = 1; i < bpms.length; i++) {
    if (Math.abs(bpms[i] - bpms[i - 1]) > 35) motionArtifacts++;
  }
  const artifactPenalty = bpms.length > 1 ? (motionArtifacts / (bpms.length - 1)) * 40 : 0;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  const stabilityPenalty = cv > 0.18 ? Math.min(25, (cv - 0.18) * 120) : 0;
  const sqiScore = clamp(
    Math.round((physiologicalValid / validLogs.length) * 90 + Math.min(10, validLogs.length * 1.5) - artifactPenalty - stabilityPenalty),
    25,
    100
  );

  const anomalies: Array<{
    timestamp: string;
    bpm: number;
    spo2: number;
    zScore: number;
    reason: string;
  }> = [];

  validLogs.forEach(l => {
    const bpm = Number(l.bpm);
    const spo2 = Number(l.spo2);
    const z = (bpm - mean) / std;
    if (Math.abs(z) >= 2.0 || spo2 < 94) {
      anomalies.push({
        timestamp: l.timestamp,
        bpm,
        spo2,
        zScore: Number(z.toFixed(2)),
        reason:
          spo2 < 94
            ? `SpO2 giảm xuống ${spo2}% (< 94%)`
            : z >= 2.0
            ? `Nhịp tim tăng vọt +${Math.round(bpm - mean)} BPM so với nền cá nhân (Z=${z.toFixed(2)}σ)`
            : `Nhịp tim giảm bất thường ${Math.round(bpm - mean)} BPM so với nền cá nhân (Z=${z.toFixed(2)}σ)`,
      });
    }
  });

  const latestBpm = bpms[bpms.length - 1];
  const latestBpmZScore = Number(((latestBpm - mean) / std).toFixed(2));

  return {
    baselineBpmMean: Number(mean.toFixed(1)),
    baselineBpmStd: Number(Math.sqrt(variance).toFixed(1)),
    sqiScore,
    latestBpmZScore,
    anomalies: anomalies.slice(-6).reverse(),
  };
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

  const zScoreModel = computeBiometricZScoreAnomalies(validVitalLogs);
  const hardAnomalyCount = validVitalLogs.filter(
    l =>
      Number(l.bpm) < (thresholds.hrMin || 50) ||
      Number(l.bpm) > (thresholds.hrMax || 110) ||
      Number(l.spo2) < (thresholds.spo2Min || 94)
  ).length;
  const anomalyCount = Math.max(hardAnomalyCount, zScoreModel.anomalies.length);

  const hrStressComponent =
    avgBpm > 0
      ? clamp(Math.round(((avgBpm - 65) / Math.max(15, (thresholds.hrMax || 110) - 65)) * 55), 0, 60)
      : 15;
  const spo2Penalty = avgSpo2 > 0 && avgSpo2 < 96 ? (96 - avgSpo2) * 12 : 0;
  const badPosturePenalty = Math.round((100 - goodPostureRatio) * 0.45);
  const zScorePenalty = Math.min(18, zScoreModel.anomalies.length * 4);
  const stressIndex = clamp(Math.round(hrStressComponent + spo2Penalty + badPosturePenalty + zScorePenalty), 5, 98);

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

  // 4. Dự báo OHPS ca tiếp theo bằng Weighted Linear Regression (WLS) + EWMA
  const currentOhps =
    ohpsData && ohpsData.hasActualData ? ohpsData.ohpsScore : Math.round(goodPostureRatio * 0.7 + 25);

  // Chia chuỗi log thành các block cửa sổ (3-5 log/block) để hồi quy chuỗi thời gian thực
  const blockSize = activeSittingLogs.length >= 20 ? 4 : activeSittingLogs.length >= 10 ? 3 : 2;
  const blockScores: number[] = [];
  for (let i = 0; i < activeSittingLogs.length; i += blockSize) {
    const slice = activeSittingLogs.slice(i, i + blockSize);
    if (slice.length > 0) {
      const goodInBlock = slice.filter(isGoodPostureLog).length;
      blockScores.push(Math.round((goodInBlock / slice.length) * 100));
    }
  }
  if (blockScores.length < 2 && populatedHours.length >= 2) {
    populatedHours.forEach(h => {
      if (h.actualFocusScore !== null) blockScores.push(h.actualFocusScore);
    });
  }

  const wls = computeWeightedLinearRegression(blockScores);
  const breakBonus = standingTimeSec >= (thresholds.standingTargetSec || 300) ? 3 : -2;
  const slopeContribution = blockScores.length >= 2 ? (wls.predictedNext - wls.ewma) * 0.5 + wls.slope * 0.8 : 0;
  const predictedDelta = clamp(Math.round(slopeContribution + breakBonus), -15, 14);
  const predictedOhps = clamp(currentOhps + predictedDelta, 35, 99);
  const trendLabel: 'Cải thiện' | 'Ổn định' | 'Có xu hướng giảm' =
    predictedDelta >= 3 ? 'Cải thiện' : predictedDelta <= -3 ? 'Có xu hướng giảm' : 'Ổn định';
  const confidencePercent = clamp(
    Math.round(
      32 +
        Math.min(38, sampleCount * 0.75) +
        wls.rSquared * 15 +
        (validVitalLogs.length > 0 ? Math.round((ohpsData?.sqiScore ?? zScoreModel.sqiScore) * 0.12) : 0)
    ),
    30,
    96
  );

  const trendReason =
    sampleCount < 4
      ? 'Đang tổng hợp từ nền dữ liệu khởi tạo; tiếp tục thu thập thêm log từ Pi 4 để tăng độ chính xác hồi quy WLS.'
      : wls.slope > 1.5
      ? `Hồi quy WLS ghi nhận độ dốc tích cực (+${wls.slope} điểm/block, R²=${wls.rSquared}, EWMA=${wls.ewma}%).`
      : wls.slope < -1.5
      ? `Hồi quy WLS phát hiện xu hướng mỏi dần về cuối phiên (${wls.slope} điểm/block, R²=${wls.rSquared}, MAE=${wls.mae}).`
      : `Chuỗi thời gian duy trì ổn định quanh mức EWMA ${wls.ewma}% (MAE=${wls.mae}, R²=${wls.rSquared}).`;

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

  // 7. Dự báo sinh hiệu (BPM & SpO2) theo chuỗi thời gian thực
  const bpmSeries = validVitalLogs.slice(-30).map(l => Number(l.bpm));
  const spo2Series = validVitalLogs.slice(-30).map(l => Number(l.spo2));
  const bpmWls = computeWeightedLinearRegression(bpmSeries.length > 0 ? bpmSeries : avgBpm > 0 ? [avgBpm] : [75]);
  const spo2Wls = computeWeightedLinearRegression(spo2Series.length > 0 ? spo2Series : avgSpo2 > 0 ? [avgSpo2] : [98]);
  const predictedNextBpm = avgBpm > 0 ? clamp(Math.round(bpmWls.predictedNext), 45, 160) : 0;
  const predictedNextSpo2 = avgSpo2 > 0 ? clamp(Math.round(spo2Wls.predictedNext), 85, 100) : 0;
  const spo2DropRisk: 'Thấp' | 'Trung bình' | 'Cao' =
    predictedNextSpo2 > 0 && predictedNextSpo2 < 94
      ? 'Cao'
      : (predictedNextSpo2 > 0 && predictedNextSpo2 <= 95) || spo2DriftOnSlouch <= -1.5
      ? 'Trung bình'
      : 'Thấp';

  const vitalForecast: VitalForecastSummary = {
    predictedNextBpm,
    bpmSlope: bpmSeries.length >= 3 ? bpmWls.slope : 0,
    predictedNextSpo2,
    spo2DropRisk,
    summaryText:
      validVitalLogs.length === 0
        ? 'Chưa có đủ mẫu sinh hiệu từ cảm biến MAX30102 để dự báo nhịp tim và SpO₂.'
        : bpmWls.slope > 1.2
        ? `Nhịp tim có xu hướng tăng nhẹ (+${bpmWls.slope} BPM/mẫu), dự kiến quanh ${predictedNextBpm} BPM; nên hít thở chậm 4-7-8.`
        : spo2DropRisk !== 'Thấp'
        ? `SpO₂ có dấu hiệu giảm nhẹ (dự kiến ${predictedNextSpo2}%), nên mở thoáng khí và ngồi thẳng mở lồng ngực.`
        : `Sinh hiệu ổn định quanh ${predictedNextBpm} BPM và ${predictedNextSpo2}% SpO₂.`,
  };

  // 8. Dự báo ngắn hạn 2 giờ tới & Hành động đề xuất thực tế
  const immediatePostureRisk = clamp(
    Math.round(Math.max(neckSpineRiskPercent, lumbarRiskPercent) * 0.75 + continuousSitRatio * 22),
    8,
    98
  );
  const minutesToNextBreak = Math.max(5, Math.min(recommendedSitMin, predictedMinutesUntilSlouch));
  const immediate2hRisk: Immediate2hForecast = {
    postureRiskPercent: immediatePostureRisk,
    minutesToNextBreak,
    headline:
      immediatePostureRisk >= 60
        ? `Nguy cơ mỏi cổ/lưng cao (${immediatePostureRisk}%) — nên đứng dậy giãn cơ sau ~${minutesToNextBreak} phút.`
        : immediatePostureRisk >= 35
        ? `Rủi ro trung bình (${immediatePostureRisk}%) — duy trì chu kỳ ${recommendedSitMin}p ngồi : ${recommendedStandMin}p đứng.`
        : `Tư thế 2 giờ tới ổn định — tiếp tục nghỉ giải lao sau mỗi ${recommendedSitMin} phút.`,
  };

  const suggestedTasks: SuggestedInterventionTask[] = [];
  if (neckSpineRiskPercent >= 35) {
    suggestedTasks.push({
      id: 'task-neck-chin-tuck',
      title: 'Tập 5 nhịp Thu Cằm (Chin Tuck) giải tỏa cổ C5-C7',
      content: `Nguy cơ mỏi cổ đạt ${neckSpineRiskPercent}%. Ngồi thẳng, kéo cằm lùi về gáy giữ 5 giây x 5 lần và nâng màn hình ngang tầm mắt.`,
      priority: neckSpineRiskPercent >= 60 ? 'urgent' : 'high',
      suggestedTime: 'Ngay bây giờ',
    });
  }
  if (continuousSitRatio >= 0.6 || lumbarRiskPercent >= 35) {
    suggestedTasks.push({
      id: 'task-stand-break',
      title: `Đứng dậy vận động ${recommendedStandMin} phút`,
      content: `Giảm áp lực đĩa đệm thắt lưng L4-L5 và tránh khung giờ dễ uể oải (${slumpRiskWindow}).`,
      priority: lumbarRiskPercent >= 60 ? 'high' : 'normal',
      suggestedTime: `Trong ${minutesToNextBreak} phút tới`,
    });
  }
  if (spo2DropRisk !== 'Thấp' || stressIndex >= 45 || zScoreModel.anomalies.length > 0) {
    suggestedTasks.push({
      id: 'task-vital-breathe',
      title: 'Hít thở sâu 4-7-8 & đo lại sinh hiệu MAX30102',
      content: `Chỉ số Stress ${stressIndex}/100 (${zScoreModel.anomalies.length} lệch chuẩn Z-Score). Uống 200ml nước và hít thở sâu 60 giây.`,
      priority: stressIndex >= 65 ? 'high' : 'normal',
      suggestedTime: 'Sau 15 phút',
    });
  }
  if (suggestedTasks.length === 0) {
    suggestedTasks.push({
      id: 'task-maintain-cadence',
      title: `Nghỉ mắt 20-20-20 & đứng ${recommendedStandMin} phút`,
      content: `Duy trì nhịp làm việc ${recommendedSitMin}p ngồi : ${recommendedStandMin}p đứng để giữ vững điểm OHPS trên ${predictedOhps}đ.`,
      priority: 'normal',
      suggestedTime: `Khung ${slumpRiskWindow}`,
    });
  }

  const resolvedSqi = ohpsData?.sqiScore ?? zScoreModel.sqiScore;

  return {
    sampleCount,
    validVitalCount: validVitalLogs.length,
    sittingSamples: activeSittingLogs.length,
    badSamples: badLogs.length,
    standingSamples: standingLogs.length,
    avgBpm,
    avgSpo2,
    goodPostureRatio,
    modelMetrics: {
      rSquared: wls.rSquared,
      mae: wls.mae,
      ewmaScore: wls.ewma,
      regressionSlope: wls.slope,
      sqiScore: resolvedSqi,
      baselineBpmMean: zScoreModel.baselineBpmMean,
      baselineBpmStd: zScoreModel.baselineBpmStd,
      zScoreAnomalyCount: zScoreModel.anomalies.length,
      latestBpmZScore: zScoreModel.latestBpmZScore,
      anomalyDetails: zScoreModel.anomalies,
    },
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
    vitalForecast,
    immediate2hRisk,
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
          ? `Tỷ lệ sai tư thế ${badPostureSharePercent}% — chia phiên ngồi ${recommendedSitMin} phút giúp giảm tải đĩa đệm.`
          : `Chu kỳ ${recommendedSitMin}p ngồi / ${recommendedStandMin}p đứng tối ưu sức khỏe và tiến độ việc.`,
    },
    suggestedThresholds,
    thresholdDiffs,
    suggestedTasks,
  };
}
