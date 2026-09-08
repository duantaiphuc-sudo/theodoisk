import React from 'react';
import { 
  Heart, 
  Wind, 
  UserCheck, 
  UserX, 
  AlertTriangle, 
  Clock, 
  Target, 
  CheckCircle2, 
  Activity 
} from 'lucide-react';
import { HealthTelemetry, AlertThresholds } from '../types';

interface MetricCardsProps {
  telemetry: HealthTelemetry;
  thresholds: AlertThresholds;
  hasData?: boolean;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ telemetry, thresholds, hasData = true }) => {
  const { bpm, spo2, postureStatus, postureLabel, trackingActive, inZone, source } = telemetry;

  // If no data has arrived yet, show explicit empty state
  const isEmpty = !hasData || (telemetry.postureStatus === -1 && bpm === 0 && spo2 === 0 && !telemetry.trackingActive && !telemetry.image);
  if (isEmpty) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-5">
        {/* 1. Nhịp tim (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/80 p-3.5 sm:p-5 lg:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 sm:gap-1.5 truncate">
                <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">Nhịp Tim (BPM)</span>
              </span>
              <div className="p-1.5 sm:p-2.5 rounded-xl bg-slate-800/60 text-slate-500 border border-slate-700/60 shrink-0">
                <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
              </div>
            </div>
            <div className="mt-2.5 sm:mt-4 flex items-baseline gap-1.5 sm:gap-2">
              <span className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-600 font-mono">--</span>
              <span className="text-xs sm:text-sm font-medium text-slate-500">bpm</span>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 flex items-center justify-between pt-2.5 sm:pt-3 border-t border-slate-800/80 text-[10px] sm:text-xs">
            <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md font-medium bg-slate-800/90 text-slate-400 border border-slate-700 whitespace-nowrap">
              Chờ MAX30102
            </span>
            <span className="text-slate-500 font-mono hidden sm:inline">Chưa có dữ liệu</span>
          </div>
        </div>

        {/* 2. Nồng độ SpO2 (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/80 p-3.5 sm:p-5 lg:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 sm:gap-1.5 truncate">
                <Wind className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">Oxy (SpO₂)</span>
              </span>
              <div className="p-1.5 sm:p-2.5 rounded-xl bg-slate-800/60 text-slate-500 border border-slate-700/60 shrink-0">
                <Wind className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
              </div>
            </div>
            <div className="mt-2.5 sm:mt-4 flex items-baseline gap-1.5 sm:gap-2">
              <span className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-600 font-mono">--</span>
              <span className="text-xs sm:text-sm font-medium text-slate-500">%</span>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 flex items-center justify-between pt-2.5 sm:pt-3 border-t border-slate-800/80 text-[10px] sm:text-xs">
            <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md font-medium bg-slate-800/90 text-slate-400 border border-slate-700 whitespace-nowrap">
              Chờ MAX30102
            </span>
            <span className="text-slate-500 font-mono hidden sm:inline">Chưa có dữ liệu</span>
          </div>
        </div>

        {/* 3. Tư thế làm việc (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/80 p-3.5 sm:p-5 lg:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 sm:gap-1.5 truncate">
                <UserX className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">Tư Thế Ngồi</span>
              </span>
              <div className="p-1.5 sm:p-2.5 rounded-xl bg-slate-800/60 text-slate-500 border border-slate-700/60 shrink-0">
                <UserX className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3">
              <div className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-semibold bg-slate-800/90 text-slate-400 border border-slate-700 whitespace-nowrap">
                Chờ Camera AI
              </div>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 flex items-center justify-between pt-2.5 sm:pt-3 border-t border-slate-800/80 text-[10px] sm:text-xs text-slate-500">
            <span>Chưa nhận dạng</span>
            <span className="font-mono">--%</span>
          </div>
        </div>

        {/* 4. Vùng Giám Sát (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/80 p-3.5 sm:p-5 lg:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 sm:gap-1.5 truncate">
                <Target className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">Vùng Giám Sát</span>
              </span>
              <div className="p-1.5 sm:p-2.5 rounded-xl bg-slate-800/60 text-slate-500 border border-slate-700/60 shrink-0">
                <UserX className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
              </div>
            </div>
            <div className="mt-2.5 sm:mt-4 flex items-baseline gap-2">
              <span className="text-base sm:text-xl font-bold tracking-tight text-slate-500 font-sans whitespace-nowrap">
                CHỜ KẾT NỐI
              </span>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 flex items-center justify-between pt-2.5 sm:pt-3 border-t border-slate-800/80 text-[10px] sm:text-xs text-slate-500">
            <span>Nguồn: Pi 4</span>
            <span className="whitespace-nowrap">Chưa bắt đầu</span>
          </div>
        </div>
      </div>
    );
  }

  // Evaluate Heart rate
  let hrStatusText = 'Bình thường';
  let hrStatusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  let hrWarning = false;
  if (bpm > 0) {
    if (bpm < thresholds.hrMin) {
      hrStatusText = 'Nhịp tim chậm';
      hrStatusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      hrWarning = true;
    } else if (bpm > thresholds.hrMax) {
      hrStatusText = 'Nhịp tim nhanh';
      hrStatusColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      hrWarning = true;
    }
  }

  // Evaluate SpO2
  let spo2StatusText = 'Tối ưu';
  let spo2StatusColor = 'text-sky-400 bg-sky-500/10 border-sky-500/30';
  let spo2Warning = false;
  if (spo2 > 0) {
    if (spo2 < thresholds.spo2Min) {
      spo2StatusText = 'Thiếu oxy cảnh báo';
      spo2StatusColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      spo2Warning = true;
    } else if (spo2 < 96) {
      spo2StatusText = 'Trung bình';
      spo2StatusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    }
  }

  // Evaluate Posture
  const isOutOfZone = inZone === false || trackingActive === false;
  const isAbsent = postureStatus === 2 || isOutOfZone;

  let postureCardBg = 'bg-slate-900/70 border-slate-800';
  let postureBadgeStyle = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  let postureIcon = <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
  let displayedPostureLabel = postureLabel;

  if (isAbsent) {
    postureCardBg = 'bg-slate-900/80 border-amber-500/30';
    postureBadgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/40';
    postureIcon = <UserX className="w-5 h-5 text-amber-400" />;
    displayedPostureLabel = 'VẮNG MẶT (Ngoài vùng)';
  } else {
    switch (postureStatus) {
      case 0: // Đúng
        postureCardBg = 'bg-emerald-950/20 border-emerald-800/40';
        postureBadgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
        postureIcon = <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
        displayedPostureLabel = 'Tư thế ĐÚNG';
        break;
      case 1: // Sai
        postureCardBg = 'bg-rose-950/25 border-rose-800/50';
        postureBadgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
        postureIcon = <AlertTriangle className="w-5 h-5 text-rose-400" />;
        displayedPostureLabel = 'Tư thế SAI';
        break;
      case 3: // Sai lâu
        postureCardBg = 'bg-rose-950/40 border-rose-600/70 animate-pulse';
        postureBadgeStyle = 'bg-rose-600/30 text-rose-200 border-rose-500/60 font-bold';
        postureIcon = <AlertTriangle className="w-5 h-5 text-rose-400 animate-bounce" />;
        displayedPostureLabel = 'SAI TƯ THẾ LÂU';
        break;
      case 4: // Ngồi lâu
        postureCardBg = 'bg-amber-950/25 border-amber-800/50';
        postureBadgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold';
        postureIcon = <Clock className="w-5 h-5 text-amber-400" />;
        displayedPostureLabel = 'NGỒI QUÁ LÂU';
        break;
      default: // Vắng
        postureCardBg = 'bg-slate-900/60 border-slate-800';
        postureBadgeStyle = 'bg-slate-800 text-slate-400 border-slate-700';
        postureIcon = <UserX className="w-5 h-5 text-slate-400" />;
        displayedPostureLabel = 'VẮNG MẶT';
        break;
    }
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-5">
      {/* 1. Nhịp tim (Heart Rate) */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/80 p-3.5 sm:p-5 lg:p-6 shadow-sm hover:border-slate-700 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 sm:gap-1.5 truncate">
              <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-400 shrink-0" />
              <span className="truncate">Nhịp Tim (BPM)</span>
            </span>
            <div className="p-1.5 sm:p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
              <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${bpm > 0 ? 'animate-pulse text-rose-500' : ''}`} />
            </div>
          </div>

          <div className="mt-2.5 sm:mt-4 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white font-mono">
              {bpm > 0 ? bpm : '--'}
            </span>
            <span className="text-xs sm:text-sm font-medium text-slate-400">bpm</span>
          </div>
        </div>

        <div className="mt-3 sm:mt-4 flex items-center justify-between pt-2.5 sm:pt-3 border-t border-slate-800/80 text-[10px] sm:text-xs">
          <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md font-medium border whitespace-nowrap ${hrStatusColor}`}>
            {bpm > 0 ? hrStatusText : 'Chờ cảm biến'}
          </span>
          <span className="text-slate-500 font-mono hidden sm:inline">
            {thresholds.hrMin}-{thresholds.hrMax}
          </span>
        </div>
      </div>

      {/* 2. Nồng độ SpO2 */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/80 p-3.5 sm:p-5 lg:p-6 shadow-sm hover:border-slate-700 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 sm:gap-1.5 truncate">
              <Wind className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">Oxy (SpO₂)</span>
            </span>
            <div className="p-1.5 sm:p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
              <Wind className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
            </div>
          </div>

          <div className="mt-2.5 sm:mt-4 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white font-mono">
              {spo2 > 0 ? spo2 : '--'}
            </span>
            <span className="text-xs sm:text-sm font-medium text-slate-400">%</span>
          </div>
        </div>

        <div className="mt-3 sm:mt-4 flex items-center justify-between pt-2.5 sm:pt-3 border-t border-slate-800/80 text-[10px] sm:text-xs">
          <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md font-medium border whitespace-nowrap ${spo2StatusColor}`}>
            {spo2 > 0 ? spo2StatusText : 'Chờ cảm biến'}
          </span>
          <span className="text-slate-500 font-mono hidden sm:inline">
            ≥{thresholds.spo2Min}%
          </span>
        </div>
      </div>

      {/* 3. Tư thế làm việc */}
      <div className={`relative overflow-hidden rounded-2xl p-3.5 sm:p-5 lg:p-6 shadow-sm border transition-all flex flex-col justify-between ${postureCardBg}`}>
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1 sm:gap-1.5 truncate">
              <span className="truncate">Tư Thế Ngồi</span>
            </span>
            <div className="p-1.5 sm:p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 shrink-0">
              {postureIcon}
            </div>
          </div>

          <div className="mt-2 sm:mt-3">
            <div className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-bold border shadow-sm whitespace-nowrap ${postureBadgeStyle}`}>
              <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-current ${!isAbsent ? 'animate-ping' : ''}`}></span>
              <span className="truncate max-w-[130px] sm:max-w-none">{displayedPostureLabel}</span>
            </div>
            {isAbsent ? (
              <p className="text-[10px] sm:text-[11px] text-amber-300/90 font-medium mt-1 truncate">
                Chưa có người ngồi
              </p>
            ) : telemetry.postureWarning ? (
              <p className="text-[10px] sm:text-[11px] text-rose-300 font-medium mt-1 truncate">
                {telemetry.postureWarning}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 sm:mt-4 flex items-center justify-between pt-2.5 sm:pt-3 border-t border-slate-800/80 text-[10px] sm:text-xs text-slate-400">
          <span className="truncate">{isAbsent ? 'Vắng mặt' : (telemetry.angleNeck !== undefined ? `Góc: ${telemetry.angleNeck}°` : 'AI Vision')}</span>
          <span className={`font-mono whitespace-nowrap ${isAbsent ? 'text-amber-400' : 'text-emerald-400'}`}>
            {isAbsent ? 'Ghế trống' : `${telemetry.confidence ?? 95}% tin cậy`}
          </span>
        </div>
      </div>

      {/* 4. Trạng thái giám sát & Monitor Zone */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/80 p-3.5 sm:p-5 lg:p-6 shadow-sm hover:border-slate-700 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 sm:gap-1.5 truncate">
              <Target className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Vùng Giám Sát</span>
            </span>
            <div className={`p-1.5 sm:p-2.5 rounded-xl border shrink-0 ${
              inZone ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {inZone ? <UserCheck className="w-4 h-4 sm:w-5 sm:h-5" /> : <UserX className="w-4 h-4 sm:w-5 sm:h-5" />}
            </div>
          </div>

          <div className="mt-2.5 sm:mt-4 flex items-baseline gap-1.5 sm:gap-2">
            <span className={`text-base sm:text-xl lg:text-2xl font-bold tracking-tight font-sans whitespace-nowrap ${inZone ? 'text-emerald-300' : 'text-amber-300'}`}>
              {trackingActive ? (inZone ? 'TRONG VÙNG' : 'NGOÀI VÙNG') : 'CHỜ NGỒI'}
            </span>
          </div>
        </div>

        <div className="mt-3 sm:mt-4 flex items-center justify-between pt-2.5 sm:pt-3 border-t border-slate-800/80 text-[10px] sm:text-xs">
          <span className="text-slate-400 truncate">Pi 4</span>
          <span className={`font-semibold whitespace-nowrap ${
            telemetry.isStale
              ? 'text-amber-400'
              : inZone ? 'text-emerald-400' : 'text-slate-500'
          }`}>
            {telemetry.isStale
              ? '⚠️ Offline'
              : inZone ? 'Đang theo dõi' : 'Tạm dừng'}
          </span>
        </div>
      </div>
    </div>
  );
};
