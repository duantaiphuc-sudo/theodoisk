# Hệ Thống Theo Dõi Sức Khỏe & Công Thái Học IoT (Raspberry Pi 4 + Firebase + Supabase)

Hệ thống giám sát tư thế làm việc công thái học, nhịp tim và nồng độ oxy trong máu (SpO2) thời gian thực kết nối với thiết bị phần cứng Raspberry Pi 4, đồng bộ Firebase Firestore và lưu trữ lịch sử qua Supabase PostgreSQL.

---

## ⚠️ CẢNH BÁO BẢO MẬT QUAN TRỌNG (SECURITY AUDIT & KEY ROTATION)

1. **XOAY KHÓA SUPABASE (ROTATE KEY)**:
   - Các API Key cũ trước đây đã từng xuất hiện trong lịch sử mã nguồn (Git commit history).
   - **BẮT BUỘC**: Bạn cần truy cập **Supabase Dashboard → Project Settings → API** và bấm **Rotate secret / Reset API keys** để vô hiệu hóa hoàn toàn key cũ.
2. **KIỂM TRA BẢO VỆ TỆP SERVICE ACCOUNT**:
   - Tệp khóa bí mật `serviceAccountKey.json` và các tệp `*.pem` đã được cấu hình trong `.gitignore`.
   - **TUYỆT ĐỐI KHÔNG commit** bất kỳ tệp private key nào lên GitHub hoặc kho lưu trữ công khai.

---

## 🛠️ CÁC BƯỚC CẦN THỰC HIỆN THỦ CÔNG

### Bước 1: Áp dụng Schema & Row Level Security (RLS) trên Supabase
1. Đăng nhập vào [Supabase Dashboard](https://supabase.com/dashboard) và chọn dự án của bạn.
2. Mở mục **SQL Editor**.
3. Sao chép toàn bộ nội dung trong tệp [`supabase/schema.sql`](./supabase/schema.sql) và dán vào SQL Editor.
4. Bấm **Run** để thực thi:
   - Tạo bảng `telemetry_logs` và indexes truy vấn thời gian/user.
   - BẬT **Row Level Security (RLS)**.
   - XÓA TOÀN BỘ các policy lỏng lẻo có `USING (true)`.
   - Vô hiệu hóa quyền ghi/đọc/xóa trực tiếp từ client không xác thực (`anon`).

### Bước 2: Thiết lập quyền Quản Trị Viên (Admin Custom Claims)
Hệ thống sử dụng cơ chế bảo mật **Firebase Custom Claims** (`admin: true`), không phụ thuộc vào email cứng hay vai trò lưu trong localStorage:
1. Vào Firebase Console → **Project Settings → Service Accounts → Generate new private key**.
2. Lưu tệp tải về vào thư mục gốc của dự án với tên `serviceAccountKey.json` (đã nằm trong `.gitignore`).
3. Chạy lệnh:
   ```bash
   npx tsx scripts/set-admin.ts <email_cua_ban>
   ```
   *Ví dụ*:
   ```bash
   npx tsx scripts/set-admin.ts taismile0501@gmail.com
   ```
4. Người dùng đăng xuất và đăng nhập lại trên Web để ID Token nạp claim `admin: true`.

### Bước 3: Cấu hình biến môi trường (Vercel / Production Server)
Thiết lập các biến môi trường trong tệp `.env` hoặc trên Vercel Dashboard:
- `FIREBASE_API_KEY`: API Key Firebase Client
- `GEMINI_API_KEY`: Google Gemini API Key
- `GEMINI_MODEL`: `gemini-3.8-flash` (mặc định)
- `GEMINI_FALLBACK_MODEL`: `gemini-3.1-flash-lite` (dự phòng)
- `SUPABASE_URL`: Đường dẫn URL Supabase của bạn (ví dụ `https://xxxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY`: Service Role Secret Key từ Supabase Dashboard (Chỉ sử dụng phía server, KHÔNG gửi xuống client)
- `FIREBASE_SERVICE_ACCOUNT_PATH`: Đường dẫn tới `serviceAccountKey.json` trên server (tùy chọn nếu chạy script dev).

---

## 🔒 TỔNG QUAN KIẾN TRÚC BẢO MẬT ĐÃ VÁ

1. **Xác thực API `/api/chat` (server.ts)**:
   - Bắt buộc Header `Authorization: Bearer <Firebase ID token>`.
   - Xác thực token thông qua `firebase-admin.auth().verifyIdToken()`. Thiếu hoặc sai token trả về `401 Unauthorized`.
   - Phân quyền nghiêm ngặt theo server claim `admin`. Người dùng thông thường chỉ truy vấn dữ liệu của chính mình (`uid`), chỉ Admin mới có quyền truy vấn thành viên khác.
   - Giới hạn tần suất (Rate limit) 20 yêu cầu/phút theo UID; giới hạn kích thước request body 100kb; giới hạn độ dài câu hỏi tối đa 1000 ký tự.
   - Dữ liệu sức khỏe đưa vào prompt được cô lập trong khối rõ ràng kèm chỉ thị an toàn chống prompt injection.
   - Disclaimer cố định nhắc nhở thông tin mang tính tham khảo công thái học, không thay thế chẩn đoán y khoa.

2. **Quy tắc bảo mật Firestore (`firestore.rules`)**:
   - Xóa bỏ toàn bộ email cứng, UID cứng.
   - Phân quyền Admin dựa trên `request.auth.token.admin == true`.
   - Khóa toàn bộ quyền ghi từ client vào `devices/*`, `devices_history/*`, `theodoisk/*` (chỉ Raspberry Pi 4 sử dụng `firebase-admin` mới có quyền ghi).
   - Quyền đọc thiết bị yêu cầu `isAdmin()` hoặc người dùng có `deviceId` trùng khớp trong hồ sơ.
   - Kiểm tra chặt chẽ tính toàn vẹn dữ liệu: `userId == request.auth.uid`, BPM trong khoảng `0..250`, SpO2 trong khoảng `0..100`, `posture_status` trong khoảng `-1..5`.

3. **Bảo mật chuỗi lưu trữ Supabase**:
   - Toàn bộ thao tác ghi (`POST /api/telemetry/log`), đọc (`GET /api/telemetry/history`) và xóa (`DELETE /api/telemetry/history`) đều được chuyển qua API server có xác thực ID Token.
   - Khóa Anon Public Key được gỡ bỏ khỏi client và server code; server kết nối bằng `SUPABASE_SERVICE_ROLE_KEY`.
