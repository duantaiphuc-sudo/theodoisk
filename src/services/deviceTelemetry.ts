import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { getDatabase, ref, onValue } from 'firebase/database';
import { FirebaseConnectionConfig, HealthTelemetry } from '../types';
import { initializeFirebaseApp, markQuotaExceeded, checkIsQuotaExceeded } from './firebase';

export function normalizeTelemetry(raw: any, sourceName: string): HealthTelemetry {
  const bpm = Number(raw.bpm || raw.heart_rate || raw.hr || 0);
  const spo2 = Number(raw.spo2 || raw.oxygen || raw.spO2 || 0);
  
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

  let inZone = Boolean(
    raw.is_in_zone !== undefined
      ? raw.is_in_zone
      : raw.in_zone !== undefined
      ? raw.in_zone
      : raw.inZone !== undefined
      ? raw.inZone
      : postureStatus !== 2 && postureStatus !== -1
  );

  if (!inZone && postureStatus !== -1) {
    postureStatus = 2;
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

  const isStale = packetAgeSeconds !== undefined && packetAgeSeconds > 90;

  let image: string | undefined = undefined;
  const rawImage = raw.image || raw.image_base64 || raw.camera_frame || raw.frame || raw.image_url || raw.snapshot;
  if (typeof rawImage === 'string' && rawImage.trim().length > 0) {
    const trimmed = rawImage.trim();
    if (trimmed.startsWith('data:image') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      image = trimmed;
    } else if (trimmed.length > 50) {
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

let activeTelemetryUnsub: (() => void) | null = null;

export function subscribeToFirebaseTelemetry(
  config: FirebaseConnectionConfig,
  onData: (data: HealthTelemetry) => void,
  onError: (err: Error) => void
): () => void {
  if (activeTelemetryUnsub) {
    activeTelemetryUnsub();
    activeTelemetryUnsub = null;
  }

  try {
    const app = initializeFirebaseApp(config);

    if (config.useRealtimeDb && config.databaseURL) {
      const rtdb = getDatabase(app);
      const dataRef = ref(rtdb, config.collectionName || 'theodoisk');

      const unsubRtdb = onValue(
        dataRef,
        snapshot => {
          if (snapshot.exists()) {
            const raw = snapshot.val();
            const telemetry = normalizeTelemetry(raw, 'Firebase RTDB');
            if (telemetry.bpm <= 0 || telemetry.spo2 <= 0) {
              return;
            }
            onData(telemetry);
          }
        },
        err => {
          onError(err);
        }
      );

      activeTelemetryUnsub = () => unsubRtdb();
      return activeTelemetryUnsub;
    } else {
      const db = getFirestore(app);
      const targetCol = config.collectionName || 'devices';
      const targetDoc = config.documentId || 'pi4_node_1';
      const docRef = doc(db, targetCol, targetDoc);

      const unsubDoc = onSnapshot(
        docRef,
        snapshot => {
          if (snapshot.exists()) {
            const raw = snapshot.data();
            const telemetry = normalizeTelemetry(raw, 'Firebase Firestore');
            if (telemetry.bpm <= 0 || telemetry.spo2 <= 0) {
              return;
            }
            onData(telemetry);
          } else {
            listenLatestFallback(db, targetCol, onData, onError);
          }
        },
        error => {
          markQuotaExceeded(error);
          onError(error);
        }
      );

      activeTelemetryUnsub = unsubDoc;
      return unsubDoc;
    }
  } catch (error) {
    markQuotaExceeded(error);
    onError(error as Error);
    return () => {};
  }
}

function listenLatestFallback(
  db: any,
  collectionName: string,
  onData: (data: HealthTelemetry) => void,
  onError: (err: Error) => void
) {
  if (checkIsQuotaExceeded()) return;
  try {
    const collRef = collection(db, collectionName);
    const q = query(collRef, orderBy('timestamp', 'desc'), limit(1));
    const unsubCol = onSnapshot(
      q,
      snap => {
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          const telemetry = normalizeTelemetry(docData, 'Firebase Firestore');
          if (telemetry.bpm <= 0 || telemetry.spo2 <= 0) {
            return;
          }
          onData(telemetry);
        }
      },
      err => {
        markQuotaExceeded(err);
        onError(err);
      }
    );
    activeTelemetryUnsub = unsubCol;
  } catch (e) {
    markQuotaExceeded(e);
    onError(e as Error);
  }
}

export function subscribeToUserTelemetry(
  config: FirebaseConnectionConfig,
  userId: string,
  callback: (telemetry: HealthTelemetry | null) => void
): () => void {
  if (checkIsQuotaExceeded()) return () => {};
  try {
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const userRef = doc(db, 'users', userId);
    const unsub = onSnapshot(
      userRef,
      snap => {
        if (snap.exists()) {
          const data = snap.data();
          const norm = normalizeTelemetry(data, data.device || `Tài khoản ${userId}`);
          if (norm.bpm <= 0 || norm.spo2 <= 0) {
            return;
          }
          callback(norm);
        } else {
          callback(null);
        }
      },
      err => {
        markQuotaExceeded(err);
      }
    );
    return unsub;
  } catch (err) {
    markQuotaExceeded(err);
    return () => {};
  }
}

export function subscribeToAllUsersTelemetry(
  config: FirebaseConnectionConfig,
  callback: (map: Record<string, HealthTelemetry>) => void
): () => void {
  if (checkIsQuotaExceeded()) return () => {};
  try {
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const usersCol = collection(db, 'users');
    const unsub = onSnapshot(
      usersCol,
      snap => {
        const map: Record<string, HealthTelemetry> = {};
        snap.forEach(d => {
          const data = d.data();
          const norm = normalizeTelemetry(data, data.device || `Tài khoản ${d.id}`);
          if (norm.bpm > 0 && norm.spo2 > 0) {
            map[d.id] = norm;
            if (data.id) map[data.id] = norm;
            if (data.userId) map[data.userId] = norm;
            if (data.email) map[data.email.toLowerCase().trim()] = norm;
          }
        });
        callback(map);
      },
      err => {
        markQuotaExceeded(err);
      }
    );
    return unsub;
  } catch (err) {
    markQuotaExceeded(err);
    return () => {};
  }
}
