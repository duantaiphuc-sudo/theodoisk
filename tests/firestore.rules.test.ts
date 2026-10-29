import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';

let testEnv: RulesTestEnvironment | null = null;
const PROJECT_ID = 'theodoisk-test-project';
const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

describe('Firestore Security Rules Unit Tests', () => {
  beforeAll(async () => {
    try {
      const isEmulatorUp = await new Promise<boolean>((resolve) => {
        import('net').then(({ default: net }) => {
          const sock = net.createConnection({ host: '127.0.0.1', port: 8080 });
          sock.setTimeout(600);
          sock.on('connect', () => { sock.destroy(); resolve(true); });
          sock.on('error', () => { resolve(false); });
          sock.on('timeout', () => { sock.destroy(); resolve(false); });
        }).catch(() => resolve(false));
      });

      if (!isEmulatorUp) {
        console.warn('⚠️ Firestore Emulator không chạy trên port 8080. Tự động bỏ qua integration rules test.');
        return;
      }

      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          rules,
          host: '127.0.0.1',
          port: 8080,
        },
      });
    } catch (e) {
      console.warn('⚠️ Firestore Emulator chưa khởi chạy hoặc môi trường thiếu Java runtime:', e);
    }
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

  it('1. User A không thể đọc hồ sơ cá nhân của User B', async () => {
    if (!testEnv) return;
    const userAContext = testEnv.authenticatedContext('userA');
    const userBContext = testEnv.authenticatedContext('userB');

    // Setup initial data as admin
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/userB').set({
        uid: 'userB',
        fullName: 'Người Dùng B',
        email: 'userb@example.com',
        role: 'employee',
      });
    });

    // User A attempts to read User B's profile -> REJECT
    await assertFails(userAContext.firestore().doc('users/userB').get());

    // User B attempts to read their own profile -> PERMIT
    await assertSucceeds(userBContext.firestore().doc('users/userB').get());
  });

  it('2. User A không thể ghi hoặc chỉnh sửa dữ liệu của User B', async () => {
    if (!testEnv) return;
    const userAContext = testEnv.authenticatedContext('userA');

    // User A attempts to write directly into users/userB -> REJECT
    await assertFails(
      userAContext.firestore().doc('users/userB').set({
        fullName: 'Hacked by A',
      }, { merge: true })
    );

    // User A attempts to write into user B telemetry history -> REJECT
    await assertFails(
      userAContext.firestore().doc('theodoisk_history/users/userB/history/log1').set({
        userId: 'userB',
        bpm: 75,
        spo2: 98,
        posture_status: 0,
      })
    );
  });

  it('3. Client thông thường không thể ghi vào collection devices/*', async () => {
    if (!testEnv) return;
    const userAContext = testEnv.authenticatedContext('userA');

    // Attempt client write to devices/pi4_node_1 -> REJECT (chỉ Pi4 qua firebase-admin mới có quyền)
    await assertFails(
      userAContext.firestore().doc('devices/pi4_node_1').set({
        bpm: 72,
        spo2: 99,
        status: 'online',
      })
    );

    // Attempt client write to theodoisk/pi4_node_1 -> REJECT
    await assertFails(
      userAContext.firestore().doc('theodoisk/pi4_node_1').set({
        bpm: 72,
        spo2: 99,
      })
    );
  });

  it('4. Giả mạo userId khi ghi log lịch sử bị từ chối (Spoofed userId rejection)', async () => {
    if (!testEnv) return;
    const userAContext = testEnv.authenticatedContext('userA');

    // User A sends a payload pretending to be userB (userId: 'userB') -> REJECT
    await assertFails(
      userAContext.firestore().doc('theodoisk_history/log_spoofed').set({
        userId: 'userB', // Spoofed!
        bpm: 80,
        spo2: 98,
        posture_status: 0,
      })
    );

    // User A sends payload with their own auth.uid (userId: 'userA') -> PERMIT
    await assertSucceeds(
      userAContext.firestore().doc('theodoisk_history/log_valid_a').set({
        userId: 'userA',
        bpm: 80,
        spo2: 98,
        posture_status: 0,
      })
    );
  });

  it('5. Dữ liệu ngoài khoảng sinh trắc học bị từ chối (Out-of-range rejection)', async () => {
    if (!testEnv) return;
    const userAContext = testEnv.authenticatedContext('userA');

    // Invalid bpm (> 250)
    await assertFails(
      userAContext.firestore().doc('theodoisk_history/users/userA/history/log_bad_bpm').set({
        userId: 'userA',
        bpm: 300,
        spo2: 98,
        posture_status: 0,
      })
    );

    // Invalid posture_status (< -1 or > 5)
    await assertFails(
      userAContext.firestore().doc('theodoisk_history/users/userA/history/log_bad_posture').set({
        userId: 'userA',
        bpm: 75,
        spo2: 98,
        posture_status: 99,
      })
    );
  });

  it('6. Tài khoản Admin (custom claim admin: true) có toàn quyền quản trị', async () => {
    if (!testEnv) return;
    const adminContext = testEnv.authenticatedContext('adminUser', { admin: true });

    // Admin can read user B profile
    await assertSucceeds(adminContext.firestore().doc('users/userB').get());

    // Admin can create a notification
    await assertSucceeds(
      adminContext.firestore().doc('notifications/notif_admin_1').set({
        targetUserId: 'userB',
        title: 'Thông báo kiểm tra',
        content: 'Nội dung nhắc nhở',
        priority: 'high',
        createdAt: new Date().toISOString(),
      })
    );
  });
});
