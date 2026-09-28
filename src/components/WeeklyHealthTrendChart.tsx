import React, { useState, useMemo } from 'react';
import { 
  Activity, 
  Heart, 
  Wind, 
  TrendingUp, 
  Calendar, 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight,
  Database,
  ShieldCheck,
  Info
} from 'lucide-react';
import { TelemetryLog } from '../types';

export interface WeeklyDataPoint {
  weekLabel: string;
  dateRange: string;
  avgBpm: number;
  avgSpo2: number;
  correctPostureRate: number; // percentage (0-100)
  totalHours: number;
  alertCount: number;
  status: 'optimal' | 'good' | 'warning' | 'empty';
  logCount: number;
  hasRealData: boolean;
}

interface WeeklyHealthTrendChartProps {
  historyLogs?: TelemetryLog[];
}

/**
 * Dynamically aggregates real Firebase Firestore history logs into 4 weekly trend points.
 * 100% real calculation without fabricated numbers.
 */
function computeRealWeeklyData(logs: TelemetryLog[], employeeFilter: string): {
  weeks: WeeklyDataPoint[];
  totalValidLogs: number;
} {
  // 1. Filter logs by employee/node if specific node is selected
  const filteredLogs = logs.filter(l => {
    if (employeeFilter === 'all') return true;
    const filterLower = employeeFilter.toLowerCase().trim();
    const lUserId = (l.userId || '').toLowerCase().trim();
    const lEmail = (l.userEmail || '').toLowerCase().trim();
    const lName = (l.userName || '').toLowerCase().trim();
    const lDevice = (l.device || '').toLowerCase().trim();

    return (
      lUserId === filterLower ||
      lEmail === filterLower ||
      lName === filterLower ||
      lDevice === filterLower
    );
  });

  if (filteredLogs.length === 0) {
    const now = new Date();
    const emptyWeeks: WeeklyDataPoint[] = [
      { weekLabel: 'Tuần 1', dateRange: '01/09 - 07/09', avgBpm: 0, avgSpo2: 0, correctPostureRate: 0, totalHours: 0, alertCount: 0, status: 'empty', logCount: 0, hasRealData: false },
      { weekLabel: 'Tuần 2', dateRange: '08/09 - 14/09', avgBpm: 0, avgSpo2: 0, correctPostureRate: 0, totalHours: 0, alertCount: 0, status: 'empty', logCount: 0, hasRealData: false },
      { weekLabel: 'Tuần 3', dateRange: '15/09 - 21/09', avgBpm: 0, avgSpo2: 0, correctPostureRate: 0, totalHours: 0, alertCount: 0, status: 'empty', logCount: 0, hasRealData: false },
      { weekLabel: 'Tuần 4 (Hiện tại)', dateRange: '22/09 - 28/09', avgBpm: 0, avgSpo2: 0, correctPostureRate: 0, totalHours: 0, alertCount: 0, status: 'empty', logCount: 0, hasRealData: false },
    ];
    return { weeks: emptyWeeks, totalValidLogs: 0 };
  }

  // Sort logs chronologically (oldest to newest)
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const tA = new Date(a.timestamp).getTime();
    const tB = new Date(b.timestamp).getTime();
    return tA - tB;
  });

  const now = new Date();
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const latestTimestamp = new Date(sortedLogs[sortedLogs.length - 1].timestamp).getTime() || now.getTime();
  const earliestTimestamp = new Date(sortedLogs[0].timestamp).getTime() || latestTimestamp;
  const totalTimespan = latestTimestamp - earliestTimestamp;

  const weeks: WeeklyDataPoint[] = [];

  // If logs span more than 3 days, split by weekly calendar chunks
  // Otherwise, chunk into 4 proportional chronological quarters of the session
  const useProportionalQuarters = totalTimespan < 2 * ONE_WEEK_MS;

  for (let i = 0; i < 4; i++) {
    let weekLogs: TelemetryLog[] = [];
    let startStr = '';
    let endStr = '';
    const weekLabel = i === 3 ? 'Tuần 4 (Hiện tại)' : `Tuần ${i + 1}`;

    if (useProportionalQuarters) {
      // Chunk sorted logs into 4 equal quarters of the recorded timeline
      const quarterSize = Math.max(1, Math.ceil(sortedLogs.length / 4));
      const startIdx = i * quarterSize;
      const endIdx = Math.min(sortedLogs.length, (i + 1) * quarterSize);
      weekLogs = sortedLogs.slice(startIdx, endIdx);

      if (weekLogs.length > 0) {
        const dStart = new Date(weekLogs[0].timestamp);
        const dEnd = new Date(weekLogs[weekLogs.length - 1].timestamp);
        startStr = dStart.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        endStr = dEnd.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      } else {
        startStr = '--/--';
        endStr = '--/--';
      }
    } else {
      // 4 Calendar weeks ending at latestTimestamp
      const weekEndMs = latestTimestamp - (3 - i) * ONE_WEEK_MS;
      const weekStartMs = weekEndMs - ONE_WEEK_MS;
      const dStart = new Date(weekStartMs);
      const dEnd = new Date(weekEndMs);
      startStr = dStart.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      endStr = dEnd.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

      weekLogs = sortedLogs.filter(l => {
        const t = new Date(l.timestamp).getTime();
        return !isNaN(t) && t >= weekStartMs && t <= weekEndMs;
      });
    }

    if (weekLogs.length > 0) {
      const validBpmLogs = weekLogs.filter(l => l.bpm > 0);
      const validSpo2Logs = weekLogs.filter(l => l.spo2 > 0);

      const avgBpm = validBpmLogs.length > 0
        ? Math.round(validBpmLogs.reduce((acc, cur) => acc + cur.bpm, 0) / validBpmLogs.length)
        : 0;

      const avgSpo2 = validSpo2Logs.length > 0
        ? Number((validSpo2Logs.reduce((acc, cur) => acc + cur.spo2, 0) / validSpo2Logs.length).toFixed(1))
        : 0;

      const correctCount = weekLogs.filter(l => l.postureStatus === 0).length;
      const correctPostureRate = Math.round((correctCount / weekLogs.length) * 100);
      const alertCount = weekLogs.filter(l => l.hasAlert || l.postureStatus === 1 || l.postureStatus === 3 || l.postureStatus === 4).length;
      const totalHours = Number(((weekLogs.length * 10) / 60).toFixed(1));

      let status: 'optimal' | 'good' | 'warning' = 'good';
      if (correctPostureRate >= 80 && (avgBpm === 0 || (avgBpm >= 60 && avgBpm <= 85))) {
        status = 'optimal';
      } else if (correctPostureRate < 70 || alertCount > 10) {
        status = 'warning';
      }

      weeks.push({
        weekLabel,
        dateRange: `${startStr} - ${endStr}`,
        avgBpm,
        avgSpo2,
        correctPostureRate,
        totalHours,
        alertCount,
        status,
        logCount: weekLogs.length,
        hasRealData: true,
      });
    } else {
      weeks.push({
        weekLabel,
        dateRange: `${startStr} - ${endStr}`,
        avgBpm: 0,
        avgSpo2: 0,
        correctPostureRate: 0,
        totalHours: 0,
        alertCount: 0,
        status: 'empty',
        logCount: 0,
        hasRealData: false,
      });
    }
  }

  return { weeks, totalValidLogs: filteredLogs.length };
}

export const WeeklyHealthTrendChart: React.FC<WeeklyHealthTrendChartProps> = ({ historyLogs = [] }) => {
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [activeMetric, setActiveMetric] = useState<'both' | 'bpm' | 'spo2'>('both');

  const { weeks, totalValidLogs } = useMemo(() => {
    return computeRealWeeklyData(historyLogs, selectedEmployee);
  }, [historyLogs, selectedEmployee]);

  // Extract unique employees dynamically from real history logs
  const employeeOptions = useMemo(() => {
    const list: { id: string; label: string }[] = [{ id: 'all', label: 'Tất cả nhân viên' }];
    const seen = new Set<string>();

    historyLogs.forEach(log => {
      const id = (log.userId || log.userEmail || log.userName || log.device || '').trim();
      const label = log.userName || log.userEmail || log.device;
      if (id && label && !seen.has(id.toLowerCase())) {
        seen.add(id.toLowerCase());
        list.push({ id, label });
      }
    });

    return list;
  }, [historyLogs]);

  // Weeks with real data points
  const activeWeeks = weeks.filter(w => w.hasRealData);
  const hasAnyData = activeWeeks.length > 0;

  // Monthly summary calculations based ONLY on real logs
  const avgMonthlyBpm = activeWeeks.length > 0
    ? Math.round(activeWeeks.reduce((acc, cur) => acc + cur.avgBpm, 0) / activeWeeks.length)
    : 0;

  const avgMonthlySpo2 = activeWeeks.length > 0
    ? Number((activeWeeks.reduce((acc, cur) => acc + cur.avgSpo2, 0) / activeWeeks.length).toFixed(1))
    : 0;

  const avgPostureRate = activeWeeks.length > 0
    ? Math.round(activeWeeks.reduce((acc, cur) => acc + cur.correctPostureRate, 0) / activeWeeks.length)
    : 0;

  const totalMonthlyHours = Number(activeWeeks.reduce((acc, cur) => acc + cur.totalHours, 0).toFixed(1));

  // Trend comparison
  const firstWeek = activeWeeks[0];
  const lastWeek = activeWeeks[activeWeeks.length - 1];
  const bpmDiff = firstWeek && lastWeek ? lastWeek.avgBpm - firstWeek.avgBpm : 0;
  const spo2Diff = firstWeek && lastWeek ? Number((lastWeek.avgSpo2 - firstWeek.avgSpo2).toFixed(1)) : 0;

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 p-4 sm:p-6 shadow-xs space-y-5 animate-fadeIn">
      {/* 1. Header & Source Badge */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
              Biểu Đồ Xu Hướng Nhịp Tim & SpO₂ Theo Tuần
            </h3>
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Database className="w-3 h-3 text-emerald-600" />
              <span>100% Dữ Liệu Thực Từ Firestore</span>
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {totalValidLogs} bản ghi
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Được tổng hợp và tính toán trung bình trực tiếp từ các bản ghi telemetry thời gian thực lưu trên Firebase
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Dynamic Employee Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold overflow-x-auto max-w-[280px] sm:max-w-none">
            {employeeOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setSelectedEmployee(opt.id)}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer whitespace-nowrap ${
                  selectedEmployee === opt.id
                    ? 'bg-white text-slate-900 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Metric Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-[11px] font-semibold">
            <button
              onClick={() => setActiveMetric('both')}
              className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                activeMetric === 'both' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-500'
              }`}
            >
              Cả 2 chỉ số
            </button>
            <button
              onClick={() => setActiveMetric('bpm')}
              className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                activeMetric === 'bpm' ? 'bg-white text-rose-600 font-bold shadow-2xs' : 'text-slate-500'
              }`}
            >
              Chỉ BPM
            </button>
            <button
              onClick={() => setActiveMetric('spo2')}
              className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                activeMetric === 'spo2' ? 'bg-white text-sky-600 font-bold shadow-2xs' : 'text-slate-500'
              }`}
            >
              Chỉ SpO₂
            </button>
          </div>
        </div>
      </div>

      {/* Notice if no logs in Firestore yet */}
      {!hasAnyData && (
        <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
          <Info className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Hệ thống đang kết nối Firestore. Khi Raspberry Pi 4 gửi các gói tin đo nhịp tim, SpO₂ và tư thế, các chỉ số trung bình theo tuần sẽ tự động hiển thị và cập nhật tại đây.
          </span>
        </div>
      )}

      {/* 2. Monthly Summary Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: BPM Trung Bình */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Nhịp Tim TB</span>
            <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Heart className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900">
                {avgMonthlyBpm > 0 ? avgMonthlyBpm : '--'}
              </span>
              <span className="text-xs text-slate-500 font-mono">BPM</span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[11px] font-semibold text-slate-600">
              {avgMonthlyBpm > 0 ? (
                <>
                  {bpmDiff <= 0 ? <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />}
                  <span>{Math.abs(bpmDiff)} BPM biến thiên</span>
                </>
              ) : (
                <span className="text-slate-400 font-normal">Chờ dữ liệu cảm biến</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: SpO2 Trung Bình */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Nồng Độ SpO₂ TB</span>
            <div className="w-6 h-6 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Wind className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900">
                {avgMonthlySpo2 > 0 ? avgMonthlySpo2 : '--'}
              </span>
              <span className="text-xs text-slate-500 font-mono">%</span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[11px] font-semibold text-slate-600">
              {avgMonthlySpo2 > 0 ? (
                <>
                  <ArrowUpRight className="w-3.5 h-3.5 text-sky-600" />
                  <span>{avgMonthlySpo2 >= 95 ? 'Bình thường (≥95%)' : 'Cần theo dõi (<95%)'}</span>
                </>
              ) : (
                <span className="text-slate-400 font-normal">Chờ dữ liệu cảm biến</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Tư thế chuẩn */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Tư Thế Đạt Chuẩn</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-700">
                {avgPostureRate > 0 ? `${avgPostureRate}%` : '--'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">
              {avgPostureRate >= 80 ? 'Tuân thủ công thái học tốt' : avgPostureRate > 0 ? 'Cần cải thiện tư thế' : 'Chờ Camera AI'}
            </span>
          </div>
        </div>

        {/* Card 4: Tổng giờ làm việc */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Bản Ghi Nhận Diện</span>
            <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900">
                {totalValidLogs}
              </span>
              <span className="text-xs text-slate-500 font-mono">gói tin</span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">
              Lưu trữ Firestore
            </span>
          </div>
        </div>
      </div>

      {/* 3. Visual Weekly Comparative Chart Bars */}
      <div className="space-y-4 pt-1">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
          <span>Tiến Trình 4 Khoảng Đo Đạc:</span>
          <div className="flex items-center gap-4 text-[11px] font-normal">
            <span className="flex items-center gap-1.5 text-rose-600 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span>
              Nhịp tim (BPM)
            </span>
            <span className="flex items-center gap-1.5 text-sky-600 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block"></span>
              SpO₂ (%)
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
              Tư thế chuẩn (%)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {weeks.map((week, idx) => {
            const isOptimal = week.status === 'optimal';
            const isWarning = week.status === 'warning';
            const isEmpty = week.status === 'empty' || !week.hasRealData;

            return (
              <div 
                key={week.weekLabel}
                className={`p-4 rounded-xl border transition flex flex-col justify-between space-y-3.5 ${
                  idx === 3 && !isEmpty
                    ? 'bg-sky-50/40 border-sky-300 ring-2 ring-sky-500/10' 
                    : 'bg-white border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Week Title & Range */}
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-slate-900 block">{week.weekLabel}</span>
                    <span className="text-[11px] text-slate-500 font-mono block mt-0.5">{week.dateRange}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isEmpty
                      ? 'bg-slate-100 text-slate-500'
                      : isOptimal 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : isWarning 
                      ? 'bg-amber-100 text-amber-800' 
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {isEmpty ? 'Chưa có dữ liệu' : isOptimal ? 'Tối ưu' : isWarning ? 'Cần chú ý' : 'Ổn định'}
                  </span>
                </div>

                {/* Bars for Heart Rate & SpO2 */}
                <div className="space-y-2.5 pt-1">
                  {/* BPM Bar */}
                  {(activeMetric === 'both' || activeMetric === 'bpm') && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-600 flex items-center gap-1 text-[11px]">
                          <Heart className="w-3 h-3 text-rose-500" />
                          <span>Nhịp tim TB:</span>
                        </span>
                        <span className="font-bold font-mono text-slate-900 text-xs">
                          {week.avgBpm > 0 ? `${week.avgBpm} BPM` : '--'}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-600 transition-all duration-500"
                          style={{ width: `${week.avgBpm > 0 ? Math.min(100, (week.avgBpm / 120) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* SpO2 Bar */}
                  {(activeMetric === 'both' || activeMetric === 'spo2') && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-600 flex items-center gap-1 text-[11px]">
                          <Wind className="w-3 h-3 text-sky-500" />
                          <span>SpO₂ TB:</span>
                        </span>
                        <span className="font-bold font-mono text-sky-700 text-xs">
                          {week.avgSpo2 > 0 ? `${week.avgSpo2}%` : '--'}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all duration-500"
                          style={{ width: `${week.avgSpo2 > 0 ? Math.min(100, week.avgSpo2) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Posture Rate Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600 flex items-center gap-1 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Tư thế chuẩn:</span>
                      </span>
                      <span className="font-bold font-mono text-emerald-700 text-xs">
                        {week.hasRealData ? `${week.correctPostureRate}%` : '--'}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
                        style={{ width: `${week.hasRealData ? week.correctPostureRate : 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Mini details footer */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Database className="w-3 h-3 text-slate-400" />
                    <span>{week.logCount} bản ghi</span>
                  </span>
                  <span className={`font-semibold ${week.alertCount > 5 ? 'text-rose-600' : 'text-slate-600'}`}>
                    {week.alertCount} cảnh báo
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
