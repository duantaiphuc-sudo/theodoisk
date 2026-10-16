#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
camera.py
=========

Quản lý USB Webcam trên Raspberry Pi 4.

Nhiệm vụ:
    - Mở camera bằng V4L2
    - MJPG
    - 640x480
    - 30 FPS
    - Buffer = 1
    - Chạy capture ở background thread
    - Luôn giữ frame mới nhất
    - Cung cấp FPS thực tế

KHÔNG chứa:
    - YOLO
    - SVM
    - Firebase
    - MAX30102
    - Posture classification
"""

import cv2
import time
import threading


# ============================================================
# CONFIG
# ============================================================

CAMERA_ID = 0

CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
CAMERA_FPS = 30

USE_MJPEG = True

BUFFER_SIZE = 1


# ============================================================
# CAMERA CLASS
# ============================================================

class Camera:

    def __init__(
        self,
        camera_id=CAMERA_ID,
        width=CAMERA_WIDTH,
        height=CAMERA_HEIGHT,
        fps=CAMERA_FPS
    ):

        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.fps_target = fps

        self.cap = None

        self.running = False

        self.thread = None

        # ----------------------------------------------------
        # Latest frame
        # ----------------------------------------------------

        self.latest_frame = None

        self.frame_id = 0

        self.lock = threading.Lock()

        # ----------------------------------------------------
        # FPS
        # ----------------------------------------------------

        self.fps_count = 0

        self.fps_start = time.time()

        self.actual_fps = 0.0

        # ----------------------------------------------------
        # Camera status
        # ----------------------------------------------------

        self.last_error = None


    # ========================================================
    # OPEN CAMERA
    # ========================================================

    def open(self):

        print()
        print("=" * 60)
        print("CAMERA INITIALIZATION")
        print("=" * 60)

        print(
            "Camera ID:",
            self.camera_id
        )

        # ----------------------------------------------------
        # V4L2
        # ----------------------------------------------------

        self.cap = cv2.VideoCapture(
            self.camera_id,
            cv2.CAP_V4L2
        )

        if not self.cap.isOpened():

            raise RuntimeError(
                f"Cannot open camera "
                f"{self.camera_id}"
            )

        # ----------------------------------------------------
        # MJPG
        # ----------------------------------------------------

        if USE_MJPEG:

            self.cap.set(
                cv2.CAP_PROP_FOURCC,
                cv2.VideoWriter_fourcc(
                    *"MJPG"
                )
            )

        # ----------------------------------------------------
        # Resolution
        # ----------------------------------------------------

        self.cap.set(
            cv2.CAP_PROP_FRAME_WIDTH,
            self.width
        )

        self.cap.set(
            cv2.CAP_PROP_FRAME_HEIGHT,
            self.height
        )

        # ----------------------------------------------------
        # FPS
        # ----------------------------------------------------

        self.cap.set(
            cv2.CAP_PROP_FPS,
            self.fps_target
        )

        # ----------------------------------------------------
        # Buffer
        # ----------------------------------------------------

        self.cap.set(
            cv2.CAP_PROP_BUFFERSIZE,
            BUFFER_SIZE
        )

        # ----------------------------------------------------
        # Read actual camera parameters
        # ----------------------------------------------------

        actual_width = int(
            self.cap.get(
                cv2.CAP_PROP_FRAME_WIDTH
            )
        )

        actual_height = int(
            self.cap.get(
                cv2.CAP_PROP_FRAME_HEIGHT
            )
        )

        actual_fps = self.cap.get(
            cv2.CAP_PROP_FPS
        )

        print(
            "Resolution:",
            f"{actual_width}x{actual_height}"
        )

        print(
            "Camera FPS:",
            actual_fps
        )

        print(
            "Backend:",
            self.cap.getBackendName()
        )

        print(
            "Camera opened: OK"
        )

        print("=" * 60)


    # ========================================================
    # START BACKGROUND THREAD
    # ========================================================

    def start(self):

        if self.cap is None:

            self.open()

        if self.running:

            return

        self.running = True

        self.thread = threading.Thread(
            target=self._capture_loop,
            daemon=True
        )

        self.thread.start()

        print(
            "Camera thread: STARTED"
        )


    # ========================================================
    # CAPTURE LOOP
    # ========================================================

    def _capture_loop(self):

        while self.running:

            ret, frame = (
                self.cap.read()
            )

            if not ret:

                self.last_error = (
                    "Camera read failed"
                )

                time.sleep(
                    0.01
                )

                continue

            # ------------------------------------------------
            # Update latest frame
            # ------------------------------------------------

            with self.lock:

                self.latest_frame = frame

                self.frame_id += 1

            # ------------------------------------------------
            # FPS counter
            # ------------------------------------------------

            self.fps_count += 1

            now = time.time()

            elapsed = (
                now
                -
                self.fps_start
            )

            if elapsed >= 1.0:

                self.actual_fps = (
                    self.fps_count
                    /
                    elapsed
                )

                self.fps_count = 0

                self.fps_start = now


    # ========================================================
    # GET LATEST FRAME
    # ========================================================

    def get_latest_frame(self):

        with self.lock:

            if self.latest_frame is None:

                return None, self.frame_id

            frame = (
                self.latest_frame.copy()
            )

            current_id = (
                self.frame_id
            )

        return (
            frame,
            current_id
        )


    # ========================================================
    # GET FRAME ID
    # ========================================================

    def get_frame_id(self):

        with self.lock:

            return self.frame_id


    # ========================================================
    # GET FPS
    # ========================================================

    def get_fps(self):

        return self.actual_fps


    # ========================================================
    # STATUS
    # ========================================================

    def is_running(self):

        return self.running


    # ========================================================
    # STOP
    # ========================================================

    def stop(self):

        if not self.running:

            return

        print(
            "Stopping camera..."
        )

        self.running = False

        if self.thread is not None:

            self.thread.join(
                timeout=2.0
            )

        self.thread = None

        if self.cap is not None:

            self.cap.release()

            self.cap = None

        print(
            "Camera stopped."
        )


# ============================================================
# SIMPLE CAMERA TEST
# ============================================================

def test_camera():

    print()
    print("=" * 60)
    print("CAMERA TEST")
    print("=" * 60)

    camera = Camera()

    try:

        camera.start()

        print()
        print(
            "Camera test running."
        )

        print(
            "Press Q to quit."
        )

        last_frame_id = -1

        while True:

            frame, frame_id = (
                camera.get_latest_frame()
            )

            if frame is None:

                time.sleep(
                    0.01
                )

                continue

            # ------------------------------------------------
            # FPS
            # ------------------------------------------------

            fps = camera.get_fps()

            h, w = frame.shape[:2]

            # ------------------------------------------------
            # Display information
            # ------------------------------------------------

            cv2.putText(

                frame,

                f"Camera: {w}x{h}",

                (20, 30),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.7,

                (0, 255, 0),

                2
            )

            cv2.putText(

                frame,

                f"FPS: {fps:.1f}",

                (20, 60),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.7,

                (0, 255, 0),

                2
            )

            cv2.putText(

                frame,

                f"Frame ID: {frame_id}",

                (20, 90),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.7,

                (255, 255, 255),

                2
            )

            # ------------------------------------------------
            # Show
            # ------------------------------------------------

            cv2.imshow(
                "Camera Test",
                frame
            )

            key = (
                cv2.waitKey(1)
                &
                0xFF
            )

            if key == ord("q"):

                break

            # ------------------------------------------------
            # Debug new frame
            # ------------------------------------------------

            if (
                frame_id
                !=
                last_frame_id
            ):

                last_frame_id = (
                    frame_id
                )

    except KeyboardInterrupt:

        print(
            "\nKeyboard interrupt."
        )

    finally:

        camera.stop()

        cv2.destroyAllWindows()

    print()
    print(
        "CAMERA TEST: DONE"
    )


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    test_camera()