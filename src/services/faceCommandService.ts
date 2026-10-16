/** Firebase Auth is the account login. Pi SFace verifies the device occupant. */
import { 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  onSnapshot, 
  serverTimestamp,
  type Unsubscribe 
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeFirebaseApp, getSavedFirebaseConfig, getAppFirestore } from './firebase';

export type FaceAction = 'ENROLL_FACE' | 'VERIFY_FACE' | 'LOGOUT_FACE';

function getFirebaseInstances() {
  const config = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(config);
  const db = getAppFirestore(app, config);
  const auth = getAuth(app);
  return { config, app, db, auth };
}

export async function requestFaceAction(deviceId: string, type: FaceAction): Promise<string> {
  const cleanDevice = (deviceId || '').trim();
  if (!cleanDevice || !/^[A-Za-z0-9_-]{2,100}$/.test(cleanDevice)) {
    throw new Error('Mã thiết bị không hợp lệ.');
  }

  const { db, auth } = getFirebaseInstances();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Bạn cần đăng nhập tài khoản trước khi thực hiện thao tác này.');
  }

  const [userDoc, assignmentDoc] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'devices', cleanDevice, 'assignment', 'current')),
  ]);

  if (!userDoc.exists() || (userDoc.data().deviceId !== cleanDevice && userDoc.data().device !== cleanDevice)) {
    throw new Error(`Tài khoản chưa được gán thiết bị [${cleanDevice}]. Vui lòng vào mục Quản lý người dùng để gán thiết bị.`);
  }

  const assignment = assignmentDoc.data();
  if (!assignmentDoc.exists() || !assignment?.assignment_id) {
    throw new Error(`Trạm [${cleanDevice}] chưa có bản ghi phân quyền (assignment/current). Hãy gán lại thiết bị trong Quản lý người dùng.`);
  }

  if (assignment.uid !== uid) {
    throw new Error(`Trạm [${cleanDevice}] hiện đang được gán cho tài khoản khác (UID: ${assignment.uid}). Hãy chuyển quyền gán sang tài khoản này.`);
  }

  const ref = await addDoc(collection(db, 'devices', cleanDevice, 'face_commands'), {
    uid,
    device_id: cleanDevice,
    assignment_id: assignment.assignment_id,
    type,
    status: 'PENDING',
    created_at: serverTimestamp(),
  });

  return ref.id;
}

export const requestFaceEnrollment = (deviceId: string) => requestFaceAction(deviceId, 'ENROLL_FACE');
export const requestFaceVerification = (deviceId: string) => requestFaceAction(deviceId, 'VERIFY_FACE');
export const requestFaceLogout = (deviceId: string) => requestFaceAction(deviceId, 'LOGOUT_FACE');

export function watchFaceCommand(
  deviceId: string, 
  commandId: string,
  onChange: (data: Record<string, unknown> | null) => void
): Unsubscribe {
  try {
    const cleanDevice = (deviceId || '').trim();
    if (!cleanDevice || !commandId) return () => {};
    const { db } = getFirebaseInstances();

    return onSnapshot(
      doc(db, 'devices', cleanDevice, 'face_commands', commandId),
      snap => {
        try {
          onChange(snap.exists() ? snap.data() : null);
        } catch (e) {
          console.warn('Error in watchFaceCommand callback:', e);
        }
      },
      err => {
        console.warn('watchFaceCommand error:', err);
        onChange({ status: 'FAILED', error: err.message });
      }
    );
  } catch (err) {
    console.warn('watchFaceCommand initialization failed:', err);
    return () => {};
  }
}

export function watchFaceSession(
  deviceId: string,
  onChange: (data: Record<string, unknown> | null) => void
): Unsubscribe {
  try {
    const cleanDevice = (deviceId || '').trim();
    if (!cleanDevice) return () => {};
    const { db, auth } = getFirebaseInstances();

    return onSnapshot(
      doc(db, 'devices', cleanDevice, 'session', 'current'),
      snap => {
        try {
          if (!snap.exists()) {
            onChange(null);
            return;
          }
          const data = snap.data();
          const uid = auth.currentUser?.uid;
          // Prevent display of a previous user's session when device is reassigned.
          if (uid && data.uid && data.uid !== uid) {
            onChange({ status: 'WAIT_LOGIN', uid: null, reason: 'OTHER_USER' });
          } else {
            onChange(data);
          }
        } catch (e) {
          console.warn('Error in watchFaceSession callback:', e);
        }
      },
      err => {
        console.warn('watchFaceSession error:', err);
        onChange({ status: 'WAIT_LOGIN', uid: null });
      }
    );
  } catch (err) {
    console.warn('watchFaceSession initialization failed:', err);
    return () => {};
  }
}

/** Web dashboard must discard shared-node telemetry not bound to this UID. */
export function onlyCurrentUserTelemetry<T extends { userId?: string | null }>(
  data: T | null, 
  uid: string
): T | null {
  return data?.userId === uid ? data : null;
}
