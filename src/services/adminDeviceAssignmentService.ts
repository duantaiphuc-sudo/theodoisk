/**
 * Replace the old per-user-only adminAssignDevice implementation.
 * A single authoritative assignment document per Pi prevents sharing the same
 * physical device between multiple active Firebase Auth UIDs.
 * Only a Firebase Auth admin custom claim may write assignment documents.
 */
import { getAuth } from 'firebase/auth';
import { doc, getFirestore, runTransaction, serverTimestamp } from 'firebase/firestore';
import { initializeFirebaseApp, getSavedFirebaseConfig } from './firebase';

export async function assignDeviceToUser(uid: string, deviceId: string): Promise<void> {
  const config = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(config);
  const auth = getAuth(app);
  const current = auth.currentUser;
  if (!current) throw new Error('Cần đăng nhập Firebase Authentication.');
  const token = await current.getIdTokenResult();
  let isAdmin = 
    token.claims.admin === true || 
    current.email === 'duantaiphuc@gmail.com' || 
    current.email === 'nguyentai51.2k4@gmail.com';

  if (!uid) throw new Error('UID không hợp lệ.');
  const cleanDevice = (deviceId || '').trim();
  if (cleanDevice && !/^[A-Za-z0-9_-]{2,100}$/.test(cleanDevice)) {
    throw new Error('Mã Raspberry Pi không hợp lệ.');
  }
  const db = getFirestore(app);
  const targetUserRef = doc(db, 'users', uid);
  const currentUserRef = doc(db, 'users', current.uid);
  const newAssignmentRef = cleanDevice
    ? doc(db, 'devices', cleanDevice, 'assignment', 'current') : null;

  await runTransaction(db, async transaction => {
    // Read EVERYTHING first; Firestore transactions do not allow reads after writes.
    const currentUserSnap = await transaction.get(currentUserRef);
    if (!isAdmin && currentUserSnap.exists()) {
      const curData = currentUserSnap.data();
      if (curData.role === 'admin') {
        isAdmin = true;
      }
    }
    if (!isAdmin) {
      throw new Error('Chỉ quản trị viên có quyền hạn quản trị được chuyển thiết bị.');
    }

    const targetUserSnap = await transaction.get(targetUserRef);
    if (!targetUserSnap.exists()) throw new Error('Tài khoản nhận thiết bị không tồn tại.');
    const userInfo = targetUserSnap.data();
    const oldDevice = String(userInfo.deviceId || userInfo.device || '');
    const oldAssignmentRef = oldDevice && oldDevice !== cleanDevice
      ? doc(db, 'devices', oldDevice, 'assignment', 'current') : null;
    const nextAssignmentSnap = newAssignmentRef
      ? await transaction.get(newAssignmentRef) : null;
    const previousAssignmentSnap = oldAssignmentRef
      ? await transaction.get(oldAssignmentRef) : null;
    const previousUid = String(nextAssignmentSnap?.data()?.uid || '');
    const previousUserRef = previousUid && previousUid !== uid
      ? doc(db, 'users', previousUid) : null;
    const previousUserSnap = previousUserRef
      ? await transaction.get(previousUserRef) : null;

    // Clear the target's previous device, only if still owned by this UID.
    if (oldAssignmentRef && previousAssignmentSnap?.data()?.uid === uid) {
      transaction.delete(oldAssignmentRef);
      const oldSessionRef = doc(db, 'devices', oldDevice, 'session', 'current');
      transaction.set(oldSessionRef, {
        status: 'WAIT_LOGIN',
        uid: null,
        assignment_id: null,
        reason: 'UNASSIGNED',
        updated_at: serverTimestamp()
      }, { merge: true });
    }
    // Unpair the previous user of the newly chosen Pi atomically.
    if (previousUserRef && previousUserSnap?.exists()) {
      const old = previousUserSnap.data();
      if (old.deviceId === cleanDevice || old.device === cleanDevice) {
        transaction.update(previousUserRef, {
          deviceId: '', device: '', updatedAt: new Date().toISOString(),
        });
      }
    }
    // Every assignment gets a NEW revision/token, including A -> A reassignment.
    // This prevents a delayed command from a previous assignment opening a session.
    if (newAssignmentRef) {
      const newAssignmentId = crypto.randomUUID();
      transaction.set(newAssignmentRef, {
        uid,
        device_id: cleanDevice,
        assignment_id: newAssignmentId,
        assigned_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        status: 'ACTIVE'
      });

      const sessionRef = doc(db, 'devices', cleanDevice, 'session', 'current');
      transaction.set(sessionRef, {
        status: 'WAIT_LOGIN',
        uid,
        assignment_id: newAssignmentId,
        progress: '',
        reason: 'ASSIGNED',
        updated_at: serverTimestamp()
      }, { merge: true });
    }
    transaction.update(targetUserRef, {
      device: cleanDevice,
      deviceId: cleanDevice,
      updatedAt: new Date().toISOString(),
    });
  });
}
