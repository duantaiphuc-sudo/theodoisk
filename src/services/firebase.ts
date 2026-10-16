import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  limit, 
  setDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { getDatabase, ref, set } from 'firebase/database';
import { 
  FirebaseConnectionConfig, 
  HealthTelemetry, 
  UserTaskNotification, 
  TaskStatus, 
  AuthUser 
} from '../types';

export * from './deviceTelemetry';
export * from './historyService';

export const DEFAULT_FIREBASE_CONFIG: FirebaseConnectionConfig = {
  projectId: 'theodoisk-66ddb',
  apiKey: 'AIzaSyAYVIfVEKOAtjGUcYfjib1WU2GjzHzXZpQ',
  databaseURL: 'https://theodoisk-66ddb-default-rtdb.firebaseio.com',
  collectionName: 'devices',
  documentId: 'pi4_node_1',
  useRealtimeDb: false,
  autoConnect: true,
};

export function getAppFirestore(app: any, _config?: FirebaseConnectionConfig) {
  return getFirestore(app);
}

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
      if (parsed.projectId === 'theodoisk') {
        parsed.projectId = 'theodoisk-66ddb';
      }
      if (!parsed.apiKey) {
        parsed.apiKey = 'AIzaSyAYVIfVEKOAtjGUcYfjib1WU2GjzHzXZpQ';
      }
      if (!parsed.collectionName || parsed.collectionName === 'theodoisk') {
        parsed.collectionName = 'devices';
      }
      if (!parsed.documentId || parsed.documentId === 'live') {
        parsed.documentId = 'pi4_node_1';
      }
      delete parsed.firestoreDatabaseId;
      return { 
        ...DEFAULT_FIREBASE_CONFIG, 
        ...parsed
      };
    }
  } catch (e) {
    console.error('Error loading Firebase config:', e);
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveFirebaseConfig(config: FirebaseConnectionConfig) {
  try {
    const cleanConfig = { ...config };
    delete (cleanConfig as any).firestoreDatabaseId;
    localStorage.setItem('theodoisk_firebase_config', JSON.stringify(cleanConfig));
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
      const db = getAppFirestore(app, config);
      const docRef = doc(db, targetCol, targetDoc);
      await setDoc(docRef, emptyPayload);
    }
  })();

  await Promise.race([clearOperation, timeoutPromise]);
}

export async function pushMockTelemetryToFirebase(config: FirebaseConnectionConfig, data: Partial<HealthTelemetry>) {
  const app = initializeFirebaseApp(config);
  const targetCol = config.collectionName || 'devices';
  const targetDoc = config.documentId || 'pi4_node_1';

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
    image: data.image ?? null,
    note: 'Sent from Web Health Monitor console'
  };

  if (config.useRealtimeDb && config.databaseURL) {
    const rtdb = getDatabase(app);
    const dataRef = ref(rtdb, targetCol);
    await set(dataRef, payload);
  } else {
    const db = getAppFirestore(app, config);
    const docRef = doc(db, targetCol, targetDoc);
    await setDoc(docRef, payload, { merge: true });
  }
}

export async function sendTaskNotificationToFirebase(
  config: FirebaseConnectionConfig,
  notif: Omit<UserTaskNotification, 'id' | 'createdAt' | 'status'>
): Promise<UserTaskNotification> {
  const app = initializeFirebaseApp(config);
  const db = getAppFirestore(app, config);
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

  try {
    const saved = localStorage.getItem('theodoisk_task_notifications');
    const list: UserTaskNotification[] = saved ? JSON.parse(saved) : [];
    localStorage.setItem('theodoisk_task_notifications', JSON.stringify([fullNotif, ...list.slice(0, 99)]));
  } catch {}

  return fullNotif;
}

export function subscribeToTaskNotifications(
  config: FirebaseConnectionConfig,
  _currentUserId: string,
  onUpdate: (notifications: UserTaskNotification[]) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
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
        onError?.(err);
      }
    );

    return unsub;
  } catch (err) {
    onError?.(err as Error);
    return () => {};
  }
}

export async function updateTaskStatusInFirebase(
  config: FirebaseConnectionConfig,
  taskId: string,
  newStatus: TaskStatus
): Promise<void> {
  try {
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
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

export async function deleteTaskFromFirebase(
  config: FirebaseConnectionConfig,
  taskId: string
): Promise<void> {
  try {
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
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

export function subscribeToUsers(
  config: FirebaseConnectionConfig,
  onUsers: (users: AuthUser[]) => void
): () => void {
  try {
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
    const usersColl = collection(db, 'users');
    const unsub = onSnapshot(usersColl, (snap) => {
      if (!snap.empty) {
        const now = Date.now();
        const firestoreUsers: AuthUser[] = snap.docs
          .filter(d => {
            if (d.id === 'usr-admin-01' || d.id === 'usr-employee-01') return false;
            const data = d.data();
            const email = data.email ? String(data.email).trim() : '';
            return Boolean(email && email.includes('@') && !email.endsWith('@theodoisk.com'));
          })
          .map(d => {
            const data = d.data();
            const email = String(data.email).trim();
            const username = data.username || email.split('@')[0] || d.id;
            const isAdmin = data.role === 'admin' || data.role === 'manager';

          const lastActiveTime = data.lastActive ? new Date(data.lastActive).getTime() : 0;
          const isRecentPing = lastActiveTime > 0 ? (Math.abs(now - lastActiveTime) < 30 * 1000) : false;
          const isLiveHeartbeatActive = Boolean(data.isOnline) && isRecentPing;

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
            } else if (data.currentPosture === 'absent' || rawPostureText.includes('Vắng') || rawPostureText.includes('Ngoài vùng')) {
              posture = 'absent';
              postureText = '– Ngoài vùng';
            } else {
              posture = 'correct';
              postureText = '✓ Đúng';
            }
          }

          return {
            id: d.id,
            username,
            email,
            fullName: data.fullName || (isAdmin ? 'Quản Trị Viên' : 'Thành Viên'),
            role: isAdmin ? 'admin' : 'employee',
            department: data.department || (isAdmin ? 'Ban Điều Hành & An Toàn Lao Động' : 'Văn Phòng IoT'),
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
      markQuotaExceeded(err);
    });
    return unsub;
  } catch (err) {
    markQuotaExceeded(err);
    return () => {};
  }
}

export async function updateUserRealtimePresence(
  config: FirebaseConnectionConfig,
  userId: string,
  presenceData: Partial<AuthUser> & Record<string, any>
): Promise<void> {
  if (isQuotaExceeded) return;
  try {
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
    const userRef = doc(db, 'users', userId);
    
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
    markQuotaExceeded(err);
  }
}

export async function clearUserTelemetryFromFirebase(
  config: FirebaseConnectionConfig,
  userId: string
): Promise<void> {
  try {
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
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

export async function clearAllTelemetryDataFromFirebase(
  config: FirebaseConnectionConfig
): Promise<void> {
  await clearFirebaseTelemetry(config);
}