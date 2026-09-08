import React from 'react';
import { Clock, Armchair, Footprints, AlertTriangle, Flame, RotateCcw } from 'lucide-react';
import { TimeCalculations, AlertThresholds } from '../types';

interface TimeCountersProps {
  timeStats: TimeCalculations;
  thresholds: AlertThresholds;
  onResetTimers: () => void;
  hasData?: boolean;
}

export const TimeCounters: React.FC<TimeCountersProps> = ({ timeStats, thresholds, onResetTimers, hasData = true }) => {
  const { sittingSeconds, movingSeconds, badPostureSeconds, continuousSittingSeconds } = timeStats;

  const formatHMS = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const formatMS = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Percentages for threshold progress
  const badPosturePercent = Math.min(100, Math.round((badPostureSeconds / thresholds.incorrectPostureSec) * 100));
  const continuousSittingPercent = Math.min(100, Math.round((continuousSittingSeconds / thresholds.longSittingSec) * 100));

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800/80 p-4 sm:p-5 lg:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Thống Kê Thời Gian Hoạt Động</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Bộ đếm thời gian tự động đồng bộ theo trạng thái tư thế và vùng cảm biến</p>
        </div>

        <button
          onClick={onResetTimers}
          title="Đặt lại các bộ đếm thời gian"
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-850 hover:text-white hover:bg-slate-800 border border-slate-750 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset bộ đếm</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-5">
        {/* 1. Tổng thời gian ngồi */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="flex items-center gap-1.5 font-medium text-[11px] sm:text-xs truncate">
                <Armchair className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">Tổng Thời Gian Ngồi</span>
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-sky-300">
              {hasData ? formatHMS(sittingSeconds) : '--:--:--'}
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-2 truncate">
            {hasData ? 'Phát hiện cơ thể trong ghế' : 'Chờ phát hiện người'}
          </div>
        </div>

        {/* 2. Tổng thời gian di chuyển / đứng */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="flex items-center gap-1.5 font-medium text-[11px] sm:text-xs truncate">
                <Footprints className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">Thời Gian Vận Động</span>
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-300">
              {hasData ? formatHMS(movingSeconds) : '--:--:--'}
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-2 truncate">
            {hasData ? 'Rời ghế hoặc vận động nhẹ' : 'Đang chờ cảm biến'}
          </div>
        </div>

        {/* 3. Thời gian sai tư thế hiện tại */}
        <div className={`p-3.5 sm:p-4 rounded-xl border transition flex flex-col justify-between ${
          hasData && badPostureSeconds > 0 ? 'bg-rose-950/30 border-rose-800/50' : 'bg-slate-950/70 border-slate-800/80'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="flex items-center gap-1 font-medium text-rose-400 text-[11px] sm:text-xs truncate">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Sai Tư Thế</span>
              </span>
              <span className="text-[10px] sm:text-[11px] font-mono text-slate-400 whitespace-nowrap">
                {hasData ? `${badPostureSeconds}s/${thresholds.incorrectPostureSec}s` : '--'}
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-rose-400">
              {hasData ? formatMS(badPostureSeconds) : '00:00'}
            </div>
          </div>
          <div className="mt-2">
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  badPosturePercent >= 100 ? 'bg-rose-500 animate-pulse' : 'bg-rose-400'
                }`}
                style={{ width: `${badPosturePercent}%` }}
              ></div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-rose-300/90 mt-1 truncate">
              {badPostureSeconds >= thresholds.incorrectPostureSec ? '⚠️ Đã kích hoạt chuông' : 'Tự reset khi ngồi đúng'}
            </div>
          </div>
        </div>

        {/* 4. Thời gian ngồi liên tục */}
        <div className={`p-3.5 sm:p-4 rounded-xl border transition flex flex-col justify-between ${
          continuousSittingSeconds >= thresholds.longSittingSec ? 'bg-amber-950/30 border-amber-800/50' : 'bg-slate-950/70 border-slate-800/80'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="flex items-center gap-1 font-medium text-amber-400 text-[11px] sm:text-xs truncate">
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Ngồi Liên Tục</span>
              </span>
              <span className="text-[10px] sm:text-[11px] font-mono text-slate-400 whitespace-nowrap">
                {Math.floor(continuousSittingSeconds / 60)}p/{Math.floor(thresholds.longSittingSec / 60)}p
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-amber-300">
              {formatHMS(continuousSittingSeconds)}
            </div>
          </div>
          <div className="mt-2">
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  continuousSittingPercent >= 100 ? 'bg-amber-500 animate-pulse' : 'bg-amber-400'
                }`}
                style={{ width: `${continuousSittingPercent}%` }}
              ></div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-amber-300/90 mt-1 truncate">
              {continuousSittingSeconds >= thresholds.longSittingSec ? '🕒 Khuyến nghị đứng dậy nghỉ 5p' : 'Ngưỡng: 45-60 phút'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
