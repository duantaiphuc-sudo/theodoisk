import React, { useState, useMemo } from 'react';
import { 
  Activity, 
  Heart, 
  Wind, 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight,
  Database,
  Radio,
  Cpu,
  Zap,
  Info
} from 'lucide-react';
import { TelemetryLog, HealthTelemetry, EmployeeNodeStatus } from '../types';

interface WeeklyHealthTrendChartProps {
  historyLogs?: TelemetryLog[];
  liveTelemetry?: HealthTelemetry;
  activeNodes?: EmployeeNodeStatus[];
}

export const WeeklyHealthTrendChart: React.FC<WeeklyHealthTrendChartProps> = ({ 
  historyLogs = [],
  liveTelemetry,
  activeNodes = []
}) => {
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [activeMetric, setActiveMetric] = useState<'both' | 'bpm' | 'spo2'>('both');

  // Extract unique employees dynamically from active nodes and history logs
  const employeeOptions = useMemo(() => {
    const list: { id: string; label: string }[] = [{ id: 'all', label: 'Tất cả nhân viên' }];
    const seen = new Set<string>();

    activeNodes.forEach(node => {
      const id = node.email || node.id;
      if (id && !seen.has(id.toLowerCase())) {
        seen.add(id.toLowerCase());
        list.push({ id, label: `${node.name} (${node.device})` });
      }
    });

    historyLogs.forEach(log => {
      const id = (log.userEmail || log.userId || log.userName || log.device || '').trim();
      const label = log.userName || log.userEmail || log.device;
      if (id && label && !seen.has(id.toLowerCase())) {
        seen.add(id.toLowerCase());
        list.push({ id, label });
      }
    });

    return list;
  }, [activeNodes, historyLogs]);

  // Filter logs according to selected employee
  const filteredLogs = useMemo(() => {
    if (selectedEmployee === 'all') return historyLogs;
    const filterLower = selectedEmployee.toLowerCase().trim();
    return historyLogs.filter(l => {
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
  }, [historyLogs, selectedEmployee]);

  // Filter nodes according to selected employee
  const displayNodes = useMemo(() => {
    if (selectedEmployee === 'all') return activeNodes;
    const filterLower = selectedEmployee.toLowerCase().trim();
    return activeNodes.filter(n => {
      return (
        n.email.toLowerCase() === filterLower ||
        n.id.toLowerCase() === filterLower ||
        n.name.toLowerCase() === filterLower ||
        n.device.toLowerCase() === filterLower
      );
    });
  }, [activeNodes, selectedEmployee]);

  // Calculate live aggregate stats - strictly for nodes that are currently online and present/transmitting
  const activeWorkingNodes = displayNodes.filter(n => n.isOnline && (n.presence === 'Present' || n.bpm > 0));
  const liveCount = activeWorkingNodes.length;

  const validBpmNodes = activeWorkingNodes.filter(n => n.bpm > 0);
  const currentAvgBpm = validBpmNodes.length > 0
    ? Math.round(validBpmNodes.reduce((acc, cur) => acc + cur.bpm, 0) / validBpmNodes.length)
    : (liveTelemetry && liveTelemetry.trackingActive && liveTelemetry.bpm > 0 ? liveTelemetry.bpm : 0);

  const validSpo2Nodes = activeWorkingNodes.filter(n => n.spo2 > 0);
  const currentAvgSpo2 = validSpo2Nodes.length > 0
    ? Number((validSpo2Nodes.reduce((acc, cur) => acc + cur.spo2, 0) / validSpo2Nodes.length).toFixed(1))
    : (liveTelemetry && liveTelemetry.trackingActive && liveTelemetry.spo2 > 0 ? liveTelemetry.spo2 : 0);

  const nodesWithPosture = activeWorkingNodes.filter(n => n.posture !== 'waiting');
  const correctPostureNodes = nodesWithPosture.filter(n => n.posture === 'correct').length;
  const livePostureRate = nodesWithPosture.length > 0
    ? Math.round((correctPostureNodes / nodesWithPosture.length) * 100)
    : (liveTelemetry && liveTelemetry.trackingActive && liveTelemetry.postureStatus >= 0 
        ? (liveTelemetry.postureStatus === 0 ? 100 : 0) 
        : null);

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 p-4 sm:p-6 shadow-xs space-y-5 animate-fadeIn">
      {/* 1. Header & Live Indicator */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
              Tổng Quan Dữ Liệu Đo Đạc Thời Gian Thực
            </h3>
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Trực Tuyến Realtime</span>
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {filteredLogs.length} bản ghi Cloud
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Hiển thị trực tiếp nhịp tim, SpO₂ và tư thế theo thời gian thực từ Raspberry Pi 4 và các thiết bị đang hoạt động
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

      {/* 2. Real-time Summary Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: BPM Hiện Tại */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between hover:border-slate-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Nhịp Tim Realtime</span>
            <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Heart className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900">
                {currentAvgBpm > 0 ? currentAvgBpm : '--'}
              </span>
              <span className="text-xs text-slate-500 font-mono">BPM</span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[11px] font-semibold text-slate-600">
              {currentAvgBpm > 0 ? (
                <>
                  <Activity className="w-3.5 h-3.5 text-rose-500" />
                  <span>{currentAvgBpm >= 60 && currentAvgBpm <= 100 ? 'Nhịp tim bình thường' : 'Cần chú ý'}</span>
                </>
              ) : (
                <span className="text-slate-400 font-normal">Chờ cảm biến MAX30102</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: SpO2 Hiện Tại */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between hover:border-slate-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Nồng Độ Oxy SpO₂</span>
            <div className="w-6 h-6 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Wind className="w-3.5 h-3.5 text-sky-600" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900">
                {currentAvgSpo2 > 0 ? currentAvgSpo2 : '--'}
              </span>
              <span className="text-xs text-slate-500 font-mono">%</span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[11px] font-semibold text-slate-600">
              {currentAvgSpo2 > 0 ? (
                <>
                  <ArrowUpRight className="w-3.5 h-3.5 text-sky-600" />
                  <span>{currentAvgSpo2 >= 95 ? 'Bình thường (≥95%)' : 'Thiếu oxy (<95%)'}</span>
                </>
              ) : (
                <span className="text-slate-400 font-normal">Chờ cảm biến quang học</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Tư thế hiện tại */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between hover:border-slate-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Tư Thế Chuẩn Live</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-700">
                {livePostureRate !== null ? `${livePostureRate}%` : '--'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">
              {nodesWithPosture.length > 0 
                ? `${correctPostureNodes}/${nodesWithPosture.length} nhân sự ngồi đúng`
                : 'Chờ dữ liệu tư thế'}
            </span>
          </div>
        </div>

        {/* Card 4: Thiết bị đang hoạt động */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between hover:border-slate-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Đang Có Dữ Liệu</span>
            <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-indigo-950">
                {liveCount}
              </span>
              <span className="text-xs text-slate-500 font-mono">/ {displayNodes.length} node</span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">
              {liveCount > 0 ? 'Tín hiệu trực tuyến' : 'Tất cả đang chờ'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Live Nodes Status Strip & Realtime Stream */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Trạng Thái Trực Tuyến Các Thiết Bị (Live Node Activity):</span>
          </span>
          <span className="text-[11px] font-normal text-slate-500">
            Cập nhật tự động từng giây từ Cloud Firestore
          </span>
        </div>

        {/* Live Active Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {displayNodes.map((node) => {
            const isOnline = node.presence === 'Present' || node.isOnline;
            const hasPostureData = node.posture !== 'waiting';
            const isBad = hasPostureData && node.posture === 'incorrect';
            const isGood = hasPostureData && node.posture === 'correct';

            return (
              <div 
                key={node.id}
                className={`p-3.5 rounded-xl border transition-all duration-300 flex flex-col justify-between space-y-3 ${
                  isOnline
                    ? isBad
                      ? 'bg-rose-50/50 border-rose-300 ring-2 ring-rose-500/10 shadow-xs'
                      : isGood
                      ? 'bg-emerald-50/40 border-emerald-300 ring-2 ring-emerald-500/10 shadow-xs'
                      : 'bg-white border-slate-200/90 shadow-xs'
                    : 'bg-slate-50/70 border-slate-200 opacity-80'
                }`}
              >
                {/* Node Top Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img 
                      src={node.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120'}
                      alt={node.name}
                      className="w-7 h-7 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 text-xs truncate block">{node.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono block">{node.device}</span>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                    node.presence === 'Present' || node.isOnline
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}>
                    {node.presence === 'Present' || node.isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Nhịp tim</span>
                    <span className="font-extrabold font-mono text-slate-900 text-xs sm:text-sm">
                      {node.bpm > 0 ? `${node.bpm} bpm` : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">SpO₂</span>
                    <span className="font-extrabold font-mono text-sky-700 text-xs sm:text-sm">
                      {node.spo2 > 0 ? `${node.spo2}%` : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Ngồi</span>
                    <span className="font-extrabold font-mono text-slate-800 text-xs sm:text-sm">
                      {node.sittingMinutes} ph
                    </span>
                  </div>
                </div>

                {/* Posture Badge */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">Tư thế:</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${
                    node.posture === 'correct'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : node.posture === 'incorrect'
                      ? 'bg-rose-100 text-rose-800 border border-rose-200 animate-pulse'
                      : node.posture === 'absent'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}>
                    {node.postureText}
                  </span>
                </div>

                {/* Alert Warning if any */}
                {node.hasAlert && (
                  <div className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                    <span className="truncate">{node.alertReason || 'Cần điều chỉnh tư thế'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
