#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
firebase_manager.py
===================

Firebase Firestore manager for Office Health.

REAL FIREBASE SCHEMA (devices/pi4_node_1):

    bpm
    cleared_at
    heart_rate
    image_url
    is_in_zone
    note
    posture_label
    posture_status
    source
    spo2
    timestamp
    tracking_active

IMPORTANT:
    - Khong doi ten field.
    - Khong dung "updated_at".
    - Khong tu y xoa field cu.
    - update_*() dung merge=True de chi cap nhat field can thiet.
    - cleared_at / image_url / note / source khong bi ghi de neu
      khong truyen gia tri moi.
    - posture_status la NUMBER. Mapping so -> trang thai phai duoc
      thong nhat voi frontend/backend hien tai; file nay KHONG tu
      suy doan mapping.
"""

import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore


# ============================================================
# CONFIG
# ============================================================

KEY_PATH = "serviceAccountKey.json"

COLLECTION_NAME = "devices"
DOCUMENT_ID = "pi4_node_1"


# ============================================================
# FIREBASE MANAGER
# ============================================================

class FirebaseManager:

    def __init__(
        self,
        key_path=KEY_PATH,
        collection_name=COLLECTION_NAME,
        document_id=DOCUMENT_ID,
    ):

        self.key_path = key_path
        self.collection_name = collection_name
        self.document_id = document_id

        self.db = None
        self.doc_ref = None

        self._initialize()


    # ========================================================
    # INITIALIZE
    # ========================================================

    def _initialize(self):

        if not firebase_admin._apps:

            cred = credentials.Certificate(
                self.key_path
            )

            firebase_admin.initialize_app(
                cred
            )

        self.db = firestore.client()

        self.doc_ref = (
            self.db
            .collection(
                self.collection_name
            )
            .document(
                self.document_id
            )
        )


    # ========================================================
    # READ CURRENT DOCUMENT
    # ========================================================

    def get_device(self):

        snapshot = self.doc_ref.get()

        if not snapshot.exists:

            return None

        return snapshot.to_dict()


    # ========================================================
    # UPDATE POSTURE
    # ========================================================

    def update_posture(
        self,
        posture_status,
        posture_label,
        is_in_zone,
        tracking_active,
    ):
        """
        Cap nhat cac field posture theo schema hien tai.

        KHONG doi:
            - cleared_at
            - image_url
            - note
            - source
            - bpm
            - heart_rate
            - spo2

        neu khong duoc yeu cau.
        """

        payload = {

            "posture_status":
                int(posture_status),

            "posture_label":
                str(posture_label),

            "is_in_zone":
                bool(is_in_zone),

            "tracking_active":
                bool(tracking_active),

            "timestamp":
                firestore.SERVER_TIMESTAMP,
        }

        self.doc_ref.set(
            payload,
            merge=True
        )


    # ========================================================
    # UPDATE HEALTH
    # ========================================================

    def update_health(
        self,
        bpm=None,
        spo2=None,
    ):
        """
        Cap nhat health fields.

        Schema hien tai co ca:
            bpm
            heart_rate
            spo2

        Khi co BPM, cap nhat DONG THOI:
            bpm
            heart_rate

        de giu hai field dong bo trong giai doan hien tai.

        Neu gia tri None thi field do khong bi thay doi.
        """

        payload = {}

        if bpm is not None:

            bpm_value = float(bpm)

            payload["bpm"] = (
                bpm_value
            )

            payload["heart_rate"] = (
                bpm_value
            )

        if spo2 is not None:

            payload["spo2"] = (
                float(spo2)
            )

        if not payload:
            return

        payload["timestamp"] = (
            firestore.SERVER_TIMESTAMP
        )

        self.doc_ref.set(
            payload,
            merge=True
        )


    # ========================================================
    # UPDATE RUNTIME
    # ========================================================

    def update_runtime(
        self,
        posture_status=None,
        posture_label=None,
        is_in_zone=None,
        tracking_active=None,
        bpm=None,
        spo2=None,
    ):
        """
        Cap nhat nhieu nhom field trong MOT lan ghi.

        Chi field nao khac None moi duoc ghi.

        KHONG tu y ghi:
            cleared_at
            image_url
            note
            source
        """

        payload = {}

        # -------------------------
        # Posture
        # -------------------------

        if posture_status is not None:

            payload["posture_status"] = (
                int(posture_status)
            )

        if posture_label is not None:

            payload["posture_label"] = (
                str(posture_label)
            )

        if is_in_zone is not None:

            payload["is_in_zone"] = (
                bool(is_in_zone)
            )

        if tracking_active is not None:

            payload["tracking_active"] = (
                bool(tracking_active)
            )

        # -------------------------
        # Health
        # -------------------------

        if bpm is not None:

            bpm_value = float(bpm)

            payload["bpm"] = (
                bpm_value
            )

            payload["heart_rate"] = (
                bpm_value
            )

        if spo2 is not None:

            payload["spo2"] = (
                float(spo2)
            )

        # -------------------------
        # Timestamp
        # -------------------------

        if payload:

            payload["timestamp"] = (
                firestore.SERVER_TIMESTAMP
            )

            self.doc_ref.set(
                payload,
                merge=True
            )


    # ========================================================
    # SAFE UPDATE RUNTIME
    # ========================================================

    def safe_update_runtime(
        self,
        posture_status=None,
        posture_label=None,
        is_in_zone=None,
        tracking_active=None,
        bpm=None,
        spo2=None,
    ):

        try:

            self.update_runtime(
                posture_status=posture_status,
                posture_label=posture_label,
                is_in_zone=is_in_zone,
                tracking_active=tracking_active,
                bpm=bpm,
                spo2=spo2,
            )

            return True

        except Exception as e:

            print(
                f"Firebase update error: {e}"
            )

            return False


    # ========================================================
    # SAFE POSTURE
    # ========================================================

    def safe_update_posture(
        self,
        posture_status,
        posture_label,
        is_in_zone,
        tracking_active,
    ):

        try:

            self.update_posture(
                posture_status=posture_status,
                posture_label=posture_label,
                is_in_zone=is_in_zone,
                tracking_active=tracking_active,
            )

            return True

        except Exception as e:

            print(
                f"Firebase posture update error: {e}"
            )

            return False


    # ========================================================
    # SAFE HEALTH
    # ========================================================

    def safe_update_health(
        self,
        bpm=None,
        spo2=None,
    ):

        try:

            self.update_health(
                bpm=bpm,
                spo2=spo2,
            )

            return True

        except Exception as e:

            print(
                f"Firebase health update error: {e}"
            )

            return False


    # ========================================================
    # CLOSE
    # ========================================================

    def close(self):

        self.doc_ref = None
        self.db = None


# ============================================================
# TEST
# ============================================================

def test_firebase():

    print()
    print("=" * 60)
    print("FIREBASE MANAGER TEST")
    print("=" * 60)

    manager = None

    try:

        manager = FirebaseManager()

        print(
            f"Collection : {COLLECTION_NAME}"
        )

        print(
            f"Document   : {DOCUMENT_ID}"
        )

        print(
            "Connecting to Firestore..."
        )

        data = manager.get_device()

        print(
            "Firestore connection: OK"
        )

        if data is None:

            print(
                "Document does not exist."
            )

        else:

            print(
                f"Existing fields: {len(data)}"
            )

            for key in sorted(data.keys()):

                print(
                    f"  - {key}"
                )

        print()
        print(
            "Read-only test: KHONG GHI DU LIEU."
        )

        print(
            "FIREBASE TEST: OK"
        )

    except Exception as e:

        print()
        print(
            "FIREBASE TEST: FAILED"
        )

        print(
            repr(e)
        )

        raise

    finally:

        if manager is not None:

            manager.close()


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    test_firebase()
