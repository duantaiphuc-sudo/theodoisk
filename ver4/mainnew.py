#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
mainnew.py (V8 + ST7789)
==============

OFFICE HEALTH - Raspberry Pi 4 integration

Pipeline:
    USB Webcam
        |
        v
    posture_worker.py
        YOLO11n-Pose ONNX
        7-feature SVM
        temporal filter
        |
        +----> posture snapshot
        |
    MAX30102
        |
        v
    health_worker.py
        PPGProcessor
        BPM / SpO2
        |
        +----> health snapshot
        |
        v
    FirebaseManager
        devices/pi4_node_1

Current Firestore fields written by this file:
    bpm
    heart_rate
    spo2
    posture_status
    posture_label
    is_in_zone
    tracking_active
    timestamp

Important:
    - No video is uploaded.
    - Firebase receives metadata/health values only.
    - Camera processing stays on the Raspberry Pi.
    - Firebase writes run in a separate publisher thread.
    - Long incorrect posture is promoted to status 3 after 120 s.
    - ST7789 uses SPI0 CE0; MAX30102 uses I2C1.
    - MAX30102 FIFO is continuously drained immediately after HealthWorker.start().
    - V8 PPG algorithm is imported from ppg_processor.py (unchanged).
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


# ============================================================
# CONFIG
# ============================================================

FIREBASE_PUSH_INTERVAL = 1.5

# Status mapping used by the current app/Firebase schema.
STATUS_GOOD = 0
STATUS_BAD = 1
STATUS_ABSENT = 2
STATUS_LONG_BAD = 3
STATUS_UNKNOWN = -1

# Keep this aligned with the previous application behavior.
LONG_BAD_SECONDS = 120.0

# Do not block the camera/PPG loop on Firestore.
FIREBASE_RETRY_SECONDS = 5.0

DISPLAY_HEALTH = True
TFT_DEFAULT_FPS = 2.0  # Display drawing is deliberately limited.
# Demo: users stand up or walk away to lock automatically. Tune these values.
FACE_AWAY_SECONDS = 6.0
FACE_STAND_SECONDS = 4.0
STATE_UPDATE_INTERVAL = 0.20  # Do not acquire locks on every 5 ms PPG poll.



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


def posture_to_schema(snapshot, bad_duration):
    """
    Convert posture_worker string state to the numeric schema
    consumed by the current app.

    Returns:
        posture_status
        posture_label
        is_in_zone
        tracking_active
    """

    status = str(snapshot.get("status", "ABSENT"))
    in_zone = bool(snapshot.get("is_in_zone", False))

    if status == "VERIFYING":
        return (STATUS_UNKNOWN, "Đang xác nhận tư thế", True, True)

    if status == "GOOD":
        return (
            STATUS_GOOD,
            "Đúng",
            True,
            True,
        )

    if status == "BAD":
        if bad_duration >= LONG_BAD_SECONDS:
            return (
                STATUS_LONG_BAD,
                "Sai tư thế lâu",
                True,
                True,
            )

        return (
            STATUS_BAD,
            "Sai tư thế",
            True,
            True,
        )

    if status == "STAND":
        # Camera still tracks a person, but this node is not in a
        # seated-posture state. The current app schema uses status 2
        # for "not seated / away".
        return (
            STATUS_ABSENT,
            "Đứng / Không ngồi",
            True,
            True,
        )

    if status == "NGOAI VUNG GIAM SAT":
        return (
            STATUS_ABSENT,
            "Ngoài vùng quan sát",
            False,
            True,
        )

    if status == "ERROR":
        return (
            STATUS_UNKNOWN,
            "Lỗi AI",
            False,
            False,
        )

    return (
        STATUS_ABSENT,
        "Vắng / Không phát hiện",
        False,
        False,
    )


def health_to_schema(result):
    """Firebase's existing schema: 0 while measuring/invalid, never raw HR.

    bpm and heart_rate are written as the SAME confirmed V8 BPM by
    firebase_manager.py. 0 intentionally clears stale values for the app.
    SpO2 remains independent as in V8.
    """
    out = resolve_health_output(result)
    return (out.bpm if out.hr_reliable else 0.0,
            out.spo2 if out.spo2 is not None else 0.0)


def health_for_tft(result):
    """Use the identical reliability decision as the camera and Firebase."""
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
    """Automatically lock a verified session on prolonged absence/standing.

    The return clock is (reason, start_time) so changes from STAND to ABSENT
    cannot inherit an old timer. A stationary stand will intentionally lock
    after stand_seconds in this *demo* profile; this should be disabled for
    a production sit/stand ergonomic-monitoring mode.
    """
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


# ============================================================
# DEDICATED MAX30102 SAMPLER
# ============================================================

class HealthSampler:
    """One owner of HealthWorker.process_once(). Camera/Firebase/TFT only
    read an immutable snapshot. Start immediately after HealthWorker.start(),
    BEFORE any slow Firebase or TFT initialization.
    """
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
            # Reader is alive but no new RED/IR FIFO samples arrived.
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
    """
    Non-blocking latest-state publisher.

    The publisher intentionally keeps only the newest state.
    Older states are discarded because this is a realtime node,
    not the historical database writer.
    """

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
                    # Unmodified V8 realtime schema without face authentication.
                    ok = self.manager.safe_update_runtime(
                        posture_status=state["posture_status"],
                        posture_label=state["posture_label"],
                        is_in_zone=state["is_in_zone"],
                        tracking_active=state["tracking_active"],
                        bpm=state["bpm"],
                        spo2=state["spo2"],
                    )
                else:
                    # UID and metrics go in ONE Firestore write. Never associate
                    # health data with a previous user after reassignment.
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

                print(
                    f"\nFirebase publisher error: {exc}"
                )

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

    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run without OpenCV GUI.",
    )

    parser.add_argument(
        "--gui",
        action="store_true",
        help="Force OpenCV GUI.",
    )

    parser.add_argument(
        "--no-tft", action="store_true",
        help="Disable ST7789; continue camera, health and Firebase.",
    )
    parser.add_argument(
        "--tft-fps", type=float, default=TFT_DEFAULT_FPS,
        help="ST7789 refresh rate, default 2 FPS (0.5-5 recommended).",
    )
    parser.add_argument(
        "--health-log", action="store_true",
        help="Print V8 PPG diagnostics approximately every 2 seconds.",
    )

    parser.add_argument("--face-auth", action="store_true",
                        help="Enable Firestore enrollment/login face commands.")
    parser.add_argument("--yunet-model", default=None,
                        help="Path to YuNet ONNX model")
    parser.add_argument("--sface-model", default=None,
                        help="Path to SFace ONNX model")
    parser.add_argument("--face-threshold", type=float, default=0.72,
                        help="Cosine threshold; must be calibrated for actual users")

    args = parser.parse_args()
    if not 0.2 <= args.tft_fps <= 10:
        parser.error("--tft-fps must be between 0.2 and 10")

    # Raspberry Pi OS Lite / SSH:
    # no DISPLAY -> automatically use headless mode.
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
    absent_since = None
    last_face_epoch = None
    # After a login/UID transition, MAX30102 must see NO_FINGER first.
    # Do not reuse an in-flight V8 buffer from the previous occupant.
    health_session_finger_rearmed = False

    running = True

    bad_start = None
    last_bad_duration = 0.0
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
        # ------------------------------------------------------
        # POSTURE
        # ------------------------------------------------------

        print()
        print("[1/4] Starting posture worker...")

        posture = PostureWorker()
        posture.start()
        posture_view = PostureDisplayView(posture)
        # Keep YOLO enabled while locked so the Pi can distinguish standing
        # from sitting on return. Only *publishing* health data is gated by
        # SFace authentication; this costs more CPU than paused-inference mode.
        if args.face_auth and hasattr(posture, 'set_ai_enabled'):
            posture.set_ai_enabled(True)

        print("Posture worker: OK")

        # ------------------------------------------------------
        # HEALTH
        # ------------------------------------------------------

        print()
        print("[2/4] Starting MAX30102 V8 health worker...")
        import health_worker as _hmod
        import ppg_processor as _pmod
        print("Health module:", _hmod.__file__)
        print("PPG V8 module:", _pmod.__file__)

        health = HealthWorker()
        health.start()
        # Begin draining the MAX30102 FIFO BEFORE Firebase/TFT startup.
        # The camera loop must never be responsible for sampling I2C.
        sampler = HealthSampler(health)
        sampler.start()

        print("Health worker: OK (dedicated FIFO reader started)")

        # ------------------------------------------------------
        # FIREBASE
        # ------------------------------------------------------

        print()
        print("[3/4] Connecting Firestore...")

        firebase = FirebaseManager()

        device = firebase.get_device()

        if device is None:
            print(
                "Firestore: connected; device document will be created."
            )
        else:
            print(
                f"Firestore: connected; existing fields={len(device)}"
            )

        if args.face_auth:
            # Only import biometric/Firebase watch code when explicitly enabled.
            # Preserve stock V8 startup/tests with --face-auth disabled.
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
            print("YuNet:", yunet_path, "SFace:", sface_path)

        publisher = FirebasePublisher(firebase, face_controller=face_controller)
        publisher.start()

        # ------------------------------------------------------
        # ST7789 (SPI - independent of MAX30102 I2C)
        # ------------------------------------------------------
        print("[4/4] Initializing ST7789 TFT...")
        if args.no_tft:
            print("TFT: disabled by --no-tft")
        else:
            try:
                tft = TftDisplayWorker(fps=args.tft_fps)
                tft.start()
                print(f"ST7789: started on SPI0 CE0 at {args.tft_fps:g} FPS")
            except Exception as exc:
                # A screen problem must not disable PPG, AI or Firebase.
                print(f"WARNING: ST7789 unavailable: {exc!r}")
                if tft is not None:
                    try:
                        tft.stop()
                    except Exception:
                        pass
                tft = None

        print()
        print("=" * 64)
        print("SYSTEM RUNNING")
        print("=" * 64)
        print("Camera AI : STARTED (camera readiness checked dynamically)")
        print("MAX30102  : V8 ON (exclusive cooperating-process lock)")
        print("Firebase  : ON")
        print(f"Face auth : {'ON (hands-free automatic)' if face_controller else 'OFF (legacy mode)'}")
        print(f"Firebase interval: {FIREBASE_PUSH_INTERVAL:.1f}s")
        print(f"Long bad posture threshold: {LONG_BAD_SECONDS:.0f}s")
        print("Posture confirmation: BAD >=85% of 30s; GOOD recovery >=85% of 8s")
        print(f"OpenCV    : {'HEADLESS' if headless else 'GUI'}")
        print(f"ST7789   : {'ON (SPI)' if tft is not None else 'OFF'}")
        print()
        print("Press Q to quit when GUI is enabled.")
        print("Press Ctrl+C to quit at any time.")
        print()

        fps_count = 0
        fps_start = time.monotonic()
        display_fps = 0.0
        last_state_update = 0.0

        while running:
            # --------------------------------------------------
            # POSTURE SNAPSHOT
            # --------------------------------------------------

            posture_snapshot = posture.get_snapshot()
            now = time.monotonic()

            # IMPORTANT: use raw_status from the AI, not its old 1-second
            # filtered status, when available. Never count stale snapshots.
            if posture_snapshot.get("stale", False) or posture_snapshot.get("status") == "ERROR":
                raw_posture = "ERROR"
            else:
                raw_posture = posture_snapshot.get(
                    "raw_status", posture_snapshot.get("status", "ABSENT")
                )

            face_state = face_controller.snapshot() if face_controller else None
            verified = face_controller is None or face_controller.is_verified()
            if face_controller:
                absent_since = update_face_presence(
                    face_controller, posture_snapshot, raw_posture,
                    absent_since, now)

            if face_controller:
                face_state = face_controller.snapshot()
                verified = face_controller.is_verified()
                if last_face_epoch != face_state["epoch"]:
                    # No posture evidence or BAD timer may cross login boundaries.
                    posture_filter.reset()
                    bad_start = None
                    last_bad_duration = 0.0
                    last_posture_observation = None
                    stable_posture_status = "VERIFYING"
                    last_face_epoch = face_state["epoch"]
                    health_session_finger_rearmed = False
                    # Automatic relogin requires fresh pose even while locked.
                    # Do NOT pause YOLO when leaving VERIFIED.
                    if hasattr(posture, 'set_ai_enabled'):
                        posture.set_ai_enabled(True)
                    print("FACE STATE:", face_state["status"],
                          "progress:", face_state["progress"], flush=True)

            # Time-based evidence (not frame count). At most 5 checks per
            # second, even if main loop draws many duplicate camera frames.
            if verified and (last_posture_observation is None or
                    now - last_posture_observation >= STATE_UPDATE_INTERVAL):
                stable_posture_status = posture_filter.update(raw_posture, now)
                last_posture_observation = now
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

            # All downstream outputs must use this exact filtered snapshot.
            if not verified:
                stable_posture_status = "VERIFYING"
            posture_snapshot["status"] = stable_posture_status
            posture_snapshot["raw_ai_status"] = raw_posture
            posture_snapshot["color"] = {
                "GOOD": (0, 255, 0),
                "BAD": (0, 0, 255),
                "VERIFYING": (0, 200, 255),
            }.get(stable_posture_status, (0, 255, 255))
            posture_view.set_snapshot(posture_snapshot)
            posture_status_text = stable_posture_status

            # Long-bad timer counts confirmed BAD. A few noisy GOOD frames
            # cannot reset this timer; confirmed GOOD / absence / error can.

            if posture_status_text == "BAD":
                if bad_start is None:
                    bad_start = now

                last_bad_duration = now - bad_start

            else:
                bad_start = None
                last_bad_duration = 0.0

            (
                posture_status,
                posture_label,
                is_in_zone,
                tracking_active,
            ) = posture_to_schema(
                posture_snapshot,
                last_bad_duration,
            )

            # --------------------------------------------------
            # HEALTH
            # --------------------------------------------------

            health_result = sampler.snapshot()
            # On UID/session changes, wait for the physical finger to be lifted
            # and placed again before publishing *personal* health readings.
            if face_controller and not health_result.get('finger_detected', False):
                health_session_finger_rearmed = True
            health_allowed = verified and (face_controller is None or health_session_finger_rearmed)
            bpm, spo2 = health_to_schema(health_result) if health_allowed else (0.0, 0.0)
            if not verified:
                # README face guide: a lost USB camera is an AI hardware error,
                # never the same as an absent employee or a locked login.
                # AI may be stale during intentional pause while camera remains online.
                camera_offline = posture_snapshot.get("camera_online") is False
                posture_status = STATUS_UNKNOWN
                posture_label = "Lỗi AI" if camera_offline else "Chưa xác thực khuôn mặt"
                is_in_zone, tracking_active = False, False

            # --------------------------------------------------
            # PUBLISH SHARED SNAPSHOT TO FIREBASE + ST7789
            # --------------------------------------------------
            if args.health_log and health_allowed:
                health.print_status(health_result)

            if now - last_state_update >= STATE_UPDATE_INTERVAL:
                publisher.update(
                    {
                        "posture_status": posture_status,
                        "posture_label": posture_label,
                        "is_in_zone": is_in_zone,
                        "tracking_active": tracking_active,
                        "bpm": bpm,
                        "spo2": spo2,
                        "userId": (face_state["uid"] if face_controller and verified else None),
                    }
                )
                if tft is not None:
                    tft_health = health_for_tft(health_result) if health_allowed else {
                        "finger": False, "bpm": None, "spo2": None,
                        "hr_reliable": False, "health_status": (
                            "REPLACE_FINGER" if verified else "LOCKED"),
                    }
                    tft.update(
                        posture_status=posture_status,
                        posture_label=posture_label,
                        face_status=face_state["status"] if face_state else "DISABLED",
                        face_progress=face_state["progress"] if face_state else "",
                        **tft_health,
                    )
                last_state_update = now

            # --------------------------------------------------
            # DISPLAY
            # --------------------------------------------------

            frame = posture.get_frame() if not headless else None

            if not headless:
                camera_has_frame = frame is not None
                if frame is None:
                    frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(frame, "CAMERA OFFLINE - RECONNECTING",
                                (24, 90), cv2.FONT_HERSHEY_SIMPLEX,
                                0.65, (0, 0, 255), 2)
                if camera_has_frame:
                    fps_count += 1

                fps_elapsed = (
                    time.monotonic()
                    - fps_start
                )

                if fps_elapsed >= 1.0:
                    display_fps = (
                        fps_count
                        / fps_elapsed
                    )

                    fps_count = 0
                    fps_start = time.monotonic()

                if verified:
                    frame = draw_ui(frame, posture_view, display_fps)
                    if health_allowed:
                        frame = draw_health(frame, health_result)
                else:
                    state_str = face_state["status"] if face_state else "LOCKED"
                    text_msg = "FACE: " + state_str
                    if face_state and face_state["progress"]:
                        text_msg += " " + face_state["progress"]
                    cv2.rectangle(frame, (10, 10), (min(630, frame.shape[1]-10), 96),
                                  (20, 25, 40), -1)
                    cv2.putText(frame, text_msg[:45], (20, 54),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 220, 255), 2)
                    cv2.putText(frame, "Sign in on Web to continue", (20, 83),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 1)

                cv2.imshow(
                    "Office Health System - Pi4",
                    frame,
                )

                key = (
                    cv2.waitKey(1)
                    & 0xFF
                )

                if key == ord("q"):
                    running = False

            time.sleep(0.005)

    except KeyboardInterrupt:
        print("\nKeyboard interrupt.")

    except Exception as exc:
        print()
        print("=" * 64)
        print("MAIN SYSTEM ERROR")
        print("=" * 64)
        print(repr(exc))

    finally:
        print()
        print("Stopping all modules...")

        if publisher is not None:
            try:
                publisher.stop()
            except Exception as exc:
                print("Firebase publisher stop error:", exc)

        if face_controller is not None:
            try:
                face_controller.stop()
            except Exception as exc:
                print("Face controller stop error:", exc)
            if firebase is not None:
                try:
                    # Clear runtime data at session shutdown; no stale personal metrics.
                    from firebase_admin import firestore as _firestore
                    firebase.doc_ref.set({
                        "userId": None, "posture_status": STATUS_UNKNOWN,
                        "posture_label": "Đã kết thúc phiên", "is_in_zone": False,
                        "tracking_active": False, "bpm": 0.0,
                        "heart_rate": 0.0, "spo2": 0.0,
                        "timestamp": _firestore.SERVER_TIMESTAMP,
                    }, merge=True)
                except Exception as exc:
                    print("Face shutdown telemetry clear warning:", exc)

        if tft is not None:
            try:
                tft.stop()
            except Exception as exc:
                print("ST7789 stop error:", exc)

        if posture is not None:
            try:
                posture.stop()
            except Exception as exc:
                print("Posture stop error:", exc)

        if sampler is not None:
            try:
                sampler.stop()
            except Exception as exc:
                print("MAX30102 sampler stop error:", exc)

        if health is not None:
            try:
                health.stop()
            except Exception as exc:
                print("Health stop error:", exc)

        if firebase is not None:
            try:
                firebase.close()
            except Exception as exc:
                print("Firebase close error:", exc)

        try:
            cv2.destroyAllWindows()
        except Exception:
            pass

        print("All modules stopped.")
        print("System shutdown complete.")


if __name__ == "__main__":
    main()
