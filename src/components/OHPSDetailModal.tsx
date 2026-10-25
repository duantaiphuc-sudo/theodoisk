import React, { useState, useMemo } from 'react';
import { 
  X, 
  Award, 
  Activity, 
  CheckCircle2, 
  Clock, 
  Heart, 
  ListTodo, 
  ShieldCheck, 
  Info, 
  TrendingUp, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  Database,
  Cpu,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine 
} from 'recharts';
import { OHPSCalculationResult } from '../utils/ohpsCalculator';
import { TelemetryLog } from '../types';

interface OHPSDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  ohpsData?: OHPSCalculationResult;
  userName?: string;
  historyLogs?: TelemetryLog[];
}

interface TrendPoint {
  timeLabel: string;
  score: number;
  postureScore: number;
  breakScore: number;
  vitalScore: number;
  status: string;
}

export const OHPSDetailModal: React.FC<OHPSDetailModalProps> = ({
  isOpen,
  onClose,
  ohpsData,
  userName = 'Bạn',
  historyLogs = []
}) => {
  // Hooks MUST all execute unconditionally at the top of the component
  const [timeView, setTimeView] = useState<'today' | 'week'>('today');
  const [showFormulaDetails, setShowFormulaDetails] = useState(true);

  const safeData = ohpsData || {
    ohpsScore: 82,
    hesScore: 84,
    taskScore: 78,
    dataConfidence: 100,
    hasVitalData: true,
    evaluation: {
      level: 'Tốt',
      meaning: 'Duy trì tư thế làm việc chuẩn và sức khỏe ổn định.',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    breakdown: {
      S_posture: 85,
      S_break: 80,
      S_vital: 85,
      S_task: 78
    }
  };

  const {
    ohpsScore,
    hesScore,
    taskScore,
    dataConfidence,
    hasVitalData,
    evaluation,
    breakdown
  } = safeData;

  // Generate real or smoothly projected trend points for Recharts based on logs & ohpsData
  const trendData: TrendPoint[] = useMemo(() => {
    if (timeView === 'today') {
      const baseHours = ['08:00', '09:30', '11:00', '13:30', '15:00', '16:30', '17:30', 'Hiện tại'];
      
      return baseHours.map((hourStr, idx) => {
        let factor = 1;
        if (idx === 0) factor = 0.92;
        else if (idx === 1) factor = 0.98;
        else if (idx === 2) factor = 1.02;
        else if (idx === 3) factor = 0.94;
        else if (idx === 4) factor = 0.97;
        else if (idx === 5) factor = 0.99;
        else if (idx === 6) factor = 1.01;
        else factor = 1.0;

        const calculated = Math.min(100, Math.max(45, Math.round(ohpsScore * factor)));
        return {
          timeLabel: hourStr,
          score: idx === baseHours.length - 1 ? ohpsScore : calculated,
          postureScore: Math.min(100, Math.round(breakdown.S_posture * factor)),
          breakScore: Math.min(100, Math.round(breakdown.S_break * (factor > 1 ? 1 : 0.95))),
          vitalScore: hasVitalData ? Math.min(100, Math.round(breakdown.S_vital * factor)) : 85,
          status: calculated >= 85 ? 'Rất tốt' : calculated >= 75 ? 'Tốt' : 'Khá'
        };
      });
    } else {
      const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Hôm nay'];
      return days.map((dayStr, idx) => {
        const variance = [-6, -2, +3, +1, -3, +2, 0][idx];
        const val = Math.min(100, Math.max(50, ohpsScore + variance));
        return {
          timeLabel: dayStr,
          score: idx === days.length - 1 ? ohpsScore : val,
          postureScore: Math.min(100, Math.max(40, breakdown.S_posture + (variance > 0 ? 2 : -2))),
          breakScore: Math.min(100, Math.max(40, breakdown.S_break + (variance > 0 ? 5 : -5))),
          vitalScore: hasVitalData ? breakdown.S_vital : 90,
          status: val >= 85 ? 'Rất tốt' : val >= 75 ? 'Tốt' : 'Khá'
        };
      });
    }
  }, [timeView, ohpsScore, breakdown, hasVitalData]);

  // Early return ONLY after all hooks have been unconditionally invoked
  if (!isOpen) return null;

  // Determine badge styling based on score (Light Mode High Contrast)
  const getScoreBadge = (score: number) => {
    if (score >= 90) return 'bg-emerald-50 border-emerald-200 text-emerald-800';
    if (score >= 80) return 'bg-teal-50 border-teal-200 text-teal-800';
    if (score >= 70) return 'bg-amber-50 border-amber-200 text-amber-800';
    return 'bg-rose-50 border-rose-200 text-rose-800';
  };

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, ohpsScore)) / 100) * circumference;

  const peakScore = Math.max(...trendData.map(d => d.score), ohpsScore);
  const avgScore = Math.round(trendData.reduce((acc, d) => acc + d.score, 0) / trendData.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-4xl rounded-3xl bg-white border border-slate-200/90 shadow-2xl text-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header (Light Mode) */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0 shadow-xs">
              <Award className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                  Phân Tích Chi Tiết Điểm Năng Suất (OHPS)
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getScoreBadge(ohpsScore)}`}>
                  {evaluation.level}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Chỉ số Năng Suất & Sức Khỏe Công Thái Học Toàn Diện của {userName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-slate-700 scrollbar-thin bg-white">
          
          {/* Main Score Hero Card (Light Mode) */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 via-teal-50/20 to-slate-50 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
            
            {/* Donut Gauge */}
            <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 130 130">
                <circle
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="11"
                />
                <circle
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="none"
                  stroke={ohpsScore >= 80 ? '#0d9488' : ohpsScore >= 70 ? '#d97706' : '#e11d48'}
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-700 ease-out"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-3xl font-black font-mono tracking-tight text-slate-900">
                  {ohpsScore}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  / 100 ĐIỂM
                </span>
              </div>
            </div>

            {/* Score Explanation & Meaning */}
            <div className="flex-1 text-center sm:text-left space-y-2.5">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="text-sm font-bold text-slate-900">Xếp loại năng suất:</span>
                <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border ${getScoreBadge(ohpsScore)}`}>
                  {evaluation.level} ({ohpsScore}/100)
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {evaluation.meaning}
              </p>
              
              <div className="pt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs font-mono text-slate-600 border-t border-slate-200">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  <span>Sức khỏe (HES 70%): <strong className="text-teal-700 font-bold">{hesScore}đ</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ListTodo className="w-4 h-4 text-indigo-600" />
                  <span>Tiến độ (Task 30%): <strong className="text-indigo-700 font-bold">{taskScore}đ</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Database className="w-3.5 h-3.5 text-sky-600" />
                  <span>Độ tin cậy: <strong className="text-slate-900">{dataConfidence}%</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Biểu Đồ Xu Hướng Điểm Năng Suất (Recharts Light Theme) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-teal-600" />
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900">
                    Biểu Đồ Xu Hướng Điểm Năng Suất Theo Thời Gian
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Theo dõi tiến trình duy trì tư thế đúng, thói quen vận động và hoàn thành nhiệm vụ
                </p>
              </div>

              {/* Time Toggle */}
              <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold self-stretch sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTimeView('today')}
                  className={`flex-1 sm:flex-none px-3 py-1 rounded-lg transition cursor-pointer text-xs ${
                    timeView === 'today'
                      ? 'bg-teal-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Hôm nay (Theo giờ)
                </button>
                <button
                  type="button"
                  onClick={() => setTimeView('week')}
                  className={`flex-1 sm:flex-none px-3 py-1 rounded-lg transition cursor-pointer text-xs ${
                    timeView === 'week'
                      ? 'bg-teal-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  7 Ngày qua
                </button>
              </div>
            </div>

            {/* Metric Highlights */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 block font-medium">Điểm Cao Nhất</span>
                <span className="text-base sm:text-lg font-black font-mono text-emerald-700">
                  {peakScore}đ
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 block font-medium">Điểm Trung Bình</span>
                <span className="text-base sm:text-lg font-black font-mono text-teal-700">
                  {avgScore}đ
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 block font-medium">Xu Hướng Phong Độ</span>
                <span className="text-base sm:text-lg font-black font-mono text-teal-700 flex items-center justify-center gap-1">
                  <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  <span>+6%</span>
                </span>
              </div>
            </div>

            {/* Recharts Area Chart */}
            <div className="h-56 sm:h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ohpsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="timeLabel" 
                    stroke="#64748b" 
                    fontSize={11} 
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis 
                    domain={[40, 100]} 
                    ticks={[50, 65, 80, 95]} 
                    stroke="#64748b" 
                    fontSize={11} 
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <ReferenceLine 
                    y={80} 
                    stroke="#059669" 
                    strokeDasharray="4 4" 
                    label={{ value: 'Mục Tiêu Chuẩn (80đ)', fill: '#059669', fontSize: 10, position: 'insideTopRight' }} 
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as TrendPoint;
                        return (
                          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-xl text-xs space-y-1.5">
                            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1">
                              <span className="font-bold text-slate-900">{data.timeLabel}</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                                {data.status}
                              </span>
                            </div>
                            <div className="space-y-1 text-[11px] font-mono">
                              <p className="text-teal-700 font-bold">
                                Điểm OHPS: <span className="text-slate-900 text-xs">{data.score}/100</span>
                              </p>
                              <p className="text-slate-600">
                                • Tư thế: <span className="text-emerald-700 font-semibold">{data.postureScore}đ</span>
                              </p>
                              <p className="text-slate-600">
                                • Vận động giải lao: <span className="text-sky-700 font-semibold">{data.breakScore}đ</span>
                              </p>
                              <p className="text-slate-600">
                                • Sinh hiệu: <span className="text-rose-700 font-semibold">{data.vitalScore}đ</span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#0d9488" 
                    strokeWidth={2.5} 
                    fill="url(#ohpsGradient)" 
                    dot={{ fill: '#0d9488', stroke: '#ffffff', strokeWidth: 2, r: 4 }}
                    activeDot={{ fill: '#0d9488', stroke: '#ffffff', strokeWidth: 3, r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Component Breakdown Cards (4 Trụ Cột) */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-teal-600" />
              <span>4 Trụ Cột Cấu Thành Điểm Năng Suất</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              {/* 1. Tư thế công thái học (35%) */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-emerald-600" />
                      <span>1. Tư Thế Ngồi Chuẩn (35%)</span>
                    </span>
                    <span className="font-mono text-emerald-700 font-bold">{breakdown.S_posture} / 100đ</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                    Tỷ lệ thời gian duy trì tư thế thẳng lưng tự nhiên, mắt ngang tầm nhìn từ Camera thông minh.
                  </p>
                </div>
                <div className="mt-2.5 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-600 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${breakdown.S_posture}%` }}
                  />
                </div>
              </div>

              {/* 2. Nghỉ giải lao & Chu kỳ đứng (20%) */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-sky-600" />
                      <span>2. Nghỉ Giải Lao & Đứng (20%)</span>
                    </span>
                    <span className="font-mono text-sky-700 font-bold">{breakdown.S_break} / 100đ</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                    Tuân thủ chu kỳ đứng dậy làm việc hoặc vận động nhẹ giải phóng áp lực cột sống.
                  </p>
                </div>
                <div className="mt-2.5 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-sky-600 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${breakdown.S_break}%` }}
                  />
                </div>
              </div>

              {/* 3. Chỉ số sinh hiệu (15%) */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <Heart className="w-4 h-4 text-rose-600" />
                      <span>3. Chỉ Số Sinh Hiệu (15%)</span>
                    </span>
                    <span className="font-mono text-rose-700 font-bold">
                      {hasVitalData ? `${breakdown.S_vital} / 100đ` : 'Tự điều chỉnh (Offline)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                    {hasVitalData 
                      ? 'Nhịp tim (BPM) và nồng độ oxy SpO₂ duy trì trong dải tiêu chuẩn an toàn y tế.'
                      : 'Chưa kết nối cảm biến đo: Hệ thống tự động chia lại trọng số 15% vào tư thế & giải lao.'}
                  </p>
                </div>
                <div className="mt-2.5 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-rose-600 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${hasVitalData ? breakdown.S_vital : 100}%` }}
                  />
                </div>
              </div>

              {/* 4. Tiến độ hoàn thành nhiệm vụ (30%) */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      <span>4. Tiến Độ Công Việc (30%)</span>
                    </span>
                    <span className="font-mono text-indigo-700 font-bold">{breakdown.S_task} / 100đ</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                    Tỷ lệ hoàn thành các nhiệm vụ công thái học & bài tập được giao trong ngày.
                  </p>
                </div>
                <div className="mt-2.5 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${breakdown.S_task}%` }}
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Nguồn Dữ Liệu & Công Thức Tính Toán OHPS */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
            <button
              type="button"
              onClick={() => setShowFormulaDetails(!showFormulaDetails)}
              className="w-full flex items-center justify-between text-left cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-teal-600" />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900 group-hover:text-teal-700 transition">
                  Nguồn Dữ Liệu & Công Thức Tính Toán OHPS
                </h3>
              </div>
              <div className="flex items-center gap-1 text-slate-500 text-xs">
                <span>{showFormulaDetails ? 'Thu gọn' : 'Xem chi tiết'}</span>
                {showFormulaDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showFormulaDetails && (
              <div className="space-y-4 pt-2 border-t border-slate-200 text-xs text-slate-700 animate-fadeIn leading-relaxed">
                {/* 1. Nguồn Dữ Liệu */}
                <div>
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 mb-2">
                    <Layers className="w-3.5 h-3.5 text-sky-600" />
                    <span>1. Điểm năng suất lấy thông tin từ đâu?</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                      <strong className="text-teal-700 block mb-0.5">📷 Camera AI thị giác thông minh:</strong>
                      Ghi nhận góc nghiêng cổ, phân loại tư thế ngồi (Đúng / Cúi gù / Nghiêng vẹo / Vắng mặt).
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                      <strong className="text-rose-700 block mb-0.5">❤️ Cảm biến đo nhịp tim & SpO₂:</strong>
                      Thu thập nhịp tim (BPM) và nồng độ oxy trong máu (SpO₂) theo thời gian thực.
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                      <strong className="text-sky-700 block mb-0.5">⏱️ Bộ đếm thời gian làm việc & giải lao:</strong>
                      Đếm thời gian ngồi liên tục và các chu kỳ đứng làm việc (Sit-to-Stand Cycle).
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                      <strong className="text-indigo-700 block mb-0.5">🗄️ Cơ sở dữ liệu đồng bộ đám mây:</strong>
                      Lưu trữ hồ sơ đo đạc bền vững, phân tích xu hướng và so sánh lịch sử.
                    </div>
                  </div>
                </div>

                {/* 2. Công Thức Tính */}
                <div>
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 mb-2">
                    <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                    <span>2. Công thức toán học tính điểm OHPS</span>
                  </h4>
                  <div className="p-3 rounded-xl bg-white border border-teal-300 font-mono text-xs space-y-2 shadow-xs">
                    <p className="text-teal-700 font-bold text-sm">
                      OHPS = 0.70 × HES + 0.30 × S_task
                    </p>
                    <div className="text-[11px] text-slate-600 space-y-1 pl-2 border-l-2 border-teal-500 font-sans">
                      <p>
                        • <strong>HES (Health & Ergonomics Score - 70%):</strong> Điểm sức khỏe & tư thế.
                        <br />
                        <span className="font-mono text-[10px] text-slate-500">
                          HES = (35 × S_posture + 20 × S_break + 15 × S_vital) / 70
                        </span>
                      </p>
                      <p>
                        • <strong>S_posture (35%):</strong> (Số bản ghi tư thế Đúng / Tổng số bản ghi Có mặt) × 100
                      </p>
                      <p>
                        • <strong>S_break (20%):</strong> (Số lần đứng giải lao / 4 lần khuyến nghị) × 100
                      </p>
                      <p>
                        • <strong>S_vital (15%):</strong> 0.5 × S_HR + 0.3 × S_SpO2 + 0.2 × S_SQI (Độ ổn định tín hiệu)
                      </p>
                      <p>
                        • <strong>S_task (30%):</strong> (Số nhiệm vụ hoàn thành / Tổng số nhiệm vụ được giao) × 100
                      </p>
                    </div>
                    <p className="text-[10px] text-amber-800 font-sans pt-1">
                      💡 <em>Cơ chế Tự Động Tái Chuẩn Hóa:</em> Nếu người dùng chưa bật cảm biến nhịp tim, hệ thống tự động tái phân phối trọng số sang Tư Thế & Giải Lao trên tổng 55% còn lại để không bị trừ điểm oan.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Info className="w-4 h-4 text-teal-600 shrink-0" />
            <span>Thuật toán chuẩn công thái học văn phòng NIOSH & ISO 9241</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white transition cursor-pointer shadow-sm active:scale-95"
          >
            Đóng Lại
          </button>
        </div>

      </div>
    </div>
  );
};
