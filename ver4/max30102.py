#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
MAX30102 V2 - PPG Heart Rate Test
=================================

Má»¥c tiÃªu:
    Kiá»ƒm tra cháº¥t lÆ°á»£ng tÃ­n hiá»‡u MAX30102 trÃªn Raspberry Pi
    vÃ  thá»­ má»™t pipeline HR gáº§n vá»›i wearable hÆ¡n:

    MAX30102
        â†“
    RED / IR
        â†“
    Effective 25 Hz
        â†“
    0.5â€“4 Hz band-pass
        â†“
    Peak detection
        â†“
    IBI outlier rejection
        â†“
    Autocorrelation cross-check
        â†“
    Signal Quality Index (SQI)
        â†“
    Median + EMA
        â†“
    Stable BPM

KhÃ´ng dÃ¹ng Firebase / Camera / AI.

LÆ°u Ã½:
    - ÄÃ¢y lÃ  prototype xá»­ lÃ½ tÃ­n hiá»‡u, khÃ´ng pháº£i thiáº¿t bá»‹ y táº¿.
    - Sau khi phÃ¡t hiá»‡n ngÃ³n tay, há»‡ thá»‘ng chá» Ä‘á»§ 10 giÃ¢y rá»“i má»›i
      cháº¥p nháº­n káº¿t quáº£ HR/SpO2.
    - SpO2 dÃ¹ng RED/IR raw theo hÆ°á»›ng AC/DC cá»§a hrcalc.py.
    - MAX30102 trÃªn ngÃ³n tay thÆ°á»ng dá»… Ä‘o hÆ¡n cá»• tay.
"""

import math
import time
from collections import deque

import numpy as np
from smbus2 import SMBus


# ============================================================
# CONFIG
# ============================================================

I2C_BUS = 1
I2C_ADDRESS = 0x57

# MAX30102:
# Hardware sample rate = 100 Hz
# FIFO sample averaging = 4
# => effective output â‰ˆ 25 samples/s
FS = 25.0

# After finger placement, collect a fresh 10-second window before
# any HR/SpO2 result is accepted.
WARMUP_SECONDS = 10.0
BUFFER_SIZE = 250       # 10 seconds at 25 Hz
MIN_BUFFER = BUFFER_SIZE
FINGER_DETECT_SAMPLES = 10  # ~0.4 s at 25 Hz

# Finger detection
FINGER_THRESHOLD = 50000

# Physiological range used only for signal processing
HR_MIN = 40.0
HR_MAX = 180.0

MIN_PEAK_DISTANCE = int(FS * 0.33)   # max ~181 BPM
MAX_PEAK_DISTANCE = int(FS * 1.50)   # min ~40 BPM

# Filter
HP_CUTOFF = 0.5
LP_CUTOFF = 4.0

# Quality thresholds
MIN_ACF = 0.25
MAX_IBI_CV = 0.20

# Stable display
EMA_ALPHA = 0.20
STABLE_HISTORY = 7

DISPLAY_INTERVAL = 1.0

# SpO2 smoothing. Only valid SpO2 estimates enter this filter.
SPO2_MIN = 70.0
SPO2_MAX = 100.0
SPO2_HISTORY = 5
SPO2_EMA_ALPHA = 0.15


# ============================================================
# MAX30102 REGISTERS
# ============================================================

REG_INTR_STATUS_1 = 0x00
REG_INTR_STATUS_2 = 0x01

REG_INTR_ENABLE_1 = 0x02
REG_INTR_ENABLE_2 = 0x03

REG_FIFO_WR_PTR = 0x04
REG_OVF_COUNTER = 0x05
REG_FIFO_RD_PTR = 0x06
REG_FIFO_DATA = 0x07

REG_FIFO_CONFIG = 0x08
REG_MODE_CONFIG = 0x09
REG_SPO2_CONFIG = 0x0A

REG_LED1_PA = 0x0C
REG_LED2_PA = 0x0D
REG_PILOT_PA = 0x10

REG_PART_ID = 0xFF


# ============================================================
# MAX30102 DRIVER
# ============================================================

class MAX30102:

    def __init__(
        self,
        bus_number=I2C_BUS,
        address=I2C_ADDRESS
    ):

        self.address = address
        self.bus = SMBus(bus_number)

        self.reset()

        time.sleep(0.5)

        self.setup()

    def write_reg(self, reg, value):

        self.bus.write_byte_data(
            self.address,
            reg,
            value
        )

    def read_reg(self, reg):

        return self.bus.read_byte_data(
            self.address,
            reg
        )

    def reset(self):

        self.write_reg(
            REG_MODE_CONFIG,
            0x40
        )

        time.sleep(0.1)

    def setup(self):

        # Clear interrupts
        try:
            self.read_reg(REG_INTR_STATUS_1)
            self.read_reg(REG_INTR_STATUS_2)
        except Exception:
            pass

        # Interrupts
        self.write_reg(
            REG_INTR_ENABLE_1,
            0xC0
        )

        self.write_reg(
            REG_INTR_ENABLE_2,
            0x00
        )

        # FIFO pointers
        self.write_reg(
            REG_FIFO_WR_PTR,
            0x00
        )

        self.write_reg(
            REG_OVF_COUNTER,
            0x00
        )

        self.write_reg(
            REG_FIFO_RD_PTR,
            0x00
        )

        # FIFO:
        # sample average = 4
        # rollover = enabled
        # almost full = 17
        self.write_reg(
            REG_FIFO_CONFIG,
            0x4F
        )

        # SpO2 mode: RED + IR
        self.write_reg(
            REG_MODE_CONFIG,
            0x03
        )

        # ADC range 4096 nA
        # sample rate 100 Hz
        # pulse width 411 us
        self.write_reg(
            REG_SPO2_CONFIG,
            0x27
        )

        # LED currents
        self.write_reg(
            REG_LED1_PA,
            0x24
        )

        self.write_reg(
            REG_LED2_PA,
            0x24
        )

        self.write_reg(
            REG_PILOT_PA,
            0x7F
        )

        time.sleep(0.1)

    def get_part_id(self):

        return self.read_reg(
            REG_PART_ID
        )

    def get_data_present(self):

        read_ptr = self.read_reg(
            REG_FIFO_RD_PTR
        )

        write_ptr = self.read_reg(
            REG_FIFO_WR_PTR
        )

        if read_ptr == write_ptr:
            return 0

        n = write_ptr - read_ptr

        if n < 0:
            n += 32

        return n

    def read_fifo(self):

        # Clear interrupt status
        self.read_reg(REG_INTR_STATUS_1)
        self.read_reg(REG_INTR_STATUS_2)

        data = self.bus.read_i2c_block_data(
            self.address,
            REG_FIFO_DATA,
            6
        )

        red = (
            (data[0] << 16)
            |
            (data[1] << 8)
            |
            data[2]
        ) & 0x03FFFF

        ir = (
            (data[3] << 16)
            |
            (data[4] << 8)
            |
            data[5]
        ) & 0x03FFFF

        return red, ir

    def close(self):

        try:
            self.write_reg(
                REG_MODE_CONFIG,
                0x80
            )
        except Exception:
            pass

        try:
            self.bus.close()
        except Exception:
            pass


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
            +
            self.b1 * self.x1
            +
            self.b2 * self.x2
            -
            self.a1 * self.y1
            -
            self.a2 * self.y2
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
# SIGNAL PROCESSING
# ============================================================

def detect_peaks(signal):

    """
    TÃ¬m peak trÃªn tÃ­n hiá»‡u band-pass.

    KhÃ´ng dÃ¹ng scipy Ä‘á»ƒ giáº£m dependency trÃªn Pi.

    Peak pháº£i:
    - lÃ  local maximum
    - cÃ¡ch peak trÆ°á»›c Ã­t nháº¥t 0.33 s
    - náº±m trong biÃªn HR 40â€“180 BPM
    - vÆ°á»£t adaptive threshold
    """

    x = np.asarray(
        signal,
        dtype=np.float64
    )

    n = len(x)

    if n < MIN_BUFFER:
        return []

    # Robust center / scale
    median = float(
        np.median(x)
    )

    mad = float(
        np.median(
            np.abs(
                x - median
            )
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

    # Adaptive threshold
    threshold = median + (
        0.45 * noise_scale
    )

    candidates = []

    for i in range(
        1,
        n - 1
    ):

        if x[i] <= x[i - 1]:
            continue

        if x[i] < x[i + 1]:
            continue

        if x[i] < threshold:
            continue

        candidates.append(i)

    if not candidates:
        return []

    # Enforce minimum distance.
    # If two peaks are too close, keep the higher one.
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

    # Remove intervals that imply <40 BPM.
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

            # Large gap is allowed; it just means
            # one or more beats may have been missed.
            filtered.append(idx)

    return filtered


def get_valid_ibi(
    peaks
):

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

    # Physiological range
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

    # Robust outlier rejection using median + MAD.
    med = float(
        np.median(valid)
    )

    mad = float(
        np.median(
            np.abs(
                valid - med
            )
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

    # Second pass: reject very large deviation
    # from the median. This is deliberately conservative.
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


def peak_based_hr(
    peaks
):

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

    return (
        bpm,
        ibi,
        cv
    )


def autocorrelation_hr(
    signal
):

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

    # Periodicity score
    periodicity = np.clip(
        (
            acf_corr - 0.20
        )
        /
        0.50,
        0.0,
        1.0
    )

    # IBI consistency
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

    # Signal amplitude / noise sanity check
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

    # Weight periodicity more strongly.
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
# SpO2 - DOUG BURRELL / hrcalc STYLE
# ============================================================
#
# The original repository calculates SpO2 from the RED/IR AC/DC
# ratio using the same PPG peak/valley intervals. This function
# keeps that approach, adapted to Python 3 / NumPy.
#
# It is intentionally separate from the band-pass signal used
# for HR: SpO2 uses the RAW RED + IR values.
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

    # Same idea as hrcalc.remove_close_peaks():
    # keep the higher peak when two candidates are too close.
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

    """
    Calculate SpO2 using the Doug Burrell hrcalc approach.

    The original implementation uses a 100-sample window at
    25 samples/s. We therefore use the newest 100 samples from
    our 10-second acquisition buffer.
    """

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

    # Same preprocessing used by hrcalc.py:
    # remove IR DC and invert it so valleys become peaks.
    ir_mean = int(
        np.mean(ir)
    )

    x = -1 * (
        ir - ir_mean
    )

    # 4-point moving average.
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

        # RED AC relative to a linear baseline.
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

        # IR AC relative to a linear baseline.
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

            # Preserve the original Python implementation's
            # 32-bit overflow behavior.
            ratio_value = int(
                (
                    (
                        numerator
                        *
                        100
                    )
                    &
                    0xFFFFFFFF
                )
                /
                denominator
            )

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

    # Same valid range and polynomial as hrcalc.py.
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
# STABLE SpO2 FILTER
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
# STABLE BPM FILTER
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

        median = float(
            np.median(
                list(self.values)
            )
        )

        if self.value is None:

            self.value = median

        else:

            self.value = (
                EMA_ALPHA * median
                +
                (1.0 - EMA_ALPHA)
                * self.value
            )

        return self.value


# ============================================================
# MAIN
# ============================================================

def main():

    print()
    print("=" * 72)
    print("MAX30102 V2 - PPG QUALITY / HEART RATE TEST")
    print("=" * 72)
    print(
        f"I2C       : bus {I2C_BUS}, address 0x{I2C_ADDRESS:02X}"
    )
    print(
        f"Effective FS : {FS:.0f} Hz"
    )
    print(
        f"Buffer       : {BUFFER_SIZE} samples (~{BUFFER_SIZE / FS:.1f}s)"
    )
    print(
        f"Band-pass    : {HP_CUTOFF:.1f} - {LP_CUTOFF:.1f} Hz"
    )
    print("=" * 72)
    print()

    sensor = None

    try:

        sensor = MAX30102()

        part_id = sensor.get_part_id()

        print(
            f"PART ID = 0x{part_id:02X}"
        )

        if part_id == 0x15:

            print(
                "MAX30102 detected: OK"
            )

        else:

            print(
                "WARNING: PART ID khong phai 0x15."
            )

        print()
        print(
            "Dat mot ngon tay len MAX30102."
        )
        print(
            "Giu yen, khong an qua manh."
        )
        print(
            "Sau khi phat hien ngon tay, he thong se bo qua 10 giay dau."
        )
        print(
            "Het 10 giay moi bat dau tinh va hien thi HR + SpO2."
        )
        print()
        print(
            "Nhan Ctrl+C de dung."
        )
        print()

        ir_buffer = deque(
            maxlen=BUFFER_SIZE
        )

        red_buffer = deque(
            maxlen=BUFFER_SIZE
        )

        filtered_buffer = deque(
            maxlen=BUFFER_SIZE
        )

        finger_window = deque(
            maxlen=FINGER_DETECT_SAMPLES
        )

        bandpass = BandPass()
        stable = StableBPM()
        stable_spo2 = StableSpO2()

        last_display = 0.0

        latest_bpm = None
        latest_spo2 = None
        latest_raw_spo2 = None
        latest_sqi = 0.0
        latest_acf = 0.0
        latest_cv = None
        latest_peaks = 0

        finger_active = False
        finger_start_time = None
        warmup_complete = False

        while True:

            count = sensor.get_data_present()

            if count <= 0:

                time.sleep(0.005)
                continue

            # Read all currently available FIFO samples.
            for _ in range(count):

                red, ir = sensor.read_fifo()

                ir_buffer.append(
                    float(ir)
                )

                red_buffer.append(
                    float(red)
                )

                finger_window.append(
                    float(ir)
                )

                filtered = bandpass.process(
                    float(ir)
                )

                filtered_buffer.append(
                    filtered
                )

            # ------------------------------------------------
            # Fast finger detection
            #
            # We intentionally detect placement BEFORE waiting
            # for a full processing window.
            # ------------------------------------------------

            if len(finger_window) >= FINGER_DETECT_SAMPLES:

                recent_ir = float(
                    np.mean(
                        finger_window
                    )
                )

                finger_now = (
                    recent_ir
                    >=
                    FINGER_THRESHOLD
                )

            else:

                finger_now = False

            # ------------------------------------------------
            # Finger was just placed
            #
            # Start a completely fresh 10-second window.
            # No BPM / SpO2 result is accepted during warm-up.
            # ------------------------------------------------

            if (
                finger_now
                and
                not finger_active
            ):

                finger_active = True
                finger_start_time = time.time()
                warmup_complete = False

                ir_buffer.clear()
                red_buffer.clear()
                filtered_buffer.clear()

                bandpass.reset()
                stable.reset()
                stable_spo2.reset()

                latest_bpm = None
                latest_spo2 = None
                latest_raw_spo2 = None
                latest_sqi = 0.0
                latest_acf = 0.0
                latest_cv = None
                latest_peaks = 0

                # Keep finger_window for presence tracking.
                # The processing buffers above are the ones that must
                # start completely fresh after finger placement.

                now = time.time()

                print()
                print(
                    "Finger detected -> "
                    "starting 10-second stabilization..."
                )

            # ------------------------------------------------
            # Finger removed
            # ------------------------------------------------

            if (
                not finger_now
                and
                finger_active
            ):

                finger_active = False
                finger_start_time = None
                warmup_complete = False

                ir_buffer.clear()
                red_buffer.clear()
                filtered_buffer.clear()
                finger_window.clear()

                bandpass.reset()
                stable.reset()
                stable_spo2.reset()

                latest_bpm = None
                latest_spo2 = None
                latest_raw_spo2 = None
                latest_sqi = 0.0
                latest_acf = 0.0
                latest_cv = None
                latest_peaks = 0

                print()
                print(
                    "Finger removed -> waiting for next placement..."
                )

                continue

            if not finger_active:

                now = time.time()

                if (
                    now
                    -
                    last_display
                    >=
                    DISPLAY_INTERVAL
                ):

                    print(
                        "\r"
                        f"FINGER=NO | "
                        f"BPM=-- | "
                        f"SpO2=--"
                        " " * 30,
                        end="",
                        flush=True
                    )

                    last_display = now

                time.sleep(0.005)
                continue

            # ------------------------------------------------
            # 10-second warm-up
            # ------------------------------------------------

            elapsed = (
                time.time()
                -
                finger_start_time
            )

            if elapsed < WARMUP_SECONDS:

                remaining = max(
                    0.0,
                    WARMUP_SECONDS - elapsed
                )

                now = time.time()

                if (
                    now
                    -
                    last_display
                    >=
                    DISPLAY_INTERVAL
                ):

                    print(
                        "\r"
                        f"STABILIZING | "
                        f"wait {remaining:4.1f}s | "
                        f"IR={int(np.mean(ir_buffer)) if ir_buffer else 0:7d} | "
                        f"BPM=-- | "
                        f"SpO2=--"
                        " " * 20,
                        end="",
                        flush=True
                    )

                    last_display = now

                time.sleep(0.005)
                continue

            # Need the complete fresh 10-second window.
            if len(ir_buffer) < MIN_BUFFER:

                now = time.time()

                if (
                    now
                    -
                    last_display
                    >=
                    DISPLAY_INTERVAL
                ):

                    print(
                        "\r"
                        f"BUFFERING {len(ir_buffer):3d}/"
                        f"{MIN_BUFFER} | "
                        f"BPM=-- | "
                        f"SpO2=--"
                        " " * 20,
                        end="",
                        flush=True
                    )

                    last_display = now

                time.sleep(0.005)
                continue

            if not warmup_complete:

                warmup_complete = True

                print()
                print(
                    "10-second stabilization complete -> "
                    "starting HR + SpO2 estimation."
                )

            # ------------------------------------------------
            # Analyze the fresh 10-second signal
            # ------------------------------------------------

            signal = np.asarray(
                filtered_buffer,
                dtype=np.float64
            )

            peaks = detect_peaks(
                signal
            )

            peak_bpm, ibi, ibi_cv = (
                peak_based_hr(
                    peaks
                )
            )

            acf_bpm, acf_corr = (
                autocorrelation_hr(
                    signal
                )
            )

            sqi = calculate_sqi(
                acf_corr,
                ibi_cv,
                signal
            )

            # ------------------------------------------------
            # Cross-check peak HR vs autocorrelation HR
            # ------------------------------------------------

            candidate_bpm = None

            if (
                peak_bpm is not None
                and
                acf_bpm is not None
            ):

                difference = abs(
                    peak_bpm
                    -
                    acf_bpm
                )

                if difference <= 12.0:

                    candidate_bpm = (
                        0.65 * peak_bpm
                        +
                        0.35 * acf_bpm
                    )

                elif (
                    ibi_cv is not None
                    and
                    ibi_cv <= 0.12
                ):

                    candidate_bpm = peak_bpm

            elif peak_bpm is not None:

                if (
                    ibi_cv is not None
                    and
                    ibi_cv <= 0.10
                ):

                    candidate_bpm = peak_bpm

            elif acf_bpm is not None:

                if acf_corr >= 0.55:

                    candidate_bpm = acf_bpm

            # ------------------------------------------------
            # HR quality gate
            # ------------------------------------------------

            if (
                candidate_bpm is not None
                and
                sqi >= 0.45
            ):

                latest_bpm = stable.update(
                    candidate_bpm
                )

            else:

                latest_bpm = stable.value

            # ------------------------------------------------
            # SpO2
            #
            # Uses RAW RED + IR, not the band-pass signal.
            # Only calculate after the 10-second warm-up.
            # ------------------------------------------------

            raw_spo2, valid_spo2 = (
                calculate_spo2_doug(
                    ir_buffer,
                    red_buffer
                )
            )

            if (
                valid_spo2
                and
                sqi >= 0.45
            ):

                latest_raw_spo2 = float(
                    raw_spo2
                )

                latest_spo2 = (
                    stable_spo2.update(
                        raw_spo2
                    )
                )

            else:

                latest_spo2 = stable_spo2.value

            latest_sqi = sqi
            latest_acf = acf_corr
            latest_cv = ibi_cv
            latest_peaks = len(peaks)

            # ------------------------------------------------
            # Display
            # ------------------------------------------------

            now = time.time()

            if (
                now
                -
                last_display
                >=
                DISPLAY_INTERVAL
            ):

                bpm_text = (
                    f"{latest_bpm:.1f}"
                    if latest_bpm is not None
                    else "--"
                )

                raw_text = (
                    f"{candidate_bpm:.1f}"
                    if candidate_bpm is not None
                    else "--"
                )

                acf_text = (
                    f"{acf_bpm:.1f}"
                    if acf_bpm is not None
                    else "--"
                )

                spo2_raw_text = (
                    f"{latest_raw_spo2:.1f}%"
                    if latest_raw_spo2 is not None
                    else "--"
                )

                spo2_text = (
                    f"{latest_spo2:.1f}%"
                    if latest_spo2 is not None
                    else "--"
                )

                cv_text = (
                    f"{latest_cv:.3f}"
                    if latest_cv is not None
                    else "--"
                )

                print(
                    "\r"
                    f"READY | "
                    f"RAW={raw_text:>5} | "
                    f"BPM={bpm_text:>5} | "
                    f"ACF={acf_text:>5} | "
                    f"SpO2raw={spo2_raw_text:>6} | "
                    f"SpO2={spo2_text:>6} | "
                    f"SQI={latest_sqi:.2f} | "
                    f"CV={cv_text:>5} | "
                    f"PEAK={latest_peaks:2d}",
                    end="",
                    flush=True
                )

                last_display = now

            time.sleep(0.005)

    except KeyboardInterrupt:

        print()
        print()
        print(
            "Stopping..."
        )

    except OSError as e:

        print()
        print(
            "I2C ERROR:",
            e
        )
        print()
        print(
            "Kiem tra i2cdetect -y 1 va wiring MAX30102."
        )

    except Exception as e:

        print()
        print(
            "ERROR:",
            repr(e)
        )

    finally:

        if sensor is not None:

            sensor.close()

        print(
            "MAX30102 closed."
        )


if __name__ == "__main__":

    main()
