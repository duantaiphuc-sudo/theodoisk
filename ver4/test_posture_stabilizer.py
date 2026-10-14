import unittest
from posture_stabilizer import PostureStabilizer, PostureDisplayView


def feed(filt, seconds, raw_fn, start=0.0, dt=.2):
    # samples at [start, start+seconds], includes endpoint
    for i in range(int(round(seconds / dt)) + 1):
        t = start + i * dt
        filt.update(raw_fn(round(t, 6)), t)
    return filt.status


class FilterTests(unittest.TestCase):
    def test_bad_30_sec_with_two_good_frames(self):
        f = PostureStabilizer()
        def raw(t):
            return 'GOOD' if 13.0 <= t < 13.4 else 'BAD'
        self.assertEqual(feed(f, 29.8, raw), 'VERIFYING')
        self.assertEqual(f.update('BAD', 30.0), 'BAD')
        self.assertGreater(f.bad_ratio_30s, .98)

    def test_bad_30_sec_with_two_good_frames_from_initial_good(self):
        f = PostureStabilizer()
        feed(f, 8, lambda t: 'GOOD')
        self.assertEqual(f.status, 'GOOD')
        feed(f, 30.2, lambda t: 'GOOD' if 19 <= t < 19.4 else 'BAD', start=8.2)
        self.assertEqual(f.status, 'BAD')

    def test_one_or_two_bad_frames_do_not_alert(self):
        f = PostureStabilizer()
        feed(f, 6, lambda t: 'GOOD')
        self.assertEqual(f.status, 'GOOD')
        feed(f, 35, lambda t: 'BAD' if 10 <= t < 10.4 else 'GOOD', start=6.2)
        self.assertEqual(f.status, 'GOOD')

    def test_good_blips_do_not_clear_bad(self):
        f = PostureStabilizer()
        feed(f, 31, lambda t: 'BAD')
        self.assertEqual(f.status, 'BAD')
        feed(f, 8, lambda t: 'GOOD' if 32 <= t < 32.4 else 'BAD', start=31.2)
        self.assertEqual(f.status, 'BAD')

    def test_recovery_needs_8_good_seconds(self):
        f = PostureStabilizer()
        feed(f, 31, lambda t: 'BAD')
        feed(f, 7, lambda t: 'GOOD', start=31.2)
        self.assertEqual(f.status, 'BAD')
        feed(f, 2, lambda t: 'GOOD', start=38.4)
        self.assertEqual(f.status, 'GOOD')

    def test_short_absence_is_debounced_and_long_absence_resets(self):
        f = PostureStabilizer()
        feed(f, 31, lambda t: 'BAD')
        feed(f, .6, lambda t: 'ABSENT', start=31.2)
        self.assertEqual(f.status, 'BAD')
        feed(f, 2, lambda t: 'ABSENT', start=32.)
        self.assertEqual(f.status, 'ABSENT')
        f.update('GOOD', 34.2)
        self.assertEqual(f.status, 'VERIFYING')

    def test_stale_error_resets_immediately(self):
        f = PostureStabilizer()
        feed(f, 31, lambda t: 'BAD')
        self.assertEqual(f.update('ERROR', 31.2), 'ERROR')
        self.assertEqual(f.update('GOOD', 31.4), 'VERIFYING')

    def test_long_gap_does_not_count(self):
        f = PostureStabilizer()
        f.update('BAD', 0.)
        f.update('BAD', 100.)
        self.assertEqual(f.status, 'VERIFYING')
        self.assertEqual(f.bad_ratio_30s, 0)

    def test_variable_ai_fps(self):
        f = PostureStabilizer()
        # Irregular but dense enough; use time-based durations not frame count
        t = 0.
        for i in range(100):
            f.update('BAD', t)
            t += .3 if i % 2 == 0 else .35
        self.assertEqual(f.status, 'BAD')

    def test_display_view_returns_same_snapshot(self):
        class FakeWorker:
            def get_snapshot(self): return {'status': 'BAD', 'raw_status': 'BAD'}
            def extra(self): return 'ok'
        w = PostureDisplayView(FakeWorker())
        w.set_snapshot({'status': 'GOOD', 'raw_status': 'BAD'})
        self.assertEqual(w.get_snapshot()['status'], 'GOOD')
        self.assertEqual(w.extra(), 'ok')


if __name__ == '__main__':
    unittest.main(verbosity=2)
