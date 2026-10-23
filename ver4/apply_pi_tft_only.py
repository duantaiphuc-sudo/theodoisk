#!/usr/bin/env python3
"""Apply only the Web->TFT display adapter to Office Health ver4.

Does NOT modify face/face_controller.py, face/face_engine.py, health workers,
model files, or TFT display driver. Requires the working Auto Face V3 code.
"""
from pathlib import Path
from datetime import datetime
import shutil, sys

root = Path(__file__).resolve().parent
main = root / 'mainnew.py'
addon = root / 'web_tft_alert.py'
if not main.is_file() or not addon.is_file():
    sys.exit('STOP: place this script and web_tft_alert.py in ver4 next to mainnew.py')
s = main.read_text(encoding='utf-8')
if 'from activity_settings import' in s or 'ActivitySettings' in s:
    sys.exit('STOP: this appears to be V4 time-sync code. Restore Auto Face V3 before patching.')
if 'from web_tft_alert import WebTftAlertReader' in s:
    print('Already has Web TFT adapter; not touching your currently working code.')
    sys.exit(0)

edits = []
def rep(old, new, why):
    global s
    n = s.count(old)
    if n != 1: raise RuntimeError('STOP: %s expected once, found %s. No changes saved.'%(why,n))
    s = s.replace(old, new)
    edits.append(why)

rep('from posture_stabilizer import PostureStabilizer, PostureDisplayView\n',
    'from posture_stabilizer import PostureStabilizer, PostureDisplayView\n'
    'from web_tft_alert import WebTftAlertReader, select_tft_posture\n', 'import addon')

# Raw Pi pose must never generate Web-defined "long wrong posture" code 3.
rep('STATUS_LONG_BAD = 3\n', '', 'status code 3 only Web')
rep('LONG_BAD_SECONDS = 120.0\n', '', 'Pi long-bad threshold removed')
old_bad='''    if status == "BAD":
        if bad_duration >= LONG_BAD_SECONDS:
            return (
                STATUS_LONG_BAD,
                "Sai tư thế lâu",
                True,
                True,
            )

        return (
'''
new_bad='''    if status == "BAD":
        # Duration is measured only by the Web (TFT may later overlay code 3).
        return (
'''
rep(old_bad,new_bad,'remove Pi long-bad classification')
# Preserve all Face V3 lifecycle and standing/absence handling as-is.
rep('    face_controller = None\n    absent_since = None\n',
    '    face_controller = None\n    web_tft_alert = None\n    absent_since = None\n', 'reader init')
rep('        publisher = FirebasePublisher(firebase, face_controller=face_controller)\n',
    '''        # Read Web alarm code in a background thread, never in the camera loop.
        if args.face_auth:
            web_tft_alert = WebTftAlertReader(firebase.db, firebase.document_id)
            web_tft_alert.start()

        publisher = FirebasePublisher(firebase, face_controller=face_controller)
''', 'start reader')
# Do not continue running Pi's own long-BAD timer.
rep('    bad_start = None\n    last_bad_duration = 0.0\n', '', 'remove Pi bad timer init')
rep('                    bad_start = None\n                    last_bad_duration = 0.0\n', '', 'remove Pi bad timer reset')
old_timer='''            # Long-bad timer counts confirmed BAD. A few noisy GOOD frames
            # cannot reset this timer; confirmed GOOD / absence / error can.

            if posture_status_text == "BAD":
                if bad_start is None:
                    bad_start = now

                last_bad_duration = now - bad_start

            else:
                bad_start = None
                last_bad_duration = 0.0

'''
rep(old_timer, '            # Web alone owns elapsed posture durations.\n\n', 'remove Pi bad timer loop')
rep('''            ) = posture_to_schema(
                posture_snapshot,
                last_bad_duration,
            )
''', '''            ) = posture_to_schema(posture_snapshot, 0.0)
''', 'call posture without timer')
old_tft='''                    tft.update(
                        posture_status=posture_status,
                        posture_label=posture_label,
'''
new_tft='''                    # Read-only snapshot of the current assignment under the
                    # existing Face V3 RLock; no FaceController edits needed.
                    notice = None
                    if web_tft_alert is not None and face_controller is not None:
                        with face_controller.guard:
                            live_uid = face_controller._state['uid']
                            live_assignment_id = face_controller._assignment[1]
                            live_verified = face_controller.is_verified()
                        notice = web_tft_alert.snapshot(
                            live_uid, live_assignment_id, live_verified)
                    tft_status, tft_label = select_tft_posture(
                        posture_status, posture_label, notice)
                    tft.update(
                        posture_status=tft_status,
                        posture_label=tft_label,
'''
rep(old_tft,new_tft,'TFT alert overlay')
rep('''    finally:
        print()
        print("Stopping all modules...")
''', '''    finally:
        print()
        print("Stopping all modules...")
        if web_tft_alert is not None:
            try:
                web_tft_alert.stop()
            except Exception as exc:
                print('Web TFT reader stop error:', type(exc).__name__)
''', 'stop reader')
rep('print(f"Long bad posture threshold: {LONG_BAD_SECONDS:.0f}s")',
    'print("Long bad/long sitting timers: WEB ONLY. TFT mirrors Web codes 3/4")',
    'log')
if not ('def posture_to_schema(' in s and 'select_tft_posture(' in s):
    raise RuntimeError('Final invariant failed; nothing saved')
backup = main.with_name('mainnew.py.backup_tft_only_'+datetime.now().strftime('%Y%m%d_%H%M%S'))
shutil.copy2(main,backup)
main.write_text(s,encoding='utf-8')
print('PATCH OK:',', '.join(edits))
print('BACKUP:',backup)
print('Important: face_controller.py and face_engine.py were NOT modified.')
