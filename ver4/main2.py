#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
main2.py - OFFICE HEALTH SYSTEM WITH VOICE AUDIO ALERTS & FULL FEATURE PARITY
=============================================================================
Pipeline:
    USB Webcam -> PostureWorker (YOLO11n-Pose ONNX + SVM)
               -> FaceController (YuNet + SFace Authentication)
    MAX30102   -> HealthWorker (PPG V8 + Safe Mode Reader)
    MAX98357A  -> SpeakerManager (Non-blocking MP3 Voice Alerts)
    Firebase   -> Realtime Sync & Preferences Listener
    ST7789     -> SPI Display
"""

import argparse
import os
import threading
import time

import cv2
import numpy as np

from posture_worker2 import PostureWorker, draw_ui
from firebase_manager import FirebaseManager
from tft_display_worker import TftDisplayWorker
from health_output import resolve_health_output
from posture_stabilizer import PostureStabilizer, PostureDisplayView
from speaker_manager import SpeakerManager

try:
    from health_worker import HealthWorker
except Exception:
    HealthWorker = None


# ============================================================
# CONFIG & REALTIME PREFERENCES FROM WEB
# ============================================================

FIREBASE_PUSH_INTERVAL = 1.5

STATUS_GOOD = 0
STATUS_BAD = 1
STATUS_ABSENT = 2
STATUS_LONG_BAD = 3
STATUS_UNKNOWN = -1

config_lock = threading.Lock()
USER_CONFIG = {
    "incorrectPostureSec": 20.0,
    "longIncorrectSec": 120.0,
    "longSittingSec": 3600.0,
    "soundEnabled": True,
    "voiceAlertEnabled": True,
}

FIREBASE_RETRY_SECONDS = 5.0
DISPLAY_HEALTH = True
TFT_DEFAULT_FPS = 2.0
FACE_AWAY_SECONDS = 6.0
FACE_STAND_SECONDS = 4.0
STATE_UPDATE_INTERVAL = 0.20

# Khoang cach giua 2 lan phat canh bao giong noi (giay)
SPEAKER_COOLDOWN = 12.0


# ============================================================
# FIREBASE PREFERENCES LISTENER
# ============================================================

class PreferencesListener:
    """Listens to users/{userId}/preferences/office_health on Firestore"""
    def __init__(self, db):
        self.db = db
        self.watch = None
        self.current_uid = None

    def update_user(self, user_id):
        if self.current_uid == user_id:
            return

        if self.watch:
            try:
                self.watch.unsubscribe()
            except Exception:
                pass
            self.watch = None

        self.current_uid = user_id
        if not user_id:
            return

        def on_snapshot(doc_snapshot, changes, read_time):
            for doc in doc_snapshot:
                if doc.exists:
                    data = doc.to_dict()
                    with config_lock:
                        USER_CONFIG["incorrectPostureSec"] = float(data.get("incorrectPostureSec", 20.0))
                        USER_CONFIG["longIncorrectSec"] = float(data.get("longIncorrectSec", 120.0))
                        USER_CONFIG["longSittingSec"] = float(data.get("longSittingSec", 3600.0))
                        USER_CONFIG["soundEnabled"] = bool(data.get("soundEnabled", True))
                        USER_CONFIG["voiceAlertEnabled"] = bool(data.get("voiceAlertEnabled", True))

                    print(f"\n[WEB PREFERENCES UPDATED] incorrectSec: {USER_CONFIG['incorrectPostureSec']}s, "
                          f"longIncorrectSec: {USER_CONFIG['longIncorrectSec']}s, "
                          f"soundEnabled: {USER_CONFIG['soundEnabled']}", flush=True)

        try:
            doc_ref = self.db.collection("users").document(user_id).collection("preferences").document("office_health")
            self.watch = doc_ref.on_snapshot(on_snapshot)
            print(f"[PREFERENCES] Subscribed to preferences for UID: {user_id}")
        except Exception as exc:
            print(f"[PREFERENCES ERROR] Cannot subscribe: {exc!r}")

    def stop(self):
        if self.watch:
            try:
                self.watch.unsubscribe()
            except Exception:
                pass
            self.watch = None


# ============================================================
# HELPERS & UI DRAWING
# ============================================================

def play_sound_async(sound_func):
    """Queue sound without blocking the main AI loop."""
    with config_lock:
        sound_on = USER_CONFIG["soundEnabled"]

    if sound_on and sound_func:
        sound_func()


def posture_to_schema(snapshot, bad_duration, long_bad_threshold):
    status = str(snapshot.get("status", "ABSENT"))

    if status == "VERIFYING":
        return (STATUS_UNKNOWN, "Dang xac nhan tu the", True, True)

    if status == "GOOD":
        return (STATUS_GOOD, "Dung tu the", True, True)

    if status == "BAD":
        if bad_duration >= long_bad_threshold:
            return (STATUS_LONG_BAD, "Sai tu the lau", True, True)
        return (STATUS_BAD, "Sai tu the", True, True)

    if status == "STAND":
        return (STATUS_ABSENT, "Dung / Khong ngoi", True, True)

    if status == "NGOAI VUNG GIAM SAT":
        return (STATUS_ABSENT, "Ngoai vung quan sat", False, True)

    if status == "ERROR":
        return (STATUS_UNKNOWN, "Loi AI", False, False)

    return (STATUS_ABSENT, "Vang / Khong phat hien", False, False)


def health_to_schema(result):
    if not result:
        return 0.0, 0.0
    out = resolve_health_output(result)
    return (out.bpm if out.hr_reliable else 0.0,
            out.spo2 if out.spo2 is not None else 0.0)


def health_for_tft(result):
    if not result:
        return {
            "finger": False, "bpm": None, "spo2": None,
            "hr_reliable": False, "hr_age": None, "sqi": 0.0,
            "warmup": 0.0, "health_status": "OFFLINE",
        }
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
                         absence_seconds=FACE_AWAY_SECONDS,
                         stand_seconds=FACE_STAND_SECONDS):
    if controller is None or not controller.is_verified():
        return None
    if snapshot.get('camera_online') is False:
        controller.lock('CAMERA_OFFLINE')
        return None
    if raw_status == 'STAND':
        reason, threshold = 'STANDING', stand_seconds
    elif raw_status in ('ABSENT', 'NGOAI VUNG GIAM SAT'):
        reason, threshold = 'ABSENT', absence_seconds
    else:
        return None
    previous_reason, start_time = (absent_since if isinstance(absent_since, tuple)
                                    else (None, None))
    if previous_reason != reason or start_time is None:
        return (reason, now)
    if now - start_time >= threshold:
        controller.lock('AUTO_LOCK_' + reason)
        return None
    return (reason, start_time)


def draw_health(frame, result):
    """Ve thong tin nhip tim PPG MAX30102 len man hinh OpenCV GUI"""
    if not DISPLAY_HEALTH or not result:
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
        (0, f"PPG: {status_text}", (255, 255, 255), 0.62),
        (27, hr_text, (0, 255, 0) if out.hr_reliable else (0, 190, 255), 0.62),
        (54, spo2_text, (0, 255, 255), 0.65),
        (81, detail_text, (255, 255, 255), 0.48),
    ):
        cv2.putText(frame, txt, (x, y + offset), cv2.FONT_HERSHEY_SIMPLEX, scale, color, 2)
    return frame


# ============================================================
# DEDICATED MAX30102 SAMPLER (SAFE MODE)
# ============================================================

class HealthSampler:
    def __init__(self, worker, poll_seconds=0.01):
        self.worker = worker
        self.poll_seconds = float(poll_seconds)
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        self.thread = None
        self._latest = {
            "status": "OFFLINE", "finger_detected": False,
            "warmup_complete": False, "warmup_remaining": 0.0,
            "bpm": None, "spo2": None, "sqi": 0.0,
            "samples_total": 0, "last_ir_raw": None,
        }
        self._last_update = None
        self._last_sample_progress = time.monotonic()
        self._sample_count = 0
        self._error = None

    def start(self):
        if self.worker is None:
            return
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
                print(f"[MAX30102] Sensor unplugged or error: {exc!r}", flush=True)
                self.stop_event.set()
                break
            self.stop_event.wait(self.poll_seconds)

    def snapshot(self):
        if self.worker is None:
            return dict(self._latest)
        with self.lock:
            result = dict(self._latest)
            last_update = self._last_update
            last_progress = self._last_sample_progress
            error = self._error
        now = time.monotonic()
        if error:
            status = "SENSOR_OFFLINE"
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
            self.thread.join(timeout=2.0)
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
            target=self._loop, name="firebase-publisher", daemon=True
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
                            "posture_label": "Chua xac thuc khuon mat",
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
                print(f"\nFirebase publisher error: {exc}")
                next_push = now + FIREBASE_RETRY_SECONDS

    def stop(self):
        self.running = False
        if self.thread is not None:
            self.thread.join(timeout=2.0)
        self.thread = None


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--headless", action="store_true", help="Run without OpenCV GUI.")
    parser.add_argument("--gui", action="store_true", help="Force OpenCV GUI.")
    parser.add_argument("--no-tft", action="store_true", help="Disable ST7789.")
    parser.add_argument("--tft-fps", type=float, default=TFT_DEFAULT_FPS, help="ST7789 refresh rate.")
    parser.add_argument("--health-log", action="store_true", help="Print V8 PPG diagnostics.")
    parser.add_argument("--face-auth", action="store_true", help="Enable Firestore face commands.")
    parser.add_argument("--yunet-model", default=None, help="Path to YuNet ONNX model")
    parser.add_argument("--sface-model", default=None, help="Path to SFace ONNX model")
    parser.add_argument("--face-threshold", type=float, default=0.72, help="Cosine threshold")

    args = parser.parse_args()

    headless = args.headless if args.headless else (not args.gui and not bool(os.environ.get("DISPLAY")))

    posture = None
    health = None
    firebase = None
    publisher = None
    tft = None
    sampler = None
    speaker = None
    face_controller = None
    pref_listener = None

    absent_since = None
    last_face_epoch = None
    health_session_finger_rearmed = False
    running = True

    bad_start = None
    last_bad_duration = 0.0
    last_audio_alert_time = 0.0
    long_bad_alert_triggered = False

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
        # 1. SPEAKER (MAX98357A I2S)
        print("\n[1/5] Starting I2S Speaker Manager...")
        speaker = SpeakerManager(device_id=0)
        play_sound_async(speaker.alert_system_ready)

        # 2. POSTURE (YOLO11n-Pose)
        print("\n[2/5] Starting posture worker...")
        posture = PostureWorker()
        posture.start()
        posture_view = PostureDisplayView(posture)
        if args.face_auth and hasattr(posture, 'set_ai_enabled'):
            posture.set_ai_enabled(True)

        # 3. HEALTH (MAX30102 SAFE-MODE)
        print("\n[3/5] Starting MAX30102 V8 health worker...")
        try:
            if HealthWorker is not None:
                health = HealthWorker()
                health.start()
                sampler = HealthSampler(health)
                sampler.start()
                print("MAX30102: ONLINE")
            else:
                raise RuntimeError("HealthWorker module missing")
        except Exception as exc:
            print(f"WARNING: MAX30102 unavailable ({exc}). Running in SAFE MODE without PPG.")
            health = None
            sampler = HealthSampler(None)

        # 4. FIREBASE & PREFERENCES LISTENER
        print("\n[4/5] Connecting Firestore...")
        firebase = FirebaseManager()
        pref_listener = PreferencesListener(firebase.db)

        if args.face_auth:
            from face.face_controller import FaceController
            import glob
            def locate(explicit, patterns):
                if explicit:
                    return explicit
                for pattern in patterns:
                    found = sorted(glob.glob(pattern))
                    if found:
                        return found[0]
                raise FileNotFoundError("Cannot find face model: " + repr(patterns))

            yunet_path = locate(args.yunet_model, [
                "face/models/*yunet*.onnx", "models/*yunet*.onnx",
                "face/*yunet*.onnx", "*yunet*.onnx",
            ])
            sface_path = locate(args.sface_model, [
                "face/models/*sface*.onnx", "models/*sface*.onnx",
                "face/*sface*.onnx", "*sface*.onnx",
            ])
            face_controller = FaceController(
                db=firebase.db, device_id=firebase.document_id,
                camera=posture, yunet_model=yunet_path,
                sface_model=sface_path, threshold=args.face_threshold,
            )
            face_controller.start()
            print("Face Auth : ACTIVE - Firestore commands; session initially locked")

        publisher = FirebasePublisher(firebase, face_controller=face_controller)
        publisher.start()

        # 5. TFT DISPLAY
        print("\n[5/5] Initializing ST7789 TFT...")
        if not args.no_tft:
            try:
                tft = TftDisplayWorker(fps=args.tft_fps)
                tft.start()
            except Exception as exc:
                print(f"WARNING: ST7789 unavailable: {exc!r}")

        print("\nSYSTEM RUNNING SUCCESSFULLY\n")

        fps_count = 0
        fps_start = time.monotonic()
        display_fps = 0.0
        last_state_update = 0.0

        while running:
            posture_snapshot = posture.get_snapshot()
            now = time.monotonic()

            if posture_snapshot.get("stale", False) or posture_snapshot.get("status") == "ERROR":
                raw_posture = "ERROR"
            else:
                raw_posture = posture_snapshot.get("raw_status", posture_snapshot.get("status", "ABSENT"))

            face_state = face_controller.snapshot() if face_controller else None
            verified = face_controller is None or face_controller.is_verified()

            current_uid = face_state["uid"] if (face_state and verified) else None
            if pref_listener:
                pref_listener.update_user(current_uid)

            if face_controller:
                absent_since = update_face_presence(face_controller, posture_snapshot, raw_posture, absent_since, now)
                if last_face_epoch != face_state["epoch"]:
                    posture_filter.reset()
                    bad_start = None
                    last_bad_duration = 0.0
                    last_posture_observation = None
                    stable_posture_status = "VERIFYING"
                    last_face_epoch = face_state["epoch"]
                    health_session_finger_rearmed = False
                    if hasattr(posture, 'set_ai_enabled'):
                        posture.set_ai_enabled(True)

            if verified and (last_posture_observation is None or now - last_posture_observation >= STATE_UPDATE_INTERVAL):
                stable_posture_status = posture_filter.update(raw_posture, now)
                last_posture_observation = now
                if stable_posture_status != last_posture_status_printed:
                    print(f"POSTURE: {last_posture_status_printed or 'START'} -> {stable_posture_status}", flush=True)
                    last_posture_status_printed = stable_posture_status

            if not verified:
                stable_posture_status = "VERIFYING"

            posture_snapshot["status"] = stable_posture_status
            posture_snapshot["raw_ai_status"] = raw_posture
            posture_snapshot["color"] = {
                "GOOD": (0, 255, 0), "BAD": (0, 0, 255), "VERIFYING": (0, 200, 255)
            }.get(stable_posture_status, (0, 255, 255))
            
            posture_view.set_snapshot(posture_snapshot)

            # --- DYNAMIC CONFIG & MP3 VOICE ALERT LOGIC ---
            with config_lock:
                incorrect_sec = USER_CONFIG["incorrectPostureSec"]
                long_incorrect_sec = USER_CONFIG["longIncorrectSec"]

            if stable_posture_status == "BAD":
                if bad_start is None:
                    bad_start = now
                last_bad_duration = now - bad_start

                # Cảnh báo 1: Sai tư thế kéo dài (long_incorrect.mp3)
                if last_bad_duration >= long_incorrect_sec:
                    if not long_bad_alert_triggered:
                        play_sound_async(speaker.alert_long_incorrect)
                        long_bad_alert_triggered = True

                # Cảnh báo 2: Mới bắt đầu sai tư thế (posture_incorrect.mp3)
                elif last_bad_duration >= incorrect_sec:
                    if now - last_audio_alert_time >= SPEAKER_COOLDOWN:
                        play_sound_async(speaker.alert_posture_incorrect)
                        last_audio_alert_time = now
            else:
                bad_start = None
                last_bad_duration = 0.0
                long_bad_alert_triggered = False

            # Cảnh báo 3: Ra ngoài vùng quan sát (out_of_zone.mp3)
            if stable_posture_status == "NGOAI VUNG GIAM SAT":
                if now - last_audio_alert_time >= SPEAKER_COOLDOWN:
                    play_sound_async(speaker.alert_out_of_zone)
                    last_audio_alert_time = now

            posture_status, posture_label, is_in_zone, tracking_active = posture_to_schema(
                posture_snapshot, last_bad_duration, long_incorrect_sec
            )

            # HEALTH SNAPSHOT (MAX30102)
            health_result = sampler.snapshot()
            if face_controller and not health_result.get('finger_detected', False):
                health_session_finger_rearmed = True

            health_allowed = verified and (face_controller is None or health_session_finger_rearmed)
            bpm, spo2 = health_to_schema(health_result) if health_allowed else (0.0, 0.0)

            if not verified:
                camera_offline = posture_snapshot.get("camera_online") is False
                posture_status = STATUS_UNKNOWN
                posture_label = "Loi AI" if camera_offline else "Chua xac thuc khuon mat"
                is_in_zone, tracking_active = False, False

            if args.health_log and health_allowed and health:
                health.print_status(health_result)

            if now - last_state_update >= STATE_UPDATE_INTERVAL:
                publisher.update({
                    "posture_status": posture_status, "posture_label": posture_label,
                    "is_in_zone": is_in_zone, "tracking_active": tracking_active,
                    "bpm": bpm, "spo2": spo2,
                    "userId": current_uid,
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

            # DISPLAY OPENCV GUI
            frame = posture.get_frame() if not headless else None
            if not headless:
                camera_has_frame = frame is not None
                if frame is None:
                    frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(frame, "CAMERA OFFLINE", (24, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2)
                
                if camera_has_frame:
                    fps_count += 1

                fps_elapsed = time.monotonic() - fps_start
                if fps_elapsed >= 1.0:
                    display_fps = fps_count / fps_elapsed
                    fps_count, fps_start = 0, time.monotonic()

                # VẼ HIỂN THỊ TÙY THEO TRẠNG THÁI XÁC THỰC KHUÔN MẶT
                if verified:
                    frame = draw_ui(frame, posture_view, display_fps)
                    if health_allowed:
                        frame = draw_health(frame, health_result)
                else:
                    state_str = face_state["status"] if face_state else "LOCKED"
                    text_msg = "FACE: " + state_str
                    if face_state and face_state["progress"]:
                        text_msg += " " + face_state["progress"]
                    cv2.rectangle(frame, (10, 10), (min(630, frame.shape[1]-10), 96), (20, 25, 40), -1)
                    cv2.putText(frame, text_msg[:45], (20, 54), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 220, 255), 2)
                    cv2.putText(frame, "Sign in on Web to continue", (20, 83), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 1)

                cv2.imshow("Office Health System - Pi4", frame)
                if (cv2.waitKey(1) & 0xFF) == ord("q"):
                    running = False

            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\nKeyboard interrupt.")
    except Exception as exc:
        print(f"\nMAIN SYSTEM ERROR: {exc!r}")
    finally:
        print("\nStopping all modules...")
        if pref_listener: pref_listener.stop()
        if publisher: publisher.stop()
        if face_controller: face_controller.stop()
        if tft: tft.stop()
        if posture: posture.stop()
        if sampler: sampler.stop()
        if health:
            try: health.stop()
            except Exception: pass
        if speaker:
            try: speaker.stop()
            except Exception: pass
        if firebase: firebase.close()
        cv2.destroyAllWindows()
        print("Shutdown complete.")


if __name__ == "__main__":
    main()