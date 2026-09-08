import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  limit, 
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { getDatabase, ref, onValue, set, get, remove } from 'firebase/database';
import { FirebaseConnectionConfig, HealthTelemetry, TelemetryLog } from '../types';

export const DEFAULT_FIREBASE_CONFIG: FirebaseConnectionConfig = {
  projectId: 'theodoisk-66ddb',
  apiKey: 'AIzaSyAYVIfVEKOAtjGUcYfjib1WU2GjzhzXZpQ',
  databaseURL: 'https://theodoisk-66ddb-default-rtdb.firebaseio.com',
  collectionName: 'theodoisk',
  documentId: 'live',
  useRealtimeDb: false, // Default to Firestore, toggleable to RTDB
  autoConnect: true,
};

let currentUnsubscribe: (() => void) | null = null;

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
  const effectiveApiKey = config.apiKey || 'AIzaSyAYVIfVEKOAtjGUcYfjib1WU2GjzhzXZpQ';

  if (found) {
    // If config has changed (e.g. user provided real API key), re-initialize
    if (found.options.projectId !== effectiveProjectId || found.options.apiKey !== effectiveApiKey) {
      deleteApp(found).catch(() => {});
      return initializeApp({
        projectId: effectiveProjectId,
        apiKey: effectiveApiKey,
        authDomain: `${effectiveProjectId}.firebaseapp.com`,
      }, appName);
    }
    return found;
  }

  const firebaseOptions: Record<string, string> = {
    projectId: effectiveProjectId,
    apiKey: effectiveApiKey,
    authDomain: `${effectiveProjectId}.firebaseapp.com`,
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
          onError(error);
        }
      );

      currentUnsubscribe = unsubscribeDoc;
      return unsubscribeDoc;
    }
  } catch (error) {
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
      err => onError(err)
    );
    currentUnsubscribe = unsubscribeCol;
  } catch (e) {
    onError(e as Error);
  }
}

export function normalizeTelemetry(raw: any, sourceName: string): HealthTelemetry {
  const bpm = Number(raw.bpm || raw.heart_rate || raw.hr || 0);
  const spo2 = Number(raw.spo2 || raw.oxygen || raw.spO2 || 0);
  
  // Posture status normalization
  // -1: Chưa có dữ liệu, 0: Đúng, 1: Sai, 2: Vắng, 3: Sai lâu, 4: Ngồi lâu
  let postureStatus = 0;
  const rawStatusVal = raw.posture_status ?? raw.postureStatus ?? raw.posture ?? raw.status ?? raw.Status ?? raw.raw_pred ?? raw.pred;

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
      } else if (p.includes('vắng') || p.includes('vang') || p.includes('absent') || p === '2') {
        postureStatus = 2;
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

  const postureLabels: Record<number, string> = {
    [-1]: 'Chưa có dữ liệu',
    0: 'Tư thế ĐÚNG',
    1: 'Tư thế SAI',
    2: 'VẮNG MẶT',
    3: 'SAI TƯ THẾ LÂU',
    4: 'NGỒI LÀM VIỆC QUÁ LÂU',
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

  const isHumanDetected = (postureStatus === 0 || postureStatus === 1 || postureStatus === 3 || postureStatus === 4) && inZone;

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

  return {
    bpm: Math.round(bpm),
    spo2: Number(spo2.toFixed(1)),
    postureStatus,
    postureLabel: postureLabels[postureStatus] || (typeof raw.posture_status === 'string' ? raw.posture_status : 'Tư thế ĐÚNG'),
    trackingActive,
    inZone,
    timestamp: timestampStr,
    source: sourceName,
    confidence: raw.confidence ? Number(raw.confidence) : 95,
    angleNeck: raw.angle_neck !== undefined ? Number(raw.angle_neck) : undefined,
    postureWarning: raw.posture_warning ? String(raw.posture_warning) : undefined,
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

    // Also push to history collection
    const histEntry: TelemetryLog = {
      id: `test-${Date.now()}`,
      timestamp: nowIso,
      timeFormatted: new Date().toLocaleTimeString('vi-VN'),
      bpm: payload.bpm,
      spo2: payload.spo2,
      postureStatus: payload.posture_status,
      postureLabel: payload.posture_status === 0 ? 'Tư thế ĐÚNG' : payload.posture_status === 1 ? 'Tư thế SAI' : 'VẮNG MẶT',
      trackingActive: payload.tracking_active,
      hasAlert: payload.posture_status === 1 || payload.posture_status === 3 || payload.bpm > 110,
      alertType: payload.posture_status === 1 ? 'Sai tư thế' : undefined,
    };
    saveTelemetryHistoryToFirebase(config, histEntry).catch(() => {});
  })();

  await Promise.race([writeOperation, timeoutPromise]);
}

// ---------------------------------------------------------------------------
// HISTORICAL TELEMETRY PERSISTENCE IN FIREBASE (FIRESTORE & RTDB)
// ---------------------------------------------------------------------------

export function normalizeHistoryLog(docId: string, raw: any): TelemetryLog {
  const bpm = Number(raw.bpm || raw.heart_rate || 0);
  const spo2 = Number(raw.spo2 || raw.oxygen || 0);
  const postureStatus = Number(raw.posture_status ?? raw.postureStatus ?? 0);
  
  let postureLabel = String(raw.posture_label || raw.postureLabel || '');
  if (!postureLabel) {
    if (postureStatus === 0) postureLabel = 'Tư thế ĐÚNG';
    else if (postureStatus === 1) postureLabel = 'Tư thế SAI';
    else if (postureStatus === 2) postureLabel = 'VẮNG MẶT';
    else if (postureStatus === 3) postureLabel = 'SAI TƯ THẾ LÂU';
    else if (postureStatus === 4) postureLabel = 'NGỒI LÀM VIỆC QUÁ LÂU';
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
  if (!timeFormatted && timestamp) {
    try {
      timeFormatted = new Date(timestamp).toLocaleTimeString('vi-VN');
    } catch {
      timeFormatted = '--:--:--';
    }
  }

  return {
    id: docId || raw.id || `rec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: String(timestamp),
    timeFormatted: timeFormatted || new Date().toLocaleTimeString('vi-VN'),
    bpm: Math.round(bpm),
    spo2: Number(spo2.toFixed(1)),
    postureStatus,
    postureLabel,
    trackingActive,
    hasAlert,
    alertType,
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
    const timestampMs = new Date(entry.timestamp).getTime() || Date.now();
    const docId = `rec_${timestampMs}_${Math.random().toString(36).substr(2, 5)}`;

    const payload = {
      id: docId,
      timestamp: entry.timestamp || new Date().toISOString(),
      time_formatted: entry.timeFormatted,
      bpm: entry.bpm,
      spo2: entry.spo2,
      posture_status: entry.postureStatus,
      posture_label: entry.postureLabel,
      tracking_active: entry.trackingActive,
      has_alert: entry.hasAlert,
      alert_type: entry.alertType || '',
      created_at: new Date().toISOString(),
      device: 'Raspberry Pi 4 / Monitor Node'
    };

    if (config.useRealtimeDb && config.databaseURL) {
      const rtdb = getDatabase(app);
      const histRef = ref(rtdb, `${histColName}/${docId}`);
      await set(histRef, payload);
    } else {
      const db = getFirestore(app);
      const docRef = doc(db, histColName, docId);
      await setDoc(docRef, payload, { merge: true });
    }
  } catch (error) {
    console.warn('Lỗi ghi bản ghi lịch sử lên Firebase:', error);
  }
}

/**
 * Query historical telemetry logs from Firebase.
 */
export async function fetchFirebaseHistory(
  config: FirebaseConnectionConfig,
  maxRecords = 100
): Promise<TelemetryLog[]> {
  try {
    const app = initializeFirebaseApp(config);
    const histColName = getHistoryCollectionName(config);

    if (config.useRealtimeDb && config.databaseURL) {
      const rtdb = getDatabase(app);
      const histRef = ref(rtdb, histColName);
      const snap = await get(histRef);
      if (snap.exists()) {
        const val = snap.val();
        const logs: TelemetryLog[] = Object.keys(val).map(key => normalizeHistoryLog(key, val[key]));
        return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, maxRecords);
      }
      return [];
    } else {
      const db = getFirestore(app);
      const collRef = collection(db, histColName);
      
      try {
        const q = query(collRef, orderBy('timestamp', 'desc'), limit(maxRecords));
        const snap = await getDocs(q);
        if (!snap.empty) {
          return snap.docs.map(d => normalizeHistoryLog(d.id, d.data()));
        }
      } catch (orderErr) {
        // Fallback without orderBy (in case index is still building or missing)
        const snap = await getDocs(collRef);
        if (!snap.empty) {
          const logs = snap.docs.map(d => normalizeHistoryLog(d.id, d.data()));
          return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, maxRecords);
        }
      }
      return [];
    }
  } catch (err) {
    console.warn('Không thể tải lịch sử từ Firebase:', err);
    return [];
  }
}

/**
 * Real-time listener for the history collection.
 */
export function subscribeToFirebaseHistory(
  config: FirebaseConnectionConfig,
  onHistory: (logs: TelemetryLog[]) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const app = initializeFirebaseApp(config);
    const histColName = getHistoryCollectionName(config);

    if (config.useRealtimeDb && config.databaseURL) {
      const rtdb = getDatabase(app);
      const histRef = ref(rtdb, histColName);
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
      const collRef = collection(db, histColName);
      const q = query(collRef, orderBy('timestamp', 'desc'), limit(100));

      const unsub = onSnapshot(
        q,
        snap => {
          const logs: TelemetryLog[] = snap.docs.map(d => normalizeHistoryLog(d.id, d.data()));
          onHistory(logs);
        },
        err => {
          // If query with orderBy fails (e.g. index error), fallback to direct collection listener
          try {
            const fallbackUnsub = onSnapshot(
              collRef,
              snapFallback => {
                const logs: TelemetryLog[] = snapFallback.docs.map(d => normalizeHistoryLog(d.id, d.data()));
                const sorted = logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 100);
                onHistory(sorted);
              },
              fallbackErr => onError?.(fallbackErr)
            );
            return fallbackUnsub;
          } catch (e) {
            onError?.(err);
          }
        }
      );
      return unsub;
    }
  } catch (err) {
    onError?.(err as Error);
    return () => {};
  }
}

/**
 * Delete all historical records from Firebase history collection.
 */
export async function clearFirebaseHistory(config: FirebaseConnectionConfig): Promise<void> {
  const app = initializeFirebaseApp(config);
  const histColName = getHistoryCollectionName(config);

  if (config.useRealtimeDb && config.databaseURL) {
    const rtdb = getDatabase(app);
    const histRef = ref(rtdb, histColName);
    await remove(histRef);
  } else {
    const db = getFirestore(app);
    const collRef = collection(db, histColName);
    const snap = await getDocs(collRef);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach(d => {
        batch.delete(d.ref);
      });
      await batch.commit();
    }
  }
}
