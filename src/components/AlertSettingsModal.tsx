import React, { useState } from 'react';
import { X, Settings, Volume2, RotateCcw, Mic, Play, Radio, Bell, BellRing, CheckCircle2 } from 'lucide-react';
import { AlertThresholds } from '../types';
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
  playFaceVerifiedAlert
} from '../services/sound';
import { notificationManager } from '../services/notificationService';

interface AlertSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  thresholds: AlertThresholds;
  onSave: (newThresholds: AlertThresholds) => Promise<void> | void;
}

export const AlertSettingsModal: React.FC<AlertSettingsModalProps> = ({
  isOpen,
  onClose,
  thresholds,
  onSave,
}) => {
  const [local, setLocal] = useState<AlertThresholds>({ 
    voiceAlertEnabled: true,
    outOfZoneAlertEnabled: true,
    browserNotificationEnabled: true,
    ...thresholds 
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [testPlaying, setTestPlaying] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<string>(() => notificationManager.getPermission());
  const [testNotifSent, setTestNotifSent] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setLocal({ 
        voiceAlertEnabled: true,
        outOfZoneAlertEnabled: true,
        browserNotificationEnabled: true,
        ...thresholds 
      });
      setTestPlaying(null);
      setSaveError('');
      setNotifPermission(notificationManager.getPermission());
      setTestNotifSent(false);
    }
  }, [isOpen, thresholds]);

  if (!isOpen) return null;

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
    setLocal({
      hrMin: 50,
      hrMax: 110,
      spo2Min: 94,
      incorrectPostureSec: 30,
      longIncorrectSec: 120,
      longSittingSec: 3600,
      standingTargetSec: 300,
      standingResetSec: 300,
      soundEnabled: true,
      voiceAlertEnabled: true,
      outOfZoneAlertEnabled: true,
      browserNotificationEnabled: true,
    });
  };

  const handleTestVoice = (type: 
    | 'posture_incorrect' 
    | 'out_of_zone' 
    | 'long_sitting' 
    | 'sit_to_stand_prompt' 
    | 'standing_goal_reached' 
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
    } else if (type === 'sit_to_stand_prompt' || type === 'long_sitting') {
      playErgonomicVoiceAlert('long_sitting', {
        playChime: local.soundEnabled,
        playVoice: local.voiceAlertEnabled
      });
      setTimeout(() => setTestPlaying(null), 2500);
    } else if (type === 'standing_goal_reached') {
      playErgonomicVoiceAlert('standing_goal_reached', {
        playChime: local.soundEnabled,
        playVoice: local.voiceAlertEnabled
      });
      setTimeout(() => setTestPlaying(null), 2500);
    } else {
      playErgonomicVoiceAlert(type, { playChime: local.soundEnabled });
      setTimeout(() => setTestPlaying(null), 3000);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setSaveError('');
    setIsSaving(true);
    try {
      const standReset = Number(local.standingResetSec ?? 300);
      const longInc = Number(
        local.longIncorrectSec !== undefined && local.longIncorrectSec !== null && !isNaN(Number(local.longIncorrectSec))
          ? Number(local.longIncorrectSec)
          : Math.max(Number(local.incorrectPostureSec || 10) * 2, 60)
      );
      await onSave({
        ...local,
        incorrectPostureSec: Number(local.incorrectPostureSec || 0),
        longIncorrectSec: longInc,
        longSittingSec: Number(local.longSittingSec || 0),
        standingTargetSec: Number(local.standingTargetSec || 0),
        standingResetSec: Number.isFinite(standReset) ? standReset : 300,
        hrMin: Number(local.hrMin || 0),
        hrMax: Number(local.hrMax || 0),
        spo2Min: Number(local.spo2Min || 0),
      });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-2xl bg-white border border-slate-200 p-4 sm:p-6 shadow-2xl text-slate-800 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-xs z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Cài Đặt Ngưỡng Cảnh Báo</h3>
              <p className="text-xs text-slate-500">Thiết lập linh hoạt các tiêu chuẩn sinh trắc học và thời gian</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3.5 text-xs">
          {/* Nhóm 1: Tiêu chuẩn Sinh trắc học */}
          <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/90 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              <span>1. Tiêu chuẩn sinh trắc học (MAX30102)</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                  HR min (BPM):
                </label>
                <input
                  type="number"
                  value={local.hrMin ?? ''}
                  onChange={e => setLocal({ ...local, hrMin: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 transition"
                  placeholder="50"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                  HR max (BPM):
                </label>
                <input
                  type="number"
                  value={local.hrMax ?? ''}
                  onChange={e => setLocal({ ...local, hrMax: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 transition"
                  placeholder="110"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                  SpO₂ min (%):
                </label>
                <input
                  type="number"
                  value={local.spo2Min ?? ''}
                  onChange={e => setLocal({ ...local, spo2Min: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 transition"
                  placeholder="94"
                />
              </div>
            </div>
          </div>

          {/* Nhóm 2: Cảnh báo tư thế ngồi (Sai nhẹ & Sai lâu) */}
          <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/90 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              <span>2. Thời gian cảnh báo tư thế (Posture)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Sai tư thế (giây):
                </label>
                <input
                  type="number"
                  value={local.incorrectPostureSec ?? ''}
                  onChange={e => setLocal({ ...local, incorrectPostureSec: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 transition"
                  placeholder="5"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">{local.incorrectPostureSec || 0}s bắt đầu nhắc tư thế</span>
              </div>

              <div>
                <label className="block text-rose-700 font-semibold mb-1">
                  Sai tư thế quá lâu (giây):
                </label>
                <input
                  type="number"
                  value={local.longIncorrectSec ?? ''}
                  onChange={e => setLocal({ ...local, longIncorrectSec: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-lg bg-rose-50/50 border border-rose-200 text-rose-950 font-mono text-xs focus:outline-none focus:border-rose-500 transition"
                  placeholder="120"
                />
                <span className="text-[10px] text-rose-600 mt-0.5 block">{local.longIncorrectSec || 0}s báo động sai lâu (Mã 3)</span>
              </div>
            </div>
          </div>

          {/* Nhóm 3: Chu kỳ làm việc Đứng - Ngồi Sit-to-Stand */}
          <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/90 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
              <span>3. Chu kỳ làm việc Đứng - Ngồi (Sit-to-Stand)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Ngồi lâu (giây):
                </label>
                <input
                  type="number"
                  value={local.longSittingSec ?? ''}
                  onChange={e => setLocal({ ...local, longSittingSec: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 transition"
                  placeholder="3600"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">{Math.floor((Number(local.longSittingSec) || 0) / 60)} phút ngồi</span>
              </div>

              <div>
                <label className="block text-indigo-900 font-semibold mb-1">
                  Mục tiêu đứng (giây):
                </label>
                <input
                  type="number"
                  value={local.standingTargetSec ?? ''}
                  onChange={e => setLocal({ ...local, standingTargetSec: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-indigo-50/50 border border-indigo-200 text-indigo-950 font-mono text-xs focus:outline-none focus:border-indigo-500 transition"
                  placeholder="300"
                />
                <span className="text-[10px] text-indigo-600 mt-0.5 block">{Math.floor((Number(local.standingTargetSec) || 0) / 60)} phút đứng</span>
              </div>

              <div>
                <label className="block text-indigo-900 font-semibold mb-1">
                  Đứng để reset ngồi (giây):
                </label>
                <input
                  type="number"
                  value={local.standingResetSec ?? ''}
                  onChange={e => setLocal({ ...local, standingResetSec: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-indigo-50/50 border border-indigo-200 text-indigo-950 font-mono text-xs focus:outline-none focus:border-indigo-500 transition"
                  placeholder="300"
                />
                <span className="text-[10px] text-indigo-600 mt-0.5 block">{local.standingResetSec ?? 300}s để xóa ngồi</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 pt-1">
              * Khi đứng ít hơn số giây reset, chu kỳ ngồi chỉ tạm dừng. Đứng đủ thời gian mới reset bộ đếm ngồi liên tục về 0.
            </p>
          </div>

          {/* Nhóm 4: Bật / Tắt âm thanh, giọng nói và thông báo */}
          <div className="pt-2.5 space-y-2 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={local.soundEnabled}
                onChange={e => setLocal({ ...local, soundEnabled: e.target.checked })}
                className="w-4 h-4 rounded bg-slate-100 border-slate-300 text-amber-600 focus:ring-0 cursor-pointer"
              />
              <span className="text-slate-700 font-medium flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-amber-600" />
                Phát âm thanh chuông bíp khi có sự cố sinh trắc
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={local.voiceAlertEnabled}
                onChange={e => setLocal({ ...local, voiceAlertEnabled: e.target.checked })}
                className="w-4 h-4 rounded bg-slate-100 border-slate-300 text-sky-600 focus:ring-0 cursor-pointer"
              />
              <span className="text-slate-700 font-medium flex items-center gap-1.5">
                <Mic className="w-4 h-4 text-sky-600" />
                Phát giọng nói tiếng Việt nhắc nhở trực tiếp (TTS)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={local.outOfZoneAlertEnabled}
                onChange={e => setLocal({ ...local, outOfZoneAlertEnabled: e.target.checked })}
                className="w-4 h-4 rounded bg-slate-100 border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
              />
              <span className="text-slate-700 font-medium flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-indigo-600" />
                Cảnh báo bằng giọng nói khi rời ngoài vùng camera AI
              </span>
            </label>

            {/* Browser Notification API Toggle & Permission */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={local.browserNotificationEnabled}
                  onChange={e => setLocal({ ...local, browserNotificationEnabled: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-100 border-slate-300 text-sky-600 focus:ring-0 cursor-pointer"
                />
                <span className="text-slate-800 font-semibold flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-sky-600" />
                  Gửi thông báo trình duyệt khi thu nhỏ / ẩn tab
                </span>
              </label>
              <p className="text-[11px] text-slate-500 pl-6 mt-0.5">
                Hiển thị cửa sổ pop-up thông báo của hệ điều hành ngay cả khi bạn đang làm việc trên ứng dụng khác.
              </p>

              <div className="pl-6 mt-2 flex flex-wrap items-center gap-2">
                {notifPermission === 'granted' ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Đã cấp quyền trình duyệt
                    </span>
                    <button
                      type="button"
                      onClick={handleSendTestNotification}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition cursor-pointer flex items-center gap-1"
                    >
                      <BellRing className="w-3 h-3" />
                      <span>{testNotifSent ? '✅ Đã gửi pop-up!' : 'Thử gửi thông báo'}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestNotificationPermission}
                    className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <BellRing className="w-3.5 h-3.5" />
                    <span>Cho phép nhận thông báo trình duyệt</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Audio & Voice Test Section */}
          <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                <Play className="w-3 h-3 text-emerald-600" />
                Kiểm tra loa & âm thanh tương tác:
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Bấm để nghe thử</span>
            </div>

            {/* 1. Nhóm âm thanh tương tác cảm biến MAX30102 */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 mb-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                <span>Cảm biến MAX30102 (Nhịp tim & SpO₂)</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleTestVoice('finger_placed')}
                  disabled={testPlaying !== null}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'finger_placed'
                      ? 'bg-emerald-100 border-emerald-400 text-emerald-900 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-200'
                  }`}
                >
                  <span className="truncate">👆 1. Đặt tay đo</span>
                  <Play className="w-3 h-3 text-emerald-600 shrink-0 ml-1" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('measuring_pulse')}
                  disabled={testPlaying !== null}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'measuring_pulse'
                      ? 'bg-rose-100 border-rose-400 text-rose-900 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-900 hover:border-rose-200'
                  }`}
                >
                  <span className="truncate">💓 2. Đang đo (Pulse)</span>
                  <Play className="w-3 h-3 text-rose-500 shrink-0 ml-1" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('measure_complete')}
                  disabled={testPlaying !== null}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'measure_complete'
                      ? 'bg-sky-100 border-sky-400 text-sky-900 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-sky-50 hover:text-sky-900 hover:border-sky-200'
                  }`}
                >
                  <span className="truncate">🎯 3. Đã đo xong</span>
                  <Play className="w-3 h-3 text-sky-600 shrink-0 ml-1" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('finger_removed')}
                  disabled={testPlaying !== null}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'finger_removed'
                      ? 'bg-slate-200 border-slate-400 text-slate-900 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">🖐️ 4. Đã bỏ tay</span>
                  <Play className="w-3 h-3 text-slate-500 shrink-0 ml-1" />
                </button>
              </div>
            </div>

            {/* 2. Nhóm An ninh, Camera & Hiện diện */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-800 mb-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                <span>An ninh, Camera & Hiện diện</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleTestVoice('stranger_detected')}
                  disabled={testPlaying !== null}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'stranger_detected'
                      ? 'bg-rose-100 border-rose-400 text-rose-900 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-900 hover:border-rose-200'
                  }`}
                >
                  <span className="truncate">🚨 Người lạ</span>
                  <Play className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('camera_error')}
                  disabled={testPlaying !== null}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'camera_error'
                      ? 'bg-amber-100 border-amber-400 text-amber-900 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-200'
                  }`}
                >
                  <span className="truncate">🔌 Lỗi Cam</span>
                  <Play className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('welcome_back')}
                  disabled={testPlaying !== null}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'welcome_back'
                      ? 'bg-indigo-100 border-indigo-400 text-indigo-900 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 hover:border-indigo-200'
                  }`}
                >
                  <span className="truncate">🪑 Quay lại</span>
                  <Play className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('user_absent')}
                  disabled={testPlaying !== null}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'user_absent'
                      ? 'bg-slate-200 border-slate-400 text-slate-900 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">🚪 Vắng mặt</span>
                  <Play className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('face_enrolled')}
                  disabled={testPlaying !== null}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'face_enrolled'
                      ? 'bg-emerald-100 border-emerald-400 text-emerald-900 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-200'
                  }`}
                >
                  <span className="truncate">📸 ĐK xong</span>
                  <Play className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('face_verified')}
                  disabled={testPlaying !== null}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'face_verified'
                      ? 'bg-sky-100 border-sky-400 text-sky-900 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-sky-50 hover:text-sky-900 hover:border-sky-200'
                  }`}
                >
                  <span className="truncate">🔑 Đã xác thực</span>
                  <Play className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                </button>
              </div>
            </div>

            {/* 3. Nhóm nhắc nhở Công thái học */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                <span>Nhắc nhở Công thái học & Tư thế</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleTestVoice('posture_correct')}
                  disabled={testPlaying !== null}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'posture_correct'
                      ? 'bg-emerald-100 border-emerald-400 text-emerald-800 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-200'
                  }`}
                >
                  <span className="truncate">✅ Ngồi đúng</span>
                  <Play className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('posture_incorrect')}
                  disabled={testPlaying !== null}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'posture_incorrect'
                      ? 'bg-rose-100 border-rose-400 text-rose-800 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">🗣️ Ngồi thẳng</span>
                  <Play className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('standing_active')}
                  disabled={testPlaying !== null}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'standing_active'
                      ? 'bg-indigo-100 border-indigo-400 text-indigo-800 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 hover:border-indigo-200'
                  }`}
                >
                  <span className="truncate">🧍 Đang đứng</span>
                  <Play className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('long_sitting')}
                  disabled={testPlaying !== null}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'long_sitting' || testPlaying === 'sit_to_stand_prompt'
                      ? 'bg-amber-100 border-amber-400 text-amber-800 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">🚶 Ngồi lâu</span>
                  <Play className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTestVoice('standing_goal_reached')}
                  disabled={testPlaying !== null}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                    testPlaying === 'standing_goal_reached'
                      ? 'bg-emerald-100 border-emerald-400 text-emerald-800 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">🏆 Đạt mục tiêu</span>
                  <Play className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {saveError && <div role="alert" className="mt-3 text-xs text-rose-700 font-semibold">{saveError}</div>}
        <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition cursor-pointer font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Mặc định</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-xs cursor-pointer"
            >
              {isSaving ? 'Đang đồng bộ Pi...' : 'Lưu Cài Đặt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
