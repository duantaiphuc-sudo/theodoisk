#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
ppg_processor.py
================

PPG signal-processing module extracted from the working
MAX30102 V2 prototype.

IMPORTANT:
    This file does NOT access I2C and does NOT talk to Firebase.
    It receives raw RED / IR samples from max30102.py.

Pipeline kept from the V2 prototype:

    RED / IR
       |
       v
    Finger detection
       |
       v
    10 s warm-up
       |
       v
    0.5 - 4 Hz band-pass
       |
       +--> peak detection
       |       |
       |       +--> IBI rejection
       |
       +--> autocorrelation
       |
       +--> SQI
       |
       v
    HR candidate cross-check
       |
       v
    Stable BPM (median + EMA)

    RAW RED / IR
       |
       v
    SpO2 AC/DC calculation
       |
       v
    Stable SpO2 (median + EMA)

The constants and processing logic are intentionally kept aligned
with the uploaded MAX30102 V2 prototype.
"""

import math
import os
import time
from collections import deque

import numpy as np


# ============================================================
# CONFIG - KEEP ALIGNED WITH MAX30102 V2
# ============================================================

I2C_BUS = 1
I2C_ADDRESS = 0x57

# MAX30102 hardware:
# 100 Hz sensor rate + FIFO average 4 ~= 25 effective samples/s
# Optional *measured FIFO output* rate for controlled comparisons.
# Do not use the Python read-loop rate, which may omit samples.
# Default unchanged from V7, not an automatic calibration.
FS = float(os.environ.get("OFFICE_PPG_FS", "25.0"))
if not 20.0 <= FS <= 35.0:
    raise ValueError("OFFICE_PPG_FS must be between 20 and 35 Hz")

WARMUP_SECONDS = 10.0
BUFFER_SIZE = 250
MIN_BUFFER = BUFFER_SIZE
FINGER_DETECT_SAMPLES = 10

FINGER_THRESHOLD = 50000

HR_MIN = 40.0
HR_MAX = 180.0

MIN_PEAK_DISTANCE = int(FS * 0.33)
MAX_PEAK_DISTANCE = int(FS * 1.50)

HP_CUTOFF = 0.5
LP_CUTOFF = 4.0

MIN_ACF = 0.25
MAX_IBI_CV = 0.20

# V7 used a SECOND 7-publish median + EMA 0.20 on top of
# a median of multiple vetted 2-second HR estimates per 10-second cycle.
# That effectively holds a stale value for 30-60+ seconds.
EMA_ALPHA = 0.55
STABLE_HISTORY = 3  # retained only for compatibility/diagnostics; not re-medianed.

DISPLAY_INTERVAL = 1.0

# Conservative, opt-in signal-quality tuning based on the ORIGINAL processor.
# Do not treat as medical calibration. Keep acquisition FS=25 Hz only if
# actual FIFO data stream provides 25 samples/s without drops.
ANALYSIS_INTERVAL_SECONDS = 2.0
RESULT_REFRESH_SECONDS = 10.0
RESULT_STALE_SECONDS = 15.0
MIN_INDEPENDENT_ESTIMATES = 3  # 3 lần phân tích; cửa sổ chồng lấn, không độc lập hoàn toàn
HR_MIN_SQI = 0.52  # Thử nghiệm; còn yêu cầu peak/ACF/IBI đồng thuận
HR_MAX_PEAK_ACF_DIFFERENCE = 8.0
HR_MAX_IBI_CV = 0.18

SPO2_MIN = 70.0
SPO2_MAX = 100.0
SPO2_HISTORY = 5
SPO2_EMA_ALPHA = 0.15


# ============================================================
# BIQUAD FILTER
# ============================================================

class Biquad:

    def __init__(
        self,
        b0,
        b1,
        b2,
        a1,
        a2
    ):

        self.b0 = b0
        self.b1 = b1
        self.b2 = b2

        self.a1 = a1
        self.a2 = a2

        self.x1 = 0.0
        self.x2 = 0.0

        self.y1 = 0.0
        self.y2 = 0.0

    def reset(self):

        self.x1 = 0.0
        self.x2 = 0.0

        self.y1 = 0.0
        self.y2 = 0.0

    def process(self, x):

        y = (
            self.b0 * x
            + self.b1 * self.x1
            + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2
        )

        self.x2 = self.x1
        self.x1 = x

        self.y2 = self.y1
        self.y1 = y

        return y


def make_lowpass(
    cutoff,
    fs,
    q=1.0 / math.sqrt(2.0)
):

    w0 = 2.0 * math.pi * cutoff / fs

    alpha = (
        math.sin(w0)
        /
        (2.0 * q)
    )

    c = math.cos(w0)

    b0 = (1.0 - c) / 2.0
    b1 = 1.0 - c
    b2 = (1.0 - c) / 2.0

    a0 = 1.0 + alpha
    a1 = -2.0 * c
    a2 = 1.0 - alpha

    return Biquad(
        b0 / a0,
        b1 / a0,
        b2 / a0,
        a1 / a0,
        a2 / a0
    )


def make_highpass(
    cutoff,
    fs,
    q=1.0 / math.sqrt(2.0)
):

    w0 = 2.0 * math.pi * cutoff / fs

    alpha = (
        math.sin(w0)
        /
        (2.0 * q)
    )

    c = math.cos(w0)

    b0 = (1.0 + c) / 2.0
    b1 = -(1.0 + c)
    b2 = (1.0 + c) / 2.0

    a0 = 1.0 + alpha
    a1 = -2.0 * c
    a2 = 1.0 - alpha

    return Biquad(
        b0 / a0,
        b1 / a0,
        b2 / a0,
        a1 / a0,
        a2 / a0
    )


class BandPass:

    def __init__(self):

        self.high = make_highpass(
            HP_CUTOFF,
            FS
        )

        self.low = make_lowpass(
            LP_CUTOFF,
            FS
        )

    def reset(self):

        self.high.reset()
        self.low.reset()

    def process(self, x):

        return self.low.process(
            self.high.process(x)
        )


# ============================================================
# HR SIGNAL PROCESSING
# ============================================================

def detect_peaks(signal):

    x = np.asarray(
        signal,
        dtype=np.float64
    )

    n = len(x)

    if n < MIN_BUFFER:
        return []

    median = float(
        np.median(x)
    )

    mad = float(
        np.median(
            np.abs(x - median)
        )
    )

    robust_sigma = (
        1.4826 * mad
    )

    std = float(
        np.std(x)
    )

    noise_scale = max(
        robust_sigma,
        std * 0.35,
        1e-9
    )

    threshold = (
        median
        +
        0.45 * noise_scale
    )

    candidates = []

    for i in range(1, n - 1):

        if x[i] <= x[i - 1]:
            continue

        if x[i] < x[i + 1]:
            continue

        if x[i] < threshold:
            continue

        candidates.append(i)

    if not candidates:
        return []

    peaks = []

    for idx in candidates:

        if not peaks:
            peaks.append(idx)
            continue

        distance = (
            idx
            -
            peaks[-1]
        )

        if distance >= MIN_PEAK_DISTANCE:

            peaks.append(idx)

        else:

            if x[idx] > x[peaks[-1]]:
                peaks[-1] = idx

    filtered = []

    for idx in peaks:

        if not filtered:
            filtered.append(idx)
            continue

        distance = (
            idx
            -
            filtered[-1]
        )

        if distance <= MAX_PEAK_DISTANCE:
            filtered.append(idx)
        else:
            filtered.append(idx)

    return filtered


def get_valid_ibi(peaks):

    if len(peaks) < 3:
        return np.array([])

    intervals = np.diff(
        peaks
    ).astype(
        np.float64
    )

    intervals_sec = (
        intervals
        /
        FS
    )

    valid = intervals_sec[
        (
            intervals_sec
            >=
            60.0 / HR_MAX
        )
        &
        (
            intervals_sec
            <=
            60.0 / HR_MIN
        )
    ]

    if len(valid) < 2:
        return np.array([])

    med = float(
        np.median(valid)
    )

    mad = float(
        np.median(
            np.abs(valid - med)
        )
    )

    if mad > 1e-6:

        robust_z = (
            np.abs(valid - med)
            /
            (
                1.4826 * mad
            )
        )

        valid = valid[
            robust_z < 3.5
        ]

    if len(valid) >= 3:

        med = float(
            np.median(valid)
        )

        valid = valid[
            (
                np.abs(valid - med)
                <=
                max(
                    0.20 * med,
                    0.10
                )
            )
        ]

    return valid


def peak_based_hr(peaks):

    ibi = get_valid_ibi(
        peaks
    )

    if len(ibi) < 2:
        return None, None, 0.0

    median_ibi = float(
        np.median(ibi)
    )

    if median_ibi <= 0:
        return None, None, 0.0

    bpm = (
        60.0
        /
        median_ibi
    )

    cv = float(
        np.std(ibi)
        /
        max(
            np.mean(ibi),
            1e-9
        )
    )

    return bpm, ibi, cv


def autocorrelation_hr(signal):

    x = np.asarray(
        signal,
        dtype=np.float64
    )

    if len(x) < MIN_BUFFER:
        return None, 0.0

    x = x - np.mean(x)

    energy = float(
        np.dot(x, x)
    )

    if energy <= 1e-9:
        return None, 0.0

    min_lag = int(
        FS * 60.0 / HR_MAX
    )

    max_lag = int(
        FS * 60.0 / HR_MIN
    )

    best_lag = None
    best_corr = -1.0

    for lag in range(
        min_lag,
        max_lag + 1
    ):

        a = x[:-lag]
        b = x[lag:]

        denom = math.sqrt(
            max(
                np.dot(a, a)
                *
                np.dot(b, b),
                1e-12
            )
        )

        corr = float(
            np.dot(a, b)
            /
            denom
        )

        if corr > best_corr:
            best_corr = corr
            best_lag = lag

    if best_lag is None:
        return None, 0.0

    bpm = (
        60.0
        *
        FS
        /
        best_lag
    )

    return bpm, best_corr



def resolve_half_rate_acf(signal, peak_bpm, ibi_cv, acf_bpm, acf_corr):
    """Xử lý alias ACF ở *một nửa* nhịp peak, không ép HR về một số cố định.

    ACF có thể chọn 2 chu kỳ thay vì 1; chỉ tin lựa chọn lại khi:
    - Peak-IBI tương đối ổn định;
    - nhịp ACF gần một nửa peak;
    - correlation tại chu kỳ đơn thực sự có tín hiệu đủ mạnh.
    """
    if (peak_bpm is None or acf_bpm is None or ibi_cv is None
            or not (HR_MIN <= peak_bpm <= HR_MAX)
            or ibi_cv > 0.12 or acf_corr < 0.35):
        return acf_bpm, acf_corr, "DIRECT"

    if abs(2.0 * acf_bpm - peak_bpm) > max(5.0, 0.07 * peak_bpm):
        return acf_bpm, acf_corr, "DIRECT"

    x = np.asarray(signal, dtype=np.float64)
    x = x - np.mean(x)
    expected_lag = int(round(60.0 * FS / peak_bpm))
    candidate = []
    for lag in (expected_lag - 1, expected_lag, expected_lag + 1):
        if lag < 2 or lag >= len(x):
            continue
        a, b = x[:-lag], x[lag:]
        denom = math.sqrt(max(float(np.dot(a, a)*np.dot(b, b)), 1e-12))
        corr = float(np.dot(a,b) / denom)
        candidate.append((corr, lag))

    if not candidate:
        return acf_bpm, acf_corr, "DIRECT"
    corr, lag = max(candidate)
    if corr < 0.30 or corr < 0.60 * acf_corr:
        return acf_bpm, acf_corr, "WEAK_FIRST_PERIOD"

    corrected_hr = 60.0 * FS / lag
    if abs(corrected_hr - peak_bpm) > HR_MAX_PEAK_ACF_DIFFERENCE:
        return acf_bpm, acf_corr, "DIRECT"
    return corrected_hr, corr, "HALF_RATE_RESOLVED"

def calculate_sqi(
    acf_corr,
    ibi_cv,
    signal
):

    x = np.asarray(
        signal,
        dtype=np.float64
    )

    if len(x) == 0:
        return 0.0

    periodicity = np.clip(
        (
            acf_corr - 0.20
        )
        /
        0.50,
        0.0,
        1.0
    )

    if ibi_cv is None:
        ibi_score = 0.0
    else:
        ibi_score = np.clip(
            1.0
            -
            (
                ibi_cv
                /
                MAX_IBI_CV
            ),
            0.0,
            1.0
        )

    std = float(
        np.std(x)
    )

    if std < 1e-6:
        amplitude_score = 0.0
    else:
        amplitude_score = np.clip(
            std / 100.0,
            0.0,
            1.0
        )

    sqi = (
        0.55 * periodicity
        +
        0.35 * ibi_score
        +
        0.10 * amplitude_score
    )

    return float(
        np.clip(
            sqi,
            0.0,
            1.0
        )
    )


# ============================================================
# SpO2 - SAME APPROACH AS V2 / hrcalc STYLE
# ============================================================

def _spo2_find_peaks(
    x,
    min_height,
    min_dist,
    max_num
):

    size = len(x)

    locations = []

    i = 0

    while i < size - 1:

        if (
            x[i] > min_height
            and
            x[i] > x[i - 1]
        ):

            width = 1

            while (
                i + width < size - 1
                and
                x[i] == x[i + width]
            ):
                width += 1

            if (
                x[i] > x[i + width]
                and
                len(locations) < max_num
            ):

                locations.append(i)

                i += width + 1

            else:

                i += width

        else:

            i += 1

    if len(locations) <= 1:
        return locations

    ordered = sorted(
        locations,
        key=lambda idx: x[idx],
        reverse=True
    )

    selected = []

    for idx in ordered:

        if all(
            abs(idx - old) >= min_dist
            for old in selected
        ):

            selected.append(idx)

        if len(selected) >= max_num:
            break

    return sorted(selected)


def calculate_spo2_doug(
    ir_data,
    red_data
):

    if (
        len(ir_data) < 100
        or
        len(red_data) < 100
    ):
        return None, False

    ir = np.asarray(
        list(ir_data)[-100:],
        dtype=np.int64
    )

    red = np.asarray(
        list(red_data)[-100:],
        dtype=np.int64
    )

    ir_mean = int(
        np.mean(ir)
    )

    x = -1 * (
        ir - ir_mean
    )

    for i in range(
        len(x) - 4
    ):

        x[i] = int(
            np.sum(
                x[i:i + 4]
            )
            /
            4
        )

    n_th = int(
        np.mean(x)
    )

    n_th = max(
        30,
        min(
            60,
            n_th
        )
    )

    valleys = _spo2_find_peaks(
        x,
        n_th,
        4,
        15
    )

    if len(valleys) < 2:
        return None, False

    ratios = []

    for k in range(
        len(valleys) - 1
    ):

        start = valleys[k]
        end = valleys[k + 1]

        if end - start <= 3:
            continue

        red_segment = red[start:end]
        ir_segment = ir[start:end]

        if (
            len(red_segment) == 0
            or
            len(ir_segment) == 0
        ):
            continue

        red_dc_max_index_local = int(
            np.argmax(red_segment)
        )

        ir_dc_max_index_local = int(
            np.argmax(ir_segment)
        )

        red_dc_max_index = (
            start
            +
            red_dc_max_index_local
        )

        ir_dc_max_index = (
            start
            +
            ir_dc_max_index_local
        )

        red_dc_max = int(
            red[
                red_dc_max_index
            ]
        )

        ir_dc_max = int(
            ir[
                ir_dc_max_index
            ]
        )

        red_ac = int(
            (
                red[end]
                -
                red[start]
            )
            *
            (
                red_dc_max_index
                -
                start
            )
        )

        red_ac = (
            int(red[start])
            +
            int(
                red_ac
                /
                (
                    end - start
                )
            )
        )

        red_ac = (
            red[
                red_dc_max_index
            ]
            -
            red_ac
        )

        ir_ac = int(
            (
                ir[end]
                -
                ir[start]
            )
            *
            (
                ir_dc_max_index
                -
                start
            )
        )

        ir_ac = (
            int(ir[start])
            +
            int(
                ir_ac
                /
                (
                    end - start
                )
            )
        )

        ir_ac = (
            ir[
                ir_dc_max_index
            ]
            -
            ir_ac
        )

        numerator = (
            red_ac
            *
            ir_dc_max
        )

        denominator = (
            ir_ac
            *
            red_dc_max
        )

        if (
            denominator > 0
            and
            numerator != 0
            and
            len(ratios) < 5
        ):

            # Python integers do not overflow: applying a 32-bit mask
            # here destroys the physical AC/DC ratio (silent SpO2 error).
            if numerator <= 0:
                continue
            ratio_value = 100.0 * numerator / denominator

            ratios.append(
                ratio_value
            )

    if not ratios:
        return None, False

    ratios.sort()

    middle = len(ratios) // 2

    if middle > 1:

        ratio_average = int(
            (
                ratios[middle - 1]
                +
                ratios[middle]
            )
            /
            2
        )

    else:

        ratio_average = int(
            ratios[middle]
        )

    if (
        ratio_average > 2
        and
        ratio_average < 184
    ):

        spo2 = (
            -45.060
            *
            (
                ratio_average ** 2
            )
            /
            10000.0
            +
            30.054
            *
            ratio_average
            /
            100.0
            +
            94.845
        )

        if (
            SPO2_MIN
            <=
            spo2
            <=
            SPO2_MAX
        ):

            return float(spo2), True

    return None, False


# ============================================================
# STABLE SpO2
# ============================================================

class StableSpO2:

    def __init__(self):

        self.values = deque(
            maxlen=SPO2_HISTORY
        )

        self.value = None

    def reset(self):

        self.values.clear()
        self.value = None

    def update(self, spo2):

        if spo2 is None:
            return self.value

        spo2 = float(spo2)

        if (
            spo2 < SPO2_MIN
            or
            spo2 > SPO2_MAX
        ):
            return self.value

        self.values.append(
            spo2
        )

        median = float(
            np.median(
                list(self.values)
            )
        )

        if self.value is None:

            self.value = median

        else:

            self.value = (
                SPO2_EMA_ALPHA
                *
                median
                +
                (
                    1.0
                    -
                    SPO2_EMA_ALPHA
                )
                *
                self.value
            )

        return self.value


# ============================================================
# STABLE BPM
# ============================================================

class StableBPM:

    def __init__(self):

        self.values = deque(
            maxlen=STABLE_HISTORY
        )

        self.value = None

    def reset(self):

        self.values.clear()
        self.value = None

    def update(self, bpm):

        if bpm is None:
            return self.value

        bpm = float(bpm)

        if (
            bpm < HR_MIN
            or
            bpm > HR_MAX
        ):
            return self.value

        self.values.append(
            bpm
        )

        # The PPGProcessor has ALREADY taken the median of 3+ verified
        # candidate windows before calling this method. Re-medianing the
        # last 7 *published* results made V7 unresponsive to genuine change.
        # One EMA stage avoids a hard jump without indefinite hold.
        if self.value is None:
            self.value = bpm
        else:
            self.value = (
                EMA_ALPHA * bpm + (1.0 - EMA_ALPHA) * self.value
            )

        return self.value


# ============================================================
# PPG PROCESSOR
# ============================================================

class PPGProcessor:

    def __init__(self):

        self.ir_buffer = deque(
            maxlen=BUFFER_SIZE
        )

        self.red_buffer = deque(
            maxlen=BUFFER_SIZE
        )

        self.filtered_buffer = deque(
            maxlen=BUFFER_SIZE
        )

        self.finger_window = deque(
            maxlen=FINGER_DETECT_SAMPLES
        )

        self.bandpass = BandPass()

        self.stable_bpm = StableBPM()
        self.stable_spo2 = StableSpO2()

        self.finger_active = False
        self.finger_start_time = None
        self.warmup_complete = False

        self.latest_bpm = None
        self.latest_spo2 = None
        self.latest_raw_spo2 = None

        self.latest_sqi = 0.0
        self.latest_acf = 0.0
        self.latest_cv = None
        self.latest_peaks = 0

        self.last_candidate_bpm = None
        self.last_peak_bpm = None
        self.last_acf_bpm = None
        self.last_raw_acf_bpm = None
        self.acf_mode = "DIRECT"
        self.hr_reject_reason = "NOT_READY"
        self.last_analyze_at = None
        self.last_publish_at = None  # cũ: giữ vì API tương thích
        self.last_hr_publish_at = None
        self.last_spo2_publish_at = None
        self.last_valid_hr_at = None
        self.last_valid_spo2_at = None
        self.hr_candidates = deque(maxlen=12)
        self.spo2_candidates = deque(maxlen=12)
        self.accepted_hr_windows = 0
        self.accepted_spo2_windows = 0
        self.last_hr_window_median = None

    # --------------------------------------------------------
    # RESET PROCESSING STATE
    # --------------------------------------------------------

    def reset_results(self):

        self.latest_bpm = None
        self.latest_spo2 = None
        self.latest_raw_spo2 = None

        self.latest_sqi = 0.0
        self.latest_acf = 0.0
        self.latest_cv = None
        self.latest_peaks = 0

        self.last_candidate_bpm = None
        self.last_peak_bpm = None
        self.last_acf_bpm = None
        self.last_raw_acf_bpm = None
        self.acf_mode = "DIRECT"
        self.hr_reject_reason = "NOT_READY"
        self.last_analyze_at = None
        self.last_publish_at = None  # cũ: giữ vì API tương thích
        self.last_hr_publish_at = None
        self.last_spo2_publish_at = None
        self.last_valid_hr_at = None
        self.last_valid_spo2_at = None
        self.hr_candidates.clear()
        self.spo2_candidates.clear()
        self.accepted_hr_windows = 0
        self.accepted_spo2_windows = 0
        self.last_hr_window_median = None

    def reset_processing_buffers(self):

        self.ir_buffer.clear()
        self.red_buffer.clear()
        self.filtered_buffer.clear()

        self.bandpass.reset()

        self.stable_bpm.reset()
        self.stable_spo2.reset()

        self.reset_results()

    # --------------------------------------------------------
    # FINGER STATE
    # --------------------------------------------------------

    def _detect_finger(self):

        if len(self.finger_window) < FINGER_DETECT_SAMPLES:
            return False

        recent_ir = float(
            np.mean(
                self.finger_window
            )
        )

        return (
            recent_ir
            >=
            FINGER_THRESHOLD
        )

    # --------------------------------------------------------
    # ANALYZE CURRENT WINDOW
    # --------------------------------------------------------

    def _analyze(self):
        # Every 2s gives new evidence; running the same overlapping
        # 250-sample window on every incoming sample falsely boosts
        # the "number" of confirmations used by median/EMA.
        now = time.monotonic()
        signal = np.asarray(self.filtered_buffer, dtype=np.float64)
        peaks = detect_peaks(signal)
        peak_bpm, ibi, ibi_cv = peak_based_hr(peaks)
        raw_acf_bpm, raw_acf_corr = autocorrelation_hr(signal)
        # SQI chẩn đoán từ peak tương quan mạnh nhất như phiên bản cũ.
        sqi = calculate_sqi(raw_acf_corr, ibi_cv, signal)
        acf_bpm, acf_corr, acf_mode = resolve_half_rate_acf(
            signal, peak_bpm, ibi_cv, raw_acf_bpm, raw_acf_corr
        )

        self.last_peak_bpm = peak_bpm
        self.last_raw_acf_bpm = raw_acf_bpm
        self.acf_mode = acf_mode
        self.last_acf_bpm = acf_bpm
        self.latest_sqi = sqi
        self.latest_acf = acf_corr
        self.latest_cv = ibi_cv
        self.latest_peaks = len(peaks)
        self.last_candidate_bpm = None

        # Strictly accept HR only when both independent estimators agree.
        # ACF-only at lag 14 is exactly 1500/14=107.1 BPM and can
        # falsely persist while actual HR is around 90 BPM.
        if peak_bpm is None or acf_bpm is None:
            reason = "MISSING_ESTIMATOR"
        elif ibi_cv is None or ibi_cv > HR_MAX_IBI_CV:
            reason = "UNSTABLE_IBI"
        elif acf_mode == "WEAK_FIRST_PERIOD":
            reason = "WEAK_FIRST_PERIOD"
        elif abs(peak_bpm - acf_bpm) > HR_MAX_PEAK_ACF_DIFFERENCE:
            reason = "PEAK_ACF_DISAGREE"
        elif acf_corr < 0.30:
            reason = "LOW_ACF"
        elif sqi < HR_MIN_SQI:
            reason = "LOW_SQI"
        else:
            reason = "ACCEPTED"
            self.last_candidate_bpm = float(0.7 * peak_bpm + 0.3 * acf_bpm)
            self.hr_candidates.append((now, self.last_candidate_bpm))
            self.accepted_hr_windows += 1

        self.hr_reject_reason = reason
        # Keep SpO2 out of the HR gate but demand a stable IR trace.
        raw_spo2, valid_spo2 = calculate_spo2_doug(self.ir_buffer, self.red_buffer)
        if valid_spo2 and sqi >= 0.60:
            self.latest_raw_spo2 = float(raw_spo2)
            self.spo2_candidates.append((now, float(raw_spo2)))
            self.accepted_spo2_windows += 1
        else:
            self.latest_raw_spo2 = None

        # Remove old, non-independent candidate windows.
        horizon = RESULT_REFRESH_SECONDS + 4.0
        while self.hr_candidates and now - self.hr_candidates[0][0] > horizon:
            self.hr_candidates.popleft()
        while self.spo2_candidates and now - self.spo2_candidates[0][0] > horizon:
            self.spo2_candidates.popleft()

        # HR / SpO2 công bố ĐỘC LẬP; tránh SpO2 xóa HR chưa đủ 3 xác nhận.
        if len(self.hr_candidates) >= MIN_INDEPENDENT_ESTIMATES:
            due_hr = (self.last_hr_publish_at is None or
                      now - self.last_hr_publish_at >= RESULT_REFRESH_SECONDS)
            if due_hr:
                median_hr = float(np.median([v for _, v in self.hr_candidates]))
                self.last_hr_window_median = median_hr
                self.latest_bpm = self.stable_bpm.update(median_hr)
                self.last_valid_hr_at = now
                self.last_hr_publish_at = now
                self.last_publish_at = now  # API cũ
                self.hr_candidates.clear()

        if len(self.spo2_candidates) >= MIN_INDEPENDENT_ESTIMATES:
            due_spo2 = (self.last_spo2_publish_at is None or
                        now - self.last_spo2_publish_at >= RESULT_REFRESH_SECONDS)
            if due_spo2:
                median_spo2 = float(np.median([v for _, v in self.spo2_candidates]))
                self.latest_spo2 = self.stable_spo2.update(median_spo2)
                self.last_valid_spo2_at = now
                self.last_spo2_publish_at = now
                self.last_publish_at = now  # API cũ
                self.spo2_candidates.clear()

    def _fresh_or_none(self, value, timestamp):
        if timestamp is None or time.monotonic() - timestamp > RESULT_STALE_SECONDS:
            return None
        return value

    # --------------------------------------------------------
    # PROCESS ONE SAMPLE
    # --------------------------------------------------------

    def update(
        self,
        red,
        ir
    ):

        red = float(red)
        ir = float(ir)

        # Keep finger presence history independent from
        # the fresh 10-second processing window.
        self.finger_window.append(
            ir
        )

        finger_now = self._detect_finger()

        # Finger just placed.
        if (
            finger_now
            and
            not self.finger_active
        ):

            self.finger_active = True
            self.finger_start_time = time.monotonic()
            self.warmup_complete = False

            # Start a completely fresh processing window.
            self.reset_processing_buffers()

        # Finger removed.
        if (
            not finger_now
            and
            self.finger_active
        ):

            self.finger_active = False
            self.finger_start_time = None
            self.warmup_complete = False

            self.reset_processing_buffers()

            # Keep finger_window as the original V2 logic does
            # after removal? The V2 explicitly clears it.
            self.finger_window.clear()

            return self.get_result()

        # No finger.
        if not self.finger_active:

            return self.get_result()

        # Add sample to the active fresh window.
        self.ir_buffer.append(ir)
        self.red_buffer.append(red)

        filtered = self.bandpass.process(ir)

        self.filtered_buffer.append(
            filtered
        )

        # 10-second warm-up.
        elapsed = (
            time.monotonic()
            -
            self.finger_start_time
        )

        if elapsed < WARMUP_SECONDS:

            return self.get_result()

        # Require the complete 10-second buffer.
        if len(self.ir_buffer) < MIN_BUFFER:

            return self.get_result()

        if not self.warmup_complete:

            self.warmup_complete = True

        # Analyze at most every 2s, rather than 25 times/sec on
        # massively overlapping windows; preserves CPU on RPi 4.
        now = time.monotonic()
        if (self.last_analyze_at is None or
                now - self.last_analyze_at >= ANALYSIS_INTERVAL_SECONDS):
            self.last_analyze_at = now
            self._analyze()

        return self.get_result()

    # --------------------------------------------------------
    # PROCESS BATCH
    # --------------------------------------------------------

    def update_batch(
        self,
        red_samples,
        ir_samples
    ):

        if len(red_samples) != len(ir_samples):
            raise ValueError(
                "RED and IR sample counts must match."
            )

        result = self.get_result()

        for red, ir in zip(
            red_samples,
            ir_samples
        ):

            result = self.update(
                red,
                ir
            )

        return result

    # --------------------------------------------------------
    # RESULT
    # --------------------------------------------------------

    def get_result(self):

        if not self.finger_active:

            status = "NO_FINGER"

        elif not self.warmup_complete:

            if self.finger_start_time is None:

                remaining = WARMUP_SECONDS

            else:

                elapsed = (
                    time.monotonic()
                    -
                    self.finger_start_time
                )

                remaining = max(
                    0.0,
                    WARMUP_SECONDS - elapsed
                )

            status = "WARMUP"

        elif len(self.ir_buffer) < MIN_BUFFER:

            status = "BUFFERING"

        else:

            status = "READY"

        return {
            "status": status,

            "finger_detected": bool(
                self.finger_active
            ),

            "warmup_complete": bool(
                self.warmup_complete
            ),

            "warmup_remaining": (
                self.get_warmup_remaining()
            ),

            "bpm": self._fresh_or_none(self.latest_bpm, self.last_valid_hr_at),

            "spo2": self._fresh_or_none(self.latest_spo2, self.last_valid_spo2_at),

            "spo2_raw": self.latest_raw_spo2,

            "sqi": float(
                self.latest_sqi
            ),

            "acf": float(
                self.latest_acf
            ),

            "ibi_cv": self.latest_cv,

            "peaks": int(
                self.latest_peaks
            ),

            "candidate_bpm": self.last_candidate_bpm,
            "hr_window_median": self.last_hr_window_median,
            "hr_age_seconds": (None if self.last_valid_hr_at is None
                               else max(0.0, time.monotonic() - self.last_valid_hr_at)),
            "effective_fs": FS,
            "peak_bpm": self.last_peak_bpm,
            "acf_bpm": self.last_acf_bpm,
            "acf_raw_bpm": self.last_raw_acf_bpm,
            "acf_mode": self.acf_mode,
            "hr_reject_reason": self.hr_reject_reason,
            "accepted_hr_windows": self.accepted_hr_windows,
            "accepted_spo2_windows": self.accepted_spo2_windows,
            "buffer_samples": len(
                self.ir_buffer
            ),
        }

    def get_warmup_remaining(self):

        if (
            not self.finger_active
            or
            self.finger_start_time is None
        ):

            return 0.0

        elapsed = (
            time.monotonic()
            -
            self.finger_start_time
        )

        return max(
            0.0,
            WARMUP_SECONDS - elapsed
        )

    def reset(self):

        self.finger_active = False
        self.finger_start_time = None
        self.warmup_complete = False

        self.reset_processing_buffers()

        self.finger_window.clear()


# ============================================================
# SIMPLE SELF TEST
# ============================================================

def self_test():

    print("=" * 60)
    print("PPG PROCESSOR TEST")
    print("=" * 60)

    processor = PPGProcessor()

    print(
        f"FS              : {FS:.0f} Hz"
    )

    print(
        f"Warm-up         : {WARMUP_SECONDS:.1f} s"
    )

    print(
        f"Buffer          : {BUFFER_SIZE} samples"
    )

    print(
        f"Band-pass       : {HP_CUTOFF:.1f} - {LP_CUTOFF:.1f} Hz"
    )

    print(
        f"Finger threshold: {FINGER_THRESHOLD}"
    )

    print()
    print("PPGProcessor initialization: OK")
    print("=" * 60)


if __name__ == "__main__":
    self_test()
