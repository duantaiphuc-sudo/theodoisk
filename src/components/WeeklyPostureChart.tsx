import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  Calendar, 
  TrendingUp, 
  User, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Activity, 
  ChevronLeft, 
  ChevronRight,
  Info
} from 'lucide-react';
import { TelemetryLog, AuthUser, TimeCalculations } from '../types';

interface WeeklyPostureChartProps {
  history: TelemetryLog[];
  currentUser?: AuthUser | null;
  currentTimeStats?: TimeCalculations;
  isManager?: boolean;
  allUsers?: AuthUser[];
}

interface DayData {
  dayName: string; // "Thứ 2", "Thứ 3", ...
  dateStr: string; // "DD/MM"
  fullDate: string; // "YYYY-MM-DD"
  sittingMinutes: number;
  standingMinutes: number;
  badPostureMinutes: number;
  correctPostureMinutes: number;
  avgBpm: number;
  avgSpo2: number;
  alertCount: number;
  totalActiveMinutes: number;
}

export const WeeklyPostureChart: React.FC<WeeklyPostureChartProps> = ({
  history,
  currentUser,
  currentTimeStats,
  isManager = false,
  allUsers = [],
}) => {
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');
  const [weekOffset, setWeekOffset] = useState<number>(0); // 0 = current week, -1 = last week
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);

  // Get start of the week (Monday) based on weekOffset
  const weekRange = useMemo(() => {
    const now = new Date();
    // Shift by weekOffset weeks
    now.setDate(now.getDate() + weekOffset * 7);

    // Find Monday (1) of this week. JS getDay(): 0 is Sunday, 1 is Monday...
    const currentDayOfWeek = now.getDay();
    const distanceToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    
    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const startStr = monday.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const endStr = sunday.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return { monday, sunday, label: `${startStr} - ${endStr}` };
  }, [weekOffset]);

  // Filter history logs based on user selection
  const userFilteredLogs = useMemo(() => {
    if (!selectedUserFilter || selectedUserFilter === 'all') {
      return history;
    }
    return history.filter(
      log => log.userId === selectedUserFilter || 
             (log.userEmail && allUsers.find(u => u.id === selectedUserFilter)?.email?.toLowerCase() === log.userEmail.toLowerCase())
    );
  }, [history, selectedUserFilter, allUsers]);

  // Aggregate telemetry data into 7 days of the week (Monday to Sunday)
  const weekDaysData = useMemo<DayData[]>(() => {
    const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
    const days: DayData[] = [];

    const mondayTime = weekRange.monday.getTime();
    const todayYMD = new Date().toISOString().split('T')[0];

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(mondayTime + i * 24 * 60 * 60 * 1000);
      const ymd = dayDate.toISOString().split('T')[0];
      const ddm = `${String(dayDate.getDate()).padStart(2, '0')}/${String(dayDate.getMonth() + 1).padStart(2, '0')}`;

      // Filter logs for this specific calendar day
      const dayLogs = userFilteredLogs.filter(log => {
        if (!log.timestamp) return false;
        try {
          const logYMD = new Date(log.timestamp).toISOString().split('T')[0];
          return logYMD === ymd;
        } catch {
          return false;
        }
      });

      // Calculate minutes based on history entries and active timers
      let sittingMins = 0;
      let standingMins = 0;
      let badPostureMins = 0;
      let correctMins = 0;
      let alertCount = 0;
      let bpmSum = 0;
      let bpmCount = 0;
      let spo2Sum = 0;
      let spo2Count = 0;

      // Group samples (each log represents ~2-5 minutes of active session in real-world aggregation)
      dayLogs.forEach(log => {
        if (log.postureStatus === 5) {
          standingMins += 3;
        } else if (log.postureStatus === 0) {
          sittingMins += 3;
          correctMins += 3;
        } else if (log.postureStatus === 1 || log.postureStatus === 3) {
          sittingMins += 3;
          badPostureMins += 3;
        }

        if (log.hasAlert || log.postureStatus === 1 || log.postureStatus === 3) {
          alertCount++;
        }

        if (log.bpm > 0) {
          bpmSum += log.bpm;
          bpmCount++;
        }
        if (log.spo2 > 0) {
          spo2Sum += log.spo2;
          spo2Count++;
        }
      });

      // If viewing current week and this day is TODAY, merge live session timers
      if (weekOffset === 0 && ymd === todayYMD && currentTimeStats) {
        const liveSitting = Math.round((currentTimeStats.sittingSeconds || 0) / 60);
        const liveMoving = Math.round((currentTimeStats.movingSeconds || 0) / 60);
        const liveBad = Math.round((currentTimeStats.badPostureSeconds || 0) / 60);

        sittingMins = Math.max(sittingMins, liveSitting);
        standingMins = Math.max(standingMins, liveMoving);
        badPostureMins = Math.max(badPostureMins, liveBad);
      }

      // Cap to realistic workplace working hours (max 12h = 720 mins)
      sittingMins = Math.min(sittingMins, 720);
      standingMins = Math.min(standingMins, 480);
      badPostureMins = Math.min(badPostureMins, sittingMins);
      correctMins = Math.max(0, sittingMins - badPostureMins);

      days.push({
        dayName: dayNames[i],
        dateStr: ddm,
        fullDate: ymd,
        sittingMinutes: sittingMins,
        standingMinutes: standingMins,
        badPostureMinutes: badPostureMins,
        correctPostureMinutes: correctMins,
        avgBpm: bpmCount > 0 ? Math.round(bpmSum / bpmCount) : 0,
        avgSpo2: spo2Count > 0 ? Number((spo2Sum / spo2Count).toFixed(1)) : 0,
        alertCount,
        totalActiveMinutes: sittingMins + standingMins,
      });
    }

    return days;
  }, [weekRange, userFilteredLogs, weekOffset, currentTimeStats]);

  // Aggregate weekly totals
  const weeklySummary = useMemo(() => {
    let totalSittingMins = 0;
    let totalStandingMins = 0;
    let totalBadMins = 0;
    let totalAlerts = 0;

    weekDaysData.forEach(d => {
      totalSittingMins += d.sittingMinutes;
      totalStandingMins += d.standingMinutes;
      totalBadMins += d.badPostureMinutes;
      totalAlerts += d.alertCount;
    });

    const totalActiveMins = totalSittingMins + totalStandingMins;
    const ergonomicScore = totalActiveMins > 0 
      ? Math.max(0, Math.min(100, Math.round(100 - (totalBadMins / totalActiveMins) * 100 + (totalStandingMins / totalActiveMins) * 20)))
      : 100;

    return {
      sittingHours: (totalSittingMins / 60).toFixed(1),
      standingHours: (totalStandingMins / 60).toFixed(1),
      badHours: (totalBadMins / 60).toFixed(1),
      totalHours: (totalActiveMins / 60).toFixed(1),
      totalAlerts,
      ergonomicScore,
    };
  }, [weekDaysData]);

  // Find max minutes to scale chart bars proportionally
  const maxMinutesInWeek = useMemo(() => {
    let max = 60; // minimum scale 1 hour
    weekDaysData.forEach(d => {
      if (d.sittingMinutes > max) max = d.sittingMinutes;
      if (d.standingMinutes > max) max = d.standingMinutes;
      if (d.badPostureMinutes > max) max = d.badPostureMinutes;
    });
    return Math.ceil(max / 60) * 60; // Round up to full hours
  }, [weekDaysData]);

  const formatMinsToHours = (mins: number) => {
    if (mins < 60) return `${mins}p`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h${m}p` : `${h}h`;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 lg:p-6 text-slate-900 transition-all">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100 mb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-sky-600" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Biểu Đồ Thời Gian Ngồi, Đứng & Sai Tư Thế Theo Tuần
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Sit-Stand Telemetry
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Tổng hợp dữ liệu cảm biến & camera IoT theo 7 ngày. Giúp theo dõi tỷ lệ ngồi / đứng công thái học và cảnh báo nguy cơ đau mỏi cột sống.
          </p>
        </div>

        {/* User filter for managers & week pagination */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Employee dropdown selector (for manager/admin) */}
          {isManager && allUsers.length > 0 && (
            <div className="relative">
              <select
                value={selectedUserFilter}
                onChange={e => setSelectedUserFilter(e.target.value)}
                className="h-9 pl-3 pr-8 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
              >
                <option value="all">Toàn bộ nhân viên ({allUsers.length})</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.fullName || u.username} {u.role === 'admin' ? '(Admin)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Week navigation buttons */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-0.5">
            <button
              onClick={() => setWeekOffset(prev => prev - 1)}
              title="Tuần trước"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono font-bold text-slate-700 whitespace-nowrap">
              {weekRange.label}
            </span>
            <button
              onClick={() => setWeekOffset(prev => Math.min(0, prev + 1))}
              disabled={weekOffset >= 0}
              title="Tuần tiếp theo"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards: Weekly Executive Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* 1. Sitting Hours */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-sky-50/60 border border-sky-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-sky-800">
            <span>Tổng Thời Gian Ngồi</span>
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 tracking-tight">
              {weeklySummary.sittingHours}
            </span>
            <span className="text-xs font-semibold text-slate-600">tiếng</span>
          </div>
          <span className="text-[11px] text-sky-700 mt-1">
            Ngồi chuẩn: {((Number(weeklySummary.sittingHours) - Number(weeklySummary.badHours))).toFixed(1)}h
          </span>
        </div>

        {/* 2. Standing Hours (New Posture State!) */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
            <span>Thời Gian Đứng (Làm việc)</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 tracking-tight">
              {weeklySummary.standingHours}
            </span>
            <span className="text-xs font-semibold text-slate-600">tiếng</span>
          </div>
          <span className="text-[11px] text-emerald-700 mt-1">
            Tư thế đứng xả áp lực cột sống
          </span>
        </div>

        {/* 3. Bad Posture Hours */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-rose-50/60 border border-rose-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-rose-800">
            <span>Sai Tư Thế (Cúi / Gù)</span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-rose-700 tracking-tight">
              {weeklySummary.badHours}
            </span>
            <span className="text-xs font-semibold text-slate-600">tiếng</span>
          </div>
          <span className="text-[11px] text-rose-700 mt-1">
            {weeklySummary.totalAlerts} lượt phát hiện cảnh báo
          </span>
        </div>

        {/* 4. Ergonomic Score */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-800">
            <span>Chỉ Số Công Thái Học</span>
            <Activity className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-900 tracking-tight">
              {weeklySummary.ergonomicScore}%
            </span>
            <span className="text-xs font-semibold text-slate-600">điểm</span>
          </div>
          <span className="text-[11px] text-indigo-700 mt-1">
            {weeklySummary.ergonomicScore >= 80 ? '✓ Đạt chuẩn an toàn y tế' : '⚠ Cần tăng cường đứng & thẳng lưng'}
          </span>
        </div>
      </div>

      {/* Chart Legend */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 mb-4 border-b border-slate-100 text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-sky-500 shadow-2xs"></span>
            <span className="font-semibold text-slate-700">Thời gian Ngồi</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 shadow-2xs"></span>
            <span className="font-semibold text-slate-700">Thời gian Đứng</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-rose-500 shadow-2xs"></span>
            <span className="font-semibold text-slate-700">Sai tư thế (Cúi/Gù)</span>
          </div>
        </div>

        <span className="text-[11px] text-slate-500 font-mono">
          * Đơn vị: Phút / Giờ làm việc • Tỷ lệ chuẩn công thái học 45p ngồi : 15p đứng
        </span>
      </div>

      {/* Main 7-Day Grouped Bar Chart */}
      <div className="relative pt-4 pb-2">
        <div className="grid grid-cols-7 gap-2 sm:gap-4 md:gap-6 h-56 sm:h-64 items-end">
          {weekDaysData.map((day, idx) => {
            const sittingHeightPercent = maxMinutesInWeek > 0 
              ? Math.max(4, Math.round((day.sittingMinutes / maxMinutesInWeek) * 100)) 
              : 4;
            const standingHeightPercent = maxMinutesInWeek > 0 
              ? Math.max(4, Math.round((day.standingMinutes / maxMinutesInWeek) * 100)) 
              : 4;
            const badHeightPercent = maxMinutesInWeek > 0 
              ? Math.max(4, Math.round((day.badPostureMinutes / maxMinutesInWeek) * 100)) 
              : 4;

            const isToday = weekOffset === 0 && day.fullDate === new Date().toISOString().split('T')[0];

            return (
              <div 
                key={idx} 
                className="flex flex-col items-center h-full justify-end group relative cursor-pointer"
                onMouseEnter={() => setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {/* 3 Columns Grouped for this day */}
                <div className={`w-full max-w-[72px] h-[190px] sm:h-[210px] flex items-end justify-center gap-1 sm:gap-1.5 p-1 rounded-xl transition-all ${
                  isToday ? 'bg-sky-50/50 ring-1 ring-sky-300' : 'hover:bg-slate-50'
                }`}>
                  {/* Bar 1: Sitting (Sky) */}
                  <div className="flex-1 flex flex-col items-center justify-end h-full">
                    <div 
                      style={{ height: `${sittingHeightPercent}%` }}
                      className="w-full bg-sky-500 hover:bg-sky-600 rounded-t-md transition-all shadow-xs relative group/bar"
                    >
                      {day.sittingMinutes > 0 && (
                        <div className="opacity-0 group-hover/bar:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold bg-slate-900 text-white px-1 rounded shadow pointer-events-none whitespace-nowrap z-20">
                          {formatMinsToHours(day.sittingMinutes)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bar 2: Standing (Emerald) */}
                  <div className="flex-1 flex flex-col items-center justify-end h-full">
                    <div 
                      style={{ height: `${standingHeightPercent}%` }}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 rounded-t-md transition-all shadow-xs relative group/bar"
                    >
                      {day.standingMinutes > 0 && (
                        <div className="opacity-0 group-hover/bar:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold bg-slate-900 text-white px-1 rounded shadow pointer-events-none whitespace-nowrap z-20">
                          {formatMinsToHours(day.standingMinutes)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bar 3: Bad Posture (Rose) */}
                  <div className="flex-1 flex flex-col items-center justify-end h-full">
                    <div 
                      style={{ height: `${badHeightPercent}%` }}
                      className="w-full bg-rose-500 hover:bg-rose-600 rounded-t-md transition-all shadow-xs relative group/bar"
                    >
                      {day.badPostureMinutes > 0 && (
                        <div className="opacity-0 group-hover/bar:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold bg-slate-900 text-white px-1 rounded shadow pointer-events-none whitespace-nowrap z-20">
                          {formatMinsToHours(day.badPostureMinutes)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Day Labels at bottom */}
                <div className="mt-2 text-center">
                  <span className={`block text-xs font-bold ${isToday ? 'text-sky-700' : 'text-slate-800'}`}>
                    {day.dayName}
                  </span>
                  <span className="block text-[10px] font-mono text-slate-500">
                    {day.dateStr}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating or pinned detail bar on hover / click */}
      {hoveredDay && (
        <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-sky-600" />
            <span className="font-bold text-slate-900">
              Chi tiết {hoveredDay.dayName} ({hoveredDay.dateStr}):
            </span>
          </div>

          <div className="flex items-center gap-4 flex-wrap text-slate-700">
            <span>Ngồi: <b className="text-sky-700 font-mono">{formatMinsToHours(hoveredDay.sittingMinutes)}</b></span>
            <span>Đứng: <b className="text-emerald-700 font-mono">{formatMinsToHours(hoveredDay.standingMinutes)}</b></span>
            <span>Sai tư thế: <b className="text-rose-700 font-mono">{formatMinsToHours(hoveredDay.badPostureMinutes)}</b></span>
            {hoveredDay.avgBpm > 0 && (
              <span>Nhịp tim TB: <b className="font-mono text-slate-900">{hoveredDay.avgBpm} bpm</b></span>
            )}
            {hoveredDay.avgSpo2 > 0 && (
              <span>SpO₂ TB: <b className="font-mono text-slate-900">{hoveredDay.avgSpo2}%</b></span>
            )}
            <span>Cảnh báo: <b className="text-amber-700 font-mono">{hoveredDay.alertCount} lần</b></span>
          </div>
        </div>
      )}

      {/* Ergonomic Guideline Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500">
        <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <b>Lời khuyên công thái học (Ergonomics Guideline):</b> Chu kỳ làm việc tối ưu là <b>45 phút ngồi + 15 phút đứng làm việc</b>. Đứng làm việc giúp kích thích tuần hoàn máu và giảm 60% nguy cơ thoái hóa đốt sống cổ L1-L5. Hãy xen kẽ nâng bàn đứng khi làm việc buổi chiều!
        </p>
      </div>
    </div>
  );
};
