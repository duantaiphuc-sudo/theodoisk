"""Offline integration smoke test, no Pi hardware / camera / Firebase required."""
import importlib.util
import sys
import types
from pathlib import Path

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root))

def mod(name, **attrs):
    m = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules[name] = m

mod('cv2')
mod('numpy')
mod('posture_worker2', PostureWorker=object, draw_ui=lambda x, w, fps: x)
mod('health_worker', HealthWorker=object)
mod('firebase_manager', FirebaseManager=object)
mod('tft_display_worker', TftDisplayWorker=object)
# `health_output.py` is a real Python-only module.
spec = importlib.util.spec_from_file_location('mainnew_smoke', root / 'mainnew.py')
main = importlib.util.module_from_spec(spec)
spec.loader.exec_module(main)

assert main.posture_to_schema({'status':'VERIFYING'}, 0)[0] == -1
assert main.posture_to_schema({'status':'GOOD'}, 0)[0] == 0
assert main.posture_to_schema({'status':'BAD'}, 0)[0] == 1
assert main.posture_to_schema({'status':'BAD'}, 120)[0] == 3
assert main.posture_to_schema({'status':'ABSENT'}, 0)[0] == 2

# Both main and camera overlay get same filtered snapshot without touching AI.
class Dummy:
    def get_snapshot(self):
        return {'status':'GOOD', 'raw_status':'GOOD', 'pred_raw':0}
    def get_frame(self): return None
view = main.PostureDisplayView(Dummy())
view.set_snapshot({'status':'BAD', 'raw_status':'GOOD', 'pred_raw':0})
assert view.get_snapshot()['status'] == 'BAD'
assert main.posture_to_schema(view.get_snapshot(), 0)[0] == 1
print('main posture/Firebase mapping smoke test: PASS')
