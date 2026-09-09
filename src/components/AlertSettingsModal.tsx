import React, { useState } from 'react';
import { X, Settings, Volume2, RotateCcw, Mic, Play, Radio } from 'lucide-react';
import { AlertThresholds } from '../types';
import { playAlertChime, playErgonomicVoiceAlert } from '../services/sound';

interface AlertSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  thresholds: AlertThresholds;
  onSave: (newThresholds: AlertThresholds) => void;
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
    ...thresholds 
  });
  const [testPlaying, setTestPlaying] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setLocal({ 
        voiceAlertEnabled: true,
        outOfZoneAlertEnabled: true,
        ...thresholds 
      });
      setTestPlaying(null);
    }
  }, [isOpen, thresholds]);

  if (!isOpen) return null;

  const handleReset = () => {
    setLocal({
      hrMin: 50,
      hrMax: 110,
      spo2Min: 94,
      incorrectPostureSec: 30,
      longIncorrectSec: 120,
      longSittingSec: 3600,
      soundEnabled: true,
      voiceAlertEnabled: true,
      outOfZoneAlertEnabled: true,
    });
  };

  const handleTestVoice = (type: 'posture_incorrect' | 'out_of_zone' | 'long_sitting' | 'chime') => {
    setTestPlaying(type);
    if (type === 'chime') {
      playAlertChime('warning');
      setTimeout(() => setTestPlaying(null), 800);
    } else {
      playErgonomicVoiceAlert(type, { playChime: local.soundEnabled });
      setTimeout(() => setTestPlaying(null), 3000);
    }
  };

  const handleSave = () => {
    onSave(local);
    onClose();
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Cảnh báo sai tư thế (giây):
              </label>
              <input
                type="number"
                min="5"
                max="300"
                value={local.incorrectPostureSec}
                onChange={e => setLocal({ ...local, incorrectPostureSec: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Cảnh báo ngồi lâu (giây):
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
            </div>
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

            <label className="flex items-center gap-2 cursor-pointer select-none pl-6">
              <input
                type="checkbox"
                checked={local.outOfZoneAlertEnabled}
                onChange={e => setLocal({ ...local, outOfZoneAlertEnabled: e.target.checked })}
                className="w-3.5 h-3.5 rounded bg-slate-100 border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
              />
              <span className="text-slate-600 text-[11px] flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-600" />
                Nhắc nhở khi phát hiện ngồi ngoài vùng quan sát
              </span>
            </label>
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
                onClick={() => handleTestVoice('out_of_zone')}
                disabled={testPlaying !== null}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-semibold border text-left transition flex items-center justify-between cursor-pointer ${
                  testPlaying === 'out_of_zone'
                    ? 'bg-indigo-100 border-indigo-400 text-indigo-800 animate-pulse'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>🗣️ "Vào vùng quan sát"</span>
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
              className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-xs cursor-pointer"
            >
              Lưu Cài Đặt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
