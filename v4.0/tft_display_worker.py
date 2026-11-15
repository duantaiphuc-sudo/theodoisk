#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ST7789 240x240 SPI0 CE0 screen, decoupled from MAX30102 I2C.

Original wiring/protocol preserved: GPIO25 D/C, GPIO24 RST, SPI mode 3,
40 MHz, RGB565 and original ST7789 initialization commands.

The display ONLY consumes snapshots from mainnew.py; it never accesses I2C.
"""

import threading
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFont


class TftDisplayWorker:
    WIDTH = 240
    HEIGHT = 240

    def __init__(self, dc_pin=25, rst_pin=24, fps=2.0, spi_speed_hz=40000000):
        # Lazy imports allow mainnew.py to be imported on a machine without
        # Raspberry Pi GPIO, useful for offline testing and --no-tft.
        import spidev
        import RPi.GPIO as GPIO

        self.GPIO = GPIO
        self.dc = dc_pin
        self.rst = rst_pin
        self.fps = float(fps)
        if not 0.2 <= self.fps <= 10:
            raise ValueError("ST7789 FPS must be in [0.2, 10]")

        self.running = False
        self.thread = None
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        self.last_error = None
        self._closed = False
        self.spi = None
        self.state = {
            "bpm": None,
            "hr_reliable": False,
            "hr_age": None,
            "spo2": None,
            "finger": False,
            "warmup": 0.0,
            "health_status": "STANDBY",
            "posture_label": "Waiting",
            "posture_status": 2,
            "face_status": "DISABLED",
            "face_progress": "",
        }

        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(self.dc, GPIO.OUT)
        GPIO.setup(self.rst, GPIO.OUT)
        try:
            self.spi = spidev.SpiDev()
            self.spi.open(0, 0)  # SPI0 CE0; not MAX30102 I2C
            self.spi.max_speed_hz = int(spi_speed_hz)
            self.spi.mode = 0b11  # Match the tested original display driver.
            self._init_hardware()
        except Exception:
            self._cleanup_io()
            raise

        try:
            base = "/usr/share/fonts/truetype/dejavu/"
            self.f_b = ImageFont.truetype(base + "DejaVuSans-Bold.ttf", 24)
            self.f_m = ImageFont.truetype(base + "DejaVuSans-Bold.ttf", 15)
            self.f_s = ImageFont.truetype(base + "DejaVuSans.ttf", 12)
        except (OSError, IOError):
            self.f_b = self.f_m = self.f_s = ImageFont.load_default()

    def _cleanup_io(self):
        if self._closed:
            return
        self._closed = True
        if self.spi is not None:
            try:
                self.spi.close()
            except Exception:
                pass
            self.spi = None
        # Clean up ONLY pins owned by TFT. Do not disturb other GPIO devices.
        try:
            self.GPIO.cleanup([self.dc, self.rst])
        except Exception:
            pass

    def _send_cmd(self, cmd):
        self.GPIO.output(self.dc, self.GPIO.LOW)
        self.spi.writebytes([cmd])

    def _send_data(self, data):
        self.GPIO.output(self.dc, self.GPIO.HIGH)
        self.spi.writebytes(data if isinstance(data, list) else [data])

    def _init_hardware(self):
        self.GPIO.output(self.rst, self.GPIO.HIGH)
        time.sleep(0.05)
        self.GPIO.output(self.rst, self.GPIO.LOW)
        time.sleep(0.05)
        self.GPIO.output(self.rst, self.GPIO.HIGH)
        time.sleep(0.12)
        self._send_cmd(0x01)   # Software reset
        time.sleep(0.15)
        self._send_cmd(0x11)   # Sleep out
        time.sleep(0.12)
        self._send_cmd(0x36)   # Memory data access control
        self._send_data(0x70)
        self._send_cmd(0x3A)   # RGB565
        self._send_data(0x55)
        self._send_cmd(0x21)   # Display inversion on
        self._send_cmd(0x29)   # Display on
        time.sleep(0.05)

    def update(self, **kwargs):
        with self.lock:
            self.state.update(kwargs)

    def start(self):
        if self._closed:
            raise RuntimeError("TFT device has been closed")
        if self.thread is not None and self.thread.is_alive():
            return
        self.last_error = None
        self.stop_event.clear()
        self.running = True
        self.thread = threading.Thread(
            target=self._loop, name="tft-display", daemon=True
        )
        self.thread.start()

    @staticmethod
    def _fit_text(draw, text, font, max_width):
        text = str(text)
        if draw.textbbox((0, 0), text, font=font)[2] <= max_width:
            return text
        while text and draw.textbbox((0, 0), text + "…", font=font)[2] > max_width:
            text = text[:-1]
        return text + "…"

    def _render_image(self, st):
        img = Image.new("RGB", (self.WIDTH, self.HEIGHT), (15, 23, 42))
        draw = ImageDraw.Draw(img)
        draw.rectangle([(3, 3), (236, 236)], outline=(56, 189, 248), width=2)
        draw.text((32, 10), "OFFICE HEALTH", font=self.f_m, fill=(56, 189, 248))

        face_status = st.get("face_status", "DISABLED")
        face_active = face_status in ("DISABLED", "VERIFIED")
        p_status = st.get("posture_status", 2)
        p_label = st.get("posture_label", "Waiting")
        if p_status == 0:
            p_color, p_bg = (34, 197, 94), (20, 45, 30)
        elif p_status in (1, 3):
            p_color, p_bg = (239, 68, 68), (50, 20, 25)
        else:
            p_color, p_bg = (148, 163, 184), (30, 41, 59)

        draw.rectangle([(12, 35), (228, 75)], outline=p_color, fill=p_bg, width=1)
        draw.text((20, 40), "POSTURE:", font=self.f_s, fill=p_color)
        draw.text((20, 55), self._fit_text(draw, p_label, self.f_m, 200),
                  font=self.f_m, fill=(255, 255, 255))

        finger = bool(st.get("finger", False))
        bpm = st.get("bpm")
        reliable = bool(st.get("hr_reliable", False))
        spo2 = st.get("spo2")
        bpm_str = f"{float(bpm):.0f}" if finger and reliable and bpm is not None else "--"
        spo2_str = f"{float(spo2):.1f}%" if finger and spo2 is not None else "--"

        draw.rectangle([(12, 85), (115, 155)], outline=(244, 63, 94),
                       fill=(35, 25, 40), width=1)
        draw.text((20, 90), "HR Verified" if reliable else "Measuring",
                  font=self.f_s, fill=(244, 63, 94))
        draw.text((20, 115), bpm_str, font=self.f_b, fill=(255, 255, 255))

        draw.rectangle([(125, 85), (228, 155)], outline=(6, 182, 212),
                       fill=(20, 35, 50), width=1)
        draw.text((135, 90), "SpO2", font=self.f_s, fill=(6, 182, 212))
        draw.text((135, 115), spo2_str, font=self.f_b, fill=(255, 255, 255))

        status = st.get("health_status", "STANDBY")
        if not face_active:
            if face_status == "ENROLLING":
                b_color, msg = (234, 179, 8), "Enroll face " + st.get("face_progress", "")
            elif face_status == "VERIFYING":
                b_color, msg = (234, 179, 8), "Verify face " + st.get("face_progress", "")
            elif face_status == "REGISTERED":
                b_color, msg = (34, 197, 94), "Face saved. Login"
            elif face_status == "REVERIFY_REQUIRED":
                b_color, msg = (239, 68, 68), "Please verify again"
            elif face_status == "ERROR":
                b_color, msg = (239, 68, 68), "Face auth failed"
            else:
                b_color, msg = (234, 179, 8), "Login on Web"
        elif status == "SENSOR_ERROR":
            b_color, msg = (239, 68, 68), "Sensor Error"
        elif status == "SENSOR_STALLED":
            b_color, msg = (239, 68, 68), "Sensor No Data"
        elif status == "SENSOR_STALE":
            b_color, msg = (239, 68, 68), "Sensor Stale"
        elif status == "STARTING":
            b_color, msg = (234, 179, 8), "Starting Sensor"
        elif not finger:
            b_color, msg = (239, 68, 68), "No Finger"
        elif status == "WARMUP":
            b_color, msg = (234, 179, 8), f"Measuring {float(st.get('warmup') or 0):.1f}s"
        elif status == "SIGNAL_WEAK":
            b_color, msg = (234, 179, 8), "Signal Weak / Last HR" if reliable else "Signal Weak"
        elif status == "MEASURING":
            b_color, msg = (234, 179, 8), "Measuring HR..."
        elif status == "HR_CONFIRMED" and reliable:
            b_color, msg = (34, 197, 94), "HR Verified (V8)"
        else:
            b_color, msg = (234, 179, 8), "Measuring HR..."
        draw.rectangle([(12, 170), (228, 225)], fill=b_color)
        draw.text((20, 190), msg, font=self.f_s, fill=(255, 255, 255))
        return img

    def _display_image(self, img):
        # The whole frame is sent at once through SPI0; I2C is not involved.
        self._send_cmd(0x2A)
        self._send_data([0x00, 0x00, 0x00, 0xEF])
        self._send_cmd(0x2B)
        self._send_data([0x00, 0x00, 0x00, 0xEF])
        self._send_cmd(0x2C)
        self.GPIO.output(self.dc, self.GPIO.HIGH)

        # Vectorized RGB888 -> RGB565; avoids looping over 57,600 pixels in Python.
        rgb = np.asarray(img, dtype=np.uint8)
        c = ((rgb[:, :, 0].astype(np.uint16) & 0xF8) << 8)
        c |= ((rgb[:, :, 1].astype(np.uint16) & 0xFC) << 3)
        c |= (rgb[:, :, 2].astype(np.uint16) >> 3)
        buf = bytearray(c.astype(">u2", copy=False).tobytes())
        self.spi.writebytes2(buf)

    def _loop(self):
        frame_period = 1.0 / self.fps
        try:
            while not self.stop_event.is_set():
                started = time.monotonic()
                with self.lock:
                    st = dict(self.state)
                self._display_image(self._render_image(st))
                self.stop_event.wait(max(0.0, frame_period - (time.monotonic() - started)))
        except Exception as exc:
            self.last_error = exc
            print(f"ST7789 worker failed: {exc!r}", flush=True)
        finally:
            self.running = False

    def stop(self):
        self.stop_event.set()
        self.running = False
        if self.thread is not None:
            self.thread.join(timeout=5.0)
            if self.thread.is_alive():
                # Never close SPI while the display thread may still be writing.
                raise RuntimeError("ST7789 display thread did not stop in 5 seconds")
            self.thread = None
        self._cleanup_io()
