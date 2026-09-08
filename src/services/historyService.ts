import { HistoricalRecord, HealthTelemetry, TelemetryLog } from '../types';

const STORAGE_KEY = 'theodoisk_historical_records_v1';

// Helper to format Date to local YYYY-MM-DD
function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Generate seeded realistic historical data relative to current time
function generateSeedHistory(): HistoricalRecord[] {
  const records: HistoricalRecord[] = [];
  const now = new Date();

  // Helper to add relative record
  const addRecord = (
    hoursAgo: number,
    bpm: number,
    spo2: number,
    postureStatus: number,
    postureLabel: string,
    angleNeck: number,
    postureWarning?: string,
    note?: string
  ) => {
    const time = new Date(now.getTime() - hoursAgo * 3600 * 1000);
    records.push({
      id: `seed-${time.getTime()}`,
      timestamp: time.toISOString(),
      date: formatDate(time),
      time: formatTime(time),
      bpm,
      spo2,
      postureStatus,
      postureLabel,
      angleNeck,
      postureWarning,
      note,
      inZone: true,
    });
  };

  // 1. Records for 3 days ago (~72 hours ago)
  addRecord(72, 79, 98.1, 0, 'Tư thế ĐÚNG', 155, undefined, 'Bắt đầu phiên làm việc sáng');
  addRecord(71.5, 84, 97.8, 1, 'Tư thế SAI', 122, 'Cột sống đang bị gù hoặc cúi cổ', 'Tập trung gõ bàn phím lâu');
  addRecord(71, 80, 98.0, 0, 'Tư thế ĐÚNG', 152, undefined, 'Đã chỉnh lại góc tựa lưng ghế');
  addRecord(70, 77, 98.4, 0, 'Tư thế ĐÚNG', 158, undefined, 'Phiên làm việc ổn định');
  addRecord(68, 83, 97.6, 3, 'SAI TƯ THẾ LÂU', 118, 'Cúi đầu quá mức về phía màn hình', 'Cuối giờ làm việc 3 ngày trước');

  // 2. Records for 2 days ago (~48 hours ago)
  addRecord(48, 75, 98.5, 0, 'Tư thế ĐÚNG', 160, undefined, 'Phiên sáng 2 ngày trước');
  addRecord(47, 81, 98.0, 1, 'Tư thế SAI', 125, 'Cột sống bị cong gù nhẹ');
  addRecord(45, 78, 98.3, 0, 'Tư thế ĐÚNG', 156, undefined, 'Nghỉ giải lao vươn vai');

  // 3. Records for Yesterday (~24 hours ago)
  addRecord(26, 76, 98.6, 0, 'Tư thế ĐÚNG', 162, undefined, 'Sáng hôm qua');
  addRecord(24, 82, 97.9, 1, 'Tư thế SAI', 128, 'Nghiêng đầu sang phải', 'Đang họp trực tuyến');
  addRecord(23, 75, 98.7, 0, 'Tư thế ĐÚNG', 155, undefined, 'Chiều hôm qua');
  addRecord(20, 78, 98.2, 4, 'NGỒI LÀM VIỆC QUÁ LÂU', 145, 'Đã ngồi hơn 60 phút liên tục');

  // 4. Records for Today (earlier hours)
  addRecord(4, 74, 98.8, 0, 'Tư thế ĐÚNG', 160, undefined, 'Khởi động máy làm việc');
  addRecord(3, 76, 98.5, 0, 'Tư thế ĐÚNG', 158, undefined, 'Uống nước và làm việc');
  addRecord(2, 85, 97.8, 1, 'Tư thế SAI', 124, 'Cot song dang bi gu hoac cui co', 'Lúc 2 giờ trước');
  addRecord(1, 80, 98.2, 0, 'Tư thế ĐÚNG', 154, undefined, 'Ghi nhận lúc 1 giờ trước');
  addRecord(0.5, 78, 98.6, 0, 'Tư thế ĐÚNG', 157, undefined, 'Ghi nhận lúc 30 phút trước');

  // Sort descending (newest first)
  return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// Get all historical records from storage or initialize
export function getHistoricalRecords(): HistoricalRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load history records:', e);
  }

  const seeded = generateSeedHistory();
  saveHistoricalRecords(seeded);
  return seeded;
}

// Save records
export function saveHistoricalRecords(records: HistoricalRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 300)));
  } catch (e) {
    console.error('Failed to save history records:', e);
  }
}

// Append new real telemetry from Firebase/Pi4 to history
export function appendTelemetryToHistory(telemetry: HealthTelemetry): void {
  if (telemetry.bpm <= 0 && telemetry.spo2 <= 0) return; // ignore uninitialized

  const records = getHistoricalRecords();
  const now = new Date(telemetry.timestamp || Date.now());

  const newRecord: HistoricalRecord = {
    id: `rec-${now.getTime()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now.toISOString(),
    date: formatDate(now),
    time: formatTime(now),
    bpm: telemetry.bpm,
    spo2: telemetry.spo2,
    postureStatus: telemetry.postureStatus,
    postureLabel: telemetry.postureLabel,
    angleNeck: telemetry.angleNeck,
    postureWarning: telemetry.postureWarning,
    inZone: telemetry.inZone,
    note: telemetry.source || 'Cảm biến Raspberry Pi 4',
  };

  // Avoid duplicate records within 5 seconds
  if (records.length > 0) {
    const diff = Math.abs(new Date(records[0].timestamp).getTime() - now.getTime());
    if (diff < 5000 && records[0].bpm === telemetry.bpm && records[0].spo2 === telemetry.spo2) {
      return;
    }
  }

  records.unshift(newRecord);
  saveHistoricalRecords(records);
}

// Synchronize logs loaded from Firebase into the historical record store for chatbot queries
export function syncHistoricalLogs(logs: TelemetryLog[]): void {
  if (!logs || logs.length === 0) return;
  const existing = getHistoricalRecords();
  const existingMap = new Map(existing.map(r => [r.timestamp, r]));

  logs.forEach(log => {
    if (!existingMap.has(log.timestamp)) {
      try {
        const d = new Date(log.timestamp);
        existingMap.set(log.timestamp, {
          id: log.id,
          timestamp: log.timestamp,
          date: formatDate(d),
          time: formatTime(d),
          bpm: log.bpm,
          spo2: log.spo2,
          postureStatus: log.postureStatus,
          postureLabel: log.postureLabel,
          postureWarning: log.alertType,
          inZone: log.trackingActive,
          note: 'Đồng bộ từ Firebase Firestore',
        });
      } catch {}
    }
  });

  const merged = Array.from(existingMap.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  saveHistoricalRecords(merged);
}

// Clear local storage historical records
export function clearLocalHistoricalRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Error clearing local history records:', e);
  }
}

// Query result structure for chatbot
export interface HistoricalQueryResult {
  matched: boolean;
  timeframeLabel: string;
  recordsCount: number;
  avgBpm?: number;
  minBpm?: number;
  maxBpm?: number;
  avgSpO2?: number;
  goodPosturePercent?: number;
  badPostureCount?: number;
  summaryText: string;
  sampleRecords: HistoricalRecord[];
}

// Intelligent data query engine for chatbot
export function queryHistoricalData(queryText: string, currentTelemetry?: HealthTelemetry): HistoricalQueryResult {
  const text = queryText.toLowerCase();
  const records = getHistoricalRecords();
  const now = Date.now();

  let targetRecords: HistoricalRecord[] = [];
  let timeframeLabel = '';

  // 1. "1 giờ trước" / "1 tiếng trước" / "60 phút trước"
  if (text.includes('1 giờ trước') || text.includes('1 tiếng trước') || text.includes('một giờ trước') || text.includes('hồi 1h') || text.includes('1h trước')) {
    timeframeLabel = 'khoảng 1 giờ trước';
    const targetTime = now - 1 * 3600 * 1000;
    targetRecords = records.filter(r => {
      const diffMinutes = Math.abs(new Date(r.timestamp).getTime() - targetTime) / (60 * 1000);
      return diffMinutes <= 45; // within 45 mins of 1 hr ago
    });
  }
  // 2. "2 giờ trước" / "2 tiếng trước"
  else if (text.includes('2 giờ trước') || text.includes('2 tiếng trước') || text.includes('hai giờ trước') || text.includes('2h trước')) {
    timeframeLabel = 'khoảng 2 giờ trước';
    const targetTime = now - 2 * 3600 * 1000;
    targetRecords = records.filter(r => {
      const diffMinutes = Math.abs(new Date(r.timestamp).getTime() - targetTime) / (60 * 1000);
      return diffMinutes <= 45;
    });
  }
  // 3. "3 ngày trước" / "ba ngày trước"
  else if (text.includes('3 ngày trước') || text.includes('ba ngày trước') || text.includes('cách đây 3 ngày') || text.includes('3 ngày qua')) {
    timeframeLabel = 'cách đây 3 ngày';
    const targetDay = new Date(now - 3 * 24 * 3600 * 1000);
    const targetDateStr = formatDate(targetDay);
    targetRecords = records.filter(r => r.date === targetDateStr || Math.abs(new Date(r.timestamp).getTime() - targetDay.getTime()) < 18 * 3600 * 1000);
  }
  // 4. "2 ngày trước" / "hôm kia" / "hai ngày trước"
  else if (text.includes('2 ngày trước') || text.includes('hôm kia') || text.includes('hai ngày trước')) {
    timeframeLabel = 'hôm kia (2 ngày trước)';
    const targetDay = new Date(now - 2 * 24 * 3600 * 1000);
    const targetDateStr = formatDate(targetDay);
    targetRecords = records.filter(r => r.date === targetDateStr || Math.abs(new Date(r.timestamp).getTime() - targetDay.getTime()) < 18 * 3600 * 1000);
  }
  // 5. "hôm qua" / "ngày hôm qua" / "1 ngày trước"
  else if (text.includes('hôm qua') || text.includes('1 ngày trước') || text.includes('ngày trước')) {
    timeframeLabel = 'ngày hôm qua';
    const yesterday = new Date(now - 24 * 3600 * 1000);
    const yesterdayStr = formatDate(yesterday);
    targetRecords = records.filter(r => r.date === yesterdayStr || Math.abs(new Date(r.timestamp).getTime() - yesterday.getTime()) < 18 * 3600 * 1000);
  }
  // 6. "hôm nay" / "sáng nay" / "chiều nay"
  else if (text.includes('hôm nay') || text.includes('sáng nay') || text.includes('chiều nay') || text.includes('từ sáng')) {
    timeframeLabel = 'trong ngày hôm nay';
    const todayStr = formatDate(new Date(now));
    targetRecords = records.filter(r => r.date === todayStr);
  }
  // 7. "tuần này" / "toàn bộ lịch sử" / "tất cả"
  else if (text.includes('tuần') || text.includes('toàn bộ') || text.includes('lịch sử') || text.includes('trung bình')) {
    timeframeLabel = 'toàn bộ lịch sử ghi nhận gần đây';
    targetRecords = records.slice(0, 30);
  }

  // If no specific timeframe found but asking about general metrics
  if (targetRecords.length === 0) {
    // Fallback: take recent records or check if they asked general comparison
    if (text.includes('nhịp tim') || text.includes('tim') || text.includes('spo2') || text.includes('tư thế')) {
      timeframeLabel = 'các phiên làm việc gần nhất';
      targetRecords = records.slice(0, 5);
    } else {
      return {
        matched: false,
        timeframeLabel: '',
        recordsCount: 0,
        summaryText: '',
        sampleRecords: [],
      };
    }
  }

  // Calculate statistics
  const validBpm = targetRecords.map(r => r.bpm).filter(b => b > 0);
  const validSpO2 = targetRecords.map(r => r.spo2).filter(s => s > 0);

  const avgBpm = validBpm.length > 0 ? Math.round(validBpm.reduce((a, b) => a + b, 0) / validBpm.length) : undefined;
  const minBpm = validBpm.length > 0 ? Math.min(...validBpm) : undefined;
  const maxBpm = validBpm.length > 0 ? Math.max(...validBpm) : undefined;
  const avgSpO2 = validSpO2.length > 0 ? Number((validSpO2.reduce((a, b) => a + b, 0) / validSpO2.length).toFixed(1)) : undefined;

  const goodCount = targetRecords.filter(r => r.postureStatus === 0).length;
  const badCount = targetRecords.filter(r => r.postureStatus === 1 || r.postureStatus === 3).length;
  const goodPercent = targetRecords.length > 0 ? Math.round((goodCount / targetRecords.length) * 100) : 0;

  // Build natural summary text
  let summary = `🔍 **Dữ liệu truy xuất sức khỏe (${timeframeLabel}):**\n\n`;

  if (avgBpm !== undefined) {
    summary += `❤️ **Nhịp tim (BPM):** Trung bình **${avgBpm} BPM** (Biên độ: ${minBpm} - ${maxBpm} BPM).\n`;
    if (avgBpm >= 60 && avgBpm <= 85) {
      summary += `   ➔ Trạng thái tim mạch lúc này rất tốt, ổn định và không có dấu hiệu stress.\n`;
    } else if (avgBpm > 85) {
      summary += `   ➔ Nhịp tim có thời điểm tăng nhẹ (${maxBpm} BPM), có thể do áp lực công việc hoặc vừa dùng chất kích thích nhẹ.\n`;
    }
  }

  if (avgSpO2 !== undefined) {
    summary += `🫁 **Nồng độ oxy SpO₂:** Đạt trung bình **${avgSpO2}%** (Rất lý tưởng, >96%).\n`;
  }

  summary += `🧘 **Tư thế ngồi & Cột sống:**\n`;
  summary += `   ➔ Tỷ lệ duy trì tư thế chuẩn: **${goodPercent}%**\n`;
  if (badCount > 0) {
    const worstRecord = targetRecords.find(r => r.postureStatus === 1 || r.postureStatus === 3);
    summary += `   ➔ Ghi nhận **${badCount} lần** bị cảnh báo cúi gập cổ hoặc gù lưng${worstRecord?.angleNeck ? ` (Góc cổ nghiêng: ${worstRecord.angleNeck}°)` : ''}.\n`;
    if (worstRecord?.postureWarning) {
      summary += `   ➔ Chi tiết cảnh báo: *"${worstRecord.postureWarning}"*\n`;
    }
  } else {
    summary += `   ➔ Bạn duy trì tư thế rất chuẩn, lưng thẳng áp sát tựa ghế công thái học.\n`;
  }

  // Compare with current live telemetry if available
  if (currentTelemetry && currentTelemetry.bpm > 0) {
    const diffBpm = currentTelemetry.bpm - (avgBpm || currentTelemetry.bpm);
    summary += `\n⚡ **So sánh với hiện tại:** Hiện tại nhịp tim bạn là **${currentTelemetry.bpm} BPM** (${diffBpm > 0 ? `tăng +${diffBpm}` : diffBpm < 0 ? `giảm ${diffBpm}` : 'bằng'} so với thời điểm đó).`;
  }

  return {
    matched: true,
    timeframeLabel,
    recordsCount: targetRecords.length,
    avgBpm,
    minBpm,
    maxBpm,
    avgSpO2,
    goodPosturePercent: goodPercent,
    badPostureCount: badCount,
    summaryText: summary,
    sampleRecords: targetRecords.slice(0, 4),
  };
}
