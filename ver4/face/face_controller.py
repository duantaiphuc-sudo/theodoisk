"""Face state machine for a *shared* Raspberry Pi (one assigned UID at a time).

Trusted assignment record: devices/{deviceId}/assignment/current
  {uid: FirebaseAuthUID, assignment_id: random UUID, updated_at: timestamp}

Never trust a command's UID alone. Commands must carry the current assignment_id
and correspond to an authenticated Web request. A Firestore watch revokes an
already verified session on reassignment, even when no new command is issued.
This code intentionally contains no service-account private key.
"""
import queue
import threading
import time
from firebase_admin import firestore

from .face_engine import FaceEngine, FaceEngineError, MODEL_NAME

ACTIONS = frozenset(("ENROLL_FACE", "VERIFY_FACE", "LOGOUT_FACE"))


class FaceController:
    def __init__(self, db, device_id, camera, yunet_model, sface_model,
                 threshold=0.72, assignment_check_seconds=8.0):
        self.db = db
        self.device_id = device_id
        self.device_ref = db.collection('devices').document(device_id)
        self.assignment_ref = self.device_ref.collection('assignment').document('current')
        self.commands = self.device_ref.collection('face_commands')
        self.session = self.device_ref.collection('session').document('current')
        self.engine = FaceEngine(camera, yunet_model, sface_model, threshold=threshold)
        self.assignment_check_seconds = float(assignment_check_seconds)
        self.stop_event = threading.Event()
        self.guard = threading.RLock()
        self._state = {'status': 'WAIT_LOGIN', 'uid': None, 'progress': '',
                       'reason': 'STARTUP', 'epoch': 0}
        self._dirty = True
        self._assignment = (None, None)  # UID, assignment_id (authoritative)
        self._assignment_generation = 0
        self._assignment_checked_at = 0.0
        self._ready = False
        self._commands_watch = None
        self._assignment_watch = None
        self._pending = queue.Queue()
        self._enqueued = set()
        self._cmd_ref = None
        self._next_auto_probe = 0.0
        self.thread = None

    def snapshot(self):
        with self.guard:
            return {**self._state, 'assignment_uid': self._assignment[0]}

    def is_verified(self):
        with self.guard:
            return (self._ready and self._state['status'] == 'VERIFIED'
                    and self._state['uid'] == self._assignment[0]
                    and bool(self._assignment[1])
                    and time.monotonic() - self._assignment_checked_at < 22.0)

    def authorized_session(self, uid):
        with self.guard:
            return bool(uid) and self.is_verified() and self._state['uid'] == uid

    def _set(self, status, uid=None, progress='', reason=''):
        with self.guard:
            old = self._state
            epoch = old['epoch'] + int((old['status'], old['uid']) != (status, uid))
            self._state = {'status': status, 'uid': uid,
                           'progress': progress, 'reason': reason, 'epoch': epoch}
            self._dirty = True

    def lock(self, reason='AWAY_OVER_30S'):
        with self.guard:
            if self._state['status'] == 'VERIFIED':
                self._set('REVERIFY_REQUIRED', self._state['uid'], reason=reason)
                self._next_auto_probe = time.monotonic() + 1.0

    @staticmethod
    def _parse_assignment(data):
        if not isinstance(data, dict):
            return None, None
        uid, assignment_id = data.get('uid'), data.get('assignment_id')
        if (not isinstance(uid, str) or not 1 <= len(uid) <= 128 or
                not isinstance(assignment_id, str) or not 10 <= len(assignment_id) <= 128):
            return None, None
        return uid, assignment_id

    def _apply_assignment(self, new_assignment):
        """Firehose revocation. Called from Firestore callback or safety poll.

        Increment generation first: any in-progress camera capture now cancels.
        Do not do network IO under the lock. Caller can publish asynchronously.
        """
        with self.guard:
            old = self._assignment
            self._assignment_checked_at = time.monotonic()
            self._ready = True
            if new_assignment == old:
                return False
            self._assignment = new_assignment
            self._assignment_generation += 1
            self._next_auto_probe = 0.0
            self._set('WAIT_LOGIN', reason=('DEVICE_REASSIGNED' if old[1] else
                                            'ASSIGNMENT_READY' if new_assignment[1]
                                            else 'UNASSIGNED'))
            print(f"[FACE] assignment changed: {bool(old[0])} -> {bool(new_assignment[0])}; session locked", flush=True)
            return True

    def _on_assignment(self, documents, changes, read_time):
        # DocumentReference.on_snapshot callback: documents is [DocumentSnapshot].
        try:
            doc = documents[0] if documents else None
            data = (doc.to_dict() or {}) if doc is not None and doc.exists else None
            self._apply_assignment(self._parse_assignment(data))
        except Exception as exc:
            self._revoke_offline('ASSIGNMENT_WATCH_ERROR')
            print('[FACE] assignment watch failure:', type(exc).__name__)

    def _revoke_offline(self, reason):
        with self.guard:
            self._ready = False
            self._assignment_generation += 1
            self._assignment = (None, None)
            self._set('WAIT_LOGIN', reason=reason)

    def _refresh_assignment(self):
        try:
            doc = self.assignment_ref.get()
            data = doc.to_dict() if doc.exists else None
            self._apply_assignment(self._parse_assignment(data))
            return True
        except Exception as exc:
            self._revoke_offline('ASSIGNMENT_FIRESTORE_UNAVAILABLE')
            print('[FACE] assignment refresh error:', type(exc).__name__)
            return False

    def _current_token(self, uid, assignment_id):
        with self.guard:
            if (not self._ready or
                (uid, assignment_id) != self._assignment or
                    time.monotonic() - self._assignment_checked_at >= 22.0):
                raise FaceEngineError('DEVICE_ASSIGNMENT_CHANGED')
            return self._assignment_generation

    def _cancelled(self, token, uid, assignment_id):
        with self.guard:
            return (self.stop_event.is_set() or not self._ready or
                    token != self._assignment_generation or
                    (uid, assignment_id) != self._assignment or
                    time.monotonic() - self._assignment_checked_at >= 22.0)

    def _paired(self, uid, assignment_id):
        """Additional consistency check against users/{uid} admin-assigned fields."""
        self._current_token(uid, assignment_id)
        doc = self.db.collection('users').document(uid).get()
        d = doc.to_dict() if doc.exists else {}
        if d.get('deviceId') != self.device_id and d.get('device') != self.device_id:
            raise FaceEngineError('USER_DEVICE_PAIR_MISMATCH')

    @staticmethod
    def _fresh(payload, max_seconds=100):
        when = payload.get('created_at')
        if when is None or not hasattr(when, 'timestamp'):
            return False
        age = time.time() - when.timestamp()
        return -15.0 <= age <= max_seconds

    def _claim(self, ref):
        tx = self.db.transaction()
        @firestore.transactional
        def attempt(transaction):
            snap = ref.get(transaction=transaction)
            if not snap.exists or (snap.to_dict() or {}).get('status') != 'PENDING':
                return None
            data = snap.to_dict()
            transaction.update(ref, {'status': 'RUNNING',
                                     'started_at': firestore.SERVER_TIMESTAMP})
            return data
        return attempt(tx)

    def _progress(self, done, total, status):
        with self.guard:
            if self._state['status'] == status:
                self._set(status, self._state['uid'], f'{done}/{total}')
        if self._cmd_ref is not None:
            try:
                self._cmd_ref.update({'progress': f'{done}/{total}'})
            except Exception:
                pass

    def _check_live_assignment(self, uid, assignment_id, token):
        """Network read after costly biometric processing. Fail closed."""
        if self._cancelled(token, uid, assignment_id):
            raise FaceEngineError('DEVICE_ASSIGNMENT_CHANGED')
        doc = self.assignment_ref.get()
        actual = self._parse_assignment(doc.to_dict() if doc.exists else None)
        self._apply_assignment(actual)
        if self._cancelled(token, uid, assignment_id):
            raise FaceEngineError('DEVICE_ASSIGNMENT_CHANGED')
        self._paired(uid, assignment_id)

    def _create_template_if_still_assigned(self, uid, assignment_id, vector):
        template = self.db.collection('face_templates').document(uid)
        user = self.db.collection('users').document(uid)
        transaction = self.db.transaction()
        @firestore.transactional
        def save(txn):
            assignment = self.assignment_ref.get(transaction=txn)
            user_snapshot = user.get(transaction=txn)
            existing = template.get(transaction=txn)
            actual = self._parse_assignment(assignment.to_dict() if assignment.exists else None)
            if actual != (uid, assignment_id):
                raise FaceEngineError('DEVICE_ASSIGNMENT_CHANGED')
            data = user_snapshot.to_dict() if user_snapshot.exists else {}
            if data.get('deviceId') != self.device_id and data.get('device') != self.device_id:
                raise FaceEngineError('USER_DEVICE_PAIR_MISMATCH')
            if existing.exists:
                raise FaceEngineError('TEMPLATE_EXISTS_ADMIN_RESET_REQUIRED')
            txn.create(template, {
                'userId':uid, 'model':MODEL_NAME, 'schema_version':1,
                'sample_count':5, 'embedding':[float(x) for x in vector],
                'enabled':True, 'updated_at':firestore.SERVER_TIMESTAMP,
            })
        save(transaction)

    def _execute(self, ref, payload):
        action, uid = payload.get('type'), payload.get('uid')
        assignment_id = payload.get('assignment_id')
        with self.guard:
            # A delayed or forged command from a *different* UID must not
            # interrupt a verified occupant, unless an admin has first revoked
            # the old assignment (the watch calls _apply_assignment).
            owner_in_use = self.is_verified() and self._state['uid'] != uid
        if owner_in_use:
            ref.update({'status':'FAILED', 'error':'DEVICE_IN_USE',
                        'finished_at':firestore.SERVER_TIMESTAMP})
            return
        try:
            if (action not in ACTIONS or
                    payload.get('device_id') != self.device_id or
                    not self._fresh(payload)):
                raise FaceEngineError('INVALID_OR_EXPIRED_COMMAND')
            token = self._current_token(uid, assignment_id)
            self._paired(uid, assignment_id)
            if action == 'LOGOUT_FACE':
                self._set('WAIT_LOGIN', reason='USER_LOGOUT')
            elif action == 'ENROLL_FACE':
                doc = self.db.collection('face_templates').document(uid)
                if doc.get().exists:
                    raise FaceEngineError('TEMPLATE_EXISTS_ADMIN_RESET_REQUIRED')
                self._set('ENROLLING', uid, '0/5')
                vector = self.engine.enroll(
                    lambda a,b: self._progress(a,b,'ENROLLING'),
                    lambda: self._cancelled(token, uid, assignment_id))
                self._check_live_assignment(uid, assignment_id, token)
                # Atomic create: never overwrite existing account template.
                # The Firestore transaction checks assignment *and* creates the
                # template atomically. A simultaneous admin handoff retries/fails.
                self._create_template_if_still_assigned(uid, assignment_id, vector)
                self._check_live_assignment(uid, assignment_id, token)
                self._set('REGISTERED', uid, '5/5', 'VERIFY_TO_LOGIN')
            elif action == 'VERIFY_FACE':
                doc = self.db.collection('face_templates').document(uid).get()
                if not doc.exists:
                    raise FaceEngineError('NO_FACE_TEMPLATE_ENROLL_FIRST')
                d = doc.to_dict() or {}
                if (d.get('enabled') is not True or d.get('model') != MODEL_NAME or
                        d.get('schema_version') != 1 or
                        not isinstance(d.get('embedding'), list) or len(d['embedding']) != 128):
                    raise FaceEngineError('UNSUPPORTED_FACE_TEMPLATE')
                self._set('VERIFYING', uid, '0/3')
                matched, _ = self.engine.verify(
                    d['embedding'], lambda a,b: self._progress(a,b,'VERIFYING'),
                    lambda: self._cancelled(token, uid, assignment_id))
                if not matched:
                    raise FaceEngineError('VERIFY_FAILED')
                self._check_live_assignment(uid, assignment_id, token)
                self._set('VERIFIED', uid, '3/3', 'FACE_MATCHED')
            ref.update({'status':'SUCCEEDED', 'finished_at':firestore.SERVER_TIMESTAMP})
        except Exception as exc:
            code = str(exc) if isinstance(exc, FaceEngineError) else type(exc).__name__
            with self.guard:
                # Never restore prior owner on stale command failures; revocation wins.
                if self._state['status'] not in ('WAIT_LOGIN',) or self._state['uid'] == uid:
                    self._set('WAIT_LOGIN', reason=code[:100])
            try:
                ref.update({'status':'FAILED', 'error':code[:100],
                            'finished_at':firestore.SERVER_TIMESTAMP})
            except Exception:
                pass
            print('[FACE] command failed:', code)

    def _on_commands(self, documents, changes, read_time):
        for change in changes:
            doc = change.document
            if doc.exists and (doc.to_dict() or {}).get('status') == 'PENDING':
                with self.guard:
                    if doc.id not in self._enqueued:
                        self._enqueued.add(doc.id)
                        self._pending.put(doc.reference)

    def _auto_reverify_if_returned(self):
        state = self.snapshot()
        if state['status'] != 'REVERIFY_REQUIRED' or not state['uid']:
            return
        now = time.monotonic()
        if now < self._next_auto_probe:
            return
        self._next_auto_probe = now + 4.0
        uid = state['uid']
        with self.guard:
            assignment_id = self._assignment[1]
        if not assignment_id:
            return
        try:
            token = self._current_token(uid, assignment_id)
            # YuNet + SFace only while locked, no second camera capture.
            if self.engine.sample() is None:
                return
            self._paired(uid, assignment_id)
            doc = self.db.collection('face_templates').document(uid).get()
            d = doc.to_dict() if doc.exists else {}
            if (d.get('enabled') is not True or d.get('model') != MODEL_NAME or
                    not isinstance(d.get('embedding'), list) or len(d['embedding']) != 128):
                self._set('WAIT_LOGIN', reason='TEMPLATE_UNAVAILABLE')
                return
            self._set('VERIFYING', uid, '0/3', 'AUTO_RETURN')
            matched, _ = self.engine.verify(
                d['embedding'],lambda a,b:self._progress(a,b,'VERIFYING'),
                lambda:self._cancelled(token, uid, assignment_id),
                timeout=12.0, attempts_limit=6)
            if matched:
                self._check_live_assignment(uid, assignment_id, token)
                self._set('VERIFIED', uid, '3/3', 'AUTO_RETURN_MATCHED')
            else:
                self._set('REVERIFY_REQUIRED', uid, reason='VERIFY_FAILED')
                self._next_auto_probe = time.monotonic() + 8.0
        except Exception as exc:
            if not self.stop_event.is_set():
                with self.guard:
                    # Do not restore stale UID after admin assignment changes.
                    if self._assignment == (uid, assignment_id):
                        self._set('REVERIFY_REQUIRED', uid, reason=type(exc).__name__)
                self._next_auto_probe = time.monotonic() + 8.0

    def _publish_state(self):
        with self.guard:
            if not self._dirty:
                return
            snap = dict(self._state)
            assignment = self._assignment[1]
            generation = self._assignment_generation
        self.session.set({'uid':snap['uid'], 'status':snap['status'],
                          'progress':snap['progress'], 'reason':snap['reason'],
                          'assignment_id':assignment,
                          'updated_at':firestore.SERVER_TIMESTAMP},merge=True)
        with self.guard:
            if self._state == snap and self._assignment_generation == generation:
                self._dirty = False

    def _loop(self):
        try:
            self._refresh_assignment()
            self._assignment_watch = self.assignment_ref.on_snapshot(self._on_assignment)
            self._commands_watch = self.commands.where('status','==','PENDING').on_snapshot(self._on_commands)
            last_poll = 0.0
            while not self.stop_event.is_set():
                now = time.monotonic()
                if now - last_poll > self.assignment_check_seconds:
                    self._refresh_assignment()
                    last_poll = now
                try:
                    self._publish_state()
                except Exception as exc:
                    print('[FACE] session sync error:', type(exc).__name__)
                try:
                    ref = self._pending.get(timeout=0.35)
                except queue.Empty:
                    self._auto_reverify_if_returned()
                    continue
                try:
                    payload = self._claim(ref)
                    if payload is not None:
                        self._cmd_ref = ref
                        try:
                            self._execute(ref, payload)
                        finally:
                            self._cmd_ref = None
                except Exception as exc:
                    print('[FACE] request processing error:', type(exc).__name__)
                finally:
                    with self.guard:
                        self._enqueued.discard(ref.id)
        finally:
            for watch in (self._commands_watch,self._assignment_watch):
                if watch is not None:
                    try: watch.unsubscribe()
                    except Exception: pass
            self._revoke_offline('STOPPED')
            try: self._publish_state()
            except Exception: pass

    def start(self):
        if self.thread is not None and self.thread.is_alive():
            return
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._loop,daemon=True,
                                       name='face-uid-assignment')
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread is not None:
            self.thread.join(timeout=36)
            if self.thread.is_alive():
                print('[FACE] command worker still stopping; keep Pi process stopped')
            else:
                self.thread = None
        self._revoke_offline('STOPPED')
