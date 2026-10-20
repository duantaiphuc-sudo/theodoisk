import React, { useState } from 'react';
import { X, Settings, Volume2, RotateCcw, Mic, Play, Radio, Bell, BellRing, CheckCircle2 } from 'lucide-react';
import { AlertThresholds } from '../types';
import { playAlertChime, playErgonomicVoiceAlert } from '../services/sound';
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

  const handleTestVoice = (type: 'posture_incorrect' | 'out_of_zone' | 'long_sitting' | 'sit_to_stand_prompt' | 'standing_goal_reached' | 'chime') => {
    setTestPlaying(type);
    if (type === 'chime') {
      playAlertChime('warning');
      setTimeout(() => setTestPlaying(null), 800);
    } else if (type === 'sit_to_stand_prompt') {
      const targetMin = Math.round((local.standingTargetSec || 300) / 60);
      playErgonomicVoiceAlert('sit_to_stand_prompt', {
        playChime: local.soundEnabled,
        customMessage: `Cảnh báo: Bạn đã ngồi làm việc liên tục quá lâu! Xin hãy đứng dậy làm việc trong ${targetMin} phút để bảo vệ cột sống và giải phóng áp lực đĩa đệm nhé!`
      });
      setTimeout(() => setTestPlaying(null), 4500);
    } else if (type === 'standing_goal_reached') {
      const targetMin = Math.round((local.standingTargetSec || 300) / 60);
      playErgonomicVoiceAlert('standing_goal_reached', {
        playChime: local.soundEnabled,
        customMessage: `Tuyệt vời! Bạn đã hoàn thành ${targetMin} phút đứng làm việc theo mục tiêu. Bạn có thể ngồi xuống tiếp tục công việc rồi nhé!`
      });
      setTimeout(() => setTestPlaying(null), 4500);
    } else {
      playErgonomicVoiceAlert(type, { playChime: local.soundEnabled });
      setTimeout(() => setTestPlaying(null), 3000);
    }
  };

  const handleSave = async () => {
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
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md rounded-2xl bg-white border border-slate-200 p-4 sm:p-6 shadow-2xl text-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Cài Đặt Ngưỡng Cảnh Báo</h3>
              <p className="text-xs text-slate-500">Thiết lập tiêu chuẩn sinh trắc học và thời gian</p>
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
          {/* HR min/max */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Nhịp tim tối thiểu (BPM):
              </label>
              <input
                type="number"
                min="40"
                max="90"
                value={local.hrMin}
                onChange={e => setLocal({ ...local, hrMin: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Nhịp tim tối đa (BPM):
              </label>
              <input
                type="number"
                min="90"
                max="160"
                value={local.hrMax}
                onChange={e => setLocal({ ...local, hrMax: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 focus:bg-white transition"
              />
            </div>
          </div>

          {/* SpO2 min */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Ngưỡng SpO₂ tối thiểu an toàn (%):
            </label>
            <input
              type="number"
              min="85"
              max="99"
              value={local.spo2Min}
              onChange={e => setLocal({ ...local, spo2Min: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 focus:bg-white transition"
            />
          </div>

          {/* Posture duration thresholds */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Sai tư thế (giây):
              </label>
              <input
                type="number"
                min="5"
                max="300"
                value={local.incorrectPostureSec}
                onChange={e => setLocal({ ...local, incorrectPostureSec: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 focus:bg-white transition"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">{local.incorrectPostureSec}s cảnh báo</span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Ngồi lâu (giây):
              </label>
              <input
                type="number"
                min="300"
                max="7200"
                step="300"
                value={local.longSittingSec}
                onChange={e => setLocal({ ...local, longSittingSec: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 focus:bg-white transition"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">{Math.floor(local.longSittingSec / 60)} phút ngồi</span>
            </div>

            <div>
              <label className="block text-indigo-900 font-bold mb-1">
                Mục tiêu đứng (giây):
              </label>
              <input
                type="number"
                min="60"
                max="3600"
                step="60"
                value={local.standingTargetSec || 300}
                onChange={e => setLocal({ ...local, standingTargetSec: Math.max(30, Number(e.target.value)) })}
                className="w-full px-3 py-2 rounded-lg bg-indigo-50/60 border border-indigo-200 text-indigo-950 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
              <span className="text-[10px] text-indigo-600 font-medium mt-0.5 block">{Math.floor((local.standingTargetSec || 300) / 60)} phút (Sit-Stand)</span>
            </div>
          </div>

          {/* Ngưỡng mới: đứng đủ thời gian mới đặt lại ngồi liên tục */}
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

          {/* Sound and Voice toggles */}
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
          <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                <Play className="w-3 h-3 text-emerald-600" />
                Kiểm tra thử loa & giọng nói:
              </span>
              <span className="text-[10px] text-slate-500">Bấm để nghe thử</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleTestVoice('posture_incorrect')}
                disabled={testPlaying !== null}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                  testPlaying === 'posture_incorrect'
                    ? 'bg-rose-100 border-rose-400 text-rose-800 animate-pulse'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>🗣️ "Ngồi thẳng lên"</span>
                <Play className="w-3 h-3 text-slate-400 shrink-0" />
              </button>


              <button
                type="button"
                onClick={() => handleTestVoice('long_sitting')}
                disabled={testPlaying !== null}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                  testPlaying === 'long_sitting'
                    ? 'bg-amber-100 border-amber-400 text-amber-800 animate-pulse'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>🗣️ "Ngồi quá lâu"</span>
                <Play className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => handleTestVoice('sit_to_stand_prompt')}
                disabled={testPlaying !== null}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                  testPlaying === 'sit_to_stand_prompt'
                    ? 'bg-amber-100 border-amber-400 text-amber-800 animate-pulse'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>🗣️ Nhắc đứng dậy</span>
                <Play className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => handleTestVoice('standing_goal_reached')}
                disabled={testPlaying !== null}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                  testPlaying === 'standing_goal_reached'
                    ? 'bg-emerald-100 border-emerald-400 text-emerald-800 animate-pulse'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>🗣️ Đạt mục tiêu đứng</span>
                <Play className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => handleTestVoice('chime')}
                disabled={testPlaying !== null}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                  testPlaying === 'chime'
                    ? 'bg-emerald-100 border-emerald-400 text-emerald-800 animate-pulse'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>🔔 Chuông cảnh báo</span>
                <Play className="w-3 h-3 text-slate-400 shrink-0" />
              </button>
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
