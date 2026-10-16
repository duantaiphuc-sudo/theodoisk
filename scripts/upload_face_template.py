#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
upload_face_template.py
=======================
Công cụ đồng bộ vector embedding khuôn mặt (YuNet + SFace 128D)
lên Firestore collection 'face_templates/{userId}'.

Cách dùng:
    python3 upload_face_template.py --uid <FIREBASE_USER_UID> --template <DUONG_DAN_FILE_JSON>

Ví dụ:
    python3 upload_face_template.py --uid abc123xyz456 --template /home/admin/Desktop/office_health/face/templates/test_user.json
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("❌ Lỗi: Chưa cài đặt thư viện firebase-admin.")
    print("Chạy lệnh: pip install firebase-admin")
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Upload face embedding template to Firestore")
    parser.add_argument("--uid", required=True, help="User UID trên Firebase Authentication")
    parser.add_argument("--template", required=True, help="Đường dẫn file JSON chứa vector embedding (128 số)")
    parser.add_argument("--key", default="serviceAccountKey.json", help="Đường dẫn file serviceAccountKey.json (mặc định: serviceAccountKey.json)")
    parser.add_argument("--model", default="opencv_sface_2021dec", help="Tên model nhận diện (mặc định: opencv_sface_2021dec)")
    return parser.parse_args()


def load_template(json_path: str):
    if not os.path.isfile(json_path):
        raise FileNotFoundError(f"Không tìm thấy file: {json_path}")

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Hỗ trợ cả định dạng list trực tiếp hoặc dict chứa key 'embedding' / 'vector'
    embedding = None
    if isinstance(data, list):
        embedding = data
    elif isinstance(data, dict):
        embedding = data.get("embedding") or data.get("vector") or data.get("template")
        if embedding is None and "samples" in data and isinstance(data["samples"], list):
            embedding = data["samples"][0]

    if not embedding or not isinstance(embedding, list):
        raise ValueError(f"Không tìm thấy mảng embedding hợp lệ trong {json_path}")

    # Chuyển đổi sang float thuần
    embedding = [float(x) for x in embedding]

    if len(embedding) != 128:
        print(f"⚠️ Cảnh báo: Kích thước vector là {len(embedding)} (chuẩn SFace là 128 số float).")

    return embedding, data


def init_firebase(key_path: str):
    if not firebase_admin._apps:
        if not os.path.isfile(key_path):
            raise FileNotFoundError(f"Không tìm thấy service account key tại: {key_path}")
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()


def main():
    args = parse_args()

    print("\n" + "=" * 60)
    print("THEODOISK - ĐỒNG BỘ MẪU KHUÔN MẶT LÊN FIRESTORE")
    print("=" * 60)
    print(f"• Target UID     : {args.uid}")
    print(f"• Template File  : {args.template}")
    print(f"• Model Name     : {args.model}")

    try:
        embedding, raw_data = load_template(args.template)
        sample_count = len(raw_data.get("samples", [1])) if isinstance(raw_data, dict) else 1

        print(f"• Số chiều vector: {len(embedding)} dimensions")
        print(f"• Giá trị mẫu [0..3]: {[round(x, 4) for x in embedding[:4]]} ...")

        db = init_firebase(args.key)
        doc_ref = db.collection("face_templates").document(args.uid)

        payload = {
            "userId": args.uid,
            "model": args.model,
            "schema_version": 1,
            "sample_count": sample_count,
            "embedding": embedding,
            "enabled": True,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }

        doc_ref.set(payload, merge=True)

        print("\n✅ THÀNH CÔNG: Đã lưu mẫu khuôn mặt vào Firestore!")
        print(f"   Collection : face_templates")
        print(f"   Document ID: {args.uid}")
        print("   Raspberry Pi có thể query mẫu theo UID để xác thực người dùng.\n")

    except Exception as exc:
        print(f"\n❌ LỖI: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
