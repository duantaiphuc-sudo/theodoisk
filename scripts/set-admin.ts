/**
 * Script thiết lập quyền Admin (Firebase Custom Claims)
 * 
 * HƯỚNG DẪN SỬ DỤNG:
 * 1. Tải tệp Service Account key từ Firebase Console:
 *    Project Settings -> Service accounts -> Generate new private key
 * 2. Đặt tệp tại thư mục gốc của dự án với tên `serviceAccountKey.json`
 *    (Tệp này đã được cấu hình trong .gitignore, TUYỆT ĐỐI KHÔNG commit vào git).
 *    Hoặc thiết lập biến môi trường:
 *    export FIREBASE_SERVICE_ACCOUNT_PATH=/duong/dan/serviceAccountKey.json
 * 3. Chạy lệnh:
 *    npx tsx scripts/set-admin.ts <email_nguoi_dung> [--revoke]
 * 
 * Ví dụ:
 *    npx tsx scripts/set-admin.ts taismile0501@gmail.com
 *    npx tsx scripts/set-admin.ts user@example.com --revoke
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  const email = args[0];
  const isRevoke = args.includes('--revoke');

  if (!email || email.startsWith('--')) {
    console.error('❌ Lỗi: Vui lòng cung cấp email của người dùng.');
    console.log('Cách dùng: npx tsx scripts/set-admin.ts <email> [--revoke]');
    process.exit(1);
  }

  // Khởi tạo Firebase Admin SDK
  let serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.resolve(process.cwd(), 'serviceAccountKey.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log(`🔑 Đã tải Service Account từ: ${serviceAccountPath}`);
    } catch (e: any) {
      console.error(`❌ Lỗi khi đọc file service account: ${e.message}`);
      process.exit(1);
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp();
    console.log('🔑 Đã khởi tạo Firebase Admin từ GOOGLE_APPLICATION_CREDENTIALS');
  } else {
    console.error('❌ Không tìm thấy tệp serviceAccountKey.json tại thư mục gốc!');
    console.error('👉 Vui lòng tải Service Account key từ Firebase Console và lưu vào "serviceAccountKey.json"');
    console.error('👉 Hoặc thiết lập biến môi trường FIREBASE_SERVICE_ACCOUNT_PATH.');
    process.exit(1);
  }

  try {
    const auth = getAuth();
    const user = await auth.getUserByEmail(email);
    console.log(`👤 Tìm thấy người dùng: ${user.email} (UID: ${user.uid})`);

    const currentClaims = user.customClaims || {};
    const newClaims = {
      ...currentClaims,
      admin: !isRevoke
    };

    await auth.setCustomUserClaims(user.uid, newClaims);

    if (isRevoke) {
      console.log(`✅ Đã HỦY quyền Admin của người dùng: ${email}`);
    } else {
      console.log(`✅ Đã GÁN quyền Admin thành công cho người dùng: ${email}`);
      console.log('⚡ Lưu ý: Người dùng cần đăng xuất và đăng nhập lại trên Web để ID Token cập nhật claim mới.');
    }
  } catch (error: any) {
    console.error(`❌ Thao tác thất bại: ${error.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Lỗi không xác định:', err);
  process.exit(1);
});
