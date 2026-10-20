"""Offline regression tests: verified V8 HR -> same camera/TFT/Firebase view."""
import math
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = str(Path(__file__).resolve().parent)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from health_output import resolve_health_output


def snap(**kwargs):
    data = dict(status='READY', finger_detected=True, warmup_complete=True,
                warmup_remaining=0, buffer_samples=250, bpm=94.3,
                spo2=99.1, sqi=.92, hr_window_median=94.0,
                hr_age_seconds=.3, hr_reject_reason='ACCEPTED')
    data.update(kwargs)
    return data


class TestGate(unittest.TestCase):
    def test_confirmed_v8(self):
        x = resolve_health_output(snap())
        self.assertEqual(x.bpm, 94.3)
        self.assertTrue(x.hr_reliable)
        self.assertEqual(x.health_status, 'HR_CONFIRMED')
        self.assertEqual(x.spo2, 99.1)

    def test_during_warmup_even_if_bpm_dangling(self):
        x = resolve_health_output(snap(status='WARMUP', warmup_complete=False))
        self.assertIsNone(x.bpm)
        self.assertFalse(x.hr_reliable)
        self.assertEqual(x.health_status, 'WARMUP')

    def test_waits_for_verified_v8_publication(self):
        for fields in ({'bpm': None, 'hr_window_median': None},
                       {'hr_age_seconds': None}, {'hr_window_median': None},
                       {'buffer_samples': 249}):
            x = resolve_health_output(snap(**fields))
            self.assertIsNone(x.bpm, str(fields))
            self.assertEqual(x.health_status, 'MEASURING')
            # SpO2 independence in V8 preserved
            self.assertEqual(x.spo2, 99.1)

    def test_stale_hr_must_not_publish(self):
        x = resolve_health_output(snap(hr_age_seconds=15.1))
        self.assertFalse(x.hr_reliable)
        self.assertIsNone(x.bpm)

    def test_finger_lost_resets_even_recent_verified(self):
        x = resolve_health_output(snap(status='NO_FINGER', finger_detected=False))
        self.assertFalse(x.hr_reliable)
        self.assertIsNone(x.bpm)
        self.assertIsNone(x.spo2)
        self.assertEqual(x.health_status, 'NO_FINGER')

    def test_sensor_stalled_does_not_leak_hr(self):
        for status in ('SENSOR_ERROR','SENSOR_STALE','SENSOR_STALLED'):
            x = resolve_health_output(snap(status=status))
            self.assertIsNone(x.bpm)
            self.assertEqual(x.health_status, status)

    def test_recent_confirmed_hr_can_outlive_last_bad_candidate(self):
        # V8 has independently qualified one HR publish, though a newer
        # overlapping 2 s window may fail SQI. Label as weak/last HR.
        x = resolve_health_output(snap(sqi=.20, hr_reject_reason='LOW_SQI'))
        self.assertTrue(x.hr_reliable)
        self.assertEqual(x.bpm, 94.3)
        self.assertEqual(x.health_status, 'SIGNAL_WEAK')

    def test_reject_nonfinite_and_outside_hr_range(self):
        for hr in ('NaN', math.inf, 500, 12, None):
            self.assertFalse(resolve_health_output(snap(bpm=hr)).hr_reliable)


class DummySpi:
    instances = []
    def __init__(self):
        self.transfers = []
        self.closed = False
        self.instances.append(self)
    def open(self, bus, dev):
        assert (bus, dev) == (0, 0)
    def writebytes(self, value):
        self.transfers.append(len(value))
    def writebytes2(self, value):
        self.transfers.append(len(value))
    def close(self):
        self.closed = True


class DummyGPIO(types.ModuleType):
    BCM=11; OUT=1; HIGH=1; LOW=0
    def __init__(self):
        super().__init__('RPi.GPIO')
        self.cleaned = []
    def setmode(self, _): pass
    def setwarnings(self, _): pass
    def setup(self, *_): pass
    def output(self, *_): pass
    def cleanup(self, pins): self.cleaned.append(pins)


class TestIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gpio = DummyGPIO()
        spidev = types.ModuleType('spidev')
        spidev.SpiDev = DummySpi
        rpi = types.ModuleType('RPi')
        rpi.GPIO = cls.gpio
        sys.modules['spidev'] = spidev
        sys.modules['RPi'] = rpi
        sys.modules['RPi.GPIO'] = cls.gpio
        post = types.ModuleType('posture_worker2')
        post.PostureWorker = MagicMock()
        post.draw_ui = MagicMock()
        sys.modules['posture_worker2'] = post
        fb = types.ModuleType('firebase_manager')
        fb.FirebaseManager = MagicMock()
        sys.modules['firebase_manager'] = fb
        maxmod = types.ModuleType('max30102')
        maxmod.MAX30102 = MagicMock()
        sys.modules['max30102'] = maxmod
        import mainnew
        import tft_display_worker
        cls.main = mainnew
        cls.tft = tft_display_worker

    def test_both_channels_use_same_hr(self):
        m = self.main
        for state in (snap(), snap(bpm=None, hr_window_median=None),
                      snap(status='NO_FINGER', finger_detected=False),
                      snap(hr_age_seconds=16),
                      snap(sqi=.2, hr_reject_reason='LOW_SQI')):
            out = resolve_health_output(state)
            fbhr, fbspo2 = m.health_to_schema(state)
            tft = m.health_for_tft(state)
            self.assertEqual(tft['bpm'], out.bpm)
            self.assertEqual(tft['hr_reliable'], out.hr_reliable)
            self.assertEqual(fbhr, out.bpm if out.hr_reliable else 0.0)
            self.assertEqual(fbspo2, out.spo2 or 0.0)

    def test_tft_measuring_and_verified_renders(self):
        d = self.tft.TftDisplayWorker(fps=2)
        try:
            nohr = self.main.health_for_tft(snap(bpm=None, hr_window_median=None))
            d.update(**nohr, posture_label='Good')
            img = d._render_image(dict(d.state))
            self.assertEqual(img.size, (240,240))
            d._display_image(img)
            self.assertEqual(d.spi.transfers[-1], 115200)
            self.assertEqual(d.state['health_status'], 'MEASURING')
            self.assertFalse(d.state['hr_reliable'])
            yeshr = self.main.health_for_tft(snap())
            d.update(**yeshr)
            img = d._render_image(dict(d.state))
            self.assertTrue(d.state['hr_reliable'])
            self.assertEqual(d.state['health_status'], 'HR_CONFIRMED')
        finally:
            d.stop()
        self.assertEqual(self.gpio.cleaned[-1], [25,24])

    def test_main_loop_mock_smoke(self):
        m=self.main
        class FakePosture:
            def start(self): pass
            def get_snapshot(self): return {'status':'GOOD','stale':False,'is_in_zone':True}
            def stop(self): pass
        class FakeHealth:
            def start(self): pass
            def print_status(self,*_): pass
            def stop(self): pass
        class FakeSampler:
            def __init__(self,_): self.calls=0
            def start(self): pass
            def snapshot(self):
                self.calls+=1
                if self.calls>=6: raise KeyboardInterrupt()
                return snap() if self.calls>2 else snap(bpm=None, hr_window_median=None)
            def stop(self): pass
        class FakeFirebase:
            def __init__(self): self.writes=[]
            def get_device(self): return {}
            def safe_update_runtime(self,**kwargs):
                self.writes.append(kwargs)
                return True
            def close(self): pass
        class FakeTft:
            last=None
            def __init__(self,**kwargs): self.updates=[]; self.stopped=False; FakeTft.last=self
            def start(self): pass
            def update(self,**kwargs): self.updates.append(kwargs)
            def stop(self): self.stopped=True
        with patch.object(m,'PostureWorker',FakePosture),\
             patch.object(m,'HealthWorker',FakeHealth),\
             patch.object(m,'HealthSampler',FakeSampler),\
             patch.object(m,'FirebaseManager',FakeFirebase),\
             patch.object(m,'TftDisplayWorker',FakeTft),\
             patch.object(sys,'argv',['mainnew.py','--headless']),\
             patch.object(m.time,'sleep',lambda _:None),\
             patch.object(m,'STATE_UPDATE_INTERVAL',-1):
            m.main()
        self.assertTrue(FakeTft.last.stopped)
        self.assertGreaterEqual(len(FakeTft.last.updates),4)
        self.assertEqual(FakeTft.last.updates[0]['health_status'],'MEASURING')
        self.assertIsNone(FakeTft.last.updates[0]['bpm'])
        self.assertEqual(FakeTft.last.updates[-1]['bpm'],94.3)

if __name__ == '__main__':
    unittest.main(verbosity=2)
