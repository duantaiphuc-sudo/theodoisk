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
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Thống Kê Thời Gian Hoạt Động</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Bộ đếm thời gian tự động đồng bộ theo trạng thái tư thế và vùng cảm biến</p>
        </div>

        <button
          onClick={onResetTimers}
          title="Đặt lại các bộ đếm thời gian"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 bg-slate-800/80 hover:text-white hover:bg-slate-700 transition"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset bộ đếm</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Tổng thời gian ngồi */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 font-medium">
              <Armchair className="w-4 h-4 text-sky-400" />
              Tổng Thời Gian Ngồi
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-sky-300">
            {hasData ? formatHMS(sittingSeconds) : '--:--:--'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {hasData ? 'Ghi nhận khi phát hiện cơ thể trong ghế' : 'Đang chờ phát hiện người ngồi'}
          </div>
        </div>

        {/* 2. Tổng thời gian di chuyển / đứng */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 font-medium">
              <Footprints className="w-4 h-4 text-emerald-400" />
              Thời Gian Di Chuyển
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-300">
            {hasData ? formatHMS(movingSeconds) : '--:--:--'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {hasData ? 'Thời gian rời ghế hoặc vận động nhẹ' : 'Đang chờ cảm biến'}
          </div>
        </div>

        {/* 3. Thời gian sai tư thế hiện tại */}
        <div className={`p-4 rounded-xl border transition ${
          hasData && badPostureSeconds > 0 ? 'bg-rose-950/30 border-rose-800/50' : 'bg-slate-950/60 border-slate-800/80'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 font-medium text-rose-400">
              <AlertTriangle className="w-4 h-4" />
              Thời Gian Sai Tư Thế
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {hasData ? `${badPostureSeconds}s / ${thresholds.incorrectPostureSec}s` : '--'}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400">
            {hasData ? formatMS(badPostureSeconds) : '00:00'}
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                badPosturePercent >= 100 ? 'bg-rose-500 animate-pulse' : 'bg-rose-400'
              }`}
              style={{ width: `${badPosturePercent}%` }}
            ></div>
          </div>
          <div className="text-[11px] text-rose-300/80 mt-1">
            {badPostureSeconds >= thresholds.incorrectPostureSec ? '⚠️ Đã kích hoạt cảnh báo!' : 'Tự động reset khi ngồi đúng'}
          </div>
        </div>

        {/* 4. Thời gian ngồi liên tục */}
        <div className={`p-4 rounded-xl border transition ${
          continuousSittingSeconds >= thresholds.longSittingSec ? 'bg-amber-950/30 border-amber-800/50' : 'bg-slate-950/60 border-slate-800/80'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 font-medium text-amber-400">
              <Flame className="w-4 h-4" />
              Ngồi Liên Tục
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {Math.floor(continuousSittingSeconds / 60)}p / {Math.floor(thresholds.longSittingSec / 60)}p
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300">
            {formatHMS(continuousSittingSeconds)}
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                continuousSittingPercent >= 100 ? 'bg-amber-500 animate-pulse' : 'bg-amber-400'
              }`}
              style={{ width: `${continuousSittingPercent}%` }}
            ></div>
          </div>
          <div className="text-[11px] text-amber-300/80 mt-1">
            {continuousSittingSeconds >= thresholds.longSittingSec ? '🕒 Khuyến nghị đứng dậy nghỉ 5p' : 'Ngưỡng tối đa 45-60 phút'}
          </div>
        </div>
      </div>
    </div>
  );
};
