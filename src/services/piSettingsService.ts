import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getDocFromServer, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import type { AlertThresholds, TimeCalculations } from '../types';
import { initializeFirebaseApp, getAppFirestore, getSavedFirebaseConfig } from './firebase';

// These numbers map exactly to Python activity_settings.DEFAULTS.
export const DEFAULT_PI_THRESHOLDS: AlertThresholds = {
  hrMin: 50,
  hrMax: 110,
  spo2Min: 94,
  biometricReminderSec: 1800,
  incorrectPostureSec: 30,
  longIncorrectSec: 120,
  longSittingSec: 3600,
  standingTargetSec: 300,
  standingResetSec: 300,
  soundEnabled: true,
  voiceAlertEnabled: true,
  browserNotificationEnabled: true,
  outOfZoneAlertEnabled: false,
};

const NUMERIC_KEYS: Array<keyof AlertThresholds> = [
  'hrMin',
  'hrMax',
  'spo2Min',
  'biometricReminderSec',
  'incorrectPostureSec',
  'longIncorrectSec',
  'longSittingSec',
  'standingTargetSec',
  'standingResetSec',
];

const BOOLEAN_KEYS: Array<keyof AlertThresholds> = [
  'soundEnabled',
  'voiceAlertEnabled',
  'outOfZoneAlertEnabled',
  'browserNotificationEnabled',
];

const REQUIRED_SCHEMA_KEYS: Array<keyof AlertThresholds> = [...NUMERIC_KEYS, ...BOOLEAN_KEYS];
const backfilledDocKeys = new Set<string>();

export function sanitizeThresholds(input: Partial<AlertThresholds> | Record<string, any>): AlertThresholds {
  const clean: Record<string, any> = {};

  for (const key of NUMERIC_KEYS) {
    const raw = (input as any)?.[key];
    const fallback = Number(DEFAULT_PI_THRESHOLDS[key] ?? 0);
    if (raw === undefined || raw === null || raw === '') {
      clean[key] = fallback;
    } else {
      const num = Number(raw);
      clean[key] = Number.isFinite(num) && num >= 0 ? num : fallback;
    }
  }

  for (const key of BOOLEAN_KEYS) {
    const raw = (input as any)?.[key];
    const fallback = Boolean(DEFAULT_PI_THRESHOLDS[key]);
    clean[key] = raw === undefined || raw === null ? fallback : Boolean(raw);
  }

  return clean as AlertThresholds;
}

async function getAuthorizedDb(uid: string, allowAdminOverride = false) {
  const config = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(config);
  const auth = getAuth(app);
  if (typeof (auth as any).authStateReady === 'function') {
    await (auth as any).authStateReady();
  }
  if (!uid || !auth.currentUser) {
    throw new Error('Phiên đăng nhập Firebase chưa sẵn sàng. Vui lòng đăng nhập lại.');
  }
  if (auth.currentUser.uid !== uid && !allowAdminOverride) {
    throw new Error('UID hiện tại chưa xác thực hoặc không khớp tài khoản.');
  }
  return getAppFirestore(app, config);
}

export interface PiSettingsServerMeta {
  settings: AlertThresholds;
  existsOnServer: boolean;
  missingKeys: string[];
  updatedAtIso?: string;
}

export async function fetchPiSettingsWithMeta(uid: string): Promise<PiSettingsServerMeta> {
  const config = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(config);
  const auth = getAuth(app);
  if (typeof (auth as any).authStateReady === 'function') {
    await (auth as any).authStateReady();
  }
  if (!uid || !auth.currentUser) {
    return {
      settings: { ...DEFAULT_PI_THRESHOLDS },
      existsOnServer: false,
      missingKeys: [...REQUIRED_SCHEMA_KEYS],
    };
  }
  const db = getAppFirestore(app, config);
  const docRef = doc(db, 'users', uid, 'preferences', 'office_health');

  let snap;
  try {
    snap = await getDocFromServer(docRef);
  } catch {
    snap = await getDoc(docRef);
  }

  if (!snap.exists()) {
    return {
      settings: { ...DEFAULT_PI_THRESHOLDS },
      existsOnServer: false,
      missingKeys: [...REQUIRED_SCHEMA_KEYS],
    };
  }

  const rawData = snap.data() as Record<string, any>;
  const missingKeys = REQUIRED_SCHEMA_KEYS.filter(k => rawData[k] === undefined);

  let updatedAtIso: string | undefined;
  if (rawData.updatedAt && typeof rawData.updatedAt.toDate === 'function') {
    updatedAtIso = rawData.updatedAt.toDate().toISOString();
  } else if (typeof rawData.updatedAt === 'string') {
    updatedAtIso = rawData.updatedAt;
  }

  return {
    settings: sanitizeThresholds(rawData),
    existsOnServer: true,
    missingKeys,
    updatedAtIso,
  };
}

export async function fetchPiSettings(uid: string): Promise<AlertThresholds> {
  const meta = await fetchPiSettingsWithMeta(uid);
  return meta.settings;
}

export async function savePiSettings(uid: string, input: AlertThresholds, allowAdminOverride = false) {
  const db = await getAuthorizedDb(uid, allowAdminOverride);
  const cleanPayload = sanitizeThresholds(input);
  const docRef = doc(db, 'users', uid, 'preferences', 'office_health');

  try {
    await setDoc(
      docRef,
      {
        ...cleanPayload,
        updatedAt: serverTimestamp(),
        schemaVersion: 1,
      },
      { merge: true }
    );
    backfilledDocKeys.add(uid);
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'permission-denied') {
      throw new Error(
        `Firestore từ chối quyền ghi tại users/${uid}/preferences/office_health. Vui lòng kiểm tra tài khoản quản trị hoặc đăng nhập lại.`
      );
    }
    throw err;
  }
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
  const unwatchAuth = onAuthStateChanged(
    auth,
    user => {
      unwatch?.();
      unwatch = null;
      if (user?.uid !== uid) return;
      const db = getAppFirestore(app, cfg);
      const docRef = doc(db, 'users', uid, 'preferences', 'office_health');

      unwatch = onSnapshot(
        docRef,
        snap => {
          if (!snap.exists()) {
            onData({ ...DEFAULT_PI_THRESHOLDS });
            if (!backfilledDocKeys.has(uid)) {
              backfilledDocKeys.add(uid);
              setDoc(
                docRef,
                {
                  ...DEFAULT_PI_THRESHOLDS,
                  updatedAt: serverTimestamp(),
                  schemaVersion: 1,
                },
                { merge: true }
              ).catch(err => {
                backfilledDocKeys.delete(uid);
                console.warn('[PI SETTINGS] Auto-init Firestore office_health skipped:', err?.message || err);
              });
            }
            return;
          }

          const rawData = snap.data() as Record<string, any>;
          const missingPatch: Record<string, any> = {};
          for (const key of REQUIRED_SCHEMA_KEYS) {
            if (rawData[key] === undefined) {
              missingPatch[key] = DEFAULT_PI_THRESHOLDS[key];
            }
          }

          // Tự động bổ sung các field mới (vd: biometricReminderSec) lên Firestore để Pi đọc được ngay
          if (Object.keys(missingPatch).length > 0 && !backfilledDocKeys.has(uid)) {
            backfilledDocKeys.add(uid);
            setDoc(
              docRef,
              {
                ...missingPatch,
                updatedAt: serverTimestamp(),
                schemaVersion: 1,
              },
              { merge: true }
            ).catch(err => {
              backfilledDocKeys.delete(uid);
              console.warn('[PI SETTINGS] Auto-backfill Firestore office_health skipped:', err?.message || err);
            });
          }

          onData(sanitizeThresholds(rawData));
        },
        err => onError(err)
      );
    },
    err => onError(err)
  );
  return () => {
    unwatch?.();
    unwatchAuth();
  };
}

export interface PiTimeSnapshot {
  deviceId: string;
  dateKey: string;
  counters: TimeCalculations;
}

export function watchPiTimeStats(
  uid: string,
  onData: (snap: PiTimeSnapshot | null) => void,
  onError: (error: Error) => void
) {
  const cfg = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(cfg);
  const auth = getAuth(app);
  let unwatch: (() => void) | null = null;
  const unwatchAuth = onAuthStateChanged(
    auth,
    user => {
      unwatch?.();
      unwatch = null;
      if (user?.uid !== uid) return;
      const db = getAppFirestore(app, cfg);
      unwatch = onSnapshot(
        doc(db, 'office_health_time', uid),
        snap => {
          if (!snap.exists()) {
            onData(null);
            return;
          }
          const d = snap.data();
          const clean = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
          onData({
            deviceId: String(d.deviceId || ''),
            dateKey: String(d.dateKey || ''),
            counters: {
              sittingSeconds: clean(d.sittingSeconds),
              standingSeconds: clean(d.standingSeconds),
              movingSeconds: clean(d.movingSeconds),
              badPostureSeconds: clean(d.badPostureSeconds),
              continuousSittingSeconds: clean(d.continuousSittingSeconds),
              continuousStandingSeconds: clean(d.continuousStandingSeconds),
            },
          });
        },
        err => onError(err)
      );
    },
    err => onError(err)
  );
  return () => {
    unwatch?.();
    unwatchAuth();
  };
}
