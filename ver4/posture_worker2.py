#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
posture_worker.py
=================

POSTURE AI WORKER - Raspberry Pi 4

Pipeline:

    USB Camera
        |
        v
    latest-frame buffer
        |
        v
    YOLO11n-Pose ONNX
        |
        v
    Decode + NMS
        |
        v
    Select main person
    (largest bounding-box area)
        |
        +----------------------+
        |                      |
        v                      v
    Stand detection        Sitting
                               |
                               v
                       7 geometric features
                               |
                               v
                       StandardScaler
                               |
                               v
                              SVM
                               |
                               v
                         GOOD / BAD

Display:
    - skeleton only
    - keypoints
    - NO person bounding box
    - NO YOLO box
    - monitoring zone
    - posture status
    - inference latency
    - FPS

IMPORTANT:
    1. This worker does NOT write Firebase.
    2. Firebase remains in firebase_manager.py.
    3. Feature extraction is imported from posture_features.py
       so the inference side uses the same 7-feature function
       as the training pipeline.
    4. ONNX input size is read from the model. The current
       yolo11n-pose.onnx is expected to be 320x320.
    5. If multiple people are detected, only the largest
       person is used for posture classification.
"""

import os
import time
import threading
import glob

import cv2
import numpy as np
import joblib
import onnxruntime as ort


# ============================================================
# CONFIG
# ============================================================

CAMERA_ID = "/dev/video1"   # Raspberry Pi webcam detected at /dev/video1
CAMERA_RECONNECT_SECONDS = 2.0
CAMERA_READ_FAIL_LIMIT = 5
# Optional fixed udev path: export OFFICE_CAMERA_DEVICE=/dev/v4l/by-id/...-video-index0

CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
CAMERA_FPS = 30

YOLO_MODEL = "models/yolo11n-pose.onnx"

SCALER_MODEL = "models/posture_scaler.joblib"
CLASSIFIER_MODEL = "models/posture_classifier.joblib"

# ONNX / detection
YOLO_CONF_THRESHOLD = 0.40
NMS_IOU_THRESHOLD = 0.45

# Keypoint display confidence
KPT_CONF_THRESHOLD = 0.20

# Stand detection
HIP_CONF_THRESHOLD = 0.50

# BAD persistence
BAD_TIME_THRESHOLD = 1.0

# AI target rate on Pi
AI_FPS = 5.0
AI_INTERVAL = 1.0 / AI_FPS

# A frame/result older than this is NOT valid for posture classification.
# Tune only after measuring inference latency and frame delivery on Pi.
CAMERA_STALE_SECONDS = 3.0
AI_STALE_SECONDS = 3.0

# Monitoring zone
ZONE_X1_RATIO = 0.15
ZONE_Y1_RATIO = 0.05
ZONE_X2_RATIO = 0.85
ZONE_Y2_RATIO = 0.95

SHOW_ZONE = True

# Thread / camera buffer
CAMERA_BUFFER_SIZE = 1


# ============================================================
# FILE CHECK
# ============================================================

def check_files():

    required = [
        YOLO_MODEL,
        SCALER_MODEL,
        CLASSIFIER_MODEL,
    ]

    missing = [
        path
        for path in required
        if not os.path.exists(path)
    ]

    if missing:

        raise FileNotFoundError(
            "Missing posture AI files: "
            + ", ".join(missing)
        )


# ============================================================
# YOLO PREPROCESSING
# ============================================================

def letterbox(
    image,
    new_shape=(320, 320),
    color=(114, 114, 114)
):

    h, w = image.shape[:2]

    new_h, new_w = new_shape

    ratio = min(
        new_w / float(w),
        new_h / float(h)
    )

    resized_w = int(
        round(w * ratio)
    )

    resized_h = int(
        round(h * ratio)
    )

    resized = cv2.resize(
        image,
        (
            resized_w,
            resized_h
        ),
        interpolation=cv2.INTER_LINEAR
    )

    dw = new_w - resized_w
    dh = new_h - resized_h

    dw /= 2.0
    dh /= 2.0

    left = int(
        round(dw - 0.1)
    )

    right = int(
        round(dw + 0.1)
    )

    top = int(
        round(dh - 0.1)
    )

    bottom = int(
        round(dh + 0.1)
    )

    padded = cv2.copyMakeBorder(
        resized,
        top,
        bottom,
        left,
        right,
        cv2.BORDER_CONSTANT,
        value=color
    )

    return (
        padded,
        ratio,
        dw,
        dh
    )


def preprocess(
    frame,
    input_size
):

    image, ratio, dw, dh = letterbox(
        frame,
        (
            input_size,
            input_size
        )
    )

    image = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2RGB
    )

    image = (
        image.astype(
            np.float32
        )
        /
        255.0
    )

    image = image.transpose(
        2,
        0,
        1
    )

    image = np.expand_dims(
        image,
        axis=0
    )

    return (
        image,
        ratio,
        dw,
        dh
    )


def restore_point(
    x,
    y,
    ratio,
    dw,
    dh,
    original_w,
    original_h
):

    x = (
        x - dw
    ) / ratio

    y = (
        y - dh
    ) / ratio

    x = np.clip(
        x,
        0,
        original_w - 1
    )

    y = np.clip(
        y,
        0,
        original_h - 1
    )

    return (
        float(x),
        float(y)
    )


# ============================================================
# NMS
# ============================================================

def box_iou(
    box1,
    box2
):

    x1 = max(
        float(box1[0]),
        float(box2[0])
    )

    y1 = max(
        float(box1[1]),
        float(box2[1])
    )

    x2 = min(
        float(box1[2]),
        float(box2[2])
    )

    y2 = min(
        float(box1[3]),
        float(box2[3])
    )

    inter_w = max(
        0.0,
        x2 - x1
    )

    inter_h = max(
        0.0,
        y2 - y1
    )

    inter_area = (
        inter_w
        *
        inter_h
    )

    area1 = (
        max(
            0.0,
            float(box1[2] - box1[0])
        )
        *
        max(
            0.0,
            float(box1[3] - box1[1])
        )
    )

    area2 = (
        max(
            0.0,
            float(box2[2] - box2[0])
        )
        *
        max(
            0.0,
            float(box2[3] - box2[1])
        )
    )

    union = (
        area1
        +
        area2
        -
        inter_area
    )

    if union <= 0:
        return 0.0

    return inter_area / union


def nms(
    detections,
    iou_threshold
):

    if not detections:
        return []

    order = sorted(
        range(len(detections)),
        key=lambda i:
            detections[i]["confidence"],
        reverse=True
    )

    keep = []

    while order:

        current = order.pop(0)

        keep.append(
            current
        )

        remaining = []

        for idx in order:

            iou = box_iou(
                detections[current]["box"],
                detections[idx]["box"]
            )

            if iou < iou_threshold:

                remaining.append(
                    idx
                )

        order = remaining

    return [
        detections[i]
        for i in keep
    ]


# ============================================================
# YOLO11-POSE RAW OUTPUT DECODER
#
# Expected:
#     [1, 56, N]
#
# 56 =
#     4 bbox values
#     1 person confidence
#     17 x 3 keypoint values
#
# This is the raw ONNX export and therefore requires NMS.
# ============================================================

def decode_output(
    output,
    frame_shape,
    ratio,
    dw,
    dh
):

    original_h, original_w = (
        frame_shape[:2]
    )

    output = np.asarray(
        output
    )

    if output.ndim == 3:

        output = output[0]

    if output.ndim != 2:

        raise RuntimeError(
            "Unexpected ONNX output shape: "
            f"{output.shape}"
        )

    # [56, N] -> [N, 56]
    if (
        output.shape[0] == 56
        and
        output.shape[1] != 56
    ):

        output = output.T

    if output.shape[1] != 56:

        raise RuntimeError(
            "Expected YOLO11-pose raw output "
            "with 56 values per candidate. "
            f"Got {output.shape}"
        )

    candidates = []

    for row in output:

        score = float(
            row[4]
        )

        if score < YOLO_CONF_THRESHOLD:
            continue

        cx = float(row[0])
        cy = float(row[1])
        bw = float(row[2])
        bh = float(row[3])

        x1 = (
            cx
            -
            bw / 2.0
        )

        y1 = (
            cy
            -
            bh / 2.0
        )

        x2 = (
            cx
            +
            bw / 2.0
        )

        y2 = (
            cy
            +
            bh / 2.0
        )

        x1, y1 = restore_point(
            x1,
            y1,
            ratio,
            dw,
            dh,
            original_w,
            original_h
        )

        x2, y2 = restore_point(
            x2,
            y2,
            ratio,
            dw,
            dh,
            original_w,
            original_h
        )

        kpts_raw = (
            row[5:56]
            .reshape(
                17,
                3
            )
        )

        kpts = np.zeros(
            (17, 2),
            dtype=np.float32
        )

        kpt_conf = np.zeros(
            17,
            dtype=np.float32
        )

        for i in range(17):

            px = float(
                kpts_raw[i, 0]
            )

            py = float(
                kpts_raw[i, 1]
            )

            pc = float(
                kpts_raw[i, 2]
            )

            px, py = restore_point(
                px,
                py,
                ratio,
                dw,
                dh,
                original_w,
                original_h
            )

            kpts[i] = [
                px,
                py
            ]

            kpt_conf[i] = pc

        candidates.append(
            {
                "box": np.array(
                    [
                        x1,
                        y1,
                        x2,
                        y2
                    ],
                    dtype=np.float32
                ),

                "confidence": score,

                "keypoints": kpts,

                "keypoint_conf":
                    kpt_conf,
            }
        )

    return nms(
        candidates,
        NMS_IOU_THRESHOLD
    )


# ============================================================
# MAIN PERSON
# ============================================================

def select_main_person(
    detections
):

    if not detections:
        return None

    areas = []

    for detection in detections:

        x1, y1, x2, y2 = (
            detection["box"]
        )

        area = (
            max(
                0.0,
                x2 - x1
            )
            *
            max(
                0.0,
                y2 - y1
            )
        )

        areas.append(
            area
        )

    return int(
        np.argmax(
            areas
        )
    )


# ============================================================
# STAND DETECTION
# ============================================================

def detect_stand(
    conf
):

    if conf is None:
        return False

    if len(conf) < 13:
        return False

    hip_conf = (
        float(conf[11])
        +
        float(conf[12])
    ) / 2.0

    return (
        hip_conf
        >=
        HIP_CONF_THRESHOLD
    )


# ============================================================
# SKELETON
#
# NO BOUNDING BOX IS DRAWN.
# ============================================================

EDGES = [

    # Head
    (0, 1),
    (0, 2),
    (1, 3),
    (2, 4),

    # Shoulders
    (5, 6),

    # Left arm
    (5, 7),
    (7, 9),

    # Right arm
    (6, 8),
    (8, 10),

    # Torso
    (5, 11),
    (6, 12),
    (11, 12),

    # Left leg
    (11, 13),
    (13, 15),

    # Right leg
    (12, 14),
    (14, 16),
]


def draw_skeleton(
    frame,
    kpts,
    conf
):

    for p1, p2 in EDGES:

        if (
            conf[p1]
            <
            KPT_CONF_THRESHOLD
            or
            conf[p2]
            <
            KPT_CONF_THRESHOLD
        ):

            continue

        cv2.line(
            frame,

            (
                int(kpts[p1][0]),
                int(kpts[p1][1])
            ),

            (
                int(kpts[p2][0]),
                int(kpts[p2][1])
            ),

            (255, 0, 0),

            2
        )

    for i in range(17):

        if (
            conf[i]
            <
            KPT_CONF_THRESHOLD
        ):

            continue

        cv2.circle(
            frame,

            (
                int(kpts[i][0]),
                int(kpts[i][1])
            ),

            4,

            (0, 255, 255),

            -1
        )

    return frame


# ============================================================
# POSTURE WORKER
# ============================================================

class PostureWorker:

    def __init__(self):

        check_files()

        print()
        print("=" * 60)
        print("POSTURE WORKER INITIALIZATION")
        print("=" * 60)

        # ----------------------------------------------------
        # Load scaler / classifier
        # ----------------------------------------------------

        print(
            "Loading posture scaler..."
        )

        self.scaler = joblib.load(
            SCALER_MODEL
        )

        print(
            "Loading posture classifier..."
        )

        self.classifier = joblib.load(
            CLASSIFIER_MODEL
        )

        scaler_features = getattr(
            self.scaler,
            "n_features_in_",
            None
        )

        classifier_features = getattr(
            self.classifier,
            "n_features_in_",
            None
        )

        print(
            "Scaler features:",
            scaler_features
        )

        print(
            "Classifier features:",
            classifier_features
        )

        if (
            scaler_features is not None
            and
            scaler_features != 7
        ):

            raise ValueError(
                "posture_scaler.joblib "
                "must contain the 7-feature model."
            )

        if (
            classifier_features is not None
            and
            classifier_features != 7
        ):

            raise ValueError(
                "posture_classifier.joblib "
                "must contain the 7-feature model."
            )

        # ----------------------------------------------------
        # Import exact training feature function
        # ----------------------------------------------------

        try:

            from posture_features import (
                extract_features
            )

        except ImportError as e:

            raise ImportError(
                "Cannot import extract_features() "
                "from posture_features.py. "
                "Make sure posture_features.py is in "
                "the same directory."
            ) from e

        self.extract_features = (
            extract_features
        )

        print(
            "7-feature extractor: OK"
        )

        # ----------------------------------------------------
        # ONNX
        # ----------------------------------------------------

        print(
            "Loading YOLO11n-Pose ONNX..."
        )

        opts = ort.SessionOptions()

        opts.intra_op_num_threads = 4
        opts.inter_op_num_threads = 1

        opts.execution_mode = (
            ort.ExecutionMode.ORT_SEQUENTIAL
        )

        opts.graph_optimization_level = (
            ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        )

        self.session = ort.InferenceSession(
            YOLO_MODEL,
            sess_options=opts,
            providers=[
                "CPUExecutionProvider"
            ]
        )

        input_meta = (
            self.session.get_inputs()[0]
        )

        self.input_name = (
            input_meta.name
        )

        print(
            "ONNX input:",
            input_meta.shape
        )

        # Use the fixed size stored by the ONNX model.
        if (
            len(input_meta.shape) == 4
            and
            isinstance(
                input_meta.shape[2],
                int
            )
            and
            isinstance(
                input_meta.shape[3],
                int
            )
        ):

            self.input_h = int(
                input_meta.shape[2]
            )

            self.input_w = int(
                input_meta.shape[3]
            )

        else:

            self.input_h = 320
            self.input_w = 320

        if (
            self.input_h
            !=
            self.input_w
        ):

            raise ValueError(
                "YOLO ONNX must have square input. "
                f"Got {self.input_w}x{self.input_h}"
            )

        self.input_size = (
            self.input_h
        )

        for i, output in enumerate(
            self.session.get_outputs()
        ):

            print(
                f"ONNX output {i}:",
                output.shape
            )

        print(
            "YOLO input size:",
            f"{self.input_size}x{self.input_size}"
        )

        print(
            "YOLO ONNX: OK"
        )

        # ----------------------------------------------------
        # Shared camera / AI state
        # ----------------------------------------------------

        self.latest_frame = None
        self.frame_id = 0

        self.lock = threading.Lock()

        self.running = False

        self.camera_thread = None
        self.ai_thread = None

        # ----------------------------------------------------
        # Result state
        # ----------------------------------------------------

        self.status = "ABSENT"

        self.raw_status = "ABSENT"

        self.pred_raw = -1

        self.is_in_zone = False

        self.kpts_draw = []

        self.ai_color = (
            150,
            150,
            150
        )

        self.inference_ms = 0.0

        self.display_fps = 0.0

        self.bad_start_time = None

        self.last_processed_id = -1

        self.last_ai_time = 0.0  # Scheduler time, NOT successful-inference time

        self.started_at = time.monotonic()
        self.last_camera_frame_at = None
        self.last_inference_at = None
        self.camera_online = False
        self.camera_error = "STARTING"
        self.camera_device = None
        self.camera_epoch = 0
        self.needs_fresh_inference = True

        print(
            "POSTURE WORKER: OK"
        )

        print("=" * 60)


    # ========================================================
    # CAMERA
    # ========================================================


    def _camera_candidates(self):
        """Prefer persistent udev USB camera paths; survive /dev/videoN renumbering."""
        explicit = os.environ.get("OFFICE_CAMERA_DEVICE", "").strip()
        if explicit:
            # When explicitly selected, never silently switch to another camera.
            return [explicit]

        candidates = []
        for pattern in (
            "/dev/v4l/by-id/*-video-index0",
            "/dev/v4l/by-path/*-video-index0",
        ):
            candidates.extend(sorted(glob.glob(pattern)))

        # This Pi previously exposed USB webcam on video1.
        candidates.append(CAMERA_ID)

        # Fallback for systems without /dev/v4l symlinks or changed videoN.
        # Kernel-reported device names exclude bcm2835 codec/ISP endpoints.
        for sys_name in sorted(glob.glob("/sys/class/video4linux/video*/name")):
            try:
                description = open(sys_name, encoding="utf-8").read().lower()
            except OSError:
                continue
            if not any(token in description for token in ("usb", "uvc", "camera")):
                continue
            node = "/dev/" + sys_name.split("/")[-2]
            candidates.append(node)

        # Deduplicate while preserving priority.
        return list(dict.fromkeys(candidates))

    def _open_camera(self):
        """Open and configure a candidate device. Return (cap, path) or (None, None)."""
        for device in self._camera_candidates():
            if isinstance(device, str) and not os.path.exists(device):
                continue
            cap = None
            try:
                cap = cv2.VideoCapture(device, cv2.CAP_V4L2)
                if not cap.isOpened():
                    cap.release()
                    continue
                cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
                cap.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, CAMERA_BUFFER_SIZE)
                # Validate actual capture. Some /dev/videoN are metadata/codec nodes.
                frame_ok = False
                for _ in range(5):
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        frame_ok = True
                        break
                    time.sleep(0.03)
                if frame_ok:
                    return cap, device
                cap.release()
                continue
            except Exception as exc:
                print(f"Camera open failed ({device}): {exc}")
                if cap is not None:
                    try:
                        cap.release()
                    except Exception:
                        pass
        return None, None

    def _camera_offline(self, message):
        # Invalidate existing frames AND in-flight inference results.
        with self.lock:
            self.camera_online = False
            self.camera_error = message
            self.camera_device = None
            self.latest_frame = None
            self.last_camera_frame_at = None
            self.last_inference_at = None
            self.needs_fresh_inference = True
            self.camera_epoch += 1
            self.status = "ERROR"
            self.raw_status = "ERROR"
            self.pred_raw = -1
            self.is_in_zone = False
            self.kpts_draw = []
            self.ai_color = (0, 0, 255)
            self.bad_start_time = None

    def _camera_loop(self):
        """Hot-plug safe loop: close dead VideoCapture, reopen on USB reconnect."""
        cap = None
        fail_count = 0
        try:
            while self.running:
                if cap is None:
                    try:
                        cap, device = self._open_camera()
                    except Exception as exc:
                        print(f"Camera discovery error: {exc}")
                        cap, device = None, None
                    if cap is None:
                        self._camera_offline("CAMERA_NOT_FOUND")
                        print("Camera unavailable; retrying in 2 seconds...")
                        time.sleep(CAMERA_RECONNECT_SECONDS)
                        continue
                    print(f"Camera opened: {device}. Waiting for first frame...")
                    with self.lock:
                        self.camera_device = device
                        self.camera_error = "WAITING_FOR_FIRST_FRAME"
                        self.camera_online = False
                    fail_count = 0

                try:
                    # OpenCV may occasionally raise during USB device removal.
                    ret, frame = cap.read()
                except Exception as exc:
                    print(f"Camera read error: {exc}")
                    ret, frame = False, None

                if not ret or frame is None:
                    fail_count += 1
                    if fail_count < CAMERA_READ_FAIL_LIMIT:
                        time.sleep(0.05)
                        continue
                    print("Camera stream lost. Closing handle and reconnecting...")
                    try:
                        cap.release()
                    except Exception:
                        pass
                    cap = None
                    self._camera_offline("CAMERA_DISCONNECTED")
                    time.sleep(CAMERA_RECONNECT_SECONDS)
                    continue

                fail_count = 0
                with self.lock:
                    if not self.camera_online:
                        self.camera_epoch += 1
                        # Old AI result remains invalid until new-frame inference completes.
                        self.needs_fresh_inference = True
                        self.last_inference_at = None
                        self.bad_start_time = None
                        print("Camera frames restored; waiting for fresh AI inference.")
                    self.camera_online = True
                    self.camera_error = None
                    self.latest_frame = frame
                    self.frame_id += 1
                    self.last_camera_frame_at = time.monotonic()
        finally:
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass
            self._camera_offline("CAMERA_STOPPED")
            print("Camera thread stopped.")


    # ========================================================
    # ONE AI INFERENCE
    # ========================================================

    def _infer_frame(
        self,
        frame
    ):

        h, w = frame.shape[:2]

        # ---------------------------------------------
        # Monitoring zone
        # ---------------------------------------------

        zx1 = int(
            w * ZONE_X1_RATIO
        )

        zy1 = int(
            h * ZONE_Y1_RATIO
        )

        zx2 = int(
            w * ZONE_X2_RATIO
        )

        zy2 = int(
            h * ZONE_Y2_RATIO
        )

        # ---------------------------------------------
        # Preprocess
        # ---------------------------------------------

        (
            image,
            ratio,
            dw,
            dh
        ) = preprocess(
            frame,
            self.input_size
        )

        # ---------------------------------------------
        # ONNX
        # ---------------------------------------------

        t0 = time.perf_counter()

        outputs = self.session.run(
            None,
            {
                self.input_name:
                    image
            }
        )

        inference_ms = (
            time.perf_counter()
            -
            t0
        ) * 1000.0

        # ---------------------------------------------
        # Decode
        # ---------------------------------------------

        detections = decode_output(
            outputs[0],
            frame.shape,
            ratio,
            dw,
            dh
        )

        person_id = (
            select_main_person(
                detections
            )
        )

        raw_state = "ABSENT"

        pred_raw = -1

        zone = False

        temp_draw = []

        # ---------------------------------------------
        # No person
        # ---------------------------------------------

        if person_id is None:

            return {
                "raw_status": "ABSENT",
                "pred_raw": -1,
                "zone": False,
                "kpts": [],
                "inference_ms":
                    inference_ms,
            }

        person = detections[
            person_id
        ]

        kpts = person[
            "keypoints"
        ]

        conf = person[
            "keypoint_conf"
        ]

        # ---------------------------------------------
        # Zone:
        # use main person's bbox center
        # ---------------------------------------------

        x1, y1, x2, y2 = (
            person["box"]
        )

        center_x = (
            x1 + x2
        ) / 2.0

        center_y = (
            y1 + y2
        ) / 2.0

        zone = (
            zx1 <= center_x <= zx2
            and
            zy1 <= center_y <= zy2
        )

        if not zone:

            return {
                "raw_status":
                    "NGOAI VUNG GIAM SAT",

                "pred_raw": -1,

                "zone": False,

                "kpts": [
                    (
                        int(kpts[i][0]),
                        int(kpts[i][1]),
                        float(conf[i])
                    )
                    for i in range(17)
                ],

                "inference_ms":
                    inference_ms,
            }

        # ---------------------------------------------
        # Save skeleton
        # ---------------------------------------------

        temp_draw = [
            (
                int(kpts[i][0]),
                int(kpts[i][1]),
                float(conf[i])
            )
            for i in range(17)
        ]

        # ---------------------------------------------
        # Stand
        # ---------------------------------------------

        if detect_stand(conf):

            raw_state = "STAND"

        # ---------------------------------------------
        # Sitting -> 7-feature SVM
        # ---------------------------------------------

        else:

            features = np.asarray(
                self.extract_features(
                    kpts
                )
            )

            if features.shape != (7,):

                raise ValueError(
                    "posture_features.extract_features() "
                    f"returned {features.shape}; "
                    "expected (7,)."
                )

            features_scaled = (
                self.scaler.transform(
                    [
                        features
                    ]
                )
            )

            pred = (
                self.classifier
                .predict(
                    features_scaled
                )[0]
            )

            pred_raw = int(
                pred
            )

            if pred_raw == 0:

                raw_state = "GOOD"

            else:

                raw_state = "BAD"

        return {
            "raw_status": raw_state,
            "pred_raw": pred_raw,
            "zone": True,
            "kpts": temp_draw,
            "inference_ms":
                inference_ms,
        }


    # ========================================================
    # BAD TEMPORAL FILTER
    # ========================================================

    def _apply_temporal_filter(
        self,
        raw_state
    ):

        now = time.monotonic()

        if raw_state == "BAD":

            if self.bad_start_time is None:

                self.bad_start_time = now

            elapsed = (
                now
                -
                self.bad_start_time
            )

            if (
                elapsed
                >=
                BAD_TIME_THRESHOLD
            ):

                return "BAD"

            # During the 1-second confirmation window,
            # do not immediately alert BAD.
            return "GOOD"

        self.bad_start_time = None

        return raw_state


    # ========================================================
    # COLOR
    # ========================================================

    @staticmethod
    def _get_color(
        status
    ):

        if status == "GOOD":

            return (
                0,
                255,
                0
            )

        if status == "BAD":

            return (
                0,
                0,
                255
            )

        if status == "STAND":

            return (
                0,
                255,
                255
            )

        if status == "NGOAI VUNG GIAM SAT":

            return (
                0,
                165,
                255
            )

        return (
            150,
            150,
            150
        )


    # ========================================================
    # AI LOOP
    # ========================================================


    def set_ai_enabled(self, enabled):
        """Pause YOLO inference while keeping USB capture for face recognition."""
        with self.lock:
            self._external_ai_pause = not bool(enabled)
            if not enabled:
                self.needs_fresh_inference = True
                self.last_inference_at = None

    def _ai_loop(self):
        print(f"Posture AI target FPS: {AI_FPS:.1f}")
        while self.running:
            with self.lock:
                is_paused = getattr(self, "_external_ai_pause", False)
            if is_paused:
                time.sleep(0.05)
                continue
            now = time.monotonic()
            if now - self.last_ai_time < AI_INTERVAL:
                time.sleep(0.003)
                continue

            with self.lock:
                if (not self.camera_online or self.latest_frame is None
                        or self.frame_id == self.last_processed_id):
                    frame_copy = None
                else:
                    frame_copy = self.latest_frame.copy()
                    current_id = self.frame_id
                    current_epoch = self.camera_epoch

            if frame_copy is None:
                time.sleep(0.005)
                continue

            self.last_processed_id = current_id
            self.last_ai_time = now
            try:
                result = self._infer_frame(frame_copy)
                with self.lock:
                    # USB may have been unplugged while this inference was running.
                    if not self.camera_online or current_epoch != self.camera_epoch:
                        continue
                    final_state = self._apply_temporal_filter(result["raw_status"])
                    self.raw_status = result["raw_status"]
                    self.status = final_state
                    self.pred_raw = result["pred_raw"]
                    self.is_in_zone = result["zone"]
                    self.kpts_draw = result["kpts"]
                    self.inference_ms = result["inference_ms"]
                    self.ai_color = self._get_color(final_state)
                    self.last_inference_at = time.monotonic()
                    self.needs_fresh_inference = False
            except Exception as exc:
                print("\nPosture AI error:", repr(exc))
                with self.lock:
                    if not self.camera_online or current_epoch != self.camera_epoch:
                        continue
                    self.raw_status = "ERROR"
                    self.status = "ERROR"
                    self.pred_raw = -1
                    self.is_in_zone = False
                    self.kpts_draw = []
                    self.ai_color = (0, 0, 255)
                    self.needs_fresh_inference = True
                    self.last_inference_at = None


    # ========================================================
    # START
    # ========================================================

    def start(self):

        if self.running:
            return

        with self.lock:
            self.started_at = time.monotonic()
            self.last_camera_frame_at = None
            self.last_inference_at = None
            self.latest_frame = None
            self.frame_id = 0
            self.last_processed_id = -1
            self.last_ai_time = 0.0
            self.camera_online = False
            self.camera_error = "STARTING"
            self.camera_device = None
            self.needs_fresh_inference = True
            self.camera_epoch += 1

        self.running = True

        self.camera_thread = (
            threading.Thread(
                target=self._camera_loop,
                daemon=True
            )
        )

        self.ai_thread = (
            threading.Thread(
                target=self._ai_loop,
                daemon=True
            )
        )

        self.camera_thread.start()
        self.ai_thread.start()


    # ========================================================
    # STOP
    # ========================================================

    def stop(self):

        self.running = False

        if self.camera_thread is not None:

            self.camera_thread.join(
                timeout=1.0
            )

        if self.ai_thread is not None:

            self.ai_thread.join(
                timeout=1.0
            )


    # ========================================================
    # SNAPSHOT
    # ========================================================

    def get_snapshot(self):
        # time.monotonic(): robust against changes to wall-clock time/NTP.
        now = time.monotonic()

        with self.lock:
            camera_age = (
                None if self.last_camera_frame_at is None
                else max(0.0, now - self.last_camera_frame_at)
            )
            ai_age = (
                None if self.last_inference_at is None
                else max(0.0, now - self.last_inference_at)
            )
            startup_age = max(0.0, now - self.started_at)

            # Grace period during initial model/camera startup.
            camera_stale = (
                (camera_age is None and startup_age > CAMERA_STALE_SECONDS)
                or (camera_age is not None and camera_age > CAMERA_STALE_SECONDS)
            )
            ai_stale = (
                (ai_age is None and startup_age > AI_STALE_SECONDS)
                or (ai_age is not None and ai_age > AI_STALE_SECONDS)
            )
            # Camera may have failed to open and set running=False.
            stopped = not self.running
            camera_offline = not self.camera_online
            waiting_ai = self.needs_fresh_inference
            stale = bool(stopped or camera_stale or ai_stale or camera_offline or waiting_ai)

            reasons = []
            if stopped:
                reasons.append("WORKER_STOPPED")
            if camera_stale:
                reasons.append("CAMERA_STALE")
            if ai_stale:
                reasons.append("AI_STALE")
            if camera_offline:
                reasons.append(self.camera_error or "CAMERA_OFFLINE")
            if waiting_ai:
                reasons.append("WAITING_FRESH_INFERENCE")

            # Preserve posture when fresh. ERROR is not the same as ABSENT.
            return {
                "status": "ERROR" if stale else self.status,
                "raw_status": "ERROR" if stale else self.raw_status,
                "pred_raw": -1 if stale else self.pred_raw,
                "is_in_zone": False if stale else self.is_in_zone,
                "keypoints": [] if stale else list(self.kpts_draw),
                "inference_ms": self.inference_ms,
                "color": (0, 0, 255) if stale else self.ai_color,
                "stale": stale,
                "stale_reason": ",".join(reasons),
                "camera_online": self.camera_online,
                "camera_device": self.camera_device,
                "last_camera_frame_age_s": camera_age,
                "last_inference_age_s": ai_age,
            }


    # ========================================================
    # CURRENT FRAME
    # ========================================================

    def get_frame(self):

        with self.lock:

            if (self.latest_frame is None or not self.camera_online
                    or self.last_camera_frame_at is None
                    or time.monotonic() - self.last_camera_frame_at > CAMERA_STALE_SECONDS):
                return None

            return self.latest_frame.copy()


# ============================================================
# DISPLAY / STANDALONE TEST
# ============================================================

def draw_ui(
    frame,
    worker,
    display_fps
):

    snapshot = (
        worker.get_snapshot()
    )

    status = snapshot[
        "status"
    ]

    color = snapshot[
        "color"
    ]

    keypoints = snapshot[
        "keypoints"
    ]

    # ---------------------------------------------
    # Monitoring zone
    # ---------------------------------------------

    if SHOW_ZONE:

        h, w = frame.shape[:2]

        zx1 = int(
            w * ZONE_X1_RATIO
        )

        zy1 = int(
            h * ZONE_Y1_RATIO
        )

        zx2 = int(
            w * ZONE_X2_RATIO
        )

        zy2 = int(
            h * ZONE_Y2_RATIO
        )

        cv2.rectangle(
            frame,
            (zx1, zy1),
            (zx2, zy2),
            (0, 255, 255),
            2
        )

        cv2.putText(
            frame,
            "MONITORING ZONE",
            (
                zx1 + 10,
                zy1 + 25
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 255),
            2
        )

    # ---------------------------------------------
    # Draw skeleton ONLY
    # ---------------------------------------------

    if len(keypoints) == 17:

        kpts = np.array(
            [
                [p[0], p[1]]
                for p in keypoints
            ],
            dtype=np.float32
        )

        conf = np.array(
            [
                p[2]
                for p in keypoints
            ],
            dtype=np.float32
        )

        draw_skeleton(
            frame,
            kpts,
            conf
        )

    # ---------------------------------------------
    # Status
    # ---------------------------------------------

    cv2.putText(
        frame,
        f"Status: {status}",
        (30, 45),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.85,
        color,
        2
    )

    # ---------------------------------------------
    # Raw prediction
    # ---------------------------------------------

    cv2.putText(
        frame,
        f"Raw Pred: {snapshot['pred_raw']}",
        (30, 78),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 255, 255),
        1
    )

    # ---------------------------------------------
    # Inference
    # ---------------------------------------------

    cv2.putText(
        frame,
        f"AI: {snapshot['inference_ms']:.1f} ms",
        (30, 108),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 255, 255),
        1
    )

    # ---------------------------------------------
    # Zone
    # ---------------------------------------------

    cv2.putText(
        frame,
        f"In zone: {snapshot['is_in_zone']}",
        (30, 138),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.60,
        (255, 255, 255),
        1
    )

    # ---------------------------------------------
    # FPS
    # ---------------------------------------------

    h, w = frame.shape[:2]

    cv2.putText(
        frame,
        f"FPS: {display_fps:.1f}",
        (w - 150, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0, 255, 0),
        2
    )

    return frame


# ============================================================
# MAIN
# ============================================================

def main():

    worker = None

    print()
    print("=" * 60)
    print("POSTURE WORKER TEST")
    print("=" * 60)

    try:

        worker = PostureWorker()

        worker.start()

        print()
        print(
            "Running posture worker..."
        )

        print(
            "Skeleton: ON"
        )

        print(
            "Person bounding box: OFF"
        )

        print(
            "Firebase: OFF"
        )

        print(
            "Press Q to quit."
        )

        print()

        fps_count = 0
        fps_start = time.monotonic()
        display_fps = 0.0

        while worker.running:

            frame = worker.get_frame()

            if frame is None:

                time.sleep(
                    0.01
                )

                continue

            fps_count += 1

            now = time.monotonic()

            elapsed = (
                now
                -
                fps_start
            )

            if elapsed >= 1.0:

                display_fps = (
                    fps_count
                    /
                    elapsed
                )

                fps_count = 0

                fps_start = now

            frame = draw_ui(
                frame,
                worker,
                display_fps
            )

            cv2.imshow(
                "Posture Worker - Pi4",
                frame
            )

            key = (
                cv2.waitKey(1)
                &
                0xFF
            )

            if key == ord("q"):

                break

    except KeyboardInterrupt:

        print(
            "\nStopping..."
        )

    finally:

        if worker is not None:

            worker.stop()

        cv2.destroyAllWindows()

        print(
            "Posture worker stopped."
        )


if __name__ == "__main__":

    main()
