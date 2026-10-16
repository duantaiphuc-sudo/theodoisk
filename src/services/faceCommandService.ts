/** Firebase Auth is the account login. Pi SFace verifies the device occupant. */
import { collection, doc, getDoc, addDoc, onSnapshot, serverTimestamp,
  type Unsubscribe } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeFirebaseApp, getSavedFirebaseConfig, getAppFirestore } from './firebase';

export type FaceAction = 'ENROLL_FACE' | 'VERIFY_FACE' | 'LOGOUT_FACE';
function context() {
  const config = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(config);
  const db = getAppFirestore(app, config);
  const auth = getAuth(app);
  if (!auth.currentUser?.uid) throw new Error('Bạn cần đăng nhập trước.');
  return { db, uid: auth.currentUser.uid };
}

export async function requestFaceAction(deviceId: string, type: FaceAction): Promise<string> {
  if (!/^[A-Za-z0-9_-]{2,100}$/.test(deviceId)) throw new Error('Thiết bị không hợp lệ.');
  const { db, uid } = context();
  const [userDoc, assignmentDoc] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'devices', deviceId, 'assignment', 'current')),
  ]);
  if (!userDoc.exists() || (userDoc.data().deviceId !== deviceId && userDoc.data().device !== deviceId)) {
    throw new Error('Quản trị viên chưa gán thiết bị này cho tài khoản.');
  }
  const assignment = assignmentDoc.data();
  if (assignment?.uid !== uid || !assignment.assignment_id) {
    throw new Error('Bạn không phải người đang được gán thiết bị này.');
  }
  const ref = await addDoc(collection(db, 'devices', deviceId, 'face_commands'), {
    uid, device_id: deviceId, assignment_id: assignment.assignment_id,
    type, status: 'PENDING', created_at: serverTimestamp(),
  });
  return ref.id;
}
export const requestFaceEnrollment = (deviceId: string) => requestFaceAction(deviceId,'ENROLL_FACE');
export const requestFaceVerification = (deviceId: string) => requestFaceAction(deviceId,'VERIFY_FACE');
export const requestFaceLogout = (deviceId: string) => requestFaceAction(deviceId,'LOGOUT_FACE');

export function watchFaceCommand(deviceId: string, commandId: string,
  onChange: (data: Record<string, unknown> | null) => void): Unsubscribe {
  const { db } = context();
  return onSnapshot(doc(db,'devices',deviceId,'face_commands',commandId),
    snap => onChange(snap.exists() ? snap.data() : null));
}
export function watchFaceSession(deviceId: string,
  onChange: (data: Record<string, unknown> | null) => void): Unsubscribe {
  const { db, uid } = context();
  return onSnapshot(doc(db,'devices',deviceId,'session','current'), snap => {
    if (!snap.exists()) return onChange(null);
    const data = snap.data();
    // Prevent display of a previous user's session when device is reassigned.
    onChange(data.uid === uid ? data : {status:'WAIT_LOGIN',uid:null,reason:'OTHER_USER'});
  });
}

/** Web dashboard must discard shared-node telemetry not bound to this UID. */
export function onlyCurrentUserTelemetry<T extends {userId?: string | null}>(
  data: T | null, uid: string
): T | null {
  return data?.userId === uid ? data : null;
}
