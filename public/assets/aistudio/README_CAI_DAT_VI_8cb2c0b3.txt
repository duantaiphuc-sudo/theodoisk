OFFICE HEALTH — BẢN VÁ NHỎ WEB → TFT (GIỮ NGUYÊN AUTO FACE V3)
=================================================================

1) Hai mã bổ sung:
   - 3: Sai tư thế quá lâu; bộ đếm Web >= longIncorrectSec.
   - 4: Ngồi liên tục quá lâu; bộ đếm Web >= longSittingSec.
   Hai mã này KHÔNG phải hai trạng thái mới của YOLO Pose.

2) Raspberry Pi tiếp tục tự nhận diện/login/reverify bằng Auto Face V3;
   KHÔNG thay face/face_controller.py hoặc face/face_engine.py.
   Python chỉ xuất trạng thái tư thế gốc 0,1,2,5 (nếu đã hỗ trợ 5),
   KHÔNG tự đếm sai tư thế lâu. 3/4 chỉ là lớp chữ trên TFT.

3) Cài trên PI từ bản Auto Face V3 đang chạy ổn:
   - Dừng mainnew.py bằng Ctrl+C.
   - Chép 3 file trong thư mục pi/ vào
       /home/admin/Desktop/office_health/ver4/
     gồm apply_pi_tft_only.py, web_tft_alert.py, test_web_tft_alert.py
   - Chạy:
       cd ~/Desktop/office_health/ver4
       python3 apply_pi_tft_only.py
       python3 -m py_compile mainnew.py web_tft_alert.py
       python3 test_web_tft_alert.py
       python3 mainnew.py --headless --health-log --face-auth
   - Script tạo mainnew.py.backup_tft_only_YYYYMMDD_HHMMSS
   - Chỉ sửa mainnew.py, không sửa các file nhận diện Face.
   - Nếu mainnew.py đã có import web_tft_alert từ V5 cũ,
     script sẽ DỪNG mà không sửa tiếp.

4) Cài Web (nếu CHƯA áp dụng V5 cũ):
   - Chép 2 file trong web/ vào gốc repo theodoisk (cạnh package.json):
       apply_web_tft_only.py
       webTftAlertService.ts
   - Chạy:
       py -3 apply_web_tft_only.py       (Windows)
       npm run typecheck
       npm run build
   - Kiểm tra thay đổi firestore.rules, rồi deploy Rules đúng Firebase project:
       firebase deploy --only firestore:rules
   - Deploy website theo quy trình hiện có.
   - Script chỉ sửa src/App.tsx, firestore.rules và thêm
     src/services/webTftAlertService.ts.
   - KHÔNG sửa FaceControlPanel.tsx, bộ đếm Web, tính năng login.
   - Script tạo hai file .backup_tft_only_... cho App.tsx và rules.

5) Firestore:
     devices/pi4_node_1/web_display/current
       uid                = UID của người dùng
       assignment_id      = ID lần gán thiết bị
       status_code        = 0 / 3 / 4
       base_posture_status= 0 / 1
       updated_at         = server timestamp
   Không truyền số giây, giờ, dữ liệu sức khỏe hoặc vector sinh trắc.
   TFT bỏ qua cảnh báo không khớp UID/lần gán, phiên bị khóa,
   sai trạng thái camera hoặc quá thời hạn ~18 giây.

6) Nếu đã áp dụng Web V5 cũ:
   - KHÔNG chạy patch này chồng lên.
   - Khôi phục từ file .backup_web_tft_v5_* tạo trước khi chạy V5,
     rồi mới áp dụng patch nhỏ (nếu muốn giữ nguyên login Web).

7) Khôi phục PI:
   - Dừng chương trình, copy lại file mainnew.py.backup_tft_only_...
   - Có thể để nguyên web_tft_alert.py (không được import thì không chạy).

LƯU Ý:
- Đã chạy py_compile Python và test mô phỏng mã 3/4, TTL, UID, session.
- Chưa kiểm thử thực tế Pi/camera/TFT/Firestore, chưa build Web trong repo của bạn.
- Không gộp các thư mục zip con rồi unzip đè vào code; chỉ chép file cần thiết.
