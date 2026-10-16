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
  const isAdmin = token.claims.admin === true || current.email === 'duantaiphuc@gmail.com';
  if (!isAdmin) {
    throw new Error('Chỉ quản trị viên có quyền hạn quản trị được chuyển thiết bị.');
  }
  if (!uid) throw new Error('UID không hợp lệ.');
  const cleanDevice = (deviceId || '').trim();
  if (cleanDevice && !/^[A-Za-z0-9_-]{2,100}$/.test(cleanDevice)) {
    throw new Error('Mã Raspberry Pi không hợp lệ.');
  }
  const db = getFirestore(app);
  const targetUserRef = doc(db, 'users', uid);
  const newAssignmentRef = cleanDevice
    ? doc(db, 'devices', cleanDevice, 'assignment', 'current') : null;

  await runTransaction(db, async transaction => {
    // Read EVERYTHING first; Firestore transactions do not allow reads after writes.
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
      transaction.set(newAssignmentRef, {
        uid, assignment_id: crypto.randomUUID(),
        updated_at: serverTimestamp(),
      });
    }
    transaction.update(targetUserRef, {
      device: cleanDevice,
      deviceId: cleanDevice,
      updatedAt: new Date().toISOString(),
    });
  });
}
