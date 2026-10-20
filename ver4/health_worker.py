#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
health_worker.py

MAX30102 V2
    |
    +-- get_data_present()
    +-- read_fifo()
    |
    v
RED / IR
    |
    v
PPGProcessor
    |
    +-- 10 s warm-up
    +-- BPM
    +-- SpO2
    +-- SQI
    +-- ACF
    +-- stable filtering

Khong co Camera / Firebase / Posture AI.
"""

import time
import os
import fcntl

from max30102 import MAX30102
from ppg_processor import PPGProcessor


PRINT_INTERVAL = 2.0
MAX30102_LOCK_FILE = "/tmp/office_health_max30102.lock"


def fmt(value, digits=1):
    if value is None:
        return "--"
    try:
        return f"{float(value):.{digits}f}"
    except Exception:
        return "--"


class HealthWorker:

    def __init__(self):
        self.sensor = None
        self._sensor_lock_fd = None
        self.processor = PPGProcessor()
        self.running = False
        self.last_print = 0.0
        self.total_samples = 0
        self._rate_start = time.monotonic()
        self._rate_samples = 0
        self.rate_hz = None
        self.last_red = None
        self.last_ir = None

    def start(self):

        print()
        print("=" * 60)
        print("HEALTH WORKER")
        print("=" * 60)

        print("Loading MAX30102 V2...")

        # Cooperative inter-process lock: prevents V8 main / V8 standalone
        # and other apps using this lock from opening the sensor simultaneously.
        fd = os.open(MAX30102_LOCK_FILE, os.O_CREAT | os.O_RDWR, 0o666)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            raise RuntimeError(
                "MAX30102 is already owned by another V8 process. "
                "Stop mainnew.py / health_worker.py before starting a second one."
            ) from None
        self._sensor_lock_fd = fd
        try:
            os.ftruncate(fd, 0)
            os.write(fd, f"PID={os.getpid()}\n".encode("ascii"))
            # Do not change the hardware driver or V8 signal processing.
            self.sensor = MAX30102()
        except Exception:
            self._release_sensor_lock()
            raise

        part_id = self.sensor.get_part_id()

        print(
            f"PART ID = 0x{part_id:02X}"
        )

        if part_id == 0x15:
            print("MAX30102 detected: OK")
        else:
            print(
                "WARNING: PART ID khong phai 0x15."
            )

        print("Loading PPG processor...")

        self.processor.reset()

        print("PPG processor: OK")
        print("=" * 60)

        self._rate_start = time.monotonic()
        self._rate_samples = 0
        self.rate_hz = None
        self.running = True

    def _release_sensor_lock(self):
        if self._sensor_lock_fd is not None:
            try:
                fcntl.flock(self._sensor_lock_fd, fcntl.LOCK_UN)
            finally:
                os.close(self._sensor_lock_fd)
                self._sensor_lock_fd = None

    def process_once(self):

        if self.sensor is None:
            return self._rate_result(self.processor.get_result())

        # DUNG interface cua MAX30102 V2.
        count = self.sensor.get_data_present()

        if count <= 0:
            return self._rate_result(self.processor.get_result())

        for _ in range(count):

            red, ir = self.sensor.read_fifo()
            self.last_red = int(red)
            self.last_ir = int(ir)

            self.processor.update(
                red,
                ir
            )

            self.total_samples += 1
            self._rate_samples += 1

        return self._rate_result(self.processor.get_result())

    def _rate_result(self, result):
        now = time.monotonic()
        duration = now - self._rate_start
        if duration >= 10.0:
            self.rate_hz = self._rate_samples / duration
            self._rate_start = now
            self._rate_samples = 0
        result["read_rate_hz"] = self.rate_hz
        result["samples_total"] = self.total_samples
        result["last_ir_raw"] = self.last_ir
        result["last_red_raw"] = self.last_red
        if self.rate_hz is not None:
            # Warning, not an automatic re-calibration: dropped FIFO
            # samples cannot be repaired by redefining FS.
            result["sample_rate_warning"] = (
                "RATE_CHECK" if not 21.0 <= self.rate_hz <= 29.0 else "OK"
            )
        else:
            result["sample_rate_warning"] = "MEASURING"
        return result

    def print_status(self, result):

        now = time.monotonic()

        if now - self.last_print < PRINT_INTERVAL:
            return

        self.last_print = now

        status = result.get(
            "status",
            "UNKNOWN"
        )

        finger = result.get(
            "finger_detected",
            False
        )

        remaining = result.get(
            "warmup_remaining",
            0.0
        )

        bpm = result.get("bpm")
        spo2 = result.get("spo2")
        raw_spo2 = result.get("spo2_raw")
        sqi = result.get("sqi", 0.0)
        acf = result.get("acf", 0.0)
        cv = result.get("ibi_cv")
        peaks = result.get("peaks", 0)
        buffer_samples = result.get(
            "buffer_samples",
            0
        )

        print(
            f"Status={status:<10} | "
            f"Finger={'YES' if finger else 'NO ':<3} | "
            f"Warmup={remaining:4.1f}s | "
            f"BPM={fmt(bpm):>5} | "
            f"HRPub={fmt(result.get('hr_window_median')):>5} | "
            f"Age={fmt(result.get('hr_age_seconds')):>4}s | "
            f"SpO2={fmt(spo2):>5}% | "
            f"Raw={fmt(raw_spo2):>5}% | "
            f"SQI={sqi:.2f} | "
            f"ACF={acf:.2f} | "
            f"CV={fmt(cv, 3):>5} | "
            f"Peak={peaks:2d} | "
            f"Buf={buffer_samples:3d} | "
            f"Rate={fmt(result.get('read_rate_hz')):>5}Hz | "
            f"IR={result.get('last_ir_raw')} | "
            f"Samples={result.get('samples_total', 0)} | "
            f"{result.get('sample_rate_warning', '--'):<10} | "
            f"PeakHR={fmt(result.get('peak_bpm')):>5} | "
            f"ACFHR={fmt(result.get('acf_bpm')):>5} | "
            f"RawACF={fmt(result.get('acf_raw_bpm')):>5} | "
            f"Mode={result.get('acf_mode', '--'):<19} | "
            f"HRCheck={result.get('hr_reject_reason', '--'):<19}",
            end="\n", flush=True
        )

    def run(self):

        self.start()

        print()
        print(
            "Dat ngon tay len MAX30102."
        )
        print(
            "Giu yen trong 10 giay warm-up."
        )
        print(
            "Nhan Ctrl+C de dung."
        )
        print()

        try:

            while self.running:

                result = self.process_once()

                self.print_status(
                    result
                )

                time.sleep(0.005)

        except KeyboardInterrupt:

            print("\n\nStopping...")

        finally:

            self.stop()

    def stop(self):

        self.running = False

        if self.sensor is not None:

            try:
                self.sensor.close()
            except Exception as e:
                print(
                    f"\nMAX30102 close error: {e}"
                )

            self.sensor = None

        self._release_sensor_lock()

        print()
        print(
            f"Total samples: {self.total_samples}"
        )
        print(
            "Health worker stopped."
        )


if __name__ == "__main__":

    worker = HealthWorker()

    try:
        worker.run()

    except Exception as e:

        print()
        print("=" * 60)
        print("HEALTH WORKER ERROR")
        print("=" * 60)
        print(repr(e))

        try:
            worker.stop()
        except Exception:
            pass

        raise
