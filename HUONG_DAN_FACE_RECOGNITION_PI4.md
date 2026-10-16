# TÀI LIỆU HƯỚNG DẪN TÍCH HỢP QUÉT KHUÔN MẶT (YUNET + SFACE) CHO RASPBERRY PI 4
**Dự án:** Office Health System (THEODOISK Ver5)  
**Mục tiêu:** Dành cho lập trình viên phần cứng / Raspberry Pi 4 đọc và triển khai tiếp module Face Recognition kết nối Firebase Firestore.

---

## PHẦN 1. NHỮNG GÌ ĐÃ ĐƯỢC THIẾT LẬP SẴN TRÊN CLOUD & REPO

Hệ thống Cloud và Web đã chuẩn bị xong 100% hạ tầng cho tính năng khuôn mặt:

### 1. Cấu trúc Firestore Collection: `face_templates`
- **Tên Collection:** `face_templates`
- **Document ID:** Chính là `UID` của người dùng trên Firebase Authentication (ví dụ: `vJ8dK2x90abc...`, **không** dùng email).
- **Cấu trúc trường dữ liệu (Schema):**
  ```json
  {
    "userId": "UID_CUA_NGUOI_DUNG",
    "model": "opencv_sface_2021dec",
    "schema_version": 1,
    "sample_count": 5,
    "embedding": [-0.0412, 0.0891, ..., 0.0521], // Mảng 128 số float32
    "enabled": true,
    "updated_at": "Timestamp"
  }
  ```

### 2. Firestore Security Rules đã Deploy lên Project `theodoisk-66ddb`
Đã triển khai luật bảo mật phân quyền (RBAC) trực tiếp lên Firebase:
- Raspberry Pi (dùng `serviceAccountKey.json` Admin SDK) có toàn quyền đọc/ghi.
- Người dùng trên web chỉ được đọc mẫu của chính mình (`request.auth.uid == userId`).
- Nghiêm cấm client thông thường liệt kê (list) hoặc quét trộm vector khuôn mặt của tài khoản khác.

### 3. Công cụ Script có sẵn trong repo: `scripts/upload_face_template.py`
Công cụ viết bằng Python giúp đọc file `test_user.json` (chứa 128 số) và tự động đẩy lên Firestore collection `face_templates/{userId}` chỉ bằng 1 dòng lệnh.

### 4. Đã fix lỗi ngắt kết nối Camera trên Web Dashboard
Khi rút camera USB trên Pi 4, Pi gửi mã `-1` (`STATUS_UNKNOWN`) và nhãn `"Lỗi AI"`. Web hiện tại đã nhận diện đúng trạng thái lỗi phần cứng (`Lỗi kết nối Camera AI`) mà **không bị mất kết nối** hay nhảy về trạng thái chờ rỗng.

---

## PHẦN 2. NHỮNG VIỆC PARTNER CẦN LÀM TRÊN RASPBERRY PI 4

Quy trình gồm 4 bước cụ thể sau:

---

### BƯỚC 1: Lấy User UID trên Firebase Authentication
1. Mở [Firebase Console](https://console.firebase.google.com/) → Chọn dự án **theodoisk-66ddb**.
2. Chọn menu **Authentication** → tab **Users**.
3. Chọn tài khoản của bạn (ví dụ: `nhanvien@example.com` hoặc `duantaiphuc@gmail.com`).
4. Sao chép chuỗi **User UID** (cột đầu tiên, ví dụ: `dK8z91La0...`).

---

### BƯỚC 2: Đẩy file mẫu `test_user.json` lên Firestore
Trên Raspberry Pi (hoặc máy tính có sẵn file `serviceAccountKey.json`), mở terminal chạy lệnh sau:

```bash
python3 scripts/upload_face_template.py \
  --uid "DIEN_UID_LAY_O_BUOC_1_VAO_DAY" \
  --template "/home/admin/Desktop/office_health/face/templates/test_user.json" \
  --key "serviceAccountKey.json"
```

*Kết quả in ra thành công:*
```text
============================================================
THEODOISK - ĐỒNG BỘ MẪU KHUÔN MẶT LÊN FIRESTORE
============================================================
• Target UID     : dK8z91La0...
• Template File  : .../test_user.json
• Số chiều vector: 128 dimensions
✅ THÀNH CÔNG: Đã lưu mẫu khuôn mặt vào Firestore!
   Collection : face_templates
   Document ID: dK8z91La0...
```

Sau bước này, trên Firestore đã có sẵn vector mẫu của người dùng.

---

### BƯỚC 3: Tạo file tải mẫu khuôn mặt trên Pi 4 (`face_manager.py`)
Tạo file `/home/admin/Desktop/office_health/face/face_manager.py` với mã nguồn hoàn chỉnh dưới đây:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
face_manager.py
===============
Quản lý mẫu khuôn mặt từ Firebase Firestore và tính toán so khớp vector SFace 128D.
"""

import numpy as np
import firebase_admin
from firebase_admin import credentials, firestore


class FaceTemplateManager:
    def __init__(self, key_path="serviceAccountKey.json"):
        if not firebase_admin._apps:
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred)
        self.db = firestore.client()
        self.active_template = None
        self.active_uid = None

    def fetch_template(self, user_uid: str):
        """Tải vector 128D của người dùng từ Firestore"""
        try:
            doc_ref = self.db.collection("face_templates").document(user_uid)
            doc = doc_ref.get()

            if not doc.exists:
                print(f"[FACE] ⚠️ Không tìm thấy mẫu cho UID: {user_uid}")
                return None

            data = doc.to_dict()
            if not data.get("enabled", True):
                print(f"[FACE] ⚠️ Mẫu khuôn mặt UID {user_uid} đang bị tắt (disabled).")
                return None

            raw_vec = data.get("embedding", [])
            if len(raw_vec) != 128:
                print(f"[FACE] ❌ Vector lỗi: kích thước {len(raw_vec)} != 128.")
                return None

            vec = np.array(raw_vec, dtype=np.float32)

            # Chuẩn hóa L2 norm để so khớp Cosine nhanh
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm

            self.active_template = vec
            self.active_uid = user_uid
            print(f"[FACE] ✅ Đã nạp thành công mẫu khuôn mặt UID: {user_uid}")
            return vec

        except Exception as e:
            print(f"[FACE] ❌ Lỗi kết nối Firestore: {e}")
            return None

    def compare_cosine(self, query_vec, threshold=0.72):
        """
        So sánh vector trích xuất từ camera với vector mẫu đã nạp.
        Trả về: (is_match: bool, score: float)
        """
        if self.active_template is None or query_vec is None:
            return False, 0.0

        q = np.array(query_vec, dtype=np.float32)
        norm_q = np.linalg.norm(q)
        if norm_q > 0:
            q = q / norm_q

        # Phép nhân vô hướng (Dot product) của 2 vector đã chuẩn hóa L2 chính là Cosine Similarity
        score = float(np.dot(self.active_template, q))
        is_match = score >= threshold

        return is_match, score
```

---

### BƯỚC 4: Tích hợp vào Luồng Hoạt Động (State Machine) trên Pi 4

#### Chiến lược tối ưu CPU (RẤT QUAN TRỌNG TRÊN RASPBERRY PI 4)
- **KHÔNG chạy YuNet + SFace ở mọi khung hình:** Chạy nhận diện khuôn mặt liên tục sẽ làm nóng CPU và tụt FPS của YOLO11-Pose.
- **Chỉ kích hoạt Quét khuôn mặt trong 2 trường hợp:**
  1. **Lúc khởi động hệ thống:** Quét khuôn mặt để xác thực danh tính nhân viên bắt đầu phiên làm việc.
  2. **Khi chuyển trạng thái từ VẮNG MẶT (`ABSENT`) quay lại ghế:** Nếu nhân viên rời khỏi bàn (quá 30 giây) rồi quay lại, hệ thống quét mặt lại để đảm bảo đúng chủ nhân, tránh trường hợp người khác ngồi vào máy.
- **Khi đã nhận diện thành công:** Khóa phiên (Session Verified), chuyển toàn bộ tài nguyên CPU cho luồng theo dõi tư thế (`posture_worker2.py`) và nhịp tim (`health_worker.py`).

#### Ngưỡng nhận diện khuyến nghị cho SFace:
- `threshold = 0.72` (An toàn, chống nhận nhầm đồng nghiệp trong văn phòng).
- Điểm test của bạn đạt `0.77 - 0.83` là hoàn toàn vượt ngưỡng an toàn này.

---

## PHẦN 3. BẢNG TỔNG HỢP KIỂM TRA (CHECKLIST)

| Hạng mục | Vị trí | Trạng thái |
| :--- | :--- | :--- |
| **Firestore Collection** | `face_templates/{userId}` | Đã thiết lập schema chuẩn |
| **Security Rules** | `firestore.rules` | Đã deploy lên Firebase `theodoisk-66ddb` |
| **Script tải mẫu** | `scripts/upload_face_template.py` | Sẵn sàng chạy bằng lệnh |
| **Dịch vụ Web Service** | `src/services/faceService.ts` | Đã tích hợp vào ứng dụng React |
| **Độ nhạy ngắt camera** | `src/components/MetricCards.tsx` | Đã fix hiển thị đúng "Lỗi kết nối Camera AI" |
| **Code trên Pi 4** | `face/face_manager.py` | Partner chỉ cần copy code ở Bước 3 vào chạy |

---
*Tài liệu được tạo tự động cho nhóm phát triển dự án Office Health IoT - Raspberry Pi 4.*
