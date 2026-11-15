# -*- coding: utf-8 -*-
"""Phat am thanh trang thai cho Office Health tren Raspberry Pi 4.

Cac file MP3 duoc nap san khi khoi dong. Khi co su kien, Channel.play()
phat ngay tren mixer thread; khong xep mot hang doi dai lam tre canh bao.
"""

import array
import math
import os
import threading
import time
from collections import deque

os.environ.setdefault("SDL_AUDIODRIVER", "alsa")

import pygame


class SpeakerManager:
    AUDIO_FILES = (
        "camera_error.mp3",
        "biometric_reminder.mp3",
        "face_enrolled.mp3",
        "face_verified.mp3",
        "finger_placed.mp3",
        "finger_removed.mp3",
        "long_incorrect.mp3",
        "long_sitting.mp3",
        "measure_complete.mp3",
        "measuring_pulse.mp3",
        "posture_correct.mp3",
        "posture_incorrect.mp3",
        "posture_verifying.mp3",
        "standing_active.mp3",
        "standing_goal_reached.mp3",
        "stranger_detected.mp3",
        "user_absent.mp3",
        "vital_abnormal.mp3",
        "welcome_back.mp3",
    )

    def __init__(self, audio_dir="audio", volume=1.0,
                 frequency=44100, buffer_size=1024):
        self.volume = max(0.0, min(1.0, float(volume)))
        self.audio_dir = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), audio_dir
        )
        self._lock = threading.RLock()
        self._ready = False
        self._sounds = {}
        self._missing_files = set()
        self._last_file = None
        self._last_play_time = 0.0
        self._voice_channel = None
        self._beep_channel = None
        self._beep_sound = None
        self._queue = deque()
        self._queue_limit = 16
        self._current_file = None
        self._worker_stop = threading.Event()
        self._worker = None

        try:
            pygame.mixer.init(
                frequency=int(frequency),
                size=-16,
                channels=2,
                buffer=int(buffer_size),
                allowedchanges=0,
            )
            pygame.mixer.set_num_channels(8)
            self._voice_channel = pygame.mixer.Channel(0)
            self._beep_channel = pygame.mixer.Channel(1)
            self._voice_channel.set_volume(self.volume)
            self._beep_channel.set_volume(self.volume)
            self._beep_sound = self._make_beep(frequency)

            for filename in self.AUDIO_FILES:
                path = os.path.join(self.audio_dir, filename)
                if not os.path.isfile(path):
                    self._missing_files.add(filename)
                    print(f"[SPEAKER MISSING] {path}", flush=True)
                    continue
                try:
                    self._sounds[filename] = pygame.mixer.Sound(path)
                except Exception as exc:
                    print(f"[SPEAKER LOAD ERROR] {filename}: {exc!r}", flush=True)

            self._ready = True
            self._worker = threading.Thread(
                target=self._audio_worker,
                name="SpeakerAudioQueue",
                daemon=True,
            )
            self._worker.start()
            print(
                f"[SPEAKER] Ready: {len(self._sounds)}/{len(self.AUDIO_FILES)} "
                f"MP3 loaded | volume={self.volume:.2f} | buffer={buffer_size}",
                flush=True,
            )
        except Exception as exc:
            print(f"[SPEAKER ERROR] Mixer init failed: {exc!r}", flush=True)

    @staticmethod
    def _make_beep(frequency):
        """Tao tieng bip ngan bang PCM, khong can them file am thanh."""
        sample_rate = int(frequency)
        duration = 0.16
        count = int(sample_rate * duration)
        samples = array.array("h")
        for i in range(count):
            envelope = min(1.0, i / 300.0, (count - i) / 500.0)
            value = int(10500 * envelope * math.sin(
                2.0 * math.pi * 880.0 * i / sample_rate
            ))
            samples.append(value)
        stereo = array.array("h")
        for sample in samples:
            stereo.append(sample)
            stereo.append(sample)
        return pygame.mixer.Sound(buffer=stereo.tobytes())

    @property
    def ready(self):
        return self._ready

    def has_audio(self, filename):
        return self._ready and filename in self._sounds

    def play(self, filename, interrupt=False):
        """Xep am thanh vao hang doi; mac dinh khong cat clip dang phat.

        interrupt=True chi dung cho canh bao khan cap muon cat am thanh hien tai.
        """
        if not self._ready:
            return False

        with self._lock:
            sound = self._sounds.get(filename)
            if sound is None:
                if filename not in self._missing_files:
                    print(f"[SPEAKER MISSING] {os.path.join(self.audio_dir, filename)}", flush=True)
                    self._missing_files.add(filename)
                return False

            now = time.monotonic()
            if filename == self._last_file and now - self._last_play_time < 0.35:
                return False

            # Khong dua cung mot su kien vao hang doi nhieu lan.
            if filename == self._current_file or filename in self._queue:
                return False

            if interrupt:
                self._queue.clear()
                if self._voice_channel and self._voice_channel.get_busy():
                    self._voice_channel.stop()
                self._current_file = None
                self._queue.appendleft(filename)
            else:
                if len(self._queue) >= self._queue_limit:
                    dropped = self._queue.popleft()
                    print(f"[SPEAKER] Queue full; dropped: {dropped}", flush=True)
                self._queue.append(filename)

            self._last_file = filename
            self._last_play_time = now
            return True

    def _audio_worker(self):
        """Phat tung clip theo thu tu, chi chuyen clip khi clip truoc ket thuc."""
        while not self._worker_stop.is_set():
            filename = None
            with self._lock:
                if (self._ready and self._queue and self._voice_channel
                        and not self._voice_channel.get_busy()):
                    filename = self._queue.popleft()
                    sound = self._sounds.get(filename)
                    if sound is not None:
                        try:
                            self._voice_channel.play(sound)
                            self._current_file = filename
                            print(f"[SPEAKER] PLAY: {filename}", flush=True)
                        except Exception as exc:
                            self._current_file = None
                            print(f"[SPEAKER ERROR] Play {filename}: {exc!r}", flush=True)
                    else:
                        self._current_file = None

                # Channel het phat thi xoa ten clip hien tai.
                if (self._current_file is not None and self._voice_channel
                        and not self._voice_channel.get_busy()):
                    self._current_file = None
            self._worker_stop.wait(0.03)

    def alert_beep(self):
        """Tieng bip rieng, dung cho tuy chon soundEnabled tren web."""
        if not self._ready or self._beep_sound is None:
            return False
        try:
            self._beep_channel.play(self._beep_sound)
            return True
        except Exception as exc:
            print(f"[SPEAKER ERROR] Beep: {exc!r}", flush=True)
            return False

    def set_volume(self, volume):
        self.volume = max(0.0, min(1.0, float(volume)))
        if self._ready:
            self._voice_channel.set_volume(self.volume)
            self._beep_channel.set_volume(self.volume)

    def stop(self):
        self._worker_stop.set()
        with self._lock:
            self._queue.clear()
            try:
                if self._voice_channel:
                    self._voice_channel.stop()
                if self._beep_channel:
                    self._beep_channel.stop()
            finally:
                self._ready = False
        if self._worker and self._worker.is_alive():
            self._worker.join(timeout=1.0)
        with self._lock:
            pygame.mixer.quit()
            self._sounds.clear()
            self._current_file = None

    # Face / camera
    def alert_camera_error(self): self.play("camera_error.mp3")
    def alert_face_enrolled(self): self.play("face_enrolled.mp3")
    def alert_face_verified(self): self.play("face_verified.mp3")
    def alert_stranger_detected(self): self.play("stranger_detected.mp3")
    def alert_welcome_back(self): self.play("welcome_back.mp3")

    # Posture / presence
    def alert_posture_correct(self): self.play("posture_correct.mp3")
    def alert_posture_incorrect(self): self.play("posture_incorrect.mp3")
    def alert_posture_verifying(self): self.play("posture_verifying.mp3")
    def alert_long_incorrect(self): self.play("long_incorrect.mp3")
    def alert_long_sitting(self): self.play("long_sitting.mp3")
    def alert_standing_active(self): self.play("standing_active.mp3")
    def alert_standing_goal_reached(self): self.play("standing_goal_reached.mp3")
    def alert_user_absent(self): self.play("user_absent.mp3")

    # MAX30102
    def alert_biometric_reminder(self):
        """Nhac nguoi dung dat ngon tay len MAX30102 de do sinh trac hoc."""
        return self.play("biometric_reminder.mp3", interrupt=False)

    def alert_finger_placed(self): self.play("finger_placed.mp3")
    def alert_finger_removed(self): self.play("finger_removed.mp3")
    def alert_measuring_pulse(self): self.play("measuring_pulse.mp3", interrupt=False)
    def alert_measure_complete(self): self.play("measure_complete.mp3", interrupt=False)
    def alert_vital_abnormal(self): self.play("vital_abnormal.mp3")

    # Tuong thich voi ten ham o cac ban main cu.
    def alert_sit_to_stand(self): self.alert_long_sitting()
    def alert_out_of_zone(self): self.alert_user_absent()
