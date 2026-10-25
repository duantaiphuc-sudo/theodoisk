import React, { useState } from 'react';
import { AuthUser, TimeCalculations, AlertThresholds } from '../types';
import { 
  Calendar, 
  ArrowUpRight, 
  RotateCcw,
  Activity,
  Award,
  Sparkles,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { OHPSCalculationResult } from '../utils/ohpsCalculator';

interface GreetingGoalCardProps {
  currentUser: AuthUser | null;
  timeStats: TimeCalculations;
  thresholds: AlertThresholds;
  onOpenThresholds?: () => void;
  onOpenPiGuide?: () => void;
  onResetTimers?: () => void;
  className?: string;
  wallpaperUrl?: string;
  ohpsData?: OHPSCalculationResult;
  onOpenOHPSModal?: () => void;
}

export const GreetingGoalCard: React.FC<GreetingGoalCardProps> = ({
  currentUser,
  timeStats,
  thresholds,
  onResetTimers,
  className,
  wallpaperUrl,
  ohpsData,
  onOpenOHPSModal,
}) => {
  // Goal Modes: 'ohps' (Điểm năng suất) | 'standing' (Mục tiêu đứng) | 'sitting' (Giới hạn ngồi)
  const [goalMode, setGoalMode] = useState<'ohps' | 'standing' | 'sitting'>('ohps');

  // Format date in Vietnamese (e.g. "Thứ Năm, 22/10")
  const today = new Date();
  const dateFormatted = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit'
  }).format(today);
  const displayDate = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);

  // Time-based greeting
  const hour = today.getHours();
  const greetingTime = hour < 12 
    ? 'Chào buổi sáng' 
    : hour < 18 
    ? 'Chào buổi chiều' 
    : 'Chào buổi tối';

  const userDisplayName = currentUser?.fullName?.trim() || currentUser?.username || 'Bạn';

  // Standing Goal metrics
  const targetStandingSec = thresholds.standingTargetSec || 300; // default 5 mins
  const targetStandingMin = Math.max(1, Math.round(targetStandingSec / 60));
  const standingSeconds = timeStats.standingSeconds || 0;
  const standingMinutes = Math.floor(standingSeconds / 60);
  const standingPercent = Math.min(100, Math.round((standingSeconds / targetStandingSec) * 100));

  // Sitting Limit metrics
  const maxSittingSec = thresholds.longSittingSec || 1800; // default 30 mins
  const continuousSittingSec = timeStats.continuousSittingSeconds || 0;
  const continuousSittingMin = Math.floor(continuousSittingSec / 60);
  const maxSittingMin = Math.max(1, Math.round(maxSittingSec / 60));
  const sittingPercent = Math.min(100, Math.round((continuousSittingSec / maxSittingSec) * 100));

  // OHPS metrics
  const ohpsScore = ohpsData?.ohpsScore ?? 85;
  const ohpsLevel = ohpsData?.evaluation.level ?? 'Rất tốt';

  // Circular gauge math (radius = 42, circumference = 2 * PI * 42 ≈ 263.89)
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  
  const currentPercent = goalMode === 'ohps' 
    ? ohpsScore 
    : goalMode === 'standing' 
    ? standingPercent 
    : sittingPercent;

  const strokeDashoffset = circumference - (Math.min(100, currentPercent) / 100) * circumference;

  const strokeColor = goalMode === 'ohps'
    ? (ohpsScore >= 80 ? '#2dd4bf' : ohpsScore >= 70 ? '#fbbf24' : '#f43f5e')
    : goalMode === 'standing'
    ? '#2dd4bf'
    : (sittingPercent >= 100 ? '#f43f5e' : '#38bdf8');

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-white/40 shadow-xl flex flex-col justify-between p-4 sm:p-5 lg:p-6 group transition-all text-white ${className || ''}`}>
      {/* 1. 100% Sharp & Crisp Background Image - ZERO blur, ZERO darkening overlay across whole photo */}
      <img 
        src={wallpaperUrl || '/nenweb.png'} 
        alt="Health Office Background" 
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none transition-transform duration-700"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/nenweb.png';
        }}
      />

      {/* 2. Main Content Container (Zero blur overlay - 100% sharp clear background image) */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5 w-full items-stretch">
        
        {/* Left Section: Transparent container with high-contrast text drop shadows */}
        <div className="md:col-span-7 lg:col-span-8 p-3 sm:p-4 rounded-2xl bg-black/25 sm:bg-black/20 border border-white/20 shadow-lg flex flex-col justify-between space-y-3 h-full">
          {/* Header Row: Date Chip + OHPS Quick Badge */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 border border-white/25 text-white/95 text-xs font-semibold shadow-xs">
              <Calendar className="w-3.5 h-3.5 text-teal-300" />
              <span className="whitespace-nowrap">{displayDate}</span>
            </div>

            {onOpenOHPSModal && (
              <button
                type="button"
                onClick={onOpenOHPSModal}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-400/20 hover:bg-teal-400/30 border border-teal-400/40 text-teal-300 text-xs font-bold transition cursor-pointer shadow-xs active:scale-95"
                title="Bấm để xem chi tiết điểm năng suất OHPS"
              >
                <Award className="w-3.5 h-3.5 text-teal-400" />
                <span>OHPS: {ohpsScore}đ • {ohpsLevel}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Heading */}
          <div>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
              {greetingTime},{' '}
              <span className="text-teal-300 drop-shadow-[0_0_14px_rgba(45,212,191,0.6)]">
                {userDisplayName}
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-100 mt-1.5 italic leading-relaxed drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">
              &ldquo;Bạn không cần hoàn hảo, bạn chỉ cần bắt đầu ngồi đúng tư thế hôm nay.&rdquo;
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-1 flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Glowing Mint Pill Button: Switch Donut Widget Mode */}
            <button
              type="button"
              onClick={() => {
                setGoalMode(prev => {
                  if (prev === 'ohps') return 'standing';
                  if (prev === 'standing') return 'sitting';
                  return 'ohps';
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs font-bold bg-teal-400 hover:bg-teal-300 text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.5)] transition-all cursor-pointer whitespace-nowrap active:scale-95"
            >
              <Award className="w-3.5 h-3.5" />
              <span>
                {goalMode === 'ohps' 
                  ? 'Đổi: Mục tiêu đứng' 
                  : goalMode === 'standing' 
                  ? 'Đổi: Giới hạn ngồi' 
                  : 'Đổi: Điểm năng suất (OHPS)'}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>

            {/* Reset Timers Button */}
            {onResetTimers && (
              <button
                type="button"
                onClick={onResetTimers}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full text-xs font-semibold bg-black/40 hover:bg-black/60 text-white border border-white/25 shadow-xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-200" />
                <span>Đặt lại bộ đếm</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Section: Circular Donut Widget (OHPS Điểm Năng Suất / Đứng / Ngồi) */}
        <div className="md:col-span-5 lg:col-span-4 p-3.5 sm:p-4 rounded-2xl bg-black/35 border border-white/25 text-white shadow-lg flex flex-col items-center justify-between text-center h-full">
          {/* Donut Gauge Header Toggle */}
          <button
            type="button"
            onClick={() => {
              setGoalMode(prev => {
                if (prev === 'ohps') return 'standing';
                if (prev === 'standing') return 'sitting';
                return 'ohps';
              });
            }}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-teal-300 hover:text-teal-200 transition drop-shadow-sm cursor-pointer"
            title="Nhấp để chuyển đổi giữa Điểm Năng Suất, Mục Tiêu Đứng và Giới Hạn Ngồi"
          >
            {goalMode === 'ohps' ? (
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            ) : (
              <Activity className="w-3.5 h-3.5 text-teal-400" />
            )}
            <span>
              {goalMode === 'ohps' 
                ? 'ĐIỂM NĂNG SUẤT (OHPS)' 
                : goalMode === 'standing' 
                ? 'MỤC TIÊU ĐỨNG' 
                : 'GIỚI HẠN NGỒI'}
            </span>
          </button>

          {/* Circular Donut Gauge - Clickable to open OHPS detail */}
          <div 
            onClick={() => {
              if (goalMode === 'ohps' && onOpenOHPSModal) {
                onOpenOHPSModal();
              }
            }}
            className={`relative w-24 h-24 sm:w-28 sm:h-28 my-auto flex items-center justify-center transition-transform hover:scale-105 ${
              goalMode === 'ohps' ? 'cursor-pointer' : ''
            }`}
            title={goalMode === 'ohps' ? 'Nhấp để xem chi tiết điểm năng suất' : undefined}
          >
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              {/* Background track circle */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.15)"
                strokeWidth="8"
              />
              {/* Progress animated circle */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={strokeColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-700 ease-out"
              />
            </svg>

            {/* Value in Center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white leading-none">
                {goalMode === 'ohps' 
                  ? ohpsScore 
                  : goalMode === 'standing' 
                  ? standingMinutes 
                  : continuousSittingMin}
              </span>
              <span className="text-[10px] text-slate-300 font-medium mt-1">
                {goalMode === 'ohps'
                  ? '/ 100 điểm'
                  : `/ ${goalMode === 'standing' ? targetStandingMin : maxSittingMin} phút`}
              </span>
            </div>
          </div>

          {/* Subtitle below donut */}
          <div className="w-full">
            {goalMode === 'ohps' ? (
              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-200">
                  Xếp loại: <span className="text-teal-300">{ohpsLevel}</span>
                </div>
                {onOpenOHPSModal && (
                  <button
                    type="button"
                    onClick={onOpenOHPSModal}
                    className="text-[11px] text-teal-300 hover:text-teal-200 font-bold underline transition cursor-pointer flex items-center justify-center gap-1 mx-auto"
                  >
                    <span>Xem chi tiết điểm năng suất</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div className="text-xs font-bold text-slate-200">
                  Mục tiêu hôm nay
                </div>
                <div className="text-[11px] text-teal-300 font-semibold font-mono mt-0.5">
                  {currentPercent}% hoàn thành
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
