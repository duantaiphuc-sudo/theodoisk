import os
import queue
import threading
import time

# Force SDL/Pygame to use ALSA directly on Raspberry Pi.
# If the user's system intentionally routes audio through PipeWire/PulseAudio,
# this can be removed.
os.environ.setdefault("SDL_AUDIODRIVER", "alsa")

import pygame


class SpeakerManager:
    """
    MAX98357A I2S voice-alert manager.

    Main fixes compared with the old version:
    - Initialize the mixer with a fixed 44.1 kHz / 16-bit / stereo format.
    - Use one playback worker instead of creating a thread for every alert.
    - Never call music.stop() before every new alert (avoids abrupt transients).
    - Queue alerts so two threads cannot manipulate pygame.mixer.music at once.
    - Set application volume explicitly.
    """

    def __init__(
        self,
        device_id=0,
        audio_dir="audio",
        volume=1.0,
        frequency=44100,
        buffer_size=4096,
    ):
        self.device_id = device_id
        self.volume = max(0.0, min(1.0, float(volume)))

        base_path = os.path.dirname(os.path.abspath(__file__))
        self.audio_dir = os.path.join(base_path, audio_dir)

        self._queue = queue.Queue(maxsize=6)
        self._stop_event = threading.Event()
        self._ready = False
        self._worker = None
        self._last_enqueued = None
        self._last_enqueue_time = 0.0

        try:
            pygame.mixer.init(
                frequency=int(frequency),
                size=-16,
                channels=2,
                buffer=int(buffer_size),
                allowedchanges=0,
            )
            pygame.mixer.music.set_volume(self.volume)
            self._ready = True

            print(
                "[SPEAKER] Mixer ready: "
                f"{frequency} Hz / 16-bit / stereo / buffer={buffer_size} / "
                f"volume={self.volume:.2f}"
            )

            self._worker = threading.Thread(
                target=self._playback_loop,
                name="speaker-playback",
                daemon=True,
            )
            self._worker.start()

        except Exception as exc:
            print(f"[SPEAKER ERROR] Mixer init failed: {exc!r}")

    def _playback_loop(self):
        while not self._stop_event.is_set():
            try:
                filename = self._queue.get(timeout=0.2)
            except queue.Empty:
                continue

            if filename is None:
                self._queue.task_done()
                break

            try:
                self._play_file(filename)
            except Exception as exc:
                print(f"[SPEAKER ERROR] Cannot play {filename}: {exc!r}")
            finally:
                self._queue.task_done()

    def _play_file(self, filename):
        file_path = os.path.join(self.audio_dir, filename)

        if not os.path.exists(file_path):
            print(f"[SPEAKER ERROR] File not found: {file_path}")
            return

        if not self._ready:
            return

        # Only this single worker accesses pygame.mixer.music.
        pygame.mixer.music.load(file_path)
        pygame.mixer.music.set_volume(self.volume)

        # Do NOT stop an already playing file here.
        # The worker waits for the previous item to finish before loading this one.
        pygame.mixer.music.play()

        while pygame.mixer.music.get_busy() and not self._stop_event.is_set():
            self._stop_event.wait(0.05)

    def play(self, filename):
        """Queue an alert without blocking the main AI loop."""
        if not self._ready:
            return False

        now = time.monotonic()

        # Prevent accidental duplicate enqueue of the exact same alert
        # within a very short interval.
        if (
            filename == self._last_enqueued
            and now - self._last_enqueue_time < 0.5
        ):
            return False

        try:
            self._queue.put_nowait(filename)
            self._last_enqueued = filename
            self._last_enqueue_time = now
            return True
        except queue.Full:
            # Do not let audio backlog grow and affect the main system.
            print(f"[SPEAKER] Queue full, skipped: {filename}")
            return False

    def set_volume(self, volume):
        self.volume = max(0.0, min(1.0, float(volume)))
        if self._ready:
            try:
                pygame.mixer.music.set_volume(self.volume)
            except Exception:
                pass

    def stop(self):
        self._stop_event.set()

        try:
            pygame.mixer.music.fadeout(80)
        except Exception:
            pass

        if self._worker is not None:
            self._worker.join(timeout=1.5)

        try:
            pygame.mixer.quit()
        except Exception:
            pass

        self._worker = None
        self._ready = False

    # ==========================================
    # AUDIO ALERT CALLS
    # ==========================================

    def alert_posture_incorrect(self):
        print("[SPEAKER] Audio: posture_incorrect.mp3")
        self.play("posture_incorrect.mp3")

    def alert_long_incorrect(self):
        print("[SPEAKER] Audio: long_incorrect.mp3")
        self.play("long_incorrect.mp3")

    def alert_long_sitting(self):
        print("[SPEAKER] Audio: long_sitting.mp3")
        self.play("long_sitting.mp3")

    def alert_out_of_zone(self):
        print("[SPEAKER] Audio: out_of_zone.mp3")
        self.play("out_of_zone.mp3")

    def alert_sit_to_stand(self):
        print("[SPEAKER] Audio: sit_to_stand_prompt.mp3")
        self.play("sit_to_stand_prompt.mp3")

    def alert_standing_goal_reached(self):
        print("[SPEAKER] Audio: standing_goal_reached.mp3")
        self.play("standing_goal_reached.mp3")

    def alert_vital_abnormal(self):
        print("[SPEAKER] Audio: vital_abnormal.mp3")
        self.play("vital_abnormal.mp3")

    def alert_system_ready(self):
        # The original code only printed "System Ready" and did not play a file.
        # Keep startup silent to avoid an unnecessary startup transient.
        print("[SPEAKER] System Ready.")
