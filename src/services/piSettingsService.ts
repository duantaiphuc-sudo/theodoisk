import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import type { AlertThresholds, TimeCalculations } from '../types';
import { initializeFirebaseApp, getAppFirestore, getSavedFirebaseConfig } from './firebase';

// These numbers map exactly to Python activity_settings.DEFAULTS.
export const DEFAULT_PI_THRESHOLDS = {
  hrMin: 50, hrMax: 110, spo2Min: 94,
  incorrectPostureSec: 30, longIncorrectSec: 120,
  longSittingSec: 3600, standingTargetSec: 300, standingResetSec: 300,
  soundEnabled: true, voiceAlertEnabled: true,
  browserNotificationEnabled: true, outOfZoneAlertEnabled: false,
};

const bounds: Record<string, [number, number]> = {
  hrMin: [40, 90], hrMax: [90, 160], spo2Min: [85, 99],
  incorrectPostureSec: [5, 300], longIncorrectSec: [30, 3600],
  longSittingSec: [300, 7200], standingTargetSec: [30, 3600],
  standingResetSec: [5, 3600],
};

function getAuthorizedDb(uid: string) {
  const config = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(config);
  const auth = getAuth(app);
  if (!uid || auth.currentUser?.uid !== uid) {
    throw new Error('UID hiện tại chưa xác thực hoặc không khớp tài khoản.');
  }
  return getAppFirestore(app, config);
}

export async function savePiSettings(uid: string, input: AlertThresholds) {
  const db = getAuthorizedDb(uid);
  const settings = { ...DEFAULT_PI_THRESHOLDS, ...input };
  for (const [key, [lo, hi]] of Object.entries(bounds)) {
    const num = Number((settings as any)[key]);
    if (!Number.isFinite(num) || num < lo || num > hi) {
      throw new Error(`Ngưỡng ${key} phải trong khoảng ${lo}–${hi}.`);
    }
  }
  if (settings.hrMin >= settings.hrMax || settings.longIncorrectSec < settings.incorrectPostureSec) {
    throw new Error('Ngưỡng HR và thời gian sai tư thế chưa hợp lệ.');
  }
  await setDoc(doc(db, 'users', uid, 'preferences', 'office_health'), {
    ...settings, updatedAt: serverTimestamp(), schemaVersion: 1,
  }, {merge: true});
}

export function watchPiSettings(
  uid: string,
  onData: (settings: Partial<AlertThresholds>) => void,
  onError: (error: Error) => void,
) {
  const cfg = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(cfg);
  const auth = getAuth(app);
  let unwatch: (() => void) | null = null;
  const unwatchAuth = onAuthStateChanged(auth, user => {
    unwatch?.(); unwatch = null;
    if (user?.uid !== uid) return;
    const db = getAppFirestore(app, cfg);
    unwatch = onSnapshot(doc(db, 'users', uid, 'preferences', 'office_health'),
      snap => onData(snap.exists() ? snap.data() as Partial<AlertThresholds> : DEFAULT_PI_THRESHOLDS),
      err => onError(err));
  }, err => onError(err));
  return () => { unwatch?.(); unwatchAuth(); };
}

export interface PiTimeSnapshot {
  deviceId: string;
  dateKey: string;
  counters: TimeCalculations;
}

export function watchPiTimeStats(uid: string,
  onData: (snap: PiTimeSnapshot | null) => void,
  onError: (error: Error) => void) {
  const cfg = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(cfg);
  const auth = getAuth(app);
  let unwatch: (() => void) | null = null;
  const unwatchAuth = onAuthStateChanged(auth, user => {
    unwatch?.(); unwatch = null;
    if (user?.uid !== uid) return;
    const db = getAppFirestore(app, cfg);
    unwatch = onSnapshot(doc(db, 'office_health_time', uid), snap => {
      if (!snap.exists()) { onData(null); return; }
      const d = snap.data();
      const clean = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
      onData({deviceId: String(d.deviceId || ''), dateKey: String(d.dateKey || ''),
        counters: {
          sittingSeconds: clean(d.sittingSeconds),
          standingSeconds: clean(d.standingSeconds),
          movingSeconds: clean(d.movingSeconds),
          badPostureSeconds: clean(d.badPostureSeconds),
          continuousSittingSeconds: clean(d.continuousSittingSeconds),
          continuousStandingSeconds: clean(d.continuousStandingSeconds),
        }});
    }, err => onError(err));
  }, err => onError(err));
  return () => { unwatch?.(); unwatchAuth(); };
}
