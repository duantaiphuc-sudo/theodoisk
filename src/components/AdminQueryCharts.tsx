import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  PieChart as PieChartIcon, 
  Activity, 
  Heart, 
  Wind, 
  CheckCircle2, 
  AlertTriangle, 
  UserCheck, 
  Users, 
  Info,
  Calendar,
  Eye
} from 'lucide-react';
import { TelemetryLog, AuthUser } from '../types';
import { TimeRangeFilter } from '../services/supabaseService';

interface MemberGroupStat {
  userId: string;
  userName: string;
  userEmail?: string;
  total: number;
  good: number;
  bad: number;
  standing: number;
  alerts: number;
  sumBpm: number;
  countBpm: number;
  sumSpo2: number;
  countSpo2: number;
  latestTime?: string;
  latestPosture?: string;
}

interface AdminQueryChartsProps {
  data: TelemetryLog[];
  stats: {
    avgBpm: number;
    avgSpo2: number;
    totalRecords: number;
    goodPostureRatio: number;
    sittingCount: number;
    standingCount: number;
    incorrectCount: number;
  };
  queryUserScope: string;
  queryRange: TimeRangeFilter;
  users: AuthUser[];
  memberStats: MemberGroupStat[];
  onSelectMember?: (userId: string) => void;
}

export const AdminQueryCharts: React.FC<AdminQueryChartsProps> = ({
  data,
  stats,
  queryUserScope,
  queryRange,
  users,
  memberStats,
  onSelectMember,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'comparison'>('overview');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  // 1. Posture distribution segments
  const distribution = useMemo(() => {
    const total = data.length || 1;
    let good = 0;
    let bad = 0;
    let standing = 0;
    let absent = 0;

    data.forEach(d => {
      if (d.postureStatus === 5 || (d.postureLabel && d.postureLabel.toLowerCase().includes('đứng'))) {
        standing++;
      } else if (d.postureStatus === 2 || !d.inZone || (d.postureLabel && d.postureLabel.toLowerCase().includes('vắng'))) {
        absent++;
      } else if (d.postureStatus === 1 || d.postureStatus === 3 || d.postureStatus === 4 || (d.postureLabel && d.postureLabel.toLowerCase().includes('sai'))) {
        bad++;
      } else {
        good++;
      }
    });

    return [
      { id: 'good', label: 'Ngồi đúng chuẩn', count: good, percent: Math.round((good / total) * 100), color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
      { id: 'bad', label: 'Sai tư thế / Gù', count: bad, percent: Math.round((bad / total) * 100), color: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
      { id: 'standing', label: 'Đứng làm việc', count: standing, percent: Math.round((standing / total) * 100), color: '#6366f1', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
      { id: 'absent', label: 'Vắng / Ngoài vùng', count: absent, percent: Math.round((absent / total) * 100), color: '#94a3b8', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
    ];
  }, [data]);

  // 2. Timeline aggregation: Sample at most 30 data points chronologically (left to right)
  const timelinePoints = useMemo(() => {
    if (!data.length) return [];
    // Sort ascending by timestamp
    const sorted = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // If <= 30 points, take all
    if (sorted.length <= 30) {
      return sorted;
    }
    
    // Sample 30 representative points evenly
    const step = Math.floor(sorted.length / 30);
    const sampled: TelemetryLog[] = [];
    for (let i = 0; i < sorted.length; i += step) {
      if (sampled.length < 30) {
        sampled.push(sorted[i]);
      }
    }
    return sampled;
  }, [data]);

  // Donut SVG Math
  const donutSize = 180;
  const strokeWidth = 22;
  const radius = (donutSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate donut offsets
  let accumulatedPercent = 0;
  const donutSlices = distribution.map(item => {
    const strokeDasharray = `${(item.percent / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
    accumulatedPercent += item.percent;
    return {
      ...item,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  // Timeline SVG calculations
  const svgWidth = 720;
  const svgHeight = 220;
  const paddingX = 45;
  const paddingY = 30;
  const chartW = svgWidth - paddingX * 2;
  const chartH = svgHeight - paddingY * 2;

  const minBpm = 45;
  const maxBpm = 135;
  const minSpo2 = 85;
  const maxSpo2 = 100;

  const getX = (idx: number, count: number) => {
    if (count <= 1) return paddingX + chartW / 2;
    return paddingX + (idx / (count - 1)) * chartW;
  };

  const getYBpm = (bpm: number) => {
    const val = Math.max(minBpm, Math.min(maxBpm, bpm));
    const ratio = (val - minBpm) / (maxBpm - minBpm);
    return paddingY + chartH - ratio * chartH;
  };

  const getYSpo2 = (spo2: number) => {
    const val = Math.max(minSpo2, Math.min(maxSpo2, spo2));
    const ratio = (val - minSpo2) / (maxSpo2 - minSpo2);
    return paddingY + chartH - ratio * chartH;
  };

  const bpmPoints = timelinePoints
    .map((d, i) => (d.bpm > 0 ? { x: getX(i, timelinePoints.length), y: getYBpm(d.bpm), log: d } : null))
    .filter(Boolean) as { x: number; y: number; log: TelemetryLog }[];

  const spo2Points = timelinePoints
    .map((d, i) => (d.spo2 > 0 ? { x: getX(i, timelinePoints.length), y: getYSpo2(d.spo2), log: d } : null))
    .filter(Boolean) as { x: number; y: number; log: TelemetryLog }[];

  const bpmPathD = bpmPoints.length > 0 
    ? bpmPoints.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '')
    : '';

  const bpmAreaD = bpmPoints.length > 0
    ? `${bpmPathD} L ${bpmPoints[bpmPoints.length - 1].x.toFixed(1)} ${(paddingY + chartH).toFixed(1)} L ${bpmPoints[0].x.toFixed(1)} ${(paddingY + chartH).toFixed(1)} Z`
    : '';

  const spo2PathD = spo2Points.length > 0
    ? spo2Points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '')
    : '';

  // 3. Member ranked comparison data
  const rankedMembers = useMemo(() => {
    return [...memberStats].sort((a, b) => {
      const ratioA = a.total > 0 ? a.good / a.total : 0;
      const ratioB = b.total > 0 ? b.good / b.total : 0;
      return ratioB - ratioA;
    });
  }, [memberStats]);

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <PieChartIcon className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-slate-800">Chưa Có Dữ Liệu Biểu Đồ Trực Quan</h4>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Hãy bấm nút <b>"Truy Xuất Dữ Liệu"</b> ở trên để tải dữ liệu lịch sử từ PostgreSQL Supabase và kết xuất biểu đồ phân tích.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-5 animate-fadeIn">
      {/* Header with Segmented Tab Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-sky-600 text-white flex items-center justify-center shadow-xs">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-bold text-slate-900 tracking-tight">
                Phân Tích Trực Quan Dữ Liệu Đo Đạc
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                {data.length} mẫu dữ liệu
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Mô hình hóa biến thiên nhịp tim, nồng độ oxy và tỷ lệ tư thế ngồi chuẩn theo dòng thời gian.
            </p>
          </div>
        </div>

        {/* View Mode Segmented Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/80 self-stretch sm:self-auto overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-white text-emerald-700 shadow-2xs border border-slate-200/90'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PieChartIcon className="w-3.5 h-3.5" />
            <span>Tỷ Lệ Tư Thế</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-white text-sky-700 shadow-2xs border border-slate-200/90'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Dòng Thời Gian Sinh Trắc</span>
          </button>

          {queryUserScope === 'all' && memberStats.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('comparison')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'comparison'
                  ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/90'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>So Sánh Đội Ngũ</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: OVERVIEW & POSTURE DONUT GAUGE (EcoTrack & TOEIC Style) */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: Interactive Donut Gauge */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80">
            <div className="relative flex items-center justify-center">
              <svg 
                width={donutSize} 
                height={donutSize} 
                viewBox={`0 0 ${donutSize} ${donutSize}`} 
                className="transform -rotate-90 filter drop-shadow-xs"
              >
                {/* Background Ring */}
                <circle
                  cx={donutSize / 2}
                  cy={donutSize / 2}
                  r={radius}
                  fill="transparent"
                  stroke="#e2e8f0"
                  strokeWidth={strokeWidth}
                />
                {/* Colored Slices */}
                {donutSlices.map((slice, idx) => (
                  <circle
                    key={idx}
                    cx={donutSize / 2}
                    cy={donutSize / 2}
                    r={radius}
                    fill="transparent"
                    stroke={slice.color}
                    strokeWidth={hoveredSlice === slice.id ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={slice.strokeDasharray}
                    strokeDashoffset={slice.strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-300 cursor-pointer"
                    onMouseEnter={() => setHoveredSlice(slice.id)}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                ))}
              </svg>

              {/* Central Text Badge */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-3xl font-extrabold font-mono text-slate-900 tracking-tight">
                  {stats.goodPostureRatio}%
                </span>
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mt-0.5">
                  Tư thế chuẩn
                </span>
                <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {stats.totalRecords} bản ghi
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 text-center mt-3">
              Chỉ số tuân thủ công thái học trong khoảng thời gian đã chọn
            </p>
          </div>

          {/* Right: Detailed Breakdown Cards */}
          <div className="lg:col-span-7 space-y-3">
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>Phân Bổ Chi Tiết Trạng Thái Làm Việc:</span>
            </h5>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {distribution.map(item => (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredSlice(item.id)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${item.bg} ${item.border} ${
                    hoveredSlice === item.id ? 'ring-2 ring-emerald-500 shadow-xs scale-[1.02]' : 'shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span>{item.label}</span>
                    </span>
                    <span className={`text-xs font-extrabold font-mono ${item.text}`}>
                      {item.percent}%
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Số lượng ghi nhận:</span>
                    <span className="font-mono font-bold text-slate-800">{item.count} lần</span>
                  </div>

                  {/* Micro Progress Bar */}
                  <div className="mt-2 w-full h-1.5 bg-white/80 rounded-full overflow-hidden border border-slate-200/50">
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ width: `${item.percent}%`, backgroundColor: item.color }} 
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Diagnostic Callout */}
            <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {stats.goodPostureRatio >= 80 
                    ? 'Xuất sắc! Đội ngũ duy trì cột sống thẳng trên 80% thời lượng làm việc.'
                    : stats.goodPostureRatio >= 60
                    ? 'Khá tốt. Cần lưu ý nhắc nhở các trường hợp cúi gù đầu sau 45 phút ngồi.'
                    : 'Cảnh báo! Tỷ lệ ngồi gù lưng cao. Khuyến nghị gửi bài tập giãn cơ công thái học.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TIME-SERIES MULTI-METRIC CHART (BPM, SpO2 & Posture Events) */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500" />
                <span className="font-semibold text-slate-700">Nhịp tim (BPM)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-sky-500" />
                <span className="font-semibold text-slate-700">SpO₂ Oxy (%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-amber-400" />
                <span className="font-semibold text-slate-700">Sai tư thế</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-mono">
              Hiển thị {timelinePoints.length} điểm đo lấy mẫu đại diện
            </div>
          </div>

          {/* SVG Multi-Line Chart Container */}
          <div className="relative border border-slate-200/90 rounded-2xl bg-slate-50/60 p-2 sm:p-4 overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto min-w-[550px] overflow-visible"
            >
              <defs>
                <linearGradient id="queryBpmGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="querySpo2Gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[45, 75, 105, 135].map(v => {
                const y = getYBpm(v);
                return (
                  <g key={v}>
                    <line
                      x1={paddingX}
                      y1={y}
                      x2={svgWidth - paddingX}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={paddingX - 8}
                      y={y + 3}
                      fill="#94a3b8"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {v}
                    </text>
                  </g>
                );
              })}

              {/* Right Y Axis: SpO2 */}
              {[85, 90, 95, 100].map(v => {
                const y = getYSpo2(v);
                return (
                  <text
                    key={`spo2-${v}`}
                    x={svgWidth - paddingX + 8}
                    y={y + 3}
                    fill="#0ea5e9"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="start"
                  >
                    {v}%
                  </text>
                );
              })}

              {/* BPM Area & Line */}
              {bpmAreaD && <path d={bpmAreaD} fill="url(#queryBpmGradient)" />}
              {bpmPathD && (
                <path
                  d={bpmPathD}
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* SpO2 Line */}
              {spo2PathD && (
                <path
                  d={spo2PathD}
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Scatter Points & Posture Flags */}
              {timelinePoints.map((d, i) => {
                const x = getX(i, timelinePoints.length);
                const isBad = d.postureStatus === 1 || d.postureStatus === 3 || d.postureStatus === 4;
                const isHovered = hoveredPointIndex === i;

                return (
                  <g key={i}>
                    {/* Posture flag marker at bottom */}
                    {isBad && (
                      <rect
                        x={x - 2}
                        y={paddingY + chartH - 8}
                        width="4"
                        height="8"
                        rx="2"
                        fill="#f59e0b"
                      />
                    )}

                    {/* Interactive invisible hover column */}
                    <rect
                      x={x - (chartW / (timelinePoints.length || 1)) / 2}
                      y={paddingY}
                      width={chartW / (timelinePoints.length || 1)}
                      height={chartH}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredPointIndex(i)}
                      onMouseLeave={() => setHoveredPointIndex(null)}
                    />

                    {/* Point Indicator on BPM */}
                    {d.bpm > 0 && (
                      <circle
                        cx={x}
                        cy={getYBpm(d.bpm)}
                        r={isHovered ? 5 : 2.5}
                        fill="#f43f5e"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                        className="transition-all"
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredPointIndex !== null && timelinePoints[hoveredPointIndex] && (() => {
              const p = timelinePoints[hoveredPointIndex];
              return (
                <div className="mt-2.5 p-3 rounded-xl bg-white border border-slate-200 shadow-md flex items-center justify-between text-xs animate-fadeIn">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                      {p.timeFormatted} {p.dateFormatted}
                    </span>
                    <span className="font-semibold text-slate-800">
                      {p.userName || p.userEmail || 'Thành viên'}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 font-mono text-rose-600 font-bold">
                      <Heart className="w-3.5 h-3.5" />
                      <span>{p.bpm > 0 ? `${p.bpm} BPM` : '--'}</span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-sky-600 font-bold">
                      <Wind className="w-3.5 h-3.5" />
                      <span>{p.spo2 > 0 ? `${p.spo2}%` : '--'}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      p.postureStatus === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {p.postureLabel || (p.postureStatus === 0 ? 'Chuẩn' : 'Sai tư thế')}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 3: MEMBER COMPARISON BAR CHART (EcoTrack & TOEIC Style) */}
      {activeTab === 'comparison' && queryUserScope === 'all' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Xếp Hạng Tỷ Lệ Ngồi Chuẩn Theo Từng Thành Viên:
            </span>
            <span className="text-[11px] text-slate-500">
              Bấm vào tên để lọc báo cáo riêng
            </span>
          </div>

          <div className="space-y-3">
            {rankedMembers.map((member, idx) => {
              const goodRatio = member.total > 0 ? Math.round((member.good / member.total) * 100) : 0;
              const isBest = idx === 0 && goodRatio >= 70;

              return (
                <div 
                  key={member.userId}
                  onClick={() => onSelectMember?.(member.userId)}
                  className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-md text-[11px] font-mono font-bold flex items-center justify-center ${
                        idx === 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-200 text-slate-700'
                      }`}>
                        #{idx + 1}
                      </span>
                      <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition text-xs sm:text-sm">
                        {member.userName}
                      </span>
                      {isBest && (
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          🏆 Tốt nhất
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-extrabold text-emerald-700">
                        {goodRatio}% đúng
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                        ({member.good}/{member.total} logs)
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Comparative Bar */}
                  <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden flex">
                    <div 
                      className="bg-emerald-500 h-full transition-all duration-500" 
                      style={{ width: `${goodRatio}%` }}
                      title={`Đúng chuẩn: ${goodRatio}%`}
                    />
                    <div 
                      className="bg-amber-500 h-full transition-all duration-500" 
                      style={{ width: `${member.total > 0 ? Math.round((member.bad / member.total) * 100) : 0}%` }}
                      title={`Sai tư thế: ${member.bad}`}
                    />
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-500" 
                      style={{ width: `${member.total > 0 ? Math.round((member.standing / member.total) * 100) : 0}%` }}
                      title={`Đứng: ${member.standing}`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                    <div className="flex items-center gap-3">
                      <span>Nhịp tim: <b>{member.countBpm > 0 ? `${Math.round(member.sumBpm / member.countBpm)} BPM` : '--'}</b></span>
                      <span>SpO₂: <b>{member.countSpo2 > 0 ? `${(member.sumSpo2 / member.countSpo2).toFixed(1)}%` : '--'}</b></span>
                      <span>Cảnh báo: <b className={member.alerts > 0 ? 'text-rose-600' : 'text-slate-700'}>{member.alerts}</b></span>
                    </div>
                    <span className="text-indigo-600 font-bold group-hover:underline flex items-center gap-0.5">
                      <Eye className="w-3 h-3" />
                      <span>Xem chi tiết</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
