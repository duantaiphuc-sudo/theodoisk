"""Offline tests for filtered HR responsiveness, not clinical accuracy."""
import unittest
from unittest.mock import patch
from collections import deque
import numpy as np
import ppg_processor as p

class TestV8(unittest.TestCase):
    def setUp(self):
        self.proc=p.PPGProcessor()
        self.proc.finger_active=True
        self.proc.warmup_complete=True
        signal=180*np.sin(2*np.pi*np.arange(p.BUFFER_SIZE)/16)
        self.proc.filtered_buffer=deque(signal,maxlen=p.BUFFER_SIZE)
        self.proc.ir_buffer=deque([85000]*p.BUFFER_SIZE,maxlen=p.BUFFER_SIZE)
        self.proc.red_buffer=deque([78000]*p.BUFFER_SIZE,maxlen=p.BUFFER_SIZE)

    def candidate_at(self,t,bpm=88.2,sqi=.85,acf=None):
        if acf is None: acf=bpm
        with patch.object(p,'detect_peaks',return_value=list(range(0,240,16))),\
             patch.object(p,'peak_based_hr',return_value=(bpm,None,.05)),\
             patch.object(p,'autocorrelation_hr',return_value=(acf,.78)),\
             patch.object(p,'calculate_sqi',return_value=sqi),\
             patch.object(p,'calculate_spo2_doug',return_value=(99.1,False)),\
             patch.object(p.time,'monotonic',return_value=t):
            self.proc._analyze()
            return self.proc.get_result()

    def test_first_result_unmodified(self):
        for t in (0,2,4): out=self.candidate_at(t,88.2)
        self.assertAlmostEqual(out['bpm'],88.2)
        self.assertAlmostEqual(out['hr_window_median'],88.2)

    def test_responds_to_sustained_change_in_three_cycles(self):
        for t in (0,2,4):out=self.candidate_at(t,88.2)
        self.assertAlmostEqual(out['bpm'],88.2)
        for t in (10,12,14): out=self.candidate_at(t,94)
        self.assertGreater(out['bpm'],91.0)
        self.assertLess(out['bpm'],94.0)
        for t in (20,22,24): out=self.candidate_at(t,94)
        for t in (30,32,34): out=self.candidate_at(t,94)
        self.assertGreater(out['bpm'],93.2)
        self.assertEqual(self.proc.last_hr_publish_at,34)
        self.assertEqual(self.proc.hr_reject_reason,'ACCEPTED')

    def test_only_publishes_every_ten_seconds(self):
        for t in (0,2,4):out=self.candidate_at(t,90)
        before=self.proc.latest_bpm
        for t in (6,8,10,12): out=self.candidate_at(t,100)
        self.assertEqual(self.proc.last_hr_publish_at,4)
        self.assertEqual(self.proc.latest_bpm,before)
        out=self.candidate_at(14,100)
        self.assertEqual(self.proc.last_hr_publish_at,14)

    def test_rejected_hr_does_not_update(self):
        for t in (0,2,4):self.candidate_at(t,88.2)
        before=self.proc.latest_bpm
        for t in (10,12,14,16,18):out=self.candidate_at(t,125,sqi=.2)
        self.assertEqual(self.proc.latest_bpm,before)
        self.assertEqual(self.proc.last_hr_publish_at,4)

    def test_stale_is_not_relabelled_as_fresh(self):
        for t in (0,2,4):self.candidate_at(t,90)
        with patch.object(p.time,'monotonic',return_value=20):
            out=self.proc.get_result()
            self.assertIsNone(out['bpm'])
            self.assertEqual(out['hr_age_seconds'],16)

    def test_state_reset(self):
        for t in (0,2,4):self.candidate_at(t,90)
        self.proc.reset()
        out=self.proc.get_result()
        self.assertIsNone(out['bpm'])
        self.assertIsNone(out['hr_window_median'])
        self.assertIsNone(out['hr_age_seconds'])

    def test_spo2_filter_kept(self):
        self.assertEqual(p.SPO2_EMA_ALPHA,.15)
        self.assertEqual(p.RESULT_REFRESH_SECONDS,10.0)
        self.assertEqual(p.MIN_INDEPENDENT_ESTIMATES,3)

if __name__=='__main__':unittest.main(verbosity=2)
