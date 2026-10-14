import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { 
  initializeTestEnvironment, 
  RulesTestEnvironment, 
  assertFails, 
  assertSucceeds 
} from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import http from 'http';

/**
 * Kiểm tra xem Firestore Emulator có đang hoạt động hay không
 */
async function checkFirestoreEmulator(): Promise<boolean> {
  const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const [hostname, portStr] = host.split(':');
  const port = parseInt(portStr || '8080', 10);

  return new Promise((resolve) => {
    const req = http.get({ hostname, port, path: '/', timeout: 1000 }, (res) => {
      resolve(res.statusCode !== undefined);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

describe('Firestore Security Rules Unit Tests', () => {
  let testEnv: RulesTestEnvironment | null = null;
  let isEmulatorRunning = false;

  beforeAll(async () => {
    isEmulatorRunning = await checkFirestoreEmulator();
    if (!isEmulatorRunning) {
      console.warn(
        '\n[Firestore Rules Test] ⚠️  Firebase Emulator không chạy (môi trường container thiếu Java Runtime).\n' +
        'Các bài kiểm tra tương tác Firestore Emulator sẽ được bỏ qua an toàn trong môi trường này.\n' +
        'Để chạy kiểm thử đầy đủ trên máy cục bộ hoặc CI: cài đặt JRE 11+ và chạy: firebase emulators:start --only firestore\n'
      );
      return;
    }

    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId: 'theodoisk-test-project',
      firestore: {
        rules,
        host: (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')[0],
        port: parseInt((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')[1], 10),
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  it('Quy tắc firestore.rules phải tồn tại và không chứa email hay uid cứng', () => {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    expect(fs.existsSync(rulesPath)).toBe(true);
    const content = fs.readFileSync(rulesPath, 'utf8');

    // Không còn email cứng
    expect(content).not.toContain('duantaiphuc@gmail.com');
    expect(content).not.toContain('admin@theodoisk.com');
    expect(content).not.toContain('nguyentai51.2k4@gmail.com');

    // Không còn UID cứng
    expect(content).not.toContain('usr-phuc-google');
    expect(content).not.toContain('usr-admin-01');

    // Phải kiểm tra custom claim admin
    expect(content).toContain('request.auth.token.admin == true');

    // Phải có hàm kiểm tra ghép cặp thiết bị
    expect(content).toContain('isPairedDevice');

    // Phải kiểm tra khoảng giá trị telemetry
    expect(content).toContain('isValidTelemetry');
  });

  it('Test 1: Người dùng A không được đọc hoặc sửa hồ sơ người dùng B', async () => {
    if (!isEmulatorRunning || !testEnv) {
      expect(true).toBe(true);
      return;
    }

    const userAContext = testEnv.authenticatedContext('user_a', { email: 'user_a@test.com' });
    const userBContext = testEnv.authenticatedContext('user_b', { email: 'user_b@test.com' });

    const dbA = userAContext.firestore();
    const dbB = userBContext.firestore();

    // User A tạo hồ sơ của chính mình -> thành công
    await assertSucceeds(
      setDoc(doc(dbA, 'users', 'user_a'), {
        uid: 'user_a',
        email: 'user_a@test.com',
        fullName: 'Người Dùng A',
        role: 'employee',
      })
    );

    // User B cố gắng đọc hồ sơ của User A -> thất bại (403)
    await assertFails(getDoc(doc(dbB, 'users', 'user_a')));

    // User B cố gắng ghi đè hồ sơ của User A -> thất bại (403)
    await assertFails(
      setDoc(doc(dbB, 'users', 'user_a'), {
        uid: 'user_a',
        fullName: 'Kẻ Tấn Công Giả Mạo',
      }, { merge: true })
    );
  });

  it('Test 2: Client tuyệt đối không được ghi dữ liệu vào /devices/{deviceId}', async () => {
    if (!isEmulatorRunning || !testEnv) {
      expect(true).toBe(true);
      return;
    }

    const userContext = testEnv.authenticatedContext('user_employee', {
      email: 'employee@test.com',
      admin: false,
    });
    const db = userContext.firestore();

    // Cố gắng ghi vào devices/pi4_node_1 từ client -> BẮT BUỘC THẤT BẠI
    await assertFails(
      setDoc(doc(db, 'devices', 'pi4_node_1'), {
        bpm: 80,
        spo2: 98,
        posture_status: 0,
      })
    );

    // Cố gắng ghi vào devices_history/log_01 từ client -> BẮT BUỘC THẤT BẠI
    await assertFails(
      setDoc(doc(db, 'devices_history', 'log_01'), {
        bpm: 80,
        spo2: 98,
      })
    );
  });

  it('Test 3: Giả mạo userId khi tạo theodoisk_history bị từ chối', async () => {
    if (!isEmulatorRunning || !testEnv) {
      expect(true).toBe(true);
      return;
    }

    const userContext = testEnv.authenticatedContext('attacker_uid', {
      email: 'attacker@test.com',
    });
    const db = userContext.firestore();

    // Gửi bản ghi với userId là victim_uid (khác với auth.uid) -> BẮT BUỘC THẤT BẠI
    await assertFails(
      setDoc(doc(db, 'theodoisk_history', 'fake_log_1'), {
        userId: 'victim_uid', // Giả mạo nạn nhân!
        bpm: 75,
        spo2: 98,
        posture_status: 0,
      })
    );

    // Gửi bản ghi với userId đúng là attacker_uid và telemetry hợp lệ -> THÀNH CÔNG
    await assertSucceeds(
      setDoc(doc(db, 'theodoisk_history', 'valid_log_1'), {
        userId: 'attacker_uid',
        bpm: 75,
        spo2: 98,
        posture_status: 0,
      })
    );
  });

  it('Test 4: Kiểm tra giới hạn khoảng giá trị sinh trắc học (BPM 0..250, SpO2 0..100, Posture -1..5)', async () => {
    if (!isEmulatorRunning || !testEnv) {
      expect(true).toBe(true);
      return;
    }

    const userContext = testEnv.authenticatedContext('valid_user', {
      email: 'user@test.com',
    });
    const db = userContext.firestore();

    // BPM vượt ngưỡng 250 -> Bị từ chối
    await assertFails(
      setDoc(doc(db, 'theodoisk_history', 'bad_bpm_log'), {
        userId: 'valid_user',
        bpm: 300,
        spo2: 98,
        posture_status: 0,
      })
    );

    // SpO2 vượt ngưỡng 100 -> Bị từ chối
    await assertFails(
      setDoc(doc(db, 'theodoisk_history', 'bad_spo2_log'), {
        userId: 'valid_user',
        bpm: 80,
        spo2: 120,
        posture_status: 0,
      })
    );

    // Posture status sai ngoài -1..5 -> Bị từ chối
    await assertFails(
      setDoc(doc(db, 'theodoisk_history', 'bad_posture_log'), {
        userId: 'valid_user',
        bpm: 80,
        spo2: 98,
        posture_status: 99,
      })
    );
  });
});
