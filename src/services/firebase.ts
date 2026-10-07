import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  collection, 
  collectionGroup,
  query, 
  where,
  orderBy, 
  limit, 
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { getDatabase, ref, onValue, set, get, remove } from 'firebase/database';
import { FirebaseConnectionConfig, HealthTelemetry, TelemetryLog, UserTaskNotification, TaskStatus, AuthUser } from '../types';

export const DEFAULT_FIREBASE_CONFIG: FirebaseConnectionConfig = {
  projectId: 'theodoisk-66ddb',
  apiKey: 'AIzaSyAYVIfVEKOAtjGUcYfjib1WU2GjzHzXZpQ',
  databaseURL: 'https://theodoisk-66ddb-default-rtdb.firebaseio.com',
  collectionName: 'theodoisk',
  documentId: 'live',
  useRealtimeDb: false, // Default to Firestore, toggleable to RTDB
  autoConnect: true,
};

let currentUnsubscribe: (() => void) | null = null;

// Circuit Breaker for Firestore Quota Exceeded (Spark Plan limit)
let isQuotaExceeded = false;
const quotaListeners: Array<(exceeded: boolean) => void> = [];

export function checkIsQuotaExceeded(): boolean {
  return isQuotaExceeded;
}

export function onQuotaExceededChange(callback: (exceeded: boolean) => void): () => void {
  quotaListeners.push(callback);
  callback(isQuotaExceeded);
  return () => {
    const idx = quotaListeners.indexOf(callback);
    if (idx !== -1) quotaListeners.splice(idx, 1);
  };
}

export function markQuotaExceeded(err?: any): boolean {
  const isQuota = 
    err?.code === 'resource-exhausted' || 
    err?.message?.includes('Quota exceeded') || 
    err?.message?.includes('resource-exhausted') ||
    String(err).includes('resource-exhausted');

  if (isQuota) {
    if (!isQuotaExceeded) {
      isQuotaExceeded = true;
      console.warn('⚠️ [Firestore Quota] Đã chạm hạn mức Firestore trong ngày (50k lượt/ngày). Ứng dụng tự động kích hoạt Circuit Breaker, chuyển sang Local Cache / RTDB để đảm bảo hệ thống tiếp tục hoạt động mượt mà không bị gián đoạn.');
      quotaListeners.forEach(cb => {
        try { cb(true); } catch {}
      });
    }
    return true;
  }
  return false;
}

export function getHistoryCollectionName(config: FirebaseConnectionConfig): string {
  const base = config.collectionName || 'theodoisk';
  return `${base}_history`;
}

export function getSavedFirebaseConfig(): FirebaseConnectionConfig {
  try {
    const saved = localStorage.getItem('theodoisk_firebase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Auto-migrate if user was previously pointing to 'theodoisk' collection or old projectId
      if (parsed.projectId === 'theodoisk') {
        parsed.projectId = 'theodoisk-66ddb';
      }
      if (!parsed.apiKey) {
        parsed.apiKey = 'AIzaSyAYVIfVEKOAtjGUcYfjib1WU2GjzhzXZpQ';
      }
      return { ...DEFAULT_FIREBASE_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error('Error loading Firebase config:', e);
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveFirebaseConfig(config: FirebaseConnectionConfig) {
  try {
    localStorage.setItem('theodoisk_firebase_config', JSON.stringify(config));
  } catch (e) {
    console.error('Error saving Firebase config:', e);
  }
}

export function initializeFirebaseApp(config: FirebaseConnectionConfig) {
  const appName = 'theodoiskApp';
  const existingApps = getApps();
  const found = existingApps.find(a => a.name === appName);

  const effectiveProjectId = config.projectId || 'theodoisk-66ddb';
  const effectiveApiKey = config.apiKey || 'AIzaSyAYVIfVEKOAtjGUcYfjib1WU2GjzHzXZpQ';
  const appId = '1:591309225754:web:b4c57256f26247781b76a3';

  if (found) {
    // If config has changed (e.g. user provided real API key), re-initialize
    if (found.options.projectId !== effectiveProjectId || found.options.apiKey !== effectiveApiKey) {
      deleteApp(found).catch(() => {});
      return initializeApp({
        projectId: effectiveProjectId,
        apiKey: effectiveApiKey,
        authDomain: `${effectiveProjectId}.firebaseapp.com`,
        appId: appId,
        storageBucket: `${effectiveProjectId}.firebasestorage.app`,
      }, appName);
    }
    return found;
  }

  const firebaseOptions: Record<string, string> = {
    projectId: effectiveProjectId,
    apiKey: effectiveApiKey,
    authDomain: `${effectiveProjectId}.firebaseapp.com`,
    appId: appId,
    storageBucket: `${effectiveProjectId}.firebasestorage.app`,
  };
  if (config.databaseURL) {
    firebaseOptions.databaseURL = config.databaseURL;
  }
  return initializeApp(firebaseOptions, appName);
}

export function subscribeToFirebaseTelemetry(
  config: FirebaseConnectionConfig,
  onData: (data: HealthTelemetry) => void,
  onError: (err: Error) => void
): () => void {
  // Clean up any existing subscription
  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }

  try {
    const app = initializeFirebaseApp(config);

    if (config.useRealtimeDb && config.databaseURL) {
      // Firebase Realtime Database mode
      const rtdb = getDatabase(app);
      const dataRef = ref(rtdb, config.collectionName || 'theodoisk');

      const unsubscribeRtdb = onValue(
        dataRef,
        snapshot => {
          if (snapshot.exists()) {
            const raw = snapshot.val();
            const telemetry = normalizeTelemetry(raw, 'Firebase RTDB');
            onData(telemetry);
          }
        },
        err => {
          onError(err);
        }
      );

      currentUnsubscribe = () => unsubscribeRtdb();
      return currentUnsubscribe;
    } else {
      // Firestore mode
      const db = getFirestore(app);

      // Attempt 1: Listen to live document
      const docRef = doc(db, config.collectionName || 'theodoisk', config.documentId || 'live');
      
      const unsubscribeDoc = onSnapshot(
        docRef,
        snapshot => {
          if (snapshot.exists()) {
            const raw = snapshot.data();
            const telemetry = normalizeTelemetry(raw, 'Firebase Firestore');
            onData(telemetry);
          } else {
            // If specific document doesn't exist, try listening to the latest in collection
            tryListenLatestCollection(db, config.collectionName || 'theodoisk', onData, onError);
          }
        },
        error => {
          if (markQuotaExceeded(error)) {
            onError(error);
            return;
          }
          onError(error);
        }
      );

      currentUnsubscribe = unsubscribeDoc;
      return unsubscribeDoc;
    }
  } catch (error) {
    markQuotaExceeded(error);
    onError(error as Error);
    return () => {};
  }
}

function tryListenLatestCollection(
  db: any,
  collectionName: string,
  onData: (data: HealthTelemetry) => void,
  onError: (err: Error) => void
) {
  if (isQuotaExceeded) return;
  try {
    const collRef = collection(db, collectionName);
    const q = query(collRef, orderBy('timestamp', 'desc'), limit(1));
    const unsubscribeCol = onSnapshot(
      q,
      snap => {
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          const telemetry = normalizeTelemetry(docData, 'Firebase Firestore');
          onData(telemetry);
        }
      },
      err => {
        if (markQuotaExceeded(err)) {
          onError(err);
          return;
        }
        onError(err);
      }
    );
    currentUnsubscribe = unsubscribeCol;
  } catch (e) {
    markQuotaExceeded(e);
    onError(e as Error);
  }
}

export function normalizeTelemetry(raw: any, sourceName: string): HealthTelemetry {
  const bpm = Number(raw.bpm || raw.heart_rate || raw.hr || 0);
  const spo2 = Number(raw.spo2 || raw.oxygen || raw.spO2 || 0);
  
  // Posture status normalization
  // -1: Chưa có dữ liệu, 0: Đúng, 1: Sai, 2: Vắng, 3: Sai lâu, 4: Ngồi lâu
  let postureStatus = 0;
  const rawStatusVal = 
    raw.posture_status ?? 
    raw.postureStatus ?? 
    raw.currentPosture ?? 
    raw.current_posture ?? 
    raw.posture ?? 
    raw.status ?? 
    raw.Status ?? 
    raw.raw_pred ?? 
    raw.pred;

  if (rawStatusVal === -1 || rawStatusVal === '-1') {
    postureStatus = -1;
  } else if (rawStatusVal !== undefined && rawStatusVal !== null) {
    if (typeof rawStatusVal === 'string') {
      const p = rawStatusVal.toLowerCase().trim();
      if (p.includes('chưa có') || p.includes('chua co') || p.includes('none') || p.includes('waiting') || p.includes('chờ') || p === '--') {
        postureStatus = -1;
      } else if (p.includes('sai lâu') || p.includes('long_incorrect')) {
        postureStatus = 3;
      } else if (p.includes('ngồi lâu') || p.includes('long_sitting')) {
        postureStatus = 4;
      } else if (p.includes('sai') || p.includes('bad') || p.includes('incorrect') || p.includes('cui') || p.includes('gu') || p === '1') {
        postureStatus = 1;
      } else if (p.includes('vắng') || p.includes('vang') || p.includes('absent') || p.includes('away') || p === '2') {
        postureStatus = 2;
      } else if (p.includes('đứng') || p.includes('dung_day') || p.includes('stand') || p.includes('standing') || p === '5') {
        postureStatus = 5;
      } else if (p.includes('dung') || p.includes('đúng') || p.includes('correct') || p.includes('good') || p.includes('normal') || p === '0') {
        postureStatus = 0;
      } else {
        postureStatus = 0;
      }
    } else {
      postureStatus = Number(rawStatusVal);
      if (isNaN(postureStatus)) postureStatus = 0;
    }
  }

  // Check if raw label or status from Python specifically indicates standing
  const rawLabelStr = String(raw.posture_label || raw.postureLabel || raw.label || '').toLowerCase();
  const rawStatusName = String(raw.status || raw.Status || '').toUpperCase();
  if (rawStatusName === 'STAND' || rawLabelStr.includes('đứng') || rawLabelStr.includes('dung /') || rawLabelStr.includes('stand')) {
    postureStatus = 5;
  }

  const postureLabels: Record<number, string> = {
    [-1]: 'Chưa có dữ liệu',
    0: 'Tư thế ĐÚNG',
    1: 'Tư thế SAI (Cúi gù)',
    2: 'VẮNG MẶT (Không có người)',
    3: 'SAI TƯ THẾ LÂU',
    4: 'NGỒI LÀM VIỆC QUÁ LÂU',
    5: 'Tư thế ĐỨNG (Làm việc)',
  };

  // Check if camera reported in_zone
  let inZone = Boolean(
    raw.is_in_zone !== undefined
      ? raw.is_in_zone
      : raw.in_zone !== undefined
      ? raw.in_zone
      : raw.inZone !== undefined
      ? raw.inZone
      : postureStatus !== 2 && postureStatus !== -1
  );

  // When outside the zone, the monitored seat has NO person -> must be Absent (Vắng mặt)
  if (!inZone && postureStatus !== -1) {
    postureStatus = 2; // 2: VẮNG MẶT
  }

  const isHumanDetected = (postureStatus === 0 || postureStatus === 1 || postureStatus === 3 || postureStatus === 4 || postureStatus === 5) && inZone;

  const trackingActive = Boolean(
    !inZone || postureStatus === 2 || postureStatus === -1
      ? false
      : isHumanDetected
      ? true
      : raw.tracking_active !== undefined
      ? raw.tracking_active
      : inZone
  );

  // Timestamp parsing (handles string, Firebase Timestamp, or updated_at)
  let timestampStr = new Date().toISOString();
  let packetAgeSeconds: number | undefined = undefined;
  const rawTime = raw.timestamp || raw.updated_at || raw.time || raw.created_at;
  if (rawTime) {
    if (typeof rawTime === 'object' && rawTime.toDate) {
      const d = rawTime.toDate();
      timestampStr = d.toISOString();
      packetAgeSeconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    } else if (typeof rawTime === 'string') {
      timestampStr = rawTime;
      const parsedTime = Date.parse(rawTime);
      if (!isNaN(parsedTime)) {
        packetAgeSeconds = Math.max(0, Math.floor((Date.now() - parsedTime) / 1000));
      }
    } else if (typeof rawTime === 'number') {
      const ms = rawTime > 1e11 ? rawTime : rawTime * 1000;
      timestampStr = new Date(ms).toISOString();
      packetAgeSeconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    }
  }

  // Stale check: if packet is older than 90 seconds (1.5 minutes)
  const isStale = packetAgeSeconds !== undefined && packetAgeSeconds > 90;

  // Image parsing (Base64 JPEG or Firebase Storage / HTTP URL)
  let image: string | undefined = undefined;
  const rawImage = raw.image || raw.image_base64 || raw.camera_frame || raw.frame || raw.image_url || raw.snapshot;
  if (typeof rawImage === 'string' && rawImage.trim().length > 0) {
    const trimmed = rawImage.trim();
    if (trimmed.startsWith('data:image') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      image = trimmed;
    } else if (trimmed.length > 50) {
      // Raw base64 string without data: prefix
      image = `data:image/jpeg;base64,${trimmed}`;
    }
  }

  const resolvedLabel = 
    raw.posture_label || 
    raw.postureLabel || 
    raw.currentPostureText || 
    postureLabels[postureStatus] || 
    (typeof raw.posture_status === 'string' ? raw.posture_status : 'Tư thế ĐÚNG');

  return {
    bpm: Math.round(bpm),
    spo2: Number(spo2.toFixed(1)),
    postureStatus,
    postureLabel: resolvedLabel,
    trackingActive,
    inZone,
    timestamp: timestampStr,
    source: sourceName,
    confidence: raw.confidence ? Number(raw.confidence) : 95,
    angleNeck: raw.angle_neck !== undefined ? Number(raw.angle_neck) : undefined,
    postureWarning: raw.posture_warning || raw.postureWarning || (postureStatus === 1 ? 'Cột sống đang bị gù hoặc cúi cổ' : undefined),
    hasAlert: Boolean(raw.hasAlert || raw.has_alert || postureStatus === 1 || postureStatus === 3),
    isSimulating: Boolean(raw.isSimulating || raw.is_simulating),
    isStale,
    packetAgeSeconds,
    image,
  };
}

// Reset/clear telemetry from Firebase document back to empty/waiting state
export async function clearFirebaseTelemetry(config: FirebaseConnectionConfig): Promise<void> {
  const app = initializeFirebaseApp(config);
  const targetCol = config.collectionName || 'devices';
  const targetDoc = config.documentId || 'pi4_node_1';

  const emptyPayload = {
    heart_rate: 0,
    bpm: 0,
    spo2: 0,
    posture_status: -1,
    posture_label: 'Chưa có dữ liệu',
    tracking_active: false,
    is_in_zone: false,
    timestamp: new Date().toISOString(),
    cleared_at: new Date().toISOString(),
    image: null,
    source: 'Đã xóa dữ liệu trên Firebase',
    note: 'Đặt lại về trạng thái chờ kết nối thực tế'
  };

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Hết thời gian chờ (Timeout 7s)')), 7000)
  );

  const clearOperation = (async () => {
    if (config.useRealtimeDb && config.databaseURL) {
      const rtdb = getDatabase(app);
      const dataRef = ref(rtdb, targetCol);
      await set(dataRef, emptyPayload);
    } else {
      const db = getFirestore(app);
      const docRef = doc(db, targetCol, targetDoc);
      await setDoc(docRef, emptyPayload);
    }
  })();

  await Promise.race([clearOperation, timeoutPromise]);
}

// Push test telemetry to Firebase (can be used for testing from UI)
export async function pushMockTelemetryToFirebase(config: FirebaseConnectionConfig, data: Partial<HealthTelemetry>) {
  const app = initializeFirebaseApp(config);
  const targetCol = config.collectionName || 'theodoisk';
  const targetDoc = config.documentId || 'live';

  const nowIso = new Date().toISOString();
  const payload = {
    bpm: data.bpm ?? 76,
    spo2: data.spo2 ?? 98.5,
    heart_rate: data.bpm ?? 76,
    posture_status: data.postureStatus ?? 0,
    tracking_active: data.trackingActive ?? true,
    is_in_zone: data.inZone ?? true,
    timestamp: nowIso,
    device: 'Raspberry Pi 4 Model B (Test)',
    image: data.image ?? undefined,
    note: 'Sent from Web Health Monitor console'
  };

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Hết thời gian chờ (Timeout 7s). Nguyên nhân thường gặp: Bạn chưa bấm "Create Database" trong mục Firestore trên Firebase Console, hoặc Firestore Rules chưa mở quyền ghi (allow write: if true).')), 7000)
  );

  const writeOperation = (async () => {
    if (config.useRealtimeDb && config.databaseURL) {
      const rtdb = getDatabase(app);
      const dataRef = ref(rtdb, targetCol);
      await set(dataRef, payload);
    } else {
      const db = getFirestore(app);
      const docRef = doc(db, targetCol, targetDoc);
      await setDoc(docRef, payload);
    }

    // Không ghi vào Firestore history nữa vì hệ thống chuyển sang lưu Supabase PostgreSQL chính
  })();

  await Promise.race([writeOperation, timeoutPromise]);
}

// ---------------------------------------------------------------------------
// HISTORICAL TELEMETRY PERSISTENCE IN FIREBASE (FIRESTORE & RTDB)
// ---------------------------------------------------------------------------

export function normalizeHistoryLog(docId: string, raw: any): TelemetryLog {
  const bpm = Number(raw.bpm || raw.heart_rate || 0);
  const spo2 = Number(raw.spo2 || raw.oxygen || 0);
  let postureStatus = Number(raw.posture_status ?? raw.postureStatus ?? 0);
  let postureLabel = String(raw.posture_label || raw.postureLabel || '');
  if (postureLabel.toLowerCase().includes('đứng') || postureLabel.toLowerCase().includes('dung /') || postureLabel.toLowerCase().includes('stand')) {
    postureStatus = 5;
  }
  
  if (!postureLabel) {
    if (postureStatus === 0) postureLabel = 'Tư thế ĐÚNG';
    else if (postureStatus === 1) postureLabel = 'Tư thế SAI';
    else if (postureStatus === 2) postureLabel = 'VẮNG MẶT';
    else if (postureStatus === 3) postureLabel = 'SAI TƯ THẾ LÂU';
    else if (postureStatus === 4) postureLabel = 'NGỒI LÀM VIỆC QUÁ LÂU';
    else if (postureStatus === 5) postureLabel = 'Tư thế ĐỨNG';
    else postureLabel = 'Đang theo dõi';
  }

  const trackingActive = Boolean(raw.tracking_active ?? raw.trackingActive ?? (postureStatus !== 2));
  const hasAlert = Boolean(raw.has_alert ?? raw.hasAlert ?? (postureStatus === 1 || postureStatus === 3 || (bpm > 0 && (bpm < 50 || bpm > 110)) || (spo2 > 0 && spo2 < 94)));
  
  let alertType = raw.alert_type || raw.alertType;
  if (!alertType && hasAlert) {
    if (postureStatus === 3) alertType = 'Sai tư thế lâu';
    else if (postureStatus === 1) alertType = 'Sai tư thế';
    else if (bpm > 110) alertType = 'Nhịp tim nhanh';
    else if (bpm > 0 && bpm < 50) alertType = 'Nhịp tim chậm';
    else if (spo2 > 0 && spo2 < 94) alertType = 'Thiếu oxy SpO₂';
  }

  let timestamp = raw.timestamp || raw.created_at || new Date().toISOString();
  if (typeof timestamp === 'object' && timestamp?.toDate) {
    timestamp = timestamp.toDate().toISOString();
  }

  let timeFormatted = raw.time_formatted || raw.timeFormatted;
  let dateFormatted = raw.date_formatted || raw.dateFormatted;
  let dateTimeFormatted = raw.datetime_formatted || raw.dateTimeFormatted;

  if (timestamp) {
    try {
      const d = new Date(timestamp);
      if (!isNaN(d.getTime())) {
        if (!timeFormatted) {
          timeFormatted = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        if (!dateFormatted) {
          dateFormatted = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
        if (!dateTimeFormatted) {
          dateTimeFormatted = `${dateFormatted} ${timeFormatted}`;
        }
      }
    } catch {
      timeFormatted = timeFormatted || '--:--:--';
      dateFormatted = dateFormatted || '--/--/----';
      dateTimeFormatted = dateTimeFormatted || '--';
    }
  }

  return {
    id: docId || raw.id || `rec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: String(timestamp),
    timeFormatted: timeFormatted || new Date().toLocaleTimeString('vi-VN'),
    dateFormatted: dateFormatted || new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    dateTimeFormatted: dateTimeFormatted || `${dateFormatted || ''} ${timeFormatted || ''}`.trim(),
    bpm: Math.round(bpm),
    spo2: Number(spo2.toFixed(1)),
    postureStatus,
    postureLabel,
    trackingActive,
    hasAlert,
    alertType,
    userId: raw.user_id || raw.userId || undefined,
    userEmail: raw.user_email || raw.userEmail || undefined,
    userName: raw.user_name || raw.userName || undefined,
    device: raw.device || undefined,
  };
}

/**
 * Save an individual telemetry log entry to Firebase Firestore collection or RTDB.
 */
export async function saveTelemetryHistoryToFirebase(
  config: FirebaseConnectionConfig,
  entry: TelemetryLog
): Promise<void> {
  try {
    const app = initializeFirebaseApp(config);
    const histColName = getHistoryCollectionName(config);
    const now = new Date();
    const timestampMs = Date.now();
    const docId = entry.id && entry.id.length > 5 
      ? entry.id 
      : `rec_${timestampMs}_${Math.random().toString(36).substr(2, 5)}`;

    const parsedD = entry.timestamp ? new Date(entry.timestamp) : now;
    const validD = isNaN(parsedD.getTime()) ? now : parsedD;
    const dateFormatted = entry.dateFormatted || validD.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeFormatted = entry.timeFormatted || validD.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateYMD = validD.toISOString().split('T')[0];

    const payload = {
      id: docId,
      timestamp: validD.toISOString(),
      date: dateYMD,
      date_formatted: dateFormatted,
      time_formatted: timeFormatted,
      datetime_formatted: `${dateFormatted} ${timeFormatted}`,
      bpm: entry.bpm,
      spo2: entry.spo2,
      posture_status: entry.postureStatus,
      posture_label: entry.postureLabel,
      tracking_active: entry.trackingActive,
      has_alert: entry.hasAlert,
      alert_type: entry.alertType || '',
      created_at: now.toISOString(),
      device: entry.device || 'Raspberry Pi 4 / Monitor Node',
      user_id: entry.userId || '',
      user_email: (entry.userEmail || '').toLowerCase().trim(),
      user_name: entry.userName || '',
      userId: entry.userId || '',
      userEmail: (entry.userEmail || '').toLowerCase().trim(),
      userName: entry.userName || ''
    };

    const targetUserId = entry.userId || payload.user_id || 'user-default';

    if (config.useRealtimeDb && config.databaseURL) {
      const rtdb = getDatabase(app);
      // 1. Lưu theo từng tài khoản trên RTDB: users/{userId}/history/{docId}
      await set(ref(rtdb, `users/${targetUserId}/history/${docId}`), payload);
      // 2. Lưu tập trung để Admin / thiết bị truy vấn tổng quan
      await set(ref(rtdb, `${histColName}/${docId}`), payload);
      if (histColName !== 'theodoisk_history') {
        await set(ref(rtdb, `theodoisk_history/${docId}`), payload);
      }
    } else {
      if (isQuotaExceeded) return;
      const db = getFirestore(app);
      // 1. Lưu lịch sử theo từng tài khoản riêng biệt: users/{userId}/history/{docId}
      const userHistDocRef = doc(db, 'users', targetUserId, 'history', docId);
      await setDoc(userHistDocRef, payload, { merge: true });

      // 2. Lưu đồng thời vào theodoisk_history để quản trị viên & bộ lọc console Firebase thấy đầy đủ
      const docRef = doc(db, histColName, docId);
      await setDoc(docRef, payload, { merge: true });
      if (histColName !== 'theodoisk_history') {
        const primaryDocRef = doc(db, 'theodoisk_history', docId);
        await setDoc(primaryDocRef, payload, { merge: true });
      }
    }
  } catch (error) {
    if (markQuotaExceeded(error)) return;
    console.warn('Lỗi ghi bản ghi lịch sử lên Firebase:', error);
  }
}

/**
 * Batch upload multiple historical telemetry logs to Firebase Firestore / RTDB.
 * Ensures that all recorded local data points are saved to Firebase per user account.
 */
export async function batchSaveTelemetryHistoryToFirebase(
  config: FirebaseConnectionConfig,
  entries: TelemetryLog[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!entries || entries.length === 0) {
    return { success: true, count: 0 };
  }

  try {
    const app = initializeFirebaseApp(config);
    const histColName = getHistoryCollectionName(config);
    const now = new Date();

    if (config.useRealtimeDb && config.databaseURL) {
      const rtdb = getDatabase(app);
      let count = 0;
      for (const entry of entries.slice(0, 150)) {
        const parsedD = entry.timestamp ? new Date(entry.timestamp) : now;
        const validD = isNaN(parsedD.getTime()) ? now : parsedD;
        const docId = entry.id && entry.id.startsWith('rec_') 
          ? entry.id 
          : `rec_${validD.getTime()}_${Math.random().toString(36).substr(2, 5)}`;
        const dateFormatted = entry.dateFormatted || validD.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeFormatted = entry.timeFormatted || validD.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const targetUserId = entry.userId || 'user-default';

        const payload = {
          id: docId,
          timestamp: validD.toISOString(),
          date: validD.toISOString().split('T')[0],
          date_formatted: dateFormatted,
          time_formatted: timeFormatted,
          datetime_formatted: `${dateFormatted} ${timeFormatted}`,
          bpm: entry.bpm,
          spo2: entry.spo2,
          posture_status: entry.postureStatus,
          posture_label: entry.postureLabel,
          tracking_active: entry.trackingActive,
          has_alert: entry.hasAlert,
          alert_type: entry.alertType || '',
          created_at: now.toISOString(),
          device: entry.device || 'Raspberry Pi 4 / Monitor Node',
          user_id: targetUserId,
          user_email: entry.userEmail || '',
          user_name: entry.userName || ''
        };
        // Lưu phân tách theo tài khoản
        await set(ref(rtdb, `users/${targetUserId}/history/${docId}`), payload);
        await set(ref(rtdb, `${histColName}/${docId}`), payload);
        if (histColName !== 'theodoisk_history') {
          await set(ref(rtdb, `theodoisk_history/${docId}`), payload);
        }
        count++;
      }
      return { success: true, count };
    } else {
      const db = getFirestore(app);
      let totalSynced = 0;

      // Strategy: Try batch write first (chunk size 40)
      const chunkSize = 40;
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        
        try {
          const batch = writeBatch(db);
          chunk.forEach(entry => {
            const parsedD = entry.timestamp ? new Date(entry.timestamp) : now;
            const validD = isNaN(parsedD.getTime()) ? now : parsedD;
            const docId = entry.id && entry.id.startsWith('rec_')
              ? entry.id
              : `rec_${validD.getTime()}_${Math.random().toString(36).substr(2, 5)}`;
            const dateFormatted = entry.dateFormatted || validD.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeFormatted = entry.timeFormatted || validD.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const targetUserId = entry.userId || 'user-default';

            const payload = {
              id: docId,
              timestamp: validD.toISOString(),
              date: validD.toISOString().split('T')[0],
              date_formatted: dateFormatted,
              time_formatted: timeFormatted,
              datetime_formatted: `${dateFormatted} ${timeFormatted}`,
              bpm: Number(entry.bpm || 0),
              spo2: Number(entry.spo2 || 0),
              posture_status: Number(entry.postureStatus ?? 0),
              posture_label: entry.postureLabel || 'Tư thế ĐÚNG',
              tracking_active: Boolean(entry.trackingActive),
              has_alert: Boolean(entry.hasAlert),
              alert_type: entry.alertType || '',
              created_at: now.toISOString(),
              device: entry.device || 'Raspberry Pi 4 / Monitor Node',
              user_id: targetUserId,
              user_email: entry.userEmail || '',
              user_name: entry.userName || ''
            };

            // 1. Phân tách theo tài khoản: users/{userId}/history/{docId}
            const userDocRef = doc(db, 'users', targetUserId, 'history', docId);
            batch.set(userDocRef, payload, { merge: true });

            // 2. Collection chung
            const docRef1 = doc(db, histColName, docId);
            batch.set(docRef1, payload, { merge: true });

            if (histColName !== 'theodoisk_history') {
              const docRef2 = doc(db, 'theodoisk_history', docId);
              batch.set(docRef2, payload, { merge: true });
            }
          });

          await batch.commit();
          totalSynced += chunk.length;
        } catch (batchErr) {
          console.warn('writeBatch thất bại, chuyển sang ghi trực tiếp từng tài liệu setDoc:', batchErr);
          // Fallback: write individually with setDoc
          for (const entry of chunk) {
            try {
              const parsedD = entry.timestamp ? new Date(entry.timestamp) : now;
              const validD = isNaN(parsedD.getTime()) ? now : parsedD;
              const docId = entry.id && entry.id.startsWith('rec_')
                ? entry.id
                : `rec_${validD.getTime()}_${Math.random().toString(36).substr(2, 5)}`;
              const dateFormatted = entry.dateFormatted || validD.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
              const timeFormatted = entry.timeFormatted || validD.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const targetUserId = entry.userId || 'user-default';

              const payload = {
                id: docId,
                timestamp: validD.toISOString(),
                date: validD.toISOString().split('T')[0],
                date_formatted: dateFormatted,
                time_formatted: timeFormatted,
                datetime_formatted: `${dateFormatted} ${timeFormatted}`,
                bpm: Number(entry.bpm || 0),
                spo2: Number(entry.spo2 || 0),
                posture_status: Number(entry.postureStatus ?? 0),
                posture_label: entry.postureLabel || 'Tư thế ĐÚNG',
                tracking_active: Boolean(entry.trackingActive),
                has_alert: Boolean(entry.hasAlert),
                alert_type: entry.alertType || '',
                created_at: now.toISOString(),
                device: 'Raspberry Pi 4 / Monitor Node',
                user_id: targetUserId,
                user_email: entry.userEmail || '',
                user_name: entry.userName || ''
              };

              await setDoc(doc(db, 'users', targetUserId, 'history', docId), payload, { merge: true });
              await setDoc(doc(db, histColName, docId), payload, { merge: true });
              if (histColName !== 'theodoisk_history') {
                await setDoc(doc(db, 'theodoisk_history', docId), payload, { merge: true });
              }
              totalSynced++;
            } catch (singleErr) {
              console.error('Lỗi lưu bản ghi đơn lẻ:', singleErr);
            }
          }
        }
      }

      return { success: totalSynced > 0, count: totalSynced };
    }
  } catch (error: any) {
    console.error('Lỗi batchSaveTelemetryHistoryToFirebase:', error);
    return { success: false, count: 0, error: error?.message || 'Lỗi không xác định khi lưu lên Firebase' };
  }
}

/**
 * Query historical telemetry logs from Firebase.
 * If `userId` is provided, fetches specifically from the account's partition `users/{userId}/history`.
 * Otherwise, fetches from global/admin collections.
 */
export async function fetchFirebaseHistory(
  config: FirebaseConnectionConfig,
  maxRecords = 100,
  userId?: string,
  userEmail?: string
): Promise<TelemetryLog[]> {
  try {
    const app = initializeFirebaseApp(config);
    const histColName = getHistoryCollectionName(config);
    const lowerEmail = (userEmail || '').trim().toLowerCase();
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

      // 1. If user ID is given, read from their personal account history: users/{userId}/history
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
          } else {
            const fallbackSnap = await getDocs(userCollRef);
            fallbackSnap.docs.forEach(d => {
              const item = normalizeHistoryLog(d.id, d.data());
              map.set(item.id, item);
            });
          }
        } catch (uErr) {
          console.warn('Lỗi đọc users/{userId}/history:', uErr);
        }
      }

      // 2. Also check the centralized theodoisk_history collection to sync logs recorded by PC / RPi / Mobile
      try {
        const collRef = collection(db, histColName);
        const q = query(collRef, orderBy('timestamp', 'desc'), limit(maxRecords * 2));
        const snap = await getDocs(q);
        if (!snap.empty) {
          snap.docs.forEach(d => {
            const item = normalizeHistoryLog(d.id, d.data());
            const matchesUser = 
              (!lowerUid && !lowerEmail) ||
              (lowerUid && item.userId && item.userId.toLowerCase() === lowerUid) ||
              (lowerEmail && item.userEmail && item.userEmail.toLowerCase() === lowerEmail) ||
              (lowerEmail && item.userId && item.userId.toLowerCase() === lowerEmail);
            
            if (matchesUser) {
              map.set(item.id, item);
            }
          });
        }
      } catch (orderErr) {
        try {
          const collRef = collection(db, histColName);
          const snap = await getDocs(collRef);
          snap.docs.forEach(d => {
            const item = normalizeHistoryLog(d.id, d.data());
            const matchesUser = 
              (!lowerUid && !lowerEmail) ||
              (lowerUid && item.userId && item.userId.toLowerCase() === lowerUid) ||
              (lowerEmail && item.userEmail && item.userEmail.toLowerCase() === lowerEmail) ||
              (lowerEmail && item.userId && item.userId.toLowerCase() === lowerEmail);
            
            if (matchesUser) {
              map.set(item.id, item);
            }
          });
        } catch {}
      }

      if (histColName !== 'theodoisk_history') {
        try {
          const primaryRef = collection(db, 'theodoisk_history');
          const primarySnap = await getDocs(query(primaryRef, limit(maxRecords * 2)));
          primarySnap.docs.forEach(d => {
            const item = normalizeHistoryLog(d.id, d.data());
            const matchesUser = 
              (!lowerUid && !lowerEmail) ||
              (lowerUid && item.userId && item.userId.toLowerCase() === lowerUid) ||
              (lowerEmail && item.userEmail && item.userEmail.toLowerCase() === lowerEmail) ||
              (lowerEmail && item.userId && item.userId.toLowerCase() === lowerEmail);
            
            if (matchesUser) {
              map.set(item.id, item);
            }
          });
        } catch {}
      }

      const merged = Array.from(map.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, maxRecords);

      return merged;
    }
  } catch (err) {
    console.warn('Không thể tải lịch sử từ Firebase:', err);
    return [];
  }
}

/**
 * Real-time listener for the history collection.
 * If `userId` or `userEmail` is provided, listens to both personal and centralized history.
 */
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

      // 1. Personal partition subcollection: users/{userId}/history
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
          (err) => {
            if (markQuotaExceeded(err)) {
              onError?.(err);
              return;
            }
            try {
              const fallbackUnsub = onSnapshot(userCollRef, snapFallback => {
                snapFallback.docs.forEach(d => {
                  const item = normalizeHistoryLog(d.id, d.data());
                  cacheMap.set(item.id, item);
                });
                broadcastMerged();
              }, err2 => {
                markQuotaExceeded(err2);
                onError?.(err2);
              });
              unsubs.push(fallbackUnsub);
            } catch (e) {
              markQuotaExceeded(e);
              onError?.(e as Error);
            }
          }
        );
        unsubs.push(unsubUser);
      }

      // 2. Centralized collection: theodoisk_history (guarantees cross-device sync between PC & phone)
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
              (lowerEmail && item.userEmail && item.userEmail.toLowerCase() === lowerEmail) ||
              (lowerEmail && item.userId && item.userId.toLowerCase() === lowerEmail);

            if (matches) {
              cacheMap.set(item.id, item);
            }
          });
          broadcastMerged();
        },
        (err) => {
          if (markQuotaExceeded(err)) {
            onError?.(err);
            return;
          }
          try {
            const fallbackUnsub = onSnapshot(
              collRef,
              snapFallback => {
                snapFallback.docs.forEach(d => {
                  const item = normalizeHistoryLog(d.id, d.data());
                  const matches = 
                    (!lowerUid && !lowerEmail) ||
                    (lowerUid && item.userId && item.userId.toLowerCase() === lowerUid) ||
                    (lowerEmail && item.userEmail && item.userEmail.toLowerCase() === lowerEmail) ||
                    (lowerEmail && item.userId && item.userId.toLowerCase() === lowerEmail);

                  if (matches) {
                    cacheMap.set(item.id, item);
                  }
                });
                broadcastMerged();
              },
              fallbackErr => {
                markQuotaExceeded(fallbackErr);
                onError?.(fallbackErr);
              }
            );
            unsubs.push(fallbackUnsub);
          } catch (e) {
            markQuotaExceeded(e);
            onError?.(e as Error);
          }
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

/**
 * Delete all historical records from all Firebase history collections
 * (including theodoisk_history, devices_history, and configured history names).
 * Uses batched deletions with pagination loop to guarantee complete wipeout.
 */
export async function clearFirebaseHistory(
  config: FirebaseConnectionConfig,
  userId?: string,
  clearAllUsers?: boolean
): Promise<{ success: boolean; deletedCount: number }> {
  const app = initializeFirebaseApp(config);
  const histColName = getHistoryCollectionName(config);

  // Targets all collections that store telemetry logs
  const targetCollections = Array.from(new Set<string>([
    'theodoisk_history',
    'devices_history',
    histColName,
    `${config.collectionName}_history`,
    'telemetry_history',
    'telemetry_logs'
  ]));

  let totalDeleted = 0;

  // 1. Remove from Realtime Database if configured
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
        try {
          const usersRef = ref(rtdb, 'users');
          const usersSnap = await get(usersRef);
          if (usersSnap.exists()) {
            const val = usersSnap.val();
            for (const uKey of Object.keys(val)) {
              await remove(ref(rtdb, `users/${uKey}/history`)).catch(() => {});
              await remove(ref(rtdb, `user_telemetry/${uKey}/history`)).catch(() => {});
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Lỗi khi xóa RTDB history:', e);
    }
  }

  // 2. Delete all records from Firestore collections in safe chunks with per-doc fallback
  try {
    const db = getFirestore(app);

    const safeBatchDelete = async (q: any): Promise<number> => {
      let count = 0;
      let keepDeleting = true;
      let loopCount = 0;
      while (keepDeleting && loopCount < 50) {
        loopCount++;
        let snap;
        try {
          snap = await getDocs(q);
        } catch (e) {
          break;
        }
        if (!snap || snap.empty) {
          break;
        }
        try {
          const batch = writeBatch(db);
          snap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
          count += snap.docs.length;
        } catch (batchErr) {
          // Fallback doc-by-doc
          for (const d of snap.docs) {
            try {
              await deleteDoc(d.ref);
              count++;
            } catch {}
          }
        }
        if (snap.docs.length < 350) {
          break;
        }
      }
      return count;
    };

    // Case A: Clear specific user's private history
    if (userId && !clearAllUsers) {
      // 1. Wipe out /users/{userId}/history and /user_telemetry/{userId}/history
      try {
        const uHistColl = collection(db, 'users', userId, 'history');
        totalDeleted += await safeBatchDelete(query(uHistColl, limit(350)));
      } catch {}

      try {
        const utHistColl = collection(db, 'user_telemetry', userId, 'history');
        totalDeleted += await safeBatchDelete(query(utHistColl, limit(350)));
      } catch {}

      // 2. Also wipe user's records in the root history collections
      for (const col of targetCollections) {
        try {
          const q1 = query(collection(db, col), where('user_id', '==', userId), limit(350));
          totalDeleted += await safeBatchDelete(q1);
        } catch {}

        try {
          const q2 = query(collection(db, col), where('userId', '==', userId), limit(350));
          totalDeleted += await safeBatchDelete(q2);
        } catch {}
      }
    } else {
      // Case B: Clear all history across all users & collections (Full Purge)
      for (const col of targetCollections) {
        try {
          const q = query(collection(db, col), limit(350));
          totalDeleted += await safeBatchDelete(q);
        } catch (colErr) {
          console.warn(`Lỗi khi dọn collection ${col}:`, colErr);
        }
      }

      // Also clean up subcollection /users/{uid}/history and /user_telemetry/{uid}/history
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        for (const uDoc of usersSnap.docs) {
          try {
            const userHistColl = collection(db, 'users', uDoc.id, 'history');
            totalDeleted += await safeBatchDelete(query(userHistColl, limit(350)));
          } catch {}
        }
      } catch (errUsers) {
        console.warn('Lỗi khi quét subcollections users/*/history:', errUsers);
      }

      try {
        const utSnap = await getDocs(collection(db, 'user_telemetry'));
        for (const utDoc of utSnap.docs) {
          try {
            const utHistColl = collection(db, 'user_telemetry', utDoc.id, 'history');
            totalDeleted += await safeBatchDelete(query(utHistColl, limit(350)));
          } catch {}
        }
      } catch {}
    }
  } catch (err) {
    console.error('Lỗi khi xóa tài liệu Firestore history:', err);
  }

  return { success: true, deletedCount: totalDeleted };
}

/**
 * Xóa sạch hoàn toàn mọi collection và document lịch sử còn sót lại trên Firebase Firestore
 * Dành cho người dùng khi đã chuyển sang Supabase và không muốn lưu rác trên Firebase nữa.
 */
export async function purgeAllFirebaseHistoryCollections(
  config: FirebaseConnectionConfig
): Promise<{ success: boolean; deletedCount: number }> {
  return clearFirebaseHistory(config, undefined, true);
}

/**
 * Delete a single telemetry log entry from all history collections in Firebase.
 */
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

    // 1. Firestore deletion
    const db = getFirestore(app);
    for (const col of targetCollections) {
      await deleteDoc(doc(db, col, logId)).catch(() => {});
    }
    if (userId) {
      await deleteDoc(doc(db, 'users', userId, 'history', logId)).catch(() => {});
      await deleteDoc(doc(db, 'user_telemetry', userId, 'history', logId)).catch(() => {});
    } else {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        for (const uDoc of usersSnap.docs) {
          await deleteDoc(doc(db, 'users', uDoc.id, 'history', logId)).catch(() => {});
        }
      } catch {}
      try {
        const utSnap = await getDocs(collection(db, 'user_telemetry'));
        for (const utDoc of utSnap.docs) {
          await deleteDoc(doc(db, 'user_telemetry', utDoc.id, 'history', logId)).catch(() => {});
        }
      } catch {}
    }

    // 2. Realtime Database deletion
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

/**
 * Send a task or broadcast notification to Firebase Firestore.
 */
export async function sendTaskNotificationToFirebase(
  config: FirebaseConnectionConfig,
  notif: Omit<UserTaskNotification, 'id' | 'createdAt' | 'status'>
): Promise<UserTaskNotification> {
  const app = initializeFirebaseApp(config);
  const db = getFirestore(app);
  const now = new Date();
  const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const fullNotif: UserTaskNotification = {
    ...notif,
    id,
    status: 'pending',
    createdAt: now.toISOString(),
  };

  try {
    await setDoc(doc(db, 'notifications', id), fullNotif);
  } catch (err) {
    console.warn('Lỗi lưu thông báo vào Firestore:', err);
  }

  // Backup to localStorage
  try {
    const saved = localStorage.getItem('theodoisk_task_notifications');
    const list: UserTaskNotification[] = saved ? JSON.parse(saved) : [];
    localStorage.setItem('theodoisk_task_notifications', JSON.stringify([fullNotif, ...list.slice(0, 99)]));
  } catch {}

  return fullNotif;
}

/**
 * Real-time listener for tasks and notifications from Firebase Firestore.
 */
export function subscribeToTaskNotifications(
  config: FirebaseConnectionConfig,
  currentUserId: string,
  onUpdate: (notifications: UserTaskNotification[]) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const collRef = collection(db, 'notifications');
    const q = query(collRef, orderBy('createdAt', 'desc'), limit(60));

    const unsub = onSnapshot(
      q,
      snap => {
        const notifs: UserTaskNotification[] = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            targetUserId: data.targetUserId || 'all',
            targetUserName: data.targetUserName || '',
            senderId: data.senderId || 'Admin',
            senderName: data.senderName || 'Quản trị viên',
            type: data.type || 'task',
            title: data.title || '',
            content: data.content || '',
            priority: data.priority || 'normal',
            status: data.status || 'pending',
            deadline: data.deadline,
            createdAt: data.createdAt || new Date().toISOString(),
            acknowledgedAt: data.acknowledgedAt,
            completedAt: data.completedAt,
          };
        });
        onUpdate(notifs);
      },
      err => {
        // Fallback without orderBy
        try {
          const fallbackUnsub = onSnapshot(collRef, snapFallback => {
            const notifs: UserTaskNotification[] = snapFallback.docs.map(d => {
              const data = d.data();
              return {
                id: d.id,
                targetUserId: data.targetUserId || 'all',
                targetUserName: data.targetUserName || '',
                senderId: data.senderId || 'Admin',
                senderName: data.senderName || 'Quản trị viên',
                type: data.type || 'task',
                title: data.title || '',
                content: data.content || '',
                priority: data.priority || 'normal',
                status: data.status || 'pending',
                deadline: data.deadline,
                createdAt: data.createdAt || new Date().toISOString(),
                acknowledgedAt: data.acknowledgedAt,
                completedAt: data.completedAt,
              };
            });
            notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            onUpdate(notifs);
          });
          return fallbackUnsub;
        } catch (e) {
          onError?.(err);
        }
      }
    );

    return unsub;
  } catch (err) {
    onError?.(err as Error);
    return () => {};
  }
}

/**
 * Update task status (acknowledged or completed) in Firebase Firestore.
 */
export async function updateTaskStatusInFirebase(
  config: FirebaseConnectionConfig,
  taskId: string,
  newStatus: TaskStatus
): Promise<void> {
  try {
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const updateData: any = { status: newStatus };
    if (newStatus === 'acknowledged') {
      updateData.acknowledgedAt = new Date().toISOString();
    } else if (newStatus === 'completed') {
      updateData.completedAt = new Date().toISOString();
    }
    await setDoc(doc(db, 'notifications', taskId), updateData, { merge: true });
  } catch (err) {
    console.warn('Lỗi cập nhật trạng thái thông báo/task:', err);
  }

  // Also update in localStorage backup
  try {
    const saved = localStorage.getItem('theodoisk_task_notifications');
    if (saved) {
      const list: UserTaskNotification[] = JSON.parse(saved);
      const updated = list.map(item => {
        if (item.id === taskId) {
          return {
            ...item,
            status: newStatus,
            acknowledgedAt: newStatus === 'acknowledged' ? new Date().toISOString() : item.acknowledgedAt,
            completedAt: newStatus === 'completed' ? new Date().toISOString() : item.completedAt,
          };
        }
        return item;
      });
      localStorage.setItem('theodoisk_task_notifications', JSON.stringify(updated));
    }
  } catch {}
}

/**
 * Delete a notification/task from Firebase Firestore.
 */
export async function deleteTaskFromFirebase(
  config: FirebaseConnectionConfig,
  taskId: string
): Promise<void> {
  try {
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    await deleteDoc(doc(db, 'notifications', taskId));
  } catch (err) {
    console.warn('Lỗi xóa task từ Firebase:', err);
  }

  try {
    const saved = localStorage.getItem('theodoisk_task_notifications');
    if (saved) {
      const list: UserTaskNotification[] = JSON.parse(saved);
      localStorage.setItem('theodoisk_task_notifications', JSON.stringify(list.filter(t => t.id !== taskId)));
    }
  } catch {}
}

/**
 * Real-time listener for Firestore `users` collection.
 * Any profile changes (e.g. name changed to "Tài Thành") stream immediately to dashboard.
 */
export function subscribeToUsers(
  config: FirebaseConnectionConfig,
  onUsers: (users: AuthUser[]) => void
): () => void {
  try {
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const usersColl = collection(db, 'users');
    const unsub = onSnapshot(usersColl, (snap) => {
      if (!snap.empty) {
        const now = Date.now();
        const firestoreUsers: AuthUser[] = snap.docs.map(d => {
          const data = d.data();
          const isPresetAdmin = d.id === 'usr-admin-01' || (data.email && data.email.toLowerCase().includes('usr-admin-01'));
          const email = data.email || (isPresetAdmin ? 'admin@theodoisk.com' : `${d.id}@theodoisk.com`);
          const username = data.username || (isPresetAdmin ? 'admin' : (data.email ? data.email.split('@')[0] : d.id));
          const isAdmin = email.toLowerCase().includes('admin') || email.toLowerCase().includes('duan');

          const lastActiveTime = data.lastActive ? new Date(data.lastActive).getTime() : 0;
          // An account is actively logged in if flagged isOnline, with a 15-minute window for mobile tabs & network latency
          const isRecentPing = lastActiveTime > 0 ? (Math.abs(now - lastActiveTime) < 15 * 60 * 1000) : false;
          const isLiveHeartbeatActive = Boolean(data.isOnline) && isRecentPing;

          // Posture data is only present if camera or simulation has pushed active posture
          const rawPostureText = data.currentPostureText || '';
          const hasPostureSignal = Boolean(
            isLiveHeartbeatActive &&
            rawPostureText &&
            !rawPostureText.includes('Chờ') &&
            !rawPostureText.includes('chưa') &&
            data.currentPosture &&
            data.currentPosture !== 'waiting'
          );

          let postureText = '– Chờ kết nối';
          let posture: 'correct' | 'incorrect' | 'absent' | 'waiting' | 'standing' = 'waiting';

          if (hasPostureSignal) {
            if (data.currentPosture === 'standing' || rawPostureText.includes('Đứng')) {
              posture = 'standing';
              postureText = '↑ Đứng';
            } else if (data.currentPosture === 'incorrect' || rawPostureText.includes('Sai')) {
              posture = 'incorrect';
              postureText = '⚠ Sai';
            } else if (data.currentPosture === 'absent' || rawPostureText.includes('Vắng')) {
              posture = 'absent';
              postureText = '– Vắng';
            } else {
              posture = 'correct';
              postureText = '✓ Đúng';
            }
          }

          return {
            id: d.id,
            username,
            email,
            fullName: data.fullName || (isPresetAdmin ? 'Nguyễn Văn Quản Lý (Admin)' : 'Người Dùng Hệ Thống'),
            role: isAdmin ? 'admin' : 'employee',
            department: data.department || (isPresetAdmin ? 'Ban Điều Hành & An Toàn Lao Động' : 'Văn Phòng IoT'),
            avatar: data.avatar || '',
            phoneNumber: data.phoneNumber || '',
            age: Number(data.age) || 28,
            gender: data.gender || 'male',
            height: Number(data.height) || 170,
            weight: Number(data.weight) || 65,
            maxSittingHours: Number(data.maxSittingHours) || 6,
            healthNotes: data.healthNotes || '',
            status: data.status || 'active',
            lastLogin: data.lastLogin || data.updatedAt || '',
            createdAt: data.createdAt || data.updatedAt || '',
            device: data.device || '',
            isOnline: isLiveHeartbeatActive,
            lastActive: data.lastActive || '',
            currentPresence: isLiveHeartbeatActive ? 'Present' : 'Away',
            currentPosture: posture,
            currentPostureText: postureText,
            hasAlert: isLiveHeartbeatActive && posture === 'incorrect',
            alertReason: isLiveHeartbeatActive && posture === 'incorrect' ? (data.alertReason || 'Cột sống đang bị gù hoặc cúi cổ') : '',
            sittingMinutes: isLiveHeartbeatActive ? Number(data.sittingMinutes || 0) : 0,
            bpm: hasPostureSignal && posture !== 'absent' ? Number(data.bpm || 0) : 0,
            spo2: hasPostureSignal && posture !== 'absent' ? Number(data.spo2 || 0) : 0
          };
        });
        onUsers(firestoreUsers);
      }
    }, err => {
      if (markQuotaExceeded(err)) return;
      console.warn('Lỗi lắng nghe users từ Firestore:', err);
    });
    return unsub;
  } catch (err) {
    markQuotaExceeded(err);
    console.warn('Lỗi kết nối subscribeToUsers:', err);
    return () => {};
  }
}

/**
 * Update the user's real-time presence, sitting time, and biometrics in Firestore `users/{uid}`.
 */
export async function updateUserRealtimePresence(
  config: FirebaseConnectionConfig,
  userId: string,
  presenceData: Partial<AuthUser> & Record<string, any>
): Promise<void> {
  if (isQuotaExceeded) return;
  try {
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const userRef = doc(db, 'users', userId);
    
    // Firestore throws error if any field is undefined. Strip all undefined keys.
    const cleanPresence: Record<string, any> = {};
    for (const [key, val] of Object.entries(presenceData)) {
      if (val !== undefined) {
        cleanPresence[key] = val;
      }
    }

    await setDoc(userRef, {
      ...cleanPresence,
      lastActive: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    if (markQuotaExceeded(err)) return;
    console.warn('Lỗi cập nhật hiện diện người dùng:', err);
  }
}

/**
 * Subscribe to all users' real-time telemetry from Firestore
 */
export function subscribeToAllUsersTelemetry(
  config: FirebaseConnectionConfig,
  callback: (map: Record<string, HealthTelemetry>) => void
): () => void {
  if (isQuotaExceeded) return () => {};
  try {
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const usersCol = collection(db, 'users');
    const unsub = onSnapshot(usersCol, (snap) => {
      const map: Record<string, HealthTelemetry> = {};
      snap.forEach((d) => {
        const data = d.data();
        const norm = normalizeTelemetry(data, data.device || `Tài khoản ${d.id}`);
        map[d.id] = norm;
        if (data.id) map[data.id] = norm;
        if (data.userId) map[data.userId] = norm;
        if (data.email) map[data.email.toLowerCase().trim()] = norm;
      });
      callback(map);
    }, (err) => {
      if (markQuotaExceeded(err)) return;
      console.warn('Lỗi subscribeToAllUsersTelemetry:', err);
    });
    return unsub;
  } catch (err) {
    markQuotaExceeded(err);
    console.warn('Lỗi khởi tạo subscribeToAllUsersTelemetry:', err);
    return () => {};
  }
}

/**
 * Subscribe to single user telemetry from Firestore
 */
export function subscribeToUserTelemetry(
  config: FirebaseConnectionConfig,
  userId: string,
  callback: (telemetry: HealthTelemetry | null) => void
): () => void {
  if (isQuotaExceeded) return () => {};
  try {
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const userRef = doc(db, 'users', userId);
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback(normalizeTelemetry(data, data.device || `Tài khoản ${userId}`));
      } else {
        callback(null);
      }
    }, (err) => {
      if (markQuotaExceeded(err)) return;
      console.warn('Lỗi subscribeToUserTelemetry:', err);
    });
    return unsub;
  } catch (err) {
    markQuotaExceeded(err);
    console.warn('Lỗi khởi tạo subscribeToUserTelemetry:', err);
    return () => {};
  }
}

/**
 * Clear a specific user's telemetry in Firestore
 */
export async function clearUserTelemetryFromFirebase(
  config: FirebaseConnectionConfig,
  userId: string
): Promise<void> {
  try {
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      bpm: 0,
      spo2: 0,
      posture_status: -1,
      postureStatus: -1,
      posture_label: 'Chưa có dữ liệu',
      postureLabel: 'Chưa có dữ liệu',
      tracking_active: false,
      trackingActive: false,
      inZone: false,
      hasAlert: false,
      cleared_at: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Lỗi clearUserTelemetryFromFirebase:', err);
  }
}

/**
 * Clear all telemetry data and history from Firebase
 */
export async function clearAllTelemetryDataFromFirebase(
  config: FirebaseConnectionConfig
): Promise<void> {
  await clearFirebaseTelemetry(config);
  await clearFirebaseHistory(config);
}


