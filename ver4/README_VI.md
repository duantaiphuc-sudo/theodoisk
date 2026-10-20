# Office Health V8 – lọc nhiễu tư thế 30 giây

Gói này được tạo từ bản **Office Health V8 – HR tin cậy + ST7789 + Firebase**. Các thay đổi chủ yếu nằm ở `mainnew.py` và file mới `posture_stabilizer.py`.

## Mục đích

Đầu ra tư thế AI có thể dao động giữa GOOD/BAD vì vài frame nhiễu, đặc biệt khi Raspberry Pi 4 quá tải hoặc keypoint kém. Mục tiêu là **cảnh báo dựa trên tư thế được xác nhận theo thời gian**, chứ không theo từng frame.

| Tình huống | Trạng thái được công bố |
|---|---|
| Đang bắt đầu theo dõi, chưa đủ dữ liệu | `VERIFYING` – “Đang xác nhận tư thế” |
| GOOD liên tục / chiếm >=80% trong >=4 giây | `GOOD` |
| BAD đủ >=30 giây kể từ khi bắt đầu có dấu hiệu sai, chiếm >=85% thời lượng trong cửa sổ 30 giây | `BAD` |
| Đang BAD, chỉ lóe GOOD 1–2 frame | Vẫn `BAD` |
| Đang GOOD, chỉ lóe BAD 1–2 frame | Vẫn `GOOD` |
| Đang BAD, tín hiệu GOOD phục hồi >=8 giây và chiếm >=85% cửa sổ 8 giây | `GOOD` |
| Không thấy người / đứng / ngoài vùng trên 1,5 giây | Chuyển sang trạng thái vắng/đứng tương ứng, xóa lịch sử ngồi |
| Camera/AI báo ERROR hoặc stale | Hủy cảnh báo tư thế cũ ngay, về `ERROR` |

Các ngưỡng có thể thay trong constructor `PostureStabilizer` (file `posture_stabilizer.py`), ví dụ `bad_window=30.0`, `bad_fraction=0.85`, `recovery_window=8.0`.

Thuật toán dùng `time.monotonic()` và thời lượng có trọng số, **không đếm số frame cố định**, do FPS YOLO thực tế có thể thay đổi. Dữ liệu bị gián đoạn >1,5 giây không được coi là bằng chứng ngồi liên tục.

## Ảnh hưởng với hệ thống

- `mainnew.py` đọc trạng thái thô `raw_status` từ `posture_worker2.py` nếu được cung cấp; nếu không, dùng `status` sẵn có. Không đổi SVM/YOLO/keypoint.
- `draw_ui(...)` của camera được nhận cùng trạng thái đã lọc với Firebase và ST7789 thông qua `PostureDisplayView`, nhưng vẫn có thể hiện `Raw Pred` để chẩn đoán nếu giao diện worker có dòng đó.
- Firebase tiếp tục dùng schema cũ: GOOD=0, BAD=1, AWAY=2, BAD lâu=3, UNKNOWN=-1. `VERIFYING` được gửi dưới dạng `posture_status=-1`, `posture_label='Đang xác nhận tư thế'`.
- Bộ đếm BAD lâu 120 giây chỉ bắt đầu khi `BAD` được **xác nhận**, và không bị reset bởi vài frame GOOD lẻ. Tổng thời gian từ lúc mới ngồi sai đến BAD lâu vì vậy có thể là ~150 giây (30 + 120).
- **Chưa tối ưu tần suất ghi Firebase**: vẫn có thể gửi khoảng mỗi 1,5 giây theo chương trình V8 hiện hành. Đó là việc tối ưu tiếp theo nếu cần; giá trị `posture_status` đã ổn định hơn.
- **Không đổi** thuật toán MAX30102 V8, HR tin cậy, SpO2, HealthSampler, ST7789 hay FirebaseManager. Các file tương ứng giữ nguyên byte-for-byte so với gói V8 trước.
- Gói **không chứa** `posture_worker2.py`, `firebase_manager.py`, mô hình YOLO/SVM hay credentials. Phải tiếp tục dùng các file đang hoạt động trên Pi. Vì không có bản `posture_worker2.py` đang chạy trong gói, tích hợp được kiểm tra bằng mô phỏng; cần thử thực tế với đầu ra `raw_status` từ worker của bạn.

## Cài đặt ở thư mục `ver3`

1. Dừng `mainnew.py` bằng Ctrl+C. Đừng chạy hai bản main cùng lúc.
2. Chuyển `office_health_V8_posture_30s.zip` vào `~/Downloads` trên Raspberry Pi.
3. Chạy:

```bash
cd ~/Desktop/office_health/ver3
mkdir -p backup_before_posture_30s
cp mainnew.py backup_before_posture_30s/

unzip -o ~/Downloads/office_health_V8_posture_30s.zip -d ~/Downloads
SRC=~/Downloads/office_health_V8_posture_30s
cp "$SRC/mainnew.py" .
cp "$SRC/posture_stabilizer.py" .
cp "$SRC/test_posture_stabilizer.py" .

python3 -m py_compile mainnew.py posture_stabilizer.py
python3 test_posture_stabilizer.py
python3 mainnew.py --headless --health-log
```

Nếu muốn mở GUI OpenCV trên desktop thay `--headless` bằng `--gui`. Màn ST7789 vẫn chạy khi dùng `--headless`.

**Không sao chép lại `ppg_processor.py`, `health_worker.py` hoặc `max30102.py` nếu bạn đã dùng bản V8 ổn định.** Hai file thực sự cần thay/chép là `mainnew.py` và `posture_stabilizer.py`.

## Kiểm tra log

Khi tư thế thay đổi sau bộ lọc, terminal in một dòng (không in liên tục mỗi frame):

```text
POSTURE: START -> VERIFYING | raw=BAD | BAD30=0% | GOOD8=0%
POSTURE: VERIFYING -> BAD | raw=BAD | BAD30=99% | GOOD8=0%
POSTURE: BAD -> GOOD | raw=GOOD | BAD30=73% | GOOD8=100%
```

Cần theo dõi trạng thái trên **camera, ST7789, Firebase**. Trong vòng 30 giây liên tục sai với 1–2 frame đúng, đầu ra vẫn `BAD`. Khi cố tình ngồi đúng để phục hồi khoảng 8 giây, đầu ra mới đổi về `GOOD`.

Để quay lại code chính trước đó:

```bash
cd ~/Desktop/office_health/ver3
cp backup_before_posture_30s/mainnew.py .
```

## Kiểm thử

- 10 bài kiểm thử bộ lọc (gián đoạn camera, jitter, 30 s BAD có 2 frame GOOD, phục hồi, vắng người, tốc độ lấy mẫu biến đổi, v.v.).
- Một bài smoke test ánh xạ `posture_to_schema`/giao diện giả lập.
- Kiểm tra cú pháp Python.
- **Chưa chạy trực tiếp trên Raspberry Pi thật.**
