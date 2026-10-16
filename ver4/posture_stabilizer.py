#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Time-based posture debouncer for Office Health.

This module does not run inference and does not touch the camera, GPIO,
MAX30102, Firebase, or ST7789. It consumes raw GOOD/BAD/ABSENT/.. labels.

- Enter BAD after a nearly full 30 s observation window with >=85% BAD.
- Once BAD is confirmed, 1-2 GOOD frames do not clear the warning.
- Recover from BAD only after >=8 s dominated by GOOD (>=85%).
- Enter initial GOOD after >=4 s dominated by GOOD (>=80%).
- Debounce brief absence/standing/out-of-zone (<1.5 s).
- ERROR and stale input are immediate, and no samples are counted across
  large update gaps (e.g. process suspended).

All durations are measured with time.monotonic(), NOT number of camera frames.
This avoids changes of behavior when YOLO throughput varies on Raspberry Pi.
"""

from collections import deque


class PostureStabilizer:
    SEATED = frozenset(("GOOD", "BAD"))
    AWAY = frozenset(("ABSENT", "STAND", "NGOAI VUNG GIAM SAT"))

    def __init__(self, bad_window=30.0, bad_fraction=0.85,
                 recovery_window=8.0, recovery_fraction=0.85,
                 initial_good_window=4.0, initial_good_fraction=0.80,
                 away_delay=1.5, max_gap=1.5):
        self.bad_window = float(bad_window)
        self.bad_fraction = float(bad_fraction)
        self.recovery_window = float(recovery_window)
        self.recovery_fraction = float(recovery_fraction)
        self.initial_good_window = float(initial_good_window)
        self.initial_good_fraction = float(initial_good_fraction)
        self.away_delay = float(away_delay)
        self.max_gap = float(max_gap)
        self.window = max(self.bad_window, self.recovery_window, self.initial_good_window)
        self._segments = deque()
        self._last_time = None
        self._last_raw = None
        self._away_since = None
        self._bad_since = None
        self._good_since = None
        self._last_bad_seen = None
        self._last_good_seen = None
        self.status = "VERIFYING"
        self.bad_ratio_30s = 0.0
        self.good_ratio_8s = 0.0

    def reset(self, status="VERIFYING"):
        self._segments.clear()
        self._last_time = None
        self._last_raw = None
        self._away_since = None
        self._bad_since = None
        self._good_since = None
        self._last_bad_seen = None
        self._last_good_seen = None
        self.status = status
        self.bad_ratio_30s = 0.0
        self.good_ratio_8s = 0.0

    def _totals(self, now, window):
        """Seconds classified GOOD or BAD within the trailing time window."""
        cutoff = now - window
        good = bad = 0.0
        for start, end, raw in self._segments:
            d = max(0.0, min(end, now) - max(start, cutoff))
            if raw == "GOOD":
                good += d
            elif raw == "BAD":
                bad += d
        return good, bad

    def _enough(self, now, window, wanted, fraction, coverage=0.90):
        good, bad = self._totals(now, window)
        valid = good + bad
        if valid < window * coverage:
            return False
        matching = good if wanted == "GOOD" else bad
        return matching / valid >= fraction

    def update(self, raw, now):
        """Consume one raw observation. Return stable status.

        `now` should be time.monotonic(). Call at around 0.2 s intervals.
        When input status is ERROR (including camera stale), reset immediately.
        """
        now = float(now)
        raw = str(raw or "ABSENT").upper()
        if raw not in self.SEATED and raw not in self.AWAY and raw != "ERROR":
            raw = "ABSENT"

        if raw == "ERROR":
            self.reset("ERROR")
            return self.status

        if self._last_time is not None:
            dt = now - self._last_time
            if dt < 0 or dt > self.max_gap:
                # A long pause cannot be evidence of continuous posture.
                self.reset("VERIFYING")
            elif dt > 0:
                self._segments.append((self._last_time, now, self._last_raw))

        cutoff = now - self.window
        while self._segments and self._segments[0][1] <= cutoff:
            self._segments.popleft()

        if raw in self.AWAY:
            if self._away_since is None:
                self._away_since = now
            if now - self._away_since >= self.away_delay:
                # Don't keep BAD displayed after the person has left.
                self.reset(raw)
                self._away_since = now
            self._last_time, self._last_raw = now, raw
            return self.status

        # Seated observation: cancel any short away glitch.
        self._away_since = None
        if self.status not in ("GOOD", "BAD", "VERIFYING"):
            self.status = "VERIFYING"

        # Candidates must exist for the WHOLE confirmation time. Opposite
        # observations shorter than 2 seconds do not reset a candidate.
        if raw == "BAD":
            if self._bad_since is None:
                self._bad_since = now
            self._last_bad_seen = now
            if (self._good_since is not None and self._last_good_seen is not None
                    and now - self._last_good_seen >= 2.0):
                self._good_since = None
        else:
            if self._good_since is None:
                self._good_since = now
            self._last_good_seen = now
            if (self._bad_since is not None and self._last_bad_seen is not None
                    and now - self._last_bad_seen >= 2.0):
                self._bad_since = None

        good30, bad30 = self._totals(now, self.bad_window)
        good8, bad8 = self._totals(now, self.recovery_window)
        self.bad_ratio_30s = bad30 / (good30 + bad30) if good30 + bad30 else 0.0
        self.good_ratio_8s = good8 / (good8 + bad8) if good8 + bad8 else 0.0

        if self.status == "BAD":
            if (self._good_since is not None and
                    now - self._good_since >= self.recovery_window and
                    self._enough(now, self.recovery_window, "GOOD", self.recovery_fraction)):
                self.status = "GOOD"
                self._bad_since = None
        elif (self._bad_since is not None and
              now - self._bad_since >= self.bad_window and
              self._enough(now, self.bad_window, "BAD", self.bad_fraction)):
            self.status = "BAD"
            self._good_since = None
        elif self.status == "VERIFYING":
            if (self._good_since is not None and
                    now - self._good_since >= self.initial_good_window and
                    self._enough(now, self.initial_good_window,
                                 "GOOD", self.initial_good_fraction)):
                self.status = "GOOD"
                self._bad_since = None
        # A confirmed GOOD remains GOOD during ambiguous/wobbly predictions
        # until BAD has enough 30-second evidence.

        self._last_time, self._last_raw = now, raw
        return self.status


class PostureDisplayView:
    """Pass stabilized status to existing draw_ui without changing AI worker.

    draw_ui(worker, ...) currently calls worker.get_snapshot() again; this proxy
    ensures the overlay sees the SAME stable snapshot as Firebase and ST7789.
    Any additional worker attributes remain delegated to the real worker.
    """

    def __init__(self, worker):
        self._worker = worker
        self._snapshot = None

    def set_snapshot(self, snapshot):
        self._snapshot = dict(snapshot)

    def get_snapshot(self):
        if self._snapshot is not None:
            return dict(self._snapshot)
        return self._worker.get_snapshot()

    def __getattr__(self, name):
        return getattr(self._worker, name)
