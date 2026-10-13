import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';
import { getDatabase, ref, onValue, get, remove } from 'firebase/database';
import { 
  HistoricalRecord, 
  HealthTelemetry, 
  TelemetryLog, 
  FirebaseConnectionConfig 
} from '../types';
import { 
  initializeFirebaseApp, 
  getHistoryCollectionName, 
  markQuotaExceeded 
} from './firebase';

const STORAGE_KEY = 'theodoisk_historical_records_v1';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

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
  return [];
}

export function saveHistoricalRecords(records: HistoricalRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 300)));
  } catch (e) {
    console.error('Failed to save history records:', e);
  }
}

export function appendTelemetryToHistory(telemetry: HealthTelemetry): void {
  if (!telemetry || (telemetry.bpm <= 0 && telemetry.spo2 <= 0) || telemetry.postureStatus === -1) {
    return;
  }

  const records = getHistoricalRecords();
  const now = new Date(telemetry.timestamp || Date.now());

  const newRecord: HistoricalRecord = {
    id: `rec-${now.getTime()}-${Math.random().toString(36).substring(2, 6)}`,
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

  if (records.length > 0) {
    const diff = Math.abs(new Date(records[0].timestamp).getTime() - now.getTime());
    if (diff < 5000 && records[0].bpm === telemetry.bpm && records[0].spo2 === telemetry.spo2) {
      return;
    }
  }

  records.unshift(newRecord);
  saveHistoricalRecords(records);
}

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
          note: 'Đồng bộ từ Supabase PostgreSQL',
        });
      } catch {}
    }
  });

  const merged = Array.from(existingMap.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  saveHistoricalRecords(merged);
}

export function clearLocalHistoricalRecords(targetUserId?: string): void {
  try {
    if (!targetUserId || targetUserId === 'all') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('theodoisk_telemetry_history_v2');
      return;
    }
    localStorage.removeItem(`theodoisk_history_${targetUserId}`);
    const existing = getHistoricalRecords();
    const filtered = existing.filter(r => (r as any).userId !== targetUserId);
    saveHistoricalRecords(filtered);

    const rawShared = localStorage.getItem('theodoisk_telemetry_history_v2');
    if (rawShared) {
      try {
        const parsed = JSON.parse(rawShared);
        if (Array.isArray(parsed)) {
          const updatedShared = parsed.filter((item: any) => item.userId !== targetUserId);
          localStorage.setItem('theodoisk_telemetry_history_v2', JSON.stringify(updatedShared));
        }
      } catch {}
    }
  } catch (e) {
    console.error('Error clearing local history records:', e);
  }
}

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

export function queryHistoricalData(queryText: string, currentTelemetry?: HealthTelemetry): HistoricalQueryResult {
  const text = queryText.toLowerCase();
  const records = getHistoricalRecords();
  const now = Date.now();

  let targetRecords: HistoricalRecord[] = [];
  let timeframeLabel = '';

  if (text.includes('1 giờ trước') || text.includes('1 tiếng trước') || text.includes('một giờ trước') || text.includes('hồi 1h') || text.includes('1h trước')) {
    timeframeLabel = 'khoảng 1 giờ trước';
    const targetTime = now - 1 * 3600 * 1000;
    targetRecords = records.filter(r => {
      const diffMinutes = Math.abs(new Date(r.timestamp).getTime() - targetTime) / (60 * 1000);
      return diffMinutes <= 45;
    });
  } else if (text.includes('2 giờ trước') || text.includes('2 tiếng trước') || text.includes('hai giờ trước') || text.includes('2h trước')) {
    timeframeLabel = 'khoảng 2 giờ trước';
    const targetTime = now - 2 * 3600 * 1000;
    targetRecords = records.filter(r => {
      const diffMinutes = Math.abs(new Date(r.timestamp).getTime() - targetTime) / (60 * 1000);
      return diffMinutes <= 45;
    });
  } else if (text.includes('3 ngày trước') || text.includes('ba ngày trước') || text.includes('cách đây 3 ngày') || text.includes('3 ngày qua')) {
    timeframeLabel = 'cách đây 3 ngày';
    const targetDay = new Date(now - 3 * 24 * 3600 * 1000);
    const targetDateStr = formatDate(targetDay);
    targetRecords = records.filter(r => r.date === targetDateStr || Math.abs(new Date(r.timestamp).getTime() - targetDay.getTime()) < 18 * 3600 * 1000);
  } else if (text.includes('2 ngày trước') || text.includes('hôm kia') || text.includes('hai ngày trước')) {
    timeframeLabel = 'hôm kia (2 ngày trước)';
    const targetDay = new Date(now - 2 * 24 * 3600 * 1000);
    const targetDateStr = formatDate(targetDay);
    targetRecords = records.filter(r => r.date === targetDateStr || Math.abs(new Date(r.timestamp).getTime() - targetDay.getTime()) < 18 * 3600 * 1000);
  } else if (text.includes('hôm qua') || text.includes('1 ngày trước') || text.includes('ngày trước')) {
    timeframeLabel = 'ngày hôm qua';
    const yesterday = new Date(now - 24 * 3600 * 1000);
    const yesterdayStr = formatDate(yesterday);
    targetRecords = records.filter(r => r.date === yesterdayStr || Math.abs(new Date(r.timestamp).getTime() - yesterday.getTime()) < 18 * 3600 * 1000);
  } else if (text.includes('hôm nay') || text.includes('sáng nay') || text.includes('chiều nay') || text.includes('từ sáng')) {
    timeframeLabel = 'trong ngày hôm nay';
    const todayStr = formatDate(new Date(now));
    targetRecords = records.filter(r => r.date === todayStr);
  } else if (text.includes('tuần') || text.includes('toàn bộ') || text.includes('lịch sử') || text.includes('trung bình')) {
    timeframeLabel = 'toàn bộ lịch sử ghi nhận gần đây';
    targetRecords = records.slice(0, 30);
  }

  if (targetRecords.length === 0) {
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

  const validBpm = targetRecords.map(r => r.bpm).filter(b => b > 0);
  const validSpO2 = targetRecords.map(r => r.spo2).filter(s => s > 0);

  const avgBpm = validBpm.length > 0 ? Math.round(validBpm.reduce((a, b) => a + b, 0) / validBpm.length) : undefined;
  const minBpm = validBpm.length > 0 ? Math.min(...validBpm) : undefined;
  const maxBpm = validBpm.length > 0 ? Math.max(...validBpm) : undefined;
  const avgSpO2 = validSpO2.length > 0 ? Number((validSpO2.reduce((a, b) => a + b, 0) / validSpO2.length).toFixed(1)) : undefined;

  const goodCount = targetRecords.filter(r => r.postureStatus === 0).length;
  const badCount = targetRecords.filter(r => r.postureStatus === 1 || r.postureStatus === 3).length;
  const goodPercent = targetRecords.length > 0 ? Math.round((goodCount / targetRecords.length) * 100) : 0;

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

export function normalizeHistoryLog(id: string, raw: any): TelemetryLog {
  const bpm = Number(raw.bpm || raw.heart_rate || raw.hr || 0);
  const spo2 = Number(raw.spo2 || raw.oxygen || raw.spO2 || 0);
  let postureStatus = 0;
  if (raw.posture_status !== undefined) postureStatus = Number(raw.posture_status);
  else if (raw.postureStatus !== undefined) postureStatus = Number(raw.postureStatus);
  else if (raw.status !== undefined && !isNaN(Number(raw.status))) postureStatus = Number(raw.status);

  let rawTime = raw.timestamp || raw.created_at || raw.updated_at || raw.time || new Date().toISOString();
  if (typeof rawTime === 'object' && rawTime?.toDate) {
    rawTime = rawTime.toDate().toISOString();
  }

  const d = new Date(rawTime);
  const isValidDate = !isNaN(d.getTime());
  const dateObj = isValidDate ? d : new Date();

  const timeFormatted = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const dateFormatted = `${day}/${month}/${year}`;
  const dateTimeFormatted = `${dateFormatted} ${timeFormatted}`;

  const postureLabels: Record<number, string> = {
    [-1]: 'Chưa có dữ liệu',
    0: 'Tư thế ĐÚNG',
    1: 'Tư thế SAI (Cúi gù)',
    2: 'VẮNG MẶT',
    3: 'SAI TƯ THẾ LÂU',
    4: 'NGỒI QUÁ LÂU',
    5: 'Tư thế ĐỨNG',
  };

  return {
    id,
    timestamp: dateObj.toISOString(),
    timeFormatted,
    dateFormatted,
    dateTimeFormatted,
    bpm: Math.round(bpm),
    spo2: Number(spo2.toFixed(1)),
    postureStatus,
    postureLabel: raw.posture_label || raw.postureLabel || postureLabels[postureStatus] || 'Tư thế ĐÚNG',
    trackingActive: raw.tracking_active !== undefined ? Boolean(raw.tracking_active) : (raw.trackingActive !== undefined ? Boolean(raw.trackingActive) : true),
    hasAlert: Boolean(raw.hasAlert || raw.has_alert || postureStatus === 1 || postureStatus === 3),
    alertType: raw.alert_type || raw.alertType || (postureStatus === 1 ? 'Cột sống đang bị gù hoặc cúi cổ' : undefined),
    userId: raw.userId || raw.user_id,
    userEmail: raw.userEmail || raw.user_email,
    userName: raw.userName || raw.user_name,
    device: raw.device || raw.device_name || 'Raspberry Pi 4'
  };
}

export async function fetchUserTelemetryHistoryFromFirebase(
  config: FirebaseConnectionConfig,
  userId?: string,
  maxRecords = 100
): Promise<TelemetryLog[]> {
  try {
    const app = initializeFirebaseApp(config);
    const histColName = getHistoryCollectionName(config);
    const lowerUid = (userId || '').trim().toLowerCase();

    if (config.useRealtimeDb && config.databaseURL) {
      const rtdb = getDatabase(app);
      const targetPath = userId ? `users/${userId}/history` : histColName;
      const histRef = ref(rtdb, targetPath);
      const snap = await get(histRef);
      if (snap.exists()) {
        const val = snap.val();
        const logs: TelemetryLog[] = Object.keys(val).map(key => normalizeHistoryLog(key, val[key]));
        return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, maxRecords);
      }
      return [];
    } else {
      const db = getFirestore(app);
      const map = new Map<string, TelemetryLog>();

      if (userId) {
        try {
          const userCollRef = collection(db, 'users', userId, 'history');
          const q = query(userCollRef, orderBy('timestamp', 'desc'), limit(maxRecords));
          const userSnap = await getDocs(q);
          if (!userSnap.empty) {
            userSnap.docs.forEach(d => {
              const item = normalizeHistoryLog(d.id, d.data());
              map.set(item.id, item);
            });
          }
        } catch {}
      }

      try {
        const collRef = collection(db, histColName);
        const q = query(collRef, orderBy('timestamp', 'desc'), limit(maxRecords));
        const snap = await getDocs(q);
        if (!snap.empty) {
          snap.docs.forEach(d => {
            const item = normalizeHistoryLog(d.id, d.data());
            if (!lowerUid || (item.userId && item.userId.toLowerCase() === lowerUid)) {
              map.set(item.id, item);
            }
          });
        }
      } catch {}

      return Array.from(map.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, maxRecords);
    }
  } catch (err) {
    console.warn('Không thể tải lịch sử từ Firebase:', err);
    return [];
  }
}

export async function fetchAllTelemetryHistoryFromFirebase(
  config: FirebaseConnectionConfig,
  maxRecords = 150
): Promise<TelemetryLog[]> {
  return fetchUserTelemetryHistoryFromFirebase(config, undefined, maxRecords);
}

export function subscribeToFirebaseHistory(
  config: FirebaseConnectionConfig,
  onHistory: (logs: TelemetryLog[]) => void,
  onError?: (err: Error) => void,
  userId?: string,
  userEmail?: string
): () => void {
  try {
    const app = initializeFirebaseApp(config);
    const histColName = getHistoryCollectionName(config);
    const lowerEmail = (userEmail || '').trim().toLowerCase();
    const lowerUid = (userId || '').trim().toLowerCase();

    if (config.useRealtimeDb && config.databaseURL) {
      const rtdb = getDatabase(app);
      const targetPath = userId ? `users/${userId}/history` : histColName;
      const histRef = ref(rtdb, targetPath);
      const unsub = onValue(
        histRef,
        snap => {
          if (snap.exists()) {
            const val = snap.val();
            const logs: TelemetryLog[] = Object.keys(val).map(key => normalizeHistoryLog(key, val[key]));
            const sorted = logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 100);
            onHistory(sorted);
          } else {
            onHistory([]);
          }
        },
        err => onError?.(err)
      );
      return () => unsub();
    } else {
      const db = getFirestore(app);
      const unsubs: (() => void)[] = [];
      const cacheMap = new Map<string, TelemetryLog>();

      const broadcastMerged = () => {
        const sorted = Array.from(cacheMap.values())
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 150);
        onHistory(sorted);
      };

      if (userId) {
        const userCollRef = collection(db, 'users', userId, 'history');
        const qUser = query(userCollRef, orderBy('timestamp', 'desc'), limit(100));

        const unsubUser = onSnapshot(
          qUser,
          snap => {
            snap.docs.forEach(d => {
              const item = normalizeHistoryLog(d.id, d.data());
              cacheMap.set(item.id, item);
            });
            broadcastMerged();
          },
          err => {
            markQuotaExceeded(err);
            onError?.(err);
          }
        );
        unsubs.push(unsubUser);
      }

      const collRef = collection(db, histColName);
      const qCentral = query(collRef, orderBy('timestamp', 'desc'), limit(100));

      const unsubCentral = onSnapshot(
        qCentral,
        snap => {
          snap.docs.forEach(d => {
            const item = normalizeHistoryLog(d.id, d.data());
            const matches = 
              (!lowerUid && !lowerEmail) ||
              (lowerUid && item.userId && item.userId.toLowerCase() === lowerUid) ||
              (lowerEmail && item.userEmail && item.userEmail.toLowerCase() === lowerEmail);

            if (matches) {
              cacheMap.set(item.id, item);
            }
          });
          broadcastMerged();
        },
        err => {
          markQuotaExceeded(err);
          onError?.(err);
        }
      );
      unsubs.push(unsubCentral);

      return () => {
        unsubs.forEach(u => u());
      };
    }
  } catch (error) {
    onError?.(error as Error);
    return () => {};
  }
}

export async function clearFirebaseHistory(
  config: FirebaseConnectionConfig,
  userId?: string,
  clearAllUsers?: boolean
): Promise<{ success: boolean; deletedCount: number }> {
  const app = initializeFirebaseApp(config);
  const histColName = getHistoryCollectionName(config);
  const targetCollections = Array.from(new Set<string>([
    'theodoisk_history',
    'devices_history',
    histColName,
    `${config.collectionName}_history`,
    'telemetry_history',
    'telemetry_logs'
  ]));

  let totalDeleted = 0;

  if (config.useRealtimeDb && config.databaseURL) {
    try {
      const rtdb = getDatabase(app);
      if (userId && !clearAllUsers) {
        await remove(ref(rtdb, `users/${userId}/history`)).catch(() => {});
        await remove(ref(rtdb, `user_telemetry/${userId}/history`)).catch(() => {});
      } else {
        for (const col of targetCollections) {
          await remove(ref(rtdb, col)).catch(() => {});
        }
      }
    } catch {}
  }

  try {
    const db = getFirestore(app);

    const safeBatchDelete = async (q: any): Promise<number> => {
      let count = 0;
      let loopCount = 0;
      while (loopCount < 20) {
        loopCount++;
        let snap;
        try {
          snap = await getDocs(q);
        } catch {
          break;
        }
        if (!snap || snap.empty) break;
        try {
          const batch = writeBatch(db);
          snap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
          count += snap.docs.length;
        } catch {
          for (const d of snap.docs) {
            try {
              await deleteDoc(d.ref);
              count++;
            } catch {}
          }
        }
        if (snap.docs.length < 200) break;
      }
      return count;
    };

    if (userId && !clearAllUsers) {
      try {
        const uHistColl = collection(db, 'users', userId, 'history');
        totalDeleted += await safeBatchDelete(query(uHistColl, limit(200)));
      } catch {}

      try {
        const utHistColl = collection(db, 'user_telemetry', userId, 'history');
        totalDeleted += await safeBatchDelete(query(utHistColl, limit(200)));
      } catch {}

      for (const col of targetCollections) {
        try {
          const q1 = query(collection(db, col), where('userId', '==', userId), limit(200));
          totalDeleted += await safeBatchDelete(q1);
        } catch {}
      }
    } else {
      for (const col of targetCollections) {
        try {
          const q = query(collection(db, col), limit(200));
          totalDeleted += await safeBatchDelete(q);
        } catch {}
      }
    }
  } catch (err) {
    console.error('Lỗi khi xóa tài liệu Firestore history:', err);
  }

  return { success: true, deletedCount: totalDeleted };
}

export async function purgeAllFirebaseHistoryCollections(
  config: FirebaseConnectionConfig
): Promise<{ success: boolean; deletedCount: number }> {
  return clearFirebaseHistory(config, undefined, true);
}

export async function deleteSingleTelemetryLogFromFirebase(
  config: FirebaseConnectionConfig,
  logId: string,
  userId?: string
): Promise<void> {
  try {
    const app = initializeFirebaseApp(config);
    const histColName = getHistoryCollectionName(config);
    const targetCollections = Array.from(new Set<string>([
      'theodoisk_history',
      'devices_history',
      histColName,
      `${config.collectionName}_history`,
      'telemetry_history',
      'telemetry_logs'
    ]));

    const db = getFirestore(app);
    for (const col of targetCollections) {
      await deleteDoc(doc(db, col, logId)).catch(() => {});
    }
    if (userId) {
      await deleteDoc(doc(db, 'users', userId, 'history', logId)).catch(() => {});
      await deleteDoc(doc(db, 'user_telemetry', userId, 'history', logId)).catch(() => {});
    }

    if (config.useRealtimeDb && config.databaseURL) {
      const rtdb = getDatabase(app);
      for (const col of targetCollections) {
        await remove(ref(rtdb, `${col}/${logId}`)).catch(() => {});
      }
      if (userId) {
        await remove(ref(rtdb, `users/${userId}/history/${logId}`)).catch(() => {});
        await remove(ref(rtdb, `user_telemetry/${userId}/history/${logId}`)).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Lỗi khi xóa bản ghi đơn lẻ trên Firebase:', err);
  }
}
