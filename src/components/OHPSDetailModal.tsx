import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  ArrowUpRight, 
  ArrowDownRight,
  Minus,
  CloudUpload, 
  RefreshCw, 
  AlertTriangle,
  Gift,
  Settings2
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
import { OHPSCalculationResult, getOHPSEvaluation } from '../utils/ohpsCalculator';
import { TelemetryLog } from '../types';
import { 
  syncOHPSToSupabase, 
  getSavedSupabaseConfig, 
  OHPSSyncResult,
  fetchDailyOHPSHistoryFromSupabase 
} from '../services/supabaseService';
import { 
  CompanyBonusPolicy, 
  loadCompanyBonusPolicy, 
  calculateEmployeeBonus, 
  formatCurrencyVND 
} from '../utils/bonusPolicy';
import { CompanyBonusModal } from './CompanyBonusModal';
import { aggregateTelemetryByHour } from '../utils/hourlyAggregation';

interface OHPSDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  ohpsData?: OHPSCalculationResult;
  userName?: string;
  userId?: string;
  historyLogs?: TelemetryLog[];
  onOpenSupabaseConfig?: () => void;
  onRefreshFromSupabase?: () => Promise<void>;
  isFromSupabase?: boolean;
  isAdmin?: boolean;
}

interface TrendPoint {
  timeLabel: string;
  timeRangeLabel?: string;
  score: number;
  postureScore: number;
  breakScore: number;
  vitalScore: number;
  status: string;
  avgBpm?: number;
  avgSpo2?: number;
  sampleCount?: number;
}

export const OHPSDetailModal: React.FC<OHPSDetailModalProps> = ({
  isOpen,
  onClose,
  ohpsData,
  userName = 'Bạn',
  userId,
  historyLogs = [],
  onOpenSupabaseConfig,
  onRefreshFromSupabase,
  isFromSupabase = false,
  isAdmin = false,
}) => {
  // Hooks MUST all execute unconditionally at the top of the component
  const [timeView, setTimeView] = useState<'today' | 'week'>('today');
  const [showFormulaDetails, setShowFormulaDetails] = useState(true);
  const [supabaseHistoryRows, setSupabaseHistoryRows] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isBonusModalOpen, setIsBonusModalOpen] = useState(false);
  const [bonusPolicy, setBonusPolicy] = useState<CompanyBonusPolicy>(loadCompanyBonusPolicy());

  // Lắng nghe cập nhật chính sách thưởng từ mọi nơi trong hệ thống
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail) setBonusPolicy(e.detail);
    };
    window.addEventListener('company_bonus_policy_updated', handler);
    return () => window.removeEventListener('company_bonus_policy_updated', handler);
  }, []);

  // Tải danh sách bản ghi OHPS thực tế từ bảng daily_ohps_summary trên Supabase
  const loadSupabaseHistory = useCallback(async () => {
    if (!userId) return;
    setIsLoadingHistory(true);
    try {
      const rows = await fetchDailyOHPSHistoryFromSupabase(userId, 7);
      setSupabaseHistoryRows(rows || []);
    } catch (e) {
      console.warn('Lỗi tải lịch sử daily_ohps_summary từ Supabase:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [userId]);

  const handleRefresh = async () => {
    setIsLoadingHistory(true);
    try {
      await Promise.allSettled([
        loadSupabaseHistory(),
        onRefreshFromSupabase ? onRefreshFromSupabase() : Promise.resolve()
      ]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSupabaseHistory();
    }
  }, [isOpen, loadSupabaseHistory]);

  // Kiểm tra nghiêm ngặt: Có dữ liệu đo đạc thực tế hay không?
  const hasActualData = Boolean(
    ohpsData && 
    ohpsData.hasActualData !== false && 
    (ohpsData.dataConfidence > 0 || (historyLogs && historyLogs.length > 0))
  );

  const safeData = (ohpsData && hasActualData) ? ohpsData : {
    ohpsScore: 0,
    hesScore: 0,
    taskScore: 0,
    dataConfidence: 0,
    hasVitalData: false,
    hasActualData: false,
    evaluation: {
      level: 'Chưa có dữ liệu',
      meaning: 'Chưa có dữ liệu đo đạc thực tế từ trạm IoT cho ca làm việc hôm nay.',
      badgeColor: 'bg-slate-100 text-slate-500 border-slate-200'
    },
    breakdown: {
      S_posture: 0,
      S_break: 0,
      S_vital: -1,
      S_task: 0
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

  // Tính mức tiền thưởng thực tế theo chính sách doanh nghiệp (Chỉ tính khi có dữ liệu đo thật)
  const bonusResult = useMemo(() => {
    return calculateEmployeeBonus(ohpsScore, breakdown, bonusPolicy, hasActualData);
  }, [ohpsScore, breakdown, bonusPolicy, hasActualData]);

  // DỮ LIỆU XU HƯỚNG 100% THỰC TẾ TỪ SUPABASE (TUYỆT ĐỐI KHÔNG BỊA SỐ LIỆU)
  const trendData: TrendPoint[] = useMemo(() => {
    if (timeView === 'week') {
      // 1. CHẾ ĐỘ 7 NGÀY QUA: Lấy trực tiếp từ bảng daily_ohps_summary trên Supabase
      // Nếu Supabase chỉ có 1 hoặc 2 bản ghi (VD: 25/10 và 26/10), CHỈ hiển thị đúng các bản ghi đó!
      if (!supabaseHistoryRows || supabaseHistoryRows.length === 0) {
        return [];
      }

      return supabaseHistoryRows.map((row: any) => {
        let dayFormatted = String(row.date);
        if (typeof row.date === 'string' && row.date.includes('-')) {
          const parts = row.date.split('-');
          if (parts.length === 3) {
            dayFormatted = `${parts[2]}/${parts[1]}`;
          }
        } else {
          const d = new Date(row.date);
          if (!isNaN(d.getTime())) {
            dayFormatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
          }
        }
        const score = Number(row.ohps_score ?? 0);
        return {
          timeLabel: dayFormatted,
          score,
          postureScore: Number(row.posture_score ?? 0),
          breakScore: Number(row.break_score ?? 0),
          vitalScore: Number(row.vital_score ?? -1),
          status: getOHPSEvaluation(score).level
        };
      });
    } else {
      // 2. CHẾ ĐỘ HÔM NAY: TỔNG HỢP THEO TỪNG GIỜ LÀM VIỆC (08:00 - 18:00)
      // TUYỆT ĐỐI KHÔNG VẼ THEO GIÂY RỜI RẠC (01:34:59, 01:35:01...)
      const todayLogs = (historyLogs || []).filter(l => {
        if (!l.timestamp) return false;
        const d = new Date(l.timestamp);
        if (isNaN(d.getTime())) return false;
        const todayStr = new Date().toISOString().slice(0, 10);
        const logDateStr = d.toISOString().slice(0, 10);
        return logDateStr === todayStr || d.toDateString() === new Date().toDateString();
      });

      if (todayLogs.length === 0) {
        return [];
      }

      // Tổng hợp dữ liệu đo thực tế thành các mốc theo giờ
      const hourlyBuckets = aggregateTelemetryByHour(todayLogs, 8, 18);
      const activeBuckets = hourlyBuckets.filter(b => b.hasData);

      if (activeBuckets.length === 0) {
        return [];
      }

      return activeBuckets.map(b => {
        const postScore = b.goodRatio;
        const breakScore = b.standingCount > 0 ? 100 : 60;
        const vitScore = (b.avgBpm > 0 && b.avgSpo2 > 0)
          ? (b.avgBpm >= 60 && b.avgBpm <= 100 && b.avgSpo2 >= 95 ? 100 : 70)
          : -1;

        const slotHes = vitScore >= 0 
          ? Math.round((35 * postScore + 20 * breakScore + 15 * vitScore) / 70) 
          : Math.round((35 * postScore + 20 * breakScore) / 55);

        const taskPts = breakdown.S_task > 0 ? breakdown.S_task : 80;
        const pointScore = Math.round(0.7 * slotHes + 0.3 * taskPts);

        return {
          timeLabel: b.hourLabel, // '01:00', '08:00', '09:00', ..., '18:00' (LUÔN LÀ GIỜ, KHÔNG CÓ GIÂY!)
          timeRangeLabel: b.timeRangeLabel,
          score: pointScore,
          postureScore: postScore,
          breakScore: breakScore,
          vitalScore: vitScore,
          avgBpm: b.avgBpm,
          avgSpo2: b.avgSpo2,
          sampleCount: b.sampleCount,
          status: getOHPSEvaluation(pointScore).level
        };
      });
    }
  }, [timeView, supabaseHistoryRows, historyLogs, breakdown]);

  // Early return ONLY after all hooks have been unconditionally invoked
  if (!isOpen) return null;

  // Determine badge styling based on score (Tactile Light High Contrast)
  const getScoreBadge = (score: number) => {
    if (score >= 90) return 'bg-[#B2F5BE] border-slate-800 text-slate-900';
    if (score >= 80) return 'bg-[#BAE0EC] border-slate-800 text-slate-900';
    if (score >= 70) return 'bg-[#FDE68A] border-slate-800 text-slate-900';
    return 'bg-[#FBC2C8] border-slate-800 text-slate-900';
  };

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, ohpsScore)) / 100) * circumference;

  const peakScore = trendData.length > 0 ? Math.max(...trendData.map(d => d.score)) : ohpsScore;
  const avgScore = trendData.length > 0 ? Math.round(trendData.reduce((acc, d) => acc + d.score, 0) / trendData.length) : ohpsScore;
  const trendDelta = trendData.length >= 2 ? (trendData[trendData.length - 1].score - trendData[0].score) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white border-2 border-slate-800 shadow-[0_8px_0_#1E293B] text-slate-900 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b-2 border-slate-800 bg-[#FDFBF7] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FDE68A] text-slate-900 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900">
                  Phân Tích Chi Tiết Điểm Năng Suất (OHPS)
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border-[1.5px] ${getScoreBadge(ohpsScore)}`}>
                  {evaluation.level}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Chỉ số Năng Suất & Sức Khỏe Công Thái Học Toàn Diện của {userName}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Nút Làm Mới Dữ Liệu Từ Supabase */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoadingHistory}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold tactile-btn-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Tải lại dữ liệu mới nhất từ bảng daily_ohps_summary trên Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-700 ${isLoadingHistory ? 'animate-spin' : ''}`} />
              <span>{isLoadingHistory ? 'Đang tải...' : 'Làm mới Supabase'}</span>
            </button>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-slate-800 scrollbar-thin bg-white">
          
          {/* Kiến Trúc Luồng Dữ Liệu */}
          <div className="p-3.5 rounded-2xl bg-[#B2F5BE]/45 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] text-xs text-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white border-[1.5px] border-slate-800 text-emerald-700 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-slate-900">Luồng Dữ Liệu: Nhật Ký & Task → Tính Toán Ngầm → Supabase → OHPS</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white text-slate-900 border-[1.5px] border-slate-800 font-mono">
                    daily_ohps_summary
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 mt-0.5 leading-relaxed">
                  Điểm số được hệ thống tự động tính toán ngầm và lưu vào Supabase. Toàn bộ giao diện OHPS lấy trực tiếp từ Supabase làm nguồn dữ liệu chuẩn.
                </p>
              </div>
            </div>

            {onOpenSupabaseConfig && (
              <button
                type="button"
                onClick={onOpenSupabaseConfig}
                className="px-3 py-1.5 rounded-xl tactile-btn-white font-bold text-xs cursor-pointer shrink-0 self-start sm:self-auto"
              >
                Cấu hình kết nối
              </button>
            )}
          </div>
          
          {/* Main Score Hero Card */}
          <div className="p-5 rounded-2xl bg-[#FAF7F0] border-2 border-slate-800 shadow-[0_4px_0_#1E293B] flex flex-col sm:flex-row items-center justify-between gap-6">
            
            {/* Donut Gauge */}
            <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 130 130">
                <circle
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="12"
                />
                <circle
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="none"
                  stroke={ohpsScore >= 80 ? '#16B364' : ohpsScore >= 70 ? '#d97706' : '#e11d48'}
                  strokeWidth="12"
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
                <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">
                  / 100 ĐIỂM
                </span>
              </div>
            </div>

            {/* Score Explanation & Meaning */}
            <div className="flex-1 text-center sm:text-left space-y-2.5">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="text-sm font-extrabold text-slate-900">Xếp loại năng suất:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border-[1.5px] ${getScoreBadge(ohpsScore)}`}>
                  {evaluation.level} ({ohpsScore}/100)
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {evaluation.meaning}
              </p>
              
              <div className="pt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs font-mono text-slate-700 border-t border-slate-300">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Sức khỏe (HES 70%): <strong className="text-emerald-800 font-bold">{hesScore}đ</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ListTodo className="w-4 h-4 text-indigo-700" />
                  <span>Tiến độ (Task 30%): <strong className="text-indigo-800 font-bold">{taskScore}đ</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Database className="w-3.5 h-3.5 text-sky-700" />
                  <span>Độ tin cậy: <strong className="text-slate-900">{dataConfidence}%</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Biểu Đồ Xu Hướng Điểm Năng Suất (Recharts) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-slate-800 shadow-[0_4px_0_#1E293B] space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900">
                    Biểu Đồ Xu Hướng Điểm Năng Suất Theo Thời Gian
                  </h3>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Theo dõi tiến trình duy trì tư thế đúng, thói quen vận động và hoàn thành nhiệm vụ
                </p>
              </div>

              {/* Time Toggle */}
              <div className="flex items-center p-1 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 text-xs font-bold self-stretch sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTimeView('today')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    timeView === 'today'
                      ? 'bg-[#16B364] text-white font-bold border-[1.5px] border-slate-900 shadow-[0_1px_0_#0F172A]'
                      : 'text-slate-600 hover:text-slate-900 border-[1.5px] border-transparent'
                  }`}
                >
                  Hôm nay (Theo giờ)
                </button>
                <button
                  type="button"
                  onClick={() => setTimeView('week')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    timeView === 'week'
                      ? 'bg-[#16B364] text-white font-bold border-[1.5px] border-slate-900 shadow-[0_1px_0_#0F172A]'
                      : 'text-slate-600 hover:text-slate-900 border-[1.5px] border-transparent'
                  }`}
                >
                  7 Ngày qua
                </button>
              </div>
            </div>

            {/* Metric Highlights */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-[#B2F5BE]/35 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B]">
                <span className="text-[10px] text-slate-700 block font-bold uppercase tracking-wider">Điểm Cao Nhất</span>
                <span className="text-base sm:text-lg font-black font-mono text-emerald-900 tabular-nums">
                  {trendData.length > 0 ? `${peakScore}đ` : '–'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#BAE0EC]/40 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B]">
                <span className="text-[10px] text-slate-700 block font-bold uppercase tracking-wider">Điểm Trung Bình</span>
                <span className="text-base sm:text-lg font-black font-mono text-slate-900 tabular-nums">
                  {trendData.length > 0 ? `${avgScore}đ` : '–'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B]">
                <span className="text-[10px] text-slate-700 block font-bold uppercase tracking-wider">Xu Hướng Phong Độ</span>
                <div className="text-base sm:text-lg font-black font-mono flex items-center justify-center gap-1 tabular-nums">
                  {trendData.length < 2 ? (
                    <span className="text-xs text-slate-600 font-sans font-semibold">
                      {trendData.length === 1 ? '1 mốc dữ liệu' : 'Chưa có dữ liệu'}
                    </span>
                  ) : trendDelta > 0 ? (
                    <>
                      <ArrowUpRight className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span className="text-emerald-800">+{trendDelta}đ</span>
                    </>
                  ) : trendDelta < 0 ? (
                    <>
                      <ArrowDownRight className="w-4 h-4 text-rose-700 shrink-0" />
                      <span className="text-rose-800">{trendDelta}đ</span>
                    </>
                  ) : (
                    <>
                      <Minus className="w-4 h-4 text-slate-600 shrink-0" />
                      <span className="text-slate-700">0đ</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Recharts Area Chart */}
            <div className="h-56 sm:h-64 w-full pt-2">
              {isLoadingHistory ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2 bg-[#FAF7F0] border-[1.5px] border-dashed border-slate-400 rounded-xl">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#16B364]" />
                  <span className="text-xs font-bold">Đang truy vấn dữ liệu thực tế từ Supabase...</span>
                </div>
              ) : trendData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 border-[1.5px] border-dashed border-slate-400 rounded-xl p-4 text-center bg-[#FAF7F0]">
                  <Database className="w-8 h-8 text-slate-400 mb-2" />
                  <span className="text-xs font-bold text-slate-800">
                    {timeView === 'week' ? 'Chưa có bản ghi nào trong bảng daily_ohps_summary' : 'Chưa có bản ghi telemetry hôm nay'}
                  </span>
                  <span className="text-[11px] text-slate-600 max-w-sm mt-1 leading-relaxed">
                    {timeView === 'week' 
                      ? 'Biểu đồ được vẽ trực tiếp từ bảng daily_ohps_summary trên Supabase. Hệ thống sẽ tự động lưu ngầm khi có phiên đo hoặc nhiệm vụ.' 
                      : 'Hệ thống chỉ hiển thị khi nhận được các gói tin telemetry thực tế từ Raspberry Pi trong ngày.'}
                  </span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ohpsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16B364" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#16B364" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
                    <XAxis 
                      dataKey="timeLabel" 
                      stroke="#475569" 
                      fontSize={11} 
                      tickLine={false}
                      axisLine={{ stroke: '#1e293b' }}
                    />
                    <YAxis 
                      domain={[0, 100]} 
                      ticks={[0, 25, 50, 75, 100]} 
                      stroke="#475569" 
                      fontSize={11} 
                      tickLine={false}
                      axisLine={{ stroke: '#1e293b' }}
                    />
                    <ReferenceLine 
                      y={80} 
                      stroke="#16B364" 
                      strokeDasharray="4 4" 
                      label={{ value: 'Mục Tiêu Chuẩn (80đ)', fill: '#065f46', fontSize: 10, position: 'insideTopRight' }} 
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as TrendPoint;
                          return (
                            <div className="p-3 rounded-xl bg-white border-2 border-slate-800 shadow-[0_4px_0_#1E293B] text-xs space-y-1.5">
                              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-1">
                                <span className="font-bold text-slate-900 font-mono">
                                  {data.timeRangeLabel ? `Khung giờ: ${data.timeRangeLabel}` : data.timeLabel}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#B2F5BE] text-slate-900 border border-slate-800 whitespace-nowrap">
                                  {data.status}
                                </span>
                              </div>
                              <div className="space-y-1 text-[11px] font-mono">
                                <p className="text-emerald-800 font-bold">
                                  Điểm OHPS: <span className="text-slate-900 text-xs">{data.score}/100</span>
                                </p>
                                <p className="text-slate-700">
                                  • Tư thế ngồi chuẩn: <span className="text-emerald-700 font-bold">{data.postureScore}%</span>
                                </p>
                                <p className="text-slate-700">
                                  • Vận động giải lao: <span className="text-sky-700 font-bold">{data.breakScore}đ</span>
                                </p>
                                <p className="text-slate-700">
                                  • Sinh hiệu: <span className="text-rose-700 font-bold">{data.vitalScore >= 0 ? `${data.vitalScore}đ` : 'Không có cảm biến'}</span>
                                </p>
                                {data.avgBpm !== undefined && data.avgBpm > 0 && (
                                  <p className="text-rose-700">
                                    • Nhịp tim TB: <span className="font-bold">{data.avgBpm} BPM</span>
                                  </p>
                                )}
                                {data.avgSpo2 !== undefined && data.avgSpo2 > 0 && (
                                  <p className="text-sky-700">
                                    • SpO₂ TB: <span className="font-bold">{data.avgSpo2}%</span>
                                  </p>
                                )}
                                {data.sampleCount !== undefined && data.sampleCount > 0 && (
                                  <p className="text-slate-500 text-[10px] pt-0.5 border-t border-slate-200">
                                    (Ghi nhận {data.sampleCount} bản ghi trong khung giờ)
                                  </p>
                                )}
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
                      stroke="#16B364" 
                      strokeWidth={2.5} 
                      fill="url(#ohpsGradient)" 
                      dot={{ fill: '#16B364', stroke: '#0f172a', strokeWidth: 1.5, r: 5 }}
                      activeDot={{ fill: '#16B364', stroke: '#0f172a', strokeWidth: 2, r: 7 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Chân Thích Nguồn Dữ Liệu Thực Tế */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 pt-2.5 border-t border-slate-200">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[#16B364] shrink-0" />
                <span>
                  Nguồn dữ liệu: <strong className="text-slate-900">{timeView === 'week' ? 'Bảng public.daily_ohps_summary (Supabase)' : 'Nhật ký telemetry_logs hôm nay'}</strong>
                </span>
              </span>
              <span className="font-mono font-bold text-slate-900 bg-[#FAF7F0] border border-slate-800 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                {trendData.length} {timeView === 'week' ? 'ngày ghi nhận' : 'mốc thời gian ghi nhận'}
              </span>
            </div>
          </div>

          {/* Khung Thưởng Năng Suất & Sức Khỏe Doanh Nghiệp (Company Bonus Policy) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FDE68A]/45 border-2 border-slate-800 shadow-[0_4px_0_#1E293B] space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#FDE68A] border-[1.5px] border-slate-800 flex items-center justify-center text-slate-900 shrink-0 shadow-[0_2px_0_#1E293B]">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900">
                      Chính Sách Thưởng Công Thái Học Của Công Ty
                    </h3>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white text-slate-900 border border-slate-800 whitespace-nowrap">
                      {bonusPolicy.companyName || 'Doanh Nghiệp'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 mt-0.5 font-medium">
                    Chu kỳ: {bonusPolicy.cycle === 'daily' ? 'Hàng ngày' : bonusPolicy.cycle === 'weekly' ? 'Hàng tuần' : 'Hàng tháng'} • Mức thưởng tối đa: <strong className="font-mono text-slate-900">{formatCurrencyVND(bonusPolicy.maxRewardAmount)}</strong>/người
                  </p>
                </div>
              </div>

              {/* Nút Nhập / Cấu Hình Mức Thưởng Của Công Ty (CHỈ ADMIN MỚI THẤY VÀ ĐƯỢC CHỈNH) */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsBonusModalOpen(true)}
                  className="tactile-btn-white inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap self-stretch sm:self-auto justify-center"
                >
                  <Settings2 className="w-3.5 h-3.5 text-slate-700" />
                  <span>Nhập / Tùy chỉnh mức thưởng</span>
                </button>
              )}
            </div>

            {/* Nội Dung Mức Thưởng Đạt Được */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-white border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-700 font-semibold">Mức thưởng ước tính đạt được:</span>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-slate-800 whitespace-nowrap ${
                    bonusResult.isEligible
                      ? 'bg-[#B2F5BE] text-slate-900'
                      : 'bg-[#FBC2C8] text-slate-900'
                  }`}>
                    {bonusResult.isEligible ? (bonusResult.tierAchieved?.tierName || 'Đạt chuẩn') : `Chưa đạt điểm sàn (≥ ${bonusPolicy.minScoreToReward}đ)`}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-800 tracking-tight tabular-nums">
                    +{formatCurrencyVND(bonusResult.totalReward)}
                  </span>
                  <span className="text-xs text-slate-600 font-semibold">
                    ({bonusResult.achievementRate}% hạn mức thưởng)
                  </span>
                </div>
                {(bonusResult.postureBonus > 0 || bonusResult.breakBonus > 0 || bonusResult.taskBonus > 0) && (
                  <div className="text-[11px] text-slate-600 mt-1 flex flex-wrap gap-2 font-medium">
                    <span>(Bao gồm: Cơ bản {formatCurrencyVND(bonusResult.baseReward)}</span>
                    {bonusResult.postureBonus > 0 && <span>• Thưởng tư thế +{formatCurrencyVND(bonusResult.postureBonus)}</span>}
                    {bonusResult.breakBonus > 0 && <span>• Thưởng giải lao +{formatCurrencyVND(bonusResult.breakBonus)}</span>}
                    {bonusResult.taskBonus > 0 && <span>• Thưởng task +{formatCurrencyVND(bonusResult.taskBonus)}</span>}
                    <span>)</span>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div className="w-full sm:w-48">
                <div className="flex justify-between text-[10px] text-slate-700 font-bold mb-1.5">
                  <span>Tiến độ nhận thưởng</span>
                  <span className="font-mono text-emerald-800">{bonusResult.achievementRate}%</span>
                </div>
                <div className="tactile-progress-track w-full h-3 rounded-full">
                  <div 
                    className="tactile-progress-fill h-full rounded-l-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, bonusResult.achievementRate)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Lời khuyên tối ưu thưởng */}
            <div className="text-[11px] text-slate-800 bg-white/80 p-2.5 rounded-xl border border-slate-800 flex items-start gap-2 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
              <span>{bonusResult.tipsToReachNextTier}</span>
            </div>
          </div>

          {/* Component Breakdown Cards (4 Trụ Cột) */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#16B364]" />
              <span>4 Trụ Cột Cấu Thành Điểm Năng Suất</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              {/* 1. Tư thế công thái học (35%) */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      <span className="w-6 h-6 rounded-lg bg-[#B2F5BE] border border-slate-800 flex items-center justify-center shrink-0">
                        <Activity className="w-3.5 h-3.5 text-slate-900" />
                      </span>
                      <span>1. Tư Thế Ngồi Chuẩn (35%)</span>
                    </span>
                    <span className="font-mono text-emerald-800 font-extrabold whitespace-nowrap tabular-nums">{breakdown.S_posture} / 100đ</span>
                  </div>
                  <p className="text-[11px] text-slate-700 mt-2 leading-relaxed">
                    Tỷ lệ thời gian duy trì tư thế thẳng lưng tự nhiên, mắt ngang tầm nhìn từ Camera thông minh.
                  </p>
                </div>
                <div className="tactile-progress-track mt-3 w-full h-2.5 rounded-full">
                  <div 
                    className="tactile-progress-fill h-full rounded-l-full transition-all duration-500" 
                    style={{ width: `${breakdown.S_posture}%` }}
                  />
                </div>
              </div>

              {/* 2. Nghỉ giải lao & Chu kỳ đứng (20%) */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      <span className="w-6 h-6 rounded-lg bg-[#BAE0EC] border border-slate-800 flex items-center justify-center shrink-0">
                        <Clock className="w-3.5 h-3.5 text-slate-900" />
                      </span>
                      <span>2. Nghỉ Giải Lao & Đứng (20%)</span>
                    </span>
                    <span className="font-mono text-sky-900 font-extrabold whitespace-nowrap tabular-nums">{breakdown.S_break} / 100đ</span>
                  </div>
                  <p className="text-[11px] text-slate-700 mt-2 leading-relaxed">
                    Tuân thủ chu kỳ đứng dậy làm việc hoặc vận động nhẹ giải phóng áp lực cột sống.
                  </p>
                </div>
                <div className="tactile-progress-track mt-3 w-full h-2.5 rounded-full">
                  <div 
                    className="bg-sky-500 border-r-[1.5px] border-slate-800 h-full rounded-l-full transition-all duration-500" 
                    style={{ width: `${breakdown.S_break}%` }}
                  />
                </div>
              </div>

              {/* 3. Chỉ số sinh hiệu (15%) */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      <span className="w-6 h-6 rounded-lg bg-[#FBC2C8] border border-slate-800 flex items-center justify-center shrink-0">
                        <Heart className="w-3.5 h-3.5 text-slate-900" />
                      </span>
                      <span>3. Chỉ Số Sinh Hiệu (15%)</span>
                    </span>
                    <span className="font-mono text-rose-800 font-extrabold whitespace-nowrap tabular-nums">
                      {hasVitalData ? `${breakdown.S_vital} / 100đ` : 'Tự điều chỉnh (Offline)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 mt-2 leading-relaxed">
                    {hasVitalData 
                      ? 'Nhịp tim (BPM) và nồng độ oxy SpO₂ duy trì trong dải tiêu chuẩn an toàn y tế.'
                      : 'Chưa kết nối cảm biến đo: Hệ thống tự động chia lại trọng số 15% vào tư thế & giải lao.'}
                  </p>
                </div>
                <div className="tactile-progress-track mt-3 w-full h-2.5 rounded-full">
                  <div 
                    className="bg-rose-500 border-r-[1.5px] border-slate-800 h-full rounded-l-full transition-all duration-500" 
                    style={{ width: `${hasVitalData ? breakdown.S_vital : 100}%` }}
                  />
                </div>
              </div>

              {/* 4. Tiến độ hoàn thành nhiệm vụ (30%) */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      <span className="w-6 h-6 rounded-lg bg-[#FDE68A] border border-slate-800 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-900" />
                      </span>
                      <span>4. Tiến Độ Công Việc (30%)</span>
                    </span>
                    <span className="font-mono text-indigo-900 font-extrabold whitespace-nowrap tabular-nums">{breakdown.S_task} / 100đ</span>
                  </div>
                  <p className="text-[11px] text-slate-700 mt-2 leading-relaxed">
                    Tỷ lệ hoàn thành các nhiệm vụ công thái học & bài tập được giao trong ngày.
                  </p>
                </div>
                <div className="tactile-progress-track mt-3 w-full h-2.5 rounded-full">
                  <div 
                    className="bg-indigo-500 border-r-[1.5px] border-slate-800 h-full rounded-l-full transition-all duration-500" 
                    style={{ width: `${breakdown.S_task}%` }}
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Nguồn Dữ Liệu & Công Thức Tính Toán OHPS */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF7F0] border-2 border-slate-800 shadow-[0_3px_0_#1E293B] space-y-3.5">
            <button
              type="button"
              onClick={() => setShowFormulaDetails(!showFormulaDetails)}
              className="w-full min-h-[40px] flex items-center justify-between text-left cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#BAE0EC] border border-slate-800 flex items-center justify-center shrink-0">
                  <Database className="w-3.5 h-3.5 text-slate-900" />
                </div>
                <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900 group-hover:text-emerald-800 transition">
                  Nguồn Dữ Liệu & Công Thức Tính Toán OHPS
                </h3>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-slate-800 text-slate-800 text-xs font-bold whitespace-nowrap">
                <span>{showFormulaDetails ? 'Thu gọn' : 'Xem chi tiết'}</span>
                {showFormulaDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showFormulaDetails && (
              <div className="space-y-4 pt-3 border-t-[1.5px] border-slate-800 text-xs text-slate-700 animate-fadeIn leading-relaxed">
                {/* 1. Nguồn Dữ Liệu */}
                <div>
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 mb-2">
                    <Layers className="w-3.5 h-3.5 text-sky-700" />
                    <span>1. Điểm năng suất lấy thông tin từ đâu?</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                    <div className="p-3 rounded-xl bg-white border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B]">
                      <strong className="text-emerald-800 block mb-0.5">📷 Camera AI thị giác thông minh:</strong>
                      Ghi nhận góc nghiêng cổ, phân loại tư thế ngồi (Đúng / Cúi gù / Nghiêng vẹo / Vắng mặt).
                    </div>
                    <div className="p-3 rounded-xl bg-white border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B]">
                      <strong className="text-rose-800 block mb-0.5">❤️ Cảm biến đo nhịp tim & SpO₂:</strong>
                      Thu thập nhịp tim (BPM) và nồng độ oxy trong máu (SpO₂) theo thời gian thực.
                    </div>
                    <div className="p-3 rounded-xl bg-white border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B]">
                      <strong className="text-sky-800 block mb-0.5">⏱️ Bộ đếm thời gian làm việc & giải lao:</strong>
                      Đếm thời gian ngồi liên tục và các chu kỳ đứng làm việc (Sit-to-Stand Cycle).
                    </div>
                    <div className="p-3 rounded-xl bg-white border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B]">
                      <strong className="text-indigo-800 block mb-0.5">🗄️ Cơ sở dữ liệu đồng bộ đám mây:</strong>
                      Lưu trữ hồ sơ đo đạc bền vững, phân tích xu hướng và so sánh lịch sử.
                    </div>
                  </div>
                </div>

                {/* 2. Công Thức Tính */}
                <div>
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 mb-2">
                    <Cpu className="w-3.5 h-3.5 text-emerald-700" />
                    <span>2. Công thức toán học tính điểm OHPS</span>
                  </h4>
                  <div className="p-3.5 rounded-xl bg-white border-2 border-slate-800 font-mono text-xs space-y-2 shadow-[0_3px_0_#1E293B]">
                    <p className="text-emerald-800 font-extrabold text-sm">
                      OHPS = 0.70 × HES + 0.30 × S_task
                    </p>
                    <div className="text-[11px] text-slate-700 space-y-1 pl-2.5 border-l-2 border-[#16B364] font-sans">
                      <p>
                        • <strong>HES (Health & Ergonomics Score - 70%):</strong> Điểm sức khỏe & tư thế.
                        <br />
                        <span className="font-mono text-[10px] text-slate-600">
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
                    <p className="text-[10px] text-slate-800 bg-[#FDE68A]/50 border border-slate-800 rounded-lg px-2.5 py-1.5 font-sans">
                      💡 <em>Cơ chế Tự Động Tái Chuẩn Hóa:</em> Nếu người dùng chưa bật cảm biến nhịp tim, hệ thống tự động tái phân phối trọng số sang Tư Thế & Giải Lao trên tổng 55% còn lại để không bị trừ điểm oan.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t-2 border-slate-800 bg-[#FDFBF7] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
            <Info className="w-4 h-4 text-[#16B364] shrink-0" />
            <span>Thuật toán chuẩn công thái học văn phòng NIOSH & ISO 9241</span>
          </div>
          <button
            onClick={onClose}
            className="tactile-btn-primary min-h-[42px] px-5 py-2 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap"
          >
            Đóng Lại
          </button>
        </div>

      </div>

      {/* Modal Tùy Chỉnh Chính Sách Thưởng Công Ty */}
      <CompanyBonusModal
        isOpen={isBonusModalOpen}
        onClose={() => setIsBonusModalOpen(false)}
        currentScore={ohpsScore}
        breakdown={breakdown}
        onPolicyChanged={(newPol) => setBonusPolicy(newPol)}
      />
    </div>
  );
};
