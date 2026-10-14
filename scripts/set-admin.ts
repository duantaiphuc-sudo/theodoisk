/**
 * Script gán quyền Quản trị viên (Custom Claim: { admin: true }) cho tài khoản Firebase
 * Chạy một lần từ môi trường phát triển (Terminal) với Firebase Service Account.
 * 
 * Cách sử dụng:
 *   npx tsx scripts/set-admin.ts <email>
 *   npx tsx scripts/set-admin.ts <email> --revoke
 * 
 * Lưu ý bảo mật:
 *   - Tuyệt đối KHÔNG commit file serviceAccountKey.json vào Git repository.
 *   - File serviceAccountKey.json đã được cấu hình trong .gitignore.
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

function initAdmin(): admin.app.App {
  if (admin.apps.length > 0 && admin.apps[0]) {
    return admin.apps[0];
  }

  const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');

  if (fs.existsSync(serviceAccountPath)) {
    console.log(`[set-admin] Sử dụng khóa xác thực từ: ${serviceAccountPath}`);
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.log('[set-admin] Sử dụng biến môi trường FIREBASE_SERVICE_ACCOUNT_KEY');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(`[set-admin] Sử dụng GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    return admin.initializeApp();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || 'theodoisk-66ddb';
  console.log(`[set-admin] Thử khởi tạo với Application Default Credentials (Project: ${projectId})`);
  return admin.initializeApp({
    projectId,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const email = args[0]?.trim();
  const isRevoke = args.includes('--revoke');

  if (!email || email.startsWith('--')) {
    console.error('❌ Vui lòng cung cấp email tài khoản cần cấp/hủy quyền admin.');
    console.log('Ví dụ:');
    console.log('  npx tsx scripts/set-admin.ts nguyentai51.2k4@gmail.com');
    console.log('  npx tsx scripts/set-admin.ts nguyentai51.2k4@gmail.com --revoke');
    process.exit(1);
  }

  try {
    initAdmin();
    const auth = admin.auth();

    console.log(`🔍 Đang tìm kiếm người dùng với email: ${email}...`);
    const user = await auth.getUserByEmail(email);

    const existingClaims = user.customClaims || {};
    const newClaims = {
      ...existingClaims,
      admin: !isRevoke,
    };

    await auth.setCustomUserClaims(user.uid, newClaims);

    if (isRevoke) {
      console.log(`✅ Đã HỦY quyền Admin của người dùng:`);
    } else {
      console.log(`✅ Đã GÁN quyền Admin thành công cho người dùng:`);
    }
    console.log(`   - UID: ${user.uid}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Tên: ${user.displayName || '(chưa đặt)'}`);
    console.log(`   - Custom Claims hiện tại:`, JSON.stringify(newClaims));
    console.log('\n💡 Lưu ý: Người dùng cần đăng xuất và đăng nhập lại (hoặc làm mới ID token) để quyền có hiệu lực trên Client.');
  } catch (err: any) {
    console.error(`❌ Thất bại: ${err.message || err}`);
    if (err.code === 'auth/user-not-found') {
      console.error('   -> Không tìm thấy tài khoản với email này trong Firebase Authentication.');
    }
    process.exit(1);
  }
}

main();
