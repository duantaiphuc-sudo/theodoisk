#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""One shared decision for camera, ST7789 and Firebase outputs.

This file does NOT compute pulse/SpO2; V8 ppg_processor.py is the only
source of validated HR. A displayed/published HR requires V8's 3-window
publication AND a fresh result; raw PeakHR/ACFHR are not publishable.
"""
from dataclasses import dataclass
from typing import Optional
import math

V8_HR_STALE_SECONDS = 15.0  # Must agree with V8 RESULT_STALE_SECONDS.
HR_MIN = 40.0
HR_MAX = 180.0
SPO2_MIN = 70.0
SPO2_MAX = 100.0
SAMPLE_BUFFER_MIN = 250  # V8 MIN_BUFFER.
HR_SQI_MIN = 0.52  # Status explanation only, NOT a new HR acceptance gate.
SENSOR_BAD_STATUSES = {"SENSOR_ERROR", "SENSOR_STALE", "SENSOR_STALLED"}


def _finite_float(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError, OverflowError):
        return None


@dataclass(frozen=True)
class HealthOutput:
    bpm: Optional[float]
    spo2: Optional[float]
    hr_reliable: bool
    health_status: str
    finger: bool
    warmup: float
    sqi: float
    hr_age: Optional[float]


def resolve_health_output(result):
    """Return a single trusted view of a V8 health snapshot.

    HR is NOT shown just because a raw estimator has a BPM number.
    Requires finger+warmup+250-sample buffer, V8 published BPM,
    median of verified candidates, and an age within 15 seconds.
    SpO2 keeps its own original V8 quality/freshness gate.
    """
    raw_status = str(result.get("status", "STARTING"))
    finger = bool(result.get("finger_detected", False))
    warmup_complete = bool(result.get("warmup_complete", False))
    warmup = max(0.0, _finite_float(result.get("warmup_remaining")) or 0.0)
    sqi = _finite_float(result.get("sqi")) or 0.0
    valid_session = (finger and warmup_complete
                     and raw_status not in SENSOR_BAD_STATUSES
                     and raw_status == "READY")

    bpm = _finite_float(result.get("bpm"))
    hr_median = _finite_float(result.get("hr_window_median"))
    hr_age = _finite_float(result.get("hr_age_seconds"))
    samples = result.get("buffer_samples")
    try:
        full_buffer = int(samples) >= SAMPLE_BUFFER_MIN
    except (ValueError, TypeError, OverflowError):
        full_buffer = False

    # Only V8's officially published/still-fresh result, not candidate_bpm,
    # peak_bpm or acf_bpm. Do NOT require HRCheck=ACCEPTED *right now*:
    # V8 can publish a valid result then reject the next 2-second window.
    hr_reliable = bool(valid_session and full_buffer
                       and bpm is not None and HR_MIN <= bpm <= HR_MAX
                       and hr_median is not None
                       and hr_age is not None
                       and 0 <= hr_age <= V8_HR_STALE_SECONDS)
    if not hr_reliable:
        bpm = None

    spo2 = _finite_float(result.get("spo2")) if valid_session else None
    if spo2 is not None and not (SPO2_MIN <= spo2 <= SPO2_MAX):
        spo2 = None

    if raw_status in SENSOR_BAD_STATUSES:
        status = raw_status
    elif raw_status == "STARTING":
        status = "STARTING"
    elif not finger:
        status = "NO_FINGER"
    elif raw_status in ("WARMUP", "BUFFERING") or not warmup_complete:
        status = "WARMUP"
    elif sqi < HR_SQI_MIN:
        status = "SIGNAL_WEAK"  # If HR exists, it is the LAST verified HR.
    elif hr_reliable:
        status = "HR_CONFIRMED"
    else:
        status = "MEASURING"  # Waiting for 3 V8-accepted HR windows.

    return HealthOutput(bpm=bpm, spo2=spo2, hr_reliable=hr_reliable,
                        health_status=status, finger=finger, warmup=warmup,
                        sqi=sqi, hr_age=hr_age)
