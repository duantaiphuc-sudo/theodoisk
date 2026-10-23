import React from 'react';
import { 
  Heart, 
  Wind, 
  Activity, 
  Target, 
  CheckCircle2, 
  AlertTriangle, 
  UserCheck, 
  UserX, 
  CameraOff,
  Clock
} from 'lucide-react';
import { HealthTelemetry, AlertThresholds } from '../types';

interface NatureMetricGroupProps {
  telemetry: HealthTelemetry;
  thresholds: AlertThresholds;
  hasData?: boolean;
}

export const NatureMetricGroup: React.FC<NatureMetricGroupProps> = ({
  telemetry,
  thresholds,
  hasData = true,
}) => {
  const { bpm, spo2, postureStatus, postureLabel, inZone, trackingActive } = telemetry;

  // Check errors and states
  const isCameraError = 
    (postureStatus === -1 && trackingActive === false) ||
    Boolean(postureLabel && (
      postureLabel.toLowerCase().includes('lỗi') || 
      postureLabel.toLowerCase().includes('error') || 
      postureLabel.toLowerCase().includes('mất camera') ||
      postureLabel.toLowerCase().includes('cam')
    ));
  const isStanding = !isCameraError && (postureStatus === 5 || Boolean(postureLabel && postureLabel.toLowerCase().includes('đứng')));
  const isAbsent = !isCameraError && !isStanding && (postureStatus === 2 || !inZone || Boolean(postureLabel && postureLabel.toLowerCase().includes('vắng')));

  // Heart status
  let hrStatus = 'Chờ cảm biến';
  let hrColor = 'text-rose-400';
  if (bpm > 0) {
    if (bpm < thresholds.hrMin) {
      hrStatus = 'Nhịp tim chậm';
      hrColor = 'text-amber-400';
    } else if (bpm > thresholds.hrMax) {
      hrStatus = 'Nhịp tim nhanh';
      hrColor = 'text-rose-400';
    } else {
      hrStatus = 'Bình thường';
      hrColor = 'text-emerald-400';
    }
  }

  // SpO2 status
  let spo2Status = 'Chờ cảm biến';
  let spo2Color = 'text-sky-400';
  if (spo2 > 0) {
    if (spo2 < thresholds.spo2Min) {
      spo2Status = 'Thiếu oxy';
      spo2Color = 'text-rose-400';
    } else if (spo2 < 96) {
      spo2Status = 'Trung bình';
      spo2Color = 'text-amber-400';
    } else {
      spo2Status = 'Tối ưu';
      spo2Color = 'text-emerald-400';
    }
  }

  // Posture status
  let postureDisplay = 'Chuẩn';
  let postureSub = 'Cột sống chuẩn';
  let postureColor = 'text-emerald-400';
  if (isCameraError) {
    postureDisplay = 'Lỗi Cam';
    postureSub = 'Ngắt kết nối USB';
    postureColor = 'text-rose-400';
  } else if (isStanding) {
    postureDisplay = 'Đang đứng';
    postureSub = 'Giải phóng cột sống';
    postureColor = 'text-indigo-400';
  } else if (isAbsent) {
    postureDisplay = 'Vắng mặt';
    postureSub = 'Ngoài vùng quan sát';
    postureColor = 'text-slate-400';
  } else if (postureStatus === 1 || postureStatus === 3 || postureStatus === 4) {
    postureDisplay = 'Sai tư thế';
    postureSub = 'Cúi gù / Lệch cổ';
    postureColor = 'text-amber-400';
  }

  return (
    <div className="grid grid-cols-2 gap-3 h-full">
      {/* 1. Nhịp tim (Top-Left) */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0c221a] border border-emerald-500/20 p-4 sm:p-5 text-white shadow-xl flex flex-col justify-between group hover:border-emerald-500/40 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-emerald-200/70">
            Nhịp tim
          </span>
          <div className="w-8 h-8 rounded-xl bg-rose-950/70 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <Heart className={`w-4 h-4 ${bpm > 0 ? 'animate-pulse text-rose-400 fill-rose-500' : ''}`} />
          </div>
        </div>

        <div className="my-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight">
              {bpm > 0 ? bpm : '--'}
            </span>
            <span className="text-xs font-mono text-emerald-200/60">bpm</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-emerald-500/10 text-[11px]">
          <span className={`font-medium ${hrColor}`}>{hrStatus}</span>
          <span className="text-emerald-200/40 font-mono text-[10px]">MAX30102</span>
        </div>
      </div>

      {/* 2. SpO2 Oxy (Top-Right) */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0c221a] border border-emerald-500/20 p-4 sm:p-5 text-white shadow-xl flex flex-col justify-between group hover:border-emerald-500/40 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-emerald-200/70">
            SpO₂ Oxy
          </span>
          <div className="w-8 h-8 rounded-xl bg-sky-950/70 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <Wind className="w-4 h-4 text-sky-400" />
          </div>
        </div>

        <div className="my-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight">
              {spo2 > 0 ? `${spo2}%` : '--'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-emerald-500/10 text-[11px]">
          <span className={`font-medium ${spo2Color}`}>{spo2Status}</span>
          <span className="text-emerald-200/40 font-mono text-[10px]">≥95%</span>
        </div>
      </div>

      {/* 3. Tư thế ngồi (Bottom-Left) */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0c221a] border border-emerald-500/20 p-4 sm:p-5 text-white shadow-xl flex flex-col justify-between group hover:border-emerald-500/40 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-emerald-200/70">
            Tư thế ngồi
          </span>
          <div className="w-8 h-8 rounded-xl bg-teal-950/70 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
            <UserCheck className="w-4 h-4 text-teal-400" />
          </div>
        </div>

        <div className="my-2">
          <span className={`text-xl sm:text-2xl font-black tracking-tight ${postureColor}`}>
            {postureDisplay}
          </span>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-emerald-500/10 text-[11px]">
          <span className="text-emerald-200/70 truncate">{postureSub}</span>
          <span className="text-emerald-200/40 font-mono text-[10px]">YOLO11</span>
        </div>
      </div>

      {/* 4. Vùng giám sát (Bottom-Right) */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0c221a] border border-emerald-500/20 p-4 sm:p-5 text-white shadow-xl flex flex-col justify-between group hover:border-emerald-500/40 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-emerald-200/70">
            Vùng giám sát
          </span>
          <div className="w-8 h-8 rounded-xl bg-indigo-950/70 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Target className="w-4 h-4 text-indigo-400" />
          </div>
        </div>

        <div className="my-2">
          <span className={`text-xl sm:text-2xl font-black tracking-tight ${
            inZone ? 'text-teal-400' : 'text-slate-400'
          }`}>
            {inZone ? 'Trong vùng' : 'Ngoài vùng'}
          </span>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-emerald-500/10 text-[11px]">
          <span className="text-emerald-200/70 truncate">{inZone ? 'Đang theo dõi' : 'Vắng mặt'}</span>
          <span className="text-emerald-200/40 font-mono text-[10px]">Pi 4 Cam</span>
        </div>
      </div>
    </div>
  );
};
