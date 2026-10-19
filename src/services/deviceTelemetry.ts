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
import { getAuth } from 'firebase/auth';
import { FirebaseConnectionConfig, HealthTelemetry } from '../types';
import { initializeFirebaseApp, markQuotaExceeded, checkIsQuotaExceeded, getAppFirestore } from './firebase';

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

  const isCameraError = 
    rawStatusName === 'ERROR' || 
    rawLabelStr.includes('lỗi') || 
    rawLabelStr.includes('error') || 
    rawLabelStr.includes('mất camera') ||
    (rawStatusVal === -1 && raw.tracking_active === false && !rawLabelStr.includes('xác nhận') && rawLabelStr !== 'chưa có dữ liệu');

  if (rawStatusVal === -1 || rawStatusVal === '-1' || rawLabelStr.includes('xác nhận') || rawLabelStr.includes('verifying') || isCameraError) {
    postureStatus = -1;
  } else if (rawStatusName === 'STAND' || rawLabelStr.includes('đứng') || rawLabelStr.includes('dung /') || rawLabelStr.includes('stand')) {
    postureStatus = 5;
  } else if (rawLabelStr.includes('ngoài vùng') || rawLabelStr.includes('ngoai vung')) {
    postureStatus = 2;
  } else if (rawLabelStr.includes('vắng') || rawLabelStr.includes('vang') || rawLabelStr.includes('absent')) {
    postureStatus = 2;
  } else if (rawLabelStr.includes('sai lâu') || rawLabelStr.includes('long_incorrect') || rawStatusVal === 3 || rawStatusVal === '3') {
    postureStatus = 3;
  } else if (rawLabelStr.includes('sai') || rawLabelStr.includes('bad') || rawLabelStr.includes('incorrect') || rawLabelStr.includes('cui') || rawLabelStr.includes('gu') || rawStatusVal === 1 || rawStatusVal === '1') {
    postureStatus = 1;
  } else if (rawStatusVal !== undefined && rawStatusVal !== null) {
    postureStatus = Number(rawStatusVal);
    if (isNaN(postureStatus)) postureStatus = 0;
  }

  const postureLabels: Record<number, string> = {
    [-1]: isCameraError ? 'Lỗi kết nối Camera' : 'Đang xác nhận tư thế',
    0: 'Tư thế ĐÚNG',
    1: 'Tư thế SAI (Cúi gù)',
    2: 'NGOÀI VÙNG CAMERA',
    3: 'SAI TƯ THẾ LÂU',
    4: 'NGỒI LÀM VIỆC QUÁ LÂU',
    5: 'Tư thế ĐỨNG (Làm việc)',
  };

  const inZone = Boolean(
    raw.is_in_zone !== undefined
      ? raw.is_in_zone
      : raw.in_zone !== undefined
      ? raw.in_zone
      : raw.inZone !== undefined
      ? raw.inZone
      : postureStatus !== 2 && postureStatus !== -1
  );

  const rawTracking = 
    raw.tracking_active !== undefined
      ? raw.tracking_active
      : raw.trackingActive;

  const trackingActive = Boolean(
    rawTracking !== undefined
      ? rawTracking
      : (postureStatus === 0 || postureStatus === 1 || postureStatus === 3 || postureStatus === 5 || (inZone && postureStatus !== -1))
  );

  let timestampStr = new Date().toISOString();
  let packetAgeSeconds: number | undefined = undefined;
  const rawTime = raw.timestamp || raw.lastActive || raw.updatedAt || raw.updated_at || raw.time || raw.created_at;

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

  let resolvedLabel = 
    raw.posture_label || 
    raw.postureLabel || 
    raw.currentPostureText || 
    postureLabels[postureStatus] || 
    (typeof raw.posture_status === 'string' ? raw.posture_status : 'Tư thế ĐÚNG');

  if (isCameraError) {
    if (!resolvedLabel || resolvedLabel.toLowerCase() === 'lỗi ai' || resolvedLabel.toLowerCase() === 'lỗi' || resolvedLabel.toLowerCase() === 'error') {
      resolvedLabel = 'Lỗi kết nối Camera';
    }
  }

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
    userId: (raw.userId || raw.user_id || raw.uid) ? String(raw.userId || raw.user_id || raw.uid) : undefined,
    faceVerified: Boolean(raw.face_verified || raw.faceVerified || raw.session_status === 'VERIFIED'),
  };
}

let activeTelemetryUnsub: (() => void) | null = null;

export function subscribeToFirebaseTelemetry(
  config: FirebaseConnectionConfig,
  onData: (data: HealthTelemetry) => void,
  onError: (err: Error) => void,
  targetDeviceDoc?: string
): () => void {
  if (activeTelemetryUnsub) {
    activeTelemetryUnsub();
    activeTelemetryUnsub = null;
  }

  const effectiveDoc = (targetDeviceDoc !== undefined ? targetDeviceDoc : config.documentId)?.trim();
  if (!effectiveDoc) {
    // Không có thiết bị được gán
    return () => {};
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
            const telemetry = normalizeTelemetry(raw, 'Pi 4 - Firebase RTDB');
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
      const db = getAppFirestore(app, config);
      const auth = getAuth(app);
      const targetCol = config.collectionName || 'devices';
      const docRef = doc(db, targetCol, effectiveDoc);

      // Theo dõi trạng thái phiên xác thực khuôn mặt SFace của trạm Pi
      let sessionStatus = 'WAIT_LOGIN';
      let sessionUid: string | null = null;
      const sessionRef = doc(db, 'devices', effectiveDoc, 'session', 'current');
      const unsubSession = onSnapshot(
        sessionRef,
        snap => {
          if (snap.exists()) {
            const sData = snap.data();
            sessionStatus = String(sData.status || 'WAIT_LOGIN');
            sessionUid = (sData.uid as string) || null;
          } else {
            sessionStatus = 'WAIT_LOGIN';
            sessionUid = null;
          }
        },
        () => {}
      );

      const unsubDoc = onSnapshot(
        docRef,
        snapshot => {
          if (snapshot.exists()) {
            const raw = snapshot.data();
            const currentAuthUid = auth.currentUser?.uid;

            // 1. Kiểm tra raw.userId === currentAuthUid: chỉ chấp nhận khi khớp đúng Auth UID của người dùng đang đăng nhập
            if (raw.userId && currentAuthUid && raw.userId !== currentAuthUid) {
              return;
            }

            // 2. Chỉ chấp nhận hiển thị dữ liệu sinh trắc học khi phiên làm việc đã VERIFIED cho UID này
            const isVerified = 
              (sessionStatus === 'VERIFIED' && (!sessionUid || !currentAuthUid || sessionUid === currentAuthUid)) || 
              (raw.session_status === 'VERIFIED' && (!raw.userId || !currentAuthUid || raw.userId === currentAuthUid)) || 
              (raw.sessionStatus === 'VERIFIED' && (!raw.userId || !currentAuthUid || raw.userId === currentAuthUid)) ||
              raw.face_verified === true;

            if (!isVerified) {
              onData({
                bpm: 0,
                spo2: 0,
                postureStatus: -1,
                postureLabel: 'Chờ xác thực khuôn mặt SFace (Chưa VERIFIED)',
                trackingActive: false,
                inZone: false,
                timestamp: new Date().toISOString(),
                source: `Pi 4 - ${effectiveDoc}`,
                confidence: 0,
              });
              return;
            }

            const telemetry = normalizeTelemetry(raw, `Pi 4 - ${effectiveDoc}`);
            onData(telemetry);
          }
        },
        error => {
          markQuotaExceeded(error);
          onError(error);
        }
      );

      activeTelemetryUnsub = () => {
        unsubSession();
        unsubDoc();
      };
      return activeTelemetryUnsub;
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
    // If devices/pi4_node_1 not yet created, also listen to theodoisk/live
    const fallbackCol = collectionName === 'devices' ? 'theodoisk' : 'devices';
    const fallbackDoc = collectionName === 'devices' ? 'live' : 'pi4_node_1';
    
    const fallbackDocRef = doc(db, fallbackCol, fallbackDoc);
    const unsubFallbackDoc = onSnapshot(
      fallbackDocRef,
      snap => {
        if (snap.exists()) {
          const docData = snap.data();
          const telemetry = normalizeTelemetry(docData, 'Pi 4 - Firebase');
          onData(telemetry);
        }
      },
      err => {
        markQuotaExceeded(err);
      }
    );

    const collRef = collection(db, collectionName);
    const q = query(collRef, orderBy('timestamp', 'desc'), limit(1));
    const unsubCol = onSnapshot(
      q,
      snap => {
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          const telemetry = normalizeTelemetry(docData, 'Pi 4 - Firebase');
          onData(telemetry);
        }
      },
      err => {
        markQuotaExceeded(err);
        onError(err);
      }
    );
    activeTelemetryUnsub = () => {
      unsubFallbackDoc();
      unsubCol();
    };
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
          map[d.id] = norm;
          if (data.id) map[data.id] = norm;
          if (data.userId) map[data.userId] = norm;
          if (data.email) map[data.email.toLowerCase().trim()] = norm;
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
