import React, { useMemo } from 'react';
import { 
  Sparkles, 
  Heart, 
  Wind, 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  Radio, 
  Activity,
  Flame,
  Zap,
  ArrowUpRight
} from 'lucide-react';
import { AuthUser, HealthTelemetry, TimeCalculations } from '../types';

interface DashboardWelcomeHeroProps {
  currentUser?: AuthUser | null;
  telemetry: HealthTelemetry;
  timeStats: TimeCalculations;
  assignedDevice?: string | null;
  isConnected: boolean;
  isSimulating: boolean;
  isFaceSessionVerified?: boolean;
}

export const DashboardWelcomeHero: React.FC<DashboardWelcomeHeroProps> = ({
  currentUser,
  telemetry,
  timeStats,
  assignedDevice,
  isConnected,
  isSimulating,
  isFaceSessionVerified = true,
}) => {
  // Contextual time greeting
  const { greetingText, greetingEmoji, dateStr } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    let text = 'Chào buổi sáng';
    let emoji = '☀️';

    if (hour >= 12 && hour < 14) {
      text = 'Chào buổi trưa';
      emoji = '🌤️';
    } else if (hour >= 14 && hour < 18) {
      text = 'Chào buổi chiều';
      emoji = '⛅';
    } else if (hour >= 18 || hour < 5) {
      text = 'Chào buổi tối';
      emoji = '🌙';
    }

    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = days[now.getDay()];
    const dateFormatted = `${dayName}, ${now.getDate()} tháng ${now.getMonth() + 1}, ${now.getFullYear()}`;

    return { greetingText: text, greetingEmoji: emoji, dateStr: dateFormatted };
  }, []);

  // Calculate Ergonomic Score today (0 - 100)
  const { score, scoreLabel, scoreColor, scoreStroke, sittingMins, correctPostureMins } = useMemo(() => {
    const sittingMins = Math.floor((timeStats?.sittingSeconds || 0) / 60);
    const standingMins = Math.floor((timeStats?.standingSeconds || 0) / 60);
    const badPostureMins = Math.floor((timeStats?.badPostureSeconds || 0) / 60);
    const correctPostureMins = Math.max(0, sittingMins - badPostureMins);
    const continuousSittingMins = Math.floor((timeStats?.continuousSittingSeconds || 0) / 60);

    const totalActive = sittingMins + standingMins;
    if (totalActive <= 0) {
      // Default baseline when starting session
      return { 
        score: 95, 
        scoreLabel: 'Chuẩn công thái học', 
        scoreColor: 'text-emerald-700', 
        scoreStroke: '#10b981',
        sittingMins: 0,
        correctPostureMins: 0
      };
    }

    // Deduct points for bad posture ratio and excessive sitting
    const badRatio = badPostureMins / totalActive;
    let computed = Math.round((1 - badRatio) * 100);

    // Minor penalty if continuous sitting > 60m
    if (continuousSittingMins > 60) {
      computed = Math.max(30, computed - 15);
    }

    computed = Math.max(20, Math.min(100, computed));

    if (computed >= 85) {
      return { score: computed, scoreLabel: 'Rất xuất sắc', scoreColor: 'text-emerald-700', scoreStroke: '#10b981', sittingMins, correctPostureMins };
    }
    if (computed >= 70) {
      return { score: computed, scoreLabel: 'Tốt & Ổn định', scoreColor: 'text-sky-700', scoreStroke: '#0ea5e9', sittingMins, correctPostureMins };
    }
    return { score: computed, scoreLabel: 'Cần nghỉ giãn cơ', scoreColor: 'text-amber-800', scoreStroke: '#f59e0b', sittingMins, correctPostureMins };
  }, [timeStats]);

  // SVG Gauge Math (Size: 96x96, radius: 38, stroke: 9)
  const size = 96;
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-50/80 via-white to-sky-50/70 border border-slate-200/90 p-5 sm:p-6 shadow-sm transition-all duration-300">
      {/* Subtle Aesthetic Background Motif */}
      <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-emerald-200/30 blur-2xl pointer-events-none" />
      <div className="absolute right-40 -bottom-10 w-48 h-48 rounded-full bg-sky-200/30 blur-2xl pointer-events-none" />
      <svg 
        className="absolute right-3 bottom-2 w-32 h-32 text-emerald-600/5 pointer-events-none" 
        viewBox="0 0 100 100" 
        fill="currentColor"
      >
        <path d="M50 0 C70 30 90 50 100 100 C50 90 30 70 0 50 C30 30 40 10 50 0 Z" />
      </svg>

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        {/* Left: Warm Greeting & Daily Health Context */}
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="font-mono text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
              {dateStr}
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 text-slate-600">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {isSimulating ? 'Chế độ Giả Lập' : assignedDevice ? `Trạm ${assignedDevice}` : 'Chưa gán trạm'}
            </span>
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>{greetingText}, {currentUser?.fullName || currentUser?.username || 'Bạn'}</span>
              <span className="text-2xl">{greetingEmoji}</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
              Trạm đo Raspberry Pi 4 đang phân tích tư thế công thái học và cảm biến sinh trắc học MAX30102 thời gian thực để bảo vệ cột sống của bạn.
            </p>
          </div>

          {/* Micro-metric Badges (Like Image 1 - EcoTrack) */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/90 border border-slate-200/90 shadow-2xs text-xs font-semibold text-slate-700">
              <Clock className="w-3.5 h-3.5 text-sky-600" />
              <span>Đã ngồi: <b className="font-mono text-slate-900">{sittingMins}m</b></span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/90 border border-slate-200/90 shadow-2xs text-xs font-semibold text-slate-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tư thế chuẩn: <b className="font-mono text-emerald-700">{correctPostureMins}m</b></span>
            </div>

            {telemetry.bpm > 0 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/90 border border-slate-200/90 shadow-2xs text-xs font-semibold text-slate-700">
                <Heart className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                <span className="font-mono text-rose-600 font-bold">{telemetry.bpm} BPM</span>
              </div>
            )}

            {isFaceSessionVerified && (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Phiên SFace An Toàn</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Circular Ergonomic Score Gauge (Image 1 & Image 2 Inspiration) */}
        <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-white/95 border border-slate-200/90 shadow-xs shrink-0 self-stretch sm:self-auto justify-between sm:justify-start">
          <div className="relative flex items-center justify-center">
            <svg 
              width={size} 
              height={size} 
              viewBox={`0 0 ${size} ${size}`} 
              className="transform -rotate-90"
            >
              {/* Background circle */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke="#f1f5f9"
                strokeWidth={strokeWidth}
              />
              {/* Active animated progress arc */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={scoreStroke}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
              />
            </svg>

            {/* Inner text score */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-extrabold font-mono text-slate-900 tracking-tight">
                {score}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Điểm CS
              </span>
            </div>
          </div>

          <div className="space-y-1 pr-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block whitespace-nowrap">
              Chỉ số sức khỏe hôm nay
            </span>
            <span className={`text-sm font-extrabold block ${scoreColor}`}>
              {scoreLabel}
            </span>
            <p className="text-[11px] text-slate-500 max-w-[140px] leading-tight">
              {score >= 80 
                ? 'Cột sống ở góc nghiêng tối ưu' 
                : 'Thường xuyên gù đầu, cần điều chỉnh lại ghế'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
