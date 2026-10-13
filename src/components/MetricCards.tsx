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
  const { bpm, spo2, postureStatus, postureLabel, trackingActive, inZone } = telemetry;

  // If no data has arrived yet, show explicit empty state
  const isEmpty = !hasData || (telemetry.postureStatus === -1 && bpm === 0 && spo2 === 0 && !telemetry.trackingActive && !telemetry.image);
  if (isEmpty) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-5">
        {/* 1. Nhịp tim (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-3 sm:p-5 lg:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                Nhịp Tim
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center shrink-0">
                <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
              </div>
            </div>
            <div className="mt-2 sm:mt-4 flex items-baseline gap-1.5 sm:gap-2">
              <span className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-400 font-mono">--</span>
              <span className="text-xs sm:text-sm font-medium text-slate-400">bpm</span>
            </div>
          </div>
          <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs">
            <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
              Chờ MAX30102
            </span>
            <span className="text-slate-400 font-mono hidden sm:inline">Chưa có dữ liệu</span>
          </div>
        </div>

        {/* 2. Nồng độ SpO2 (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-3 sm:p-5 lg:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                SpO₂ Oxy
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center shrink-0">
                <Wind className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
              </div>
            </div>
            <div className="mt-2 sm:mt-4 flex items-baseline gap-1.5 sm:gap-2">
              <span className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-400 font-mono">--</span>
              <span className="text-xs sm:text-sm font-medium text-slate-400">%</span>
            </div>
          </div>
          <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs">
            <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
              Chờ MAX30102
            </span>
            <span className="text-slate-400 font-mono hidden sm:inline">Chưa có dữ liệu</span>
          </div>
        </div>

        {/* 3. Tư thế làm việc (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-3 sm:p-5 lg:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                Tư Thế Ngồi
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center shrink-0">
                <UserX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3">
              <div className="inline-flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                Chờ Camera AI
              </div>
            </div>
          </div>
          <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs text-slate-400">
            <span>Chưa nhận dạng</span>
            <span className="font-mono">--%</span>
          </div>
        </div>

        {/* 4. Vùng Giám Sát (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-3 sm:p-5 lg:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                Vùng Giám Sát
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center shrink-0">
                <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
              </div>
            </div>
            <div className="mt-2 sm:mt-4 flex items-baseline gap-2">
              <span className="text-sm sm:text-lg lg:text-xl font-bold tracking-tight text-slate-400 font-sans whitespace-nowrap">
                CHỜ KẾT NỐI
              </span>
            </div>
          </div>
          <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs text-slate-400">
            <span>Nguồn: Pi 4</span>
            <span className="whitespace-nowrap">Chưa bắt đầu</span>
          </div>
        </div>
      </div>
    );
  }

  // Evaluate Heart rate
  let hrStatusText = 'Bình thường';
  let hrStatusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (bpm > 0) {
    if (bpm < thresholds.hrMin) {
      hrStatusText = 'Nhịp tim chậm';
      hrStatusColor = 'text-amber-700 bg-amber-50 border-amber-200';
    } else if (bpm > thresholds.hrMax) {
      hrStatusText = 'Nhịp tim nhanh';
      hrStatusColor = 'text-rose-700 bg-rose-50 border-rose-200';
    }
  }

  // Evaluate SpO2
  let spo2StatusText = 'Tối ưu';
  let spo2StatusColor = 'text-sky-700 bg-sky-50 border-sky-200';
  if (spo2 > 0) {
    if (spo2 < thresholds.spo2Min) {
      spo2StatusText = 'Thiếu oxy cảnh báo';
      spo2StatusColor = 'text-rose-700 bg-rose-50 border-rose-200';
    } else if (spo2 < 96) {
      spo2StatusText = 'Trung bình';
      spo2StatusColor = 'text-amber-700 bg-amber-50 border-amber-200';
    }
  }

  // Evaluate Posture
  const isOutOfZone = inZone === false || trackingActive === false;
  const isAbsent = postureStatus === 2 || isOutOfZone;

  let postureCardBg = 'bg-white border-slate-200';
  let postureBadgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let postureIcon = <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
  let displayedPostureLabel = postureLabel;

  if (isAbsent) {
    postureCardBg = 'bg-slate-50 border-slate-200';
    postureBadgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
    postureIcon = <UserX className="w-5 h-5 text-slate-500" />;
    displayedPostureLabel = 'Ngoài vùng quan sát';
  } else {
    switch (postureStatus) {
      case 0: // Đúng
        postureCardBg = 'bg-emerald-50/40 border-emerald-200';
        postureBadgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300';
        postureIcon = <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
        displayedPostureLabel = 'Tư thế ĐÚNG';
        break;
      case 5: // Đứng
        postureCardBg = 'bg-indigo-50/50 border-indigo-200';
        postureBadgeStyle = 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold';
        postureIcon = <Activity className="w-5 h-5 text-indigo-600" />;
        displayedPostureLabel = 'Tư thế ĐỨNG (Làm việc)';
        break;
      case 1: // Sai
        postureCardBg = 'bg-rose-50/50 border-rose-200';
        postureBadgeStyle = 'bg-rose-100 text-rose-800 border-rose-300';
        postureIcon = <AlertTriangle className="w-5 h-5 text-rose-600" />;
        displayedPostureLabel = 'Tư thế SAI';
        break;
      case 3: // Sai lâu
        postureCardBg = 'bg-rose-100/70 border-rose-300 animate-pulse';
        postureBadgeStyle = 'bg-rose-600 text-white border-rose-600 font-bold shadow-xs';
        postureIcon = <AlertTriangle className="w-5 h-5 text-rose-600 animate-bounce" />;
        displayedPostureLabel = 'SAI TƯ THẾ LÂU';
        break;
      case 4: // Ngồi lâu
        postureCardBg = 'bg-amber-50/60 border-amber-200';
        postureBadgeStyle = 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
        postureIcon = <Clock className="w-5 h-5 text-amber-600" />;
        displayedPostureLabel = 'NGỒI QUÁ LÂU';
        break;
      default: // Vắng
        postureCardBg = 'bg-white border-slate-200';
        postureBadgeStyle = 'bg-slate-100 text-slate-600 border-slate-200';
        postureIcon = <UserX className="w-5 h-5 text-slate-500" />;
        displayedPostureLabel = 'NGOÀI VÙNG QUAN SÁT';
        break;
    }
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-5">
      {/* 1. Nhịp tim (Heart Rate) */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-3 sm:p-5 lg:p-6 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              Nhịp Tim
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
              <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${bpm > 0 ? 'animate-pulse text-rose-600 fill-rose-500' : ''}`} />
            </div>
          </div>

          <div className="mt-2 sm:mt-4 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 font-mono">
              {bpm > 0 ? bpm : '--'}
            </span>
            <span className="text-xs sm:text-sm font-medium text-slate-500">bpm</span>
          </div>
        </div>

        <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs">
          <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md font-medium border whitespace-nowrap ${hrStatusColor}`}>
            {bpm > 0 ? hrStatusText : 'Chờ cảm biến'}
          </span>
          <span className="text-slate-400 font-mono hidden sm:inline">
            {thresholds.hrMin}-{thresholds.hrMax}
          </span>
        </div>
      </div>

      {/* 2. Nồng độ SpO2 */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-3 sm:p-5 lg:p-6 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              SpO₂ Oxy
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center shrink-0">
              <Wind className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-600" />
            </div>
          </div>

          <div className="mt-2 sm:mt-4 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 font-mono">
              {spo2 > 0 ? spo2 : '--'}
            </span>
            <span className="text-xs sm:text-sm font-medium text-slate-500">%</span>
          </div>
        </div>

        <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs">
          <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md font-medium border whitespace-nowrap ${spo2StatusColor}`}>
            {spo2 > 0 ? spo2StatusText : 'Chờ cảm biến'}
          </span>
          <span className="text-slate-400 font-mono hidden sm:inline">
            ≥{thresholds.spo2Min}%
          </span>
        </div>
      </div>

      {/* 3. Tư thế làm việc */}
      <div className={`relative overflow-hidden rounded-2xl p-3 sm:p-5 lg:p-6 shadow-xs border transition-all flex flex-col justify-between ${postureCardBg}`}>
        <div>
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">
              Tư Thế Ngồi
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
              {postureIcon}
            </div>
          </div>

          <div className="mt-2 sm:mt-3">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold border shadow-2xs whitespace-nowrap ${postureBadgeStyle}`}>
              <span className={`w-1.5 h-1.5 rounded-full bg-current ${!isAbsent ? 'animate-ping' : ''}`}></span>
              <span className="whitespace-nowrap">{displayedPostureLabel}</span>
            </div>
            {isAbsent ? (
              <p className="text-[10px] sm:text-[11px] text-amber-700 font-medium mt-1 leading-snug">
                Chưa có người ngồi
              </p>
            ) : telemetry.postureWarning ? (
              <p className="text-[10px] sm:text-[11px] text-rose-600 font-medium mt-1 leading-snug">
                {telemetry.postureWarning}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs text-slate-500">
          <span className="truncate">{isAbsent ? 'Ngoài vùng' : (telemetry.angleNeck !== undefined ? `Góc: ${telemetry.angleNeck}°` : 'AI Vision')}</span>
          <span className={`font-mono whitespace-nowrap font-medium ${isAbsent ? 'text-slate-500' : 'text-emerald-700'}`}>
            {isAbsent ? 'Ghế trống' : `${telemetry.confidence ?? 95}%`}
          </span>
        </div>
      </div>

      {/* 4. Trạng thái giám sát & Monitor Zone */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-3 sm:p-5 lg:p-6 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              Vùng Giám Sát
            </span>
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center shrink-0 ${
              inZone ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-amber-50 border-amber-200 text-amber-600'
            }`}>
              {inZone ? <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <UserX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </div>
          </div>

          <div className="mt-2 sm:mt-4 flex items-baseline gap-1.5 sm:gap-2">
            <span className={`text-sm sm:text-lg lg:text-xl font-bold tracking-tight font-sans whitespace-nowrap ${inZone ? 'text-emerald-700' : 'text-amber-700'}`}>
              {trackingActive ? (inZone ? 'TRONG VÙNG' : 'NGOÀI VÙNG') : 'CHỜ NGỒI'}
            </span>
          </div>
        </div>

        <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs">
          <span className="text-slate-500 truncate">Pi 4</span>
          <span className={`font-semibold whitespace-nowrap ${
            telemetry.isStale
              ? 'text-amber-700'
              : inZone ? 'text-emerald-700' : 'text-slate-400'
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
