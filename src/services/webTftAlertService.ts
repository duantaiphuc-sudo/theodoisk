/**
 * webTftAlertService.ts
 * =====================
 * Đồng bộ cảnh báo tư thế thời gian thực từ Web lên màn hình TFT của Raspberry Pi 4.
 *
 * Firestore Document:
 *   devices/{deviceId}/web_display/current
 *
 * Schema:
 *   uid: string                - UID người dùng hiện tại
 *   assignment_id: string      - ID phiên gán thiết bị
 *   status_code: 0 | 3 | 4     - 0: Bình thường, 3: Sai tư thế lâu, 4: Ngồi quá lâu
 *   base_posture_status: 0 | 1 - 0: Đúng tư thế, 1: Sai tư thế
 *   updated_at: serverTimestamp()
 *
 * Chú ý:
 * - Pi 4 (web_tft_alert.py) kiểm tra TTL ~18s và khớp đúng (uid, assignment_id, verified).
 * - Web là nguồn duy nhất sở hữu bộ đếm thời gian (elapsed durations).
 * - Tuyệt đối không gửi số giây, dữ liệu sức khỏe hoặc vector sinh trắc học vào document này.
 */

import { doc, setDoc, serverTimestamp, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { initializeFirebaseApp, getSavedFirebaseConfig, getAppFirestore } from './firebase';

export type TftStatusCode = 0 | 3 | 4;
export type TftBasePostureStatus = 0 | 1;

export interface WebTftAlertPayload {
  uid: string;
  assignment_id: string;
  status_code: TftStatusCode;
  base_posture_status: TftBasePostureStatus;
}

export interface WebTftAlertPublisherOptions {
  deviceId: string;
  uid: string;
  isBadPosture: boolean;
  isSeated: boolean;
  badPostureSeconds: number;
  continuousSittingSeconds: number;
  incorrectPostureThresholdSec: number;
  longSittingThresholdSec: number;
}

function getFirestoreDb() {
  const config = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(config);
  return getAppFirestore(app, config);
}

/**
 * Lắng nghe assignment_id hiện tại của thiết bị trạm Pi 4
 */
export function watchDeviceAssignment(
  deviceId: string,
  onAssignmentChange: (data: { uid: string; assignment_id: string } | null) => void
): Unsubscribe {
  const cleanDevice = (deviceId || '').trim();
  if (!cleanDevice) {
    onAssignmentChange(null);
    return () => {};
  }

  try {
    const db = getFirestoreDb();
    const assignmentRef = doc(db, 'devices', cleanDevice, 'assignment', 'current');
    return onSnapshot(
      assignmentRef,
      snap => {
        if (snap.exists()) {
          const d = snap.data();
          if (d?.assignment_id && d?.uid) {
            onAssignmentChange({ uid: String(d.uid), assignment_id: String(d.assignment_id) });
            return;
          }
        }
        onAssignmentChange(null);
      },
      err => {
        console.warn('[WebTFT] watchDeviceAssignment error:', err);
        onAssignmentChange(null);
      }
    );
  } catch (e) {
    console.warn('[WebTFT] Failed to init watchDeviceAssignment:', e);
    return () => {};
  }
}

/**
 * Ghi trực tiếp bản ghi cảnh báo lên Firestore devices/{deviceId}/web_display/current
 */
export async function pushWebTftAlert(
  deviceId: string,
  payload: WebTftAlertPayload
): Promise<boolean> {
  const cleanDevice = (deviceId || '').trim();
  if (!cleanDevice || !payload.uid || !payload.assignment_id) {
    return false;
  }

  try {
    const db = getFirestoreDb();
    const docRef = doc(db, 'devices', cleanDevice, 'web_display', 'current');
    await setDoc(docRef, {
      uid: payload.uid,
      assignment_id: payload.assignment_id,
      status_code: payload.status_code,
      base_posture_status: payload.base_posture_status,
      updated_at: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.warn('[WebTFT] pushWebTftAlert error:', err);
    return false;
  }
}

/**
 * Xác định mã trạng thái TFT từ bộ đếm Web
 * - 3: Sai tư thế lâu (badPostureSeconds >= incorrectPostureThresholdSec)
 * - 4: Ngồi liên tục quá lâu (continuousSittingSeconds >= longSittingThresholdSec)
 * - 0: Bình thường
 */
export function calculateTftStatusCode(
  isSeated: boolean,
  isBadPosture: boolean,
  badPostureSeconds: number,
  continuousSittingSeconds: number,
  incorrectPostureThresholdSec: number,
  longSittingThresholdSec: number
): { status_code: TftStatusCode; base_posture_status: TftBasePostureStatus } {
  if (!isSeated) {
    return { status_code: 0, base_posture_status: 0 };
  }

  const base_posture_status: TftBasePostureStatus = isBadPosture ? 1 : 0;

  // Ưu tiên 1: Sai tư thế quá lâu (Mã 3 - Cảnh báo cấp bách về tư thế)
  if (isBadPosture && badPostureSeconds >= incorrectPostureThresholdSec && incorrectPostureThresholdSec > 0) {
    return { status_code: 3, base_posture_status: 1 };
  }

  // Ưu tiên 2: Ngồi liên tục quá lâu (Mã 4 - Nhắc nhở đứng dậy vận động)
  if (continuousSittingSeconds >= longSittingThresholdSec && longSittingThresholdSec > 0) {
    return { status_code: 4, base_posture_status };
  }

  return { status_code: 0, base_posture_status };
}
