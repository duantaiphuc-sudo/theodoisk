import React, { useMemo } from 'react';
import { 
  ArrowUpRight, 
  Flame, 
  Clock, 
  Sparkles,
  Calendar,
  Compass
} from 'lucide-react';
import { AuthUser, HealthTelemetry, TimeCalculations } from '../types';

interface NatureForestHeroProps {
  currentUser?: AuthUser | null;
  telemetry: HealthTelemetry;
  timeStats: TimeCalculations;
  assignedDevice?: string | null;
  isConnected: boolean;
  isSimulating: boolean;
  onStartSession?: () => void;
  onQuickCheck?: () => void;
}

export const NatureForestHero: React.FC<NatureForestHeroProps> = ({
  currentUser,
  telemetry,
  timeStats,
  assignedDevice,
  isConnected,
  isSimulating,
  onStartSession,
  onQuickCheck,
}) => {
  // Contextual time greeting
  const { greetingText, dateStr } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    let text = 'Chào buổi sáng';

    if (hour >= 12 && hour < 14) {
      text = 'Chào buổi trưa';
    } else if (hour >= 14 && hour < 18) {
      text = 'Chào buổi chiều';
    } else if (hour >= 18 || hour < 5) {
      text = 'Chào buổi tối';
    }

    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = days[now.getDay()];
    const dateFormatted = `${dayName}, ${now.getDate()}/${now.getMonth() + 1}`;

    return { greetingText: text, dateStr: dateFormatted };
  }, []);

  const sittingMins = Math.floor((timeStats?.sittingSeconds || 0) / 60);
  const goalMins = 30; // 30 phút mục tiêu ngồi chuẩn mỗi phiên
  const progressPercent = Math.min(100, Math.round((sittingMins / goalMins) * 100));

  // Circular gauge math for the "Mục tiêu hôm nay" ring
  const circleSize = 96;
  const strokeWidth = 9;
  const radius = (circleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  // Streak calculations (sample 14-day history dots)
  const streakDots = useMemo(() => {
    // 14 days indicator dots, active if sitting occurred
    return Array.from({ length: 14 }).map((_, i) => ({
      active: i === 13 && sittingMins > 0, // today
      day: i + 1,
    }));
  }, [sittingMins]);

  // Extract first name or display name for greeting
  const displayName = useMemo(() => {
    if (!currentUser?.fullName) return currentUser?.username || 'Bạn';
    const parts = currentUser.fullName.trim().split(' ');
    return parts[parts.length - 1]; // E.g. "Nguyễn", "Phúc", "Hoa"
  }, [currentUser]);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#0c221a] border border-emerald-500/20 text-white shadow-xl min-h-[300px] flex flex-col justify-between p-6 sm:p-7 group">
      {/* Background Image from Login (/nenweb.png) with deep emerald dark gradient overlay */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <img 
          src="/nenweb.png" 
          alt="Login backdrop" 
          className="w-full h-full object-cover object-center opacity-30 scale-105 group-hover:scale-100 transition-transform duration-700 filter brightness-75 contrast-125"
          onError={(e) => {
            // Fallback gracefully if image not found
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
        {/* Ambient Dark Forest Green Gradients (Matching image_ee54c780.png) */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#071913]/95 via-[#0b241c]/85 to-[#061510]/95" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute right-10 top-10 w-60 h-60 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />
        
        {/* Subtle Water Lily / Floating Leaf art in background */}
        <svg 
          className="absolute right-28 bottom-4 w-40 h-24 text-emerald-900/40 pointer-events-none" 
          viewBox="0 0 160 80" 
          fill="currentColor"
        >
          <ellipse cx="80" cy="50" rx="70" ry="25" />
          <path d="M80 50 L140 25 A70 25 0 0 1 150 50 Z" fill="#071913" />
        </svg>
      </div>

      {/* Top Header: Date Pill */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-semibold text-emerald-100/90 shadow-xs">
          <Calendar className="w-3.5 h-3.5 text-teal-400" />
          <span>{dateStr}</span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-teal-400 animate-pulse' : 'bg-slate-500'}`} />
          <span className="text-emerald-200/80 text-[11px]">
            {isSimulating ? 'Giả lập' : assignedDevice ? `Node: ${assignedDevice}` : 'Chưa gán Node'}
          </span>
        </div>
      </div>

      {/* Center Body: Big Greeting & Circular Goal Widget */}
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 my-4">
        {/* Left: Text Greeting & Inspirational Quote */}
        <div className="space-y-2 max-w-md">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
            {greetingText},{' '}
            <span className="text-teal-400 font-black">
              {displayName}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100/80 italic font-light leading-relaxed">
            “Bạn không cần hoàn hảo, bạn chỉ cần bắt đầu.”
          </p>
        </div>

        {/* Right: Circular Goal Meter ("Mục tiêu hôm nay") */}
        <div className="relative p-4 rounded-2xl bg-[#081b15]/80 backdrop-blur-md border border-emerald-500/20 shadow-lg flex flex-col items-center justify-center shrink-0 w-full sm:w-[190px]">
          {/* Radial SVG Gauge */}
          <div className="relative flex items-center justify-center">
            <svg 
              width={circleSize} 
              height={circleSize} 
              viewBox={`0 0 ${circleSize} ${circleSize}`} 
              className="transform -rotate-90"
            >
              {/* Background circle track */}
              <circle
                cx={circleSize / 2}
                cy={circleSize / 2}
                r={radius}
                fill="transparent"
                stroke="#122a21"
                strokeWidth={strokeWidth}
              />
              {/* Active progress arc */}
              <circle
                cx={circleSize / 2}
                cy={circleSize / 2}
                r={radius}
                fill="transparent"
                stroke="#2dd4bf"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
              />
            </svg>

            {/* Inner Ring Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              <span className="text-2xl font-black font-mono text-white tracking-tight leading-none">
                {sittingMins}
              </span>
              <span className="text-[10px] text-emerald-200/60 font-mono mt-0.5">
                /{goalMins} phút
              </span>
            </div>
          </div>

          <span className="text-xs font-bold text-white mt-2">
            Mục tiêu hôm nay
          </span>

          {/* Streak indicator */}
          <div className="mt-2 flex items-center justify-between w-full text-[11px] text-emerald-200/70 border-t border-emerald-500/10 pt-2 font-mono">
            <span className="flex items-center gap-1 text-amber-400 font-bold">
              <Flame className="w-3.5 h-3.5 fill-amber-400" />
              <span>{sittingMins > 0 ? '1' : '0'} ngày</span>
            </span>
            <span>Tuần: {sittingMins}/210p</span>
          </div>

          {/* 14 days grid dots */}
          <div className="mt-2 w-full pt-1">
            <span className="text-[9px] text-emerald-200/50 block mb-1">14 ngày qua</span>
            <div className="flex items-center justify-between gap-0.5">
              {streakDots.map((d, i) => (
                <div 
                  key={i} 
                  className={`w-2 h-2 rounded-[2px] ${
                    d.active ? 'bg-teal-400 shadow-xs' : 'bg-emerald-950 border border-emerald-800/40'
                  }`} 
                  title={`Ngày ${d.day}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Buttons (Exact style of image_ee54c780.png) */}
      <div className="relative z-10 flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onStartSession}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-teal-400 hover:bg-teal-300 text-slate-950 text-xs sm:text-sm font-extrabold shadow-lg shadow-teal-500/25 transition active:scale-95 cursor-pointer whitespace-nowrap"
        >
          <span>Làm bài test đầu tiên</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onQuickCheck}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-black/40 hover:bg-black/60 border border-white/20 text-white text-xs sm:text-sm font-semibold backdrop-blur-md transition active:scale-95 cursor-pointer whitespace-nowrap"
        >
          <span>Quick Study</span>
        </button>
      </div>
    </div>
  );
};
