import React, { useState } from 'react';
import { AuthUser, TimeCalculations, AlertThresholds } from '../types';
import { 
  Calendar, 
  ArrowUpRight, 
  RotateCcw,
  Activity
} from 'lucide-react';

interface GreetingGoalCardProps {
  currentUser: AuthUser | null;
  timeStats: TimeCalculations;
  thresholds: AlertThresholds;
  onOpenThresholds?: () => void;
  onOpenPiGuide?: () => void;
  onResetTimers?: () => void;
  className?: string;
  wallpaperUrl?: string;
}

export const GreetingGoalCard: React.FC<GreetingGoalCardProps> = ({
  currentUser,
  timeStats,
  thresholds,
  onResetTimers,
  className,
  wallpaperUrl,
}) => {
  const [goalMode, setGoalMode] = useState<'standing' | 'sitting'>('standing');

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

  // Circular gauge math (radius = 42, circumference = 2 * PI * 42 ≈ 263.89)
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const currentPercent = goalMode === 'standing' ? standingPercent : sittingPercent;
  const strokeDashoffset = circumference - (currentPercent / 100) * circumference;

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-white/40 shadow-xl flex flex-col justify-between p-4 sm:p-5 lg:p-6 group transition-all text-white ${className || ''}`}>
      {/* 1. 100% Sharp & Crisp Background Image - ZERO blur, ZERO darkening overlay across whole photo */}
      <img 
        src={wallpaperUrl || '/nenweb.png'} 
        alt="Health Office Background" 
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none transition-transform duration-700 group-hover:scale-102"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/nenweb.png';
        }}
      />

      {/* 2. Main Content Container (Zero blur overlay - 100% sharp clear background image) */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-3.5 sm:gap-4 w-full items-stretch flex-1">
        
        {/* Left Section: Transparent container with high-contrast text drop shadows */}
        <div className="md:col-span-7 lg:col-span-8 p-3.5 sm:p-4 rounded-2xl bg-black/35 border border-white/25 shadow-lg flex flex-col justify-between space-y-3 h-full">
          {/* Date Chip */}
          <div className="self-start inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 border border-white/25 text-white/95 text-xs font-semibold shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-teal-300" />
            <span className="whitespace-nowrap">{displayDate}</span>
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
            {/* Glowing Mint Pill Button */}
            <button
              type="button"
              onClick={() => setGoalMode(prev => prev === 'standing' ? 'sitting' : 'standing')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs font-bold bg-teal-400 hover:bg-teal-300 text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.5)] transition-all cursor-pointer whitespace-nowrap active:scale-95"
            >
              <span>{goalMode === 'standing' ? 'Đổi: Giới hạn ngồi' : 'Đổi: Mục tiêu đứng'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>

            {/* Glass Pill Button */}
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

        {/* Right Section: Compact Donut Goal Widget (NO BLUR, ZERO STREAK/DOTS, EQUAL HEIGHT) */}
        <div className="md:col-span-5 lg:col-span-4 p-3.5 sm:p-4 rounded-2xl bg-black/35 border border-white/25 text-white shadow-lg flex flex-col items-center justify-between text-center h-full">
          {/* Donut Gauge Header */}
          <button
            type="button"
            onClick={() => setGoalMode(prev => prev === 'standing' ? 'sitting' : 'standing')}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-teal-300 hover:text-teal-200 transition drop-shadow-sm cursor-pointer"
            title="Nhấp để đổi chế độ mục tiêu"
          >
            <Activity className="w-3.5 h-3.5 text-teal-400" />
            <span>{goalMode === 'standing' ? 'MỤC TIÊU ĐỨNG' : 'GIỚI HẠN NGỒI'}</span>
          </button>

          {/* Circular Donut Gauge */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 my-auto flex items-center justify-center">
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
                stroke={goalMode === 'standing' ? '#2dd4bf' : (sittingPercent >= 100 ? '#f43f5e' : '#38bdf8')}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-700 ease-out"
              />
            </svg>

            {/* Number in center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white leading-none">
                {goalMode === 'standing' ? standingMinutes : continuousSittingMin}
              </span>
              <span className="text-[10px] text-slate-300 font-medium mt-1">
                / {goalMode === 'standing' ? targetStandingMin : maxSittingMin} phút
              </span>
            </div>
          </div>

          {/* Subtitle below donut */}
          <div>
            <div className="text-xs font-bold text-slate-200">
              Mục tiêu hôm nay
            </div>
            <div className="text-[11px] text-teal-300 font-semibold font-mono mt-0.5">
              {currentPercent}% hoàn thành
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
