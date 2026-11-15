#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
mainnew_final.py (V8 + ST7789 + Speaker I2S + Realtime Preferences)
==============
OFFICE HEALTH - Raspberry Pi 4 integration
Đã sửa luồng phát loa khuôn mặt: Không báo nhầm stranger_detected khi vắng mặt (ABSENT).
"""

import argparse
import os
import threading
import time

import cv2
import numpy as np

from posture_worker2 import PostureWorker, draw_ui
from health_worker import HealthWorker
from firebase_manager import FirebaseManager
from tft_display_worker import TftDisplayWorker
from health_output import resolve_health_output
from posture_stabilizer import PostureStabilizer, PostureDisplayView
from speaker_manager import SpeakerManager


# ============================================================
# CONFIG
# ============================================================

FIREBASE_PUSH_INTERVAL = 2.0

STATUS_GOOD = 0
STATUS_BAD = 1
STATUS_ABSENT = 2
STATUS_LONG_BAD = 3
STATUS_LONG_SITTING = 4  
STATUS_STAND = 5         
STATUS_UNKNOWN = -1

DEFAULT_PREFERENCES = {
    # Gia tri mac dinh dong bo voi giao dien cai dat hien tai.
    'hrMin': 50,
    'hrMax': 110,
    'spo2Min': 94,
    'biometricReminderSec': 20,
    'incorrectPostureSec': 10.0,
    'longIncorrectSec': 60.0,
    'longSittingSec': 3600.0,
    'standingTargetSec': 300.0,
    'standingResetSec': 300.0,
    'soundEnabled': True,
    'voiceAlertEnabled': True,
    'outOfZoneAlertEnabled': False,
}

FIREBASE_RETRY_SECONDS = 3.0
DISPLAY_HEALTH = True
TFT_DEFAULT_FPS = 2.0  
FACE_AWAY_SECONDS = 5.0
STATE_UPDATE_INTERVAL = 0.20  


# ============================================================
# PREFERENCE MANAGER
# ============================================================

class PreferenceManager:
    """Lang nghe users/{uid}/preferences/office_health trong Firestore."""

    NUMERIC_KEYS = (
        'hrMin', 'hrMax', 'spo2Min', 'biometricReminderSec',
        'incorrectPostureSec', 'longIncorrectSec', 'longSittingSec',
        'standingTargetSec', 'standingResetSec',
    )
    BOOL_KEYS = ('soundEnabled', 'voiceAlertEnabled', 'outOfZoneAlertEnabled')

    def __init__(self, db):
        self.db = db
        self.lock = threading.RLock()
        self.preferences = dict(DEFAULT_PREFERENCES)
        self.current_uid = None
        self._watch = None

    @staticmethod
    def _to_bool(value):
        if isinstance(value, str):
            return value.strip().lower() in ('1', 'true', 'yes', 'on')
        return bool(value)

    def _on_snapshot(self, doc_snapshot, changes=None, read_time=None, expected_uid=None):
        # DocumentReference.on_snapshot() gui mot DocumentSnapshot, khong phai list.
        docs = [doc_snapshot] if hasattr(doc_snapshot, 'exists') else list(doc_snapshot or [])
        for doc in docs:
            if not getattr(doc, 'exists', False):
                with self.lock:
                    self.preferences = dict(DEFAULT_PREFERENCES)
                print('[PREF] Document office_health khong ton tai; dang dung gia tri mac dinh.', flush=True)
                continue

            data = doc.to_dict() or {}
            updated = dict(DEFAULT_PREFERENCES)
            for key in self.NUMERIC_KEYS:
                raw = data.get(key, DEFAULT_PREFERENCES[key])
                try:
                    updated[key] = float(raw)
                except (TypeError, ValueError):
                    updated[key] = float(DEFAULT_PREFERENCES[key])
            for key in self.BOOL_KEYS:
                updated[key] = self._to_bool(data.get(key, DEFAULT_PREFERENCES[key]))

            # Kiem tra cac nguong co hop le truoc khi ap dung.
            if updated['hrMin'] > updated['hrMax']:
                updated['hrMin'], updated['hrMax'] = (
                    DEFAULT_PREFERENCES['hrMin'], DEFAULT_PREFERENCES['hrMax']
                )
                print('[PREF WARNING] hrMin > hrMax; dung cap HR mac dinh.', flush=True)
            for key in self.NUMERIC_KEYS:
                if updated[key] < 0:
                    updated[key] = float(DEFAULT_PREFERENCES[key])
                    print(f'[PREF WARNING] {key} am; dung gia tri mac dinh.', flush=True)

            with self.lock:
                if expected_uid is not None and self.current_uid != expected_uid:
                    return  # Bo qua callback cu cua tai khoan truoc.
                self.preferences = updated
                uid = self.current_uid
            print(
                '[PREF SYNC] Da nhan Firestore | '
                f'UID={uid} | HR={updated["hrMin"]}-{updated["hrMax"]} BPM | '
                f'SpO2>={updated["spo2Min"]}% | '
                f'BIO_REMINDER={updated["biometricReminderSec"]}s | '
                f'BAD={updated["incorrectPostureSec"]}s | '
                f'LONG_BAD={updated["longIncorrectSec"]}s | '
                f'SIT={updated["longSittingSec"]}s | '
                f'STAND_TARGET={updated["standingTargetSec"]}s | '
                f'STAND_RESET={updated["standingResetSec"]}s',
                flush=True,
            )

    def update_user(self, uid):
        uid = str(uid).strip() if uid else None
        with self.lock:
            if uid == self.current_uid:
                return
            old_watch = self._watch
            self._watch = None
            self.current_uid = uid
            self.preferences = dict(DEFAULT_PREFERENCES)

        if old_watch is not None:
            try:
                old_watch.unsubscribe()
            except Exception as exc:
                print(f'[PREF WARNING] Unsubscribe failed: {exc!r}', flush=True)

        if not uid:
            print('[PREF] Khong co UID; tam thoi dung nguong mac dinh.', flush=True)
            return

        try:
            doc_ref = (
                self.db.collection('users').document(uid)
                .collection('preferences').document('office_health')
            )
            def _callback(snapshot, changes, read_time, watched_uid=uid):
                self._on_snapshot(
                    snapshot, changes, read_time, expected_uid=watched_uid
                )

            new_watch = doc_ref.on_snapshot(_callback)
            with self.lock:
                if self.current_uid == uid:
                    self._watch = new_watch
                else:
                    new_watch.unsubscribe()
            print(f'[PREF] Dang lang nghe users/{uid}/preferences/office_health', flush=True)
        except Exception as exc:
            print(f'[PREF ERROR] Khong the dang ky Firestore listener cho UID {uid}: {exc!r}', flush=True)

    def get(self, key):
        with self.lock:
            return self.preferences.get(key, DEFAULT_PREFERENCES.get(key))

    def snapshot(self):
        with self.lock:
            return dict(self.preferences)

    def stop(self):
        with self.lock:
            watch = self._watch
            self._watch = None
        if watch is not None:
            try:
                watch.unsubscribe()
            except Exception as exc:
                print(f'[PREF WARNING] Stop listener failed: {exc!r}', flush=True)


# ============================================================
# HELPERS
# ============================================================

def fmt(value, digits=1):
    if value is None:
        return "--"
    try:
        return f"{float(value):.{digits}f}"
    except Exception:
        return "--"

def posture_to_schema(snapshot, bad_duration, sitting_duration, standing_duration, pref_mgr, camera_online=True):
    if not camera_online:
        return (STATUS_UNKNOWN, "Lỗi kết nối Camera", False, False)

    status = str(snapshot.get("status", "ABSENT"))
    inc_sec = pref_mgr.get('incorrectPostureSec')
    long_bad_sec = pref_mgr.get('longIncorrectSec')
    long_sit_sec = pref_mgr.get('longSittingSec')

    if status == "VERIFYING":
        return (STATUS_UNKNOWN, "Đang xác nhận tư thế", True, True)

    if status == "GOOD":
        if sitting_duration >= long_sit_sec:
            return (STATUS_LONG_SITTING, "Ngồi làm việc quá lâu", True, True)
        return (STATUS_GOOD, "Đúng", True, True)

    if status == "BAD":
        if bad_duration >= long_bad_sec:
            return (STATUS_LONG_BAD, "Sai tư thế lâu", True, True)
        if bad_duration >= inc_sec:
            return (STATUS_BAD, "Sai tư thế", True, True)
        return (STATUS_GOOD, "Tự điều chỉnh", True, True)

    if status == "STAND":
        return (STATUS_STAND, "Đứng", True, True)

    if status == "NGOAI VUNG GIAM SAT":
        return (STATUS_ABSENT, "Ngoài vùng quan sát", False, True)

    if status == "ERROR":
        return (STATUS_UNKNOWN, "Lỗi AI", False, False)

    return (STATUS_ABSENT, "Vắng / Không phát hiện", False, False)

def health_to_schema(result):
    out = resolve_health_output(result)
    return (out.bpm if out.hr_reliable else 0.0,
            out.spo2 if out.spo2 is not None else 0.0)

def health_for_tft(result):
    out = resolve_health_output(result)
    return {
        "finger": out.finger,
        "bpm": out.bpm,
        "spo2": out.spo2,
        "hr_reliable": out.hr_reliable,
        "hr_age": out.hr_age,
        "sqi": out.sqi,
        "warmup": out.warmup,
        "health_status": out.health_status,
    }

def update_face_presence(controller, snapshot, raw_status, absent_since, now,
                         absence_seconds=FACE_AWAY_SECONDS):
    if controller is None or not controller.is_verified():
        return None
    if snapshot.get("camera_online") is False:
        controller.lock("CAMERA_OFFLINE")
        return None
    if raw_status in ("ABSENT", "NGOAI VUNG GIAM SAT"):
        if absent_since is None:
            return now
        if now - absent_since >= absence_seconds:
            controller.lock("AWAY_OVER_30S")
            return None
        return absent_since
    return None


# ============================================================
# DEDICATED MAX30102 SAMPLER
# ============================================================

class HealthSampler:
    def __init__(self, worker, poll_seconds=0.01):
        self.worker = worker
        self.poll_seconds = float(poll_seconds)
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        self.thread = None
        self._latest = {
            "status": "STARTING", "finger_detected": False,
            "warmup_complete": False, "warmup_remaining": 0.0,
            "bpm": None, "spo2": None, "sqi": 0.0,
            "samples_total": 0, "last_ir_raw": None,
        }
        self._last_update = None
        self._last_sample_progress = time.monotonic()
        self._sample_count = 0
        self._error = None

    def start(self):
        if self.thread is not None:
            return
        self._last_sample_progress = time.monotonic()
        self.stop_event.clear()
        self.thread = threading.Thread(
            target=self._loop, name="max30102-reader", daemon=True
        )
        self.thread.start()

    def _loop(self):
        while not self.stop_event.is_set():
            try:
                result = self.worker.process_once()
                now = time.monotonic()
                samples = int(result.get("samples_total") or 0)
                with self.lock:
                    self._latest = dict(result)
                    self._last_update = now
                    if samples > self._sample_count:
                        self._last_sample_progress = now
                        self._sample_count = samples
            except Exception as exc:
                with self.lock:
                    self._error = repr(exc)
                print(f"MAX30102 reader error: {exc!r}", flush=True)
                self.stop_event.set()
                break
            self.stop_event.wait(self.poll_seconds)

    def snapshot(self):
        with self.lock:
            result = dict(self._latest)
            last_update = self._last_update
            last_progress = self._last_sample_progress
            error = self._error
        now = time.monotonic()
        if error:
            status = "SENSOR_ERROR"
        elif last_update is not None and now - last_update > 2.0:
            status = "SENSOR_STALE"
        elif now - last_progress > 3.0:
            status = "SENSOR_STALLED"
        else:
            return result
        result.update(status=status, finger_detected=False,
                      warmup_complete=False, bpm=None, spo2=None, sqi=0.0)
        if error:
            result["sensor_error"] = error
        return result

    def stop(self):
        self.stop_event.set()
        if self.thread is not None:
            self.thread.join(timeout=5.0)
            if self.thread.is_alive():
                raise RuntimeError("MAX30102 reader did not stop in 5 seconds")
            self.thread = None


# ============================================================
# FIREBASE PUBLISHER
# ============================================================

class FirebasePublisher:
    def __init__(self, manager, face_controller=None):
        self.manager = manager
        self.face_controller = face_controller
        self.lock = threading.Lock()
        self.state = None
        self.running = False
        self.thread = None
        self.last_ok = 0.0
        self.last_error = 0.0

    def update(self, state):
        with self.lock:
            self.state = dict(state)

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(
            target=self._loop,
            name="firebase-publisher",
            daemon=True,
        )
        self.thread.start()

    def _loop(self):
        next_push = 0.0
        while self.running:
            now = time.monotonic()
            if now < next_push:
                time.sleep(0.05)
                continue
            with self.lock:
                state = dict(self.state) if self.state else None
            if state is None:
                time.sleep(0.05)
                continue
            try:
                if self.face_controller is None:
                    ok = self.manager.safe_update_runtime(
                        posture_status=state["posture_status"],
                        posture_label=state["posture_label"],
                        is_in_zone=state["is_in_zone"],
                        tracking_active=state["tracking_active"],
                        bpm=state["bpm"],
                        spo2=state["spo2"],
                    )
                else:
                    uid = state.get("userId")
                    if not self.face_controller.authorized_session(uid):
                        uid = None
                        state = {
                            "posture_status": STATUS_UNKNOWN,
                            "posture_label": "Chưa xác thực khuôn mặt",
                            "is_in_zone": False, "tracking_active": False,
                            "bpm": 0.0, "spo2": 0.0,
                        }
                    self.manager.doc_ref.set({
                        "userId": uid,
                        "posture_status": int(state["posture_status"]),
                        "posture_label": str(state["posture_label"]),
                        "is_in_zone": bool(state["is_in_zone"]),
                        "tracking_active": bool(state["tracking_active"]),
                        "bpm": float(state["bpm"]),
                        "heart_rate": float(state["bpm"]),
                        "spo2": float(state["spo2"]),
                        "timestamp": __import__('firebase_admin').firestore.SERVER_TIMESTAMP,
                    }, merge=True)
                    ok = True

                if ok:
                    self.last_ok = now
                    next_push = now + FIREBASE_PUSH_INTERVAL
                else:
                    self.last_error = now
                    next_push = now + FIREBASE_RETRY_SECONDS
            except Exception as exc:
                self.last_error = now
                print(f"\nFirebase publisher error: {exc}", flush=True)
                next_push = now + FIREBASE_RETRY_SECONDS

    def stop(self):
        self.running = False
        if self.thread is not None:
            self.thread.join(timeout=2.0)
        self.thread = None


# ============================================================
# LOCAL DISPLAY
# ============================================================

def draw_health(frame, result):
    if not DISPLAY_HEALTH:
        return frame

    out = resolve_health_output(result)
    h, _ = frame.shape[:2]
    x, y = 30, max(180, h - 120)

    status_text = {
        "HR_CONFIRMED": "HR CONFIRMED (V8)",
        "WARMUP": f"MEASURING - WARMUP {out.warmup:.1f}s",
        "MEASURING": "MEASURING - VERIFYING HR",
        "SIGNAL_WEAK": "SIGNAL WEAK",
        "NO_FINGER": "NO FINGER",
    }.get(out.health_status, out.health_status)
    if out.hr_reliable:
        hr_text = f"HR CONFIRMED: {out.bpm:.1f} BPM"
    elif out.health_status in ("WARMUP", "MEASURING", "SIGNAL_WEAK"):
        hr_text = "HR: MEASURING..."
    else:
        hr_text = "HR: --"
    spo2_text = f"SpO2: {out.spo2:.1f}%" if out.spo2 is not None else "SpO2: --"
    age_text = f" | HR age: {out.hr_age:.1f}s" if out.hr_reliable and out.hr_age is not None else ""
    detail_text = f"Finger: {'YES' if out.finger else 'NO'} | SQI: {out.sqi:.2f}{age_text}"
    if out.health_status == "SIGNAL_WEAK" and out.hr_reliable:
        hr_text = f"LAST VERIFIED HR: {out.bpm:.1f} BPM"

    for offset, txt, color, scale in (
        (0, f"PPG: {status_text}", (255, 255, 255), .62),
        (27, hr_text, (0, 255, 0) if out.hr_reliable else (0, 190, 255), .62),
        (54, spo2_text, (0, 255, 255), .65),
        (81, detail_text, (255, 255, 255), .48),
    ):
        cv2.putText(frame, txt, (x, y + offset), cv2.FONT_HERSHEY_SIMPLEX,
                    scale, color, 2)
    return frame


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--headless", action="store_true", help="Run without OpenCV GUI.")
    parser.add_argument("--gui", action="store_true", help="Force OpenCV GUI.")
    parser.add_argument("--no-tft", action="store_true", help="Disable ST7789.")
    parser.add_argument("--tft-fps", type=float, default=TFT_DEFAULT_FPS)
    parser.add_argument("--health-log", action="store_true")
    parser.add_argument("--face-auth", action="store_true")
    parser.add_argument(
        "--uid", default=os.environ.get("OFFICE_HEALTH_UID"),
        help="Firebase Auth UID de nap preferences khi khong bat --face-auth."
    )
    parser.add_argument("--yunet-model", default=None)
    parser.add_argument("--sface-model", default=None)
    parser.add_argument("--face-threshold", type=float, default=0.72)
    args = parser.parse_args()

    if args.headless:
        headless = True
    elif args.gui:
        headless = False
    else:
        headless = not bool(os.environ.get("DISPLAY"))

    posture = None
    health = None
    firebase = None
    publisher = None
    tft = None
    sampler = None
    face_controller = None
    speaker = None
    pref_mgr = None

    # Biến quản lý loa & cờ sự kiện
    last_verified_state = False
    last_face_status = None
    spk_bad_spoken = False
    spk_long_bad_spoken = False
    spk_long_sit_spoken = False
    spk_standing_goal_spoken = False
    spk_absent_spoken = False

    last_finger_state = False
    last_hr_confirmed_state = False
    # Moc thoi gian nhac do sinh trac hoc tiep theo (monotonic seconds).
    next_biometric_reminder = None
    last_biometric_reminder_interval = None
    last_biometric_reminder_retry = 0.0
    last_measuring_pulse_spoken = False
    vital_abnormal_spoken = False
    last_audio_posture_status = None
    last_camera_online = True
    last_raw_absent = False

    absent_since = None
    last_face_epoch = None
    health_session_finger_rearmed = False

    running = True

    bad_start = None
    last_bad_duration = 0.0
    # Thoi gian ngoi duoc tam dung khi dung; chi reset sau khi dung lien tuc du standingResetSec.
    sitting_duration_accum = 0.0
    standing_duration_accum = 0.0
    duration_state = "VERIFYING"
    duration_last_tick = time.monotonic()
    standing_reset_done = False
    last_sitting_duration = 0.0
    last_standing_duration = 0.0

    posture_filter = PostureStabilizer()
    posture_view = None
    stable_posture_status = "VERIFYING"
    last_posture_observation = None
    last_posture_status_printed = None

    print()
    print("=" * 64)
    print("OFFICE HEALTH SYSTEM - RASPBERRY PI 4")
    print("=" * 64)

    try:
        print("\n[1/5] Starting Speaker Manager...")
        speaker = SpeakerManager(volume=1.0)

        print("\n[2/5] Starting posture worker...")
        posture = PostureWorker()
        posture.start()
        posture_view = PostureDisplayView(posture)
        if args.face_auth and hasattr(posture, 'set_ai_enabled'):
            posture.set_ai_enabled(False)
        print("Posture worker: OK")

        print("\n[3/5] Starting MAX30102 V8 health worker...")
        health = HealthWorker()
        health.start()
        sampler = HealthSampler(health)
        sampler.start()
        print("Health worker: OK")

        print("\n[4/5] Connecting Firestore & Preference Manager...")
        firebase = FirebaseManager()
        pref_mgr = PreferenceManager(firebase.db)

        if args.uid and not args.face_auth:
            pref_mgr.update_user(args.uid)
        elif not args.face_auth:
            print(
                "[PREF WARNING] Chua co UID. De nhan cai dat theo tai khoan web, "
                "hay chay --uid <FIREBASE_AUTH_UID> hoac bat --face-auth.",
                flush=True,
            )

        if args.face_auth:
            from face.face_controller import FaceController
            import glob
            def locate(explicit, patterns):
                if explicit: return explicit
                for pattern in patterns:
                    found = sorted(glob.glob(pattern))
                    if found: return found[0]
                raise FileNotFoundError("Cannot find face model: " + repr(patterns))

            yunet_path = locate(args.yunet_model, ["face/models/*yunet*.onnx", "models/*yunet*.onnx", "*yunet*.onnx"])
            sface_path = locate(args.sface_model, ["face/models/*sface*.onnx", "models/*sface*.onnx", "*sface*.onnx"])
            face_controller = FaceController(
                db=firebase.db, device_id=firebase.document_id,
                camera=posture, yunet_model=yunet_path,
                sface_model=sface_path, threshold=args.face_threshold,
            )
            face_controller.start()

        publisher = FirebasePublisher(firebase, face_controller=face_controller)
        publisher.start()

        print("\n[5/5] Initializing ST7789 TFT...")
        if not args.no_tft:
            try:
                tft = TftDisplayWorker(fps=args.tft_fps)
                tft.start()
            except Exception as exc:
                print(f"WARNING: ST7789 unavailable: {exc!r}")
                tft = None

        print("\n" + "=" * 64 + "\nSYSTEM RUNNING\n" + "=" * 64 + "\n")

        fps_count = 0
        fps_start = time.monotonic()
        display_fps = 0.0
        last_state_update = 0.0

        while running:
            posture_snapshot = posture.get_snapshot()
            now = time.monotonic()
            camera_online = posture_snapshot.get("camera_online", True)
            camera_problem = (
                not camera_online
                or posture_snapshot.get("stale", False)
                or posture_snapshot.get("status") == "ERROR"
            )
            if camera_problem and last_camera_online and pref_mgr.get('voiceAlertEnabled'):
                speaker.alert_camera_error()
            last_camera_online = not camera_problem

            if posture_snapshot.get("stale", False) or posture_snapshot.get("status") == "ERROR":
                raw_posture = "ERROR"
            else:
                raw_posture = posture_snapshot.get("raw_status", posture_snapshot.get("status", "ABSENT"))

            face_state = face_controller.snapshot() if face_controller else None
            verified = face_controller is None or face_controller.is_verified()

            # --------------------------------------------------
            # XÁC THỰC KHUÔN MẶT & CẢNH BÁO LUỒNG CHUẨN
            # --------------------------------------------------
            just_verified = False
            if face_controller:
                absent_since = update_face_presence(
                    face_controller, posture_snapshot, raw_posture, absent_since, now
                )
                face_state = face_controller.snapshot()
                verified = face_controller.is_verified()
                current_face_status = str(face_state.get("status", "UNKNOWN"))

                enrolled_states = {
                    "ENROLLED", "FACE_ENROLLED", "ENROLLMENT_COMPLETE", "REGISTERED",
                    "ENROLL_SUCCESS", "ENROLLMENT_SUCCESS", "REGISTER_SUCCESS", "FACE_ADDED"
                }
                if (current_face_status in enrolled_states
                        and last_face_status not in enrolled_states
                        and pref_mgr.get('voiceAlertEnabled')):
                    speaker.alert_face_enrolled()

                # Phat am thanh ngay khi chuyen sang da xac thuc.
                just_verified = verified and not last_verified_state
                if just_verified:
                    if pref_mgr.get('voiceAlertEnabled'):
                        speaker.alert_face_verified()
                    last_verified_state = True
                elif not verified:
                    last_verified_state = False

                # Khong bao nguoi la khi camera khong thay nguoi / nguoi ra khoi vung.
                absent_now = raw_posture in ("ABSENT", "NGOAI VUNG GIAM SAT")
                if (current_face_status in ("VERIFY_FAILED", "REVERIFY_REQUIRED")
                        and not absent_now
                        and last_face_status not in ("VERIFY_FAILED", "REVERIFY_REQUIRED")
                        and pref_mgr.get('voiceAlertEnabled')):
                    speaker.alert_stranger_detected()

                last_face_status = current_face_status

                # Preferences theo UID cua phien khuon mat da xac thuc.
                active_uid = face_state.get('uid') if verified else None
                pref_mgr.update_user(active_uid)

                if last_face_epoch != face_state.get("epoch"):
                    posture_filter.reset()
                    bad_start = None
                    last_bad_duration = 0.0
                    sitting_duration_accum = 0.0
                    standing_duration_accum = 0.0
                    standing_reset_done = False
                    duration_state = "VERIFYING"
                    duration_last_tick = now
                    last_posture_observation = None
                    stable_posture_status = "VERIFYING"
                    last_audio_posture_status = None
                    last_face_epoch = face_state.get("epoch")
                    health_session_finger_rearmed = False
                    last_finger_state = False
                    last_hr_confirmed_state = False
                    next_biometric_reminder = None
                    last_biometric_reminder_interval = None
                    last_biometric_reminder_retry = 0.0
                    last_measuring_pulse_spoken = False
                    vital_abnormal_spoken = False
                    spk_bad_spoken = False
                    spk_long_bad_spoken = False
                    spk_long_sit_spoken = False
                    spk_standing_goal_spoken = False
                    spk_absent_spoken = False
                    if hasattr(posture, 'set_ai_enabled'):
                        posture.set_ai_enabled(verified)

            # Nhac quay lai khi nguoi dung tro lai vung quan sat trong cung phien.
            raw_absent_now = raw_posture in ("ABSENT", "NGOAI VUNG GIAM SAT")
            if (verified and last_raw_absent and not raw_absent_now and not just_verified
                    and pref_mgr.get('voiceAlertEnabled')):
                speaker.alert_welcome_back()
            last_raw_absent = raw_absent_now

            if verified and (last_posture_observation is None or now - last_posture_observation >= STATE_UPDATE_INTERVAL):
                stable_posture_status = posture_filter.update(raw_posture, now)
                last_posture_observation = now

                # Tinh thoi gian theo trang thai truoc do de dung ngan khong xoa chu ky ngoi.
                dt = max(0.0, min(now - duration_last_tick, 1.0))
                if duration_state in ("GOOD", "BAD"):
                    sitting_duration_accum += dt
                elif duration_state == "STAND":
                    standing_duration_accum += dt
                    reset_after = float(pref_mgr.get('standingResetSec'))
                    if (not standing_reset_done and standing_duration_accum >= reset_after):
                        sitting_duration_accum = 0.0
                        standing_reset_done = True
                        spk_long_sit_spoken = False
                        print(
                            f"[TIMER] Dung lien tuc {reset_after:.0f}s: reset thoi gian ngoi lien tuc.",
                            flush=True,
                        )

                if stable_posture_status != duration_state:
                    if stable_posture_status == "STAND":
                        standing_duration_accum = 0.0
                        standing_reset_done = False
                    elif duration_state == "STAND":
                        # Neu dung chua du standingResetSec, giu nguyen thoi gian ngoi da tich luy.
                        standing_duration_accum = 0.0
                        standing_reset_done = False
                    duration_state = stable_posture_status

                duration_last_tick = now
                last_sitting_duration = sitting_duration_accum
                last_standing_duration = (
                    standing_duration_accum if stable_posture_status == "STAND" else 0.0
                )

                if stable_posture_status == "BAD":
                    if bad_start is None: bad_start = now
                    last_bad_duration = now - bad_start
                else:
                    bad_start = None
                    last_bad_duration = 0.0
                    spk_bad_spoken = False
                    spk_long_bad_spoken = False

                if stable_posture_status == "GOOD":
                    spk_bad_spoken = False
                    spk_long_bad_spoken = False

                if stable_posture_status != last_posture_status_printed:
                    print(
                        "POSTURE: {} -> {} | raw={} | BAD30={:.0%} | GOOD8={:.0%}".format(
                            last_posture_status_printed or "START",
                            stable_posture_status, raw_posture,
                            posture_filter.bad_ratio_30s,
                            posture_filter.good_ratio_8s,
                        ),
                        flush=True,
                    )
                    last_posture_status_printed = stable_posture_status

            if not verified:
                stable_posture_status = "VERIFYING"

            posture_snapshot["status"] = stable_posture_status
            posture_snapshot["raw_ai_status"] = raw_posture
            posture_snapshot["color"] = {
                "GOOD": (0, 255, 0), "BAD": (0, 0, 255), "VERIFYING": (0, 200, 255)
            }.get(stable_posture_status, (0, 255, 255))
            posture_view.set_snapshot(posture_snapshot)

            (
                posture_status, posture_label, is_in_zone, tracking_active
            ) = posture_to_schema(
                posture_snapshot, last_bad_duration, last_sitting_duration, last_standing_duration, pref_mgr, camera_online
            )

            # --------------------------------------------------
            # AUDIO EVENTS - POSTURE / PRESENCE
            # --------------------------------------------------
            voice_enabled = bool(pref_mgr.get('voiceAlertEnabled'))
            sound_enabled = bool(pref_mgr.get('soundEnabled'))

            # Am thanh trang thai phat theo su kien chuyen trang thai, khong lap moi vong.
            if verified and not camera_problem and stable_posture_status != last_audio_posture_status:
                # Bo qua VERIFYING ngay sau xac thuc de khong cat ngang face_verified.
                first_state_after_reset = last_audio_posture_status is None
                if voice_enabled and not (first_state_after_reset and just_verified):
                    if stable_posture_status == "VERIFYING":
                        speaker.alert_posture_verifying()
                    elif stable_posture_status == "GOOD":
                        speaker.alert_posture_correct()
                    elif stable_posture_status == "STAND":
                        speaker.alert_standing_active()
                last_audio_posture_status = stable_posture_status

            if verified:
                inc_sec = float(pref_mgr.get('incorrectPostureSec'))
                long_inc_sec = float(pref_mgr.get('longIncorrectSec'))
                long_sit_sec = float(pref_mgr.get('longSittingSec'))
                stand_target = float(pref_mgr.get('standingTargetSec'))

                # Sai tu the: canh bao theo nguong web; khi dat nguong phat ngay, khong cho queue.
                if stable_posture_status == "BAD":
                    if last_bad_duration >= long_inc_sec and not spk_long_bad_spoken:
                        if voice_enabled:
                            speaker.alert_long_incorrect()
                            spk_long_bad_spoken = True
                            spk_bad_spoken = True
                    elif last_bad_duration >= inc_sec and not spk_bad_spoken:
                        if voice_enabled:
                            speaker.alert_posture_incorrect()
                            spk_bad_spoken = True
                else:
                    spk_bad_spoken = False
                    spk_long_bad_spoken = False

                # Ngoi qua lau.
                if last_sitting_duration >= long_sit_sec and not spk_long_sit_spoken:
                    if voice_enabled:
                        speaker.alert_long_sitting()
                        spk_long_sit_spoken = True

                # Dat muc tieu dung.
                if (stable_posture_status == "STAND"
                        and last_standing_duration >= stand_target
                        and not spk_standing_goal_spoken):
                    if voice_enabled:
                        speaker.alert_standing_goal_reached()
                        spk_standing_goal_spoken = True
                elif stable_posture_status != "STAND":
                    spk_standing_goal_spoken = False

                # Vang mat / ngoai vung quan sat. Khong phat stranger_detected cho ABSENT.
                absent_for_alert = (
                    stable_posture_status == "ABSENT"
                    or raw_posture == "NGOAI VUNG GIAM SAT"
                )
                if absent_for_alert and pref_mgr.get('outOfZoneAlertEnabled'):
                    if not spk_absent_spoken and voice_enabled:
                        speaker.alert_user_absent()
                        spk_absent_spoken = True
                elif not absent_for_alert:
                    spk_absent_spoken = False

            # --------------------------------------------------
            # AUDIO EVENTS - MAX30102
            # --------------------------------------------------
            health_result = sampler.snapshot()
            if face_controller and not health_result.get('finger_detected', False):
                health_session_finger_rearmed = True
            health_allowed = verified and (face_controller is None or health_session_finger_rearmed)
            bpm, spo2 = (0.0, 0.0)

            current_finger = bool(health_result.get("finger_detected", False)) if health_allowed else False

            # --------------------------------------------------
            # NHAC NGUOI DUNG DO SINH TRAC HOC - FIRESTORE
            # biometricReminderSec duoc tinh bang giay.
            # Bat dau tinh khi phien da xac thuc va duoc phep do.
            # Sau mot lan do tin cay, dat lai chu ky nhac.
            # Khong phat loi nhac khi dang dat ngon tay len cam bien.
            # --------------------------------------------------
            reminder_sec = max(
                0.0, float(pref_mgr.get('biometricReminderSec') or 0)
            )

            if not health_allowed or reminder_sec <= 0:
                next_biometric_reminder = None
                last_biometric_reminder_interval = None
                last_biometric_reminder_retry = 0.0
            else:
                # Neu nguoi dung thay doi thoi gian tren web, ap dung chu ky moi.
                if last_biometric_reminder_interval != reminder_sec:
                    next_biometric_reminder = now + reminder_sec
                    last_biometric_reminder_interval = reminder_sec
                    last_biometric_reminder_retry = 0.0
                    print(
                        f"[REMINDER] Chu ky nhac do sinh trac hoc: {reminder_sec:.0f}s",
                        flush=True,
                    )

                if (not current_finger
                        and next_biometric_reminder is not None
                        and now >= next_biometric_reminder
                        and voice_enabled
                        and now - last_biometric_reminder_retry >= 2.0):
                    if speaker.alert_biometric_reminder():
                        next_biometric_reminder = now + reminder_sec
                        last_biometric_reminder_retry = 0.0
                        print(
                            f"[REMINDER] Da dua loi nhac do sinh trac hoc vao hang doi; "
                            f"lan tiep theo sau {reminder_sec:.0f}s.",
                            flush=True,
                        )
                    else:
                        # Neu loa dang loi/chua san sang, thu lai sau 2 giay.
                        last_biometric_reminder_retry = now

            if current_finger != last_finger_state:
                if voice_enabled:
                    if current_finger:
                        speaker.alert_finger_placed()
                    else:
                        speaker.alert_finger_removed()
                last_finger_state = current_finger
                last_hr_confirmed_state = False
                last_measuring_pulse_spoken = False
                vital_abnormal_spoken = False

            if health_allowed:
                out_health = resolve_health_output(health_result)

                if (current_finger
                        and out_health.health_status in ("WARMUP", "MEASURING")
                        and not last_measuring_pulse_spoken):
                    # Danh dau truoc khi dua vao hang doi de khong goi lap moi vong loop.
                    last_measuring_pulse_spoken = True
                    if voice_enabled and speaker.has_audio("measuring_pulse.mp3"):
                        speaker.alert_measuring_pulse()

                if current_finger and out_health.hr_reliable:
                    if not last_hr_confirmed_state:
                        # Da co ket qua do tin cay: bat dau lai chu ky nhac.
                        next_biometric_reminder = now + reminder_sec if reminder_sec > 0 else None
                        print(
                            f"[REMINDER] Da ghi nhan ket qua do; dat lai chu ky "
                            f"{reminder_sec:.0f}s.",
                            flush=True,
                        )

                    abnormal = (
                        out_health.bpm < float(pref_mgr.get('hrMin'))
                        or out_health.bpm > float(pref_mgr.get('hrMax'))
                        or (out_health.spo2 is not None
                            and out_health.spo2 < float(pref_mgr.get('spo2Min')))
                    )

                    if abnormal:
                        # Canh bao bat thuong duoc uu tien, phat ngay va co the cat loi nhac dang phat.
                        if not vital_abnormal_spoken and (sound_enabled or voice_enabled):
                            if sound_enabled:
                                speaker.alert_beep()
                            if voice_enabled:
                                speaker.alert_vital_abnormal()
                            # Danh dau da xu ly de tranh goi phat lap lai moi 5 ms.
                            vital_abnormal_spoken = True
                        # Khong phat measure_complete muon sau khi canh bao khan cap da phat.
                        last_hr_confirmed_state = True
                    else:
                        vital_abnormal_spoken = False
                        if not last_hr_confirmed_state:
                            # Latched truoc khi xep hang de tranh goi lap khi loa dang ban.
                            last_hr_confirmed_state = True
                            if voice_enabled and speaker.has_audio("measure_complete.mp3"):
                                speaker.alert_measure_complete()

                bpm = out_health.bpm if out_health.hr_reliable else 0.0
                spo2 = out_health.spo2 if out_health.spo2 is not None else 0.0
            else:
                last_hr_confirmed_state = False
                last_measuring_pulse_spoken = False
                vital_abnormal_spoken = False

            if not verified:
                posture_status = STATUS_UNKNOWN
                posture_label = "Lỗi kết nối Camera" if not camera_online else "Chưa xác thực khuôn mặt"
                is_in_zone, tracking_active = False, False

            # --------------------------------------------------
            # FIREBASE & DISPLAY
            # --------------------------------------------------
            if args.health_log and health_allowed:
                health.print_status(health_result)

            if now - last_state_update >= STATE_UPDATE_INTERVAL:
                publisher.update({
                    "posture_status": posture_status, "posture_label": posture_label,
                    "is_in_zone": is_in_zone, "tracking_active": tracking_active,
                    "bpm": bpm, "spo2": spo2,
                    "userId": (face_state["uid"] if face_controller and verified else None),
                })
                if tft is not None:
                    tft_health = health_for_tft(health_result) if health_allowed else {
                        "finger": False, "bpm": None, "spo2": None, "hr_reliable": False,
                        "health_status": ("REPLACE_FINGER" if verified else "LOCKED"),
                    }
                    tft.update(
                        posture_status=posture_status, posture_label=posture_label,
                        face_status=face_state["status"] if face_state else "DISABLED",
                        face_progress=face_state["progress"] if face_state else "",
                        **tft_health,
                    )
                last_state_update = now

            frame = posture.get_frame() if not headless else None
            if not headless:
                camera_has_frame = frame is not None
                if frame is None:
                    frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(frame, "CAMERA OFFLINE - RECONNECTING", (24, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2)
                else:
                    fps_count += 1

                fps_elapsed = time.monotonic() - fps_start
                if fps_elapsed >= 1.0:
                    display_fps = fps_count / fps_elapsed
                    fps_count = 0
                    fps_start = time.monotonic()

                if verified:
                    frame = draw_ui(frame, posture_view, display_fps)
                    if health_allowed:
                        frame = draw_health(frame, health_result)
                else:
                    state_str = face_state["status"] if face_state else "LOCKED"
                    text_msg = "FACE: " + state_str
                    if face_state and face_state["progress"]: text_msg += " " + face_state["progress"]
                    cv2.rectangle(frame, (10, 10), (min(630, frame.shape[1]-10), 96), (20, 25, 40), -1)
                    cv2.putText(frame, text_msg[:45], (20, 54), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 220, 255), 2)
                    cv2.putText(frame, "Sign in on Web to continue", (20, 83), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 1)

                cv2.imshow("Office Health System - Pi4", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    running = False

            time.sleep(0.005)

    except KeyboardInterrupt:
        print("\nKeyboard interrupt.")

    except Exception as exc:
        print("\n" + "=" * 64 + "\nMAIN SYSTEM ERROR\n" + "=" * 64)
        print(repr(exc))

    finally:
        print("\nStopping all modules...")
        for name, obj, method in (
            ("preferences", pref_mgr, "stop"),
            ("speaker", speaker, "stop"),
            ("publisher", publisher, "stop"),
            ("face", face_controller, "stop"),
            ("TFT", tft, "stop"),
            ("posture", posture, "stop"),
            ("MAX30102 sampler", sampler, "stop"),
            ("health", health, "stop"),
            ("Firebase", firebase, "close"),
        ):
            if obj is not None:
                try:
                    getattr(obj, method)()
                except Exception as stop_exc:
                    print(f"[SHUTDOWN WARNING] {name}: {stop_exc!r}", flush=True)
        try: cv2.destroyAllWindows()
        except: pass
        print("System shutdown complete.")

if __name__ == "__main__":
    main()