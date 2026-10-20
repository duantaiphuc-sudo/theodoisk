# OFFICE HEALTH — AUTO FACE SYNC V2 (20/10/2026)

## Mục tiêu
- Demo **1 Pi `pi4_node_1`** cho nhiều tài khoản Firebase Auth, mỗi lúc chỉ 1 UID được Admin gán.
- Web chỉ có nút **Đăng ký khuôn mặt** và **Đặt lại mẫu**; Pi tự nhận diện sau khi có mẫu SFace.
- **STAND >= 4 giây** hoặc **ABSENT/OUT_OF_ZONE >= 6 giây** -> `REVERIFY_REQUIRED` -> Pi khóa bản tin HR/SpO2 và tư thế cá nhân.
- Sau khi ngồi trở lại: Pi tự kiểm tra 3 khung hình SFace và chuyển `VERIFIED` nếu khuôn mặt thuộc UID đang gán.
- Không phải ngắt Firebase hoặc khóa đăng nhập Web; đó là khóa *phiên đo sức khỏe*.
- Pi tạo embedding trung bình từ 5 ảnh và ảnh JPEG Base64 112x112 lưu vào `face_templates/{uid}` (ảnh chụp cần sự đồng ý của người dùng).

## Bắt buộc đọc: trạng thái GitHub
So sánh với GitHub `main` commit `1de1f2e0b98035aa2ec81fe25a3a39a9f8bf2d60`.
Web hiện tại có hai nút thủ công đã được ẩn, nhưng `FaceControlPanel.tsx` còn effect gửi `VERIFY_FACE` và `LOGOUT_FACE` tự động từ telemetry. Hiệu ứng này phải bị bỏ để tránh đua lệnh và vòng chờ.

## Raspberry Pi: sao lưu và cài
Dừng chương trình Pi (Ctrl+C). Copy `OfficeHealth_Pi4_AutoFace_Sync_v2.zip` vào `~/Desktop/office_health/ver4/` (hoặc sửa đường dẫn tương ứng). Trong terminal Pi:

```bash
cd ~/Desktop/office_health/ver4
mkdir -p ~/office_health_backup_sync_v2/face
cp mainnew.py ~/office_health_backup_sync_v2/
cp face/face_controller.py face/face_engine.py ~/office_health_backup_sync_v2/face/
unzip -o ./OfficeHealth_Pi4_AutoFace_Sync_v2.zip -d .
python3 -m py_compile mainnew.py face/face_controller.py face/face_engine.py
python3 mainnew.py --headless --health-log --face-auth
```

ZIP trực tiếp chứa `mainnew.py` và `face/face_controller.py`, `face/face_engine.py`; KHÔNG thêm thư mục `ver4` lồng nhau.
Không xóa `serviceAccountKey.json` trong Pi và **không đưa khóa đó lên GitHub**. Nếu khóa từng bị commit công khai, phải thu hồi và thay khóa.

## Web: bỏ logic tự gửi command
Giải nén `OfficeHealth_Web_AutoFace_Sync_v2.zip` trên laptop rồi đặt script tại thư mục gốc repo Web (cùng cấp `package.json`). Chạy:

```bash
python3 patch_web_auto_face_sync_v2.py
npm run typecheck
npm run build
```

Web đã không còn nút Đăng nhập/Đăng xuất nhưng **chưa đủ**: phải tắt `useEffect` đang tự gọi `execute('VERIFY', true)` / `execute('LOGOUT', true)`.
Web vẫn giữ `watchFaceSession` để hiển thị tiến độ và nút `ENROLL_FACE` cùng ảnh JPEG.
Phải deploy lại Web lên nền tảng đang dùng. Git push không tự chứng minh deploy thành công.

## Kiểm thử một Pi hai UID
1. Admin gán `pi4_node_1` cho User1 thật (`devices/pi4_node_1/assignment/current.uid`).
2. User1 đăng ký 5/5; Firestore có `embedding` 128 số, `image` Base64. Không cần bấm xác thực: chờ Pi tự `VERIFIED`.
3. User1 đứng dậy >4 giây (YOLO phải trả `raw_status=STAND`) => `REVERIFY_REQUIRED`, HR/SpO2 khóa và userId=null.
4. User1 ngồi lại nhìn camera => `VERIFYING` 0/3 đến 3/3, `VERIFIED`.
5. Đi ra khỏi camera >6 giây hoặc khuôn mặt mất khỏi khung hình lâu => khóa tự động.
6. Admin chuyển sang User2; User1 mất quyền. Pi chỉ tự mở khi mặt khớp embedding của User2.
7. User1 xóa mẫu Face bằng Web: Pi phải nhận ra trong ~5 giây (khi mạng có kết nối), khóa và chờ đăng ký lại.
8. Ngắt camera/Firestore: Pi phải khóa dữ liệu, không xuất chỉ số cũ.

## Giới hạn / an toàn
- `STAND` đồng nghĩa rời phiên **chỉ ở chế độ demo**, không phù hợp nếu muốn thống kê bài tập đứng làm việc. Có thể tăng `FACE_STAND_SECONDS` hoặc vô hiệu hóa nhánh đứng cho production.
- Chỉ khóa tự động khi YOLO thực sự phát hiện `STAND`; với góc quay chỉ thấy nửa người trên, cần kiểm tra log để đánh giá độ chính xác.
- `face_controller.py` có watchdog phát hiện mất khuôn mặt ~8 giây nếu YOLO không nhận ra ABSENT.
- Chưa kiểm thử trên Raspberry Pi/hardware/Firebase thật. Các test dưới đây chỉ dùng mô phỏng.
- Firestore Rules cũ cho phép user chỉnh sửa `face_templates`: chưa đủ an toàn để sản xuất. Cần khóa quyền ghi embedding trước khi triển khai thật.
