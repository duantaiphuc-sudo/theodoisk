import React, { useState } from 'react';
import { AuthUser, TimeCalculations, AlertThresholds } from '../types';
import { 
  Calendar, 
  ArrowUpRight, 
  RotateCcw,
  Flame, 
  CheckCircle2, 
  Clock, 
  Activity,
  UserCheck
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

  // Format date in Vietnamese (e.g. "Thứ Tư, 21/10")
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

  // 14-day dots mock activity visualization
  const pastDays = [
    true, true, false, true, true, true, false,
    true, true, true, true, false, true, currentPercent >= 50
  ];

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-slate-700/60 shadow-lg min-h-[290px] flex flex-col justify-between p-5 sm:p-6 lg:p-7 group transition-all text-white ${className || ''}`}>
      {/* 1. Full Sharp Background Image (Dynamic or /nenweb.png) */}
      <img 
        src={wallpaperUrl || '/nenweb.png'} 
        alt="Health Office Ergonomics Background" 
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none transition-transform duration-700 group-hover:scale-105"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/nenweb.png';
        }}
      />

      {/* 2. Rich Dark Translucent Vignette/Gradient Overlay matching reference image */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/92 via-slate-950/80 to-slate-950/55 pointer-events-none" />

      {/* 3. Main Content Container */}
      <div className="relative z-10 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
        {/* Left Section: Date, Greeting, Quote & Quick Actions */}
        <div className="flex-1 min-w-0 space-y-3.5">
          {/* Date Chip */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/15 text-white/90 text-xs font-semibold shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-teal-300" />
            <span>{displayDate}</span>
          </div>

          {/* Heading */}
          <div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
              {greetingTime},{' '}
              <span className="text-teal-300 drop-shadow-[0_0_12px_rgba(45,212,191,0.4)]">
                {userDisplayName}
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300/90 mt-1.5 italic leading-relaxed max-w-lg">
              &ldquo;Bạn không cần hoàn hảo, bạn chỉ cần bắt đầu ngồi đúng tư thế hôm nay.&rdquo;
            </p>
          </div>

          {/* Action Buttons matching the reference image style */}
          <div className="pt-2 flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Glowing Mint Pill Button */}
            <button
              type="button"
              onClick={() => setGoalMode(prev => prev === 'standing' ? 'sitting' : 'standing')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-bold bg-teal-400 hover:bg-teal-300 text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.45)] transition-all cursor-pointer whitespace-nowrap active:scale-95"
            >
              <span>{goalMode === 'standing' ? 'Đổi: Giới hạn ngồi' : 'Đổi: Mục tiêu đứng'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>

            {/* Dark Glass Pill Button */}
            {onResetTimers && (
              <button
                type="button"
                onClick={onResetTimers}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold bg-slate-800/80 hover:bg-slate-700/80 text-white/90 border border-white/15 backdrop-blur-md shadow-xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-300" />
                <span>Đặt lại bộ đếm</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Section: Circular Donut Countdown Widget matching reference image */}
        <div className="shrink-0 w-full lg:w-auto flex justify-center lg:justify-end">
          <div className="w-full sm:w-64 p-4 rounded-3xl bg-slate-950/85 backdrop-blur-md border border-white/10 text-white shadow-xl flex flex-col items-center justify-between text-center">
            {/* Donut Gauge Header / Mode Indicator */}
            <button
              type="button"
              onClick={() => setGoalMode(prev => prev === 'standing' ? 'sitting' : 'standing')}
              className="w-full flex items-center justify-center gap-1 text-[11px] font-bold text-teal-300 hover:text-teal-200 transition mb-2"
              title="Nhấp để đổi chế độ mục tiêu"
            >
              <Activity className="w-3 h-3 text-teal-400" />
              <span>{goalMode === 'standing' ? 'MỤC TIÊU ĐỨNG' : 'GIỚI HẠN NGỒI'}</span>
            </button>

            {/* Circular Donut Gauge */}
            <div className="relative w-28 h-28 my-1 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                {/* Background track circle */}
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.12)"
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

              {/* Number in center matching 0 / 30 phút style */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-black font-mono tracking-tight text-white leading-none">
                  {goalMode === 'standing' ? standingMinutes : continuousSittingMin}
                </span>
                <span className="text-[10px] text-slate-400 font-medium mt-1">
                  / {goalMode === 'standing' ? targetStandingMin : maxSittingMin} phút
                </span>
              </div>
            </div>

            {/* Subtitle below donut */}
            <div className="text-xs font-bold text-slate-200 mt-1">
              Mục tiêu hôm nay
            </div>

            {/* Streak & Weekly Stat Pill */}
            <div className="w-full mt-2.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-white/10 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-bold text-amber-400">
                <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>{standingPercent >= 100 ? '1 ngày' : '0 ngày'}</span>
              </span>
              <span className="text-slate-400 font-mono text-[10px]">
                Tuần: {Math.floor((timeStats.standingSeconds || 0) / 60)}/{targetStandingMin * 7}p
              </span>
            </div>

            {/* 14 Days Micro Dots Tracker */}
            <div className="w-full mt-2.5 pt-2 border-t border-white/10 text-left">
              <div className="text-[10px] text-slate-400 mb-1.5 flex items-center justify-between">
                <span>14 ngày qua</span>
                <span className="text-teal-300 font-semibold">{currentPercent}% hôm nay</span>
              </div>
              <div className="flex items-center justify-between gap-1">
                {pastDays.map((active, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-sm transition-all ${
                      i === 13 
                        ? (active ? 'bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.8)]' : 'bg-slate-700')
                        : (active ? 'bg-teal-500/80' : 'bg-slate-800')
                    }`}
                    title={`Ngày ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
