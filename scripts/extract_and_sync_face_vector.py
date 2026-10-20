#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
extract_and_sync_face_vector.py
===============================
Công cụ tự động trích xuất vector đặc trưng 128 chiều (YuNet + SFace)
từ ảnh chụp Base64 trên Firestore và cập nhật lại trường 'embedding'
cho Raspberry Pi 4 nhận diện.

Cách dùng:
    python3 scripts/extract_and_sync_face_vector.py --uid <FIREBASE_USER_UID>
    Hoặc chạy chế độ daemon lắng nghe tự động:
    python3 scripts/extract_and_sync_face_vector.py --listen

Yêu cầu:
    pip install firebase-admin opencv-python numpy
"""

import argparse
import base64
import os
import sys
import time
import numpy as np

try:
    import cv2
except ImportError:
    print("❌ Lỗi: Chưa cài đặt opencv-python. Chạy lệnh: pip install opencv-python")
    sys.exit(1)

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("❌ Lỗi: Chưa cài đặt firebase-admin. Chạy lệnh: pip install firebase-admin")
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Extract SFace 128D embedding from Firestore Base64 image")
    parser.add_argument("--uid", default=None, help="User UID cần xử lý (ví dụ: dK8z91La0...)")
    parser.add_argument("--key", default="serviceAccountKey.json", help="Đường dẫn file serviceAccountKey.json")
    parser.add_argument("--yunet", default="face_detection_yunet_2023mar.onnx", help="Đường dẫn file model YuNet ONNX")
    parser.add_argument("--sface", default="face_recognition_sface_2021dec.onnx", help="Đường dẫn file model SFace ONNX")
    parser.add_argument("--listen", action="store_true", help="Chạy chế độ nền tự động đồng bộ khi có ảnh mới")
    return parser.parse_args()


def init_firebase(key_path: str):
    if not firebase_admin._apps:
        if not os.path.isfile(key_path):
            raise FileNotFoundError(f"Không tìm thấy service account key tại: {key_path}")
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()


def decode_base64_image(b64_str: str):
    if not b64_str:
        return None
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    img_bytes = base64.b64decode(b64_str)
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img


def get_face_models(yunet_path: str, sface_path: str):
    # Tìm kiếm model trong các thư mục phổ biến nếu đường dẫn mặc định không tồn tại
    search_dirs = [
        ".",
        "ver4",
        "face",
        "/home/admin/Desktop/office_health/face",
        "/home/admin/Desktop/office_health/models"
    ]

    def resolve_model(filename):
        if os.path.isfile(filename):
            return filename
        for d in search_dirs:
            candidate = os.path.join(d, filename)
            if os.path.isfile(candidate):
                return candidate
        return filename

    y_path = resolve_model(yunet_path)
    s_path = resolve_model(sface_path)

    if not os.path.isfile(y_path) or not os.path.isfile(s_path):
        print(f"⚠️ Cảnh báo: Không tìm thấy file model ONNX ({y_path} hoặc {s_path}).")
        return None, None

    detector = cv2.FaceDetectorYN.create(y_path, "", (320, 320), 0.6, 0.3, 5000)
    recognizer = cv2.FaceRecognizerSF.create(s_path, "")
    return detector, recognizer


def extract_embedding_from_image(img, detector, recognizer):
    if img is None or detector is None or recognizer is None:
        return None

    h, w, _ = img.shape
    detector.setInputSize((w, h))
    _, faces = detector.detect(img)

    if faces is None or len(faces) == 0:
        print("❌ Không phát hiện khuôn mặt trong ảnh.")
        return None

    # Lấy khuôn mặt có diện tích lớn nhất (gần camera nhất)
    best_face = faces[0]
    if len(faces) > 1:
        best_face = max(faces, key=lambda f: f[2] * f[3])

    # Căn chỉnh khuôn mặt (Align crop)
    aligned_face = recognizer.alignCrop(img, best_face)
    # Trích xuất vector đặc trưng 128 số float
    feature = recognizer.feature(aligned_face)
    embedding = feature.flatten().tolist()
    return embedding


def process_user_template(db, uid: str, detector, recognizer):
    doc_ref = db.collection("face_templates").document(uid)
    snap = doc_ref.get()

    if not snap.exists:
        print(f"⚠️ Không tìm thấy document face_templates/{uid}")
        return False

    data = snap.to_dict()
    embedding = data.get("embedding", [])
    if isinstance(embedding, list) and len(embedding) == 128:
        print(f"✅ UID [{uid}] đã có sẵn vector 128 chiều hợp lệ.")
        return True

    image_b64 = data.get("image") or data.get("snapshot") or data.get("photo_url")
    if not image_b64:
        print(f"❌ UID [{uid}] chưa có ảnh mẫu Base64 trong Firestore.")
        return False

    img = decode_base64_image(image_b64)
    if img is None:
        print(f"❌ Không thể giải mã ảnh Base64 của UID [{uid}].")
        return False

    print(f"🔄 Đang trích xuất vector SFace 128 chiều cho UID: {uid} ...")
    vec = extract_embedding_from_image(img, detector, recognizer)
    if not vec or len(vec) != 128:
        print("❌ Trích xuất vector thất bại.")
        return False

    doc_ref.set({
        "embedding": vec,
        "sample_count": 1,
        "model": "opencv_sface_2021dec",
        "schema_version": 1,
        "enabled": True,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }, merge=True)

    print(f"🎉 THÀNH CÔNG: Đã tạo và lưu vector 128D cho UID [{uid}] lên Firestore!")
    return True


def main():
    args = parse_args()
    print("=" * 60)
    print("THEODOISK - TRÍCH XUẤT VECTOR 128D SFACE TỪ ẢNH FIRESTORE")
    print("=" * 60)

    try:
        db = init_firebase(args.key)
        detector, recognizer = get_face_models(args.yunet, args.sface)

        if detector is None or recognizer is None:
            print("❌ Không thể khởi tạo mô hình nhận diện khuôn mặt OpenCV.")
            sys.exit(1)

        if args.uid:
            process_user_template(db, args.uid.strip(), detector, recognizer)
        elif args.listen:
            print("🚀 Đang lắng nghe Firestore collection 'face_templates'...")
            while True:
                docs = db.collection("face_templates").stream()
                for d in docs:
                    d_data = d.to_dict()
                    emb = d_data.get("embedding", [])
                    img_str = d_data.get("image") or d_data.get("snapshot")
                    if img_str and (not emb or len(emb) != 128):
                        print(f"⚡ Phát hiện mẫu mới chưa có vector: {d.id}")
                        process_user_template(db, d.id, detector, recognizer)
                time.sleep(5)
        else:
            print("Vui lòng chỉ định --uid <USER_UID> hoặc --listen")

    except Exception as e:
        print(f"❌ Lỗi: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
