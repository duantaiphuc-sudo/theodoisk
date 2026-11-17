import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Settings,
  Volume2,
  RotateCcw,
  Mic,
  Play,
  Radio,
  Bell,
  BellRing,
  CheckCircle2,
  Users,
  Sparkles,
  Loader2,
  Clock,
  ShieldCheck,
  Database,
} from 'lucide-react';
import { AlertThresholds, AuthUser } from '../types';
import {
  playAlertChime,
  playErgonomicVoiceAlert,
  playFingerPlacedAlert,
  playMeasuringPulseSound,
  playMeasureCompleteAlert,
  playFingerRemovedAlert,
  playStrangerAlert,
  playCameraErrorAlert,
  playWelcomeBackAlert,
  playPostureCorrectAlert,
  playStandingActiveAlert,
  playUserAbsentAlert,
  playFaceEnrolledAlert,
  playFaceVerifiedAlert,
  playBiometricReminderAlert,
} from '../services/sound';
import { notificationManager } from '../services/notificationService';
import {
  DEFAULT_PI_THRESHOLDS,
  fetchPiSettingsWithMeta,
  PiSettingsServerMeta,
} from '../services/piSettingsService';
import { calculateAdaptiveThresholds } from '../utils/adaptiveThresholds';

interface AlertSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  thresholds: AlertThresholds;
  onSave: (newThresholds: AlertThresholds) => Promise<void> | void;
  currentUser?: AuthUser | null;
  allUsers?: AuthUser[];
  isManager?: boolean;
  initialTargetUserId?: string;
  onSaveForUser?: (targetUid: string, newThresholds: AlertThresholds) => Promise<void>;
}

function formatDurationHint(secondsRaw?: number): string {
  const sec = Math.max(0, Number(secondsRaw) || 0);
  if (sec === 0) return 'Đã tắt (0s)';
  if (sec < 60) return `${sec} giây`;
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${mins}p ${rem}s` : `${mins} phút`;
}

export const AlertSettingsModal: React.FC<AlertSettingsModalProps> = ({
  isOpen,
  onClose,
  thresholds,
  onSave,
  currentUser,
  allUsers = [],
  isManager = false,
  initialTargetUserId,
  onSaveForUser,
}) => {
  const defaultUid = initialTargetUserId || currentUser?.id || '';
  const [targetUserId, setTargetUserId] = useState<string>(defaultUid);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [adaptiveNote, setAdaptiveNote] = useState<string | null>(null);
  const [serverMeta, setServerMeta] = useState<PiSettingsServerMeta | null>(null);

  const [local, setLocal] = useState<AlertThresholds>({
    ...DEFAULT_PI_THRESHOLDS,
    ...thresholds,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [testPlaying, setTestPlaying] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<string>(() => notificationManager.getPermission());
  const [testNotifSent, setTestNotifSent] = useState(false);

  const userOptions = useMemo(() => {
    const map = new Map<string, AuthUser>();
    if (currentUser?.id) {
      map.set(currentUser.id, currentUser);
    }
    for (const u of allUsers) {
      if (u?.id && !map.has(u.id)) {
        map.set(u.id, u);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.id === currentUser?.id) return -1;
      if (b.id === currentUser?.id) return 1;
      return (a.fullName || a.email || '').localeCompare(b.fullName || b.email || '');
    });
  }, [allUsers, currentUser]);

  const selectedTargetUser = useMemo(
    () => userOptions.find(u => u.id === targetUserId) || currentUser || null,
    [userOptions, targetUserId, currentUser]
  );

  // Sync target user only when modal opens (never reset mid-edit on background snapshots)
  useEffect(() => {
    if (!isOpen) return;
    const nextUid = initialTargetUserId || currentUser?.id || '';
    setTargetUserId(nextUid);
    setTestPlaying(null);
    setSaveError('');
    setSaveSuccess('');
    setAdaptiveNote(null);
    setNotifPermission(notificationManager.getPermission());
    setTestNotifSent(false);
  }, [isOpen, initialTargetUserId, currentUser?.id]);

  // Fetch live Firestore server state whenever targetUserId changes
  useEffect(() => {
    if (!isOpen || !targetUserId) return;

    let cancelled = false;
    setIsLoadingUser(true);
    setSaveError('');
    setSaveSuccess('');
    setAdaptiveNote(null);

    if (targetUserId === currentUser?.id) {
      setLocal({
        ...DEFAULT_PI_THRESHOLDS,
        ...thresholds,
      });
    }

    fetchPiSettingsWithMeta(targetUserId)
      .then(meta => {
        if (!cancelled) {
          setServerMeta(meta);
          setLocal({
            ...DEFAULT_PI_THRESHOLDS,
            ...meta.settings,
          });
        }
      })
      .catch(err => {
        if (!cancelled) {
          setServerMeta(null);
          setSaveError(
            err instanceof Error
              ? `Không thể đọc ngưỡng từ Firestore: ${err.message}`
              : 'Không thể đọc ngưỡng từ Firestore.'
          );
          if (targetUserId === currentUser?.id) {
            setLocal({ ...DEFAULT_PI_THRESHOLDS, ...thresholds });
          } else {
            setLocal({ ...DEFAULT_PI_THRESHOLDS });
          }
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingUser(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetUserId, currentUser?.id]);

  if (!isOpen) return null;

  const isEditingOtherUser = Boolean(isManager && targetUserId && currentUser?.id && targetUserId !== currentUser.id);

  const handleRequestNotificationPermission = async () => {
    const perm = await notificationManager.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      notificationManager.sendTestNotification();
      setTestNotifSent(true);
      setTimeout(() => setTestNotifSent(false), 4000);
    }
  };

  const handleSendTestNotification = () => {
    notificationManager.sendTestNotification();
    setTestNotifSent(true);
    setTimeout(() => setTestNotifSent(false), 4000);
  };

  const handleReset = () => {
    setLocal({ ...DEFAULT_PI_THRESHOLDS });
    setAdaptiveNote(null);
  };

  const handleApplyAdaptiveForTarget = () => {
    if (!selectedTargetUser) return;
    const result = calculateAdaptiveThresholds(selectedTargetUser);
    setLocal(prev => ({
      ...prev,
      ...result.thresholds,
      soundEnabled: prev.soundEnabled,
      voiceAlertEnabled: prev.voiceAlertEnabled,
      outOfZoneAlertEnabled: prev.outOfZoneAlertEnabled,
      browserNotificationEnabled: prev.browserNotificationEnabled,
    }));
    setAdaptiveNote(result.clinicalSummary);
  };

  const handleTestVoice = (
    type:
      | 'posture_incorrect'
      | 'long_incorrect'
      | 'out_of_zone'
      | 'long_sitting'
      | 'sit_to_stand_prompt'
      | 'standing_goal_reached'
      | 'vital_abnormal'
      | 'biometric_reminder'
      | 'finger_placed'
      | 'measuring_pulse'
      | 'measure_complete'
      | 'finger_removed'
      | 'stranger_detected'
      | 'camera_error'
      | 'welcome_back'
      | 'user_absent'
      | 'posture_correct'
      | 'standing_active'
      | 'face_enrolled'
      | 'face_verified'
      | 'chime'
  ) => {
    setTestPlaying(type);
    if (type === 'chime') {
      playAlertChime('warning');
      setTimeout(() => setTestPlaying(null), 800);
    } else if (type === 'measuring_pulse') {
      playMeasuringPulseSound();
      setTimeout(() => setTestPlaying(null), 700);
    } else if (type === 'finger_placed') {
      playFingerPlacedAlert({ playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 3200);
    } else if (type === 'measure_complete') {
      playMeasureCompleteAlert(75, 98, { playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 4000);
    } else if (type === 'finger_removed') {
      playFingerRemovedAlert({ playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 2800);
    } else if (type === 'biometric_reminder') {
      playBiometricReminderAlert({ playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 2600);
    } else if (type === 'vital_abnormal') {
      playErgonomicVoiceAlert('vital_abnormal', {
        playChime: local.soundEnabled,
        playVoice: local.voiceAlertEnabled,
      });
      setTimeout(() => setTestPlaying(null), 3200);
    } else if (type === 'stranger_detected') {
      playStrangerAlert({ playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 4000);
    } else if (type === 'camera_error') {
      playCameraErrorAlert({ playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 3200);
    } else if (type === 'welcome_back') {
      playWelcomeBackAlert('bạn', { playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 3200);
    } else if (type === 'user_absent') {
      playUserAbsentAlert({ playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 3000);
    } else if (type === 'face_enrolled') {
      playFaceEnrolledAlert({ playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 3000);
    } else if (type === 'face_verified') {
      playFaceVerifiedAlert({ playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 3000);
    } else if (type === 'posture_correct') {
      playPostureCorrectAlert({ playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 2500);
    } else if (type === 'standing_active') {
      playStandingActiveAlert({ playChime: local.soundEnabled, playVoice: local.voiceAlertEnabled });
      setTimeout(() => setTestPlaying(null), 2500);
    } else if (type === 'long_incorrect') {
      playErgonomicVoiceAlert('long_incorrect', {
        playChime: local.soundEnabled,
        playVoice: local.voiceAlertEnabled,
      });
      setTimeout(() => setTestPlaying(null), 3000);
    } else if (type === 'sit_to_stand_prompt' || type === 'long_sitting') {
      playErgonomicVoiceAlert('long_sitting', {
        playChime: local.soundEnabled,
        playVoice: local.voiceAlertEnabled,
      });
      setTimeout(() => setTestPlaying(null), 2500);
    } else if (type === 'standing_goal_reached') {
      playErgonomicVoiceAlert('standing_goal_reached', {
        playChime: local.soundEnabled,
        playVoice: local.voiceAlertEnabled,
      });
      setTimeout(() => setTestPlaying(null), 2500);
    } else {
      playErgonomicVoiceAlert(type, {
        playChime: local.soundEnabled,
        playVoice: local.voiceAlertEnabled,
      });
      setTimeout(() => setTestPlaying(null), 3000);
    }
  };

  const handleSave = async () => {
    if (isSaving || isLoadingUser) return;
    setSaveError('');
    setSaveSuccess('');
    setIsSaving(true);
    try {
      const standReset = Number(local.standingResetSec ?? 300);
      const bioReminder = Number(local.biometricReminderSec ?? 1800);
      const longInc = Number(
        local.longIncorrectSec !== undefined &&
          local.longIncorrectSec !== null &&
          !isNaN(Number(local.longIncorrectSec))
          ? Number(local.longIncorrectSec)
          : Math.max(Number(local.incorrectPostureSec || 10) * 2, 60)
      );

      const payload: AlertThresholds = {
        ...local,
        incorrectPostureSec: Number(local.incorrectPostureSec || 0),
        longIncorrectSec: longInc,
        longSittingSec: Number(local.longSittingSec || 0),
        standingTargetSec: Number(local.standingTargetSec || 0),
        standingResetSec: Number.isFinite(standReset) ? standReset : 300,
        biometricReminderSec: Number.isFinite(bioReminder) ? bioReminder : 1800,
        hrMin: Number(local.hrMin || 0),
        hrMax: Number(local.hrMax || 0),
        spo2Min: Number(local.spo2Min || 0),
      };

      if (isManager && onSaveForUser && targetUserId) {
        await onSaveForUser(targetUserId, payload);
      } else {
        await onSave(payload);
      }

      const freshMeta = targetUserId ? await fetchPiSettingsWithMeta(targetUserId).catch(() => null) : null;
      if (freshMeta) {
        setServerMeta(freshMeta);
      }

      setSaveSuccess(
        isEditingOtherUser
          ? `✅ Đã đồng bộ lên Firestore (users/${targetUserId}/preferences/office_health) cho ${selectedTargetUser?.fullName || 'người dùng'}.`
          : `✅ Đã đồng bộ lên Firestore (users/${targetUserId || currentUser?.id}/preferences/office_health) cho Raspberry Pi.`
      );
      setTimeout(() => {
        onClose();
      }, 750);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white border-2 border-slate-800 shadow-[0_8px_0_#1E293B] text-slate-900 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-slate-800 bg-[#FDFBF7] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#BAE0EC] text-slate-900 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Cài Đặt Ngưỡng Cảnh Báo & Nhắc Nhở</h3>
              <p className="text-xs text-slate-600">
                Thiết lập tiêu chuẩn sinh trắc học, nhắc đo định kỳ và chu kỳ công thái học
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Đóng cửa sổ"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 text-xs">
          {/* Admin Multi-User Selector */}
          {isManager && userOptions.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[#BAE0EC]/40 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white text-slate-900 flex items-center justify-center border-[1.5px] border-slate-800 shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <span>Quản trị ngưỡng theo tài khoản</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                    </div>
                    <p className="text-[11px] text-slate-700">
                      Xem & điều chỉnh ngưỡng cá nhân hóa cho từng nhân viên trên Raspberry Pi
                    </p>
                  </div>
                </div>

                {selectedTargetUser && (
                  <button
                    type="button"
                    onClick={handleApplyAdaptiveForTarget}
                    disabled={isLoadingUser}
                    className="h-9 px-3 rounded-xl tactile-btn-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    <span className="whitespace-nowrap">Gợi ý theo hồ sơ</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <select
                  value={targetUserId}
                  onChange={e => setTargetUserId(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  {userOptions.map(u => {
                    const isSelf = u.id === currentUser?.id;
                    const devLabel = u.deviceId || u.device ? ` • ${u.deviceId || u.device}` : '';
                    return (
                      <option key={u.id} value={u.id}>
                        {u.fullName || u.username || u.email} ({u.email}){isSelf ? ' — Tài khoản của bạn' : devLabel}
                      </option>
                    );
                  })}
                </select>

                {selectedTargetUser && (
                  <div className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-white border-[1.5px] border-slate-800 text-[11px] font-mono font-bold text-slate-900 shrink-0">
                    <Radio
                      className={`w-3.5 h-3.5 ${
                        selectedTargetUser.deviceId || selectedTargetUser.device ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    />
                    <span className="whitespace-nowrap">
                      {selectedTargetUser.deviceId || selectedTargetUser.device || 'Chưa gán Pi'}
                    </span>
                  </div>
                )}
              </div>

              {isLoadingUser && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                  <span>Đang tải ngưỡng đã lưu từ Firestore...</span>
                </div>
              )}

              {adaptiveNote && (
                <div className="p-2.5 rounded-xl bg-white border-[1.5px] border-slate-800 text-[11px] text-slate-900 font-medium leading-relaxed">
                  {adaptiveNote}
                </div>
              )}
            </div>
          )}

          {/* Nhóm 1: Tiêu chuẩn Sinh trắc học & Nhắc đo định kỳ (4 cột cân đối) */}
          <div className="p-3.5 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] space-y-2.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-slate-800"></span>
              <span>1. Tiêu chuẩn sinh trắc học & nhắc đo định kỳ (MAX30102)</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-stretch">
              <div className="flex flex-col justify-between p-2.5 rounded-xl bg-white border-[1.5px] border-slate-800">
                <label className="block text-slate-800 font-bold mb-1.5 text-[11px] whitespace-nowrap">
                  HR min (BPM)
                </label>
                <input
                  type="number"
                  value={local.hrMin ?? ''}
                  onChange={e =>
                    setLocal({ ...local, hrMin: e.target.value === '' ? ('' as any) : Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-lg bg-[#FDFBF7] border-[1.5px] border-slate-800 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  placeholder="50"
                />
                <span className="text-[10px] text-slate-600 mt-1.5 block whitespace-nowrap">Nhịp tim tối thiểu</span>
              </div>

              <div className="flex flex-col justify-between p-2.5 rounded-xl bg-white border-[1.5px] border-slate-800">
                <label className="block text-slate-800 font-bold mb-1.5 text-[11px] whitespace-nowrap">
                  HR max (BPM)
                </label>
                <input
                  type="number"
                  value={local.hrMax ?? ''}
                  onChange={e =>
                    setLocal({ ...local, hrMax: e.target.value === '' ? ('' as any) : Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-lg bg-[#FDFBF7] border-[1.5px] border-slate-800 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  placeholder="110"
                />
                <span className="text-[10px] text-slate-600 mt-1.5 block whitespace-nowrap">Nhịp tim tối đa</span>
              </div>

              <div className="flex flex-col justify-between p-2.5 rounded-xl bg-white border-[1.5px] border-slate-800">
                <label className="block text-slate-800 font-bold mb-1.5 text-[11px] whitespace-nowrap">
                  SpO₂ min (%)
                </label>
                <input
                  type="number"
                  value={local.spo2Min ?? ''}
                  onChange={e =>
                    setLocal({ ...local, spo2Min: e.target.value === '' ? ('' as any) : Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-lg bg-[#FDFBF7] border-[1.5px] border-slate-800 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  placeholder="94"
                />
                <span className="text-[10px] text-slate-600 mt-1.5 block whitespace-nowrap">Oxy an toàn</span>
              </div>

              <div className="flex flex-col justify-between p-2.5 rounded-xl bg-[#FBC2C8]/40 border-[1.5px] border-slate-800">
                <label className="flex items-center gap-1 text-slate-900 font-bold mb-1.5 text-[11px] whitespace-nowrap">
                  <Clock className="w-3 h-3 text-rose-700 shrink-0" />
                  <span>Nhắc đo (giây)</span>
                </label>
                <input
                  type="number"
                  value={local.biometricReminderSec ?? ''}
                  onChange={e =>
                    setLocal({
                      ...local,
                      biometricReminderSec: e.target.value === '' ? ('' as any) : Number(e.target.value),
                    })
                  }
                  className="w-full h-9 px-2.5 rounded-lg bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  placeholder="1800"
                />
                <span className="text-[10px] text-rose-900 font-bold mt-1.5 block whitespace-nowrap">
                  {Number(local.biometricReminderSec ?? 0) === 0
                    ? '0 = Tắt nhắc đo'
                    : `${formatDurationHint(local.biometricReminderSec)} / lần`}
                </span>
              </div>
            </div>
          </div>

          {/* Nhóm 2: Cảnh báo tư thế ngồi (2 cột cân đối) */}
          <div className="p-3.5 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] space-y-2.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-slate-800"></span>
              <span>2. Thời gian cảnh báo tư thế (Posture)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
              <div className="flex flex-col justify-between p-2.5 rounded-xl bg-white border-[1.5px] border-slate-800">
                <label className="block text-slate-800 font-bold mb-1.5 text-[11px] whitespace-nowrap">
                  Sai tư thế (giây)
                </label>
                <input
                  type="number"
                  value={local.incorrectPostureSec ?? ''}
                  onChange={e =>
                    setLocal({
                      ...local,
                      incorrectPostureSec: e.target.value === '' ? ('' as any) : Number(e.target.value),
                    })
                  }
                  className="w-full h-9 px-3 rounded-lg bg-[#FDFBF7] border-[1.5px] border-slate-800 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  placeholder="30"
                />
                <span className="text-[10px] text-slate-600 mt-1.5 block">
                  {local.incorrectPostureSec || 0}s bắt đầu nhắc tư thế
                </span>
              </div>

              <div className="flex flex-col justify-between p-2.5 rounded-xl bg-[#FBC2C8]/40 border-[1.5px] border-slate-800">
                <label className="block text-slate-900 font-bold mb-1.5 text-[11px] whitespace-nowrap">
                  Sai tư thế quá lâu (giây)
                </label>
                <input
                  type="number"
                  value={local.longIncorrectSec ?? ''}
                  onChange={e =>
                    setLocal({
                      ...local,
                      longIncorrectSec: e.target.value === '' ? ('' as any) : Number(e.target.value),
                    })
                  }
                  className="w-full h-9 px-3 rounded-lg bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  placeholder="120"
                />
                <span className="text-[10px] text-rose-900 font-bold mt-1.5 block">
                  {local.longIncorrectSec || 0}s báo động sai lâu (Mã 3)
                </span>
              </div>
            </div>
          </div>

          {/* Nhóm 3: Chu kỳ làm việc Đứng - Ngồi Sit-to-Stand (3 cột thẳng hàng) */}
          <div className="p-3.5 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] space-y-2.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 border border-slate-800"></span>
              <span>3. Chu kỳ làm việc Đứng - Ngồi (Sit-to-Stand)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-stretch">
              <div className="flex flex-col justify-between p-2.5 rounded-xl bg-white border-[1.5px] border-slate-800">
                <label className="block text-slate-800 font-bold mb-1.5 text-[11px] whitespace-nowrap">
                  Ngồi lâu (giây)
                </label>
                <input
                  type="number"
                  value={local.longSittingSec ?? ''}
                  onChange={e =>
                    setLocal({ ...local, longSittingSec: e.target.value === '' ? ('' as any) : Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-lg bg-[#FDFBF7] border-[1.5px] border-slate-800 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  placeholder="3600"
                />
                <span className="text-[10px] text-slate-600 mt-1.5 block whitespace-nowrap">
                  {formatDurationHint(local.longSittingSec)} ngồi
                </span>
              </div>

              <div className="flex flex-col justify-between p-2.5 rounded-xl bg-[#BAE0EC]/40 border-[1.5px] border-slate-800">
                <label className="block text-slate-900 font-bold mb-1.5 text-[11px] whitespace-nowrap">
                  Mục tiêu đứng (giây)
                </label>
                <input
                  type="number"
                  value={local.standingTargetSec ?? ''}
                  onChange={e =>
                    setLocal({
                      ...local,
                      standingTargetSec: e.target.value === '' ? ('' as any) : Number(e.target.value),
                    })
                  }
                  className="w-full h-9 px-2.5 rounded-lg bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  placeholder="300"
                />
                <span className="text-[10px] text-slate-800 font-bold mt-1.5 block whitespace-nowrap">
                  {formatDurationHint(local.standingTargetSec)} đứng
                </span>
              </div>

              <div className="flex flex-col justify-between p-2.5 rounded-xl bg-[#BAE0EC]/40 border-[1.5px] border-slate-800">
                <label className="block text-slate-900 font-bold mb-1.5 text-[11px] whitespace-nowrap">
                  Đứng reset ngồi (giây)
                </label>
                <input
                  type="number"
                  value={local.standingResetSec ?? ''}
                  onChange={e =>
                    setLocal({
                      ...local,
                      standingResetSec: e.target.value === '' ? ('' as any) : Number(e.target.value),
                    })
                  }
                  className="w-full h-9 px-2.5 rounded-lg bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  placeholder="300"
                />
                <span className="text-[10px] text-slate-800 font-bold mt-1.5 block whitespace-nowrap">
                  {local.standingResetSec ?? 300}s để xóa ngồi
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              * Khi đứng ít hơn số giây reset, chu kỳ ngồi chỉ tạm dừng. Đứng đủ thời gian mới reset bộ đếm ngồi liên tục về 0.
            </p>
          </div>

          {/* Nhóm 4: Bật / Tắt âm thanh, giọng nói và thông báo (Lưới 2x2 cân đối) */}
          <div className="p-3.5 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border-[1.5px] border-slate-800 hover:bg-[#FDFBF7] cursor-pointer select-none transition">
                <input
                  type="checkbox"
                  checked={local.soundEnabled}
                  onChange={e => setLocal({ ...local, soundEnabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-[#16B364] cursor-pointer shrink-0"
                />
                <Volume2 className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="text-slate-900 font-bold text-xs">Chuông bíp cảnh báo</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border-[1.5px] border-slate-800 hover:bg-[#FDFBF7] cursor-pointer select-none transition">
                <input
                  type="checkbox"
                  checked={local.voiceAlertEnabled}
                  onChange={e => setLocal({ ...local, voiceAlertEnabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-[#16B364] cursor-pointer shrink-0"
                />
                <Mic className="w-4 h-4 text-sky-700 shrink-0" />
                <span className="text-slate-900 font-bold text-xs">Giọng nói tiếng Việt (TTS)</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border-[1.5px] border-slate-800 hover:bg-[#FDFBF7] cursor-pointer select-none transition">
                <input
                  type="checkbox"
                  checked={local.outOfZoneAlertEnabled}
                  onChange={e => setLocal({ ...local, outOfZoneAlertEnabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-[#16B364] cursor-pointer shrink-0"
                />
                <Radio className="w-4 h-4 text-indigo-700 shrink-0" />
                <span className="text-slate-900 font-bold text-xs">Nhắc khi rời vùng camera AI</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border-[1.5px] border-slate-800 hover:bg-[#FDFBF7] cursor-pointer select-none transition">
                <input
                  type="checkbox"
                  checked={local.browserNotificationEnabled}
                  onChange={e => setLocal({ ...local, browserNotificationEnabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-[#16B364] cursor-pointer shrink-0"
                />
                <Bell className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-slate-900 font-bold text-xs">Pop-up trình duyệt khi ẩn tab</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-300">
              <p className="text-[11px] text-slate-600">
                Hiển thị cửa sổ thông báo hệ điều hành ngay cả khi thu nhỏ trình duyệt.
              </p>
              {notifPermission === 'granted' ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-900 bg-[#B2F5BE] px-2.5 py-1 rounded-lg border-[1.5px] border-slate-800 whitespace-nowrap">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-800" />
                    Đã cấp quyền
                  </span>
                  <button
                    type="button"
                    onClick={handleSendTestNotification}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg tactile-btn-white cursor-pointer flex items-center gap-1 whitespace-nowrap"
                  >
                    <BellRing className="w-3 h-3 text-emerald-700" />
                    <span>{testNotifSent ? '✅ Đã gửi!' : 'Thử pop-up'}</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestNotificationPermission}
                  className="px-3 py-1.5 text-[11px] font-bold rounded-xl tactile-btn-primary cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>Cho phép nhận thông báo</span>
                </button>
              )}
            </div>
          </div>

          {/* Interactive Audio & Voice Test Section (Các hàng 3x2 cân đối) */}
          <div className="p-3.5 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-900 flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-emerald-700" />
                Kiểm tra loa & âm thanh tương tác
              </span>
              <span className="text-[10px] text-slate-600 font-semibold">Bấm từng nút để nghe thử</span>
            </div>

            {/* 1. Nhóm âm thanh cảm biến MAX30102 (6 nút = 3x2) */}
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-900 mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#16B364] border border-slate-800"></span>
                <span>Cảm biến MAX30102 (Nhịp tim & SpO₂)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleTestVoice('finger_placed')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'finger_placed'
                      ? 'bg-[#B2F5BE] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">👆 Đặt tay đo</span>
                  <Play className="w-3 h-3 text-emerald-700 shrink-0 ml-1" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('measuring_pulse')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'measuring_pulse'
                      ? 'bg-[#FBC2C8] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">💓 Đang đo</span>
                  <Play className="w-3 h-3 text-rose-600 shrink-0 ml-1" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('measure_complete')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'measure_complete'
                      ? 'bg-[#BAE0EC] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🎯 Đã đo xong</span>
                  <Play className="w-3 h-3 text-sky-700 shrink-0 ml-1" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('finger_removed')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'finger_removed'
                      ? 'bg-[#FAF7F0] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🖐️ Đã bỏ tay</span>
                  <Play className="w-3 h-3 text-slate-600 shrink-0 ml-1" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('biometric_reminder')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] ${
                    testPlaying === 'biometric_reminder'
                      ? 'bg-[#FDE68A] text-slate-900 animate-pulse'
                      : 'bg-[#FDE68A]/70 hover:bg-[#FDE68A] text-slate-900'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">⏰ Nhắc đo định kỳ</span>
                  <Play className="w-3 h-3 text-amber-800 shrink-0 ml-1" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('vital_abnormal')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'vital_abnormal'
                      ? 'bg-[#FBC2C8] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🚨 Chỉ số bất thường</span>
                  <Play className="w-3 h-3 text-rose-700 shrink-0 ml-1" />
                </button>
              </div>
            </div>

            {/* 2. Nhóm An ninh, Camera & Hiện diện (6 nút = 3x2) */}
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-900 mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 border border-slate-800"></span>
                <span>An ninh, Camera & Hiện diện</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleTestVoice('stranger_detected')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'stranger_detected'
                      ? 'bg-[#FBC2C8] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🚨 Người lạ</span>
                  <Play className="w-3 h-3 text-rose-700 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('camera_error')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'camera_error'
                      ? 'bg-[#FDE68A] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🔌 Lỗi Cam</span>
                  <Play className="w-3 h-3 text-amber-700 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('welcome_back')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'welcome_back'
                      ? 'bg-[#BAE0EC] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🪑 Quay lại</span>
                  <Play className="w-3 h-3 text-indigo-700 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('user_absent')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'user_absent'
                      ? 'bg-[#FAF7F0] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🚪 Vắng mặt</span>
                  <Play className="w-3 h-3 text-slate-600 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('face_enrolled')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'face_enrolled'
                      ? 'bg-[#B2F5BE] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">📸 ĐK xong</span>
                  <Play className="w-3 h-3 text-emerald-700 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('face_verified')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'face_verified'
                      ? 'bg-[#BAE0EC] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🔑 Đã xác thực</span>
                  <Play className="w-3 h-3 text-sky-700 shrink-0" />
                </button>
              </div>
            </div>

            {/* 3. Nhóm nhắc nhở Công thái học (6 nút = 3x2) */}
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-900 mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500 border border-slate-800"></span>
                <span>Nhắc nhở Công thái học & Tư thế</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleTestVoice('posture_correct')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'posture_correct'
                      ? 'bg-[#B2F5BE] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">✅ Ngồi đúng</span>
                  <Play className="w-3 h-3 text-emerald-700 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('posture_incorrect')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'posture_incorrect'
                      ? 'bg-[#FBC2C8] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🗣️ Ngồi thẳng</span>
                  <Play className="w-3 h-3 text-slate-600 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('long_incorrect')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'long_incorrect'
                      ? 'bg-[#FBC2C8] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">⚠️ Sai tư thế lâu</span>
                  <Play className="w-3 h-3 text-rose-600 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('standing_active')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'standing_active'
                      ? 'bg-[#BAE0EC] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🧍 Đang đứng</span>
                  <Play className="w-3 h-3 text-indigo-700 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('long_sitting')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'long_sitting' || testPlaying === 'sit_to_stand_prompt'
                      ? 'bg-[#FDE68A] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🚶 Ngồi lâu</span>
                  <Play className="w-3 h-3 text-amber-700 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('standing_goal_reached')}
                  disabled={testPlaying !== null}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-bold text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'standing_goal_reached'
                      ? 'bg-[#B2F5BE] border-2 border-slate-800 text-slate-900 animate-pulse'
                      : 'tactile-btn-white'
                  }`}
                >
                  <span className="truncate whitespace-nowrap">🏆 Đạt mục tiêu</span>
                  <Play className="w-3 h-3 text-emerald-700 shrink-0" />
                </button>
              </div>
            </div>
          </div>

          {/* Firestore Sync Status Strip */}
          {targetUserId && (
            <div className="p-3 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-800 min-w-0 font-semibold">
                <Database className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span className="font-mono truncate">users/{targetUserId}/preferences/office_health</span>
              </div>
              {serverMeta ? (
                serverMeta.existsOnServer && serverMeta.missingKeys.length === 0 ? (
                  <span className="text-emerald-800 font-bold whitespace-nowrap">
                    ✅ Đã đồng bộ{serverMeta.updatedAtIso ? ` (${new Date(serverMeta.updatedAtIso).toLocaleTimeString('vi-VN')})` : ''}
                  </span>
                ) : (
                  <span className="text-amber-800 font-bold whitespace-nowrap">
                    ⚠️ Thiếu {serverMeta.missingKeys.length} field mới trên Firestore — bấm Lưu để đồng bộ
                  </span>
                )
              ) : null}
            </div>
          )}

          {saveError && (
            <div role="alert" className="p-3 rounded-xl bg-[#FBC2C8]/75 border-[1.5px] border-slate-800 text-xs text-slate-900 font-bold">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="p-3 rounded-xl bg-[#B2F5BE] border-[1.5px] border-slate-800 text-xs text-slate-900 font-bold">
              {saveSuccess}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t-2 border-slate-800 bg-[#FDFBF7] shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold tactile-btn-white cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Mặc định</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl text-xs font-bold tactile-btn-white cursor-pointer whitespace-nowrap"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoadingUser}
              className="h-10 px-5 rounded-xl text-xs font-extrabold tactile-btn-primary cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isSaving
                ? 'Đang đồng bộ Pi...'
                : isEditingOtherUser
                ? 'Lưu cho tài khoản này'
                : 'Lưu Cài Đặt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
