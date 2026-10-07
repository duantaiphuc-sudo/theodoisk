import React, { useState } from 'react';
import { Target, Sliders, Check, RotateCcw, Volume2 } from 'lucide-react';
import { ZoneConfig, HealthTelemetry } from '../types';
import { playErgonomicVoiceAlert } from '../services/sound';

interface MonitorZoneCardProps {
  zone: ZoneConfig;
  setZone: (zone: ZoneConfig) => void;
  telemetry: HealthTelemetry;
  isManager: boolean;
}

export const MonitorZoneCard: React.FC<MonitorZoneCardProps> = ({
  zone,
  setZone,
  telemetry,
  isManager,
}) => {
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isPlayingZoneAudio, setIsPlayingZoneAudio] = useState(false);

  const handleTestZoneVoice = () => {
    setIsPlayingZoneAudio(true);
    playErgonomicVoiceAlert('out_of_zone');
    setTimeout(() => setIsPlayingZoneAudio(false), 2500);
  };

  const handleReset = () => {
    setZone({ x1: 20, y1: 10, x2: 80, y2: 90 });
    triggerSaveFeedback();
  };

  const triggerSaveFeedback = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const { inZone } = telemetry;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 lg:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Camera Monitor Zone (Vùng Giám Sát)</span>
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Nhận diện người ngồi trong toạ độ vùng vàng của Raspberry Pi Camera / ESP32-CAM
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTestZoneVoice}
            disabled={isPlayingZoneAudio}
            title="Nghe thử âm thanh nhắc nhở khi ngồi ngoài vùng quan sát"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
              isPlayingZoneAudio
                ? 'bg-indigo-50 text-indigo-700 border-indigo-300 animate-pulse'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlayingZoneAudio ? 'text-indigo-600' : 'text-slate-500'}`} />
            <span className="hidden sm:inline">Âm thanh nhắc:</span>
            <span>Vào vùng quan sát</span>
          </button>

          <span className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 whitespace-nowrap ${
            inZone
              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
              : 'bg-amber-100 text-amber-800 border-amber-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${inZone ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'}`}></span>
            {inZone ? 'Có người trong vùng vàng' : 'Chưa có người trong vùng'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        {/* Visual Camera Feed Simulator with Bounding Box */}
        <div className="lg:col-span-7 relative w-full h-[220px] sm:h-[250px] bg-slate-900 rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center shadow-inner">
          {/* Subtle camera scanline effect */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[size:100%_4px] pointer-events-none opacity-40"></div>

          {/* Camera timestamp & overlays */}
          <div className="absolute top-2 left-3 flex items-center gap-2 text-[10px] font-mono text-emerald-400 bg-black/60 px-2 py-0.5 rounded z-20">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            <span>{telemetry.image ? 'PI4_CAM • REAL FEED' : 'CAM_01 • 30 FPS • 1080p'}</span>
          </div>

          <div className="absolute top-2 right-3 text-[10px] font-mono text-slate-300 bg-black/60 px-2 py-0.5 rounded z-20">
            ZONE: ({zone.x1}%,{zone.y1}%) - ({zone.x2}%,{zone.y2}%)
          </div>

          {/* Real camera image from Pi 4 OR Simulated silhouette */}
          {telemetry.image ? (
            <img
              src={telemetry.image}
              alt="Pi 4 Monitor Zone Frame"
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          ) : (
            /* Person silhouette inside workspace */
            <div className="relative z-10 flex flex-col items-center opacity-85">
              <div className={`w-12 h-12 rounded-full border-2 transition-all ${
                inZone ? 'border-emerald-400 bg-emerald-500/30 shadow-lg shadow-emerald-500/20' : 'border-slate-500 bg-slate-800'
              }`}></div>
              <div className={`w-24 h-28 rounded-t-3xl border-2 border-t-0 mt-1 transition-all ${
                inZone ? 'border-emerald-400 bg-emerald-500/20' : 'border-slate-500 bg-slate-800/80'
              }`}></div>
            </div>
          )}

          {/* Interactive Bounding Box (Yellow Monitor Zone) */}
          <div
            className="absolute border-2 border-dashed border-amber-400 bg-amber-500/15 transition-all duration-300 pointer-events-none flex flex-col justify-between p-1.5"
            style={{
              left: `${zone.x1}%`,
              top: `${zone.y1}%`,
              width: `${Math.max(10, zone.x2 - zone.x1)}%`,
              height: `${Math.max(10, zone.y2 - zone.y1)}%`,
            }}
          >
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-mono font-bold bg-amber-400 text-slate-950 px-1 rounded">
                MONITOR_ZONE
              </span>
              <span className="text-[10px] font-mono text-amber-300 font-semibold bg-black/50 px-1 rounded">
                {zone.x2 - zone.x1}% × {zone.y2 - zone.y1}%
              </span>
            </div>

            <div className="flex justify-end">
              <span className={`text-[10px] font-mono px-1 rounded font-bold ${
                inZone ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-slate-950'
              }`}>
                {inZone ? 'TARGET_DETECTED' : 'AWAITING_PERSON'}
              </span>
            </div>
          </div>
        </div>

        {/* Controls (Active for Manager, Read-only view for Employee) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-sky-600" />
              {isManager ? 'Tinh chỉnh toạ độ vùng giám sát' : 'Toạ độ vùng đang áp dụng'}
            </span>
            {savedSuccess && (
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Đã lưu
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* X1 */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>Trái (X1):</span>
                <span className="font-mono text-amber-700 font-bold">{zone.x1}%</span>
              </div>
              <input
                type="range"
                min="0"
                max={Math.min(90, zone.x2 - 10)}
                value={zone.x1}
                disabled={!isManager}
                onChange={e => setZone({ ...zone, x1: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer disabled:opacity-50"
              />
            </div>

            {/* X2 */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>Phải (X2):</span>
                <span className="font-mono text-amber-700 font-bold">{zone.x2}%</span>
              </div>
              <input
                type="range"
                min={Math.max(10, zone.x1 + 10)}
                max="100"
                value={zone.x2}
                disabled={!isManager}
                onChange={e => setZone({ ...zone, x2: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer disabled:opacity-50"
              />
            </div>

            {/* Y1 */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>Trên (Y1):</span>
                <span className="font-mono text-amber-700 font-bold">{zone.y1}%</span>
              </div>
              <input
                type="range"
                min="0"
                max={Math.min(90, zone.y2 - 10)}
                value={zone.y1}
                disabled={!isManager}
                onChange={e => setZone({ ...zone, y1: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer disabled:opacity-50"
              />
            </div>

            {/* Y2 */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>Dưới (Y2):</span>
                <span className="font-mono text-amber-700 font-bold">{zone.y2}%</span>
              </div>
              <input
                type="range"
                min={Math.max(10, zone.y1 + 10)}
                max="100"
                value={zone.y2}
                disabled={!isManager}
                onChange={e => setZone({ ...zone, y2: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer disabled:opacity-50"
              />
            </div>
          </div>

          {isManager ? (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={triggerSaveFeedback}
                className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition cursor-pointer shadow-2xs"
              >
                Áp Dụng Cho Pi 4
              </button>
              <button
                onClick={handleReset}
                title="Khôi phục mặc định (20%, 10%, 80%, 90%)"
                className="p-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 italic">
              💡 Tính năng tinh chỉnh toạ độ vùng quan sát yêu cầu tài khoản Quản trị viên (Admin).
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
