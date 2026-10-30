"""Offline JPEG/embedding smoke test, no camera, Firebase or model files."""
from pathlib import Path
import importlib.util
import base64
import cv2
import numpy as np

here = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('face_engine', here / 'face' / 'face_engine.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
engine = mod.FaceEngine.__new__(mod.FaceEngine)
engine.threshold = 0.72
base_vec = np.zeros(128, dtype=np.float32)
base_vec[0] = 1.0
aligned = np.full((112, 112, 3), 150, dtype=np.uint8)
engine.sample = lambda include_aligned=False: (base_vec.copy(), aligned.copy()) if include_aligned else base_vec.copy()
progress_calls = []
vector, image_b64 = engine.enroll(lambda n, total: progress_calls.append((n,total)), lambda: False, timeout=10)
assert len(vector)==128 and abs(float(np.linalg.norm(vector))-1) < 1e-5
assert progress_calls == [(1,5),(2,5),(3,5),(4,5),(5,5)]
assert image_b64.startswith('data:image/jpeg;base64,')
assert len(image_b64)<100000
raw = base64.b64decode(image_b64.split(',',1)[1])
image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
assert image is not None and image.shape[:2] == (112,112)
assert engine.verify(vector,lambda *_:None,lambda:False,timeout=5)[0]
print('PASS: 5 images, 128D averaged embedding, JPEG 112x112, Base64, 3/3 verify')
