# OFFICE HEALTH — WEB ĐIỀU KHIỂN NGƯỠNG PI + LƯU THỜI GIAN V4

## Cơ sở mã
- Web theo GitHub `theodoisk` main `1de1f2e0b98035aa2ec81fe25a3a39a9f8bf2d60` (20/10/2026).
- Pi dựa trên **Auto Face Existing UID V3** đã trao đổi; giữ YuNet/SFace 5 mẫu, ảnh JPEG và tự login/lock. **Không dùng một mainnew.py cũ khác để ghi đè bất kỳ thay đổi riêng của bạn**.

## Những thay đổi
- Web lưu cấu hình theo Auth UID tại `users/{uid}/preferences/office_health`; Pi dùng Admin SDK đọc mỗi 10 giây, không cần khởi động lại.
- Ngưỡng: BPM min/max, SpO₂ tối thiểu, sai tư thế, sai tư thế lâu, ngồi lâu, đứng mục tiêu, **đứng bao lâu mới reset ngồi** (mặc định 300s).
- Đứng đủ thời gian mới reset `continuousSittingSeconds`; tổng `sittingSeconds`/`standingSeconds` không bị xóa.
- Pi lưu thống kê ngày theo UID tại `office_health_time/{uid}` và `/days/{YYYY-MM-DD}` mỗi khoảng 10 giây và khi thoát.
- Phiên Face khóa thì Web vẫn xem thống kê của UID, nhưng không xem dữ liệu sức khỏe chưa xác thực. Chỉ tăng bộ đếm khi xác định được danh tính; khi tạm khóa do đứng thì cộng tiếp thời gian đứng cho UID đã được xác thực trong phiên gán hiện tại.
- Các lựa chọn âm thanh/TTS và thông báo trình duyệt tiếp tục do Web phát. Pi không có loa nên không trực tiếp phát tiếng.

## Cài Pi
1. Đọc lại mã Pi hiện tại; sao lưu trước khi ghi đè. Dừng `mainnew.py` bằng Ctrl+C.
2. Chép `OfficeHealth_Pi4_Settings_History_v4.zip` vào thư mục `~/Desktop/office_health/ver4` của Pi.
3. Chạy:

```bash
cd ~/Desktop/office_health/ver4
mkdir -p ~/officehealth_backup_v4/face
cp mainnew.py ~/officehealth_backup_v4/
cp face/face_controller.py face/face_engine.py ~/officehealth_backup_v4/face/
unzip -o OfficeHealth_Pi4_Settings_History_v4.zip -d .
python3 -m py_compile mainnew.py activity_settings.py face/face_controller.py face/face_engine.py
python3 mainnew.py --headless --health-log --face-auth
```

**Không copy private key lên GitHub; không xóa mô hình camera.**

## Cài Web
Giải nén `OfficeHealth_Web_Settings_History_v4.zip` vào nơi thuận tiện. Đặt `patch_web_pi_settings.py` tại thư mục gốc GitHub Web (cùng cấp `package.json` và `firestore.rules`). Chạy:

```bash
python3 patch_web_pi_settings.py
npm run typecheck
npm run build
```

Nếu typecheck/build có lỗi, **chưa deploy**; gửi log để sửa. Script từ chối vá nếu các cấu trúc code quan trọng đã đổi.

## BẮT BUỘC: Deploy Firestore Rules
Bản vá thêm quyền đọc UID của `office_health_time` và chặn client ghi. Trước khi triển khai phải kiểm tra các rules hiện tại và bản backup. Với Firebase CLI được cấu hình đúng dự án:

```bash
firebase deploy --only firestore:rules
```

Nếu thiếu quyền/quy tắc thì Web đọc thời gian sẽ báo `permission-denied`. Pi dùng Firebase Admin SDK để ghi.

## Firestore
```
users/{uid}/preferences/office_health
  hrMin, hrMax, spo2Min, incorrectPostureSec, longIncorrectSec,
  longSittingSec, standingTargetSec, standingResetSec,
  soundEnabled, voiceAlertEnabled, browserNotificationEnabled, ...

office_health_time/{uid}
  userId, deviceId, dateKey, sittingSeconds, standingSeconds,
  continuousSittingSeconds, continuousStandingSeconds,
  badPostureSeconds, movingSeconds, updatedAt

office_health_time/{uid}/days/{YYYY-MM-DD}
  (tổng kết theo ngày — còn lại khi phiên Face bị khóa)
```

## Giới hạn kiểm thử
Chỉ test logic offline/compile; **chưa test trên Pi thật và chưa chạy npm build** trong môi trường local này. Firestore hiện có wildcard quyền trên `users/{uid}` cho chính chủ; quy tắc mới dành riêng cho bộ đếm thuộc collection độc lập, không khắc phục các lỗ hổng Firestore rộng hơn.
### Kiểm thử an toàn
- Bấm lưu Web: kiểm tra `users/{uid}/preferences/office_health` đã cập nhật. Pi đọc lại sau tối đa khoảng 10 giây khi kết nối ổn định.
- Khi Face bị khóa, chỉ lịch sử theo UID còn hiển thị; BPM/SpO2 phải bị ẩn.
- Đứng liên tục đủ ngưỡng reset (300 giây mặc định) thì `continuousSittingSeconds` về 0 nhưng `sittingSeconds` theo ngày không giảm.
- Nếu Pi mất nguồn đột ngột, dữ liệu tối đa khoảng 10 giây gần nhất có thể chưa được lưu.
