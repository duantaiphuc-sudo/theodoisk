#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Apply Office Health per-user threshold sync to the current Web repo.

Validated against repo main 1de1f2e0b98035aa2ec81fe25a3a39a9f8bf2d60.
Run in the Web directory containing package.json and src/App.tsx.
"""
from pathlib import Path
import shutil
from datetime import datetime

root=Path.cwd()
files=['src/types.ts','src/components/AlertSettingsModal.tsx','src/App.tsx','src/services/deviceTelemetry.ts','src/components/FaceControlPanel.tsx']
for f in files:
    if not (root/f).exists():
        raise SystemExit(f'Không tìm thấy {f}; hãy chạy ở thư mục Web chứa package.json.')
contents={k:(root/k).read_text(encoding='utf-8') for k in files}

def replace_one(s,a,b,label):
    n=s.count(a)
    if n!=1:
        raise SystemExit(f'Không áp dụng bản vá: [{label}] có {n} vị trí, cần đúng 1. Repo đã thay đổi; không ghi file.')
    return s.replace(a,b)

NEW_SERVICE = "import { getAuth, onAuthStateChanged } from 'firebase/auth';\nimport { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';\nimport type { AlertThresholds, TimeCalculations } from '../types';\nimport { initializeFirebaseApp, getAppFirestore, getSavedFirebaseConfig } from './firebase';\n\n// These numbers map exactly to Python activity_settings.DEFAULTS.\nexport const DEFAULT_PI_THRESHOLDS = {\n  hrMin: 50, hrMax: 110, spo2Min: 94,\n  incorrectPostureSec: 30, longIncorrectSec: 120,\n  longSittingSec: 3600, standingTargetSec: 300, standingResetSec: 300,\n  soundEnabled: true, voiceAlertEnabled: true,\n  browserNotificationEnabled: true, outOfZoneAlertEnabled: false,\n};\n\nconst bounds: Record<string, [number, number]> = {\n  hrMin: [40, 90], hrMax: [90, 160], spo2Min: [85, 99],\n  incorrectPostureSec: [5, 300], longIncorrectSec: [30, 3600],\n  longSittingSec: [300, 7200], standingTargetSec: [30, 3600],\n  standingResetSec: [5, 3600],\n};\n\nfunction getAuthorizedDb(uid: string) {\n  const config = getSavedFirebaseConfig();\n  const app = initializeFirebaseApp(config);\n  const auth = getAuth(app);\n  if (!uid || auth.currentUser?.uid !== uid) {\n    throw new Error('UID hiện tại chưa xác thực hoặc không khớp tài khoản.');\n  }\n  return getAppFirestore(app, config);\n}\n\nexport async function savePiSettings(uid: string, input: AlertThresholds) {\n  const db = getAuthorizedDb(uid);\n  const settings = { ...DEFAULT_PI_THRESHOLDS, ...input };\n  for (const [key, [lo, hi]] of Object.entries(bounds)) {\n    const num = Number((settings as any)[key]);\n    if (!Number.isFinite(num) || num < lo || num > hi) {\n      throw new Error(`Ngưỡng ${key} phải trong khoảng ${lo}–${hi}.`);\n    }\n  }\n  if (settings.hrMin >= settings.hrMax || settings.longIncorrectSec < settings.incorrectPostureSec) {\n    throw new Error('Ngưỡng HR và thời gian sai tư thế chưa hợp lệ.');\n  }\n  await setDoc(doc(db, 'users', uid, 'preferences', 'office_health'), {\n    ...settings, updatedAt: serverTimestamp(), schemaVersion: 1,\n  }, {merge: true});\n}\n\nexport function watchPiSettings(\n  uid: string,\n  onData: (settings: Partial<AlertThresholds>) => void,\n  onError: (error: Error) => void,\n) {\n  const cfg = getSavedFirebaseConfig();\n  const app = initializeFirebaseApp(cfg);\n  const auth = getAuth(app);\n  let unwatch: (() => void) | null = null;\n  const unwatchAuth = onAuthStateChanged(auth, user => {\n    unwatch?.(); unwatch = null;\n    if (user?.uid !== uid) return;\n    const db = getAppFirestore(app, cfg);\n    unwatch = onSnapshot(doc(db, 'users', uid, 'preferences', 'office_health'),\n      snap => onData(snap.exists() ? snap.data() as Partial<AlertThresholds> : DEFAULT_PI_THRESHOLDS),\n      err => onError(err));\n  }, err => onError(err));\n  return () => { unwatch?.(); unwatchAuth(); };\n}\n\nexport interface PiTimeSnapshot {\n  deviceId: string;\n  dateKey: string;\n  counters: TimeCalculations;\n}\n\nexport function watchPiTimeStats(uid: string,\n  onData: (snap: PiTimeSnapshot | null) => void,\n  onError: (error: Error) => void) {\n  const cfg = getSavedFirebaseConfig();\n  const app = initializeFirebaseApp(cfg);\n  const auth = getAuth(app);\n  let unwatch: (() => void) | null = null;\n  const unwatchAuth = onAuthStateChanged(auth, user => {\n    unwatch?.(); unwatch = null;\n    if (user?.uid !== uid) return;\n    const db = getAppFirestore(app, cfg);\n    unwatch = onSnapshot(doc(db, 'office_health_time', uid), snap => {\n      if (!snap.exists()) { onData(null); return; }\n      const d = snap.data();\n      const clean = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));\n      onData({deviceId: String(d.deviceId || ''), dateKey: String(d.dateKey || ''),\n        counters: {\n          sittingSeconds: clean(d.sittingSeconds),\n          standingSeconds: clean(d.standingSeconds),\n          movingSeconds: clean(d.movingSeconds),\n          badPostureSeconds: clean(d.badPostureSeconds),\n          continuousSittingSeconds: clean(d.continuousSittingSeconds),\n          continuousStandingSeconds: clean(d.continuousStandingSeconds),\n        }});\n    }, err => onError(err));\n  }, err => onError(err));\n  return () => { unwatch?.(); unwatchAuth(); };\n}\n"

# Validate all anchors before any write.
s=contents['src/types.ts']
s=replace_one(s,'  standingTargetSec: number; // Ngưỡng thời gian đứng khuyến nghị (giây, mặc định 300s = 5 phút)',
'''  standingTargetSec: number; // Mục tiêu đứng (giây)
  standingResetSec?: number; // Đứng liên tục đủ thời gian này mới reset chu kỳ ngồi''','type standing reset')
contents['src/types.ts']=s

s=contents['src/components/AlertSettingsModal.tsx']
s=replace_one(s,'onSave: (newThresholds: AlertThresholds) => void;',
              'onSave: (newThresholds: AlertThresholds) => Promise<void> | void;','modal async save interface')
s=replace_one(s,'  const [testPlaying, setTestPlaying] = useState<string | null>(null);',
'''  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [testPlaying, setTestPlaying] = useState<string | null>(null);''','modal state')
s=replace_one(s,'      setTestPlaying(null);\n      setNotifPermission',
              '      setTestPlaying(null);\n      setSaveError(\'\');\n      setNotifPermission','modal clear error')
s=replace_one(s,'      standingTargetSec: 300,\n      soundEnabled:',
              '      standingTargetSec: 300,\n      standingResetSec: 300,\n      soundEnabled:','modal default reset')
s=replace_one(s,'''  const handleSave = () => {
    onSave(local);
    onClose();
  };''','''  const handleSave = async () => {
    if (isSaving) return;
    const standReset = Number(local.standingResetSec ?? 300);
    if (local.hrMin >= local.hrMax ||
        local.longIncorrectSec < local.incorrectPostureSec ||
        !Number.isFinite(standReset) || standReset < 5 || standReset > 3600 ||
        !Number.isFinite(local.longSittingSec) || local.longSittingSec < 300) {
      setSaveError('Ngưỡng không hợp lệ: HR min phải thấp hơn HR max, thời gian sai tư thế lâu phải lớn hơn ngưỡng cảnh báo, và thời gian đứng reset từ 5–3600 giây.');
      return;
    }
    setSaveError('');
    setIsSaving(true);
    try {
      await onSave({ ...local, standingResetSec: standReset });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };''','modal save await')
s=replace_one(s,'          {/* Sound and Voice toggles */}', '''          {/* Ngưỡng mới: đứng đủ thời gian mới đặt lại ngồi liên tục */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-indigo-900 font-semibold mb-1">
              Đứng liên tục để đặt lại thời gian ngồi (giây):
            </label>
            <input
              type="number" min="5" max="3600" step="5"
              value={local.standingResetSec ?? 300}
              onChange={e => setLocal({ ...local, standingResetSec: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Đứng ít hơn ngưỡng sẽ tạm dừng, không xóa chu kỳ ngồi. Đứng đủ ngưỡng mới reset thời gian ngồi liên tục; tổng thời gian trong ngày vẫn được giữ.
            </span>
          </div>

          {/* Sound and Voice toggles */}''','modal stand reset field')
s=replace_one(s,'        <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-100">',
'''        {saveError && <div role="alert" className="mt-3 text-xs text-rose-700 font-semibold">{saveError}</div>}
        <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-100">''','modal save error')
s=replace_one(s,'              onClick={handleSave}\n              className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500',
              '              onClick={handleSave}\n              disabled={isSaving}\n              className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500','modal disable save')
s=replace_one(s,'              Lưu Cài Đặt\n','              {isSaving ? \'Đang đồng bộ Pi...\' : \'Lưu Cài Đặt\'}\n','modal saving label')
contents['src/components/AlertSettingsModal.tsx']=s

s=contents['src/App.tsx']
s=replace_one(s,"import { AlertSettingsModal } from './components/AlertSettingsModal';",
"""import { AlertSettingsModal } from './components/AlertSettingsModal';
import { savePiSettings, watchPiSettings, watchPiTimeStats, DEFAULT_PI_THRESHOLDS } from './services/piSettingsService';""",'app import')
s=replace_one(s,"localStorage.getItem('theodoisk_thresholds')",
              "localStorage.getItem(`theodoisk_thresholds_${currentUser?.id || 'anonymous'}`)",'app scoped settings load')
s=replace_one(s,'      standingTargetSec: 300,\n      soundEnabled:',
              '      standingTargetSec: 300,\n      standingResetSec: 300,\n      soundEnabled:','app default reset')
s=replace_one(s,'  const isSimulatingRef = useRef(isSimulating);',
'''  const piTimeSourceReadyRef = useRef(false);
  const lastPiTimeRef = useRef<{uid:string; day:string; sitting:number; standing:number; bad:number} | null>(null);
  const isSimulatingRef = useRef(isSimulating);''','app PI time source flag')
s=replace_one(s,"localStorage.setItem('theodoisk_thresholds', JSON.stringify(thresholds));",
              "localStorage.setItem(`theodoisk_thresholds_${currentUser?.id || 'anonymous'}`, JSON.stringify(thresholds));",'app scoped settings save')
s=replace_one(s,'  }, [thresholds]);\n\n\n  // Persist history records',
'''  }, [thresholds, currentUser?.id]);

  // Load the saved settings for the Firebase Auth UID (not global localStorage).
  useEffect(() => {
    if (!currentUser?.id) return;
    const uid = currentUser.id;
    const stop = watchPiSettings(uid, saved => {
      setThresholds(prev => ({ ...prev, ...DEFAULT_PI_THRESHOLDS, ...saved }));
    }, err => console.warn('[PI SETTINGS]', err.message));
    return stop;
  }, [currentUser?.id]);

  const saveThresholdsForPi = async (newThresholds: AlertThresholds) => {
    const uid = currentUserRef.current?.id;
    if (!uid) throw new Error('Cần đăng nhập để đồng bộ ngưỡng với Raspberry Pi.');
    await savePiSettings(uid, newThresholds);
    setThresholds(newThresholds);
  };

  // Pi is the source of truth for activity durations, separate from Face session.
  // Read-only owner-scoped history is retained even when Face is WAIT_LOGIN.
  useEffect(() => {
    piTimeSourceReadyRef.current = false;
    lastPiTimeRef.current = null;
    // Prevent transient display of the previous signed-in user's counters.
    setTimeStats({sittingSeconds:0, standingSeconds:0, movingSeconds:0,
      badPostureSeconds:0, continuousSittingSeconds:0, continuousStandingSeconds:0});
    const deviceForTime = (currentUser?.deviceId || currentUser?.device || '').trim();
    if (!currentUser?.id || !deviceForTime || isSimulating) return;
    const uid = currentUser.id;
    return watchPiTimeStats(uid, snap => {
      if (!snap || snap.deviceId !== deviceForTime) return;
      const counters = snap.counters;
      const prev = lastPiTimeRef.current;
      const currentThresholds = thresholdsRef.current;
      if (prev && prev.uid === uid && prev.day === snap.dateKey) {
        if (prev.bad < currentThresholds.incorrectPostureSec &&
            counters.badPostureSeconds >= currentThresholds.incorrectPostureSec) {
          if (currentThresholds.soundEnabled || currentThresholds.voiceAlertEnabled)
            playErgonomicVoiceAlert('long_incorrect', {
              playChime: currentThresholds.soundEnabled,
              playVoice: currentThresholds.voiceAlertEnabled,
            });
          if (currentThresholds.browserNotificationEnabled) {
            notificationManager.sendNotification({title:'⚠️ Sai tư thế kéo dài',body:'Vui lòng điều chỉnh tư thế ngồi.',tag:'pi-bad-posture'});
          }
        }
        if (prev.sitting < currentThresholds.longSittingSec &&
            counters.continuousSittingSeconds >= currentThresholds.longSittingSec) {
          if (currentThresholds.soundEnabled || currentThresholds.voiceAlertEnabled) playErgonomicVoiceAlert('sit_to_stand_prompt', {
            playChime: currentThresholds.soundEnabled,
            playVoice: currentThresholds.voiceAlertEnabled,
          });
          if (currentThresholds.browserNotificationEnabled) {
            notificationManager.sendNotification({title:'⏰ Đã ngồi quá lâu',body:'Hãy đứng lên và vận động để giảm áp lực cột sống.',tag:'pi-long-sitting'});
          }
        }
        if (prev.standing < currentThresholds.standingTargetSec &&
            counters.continuousStandingSeconds >= currentThresholds.standingTargetSec) {
          if (currentThresholds.soundEnabled || currentThresholds.voiceAlertEnabled) playErgonomicVoiceAlert('standing_goal_reached', {
            playChime: currentThresholds.soundEnabled,
            playVoice: currentThresholds.voiceAlertEnabled,
          });
          if (currentThresholds.browserNotificationEnabled) {
            notificationManager.sendNotification({title:'🎉 Đạt mục tiêu đứng',body:'Bạn đã hoàn thành thời gian đứng được khuyến nghị.',tag:'pi-standing-goal'});
          }
        }
      }
      lastPiTimeRef.current = {
        uid, day:snap.dateKey,
        sitting:counters.continuousSittingSeconds,
        standing:counters.continuousStandingSeconds,
        bad:counters.badPostureSeconds,
      };
      piTimeSourceReadyRef.current = true;
      setTimeStats(old => ({ ...old, ...counters }));
    }, err => console.warn('[PI TIME]', err.message));
  }, [currentUser?.id, currentUser?.deviceId, currentUser?.device, isSimulating]);

  // Persist history records''','app pref and timer subscriptions')
s=replace_one(s,'        const current = telemetryRef.current;\n        const currentThresh = thresholdsRef.current;',
'''        // When connected to Pi's durable time counter, do not also advance
        // a second, browser-only clock (which resets on Face lock/reload).
        if (!isSimulatingRef.current && piTimeSourceReadyRef.current) return prev;
        const current = telemetryRef.current;
        const currentThresh = thresholdsRef.current;''','app stop browser double-count')
s=replace_one(s,'            onSave={setThresholds}', '            onSave={saveThresholdsForPi}','app save cloud')
contents['src/App.tsx']=s

s=contents['src/services/deviceTelemetry.ts']
s=replace_one(s, '    hasAlert: Boolean(raw.hasAlert || raw.has_alert || postureStatus === 1 || postureStatus === 3),',
    '    hasAlert: Boolean(raw.hasAlert || raw.has_alert || raw.hr_alert || raw.spo2_alert || raw.bad_posture_alert || raw.long_sitting_alert || postureStatus === 1 || postureStatus === 3 || postureStatus === 4),',
    'telemetry pi alert flags')
contents['src/services/deviceTelemetry.ts']=s

# Keep Pi as the only authority for automatic verification/logout.
s=contents['src/components/FaceControlPanel.tsx']
if "execute('VERIFY', true)" in s or "execute('LOGOUT', true)" in s:
    marker='  // TỰ ĐỘNG XÁC THỰC KHI CÓ NGƯỜI & TỰ ĐỘNG ĐĂNG XUẤT KHI VẮNG MẶT'
    where=s.find(marker)
    start=s.rfind('  // =========================================================================',0,where) if where >= 0 else -1
    stop=s.find('  async function handleExecuteReset()',where) if where >= 0 else -1
    if start < 0 or stop < 0 or "execute('VERIFY', true)" not in s[start:stop] or "execute('LOGOUT', true)" not in s[start:stop]:
        raise SystemExit('Không thể xác định khối auto verify/logout Web. Chưa ghi file.')
    s=s[:start] + '  // PI_AUTHORITATIVE_AUTO_FACE_V4: Pi tự xác thực/khóa; Web quan sát session/current.\n\n' + s[stop:]
contents['src/components/FaceControlPanel.tsx']=s

# validate files and prepare replacements before writing anything
if not (root/'firestore.rules').exists():
    raise SystemExit('Thiếu firestore.rules; không sửa Web.')
rules_file=(root/'firestore.rules').read_text(encoding='utf-8')
ACTIVITY_RULES = '    // Activity history is written exclusively by the Pi via Admin SDK.\n    match /office_health_time/{userId} {\n      allow get: if isOwner(userId) || isAdmin();\n      allow list: if isAdmin();\n      allow create, update, delete: if false;\n      match /days/{dayId} {\n        allow get, list: if isOwner(userId) || isAdmin();\n        allow create, update, delete: if false;\n      }\n    }\n'
if 'match /office_health_time/{userId}' not in rules_file:
    key='    // 8. Global Safety Net - Default Deny'
    rules_file=replace_one(rules_file,key,ACTIVITY_RULES+key,'Firestore rules')

stamp=datetime.now().strftime('%Y%m%d_%H%M%S')
for f in files+['firestore.rules']:
    shutil.copy2(root/f, root/(f+'.backup_'+stamp))
for f,text in contents.items():
    (root/f).write_text(text,encoding='utf-8')
(root/'firestore.rules').write_text(rules_file,encoding='utf-8')
(root/'src/services/piSettingsService.ts').write_text(NEW_SERVICE,encoding='utf-8')
print('ĐÃ VÁ WEB thành công. Đã sao lưu App.tsx, AlertSettingsModal.tsx, types.ts và firestore.rules.')
print('Tiếp theo: npm run typecheck && npm run build')
print('Sau đó deploy cả Web và firestore.rules. Chạy Pi mới ở ver4.')
