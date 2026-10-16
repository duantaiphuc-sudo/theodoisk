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
  Activity,
  CameraOff
} from 'lucide-react';
import { HealthTelemetry, AlertThresholds } from '../types';

interface MetricCardsProps {
  telemetry: HealthTelemetry;
  thresholds: AlertThresholds;
  hasData?: boolean;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ telemetry, thresholds, hasData = true }) => {
  const { bpm, spo2, postureStatus, postureLabel, trackingActive, inZone } = telemetry;

  // Nếu thực sự chưa có gói tin nào từ Pi thì mới hiện Empty State
  const isUnassigned = telemetry.postureLabel === 'Tài khoản chưa được gán thiết bị' || telemetry.source === 'Chưa gán thiết bị';
  const isEmpty = !hasData || isUnassigned;
  if (isEmpty) {
    const emptySubtext = isUnassigned ? 'Chưa gán thiết bị' : 'Chờ MAX30102';
    const statusNote = isUnassigned ? 'Cần gán Node' : 'Chưa có dữ liệu';

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
            <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md font-medium border whitespace-nowrap ${
              isUnassigned ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {emptySubtext}
            </span>
            <span className="text-slate-400 font-mono hidden sm:inline">{statusNote}</span>
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
            <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md font-medium border whitespace-nowrap ${
              isUnassigned ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {emptySubtext}
            </span>
            <span className="text-slate-400 font-mono hidden sm:inline">{statusNote}</span>
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
                {isUnassigned ? (
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
                ) : (
                  <UserX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                )}
              </div>
            </div>
            <div className="mt-2 sm:mt-3">
              <div className={`inline-flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-semibold border whitespace-nowrap ${
                isUnassigned ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {isUnassigned ? 'Tài khoản chưa được gán thiết bị' : 'Chờ Camera AI'}
              </div>
            </div>
          </div>
          <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs text-slate-400">
            <span>{isUnassigned ? 'Chưa gán Node' : 'Chưa nhận dạng'}</span>
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
                {isUnassigned ? 'CHƯA GÁN NODE' : 'CHỜ KẾT NỐI'}
              </span>
            </div>
          </div>
          <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs text-slate-400">
            <span>{isUnassigned ? 'Vui lòng gán thiết bị' : 'Nguồn: Pi 4'}</span>
            <span className="whitespace-nowrap">{isUnassigned ? 'Chưa kích hoạt' : 'Chưa bắt đầu'}</span>
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
  const isCameraError = 
    (postureStatus === -1 && trackingActive === false) ||
    Boolean(postureLabel && (
      postureLabel.toLowerCase().includes('lỗi') || 
      postureLabel.toLowerCase().includes('error') || 
      postureLabel.toLowerCase().includes('mất camera') ||
      postureLabel.toLowerCase().includes('cam')
    ));
  const isStanding = !isCameraError && (postureStatus === 5 || Boolean(postureLabel && postureLabel.toLowerCase().includes('đứng')));
  const isVerifying = !isCameraError && !isStanding && postureStatus === -1 && trackingActive === true;
  const isOutOfZone = !isCameraError && !isStanding && !isVerifying && (inZone === false || Boolean(postureLabel && postureLabel.toLowerCase().includes('ngoài vùng')));
  const isAbsent = !isCameraError && !isStanding && !isVerifying && (postureStatus === 2 || isOutOfZone || Boolean(postureLabel && postureLabel.toLowerCase().includes('vắng')));

  let postureCardBg = 'bg-white border-slate-200';
  let postureBadgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let postureIcon = <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
  let displayedPostureLabel = postureLabel || 'Tư thế ĐÚNG';

  if (isCameraError) {
    postureCardBg = 'bg-rose-50/70 border-rose-200';
    postureBadgeStyle = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
    postureIcon = <CameraOff className="w-5 h-5 text-rose-600" />;
    displayedPostureLabel = postureLabel && postureLabel.toLowerCase().includes('lỗi')
      ? (postureLabel.toLowerCase() === 'lỗi ai' ? 'Lỗi kết nối Camera AI' : postureLabel)
      : 'Lỗi kết nối Camera AI';
  } else if (isStanding) {
    postureCardBg = 'bg-indigo-50/50 border-indigo-200';
    postureBadgeStyle = 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold';
    postureIcon = <Activity className="w-5 h-5 text-indigo-600" />;
    displayedPostureLabel = 'Tư thế ĐỨNG (Làm việc)';
  } else if (isVerifying) {
    postureCardBg = 'bg-sky-50/50 border-sky-200';
    postureBadgeStyle = 'bg-sky-100 text-sky-800 border-sky-300 font-bold';
    postureIcon = <Clock className="w-5 h-5 text-sky-600 animate-spin" />;
    displayedPostureLabel = 'Đang xác nhận tư thế...';
  } else if (isAbsent) {
    postureCardBg = 'bg-slate-50 border-slate-200';
    postureBadgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
    postureIcon = <UserX className="w-5 h-5 text-slate-500" />;
    displayedPostureLabel = inZone === false ? 'Ngoài vùng quan sát' : 'Vắng / Không phát hiện';
  } else {
    switch (postureStatus) {
      case 0:
        postureCardBg = 'bg-emerald-50/40 border-emerald-200';
        postureBadgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300';
        postureIcon = <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
        displayedPostureLabel = 'Tư thế ĐÚNG';
        break;
      case 1:
        postureCardBg = 'bg-rose-50/50 border-rose-200';
        postureBadgeStyle = 'bg-rose-100 text-rose-800 border-rose-300';
        postureIcon = <AlertTriangle className="w-5 h-5 text-rose-600" />;
        displayedPostureLabel = 'Tư thế SAI (Cúi gù)';
        break;
      case 3:
        postureCardBg = 'bg-rose-100/70 border-rose-300 animate-pulse';
        postureBadgeStyle = 'bg-rose-600 text-white border-rose-600 font-bold shadow-xs';
        postureIcon = <AlertTriangle className="w-5 h-5 text-rose-600 animate-bounce" />;
        displayedPostureLabel = 'SAI TƯ THẾ LÂU (≥120s)';
        break;
      case 4:
        postureCardBg = 'bg-amber-50/60 border-amber-200';
        postureBadgeStyle = 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
        postureIcon = <Clock className="w-5 h-5 text-amber-600" />;
        displayedPostureLabel = 'NGỒI QUÁ LÂU';
        break;
      default:
        postureCardBg = 'bg-white border-slate-200';
        postureBadgeStyle = 'bg-slate-100 text-slate-600 border-slate-200';
        postureIcon = <UserX className="w-5 h-5 text-slate-500" />;
        displayedPostureLabel = postureLabel || 'Chưa nhận dạng';
        break;
    }
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-5">
      {/* 1. Nhịp tim */}
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
              <span className={`w-1.5 h-1.5 rounded-full bg-current ${!isAbsent && !isCameraError ? 'animate-ping' : ''}`}></span>
              <span className="whitespace-nowrap">{displayedPostureLabel}</span>
            </div>
            {isCameraError ? (
              <p className="text-[10px] sm:text-[11px] text-rose-700 font-medium mt-1 leading-snug">
                Camera bị ngắt kết nối USB / Không thể mở luồng Video
              </p>
            ) : isAbsent ? (
              <p className="text-[10px] sm:text-[11px] text-amber-700 font-medium mt-1 leading-snug">
                Chưa có người ngồi
              </p>
            ) : isVerifying ? (
              <p className="text-[10px] sm:text-[11px] text-sky-700 font-medium mt-1 leading-snug flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping"></span>
                <span>YOLO11n-Pose đang tích lũy dữ liệu</span>
              </p>
            ) : isStanding ? (
              <p className="text-[10px] sm:text-[11px] text-indigo-700 font-medium mt-1 leading-snug">
                Đang đứng làm việc (Sit-Stand Mode)
              </p>
            ) : telemetry.postureWarning ? (
              <p className="text-[10px] sm:text-[11px] text-rose-600 font-medium mt-1 leading-snug">
                {telemetry.postureWarning}
              </p>
            ) : (
              <p className="text-[10px] sm:text-[11px] text-emerald-700 font-medium mt-1 leading-snug">
                Cột sống tự nhiên chuẩn công thái học
              </p>
            )}
          </div>
        </div>

        <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs text-slate-500">
          <span className="truncate">{isCameraError ? 'Lỗi phần cứng' : isAbsent ? 'Ngoài vùng' : (telemetry.angleNeck !== undefined ? `Góc: ${telemetry.angleNeck}°` : 'AI Vision')}</span>
          <span className={`font-mono whitespace-nowrap font-medium ${isCameraError ? 'text-rose-600' : isAbsent ? 'text-slate-500' : 'text-emerald-700'}`}>
            {isCameraError ? 'CAM_ERR' : isAbsent ? 'Ghế trống' : `${telemetry.confidence ?? 95}%`}
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
              isCameraError ? 'bg-rose-50 border-rose-200 text-rose-600' :
              inZone ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-amber-50 border-amber-200 text-amber-600'
            }`}>
              {isCameraError ? <CameraOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : inZone ? <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <UserX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </div>
          </div>

          <div className="mt-2 sm:mt-4 flex items-baseline gap-1.5 sm:gap-2">
            <span className={`text-sm sm:text-lg lg:text-xl font-bold tracking-tight font-sans whitespace-nowrap ${
              isCameraError ? 'text-rose-700' : inZone ? 'text-emerald-700' : 'text-amber-700'
            }`}>
              {isCameraError ? 'MẤT KẾT NỐI CAM' : trackingActive ? (inZone ? 'TRONG VÙNG' : 'NGOÀI VÙNG') : 'CHỜ NGỒI'}
            </span>
          </div>
        </div>

        <div className="mt-2.5 sm:mt-4 flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-100 text-[10px] sm:text-xs">
          <span className="text-slate-500 truncate">Pi 4</span>
          <span className={`font-semibold whitespace-nowrap ${
            isCameraError ? 'text-rose-600' :
            telemetry.isStale
              ? 'text-amber-700'
              : inZone ? 'text-emerald-700' : 'text-slate-400'
          }`}>
            {isCameraError ? '⚠️ Cảnh báo Cam' : telemetry.isStale ? '⚠️ Offline' : inZone ? 'Đang theo dõi' : 'Tạm dừng'}
          </span>
        </div>
      </div>
    </div>
  );
};