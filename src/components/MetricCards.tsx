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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Nhịp tim (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-slate-500" />
              Nhịp Tim (BPM)
            </span>
            <div className="p-2.5 rounded-xl bg-slate-800/60 text-slate-500 border border-slate-700/60">
              <Heart className="w-5 h-5 text-slate-500" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-slate-600 font-mono">--</span>
            <span className="text-sm font-medium text-slate-500">bpm</span>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
              Chờ cảm biến MAX30102
            </span>
            <span className="text-xs text-slate-500 font-mono">Chưa có dữ liệu</span>
          </div>
        </div>

        {/* 2. Nồng độ SpO2 (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-slate-500" />
              Nồng độ Oxy (SpO₂)
            </span>
            <div className="p-2.5 rounded-xl bg-slate-800/60 text-slate-500 border border-slate-700/60">
              <Wind className="w-5 h-5 text-slate-500" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-slate-600 font-mono">--</span>
            <span className="text-sm font-medium text-slate-500">%</span>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
              Chờ cảm biến MAX30102
            </span>
            <span className="text-xs text-slate-500 font-mono">Chưa có dữ liệu</span>
          </div>
        </div>

        {/* 3. Tư thế làm việc (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              Tư Thế Làm Việc
            </span>
            <div className="p-2.5 rounded-xl bg-slate-800/60 text-slate-500 border border-slate-700/60">
              <UserX className="w-5 h-5 text-slate-500" />
            </div>
          </div>
          <div className="mt-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
              Chờ Camera AI từ Pi 4
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-500">
            <span>Chưa nhận dạng</span>
            <span className="font-mono">--%</span>
          </div>
        </div>

        {/* 4. Vùng Giám Sát (Empty) */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-slate-500" />
              Vùng Giám Sát (Zone)
            </span>
            <div className="p-2.5 rounded-xl bg-slate-800/60 text-slate-500 border border-slate-700/60">
              <UserX className="w-5 h-5 text-slate-500" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-slate-500 font-sans">
              CHỜ KẾT NỐI
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
            <span className="text-xs text-slate-500">Nguồn: Chờ Pi 4</span>
            <span className="text-xs text-slate-500">Chưa bắt đầu</span>
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
  let postureCardBg = 'bg-slate-900/70 border-slate-800';
  let postureBadgeStyle = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  let postureIcon = <CheckCircle2 className="w-5 h-5 text-emerald-400" />;

  switch (postureStatus) {
    case 0: // Đúng
      postureCardBg = 'bg-emerald-950/20 border-emerald-800/40';
      postureBadgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      postureIcon = <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      break;
    case 1: // Sai
      postureCardBg = 'bg-rose-950/25 border-rose-800/50';
      postureBadgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      postureIcon = <AlertTriangle className="w-5 h-5 text-rose-400" />;
      break;
    case 3: // Sai lâu
      postureCardBg = 'bg-rose-950/40 border-rose-600/70 animate-pulse';
      postureBadgeStyle = 'bg-rose-600/30 text-rose-200 border-rose-500/60 font-bold';
      postureIcon = <AlertTriangle className="w-5 h-5 text-rose-400 animate-bounce" />;
      break;
    case 4: // Ngồi lâu
      postureCardBg = 'bg-amber-950/25 border-amber-800/50';
      postureBadgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold';
      postureIcon = <Clock className="w-5 h-5 text-amber-400" />;
      break;
    default: // Vắng
      postureCardBg = 'bg-slate-900/60 border-slate-800';
      postureBadgeStyle = 'bg-slate-800 text-slate-400 border-slate-700';
      postureIcon = <UserX className="w-5 h-5 text-slate-400" />;
      break;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Nhịp tim (Heart Rate) */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/70 border border-slate-800 p-5 shadow-sm hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            Nhịp Tim (BPM)
          </span>
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <Heart className={`w-5 h-5 ${bpm > 0 ? 'animate-pulse text-rose-500' : ''}`} />
          </div>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tight text-white font-mono">
            {bpm > 0 ? bpm : '--'}
          </span>
          <span className="text-sm font-medium text-slate-400">bpm</span>
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${hrStatusColor}`}>
            {bpm > 0 ? hrStatusText : 'Chờ cảm biến'}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            Ngưỡng: {thresholds.hrMin}-{thresholds.hrMax}
          </span>
        </div>
      </div>

      {/* 2. Nồng độ SpO2 */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/70 border border-slate-800 p-5 shadow-sm hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Wind className="w-3.5 h-3.5 text-sky-400" />
            Nồng độ Oxy (SpO₂)
          </span>
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Wind className="w-5 h-5 text-sky-400" />
          </div>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tight text-white font-mono">
            {spo2 > 0 ? spo2 : '--'}
          </span>
          <span className="text-sm font-medium text-slate-400">%</span>
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${spo2StatusColor}`}>
            {spo2 > 0 ? spo2StatusText : 'Chờ cảm biến'}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            Tối thiểu: ≥{thresholds.spo2Min}%
          </span>
        </div>
      </div>

      {/* 3. Tư thế làm việc */}
      <div className={`relative overflow-hidden rounded-2xl p-5 shadow-sm border transition-all ${postureCardBg}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            Tư Thế Làm Việc
          </span>
          <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
            {postureIcon}
          </div>
        </div>

        <div className="mt-3">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold border shadow-sm ${postureBadgeStyle}`}>
            <span className="w-2 h-2 rounded-full bg-current animate-ping"></span>
            {postureLabel}
          </div>
          {telemetry.postureWarning && (
            <p className="text-[11px] text-rose-300 font-medium mt-1.5 line-clamp-1">
              {telemetry.postureWarning}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400">
          <span>{telemetry.angleNeck !== undefined ? `Góc cổ: ${telemetry.angleNeck}°` : 'AI Vision MediaPipe'}</span>
          <span className="font-mono text-emerald-400">{telemetry.confidence ?? 95}% độ tin cậy</span>
        </div>
      </div>

      {/* 4. Trạng thái giám sát & Monitor Zone */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/70 border border-slate-800 p-5 shadow-sm hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-amber-400" />
            Vùng Giám Sát (Zone)
          </span>
          <div className={`p-2.5 rounded-xl border ${
            inZone ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            {inZone ? <UserCheck className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
          </div>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <span className={`text-2xl font-bold tracking-tight font-sans ${inZone ? 'text-emerald-300' : 'text-amber-300'}`}>
            {trackingActive ? (inZone ? 'ĐANG TRONG VÙNG' : 'NGOÀI VÙNG') : 'CHỜ NGƯỜI NGỒI'}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
          <span className="text-xs text-slate-400">Nguồn: {source || 'Raspberry Pi 4'}</span>
          <span className={`text-xs font-semibold ${
            telemetry.isStale
              ? 'text-amber-400'
              : inZone ? 'text-emerald-400' : 'text-slate-500'
          }`}>
            {telemetry.isStale
              ? '⚠️ Cũ trên Cloud (Offline)'
              : inZone ? 'Giám sát hoạt động' : 'Tạm dừng đo'}
          </span>
        </div>
      </div>
    </div>
  );
};
