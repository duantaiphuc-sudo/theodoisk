#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
posture_features.py
===================

7-feature geometric extractor used by the Raspberry Pi posture SVM.

Feature order MUST NOT be changed without retraining:
    1. neck_angle
    2. head_forward
    3. shoulder_tilt
    4. head_tilt
    5. shoulder_balance
    6. left_arm_angle
    7. right_arm_angle

Input:
    keypoints: numpy array/list with shape (17, 2)

YOLO COCO keypoint order:
    0 nose
    1 left eye
    2 right eye
    3 left ear
    4 right ear
    5 left shoulder
    6 right shoulder
    7 left elbow
    8 right elbow
    9 left wrist
    10 right wrist
    11 left hip
    12 right hip
    13 left knee
    14 right knee
    15 left ankle
    16 right ankle
"""

import math
import numpy as np


def distance(a, b):
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    return float(np.linalg.norm(a - b))


def angle_between(v1, v2):
    v1 = np.asarray(v1, dtype=np.float32)
    v2 = np.asarray(v2, dtype=np.float32)

    denom = float(np.linalg.norm(v1) * np.linalg.norm(v2))
    if denom <= 1e-9:
        return 0.0

    cosine = float(np.dot(v1, v2) / denom)
    cosine = float(np.clip(cosine, -1.0, 1.0))

    return float(math.degrees(math.acos(cosine)))


def line_angle(p1, p2):
    p1 = np.asarray(p1, dtype=np.float32)
    p2 = np.asarray(p2, dtype=np.float32)

    return float(
        math.degrees(
            math.atan2(
                float(p2[1] - p1[1]),
                float(p2[0] - p1[0]),
            )
        )
    )


def extract_features(kpts):
    """
    Return exactly 7 float32 geometric features.

    The implementation is intentionally aligned with the 7-feature
    extractor embedded in the current Raspberry Pi ONNX worker.
    """

    kpts = np.asarray(kpts, dtype=np.float32)

    if kpts.shape != (17, 2):
        raise ValueError(
            f"Expected keypoints shape (17, 2), got {kpts.shape}"
        )

    nose = kpts[0]

    left_ear = kpts[3]
    right_ear = kpts[4]

    left_shoulder = kpts[5]
    right_shoulder = kpts[6]

    left_elbow = kpts[7]
    right_elbow = kpts[8]

    left_wrist = kpts[9]
    right_wrist = kpts[10]

    shoulder_center = np.array(
        [
            (left_shoulder[0] + right_shoulder[0]) / 2.0,
            (left_shoulder[1] + right_shoulder[1]) / 2.0,
        ],
        dtype=np.float32,
    )

    # 1. Neck angle relative to the vertical axis.
    neck_vector = nose - shoulder_center
    neck_angle = angle_between(
        neck_vector,
        np.array([0.0, -1.0], dtype=np.float32),
    )

    # 2. Forward-head displacement normalized by shoulder width.
    shoulder_width = distance(
        left_shoulder,
        right_shoulder,
    )

    if shoulder_width > 1e-6:
        head_forward = abs(
            float(nose[0] - shoulder_center[0])
        ) / shoulder_width
    else:
        head_forward = 0.0

    # 3. Shoulder tilt.
    shoulder_tilt = line_angle(
        left_shoulder,
        right_shoulder,
    )

    # 4. Head tilt.
    head_tilt = line_angle(
        left_ear,
        right_ear,
    )

    # 5. Shoulder balance.
    shoulder_balance = abs(
        float(left_shoulder[1] - right_shoulder[1])
    ) / max(shoulder_width, 1.0)

    # 6. Left arm angle at elbow.
    left_arm_angle = angle_between(
        left_shoulder - left_elbow,
        left_wrist - left_elbow,
    )

    # 7. Right arm angle at elbow.
    right_arm_angle = angle_between(
        right_shoulder - right_elbow,
        right_wrist - right_elbow,
    )

    features = np.array(
        [
            neck_angle,
            head_forward,
            shoulder_tilt,
            head_tilt,
            shoulder_balance,
            left_arm_angle,
            right_arm_angle,
        ],
        dtype=np.float32,
    )

    if features.shape != (7,):
        raise RuntimeError(
            f"Feature extractor returned {features.shape}, expected (7,)"
        )

    return features


if __name__ == "__main__":
    dummy = np.zeros((17, 2), dtype=np.float32)
    print("7-feature extractor self-test:", extract_features(dummy))
