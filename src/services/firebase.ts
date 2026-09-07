import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, collection, query, orderBy, limit, setDoc } from 'firebase/firestore';
import { getDatabase, ref, onValue, set } from 'firebase/database';
import { FirebaseConnectionConfig, HealthTelemetry } from '../types';

export const DEFAULT_FIREBASE_CONFIG: FirebaseConnectionConfig = {
  projectId: 'theodoisk-66ddb',
  apiKey: 'AIzaSyAYVIfVEKOAtjGUcYfjib1WU2GjzhzXZpQ',
  databaseURL: 'https://theodoisk-66ddb-default-rtdb.firebaseio.com',
  collectionName: 'devices',
  documentId: 'pi4_node_1',
  useRealtimeDb: false, // Default to Firestore, toggleable to RTDB
  autoConnect: true,
};

let currentUnsubscribe: (() => void) | null = null;

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
      // If still pointing to old 'theodoisk'/'live' collection, default to 'devices'/'pi4_node_1'
      if (parsed.collectionName === 'theodoisk' && parsed.documentId === 'live') {
        parsed.collectionName = 'devices';
        parsed.documentId = 'pi4_node_1';
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

  // If posture is detected (Đúng, Sai, Sai lâu, Ngồi lâu), person is present and active
  const isHumanDetected = postureStatus === 0 || postureStatus === 1 || postureStatus === 3 || postureStatus === 4;

  const inZone = Boolean(
    raw.is_in_zone !== undefined
      ? raw.is_in_zone
      : raw.in_zone !== undefined
      ? raw.in_zone
      : isHumanDetected
  );

  const trackingActive = Boolean(
    isHumanDetected
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
  const targetCol = config.collectionName || 'devices';
  const targetDoc = config.documentId || 'pi4_node_1';

  const payload = {
    bpm: data.bpm ?? 76,
    spo2: data.spo2 ?? 98.5,
    heart_rate: data.bpm ?? 76,
    posture_status: data.postureStatus ?? 0,
    tracking_active: data.trackingActive ?? true,
    is_in_zone: data.inZone ?? true,
    timestamp: new Date().toISOString(),
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
  })();

  await Promise.race([writeOperation, timeoutPromise]);
}
