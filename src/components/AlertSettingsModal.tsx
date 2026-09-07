import React, { useState } from 'react';
import { X, Settings, Volume2, Bell, Check, RotateCcw } from 'lucide-react';
import { AlertThresholds } from '../types';

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
  const [local, setLocal] = useState<AlertThresholds>({ ...thresholds });

  React.useEffect(() => {
    if (isOpen) {
      setLocal({ ...thresholds });
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
    });
  };

  const handleSave = () => {
    onSave(local);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Cài Đặt Ngưỡng Cảnh Báo</h3>
              <p className="text-xs text-slate-400">Thiết lập tiêu chuẩn sinh trắc học và thời gian</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3.5 text-xs">
          {/* HR min/max */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Nhịp tim tối thiểu (BPM):
              </label>
              <input
                type="number"
                min="40"
                max="90"
                value={local.hrMin}
                onChange={e => setLocal({ ...local, hrMin: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Nhịp tim tối đa (BPM):
              </label>
              <input
                type="number"
                min="90"
                max="160"
                value={local.hrMax}
                onChange={e => setLocal({ ...local, hrMax: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* SpO2 min */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Ngưỡng SpO₂ tối thiểu an toàn (%):
            </label>
            <input
              type="number"
              min="85"
              max="99"
              value={local.spo2Min}
              onChange={e => setLocal({ ...local, spo2Min: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Posture duration thresholds */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Cảnh báo sai tư thế (giây):
              </label>
              <input
                type="number"
                min="5"
                max="300"
                value={local.incorrectPostureSec}
                onChange={e => setLocal({ ...local, incorrectPostureSec: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Cảnh báo ngồi lâu (giây):
              </label>
              <input
                type="number"
                min="300"
                max="7200"
                step="300"
                value={local.longSittingSec}
                onChange={e => setLocal({ ...local, longSittingSec: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Sound toggle */}
          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={local.soundEnabled}
                onChange={e => setLocal({ ...local, soundEnabled: e.target.checked })}
                className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0"
              />
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-amber-400" />
                Phát âm thanh cảnh báo khi có sự cố sinh trắc
              </span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Mặc định</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition shadow-sm"
            >
              Lưu Cài Đặt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
