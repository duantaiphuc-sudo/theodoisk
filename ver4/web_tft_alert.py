"""Read Web-derived status 3/4 ONLY for TFT overlay, never as telemetry.

Firestore: devices/{deviceId}/web_display/current
  uid, assignment_id, status_code (0/3/4), base_posture_status,
  updated_at (server timestamp). No counters or clock configuration.
"""
import math
import threading
import time
from datetime import datetime, timezone


class WebTftAlertReader:
    def __init__(self, db, device_id, poll_seconds=2.0, ttl_seconds=18.0):
        self.doc = db.collection('devices').document(device_id).collection(
            'web_display').document('current')
        self.poll_seconds = float(poll_seconds)
        self.ttl_seconds = float(ttl_seconds)
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None
        self._latest = None

    def start(self):
        if self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop,
                                        name='web-tft-alert-poll', daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=3.0)
            self._thread = None

    def _loop(self):
        while not self._stop.is_set():
            try:
                snap = self.doc.get()
                data = snap.to_dict() if snap.exists else None
                # Fail-closed on Firestore outage rather than displaying a
                # previously authorized user's stale alert.
                with self._lock:
                    self._latest = data
            except Exception as exc:
                with self._lock:
                    self._latest = None
                print('[WEB-TFT] read failed:', type(exc).__name__, flush=True)
            self._stop.wait(self.poll_seconds)

    def snapshot(self, current_uid, current_assignment_id, verified):
        if not verified or not current_uid or not current_assignment_id:
            return None
        with self._lock:
            data = dict(self._latest) if isinstance(self._latest, dict) else None
        if not data:
            return None
        if data.get('uid') != current_uid or data.get('assignment_id') != current_assignment_id:
            return None
        if type(data.get('status_code')) is not int or data['status_code'] not in (3, 4):
            return None
        if type(data.get('base_posture_status')) is not int or data['base_posture_status'] not in (0, 1):
            return None
        updated = data.get('updated_at')
        if not isinstance(updated, datetime):
            return None
        try:
            # Firestore Timestamp is UTC-aware, normalize if needed.
            if updated.tzinfo is None:
                updated = updated.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - updated.astimezone(timezone.utc)).total_seconds()
            if not math.isfinite(age) or age < -5 or age > self.ttl_seconds:
                return None
        except Exception:
            return None
        return data


def select_tft_posture(raw_code, raw_label, web_notice):
    """Web alert never changes camera or Firebase posture, only TFT text."""
    if not isinstance(web_notice, dict):
        return raw_code, raw_label
    status = web_notice.get('status_code')
    base = web_notice.get('base_posture_status')
    if status == 3 and raw_code == 1 and base == 1:
        return 3, 'SAI TU THE LAU'
    if status == 4 and raw_code in (0, 1) and base == raw_code:
        return 4, 'NGOI QUA LAU'
    return raw_code, raw_label
