// src/utils/hourlyAggregation.ts
import { TelemetryLog, TelemetryHistoryItem } from '../types';

export interface HourlyTelemetryPoint {
  hour: number;          // 8, 9, 10, ...
  hourLabel: string;     // '08:00', '09:00', ...
  timeRangeLabel: string;// '08:00 - 08:59'
  avgBpm: number;        // Trung bình nhịp tim trong giờ (hoặc 0 nếu chưa có dữ liệu)
  minBpm: number;
  maxBpm: number;
  avgSpo2: number;       // Trung bình SpO2 trong giờ (hoặc 0 nếu chưa có dữ liệu)
  minSpo2: number;
  maxSpo2: number;
  goodCount: number;     // Số lần ngồi đúng trong giờ
  badCount: number;      // Số lần ngồi sai trong giờ
  standingCount: number; // Số lần đứng trong giờ
  absentCount: number;   // Số lần vắng trong giờ
  goodRatio: number;     // Tỷ lệ % tư thế đúng trong giờ
  sampleCount: number;   // Tổng số mẫu đo trong giờ
  hasData: boolean;      // Giờ này có bản ghi đo đạc thực tế hay không
  hasAlert: boolean;     // Có cảnh báo trong giờ này hay không
}

/**
 * Tổng hợp dữ liệu nhật ký đo đạc theo từng khung giờ (Hourly Aggregation)
 * Khắc phục hoàn toàn việc vẽ biểu đồ theo từng giây rời rạc.
 * Mặc định bao phủ dải giờ làm việc từ 08:00 đến 18:00 (hoặc tự động mở rộng theo thời gian của logs).
 */
export function aggregateTelemetryByHour(
  logs: (TelemetryLog | TelemetryHistoryItem)[],
  minHourPreset: number = 8,
  maxHourPreset: number = 18
): HourlyTelemetryPoint[] {
  if (!logs || logs.length === 0) {
    // Trả về khung 08:00 - 18:00 trống
    const emptyHours: HourlyTelemetryPoint[] = [];
    for (let h = minHourPreset; h <= maxHourPreset; h++) {
      const hStr = String(h).padStart(2, '0');
      emptyHours.push({
        hour: h,
        hourLabel: `${hStr}:00`,
        timeRangeLabel: `${hStr}:00 - ${hStr}:59`,
        avgBpm: 0,
        minBpm: 0,
        maxBpm: 0,
        avgSpo2: 0,
        minSpo2: 0,
        maxSpo2: 0,
        goodCount: 0,
        badCount: 0,
        standingCount: 0,
        absentCount: 0,
        goodRatio: 0,
        sampleCount: 0,
        hasData: false,
        hasAlert: false
      });
    }
    return emptyHours;
  }

  // 1. Phân tích dải giờ có trong logs
  let earliestHour = minHourPreset;
  let latestHour = maxHourPreset;

  logs.forEach(log => {
    const rawTime = log.timestamp || (log as any).created_at;
    if (rawTime) {
      const d = new Date(rawTime);
      const h = d.getHours();
      if (!isNaN(h)) {
        if (h < earliestHour) earliestHour = Math.max(0, h);
        if (h > latestHour) latestHour = Math.min(23, h);
      }
    }
  });

  // 2. Khởi tạo các bucket theo từng giờ
  interface BucketAccumulator {
    bpmValues: number[];
    spo2Values: number[];
    goodCount: number;
    badCount: number;
    standingCount: number;
    absentCount: number;
    sampleCount: number;
    alertCount: number;
  }

  const buckets: Record<number, BucketAccumulator> = {};
  for (let h = earliestHour; h <= latestHour; h++) {
    buckets[h] = {
      bpmValues: [],
      spo2Values: [],
      goodCount: 0,
      badCount: 0,
      standingCount: 0,
      absentCount: 0,
      sampleCount: 0,
      alertCount: 0
    };
  }

  // 3. Phân loại từng bản ghi vào đúng khung giờ
  logs.forEach(log => {
    const rawTime = log.timestamp || (log as any).created_at;
    if (!rawTime) return;
    const d = new Date(rawTime);
    const h = d.getHours();
    if (isNaN(h) || !buckets[h]) return;

    const b = buckets[h];
    b.sampleCount++;

    const bpm = Number(log.bpm) || 0;
    const spo2 = Number(log.spo2) || 0;
    const postureStatus = Number(log.postureStatus);
    const label = ((log as any).postureLabel || '').toLowerCase();

    if (bpm > 0) b.bpmValues.push(bpm);
    if (spo2 > 0) b.spo2Values.push(spo2);

    if (postureStatus === 5 || label.includes('đứng')) {
      b.standingCount++;
    } else if (postureStatus === 2 || postureStatus === -1 || label.includes('vắng') || (log as any).inZone === false) {
      b.absentCount++;
    } else if (postureStatus === 1 || postureStatus === 3 || postureStatus === 4 || label.includes('sai') || label.includes('gù') || label.includes('cúi')) {
      b.badCount++;
    } else if (postureStatus === 0 || label.includes('đúng') || label.includes('chuẩn')) {
      b.goodCount++;
    }

    if (Boolean(log.hasAlert || (log as any).alertType)) {
      b.alertCount++;
    }
  });

  // 4. Kết xuất mảng tổng hợp theo giờ
  const result: HourlyTelemetryPoint[] = [];
  for (let h = earliestHour; h <= latestHour; h++) {
    const b = buckets[h];
    const hStr = String(h).padStart(2, '0');
    const hasData = b.sampleCount > 0 && (b.bpmValues.length > 0 || b.spo2Values.length > 0 || b.goodCount > 0 || b.badCount > 0);

    const avgBpm = b.bpmValues.length > 0 
      ? Math.round(b.bpmValues.reduce((acc, v) => acc + v, 0) / b.bpmValues.length) 
      : 0;
    const minBpm = b.bpmValues.length > 0 ? Math.min(...b.bpmValues) : 0;
    const maxBpm = b.bpmValues.length > 0 ? Math.max(...b.bpmValues) : 0;

    const avgSpo2 = b.spo2Values.length > 0 
      ? Number((b.spo2Values.reduce((acc, v) => acc + v, 0) / b.spo2Values.length).toFixed(1)) 
      : 0;
    const minSpo2 = b.spo2Values.length > 0 ? Math.min(...b.spo2Values) : 0;
    const maxSpo2 = b.spo2Values.length > 0 ? Math.max(...b.spo2Values) : 0;

    const evaluatedTotal = b.goodCount + b.badCount;
    const goodRatio = evaluatedTotal > 0 ? Math.round((b.goodCount / evaluatedTotal) * 100) : (b.goodCount > 0 ? 100 : 0);

    result.push({
      hour: h,
      hourLabel: `${hStr}:00`,
      timeRangeLabel: `${hStr}:00 - ${hStr}:59`,
      avgBpm,
      minBpm,
      maxBpm,
      avgSpo2,
      minSpo2,
      maxSpo2,
      goodCount: b.goodCount,
      badCount: b.badCount,
      standingCount: b.standingCount,
      absentCount: b.absentCount,
      goodRatio,
      sampleCount: b.sampleCount,
      hasData,
      hasAlert: b.alertCount > 0
    });
  }

  return result;
}
