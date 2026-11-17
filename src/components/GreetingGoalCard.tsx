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
  TrendingUp,
  Gift
} from 'lucide-react';
import { OHPSCalculationResult } from '../utils/ohpsCalculator';
import { loadCompanyBonusPolicy, calculateEmployeeBonus, formatCurrencyVND } from '../utils/bonusPolicy';

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

  // OHPS metrics: Chỉ hiển thị khi có dữ liệu đo đạc thực tế, KHÔNG tự sinh điểm 85 hay 75 khống
  const hasActualOHPSData = Boolean(
    ohpsData && 
    ohpsData.hasActualData === true && 
    ohpsData.dataConfidence > 0
  );
  const ohpsScore = hasActualOHPSData ? (ohpsData?.ohpsScore ?? 0) : 0;
  const ohpsLevel = hasActualOHPSData ? (ohpsData?.evaluation?.level ?? 'Chưa có dữ liệu') : 'Chưa có dữ liệu';

  // Bonus policy calculation for quick badge
  const bonusPolicy = loadCompanyBonusPolicy();
  const bonusResult = calculateEmployeeBonus(
    ohpsScore,
    ohpsData?.breakdown ?? { S_posture: 0, S_break: 0, S_vital: -1, S_task: 0 },
    bonusPolicy,
    hasActualOHPSData
  );

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
    ? (ohpsScore >= 80 ? '#22C55E' : ohpsScore >= 70 ? '#FBBF24' : '#FB7185')
    : goalMode === 'standing'
    ? '#22C55E'
    : (sittingPercent >= 100 ? '#FB7185' : '#38BDF8');

  const hasBgImage = Boolean(wallpaperUrl && wallpaperUrl !== 'tactile-cream');
  const [bgError, setBgError] = useState(false);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-slate-800 shadow-[0_4px_0_#1E293B] flex flex-col justify-between p-3.5 sm:p-5 lg:p-6 group transition-all ${
        hasBgImage && !bgError ? 'bg-slate-900' : 'glass-panel'
      } ${className || ''}`}
    >
      {/* Only render background image when user explicitly picked a wallpaper (not in default tactile-cream mode) */}
      {hasBgImage && !bgError && wallpaperUrl && (
        <img 
          src={wallpaperUrl} 
          alt="Health Office Background" 
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none transition-transform duration-700 group-hover:scale-[1.01]"
          onError={() => setBgError(true)}
        />
      )}

      {/* Main Content Container */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-4 w-full items-stretch">
        
        {/* Left Section: Clean default card OR transparent overlay over selected wallpaper */}
        <div className="md:col-span-7 lg:col-span-8 p-1 sm:p-2 rounded-2xl bg-transparent flex flex-col justify-between gap-3.5 h-full min-w-0">
          {/* Header Row: Date + OHPS + Bonus cleanly aligned on one row */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap xl:flex-nowrap min-w-0">
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold shadow-xs shrink-0 whitespace-nowrap ${
                hasBgImage && !bgError
                  ? 'bg-slate-950/65 border border-white/40 text-white'
                  : 'glass-subcard text-slate-900'
              }`}
            >
              <Calendar className={`w-3.5 h-3.5 shrink-0 ${hasBgImage && !bgError ? 'text-[#4ADE80]' : 'text-[#16A34A]'}`} />
              <span>{displayDate}</span>
            </div>

            {onOpenOHPSModal && (
              <>
                <button
                  type="button"
                  onClick={onOpenOHPSModal}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-extrabold transition cursor-pointer shadow-xs active:translate-y-[1px] whitespace-nowrap shrink-0 ${
                    hasBgImage && !bgError
                      ? 'bg-emerald-700/80 hover:bg-emerald-700 border border-emerald-300/60 text-white'
                      : 'bg-[#B2F5BE] hover:bg-[#9eeea9] border-[1.5px] border-slate-800 text-slate-900'
                  }`}
                  title="Bấm để xem chi tiết điểm năng suất OHPS từ Supabase"
                >
                  <Award className={`w-3.5 h-3.5 shrink-0 ${hasBgImage && !bgError ? 'text-emerald-200' : 'text-[#16A34A]'}`} />
                  <span>OHPS: {ohpsScore}đ · {ohpsLevel}</span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={onOpenOHPSModal}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-extrabold transition cursor-pointer shadow-xs font-mono active:translate-y-[1px] whitespace-nowrap shrink-0 ${
                    hasBgImage && !bgError
                      ? 'bg-amber-600/80 hover:bg-amber-600 border border-amber-200/60 text-white'
                      : 'bg-[#FDE68A] hover:bg-[#fcd34d] border-[1.5px] border-slate-800 text-slate-900'
                  }`}
                  title="Bấm để xem chính sách thưởng công thái học của công ty"
                >
                  <Gift className={`w-3.5 h-3.5 shrink-0 ${hasBgImage && !bgError ? 'text-amber-100' : 'text-amber-700'}`} />
                  <span>Thưởng: +{formatCurrencyVND(bonusResult.totalReward)}</span>
                </button>
              </>
            )}
          </div>

          {/* Bold Display Heading */}
          <div>
            <h2
              className={`text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight ${
                hasBgImage && !bgError
                  ? 'text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.9)]'
                  : 'text-slate-900'
              }`}
            >
              {greetingTime},{' '}
              <span
                className={
                  hasBgImage && !bgError
                    ? 'text-[#4ADE80] [text-shadow:0_2px_10px_rgba(0,0,0,0.95)]'
                    : 'text-[#16A34A]'
                }
              >
                {userDisplayName}
              </span>
            </h2>
            <p
              className={`text-xs sm:text-sm mt-1 font-semibold italic leading-relaxed ${
                hasBgImage && !bgError
                  ? 'text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.95)]'
                  : 'text-slate-600'
              }`}
            >
              &ldquo;Bạn không cần hoàn hảo, bạn chỉ cần bắt đầu ngồi đúng tư thế .&rdquo;
            </p>
          </div>

          {/* Action Buttons cleanly aligned on one row */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={() => {
                setGoalMode(prev => {
                  if (prev === 'ohps') return 'standing';
                  if (prev === 'standing') return 'sitting';
                  return 'ohps';
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold tactile-btn-primary cursor-pointer whitespace-nowrap shrink-0"
            >
              <Award className="w-4 h-4 shrink-0" />
              <span>
                {goalMode === 'ohps' 
                  ? 'Đổi: Mục tiêu đứng' 
                  : goalMode === 'standing' 
                  ? 'Đổi: Giới hạn ngồi' 
                  : 'Đổi: Điểm năng suất (OHPS)'}
              </span>
              <ArrowUpRight className="w-4 h-4 shrink-0" />
            </button>

            {onResetTimers && (
              <button
                type="button"
                onClick={onResetTimers}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap shrink-0 active:translate-y-[1px] ${
                  hasBgImage && !bgError
                    ? 'bg-slate-950/65 hover:bg-slate-950/85 border border-white/40 text-white'
                    : 'tactile-btn-white'
                }`}
              >
                <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${hasBgImage && !bgError ? 'text-slate-100' : 'text-slate-700'}`} />
                <span>Đặt lại bộ đếm</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Section: Clean Subcard (Default) OR Transparent Donut Widget over selected photo */}
        <div
          className={`md:col-span-5 lg:col-span-4 p-4 rounded-2xl flex flex-col items-center justify-between text-center h-full relative ${
            hasBgImage && !bgError
              ? 'bg-slate-950/25 border border-white/35'
              : 'glass-subcard'
          }`}
        >
          {/* Top-right Subtle Trend Badge */}
          <div className="hidden sm:flex absolute -top-2.5 -right-2.5 w-8 h-8 rounded-xl bg-[#16A34A] border-2 border-slate-900 shadow-[0_2px_0_#0F172A] items-center justify-center text-white pointer-events-none">
            <TrendingUp className="w-4 h-4" />
          </div>

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
            className={`w-full flex items-center justify-center gap-1.5 text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
              hasBgImage && !bgError
                ? 'text-[#4ADE80] hover:text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]'
                : 'text-[#16A34A] hover:text-slate-900'
            }`}
            title="Nhấp để chuyển đổi giữa Điểm Năng Suất, Mục Tiêu Đứng và Giới Hạn Ngồi"
          >
            {goalMode === 'ohps' ? (
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Activity className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {goalMode === 'ohps' 
                ? 'ĐIỂM NĂNG SUẤT (OHPS)' 
                : goalMode === 'standing' 
                ? 'MỤC TIÊU ĐỨNG' 
                : 'GIỚI HẠN NGỒI'}
            </span>
          </button>

          {/* Circular Donut Gauge */}
          <div 
            onClick={() => {
              if (goalMode === 'ohps' && onOpenOHPSModal) {
                onOpenOHPSModal();
              }
            }}
            className={`relative w-24 h-24 sm:w-28 sm:h-28 my-2 flex items-center justify-center transition-transform hover:scale-105 ${
              hasBgImage && !bgError ? 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)]' : ''
            } ${goalMode === 'ohps' ? 'cursor-pointer' : ''}`}
            title={goalMode === 'ohps' ? 'Nhấp để xem chi tiết điểm năng suất' : undefined}
          >
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={hasBgImage && !bgError ? 'rgba(15, 23, 42, 0.55)' : 'rgba(148, 163, 184, 0.28)'}
                strokeWidth="9"
              />
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={strokeColor}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-700 ease-out"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span
                className={`text-2xl sm:text-3xl font-black font-mono tracking-tight leading-none ${
                  hasBgImage && !bgError
                    ? 'text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]'
                    : 'text-slate-900'
                }`}
              >
                {goalMode === 'ohps' 
                  ? ohpsScore 
                  : goalMode === 'standing' 
                  ? standingMinutes 
                  : continuousSittingMin}
              </span>
              <span
                className={`text-[10px] font-bold mt-1 ${
                  hasBgImage && !bgError
                    ? 'text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]'
                    : 'text-slate-600'
                }`}
              >
                {goalMode === 'ohps'
                  ? '/ 100 điểm'
                  : `/ ${goalMode === 'standing' ? targetStandingMin : maxSittingMin} phút`}
              </span>
            </div>
          </div>

          {/* Subtitle below donut */}
          <div className={`w-full ${hasBgImage && !bgError ? '[text-shadow:0_1px_6px_rgba(0,0,0,0.9)]' : ''}`}>
            {goalMode === 'ohps' ? (
              <div className="space-y-1">
                <div className={`text-xs font-bold ${hasBgImage && !bgError ? 'text-white' : 'text-slate-700'}`}>
                  Xếp loại:{' '}
                  <span className={`font-extrabold ${hasBgImage && !bgError ? 'text-[#4ADE80]' : 'text-[#16A34A]'}`}>
                    {ohpsLevel}
                  </span>
                </div>
                {onOpenOHPSModal && (
                  <button
                    type="button"
                    onClick={onOpenOHPSModal}
                    className={`text-[11px] font-extrabold underline transition cursor-pointer flex items-center justify-center gap-1 mx-auto ${
                      hasBgImage && !bgError
                        ? 'text-[#4ADE80] hover:text-white'
                        : 'text-[#16A34A] hover:text-slate-900'
                    }`}
                  >
                    <span>Xem chi tiết điểm năng suất</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div className={`text-xs font-bold ${hasBgImage && !bgError ? 'text-white' : 'text-slate-700'}`}>
                  Mục tiêu hôm nay
                </div>
                <div className={`text-[11px] font-extrabold font-mono mt-0.5 ${hasBgImage && !bgError ? 'text-[#4ADE80]' : 'text-[#16A34A]'}`}>
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
