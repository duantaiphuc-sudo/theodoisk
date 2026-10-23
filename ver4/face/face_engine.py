"""Camera-sharing YuNet/SFace enrollment and verification for Raspberry Pi 4.

Uses PostureWorker.get_frame(): never opens a second VideoCapture.
The enrollment vector is biometric data. Only upload one 112x112 aligned JPEG
preview with explicit consent; never upload a full office/camera frame.
"""
import base64
import math
import os
import time

import cv2
import numpy as np


MODEL_NAME = "opencv_sface_2021dec"


class FaceEngineError(RuntimeError):
    pass


class FaceEngine:
    def __init__(self, camera, yunet_path, sface_path, threshold=0.72,
                 width=320, height=240, min_face_pixels=55):
        for name, path in (("YuNet", yunet_path), ("SFace", sface_path)):
            if not os.path.isfile(path):
                raise FileNotFoundError(f"{name} model not found: {path}")
        self.camera = camera
        self.size = (width, height)
        self.min_face_pixels = min_face_pixels
        self.threshold = float(threshold)
        if not 0.30 <= self.threshold <= 0.98:
            raise ValueError("SFace cosine threshold must be between 0.30 and 0.98")
        # Create models lazily inside the one face-command worker thread.
        self.yunet_path = yunet_path
        self.sface_path = sface_path
        self.detector = None
        self.recognizer = None

    def _ensure_models(self):
        if self.detector is None:
            self.detector = cv2.FaceDetectorYN.create(
                self.yunet_path, "", self.size, score_threshold=0.85,
                nms_threshold=0.3, top_k=5)
            self.recognizer = cv2.FaceRecognizerSF.create(self.sface_path, "")

    @staticmethod
    def _unit(vector):
        v = np.asarray(vector, dtype=np.float32).reshape(-1)
        if v.size != 128 or not np.isfinite(v).all():
            raise FaceEngineError("Invalid SFace 128D embedding")
        norm = float(np.linalg.norm(v))
        if not math.isfinite(norm) or norm < 1e-7:
            raise FaceEngineError("Empty SFace embedding")
        return v / norm

    def sample(self, include_aligned=False):
        """Return 128D normalized vector; optionally also return an aligned face."""
        frame = self.camera.get_frame()
        if frame is None or frame.size == 0:
            return None
        self._ensure_models()
        original_h, original_w = frame.shape[:2]
        w, h = self.size
        small = cv2.resize(frame, self.size, interpolation=cv2.INTER_AREA)
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(small)
        if faces is None or len(faces) != 1:
            return None
        face = faces[0].astype(np.float32, copy=True)
        if face[2] < self.min_face_pixels or face[3] < self.min_face_pixels:
            return None
        # YuNet 15-column face output: rect(x,y,w,h), five landmark pairs, score.
        face[0:14:2] *= float(original_w) / w
        face[1:14:2] *= float(original_h) / h
        aligned = self.recognizer.alignCrop(frame, face)
        if aligned is None or aligned.size == 0:
            return None
        vector = self._unit(self.recognizer.feature(aligned))
        return (vector, aligned) if include_aligned else vector

    def enroll(self, progress, cancelled, count=5, timeout=35.0):
        """Collect five independent samples plus one small JPEG for Web review."""
        start = time.monotonic()
        vectors = []
        next_capture = start
        while time.monotonic() - start < timeout:
            if cancelled():
                raise FaceEngineError("CANCELLED")
            now = time.monotonic()
            if now < next_capture:
                time.sleep(min(0.08, next_capture - now))
                continue
            next_capture = now + 0.55
            result = self.sample(include_aligned=True)
            if result is None:
                continue
            v, aligned_face = result
            # Reject wildly inconsistent enrollment frames; allow natural variation.
            if vectors and min(float(np.dot(v, prev)) for prev in vectors) < 0.55:
                continue
            vectors.append(v)
            progress(len(vectors), count)
            if len(vectors) == count:
                # The stored 128D embedding remains the average of five
                # independently accepted captures, not a single photo.
                template = self._unit(np.mean(vectors, axis=0))

                # SFace alignCrop() already returns a face-only 112x112 crop.
                # Keep a small preview so Firestore and Web stay lightweight.
                preview = cv2.resize(aligned_face, (112, 112),
                                     interpolation=cv2.INTER_AREA)
                success, jpeg = cv2.imencode(
                    '.jpg', preview, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                if not success:
                    raise FaceEngineError('FACE_IMAGE_ENCODE_FAILED')
                image_b64 = ('data:image/jpeg;base64,' +
                             base64.b64encode(jpeg.tobytes()).decode('ascii'))
                # Small enough for Firestore document and Web command result.
                if len(image_b64) > 100_000:
                    raise FaceEngineError('FACE_IMAGE_TOO_LARGE')
                return template, image_b64
        raise FaceEngineError("ENROLL_TIMEOUT")

    def verify(self, stored_template, progress, cancelled, hits_required=3,
               attempts_limit=7, timeout=25.0):
        """Multiple frame checks. No single frame can unlock a work session."""
        target = self._unit(stored_template)
        since = time.monotonic()
        attempts, hits, last_score = 0, 0, 0.0
        next_capture = since
        while time.monotonic() - since < timeout and attempts < attempts_limit:
            if cancelled():
                raise FaceEngineError("CANCELLED")
            now = time.monotonic()
            if now < next_capture:
                time.sleep(min(0.08, next_capture - now))
                continue
            next_capture = now + 0.50
            query = self.sample()
            if query is None:
                continue
            attempts += 1
            last_score = float(np.dot(target, query))
            if last_score >= self.threshold:
                hits += 1
            progress(hits, hits_required)
            if hits >= hits_required:
                return True, last_score
            if hits + (attempts_limit - attempts) < hits_required:
                break
        return False, last_score
