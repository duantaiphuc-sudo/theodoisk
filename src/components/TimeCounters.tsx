import React from 'react';
import { Clock, Armchair, Footprints, AlertTriangle, Flame, RotateCcw, UserMinus, CheckCircle2 } from 'lucide-react';
import { TimeCalculations, AlertThresholds } from '../types';

interface TimeCountersProps {
  timeStats: TimeCalculations;
  thresholds: AlertThresholds;
  onResetTimers: () => void;
  hasData?: boolean;
}

export const TimeCounters: React.FC<TimeCountersProps> = ({ timeStats, thresholds, onResetTimers, hasData = true }) => {
  const { 
    sittingSeconds, 
    standingSeconds = 0, 
    movingSeconds, 
    badPostureSeconds, 
    continuousSittingSeconds,
    continuousStandingSeconds = 0
  } = timeStats;

  const standingTargetSec = thresholds.standingTargetSec || 300; // Mặc định 5 phút = 300s

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
  const standingProgressPercent = Math.min(100, Math.round((continuousStandingSeconds / standingTargetSec) * 100));
  const isStandingGoalReached = continuousStandingSeconds >= standingTargetSec;

  return (
    <div className="rounded-2xl glass-panel bg-white/75 backdrop-blur-xl border border-white/60 p-4 sm:p-5 lg:p-6 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Thống Kê Thời Gian Hoạt Động & Chu Kỳ Đứng Ngồi</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Tự động đếm thời gian ngồi, đứng làm việc và cảnh báo chu kỳ Sit-Stand công thái học</p>
        </div>

        <button
          onClick={onResetTimers}
          title="Đặt lại các bộ đếm thời gian"
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:text-slate-900 hover:bg-slate-200 border border-slate-200 transition cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span>Reset bộ đếm</span>
        </button>
      </div>

      {/* Grid 5 cards đồng bộ chuẩn màu: Ngồi, Đứng, Vắng mặt, Sai tư thế, Ngồi liên tục */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5 lg:gap-4">
        {/* 1. Tổng thời gian ngồi */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="flex items-center gap-1.5 font-semibold text-[11px] sm:text-xs truncate">
                <Armchair className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="truncate">Thời Gian Ngồi</span>
              </span>
            </div>
            <div className="text-lg sm:text-xl lg:text-2xl font-bold font-mono text-slate-900">
              {hasData ? formatHMS(sittingSeconds) : '--:--:--'}
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-2 truncate">
            {hasData ? 'Đang ngồi làm việc' : 'Chờ phát hiện người'}
          </div>
        </div>

        {/* 2. Tổng thời gian ĐỨNG (Đồng bộ cùng màu với các thẻ khác) */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="flex items-center gap-1.5 font-semibold text-[11px] sm:text-xs truncate">
                <Footprints className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="truncate">Thời Gian Đứng</span>
              </span>
              {continuousStandingSeconds > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-100 text-sky-800 font-bold">
                  ĐANG ĐỨNG
                </span>
              )}
            </div>
            <div className="text-lg sm:text-xl lg:text-2xl font-bold font-mono text-slate-900">
              {hasData ? formatHMS(standingSeconds) : '--:--:--'}
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-2 truncate">
            {continuousStandingSeconds > 0 
              ? `Liên tục: ${formatMS(continuousStandingSeconds)} / ${Math.floor(standingTargetSec / 60)}p`
              : 'Sit-Stand công thái học'}
          </div>
        </div>

        {/* 3. Tổng thời gian vắng mặt (Chạy khi trạng thái là Vắng mặt) */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="flex items-center gap-1.5 font-semibold text-[11px] sm:text-xs truncate">
                <UserMinus className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">Thời Gian Rời Ghế</span>
              </span>
            </div>
            <div className="text-lg sm:text-xl lg:text-2xl font-bold font-mono text-slate-700">
              {hasData ? formatHMS(movingSeconds) : '--:--:--'}
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-2 truncate">
            {hasData ? 'Rời ghế hoặc ngoài camera' : 'Đang chờ cảm biến'}
          </div>
        </div>

        {/* 4. Thời gian sai tư thế hiện tại */}
        <div className={`p-3.5 sm:p-4 rounded-xl border transition flex flex-col justify-between ${
          hasData && badPostureSeconds > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-200'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="flex items-center gap-1 font-semibold text-rose-700 text-[11px] sm:text-xs truncate">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Sai Tư Thế</span>
              </span>
              <span className="text-[10px] sm:text-[11px] font-mono text-slate-500 whitespace-nowrap font-medium">
                {hasData ? `${badPostureSeconds}s/${thresholds.incorrectPostureSec}s` : '--'}
              </span>
            </div>
            <div className="text-lg sm:text-xl lg:text-2xl font-bold font-mono text-rose-700">
              {hasData ? formatMS(badPostureSeconds) : '00:00'}
            </div>
          </div>
          <div className="mt-2">
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  badPosturePercent >= 100 ? 'bg-rose-600 animate-pulse' : 'bg-rose-500'
                }`}
                style={{ width: `${badPosturePercent}%` }}
              ></div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-rose-700 font-medium mt-1 truncate">
              {badPostureSeconds >= thresholds.incorrectPostureSec ? '⚠️ Đã kích hoạt chuông' : 'Tự reset khi ngồi đúng'}
            </div>
          </div>
        </div>

        {/* 5. Thời gian ngồi liên tục */}
        <div className={`p-3.5 sm:p-4 rounded-xl border transition flex flex-col justify-between col-span-2 sm:col-span-1 ${
          continuousSittingSeconds >= thresholds.longSittingSec ? 'bg-amber-50/70 border-amber-200' : 'bg-slate-50 border-slate-200'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="flex items-center gap-1 font-semibold text-amber-700 text-[11px] sm:text-xs truncate">
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Ngồi Liên Tục</span>
              </span>
              <span className="text-[10px] sm:text-[11px] font-mono text-slate-500 whitespace-nowrap font-medium">
                {Math.floor(continuousSittingSeconds / 60)}p/{Math.floor(thresholds.longSittingSec / 60)}p
              </span>
            </div>
            <div className="text-lg sm:text-xl lg:text-2xl font-bold font-mono text-amber-800">
              {formatHMS(continuousSittingSeconds)}
            </div>
          </div>
          <div className="mt-2">
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  continuousSittingPercent >= 100 ? 'bg-amber-600 animate-pulse' : 'bg-amber-500'
                }`}
                style={{ width: `${continuousSittingPercent}%` }}
              ></div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-amber-700 font-medium mt-1 truncate">
              {continuousSittingSeconds >= thresholds.longSittingSec ? '🕒 Khuyên đứng dậy ngay' : 'Đếm liên tục'}
            </div>
          </div>
        </div>
      </div>

      {/* Sit-to-Stand Cycle Live Status Card */}
      <div className={`mt-3.5 p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        continuousStandingSeconds > 0
          ? isStandingGoalReached
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : 'bg-slate-100 border-slate-300 text-slate-900'
          : continuousSittingSeconds >= thresholds.longSittingSec
          ? 'bg-amber-50 border-amber-300 text-amber-900 animate-pulse'
          : 'bg-slate-50 border-slate-200 text-slate-700'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
            continuousStandingSeconds > 0
              ? isStandingGoalReached
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                : 'bg-white text-slate-700 border-slate-300'
              : continuousSittingSeconds >= thresholds.longSittingSec
              ? 'bg-amber-100 text-amber-700 border-amber-300'
              : 'bg-white text-slate-500 border-slate-200'
          }`}>
            {continuousStandingSeconds > 0 ? (
              isStandingGoalReached ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Footprints className="w-5 h-5 text-slate-700" />
            ) : (
              <Clock className="w-5 h-5 text-amber-600" />
            )}
          </div>
          <div>
            <div className="text-xs font-bold flex items-center gap-1.5">
              <span>Chu kỳ Đứng - Ngồi (Sit-Stand Cycle):</span>
              {continuousStandingSeconds > 0 ? (
                isStandingGoalReached ? (
                  <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 inline" /> ĐÃ ĐẠT MỤC TIÊU ĐỨNG ({Math.floor(standingTargetSec / 60)} phút)!
                  </span>
                ) : (
                  <span className="text-slate-900 font-extrabold">
                    ĐANG ĐỨNG LÀM VIỆC ({formatMS(continuousStandingSeconds)} / {Math.floor(standingTargetSec / 60)}:00)
                  </span>
                )
              ) : continuousSittingSeconds >= thresholds.longSittingSec ? (
                <span className="text-amber-800 font-extrabold">ĐÃ NGỒI QUÁ LÂU! HÃY ĐỨNG DẬY LÀM VIỆC</span>
              ) : (
                <span className="text-slate-600 font-medium">Đang ngồi làm việc tiêu chuẩn</span>
              )}
            </div>
            <p className="text-[11px] opacity-90 mt-0.5">
              {continuousStandingSeconds > 0 ? (
                isStandingGoalReached 
                  ? 'Tuyệt vời! Cột sống đã được giải phóng áp lực. Bạn có thể ngồi xuống tiếp tục làm việc.'
                  : `Hệ thống sẽ phát âm thanh báo khi bạn đứng đủ ${Math.floor(standingTargetSec / 60)} phút khuyến nghị.`
              ) : continuousSittingSeconds >= thresholds.longSittingSec ? (
                `Hệ thống khuyến nghị bạn đứng dậy làm việc trong ${Math.floor(standingTargetSec / 60)} phút để tránh thoái hóa cột sống.`
              ) : (
                `Mục tiêu: Cứ sau ${Math.floor(thresholds.longSittingSec / 60)} phút ngồi, đứng dậy làm việc ${Math.floor(standingTargetSec / 60)} phút.`
              )}
            </p>
          </div>
        </div>

        {/* Visual Progress Bar for Standing Goal */}
        {continuousStandingSeconds > 0 && (
          <div className="min-w-[160px] sm:w-48 shrink-0">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold mb-1">
              <span>Tiến độ đứng:</span>
              <span>{standingProgressPercent}%</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden border border-slate-300">
              <div 
                className={`h-full transition-all duration-300 ${
                  isStandingGoalReached ? 'bg-emerald-600' : 'bg-slate-800'
                }`}
                style={{ width: `${standingProgressPercent}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
