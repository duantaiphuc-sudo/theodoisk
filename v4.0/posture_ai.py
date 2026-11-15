#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
posture_ai.py
=============

Posture AI engine cho Raspberry Pi 4.

Pipeline:

    Frame
      ↓
    Letterbox
      ↓
    YOLO11n-Pose ONNX
      ↓
    Decode
      ↓
    NMS
      ↓
    Select main person
      ↓
    17 keypoints
      ↓
    7 geometric features
      ↓
    StandardScaler
      ↓
    SVM
      ↓
    GOOD / BAD / STAND / ABSENT

Không chứa:
    - Camera capture
    - Firebase
    - MAX30102
    - Thread camera
    - UI chính

Các phần đó sẽ được ghép ở main.py sau.
"""

import os
import time
import math

import cv2
import joblib
import numpy as np
import onnxruntime as ort

from posture_features import extract_features


# ============================================================
# CONFIG
# ============================================================

YOLO_MODEL = "models/yolo11n-pose.onnx"

SCALER_MODEL = "models/posture_scaler.joblib"
CLASSIFIER_MODEL = "models/posture_classifier.joblib"


# YOLO confidence
YOLO_CONF_THRESHOLD = 0.40

# NMS IoU
NMS_IOU_THRESHOLD = 0.45

# Keypoint confidence
KPT_CONF_THRESHOLD = 0.20

# Hip confidence
HIP_CONF_THRESHOLD = 0.50

# BAD phải duy trì liên tục bao lâu
BAD_TIME_THRESHOLD = 1.0


# Monitoring zone
ZONE_X1_RATIO = 0.15
ZONE_Y1_RATIO = 0.05
ZONE_X2_RATIO = 0.85
ZONE_Y2_RATIO = 0.95


# ============================================================
# YOLO SKELETON
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


# ============================================================
# POSTURE AI CLASS
# ============================================================

class PostureAI:

    def __init__(
        self,
        yolo_model=YOLO_MODEL,
        scaler_model=SCALER_MODEL,
        classifier_model=CLASSIFIER_MODEL,
    ):

        print()
        print("=" * 60)
        print("POSTURE AI INITIALIZATION")
        print("=" * 60)

        # ----------------------------------------------------
        # File check
        # ----------------------------------------------------

        for path in [
            yolo_model,
            scaler_model,
            classifier_model,
        ]:

            if not os.path.exists(path):

                raise FileNotFoundError(
                    f"Missing model file: {path}"
                )

        # ----------------------------------------------------
        # Load scaler
        # ----------------------------------------------------

        print("Loading posture scaler...")

        self.scaler = joblib.load(
            scaler_model
        )

        # ----------------------------------------------------
        # Load classifier
        # ----------------------------------------------------

        print("Loading posture classifier...")

        self.classifier = joblib.load(
            classifier_model
        )

        # ----------------------------------------------------
        # Verify 7 features
        # ----------------------------------------------------

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
            "Scaler features    :",
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
                "Scaler khong phai model 7 features."
            )

        if (
            classifier_features is not None
            and
            classifier_features != 7
        ):

            raise ValueError(
                "Classifier khong phai model 7 features."
            )

        # ----------------------------------------------------
        # Load YOLO ONNX
        # ----------------------------------------------------

        print()
        print("Loading YOLO11n-Pose ONNX...")

        opts = ort.SessionOptions()

        # Raspberry Pi 4
        opts.intra_op_num_threads = 4
        opts.inter_op_num_threads = 1

        opts.execution_mode = (
            ort.ExecutionMode.ORT_SEQUENTIAL
        )

        opts.graph_optimization_level = (
            ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        )

        self.session = ort.InferenceSession(

            yolo_model,

            sess_options=opts,

            providers=[
                "CPUExecutionProvider"
            ]
        )

        # ----------------------------------------------------
        # Input information
        # ----------------------------------------------------

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

        # ----------------------------------------------------
        # Detect model input size
        # ----------------------------------------------------

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

            self.model_h = int(
                input_meta.shape[2]
            )

            self.model_w = int(
                input_meta.shape[3]
            )

        else:

            self.model_h = 320
            self.model_w = 320

        if self.model_h != self.model_w:

            raise ValueError(
                "YOLO input phai square."
            )

        print(
            "YOLO size:",
            f"{self.model_w}x{self.model_h}"
        )

        # ----------------------------------------------------
        # Temporal state
        # ----------------------------------------------------

        self.bad_start_time = None

        print()
        print("Posture AI: OK")
        print("=" * 60)


    # ========================================================
    # LETTERBOX
    # ========================================================

    def letterbox(
        self,
        image,
        new_shape
    ):

        h, w = image.shape[:2]

        new_h, new_w = new_shape

        ratio = min(
            new_w / w,
            new_h / h
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

        dw /= 2
        dh /= 2

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

            value=(
                114,
                114,
                114
            )
        )

        return (
            padded,
            ratio,
            dw,
            dh
        )


    # ========================================================
    # PREPROCESS
    # ========================================================

    def preprocess(
        self,
        frame
    ):

        image, ratio, dw, dh = (
            self.letterbox(
                frame,
                (
                    self.model_h,
                    self.model_w
                )
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


    # ========================================================
    # RESTORE POINT
    # ========================================================

    def restore_point(
        self,
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


    # ========================================================
    # IOU
    # ========================================================

    @staticmethod
    def box_iou(
        box1,
        box2
    ):

        x1 = max(
            box1[0],
            box2[0]
        )

        y1 = max(
            box1[1],
            box2[1]
        )

        x2 = min(
            box1[2],
            box2[2]
        )

        y2 = min(
            box1[3],
            box2[3]
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
            inter_w *
            inter_h
        )

        area1 = (
            max(
                0.0,
                box1[2] - box1[0]
            )
            *
            max(
                0.0,
                box1[3] - box1[1]
            )
        )

        area2 = (
            max(
                0.0,
                box2[2] - box2[0]
            )
            *
            max(
                0.0,
                box2[3] - box2[1]
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

        return (
            inter_area
            /
            union
        )


    # ========================================================
    # NMS
    # ========================================================

    def nms(
        self,
        detections
    ):

        if not detections:

            return []

        order = sorted(
            range(
                len(detections)
            ),
            key=lambda i:
                detections[i][
                    "confidence"
                ],
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

                iou = self.box_iou(
                    detections[
                        current
                    ]["box"],

                    detections[
                        idx
                    ]["box"]
                )

                if (
                    iou
                    <
                    NMS_IOU_THRESHOLD
                ):

                    remaining.append(
                        idx
                    )

            order = remaining

        return [
            detections[i]
            for i in keep
        ]


    # ========================================================
    # DECODE YOLO11 POSE
    # ========================================================

    def decode_output(
        self,
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

        # ----------------------------------------------------
        # [56, N] -> [N, 56]
        # ----------------------------------------------------

        if (
            output.shape[0] == 56
            and
            output.shape[1] != 56
        ):

            output = output.T

        if output.shape[1] != 56:

            raise RuntimeError(
                "Expected YOLO11-pose "
                "output [N,56]. "
                f"Got {output.shape}"
            )

        detections = []

        # ----------------------------------------------------
        # Each candidate
        # ----------------------------------------------------

        for row in output:

            score = float(
                row[4]
            )

            if (
                score
                <
                YOLO_CONF_THRESHOLD
            ):

                continue

            # ----------------------------------------------
            # Bounding box
            # ----------------------------------------------

            cx = float(
                row[0]
            )

            cy = float(
                row[1]
            )

            bw = float(
                row[2]
            )

            bh = float(
                row[3]
            )

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

            x1, y1 = self.restore_point(
                x1,
                y1,
                ratio,
                dw,
                dh,
                original_w,
                original_h
            )

            x2, y2 = self.restore_point(
                x2,
                y2,
                ratio,
                dw,
                dh,
                original_w,
                original_h
            )

            # ----------------------------------------------
            # Keypoints
            # ----------------------------------------------

            kpts_raw = (
                row[5:56]
                .reshape(
                    17,
                    3
                )
            )

            kpts = np.zeros(
                (
                    17,
                    2
                ),
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

                px, py = (
                    self.restore_point(
                        px,
                        py,
                        ratio,
                        dw,
                        dh,
                        original_w,
                        original_h
                    )
                )

                kpts[i] = [
                    px,
                    py
                ]

                kpt_conf[i] = pc

            detections.append(
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
                        kpt_conf
                }
            )

        return self.nms(
            detections
        )


    # ========================================================
    # SELECT MAIN PERSON
    # ========================================================

    @staticmethod
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


    # ========================================================
    # STAND DETECTION
    # ========================================================

    @staticmethod
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


    # ========================================================
    # DRAW SKELETON
    # ========================================================

    @staticmethod
    def draw_skeleton(
        frame,
        kpts,
        conf
    ):

        # ----------------------------------------------------
        # Lines
        # ----------------------------------------------------

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

        # ----------------------------------------------------
        # Keypoints
        # ----------------------------------------------------

        for i in range(17):

            if (
                conf[i]
                <
                KPT_CONF_THRESHOLD
            ):

                continue

            px = int(
                kpts[i][0]
            )

            py = int(
                kpts[i][1]
            )

            # Outer circle
            cv2.circle(
                frame,
                (px, py),
                6,
                (255, 255, 255),
                1
            )

            # Keypoint
            cv2.circle(
                frame,
                (px, py),
                4,
                (0, 255, 255),
                -1
            )

        return frame


    # ========================================================
    # BAD TEMPORAL FILTER
    # ========================================================

    def temporal_filter(
        self,
        raw_state
    ):

        now = time.time()

        # ----------------------------------------------------
        # BAD
        # ----------------------------------------------------

        if raw_state == "BAD":

            if (
                self.bad_start_time
                is None
            ):

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

                return (
                    "BAD",
                    elapsed
                )

            # Chưa đủ 1 giây
            return (
                "GOOD",
                elapsed
            )

        # ----------------------------------------------------
        # Anything else
        # ----------------------------------------------------

        self.bad_start_time = None

        return (
            raw_state,
            0.0
        )


    # ========================================================
    # PROCESS ONE FRAME
    # ========================================================

    def process(
        self,
        frame
    ):

        """
        Xử lý một frame.

        Return:

        {
            "status": "GOOD",
            "raw_pred": 0,
            "in_zone": True,
            "keypoints": ndarray,
            "keypoint_conf": ndarray,
            "box": ndarray,
            "inference_ms": float,
            "bad_elapsed": float
        }
        """

        if frame is None:

            return {
                "status": "ABSENT",
                "raw_pred": -1,
                "in_zone": False,
                "keypoints": None,
                "keypoint_conf": None,
                "box": None,
                "inference_ms": 0.0,
                "bad_elapsed": 0.0
            }

        h, w = frame.shape[:2]

        # ----------------------------------------------------
        # Monitoring zone
        # ----------------------------------------------------

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

        # ----------------------------------------------------
        # Preprocess
        # ----------------------------------------------------

        (
            img,
            ratio,
            dw,
            dh
        ) = self.preprocess(
            frame
        )

        # ----------------------------------------------------
        # ONNX inference
        # ----------------------------------------------------

        t0 = time.perf_counter()

        outputs = self.session.run(
            None,
            {
                self.input_name:
                    img
            }
        )

        inference_ms = (
            time.perf_counter()
            -
            t0
        ) * 1000.0

        # ----------------------------------------------------
        # Decode
        # ----------------------------------------------------

        detections = (
            self.decode_output(
                outputs[0],
                frame.shape,
                ratio,
                dw,
                dh
            )
        )

        # ----------------------------------------------------
        # Select main person
        # ----------------------------------------------------

        person_id = (
            self.select_main_person(
                detections
            )
        )

        # ----------------------------------------------------
        # No person
        # ----------------------------------------------------

        if person_id is None:

            self.bad_start_time = None

            return {
                "status": "ABSENT",
                "raw_pred": -1,
                "in_zone": False,
                "keypoints": None,
                "keypoint_conf": None,
                "box": None,
                "inference_ms":
                    inference_ms,
                "bad_elapsed": 0.0
            }

        # ----------------------------------------------------
        # Person
        # ----------------------------------------------------

        person = detections[
            person_id
        ]

        kpts = person[
            "keypoints"
        ]

        conf = person[
            "keypoint_conf"
        ]

        box = person[
            "box"
        ]

        # ----------------------------------------------------
        # Zone check
        # ----------------------------------------------------

        x1, y1, x2, y2 = box

        center_x = (
            x1 + x2
        ) / 2.0

        center_y = (
            y1 + y2
        ) / 2.0

        in_zone = (

            zx1
            <=
            center_x
            <=
            zx2

            and

            zy1
            <=
            center_y
            <=
            zy2
        )

        # ----------------------------------------------------
        # Outside zone
        # ----------------------------------------------------

        if not in_zone:

            self.bad_start_time = None

            return {
                "status":
                    "NGOAI VUNG GIAM SAT",

                "raw_pred": -1,

                "in_zone": False,

                "keypoints":
                    kpts,

                "keypoint_conf":
                    conf,

                "box":
                    box,

                "inference_ms":
                    inference_ms,

                "bad_elapsed":
                    0.0
            }

        # ----------------------------------------------------
        # STAND
        # ----------------------------------------------------

        if self.detect_stand(
            conf
        ):

            self.bad_start_time = None

            return {
                "status":
                    "STAND",

                "raw_pred": -1,

                "in_zone": True,

                "keypoints":
                    kpts,

                "keypoint_conf":
                    conf,

                "box":
                    box,

                "inference_ms":
                    inference_ms,

                "bad_elapsed":
                    0.0
            }

        # ----------------------------------------------------
        # Sitting posture
        # ----------------------------------------------------

        try:

            features = (
                extract_features(
                    kpts
                )
            )

            if features.shape != (7,):

                raise ValueError(
                    "Expected 7 features, "
                    f"got {features.shape}"
                )

            # ------------------------------------------------
            # StandardScaler
            # ------------------------------------------------

            features_scaled = (
                self.scaler.transform(
                    [features]
                )
            )

            # ------------------------------------------------
            # SVM
            # ------------------------------------------------

            pred = (
                self.classifier.predict(
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

        except Exception as e:

            print(
                "Posture classification error:",
                e
            )

            self.bad_start_time = None

            return {
                "status":
                    "ABSENT",

                "raw_pred":
                    -1,

                "in_zone":
                    True,

                "keypoints":
                    kpts,

                "keypoint_conf":
                    conf,

                "box":
                    box,

                "inference_ms":
                    inference_ms,

                "bad_elapsed":
                    0.0
            }

        # ----------------------------------------------------
        # Temporal filter
        # ----------------------------------------------------

        final_state, bad_elapsed = (
            self.temporal_filter(
                raw_state
            )
        )

        # ----------------------------------------------------
        # Return
        # ----------------------------------------------------

        return {
            "status":
                final_state,

            "raw_pred":
                pred_raw,

            "in_zone":
                True,

            "keypoints":
                kpts,

            "keypoint_conf":
                conf,

            "box":
                box,

            "inference_ms":
                inference_ms,

            "bad_elapsed":
                bad_elapsed
        }


# ============================================================
# SIMPLE TEST
# ============================================================

if __name__ == "__main__":

    print()
    print("=" * 60)
    print("POSTURE AI TEST")
    print("=" * 60)

    try:

        ai = PostureAI()

        print()
        print("Model initialization: OK")

        print()
        print("Creating test image...")

        test_frame = np.zeros(
            (
                480,
                640,
                3
            ),
            dtype=np.uint8
        )

        result = ai.process(
            test_frame
        )

        print()
        print("Process result:")
        print(
            "Status       :",
            result["status"]
        )

        print(
            "Raw prediction:",
            result["raw_pred"]
        )

        print(
            "In zone      :",
            result["in_zone"]
        )

        print(
            "AI latency   :",
            f"{result['inference_ms']:.1f} ms"
        )

        print()
        print("POSTURE AI TEST: OK")

    except Exception as e:

        print()
        print("POSTURE AI TEST: FAILED")
        print(
            repr(e)
        )

        raise