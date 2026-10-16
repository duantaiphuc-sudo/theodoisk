import React, { useState } from 'react';
import { X, Cpu, Copy, Check, Terminal, FileCode } from 'lucide-react';

interface RaspberryPiGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export const RaspberryPiGuideModal: React.FC<RaspberryPiGuideModalProps> = ({
  isOpen,
  onClose,
  projectId,
}) => {
  const [copiedScript, setCopiedScript] = useState(false);
  const [activeTab, setActiveTab] = useState<'firestore' | 'camera' | 'rtdb' | 'wiring'>('camera');

  if (!isOpen) return null;

  const pythonCameraCode = `# ==========================================================
# TRUYỀN HÌNH ẢNH CAMERA & DỮ LIỆU TỪ RASPBERRY PI 4 -> FIREBASE
# Thư viện: pip install firebase-admin opencv-python
# ==========================================================
import cv2
import base64
import time
import datetime
import firebase_admin
from firebase_admin import credentials, firestore

# 1. Khởi tạo Firebase Admin SDK
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred, {
    'projectId': '${projectId || 'theodoisk-66ddb'}'
})
db = firestore.client()

# 2. Khởi tạo Camera (USB Webcam hoặc CSI Camera trên Pi 4)
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

print("📷 Đang đọc camera và gửi ảnh trực tiếp lên Firebase '${projectId || 'theodoisk-66ddb'}'...")

try:
    while True:
        ret, frame = cap.read()
        if not ret:
            print("⚠️ Không đọc được khung hình camera")
            time.sleep(1)
            continue

        # Resize ảnh nhỏ (320x240 hoặc 400x300) để truyền siêu nhanh qua mạng, dung lượng ~10-15KB
        small_frame = cv2.resize(frame, (320, 240))

        # (Tùy chọn) Vẽ thêm khung xương MediaPipe hoặc chữ thời gian lên ảnh
        cv2.putText(small_frame, datetime.datetime.now().strftime("%H:%M:%S"), 
                    (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        # Nén ảnh JPEG ở mức chất lượng 50% (đẹp rõ nét mà file cực nhẹ)
        _, buffer = cv2.imencode('.jpg', small_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 50])

        # Mã hóa Base64 Data URL để trình duyệt web hiển thị trực tiếp
        img_base64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')

        now_iso = datetime.datetime.utcnow().isoformat() + "Z"

        # Gói tin tổng hợp gồm hình ảnh + nhịp tim + SpO2 + tư thế
        payload = {
            "bpm": 75,                    # Thay bằng giá trị đọc từ MAX30102
            "spo2": 98.2,                 # Thay bằng giá trị đọc từ MAX30102
            "posture_status": 0,          # 0: Đúng, 1: Sai, 2: Vắng
            "tracking_active": True,
            "in_zone": True,
            "timestamp": now_iso,
            "device": "Raspberry Pi 4",
            "image": img_base64           # <-- Chuỗi ảnh Base64 hiển thị lên Web!
        }

        # Ghi vào document của collection devices
        doc_ref = db.collection("devices").document("pi4_node_1")
        doc_ref.set(payload, merge=True)

        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 📸 Đã gửi ảnh camera ({len(buffer)/1024:.1f} KB) & nhịp tim!")
        time.sleep(1.0)  # Cập nhật ảnh mỗi 1 giây

except KeyboardInterrupt:
    cap.release()
    print("\\n🛑 Đã dừng camera.")
`;

  const pythonFirestoreCode = `# ==========================================================
# HỆ THỐNG GIÁM SÁT SỨC KHỎE & TƯ THẾ (mainnew.py - V8)
# Pipeline:
#   - USB Webcam -> YOLO11n-Pose ONNX + 7-feature SVM -> Posture Snapshot
#   - MAX30102 -> V8 PPGProcessor (BPM / SpO2)
#   - FirebaseManager -> devices/pi4_node_1 (Metadata & Vitals only, no video upload)
# Dự án Firebase: ${projectId || 'theodoisk-66ddb'}
# ==========================================================

import time
import datetime
import firebase_admin
from firebase_admin import credentials, firestore

# 1. Khởi tạo Firebase Admin SDK
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred, {
    'projectId': '${projectId || 'theodoisk-66ddb'}'
})

db = firestore.client()

print("🚀 Đang chạy bộ đẩy dữ liệu từ Raspberry Pi 4 lên Firebase 'devices/pi4_node_1'...")

try:
    while True:
        # Cấu trúc gói tin chuẩn gửi lên Firestore từ mainnew.py:
        payload = {
            "bpm": 75.0,                  # 0.0 khi đang đo/chưa đặt ngón tay, số thực khi xác nhận
            "heart_rate": 75.0,           # Đồng bộ cùng giá trị BPM V8
            "spo2": 98.2,                 # 0.0 khi chưa đo, số thực khi xác nhận
            "posture_status": 0,          # 0: Đúng, 1: Sai, 2: Vắng/Đứng, 3: Sai lâu, -1: Đang xác nhận
            "posture_label": "Đúng",      # "Đúng", "Sai tư thế", "Sai tư thế lâu", "Đứng / Không ngồi"
            "is_in_zone": True,
            "tracking_active": True,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
        }

        # Ghi vào document 'pi4_node_1' của collection 'devices'
        doc_ref = db.collection("devices").document("pi4_node_1")
        doc_ref.set(payload, merge=True)

        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] ✅ Đã cập nhật Firestore: BPM={payload['bpm']}, SpO2={payload['spo2']}%, Posture={payload['posture_label']}")
        time.sleep(1.5)

except KeyboardInterrupt:
    print("\\n🛑 Dừng chương trình Raspberry Pi 4.")
`;

  const pythonRtdbCode = `# ==========================================================
# RASPBERRY PI 4 -> FIREBASE REALTIME DATABASE
# Thư viện: pip install requests
# ==========================================================
import requests
import json
import time
from datetime import datetime

DATABASE_URL = "https://${projectId || 'theodoisk-66ddb'}-default-rtdb.firebaseio.com/theodoisk.json"

print("📡 Đang gửi dữ liệu từ Raspberry Pi 4 qua REST API...")

while True:
    data = {
        "bpm": 76,
        "spo2": 98.5,
        "posture_status": 0,
        "tracking_active": True,
        "in_zone": True,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "device": "Raspberry Pi 4"
    }

    try:
        response = requests.put(DATABASE_URL, json=data, timeout=3)
        if response.status_code == 200:
            print("✅ Đã cập nhật Realtime Database:", data["bpm"], "BPM")
    except Exception as e:
        print("❌ Lỗi kết nối:", e)

    time.sleep(1.5)
`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Hướng Dẫn Kết Nối Raspberry Pi 4 & Firebase</h3>
              <p className="text-xs text-slate-500">Cách cài đặt code Python đẩy dữ liệu lên dự án <span className="text-sky-700 font-mono font-bold">{projectId || 'theodoisk'}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('camera')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'camera'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            📷 Truyền ảnh Camera (OpenCV)
          </button>
          <button
            onClick={() => setActiveTab('firestore')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'firestore'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Python (Firestore Cơ Bản)
          </button>
          <button
            onClick={() => setActiveTab('rtdb')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'rtdb'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Python (Realtime DB)
          </button>
          <button
            onClick={() => setActiveTab('wiring')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'wiring'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Sơ đồ đấu dây cảm biến
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'camera' && (
            <>
              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-slate-700 leading-relaxed">
                <div className="font-bold text-sky-800 mb-1 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4" /> Cách truyền hình ảnh trực tiếp từ Raspberry Pi 4 lên Web:
                </div>
                <p className="text-slate-600 mt-1">
                  1. Camera Pi 4 chụp khung hình bằng <b>OpenCV</b>.
                  <br />
                  2. Resize ảnh về kích thước nhỏ <code className="text-amber-800 bg-white px-1 rounded font-mono font-bold">320x240</code> và nén JPEG chất lượng 50% (Dung lượng mỗi ảnh chỉ <b>~10KB - 15KB</b>, gửi mượt mà qua mạng Internet mà không tốn băng thông).
                  <br />
                  3. Mã hóa chuỗi Base64 và đặt vào trường <code className="text-emerald-700 bg-white px-1 rounded font-mono font-bold">"image"</code> trong tài liệu Firestore <code className="text-sky-700 bg-white px-1 rounded font-mono font-bold">devices/pi4_node_1</code>.
                  <br />
                  4. Giao diện Web tự động bắt sự kiện và hiển thị ảnh trực tiếp theo thời gian thực!
                </p>
                <div className="mt-2 font-mono text-[11px] bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-emerald-400">
                  pip install firebase-admin opencv-python
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <FileCode className="w-4 h-4 text-sky-600" />
                    Mã nguồn Python gửi Ảnh Camera & Cảm biến (send_camera_telemetry.py):
                  </span>
                  <button
                    onClick={() => handleCopy(pythonCameraCode)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 text-[11px] transition border border-slate-200 cursor-pointer font-medium"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedScript ? 'Đã sao chép' : 'Sao chép mã'}</span>
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-200 overflow-x-auto max-h-[340px] leading-relaxed">
                  {pythonCameraCode}
                </pre>
              </div>
            </>
          )}

          {activeTab === 'firestore' && (
            <>
              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-slate-700 leading-relaxed">
                <div className="font-bold text-sky-800 mb-1 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4" /> 1. Cài đặt thư viện trên Raspberry Pi 4:
                </div>
                <code className="block bg-slate-900 px-3 py-1.5 rounded-lg text-emerald-400 font-mono text-[11px] my-1 border border-slate-800">
                  pip install firebase-admin opencv-python mediapipe
                </code>
                <span>
                  Lấy file key từ <b>Firebase Console → Project Settings → Service Accounts → Generate new private key</b> và lưu tên là <code className="text-amber-800 bg-white px-1 rounded font-mono font-bold">serviceAccountKey.json</code> cùng thư mục với file script.
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <FileCode className="w-4 h-4 text-sky-600" />
                    Mã nguồn Python cho Raspberry Pi 4 (rpi_publisher.py):
                  </span>
                  <button
                    onClick={() => handleCopy(pythonFirestoreCode)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition cursor-pointer font-medium"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedScript ? 'Đã sao chép' : 'Sao chép mã'}</span>
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[280px]">
                  {pythonFirestoreCode}
                </pre>
              </div>
            </>
          )}

          {activeTab === 'rtdb' && (
            <>
              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-slate-700">
                <p>
                  Cách dùng REST API đơn giản nhất: Không cần cài thư viện phức tạp, chỉ cần lệnh <code className="text-emerald-700 bg-white px-1 rounded font-mono font-bold">requests.put</code> là dữ liệu nhảy thẳng lên web!
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800">Mã Python REST API:</span>
                  <button
                    onClick={() => handleCopy(pythonRtdbCode)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition cursor-pointer font-medium"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedScript ? 'Đã sao chép' : 'Sao chép mã'}</span>
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[280px]">
                  {pythonRtdbCode}
                </pre>
              </div>
            </>
          )}

          {activeTab === 'wiring' && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="font-bold text-sky-800 text-sm">Sơ đồ nối chân Cảm biến MAX30102 với Raspberry Pi 4:</h4>
                <div className="grid grid-cols-2 gap-2 text-slate-700 font-mono text-[11px]">
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <span className="text-amber-700 font-bold">VIN (VCC)</span> → Chân Pin 1 (3.3V)
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <span className="text-slate-600 font-bold">GND</span> → Chân Pin 6 hoặc Pin 9 (GND)
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <span className="text-sky-700 font-bold">SDA</span> → Chân Pin 3 (GPIO 2 - I2C1 SDA)
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <span className="text-emerald-700 font-bold">SCL</span> → Chân Pin 5 (GPIO 3 - I2C1 SCL)
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 pt-1">
                  💡 Nhớ bật giao tiếp I2C trên Raspberry Pi bằng lệnh: <code className="text-amber-800 bg-white px-1 rounded font-mono font-bold">sudo raspi-config → Interface Options → I2C → Enable</code>
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="font-bold text-sky-800 text-sm">Camera Raspberry Pi hoặc ESP32-CAM:</h4>
                <p className="text-slate-600 leading-relaxed">
                  Cắm camera vào cổng CSI trên Raspberry Pi 4. Sử dụng MediaPipe Pose Landmarks để tính góc nghiêng giữa mũi, tai, vai và thắt lưng. Khi góc cúi quá 30°, gán mã tư thế là <code className="text-rose-700 bg-white px-1 rounded font-mono font-bold">1 (Tư thế Sai)</code>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-xs cursor-pointer"
          >
            Đã Hiểu
          </button>
        </div>
      </div>
    </div>
  );
};
