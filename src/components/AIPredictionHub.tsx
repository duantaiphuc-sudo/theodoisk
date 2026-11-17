import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  HeartPulse,
  ListPlus,
  Loader2,
  RefreshCw,
  Sliders,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { getAuth } from 'firebase/auth';
import {
  AlertThresholds,
  AuthUser,
  HealthTelemetry,
  TelemetryLog,
  TimeCalculations,
  UserTaskNotification,
} from '../types';
import { getSavedFirebaseConfig, initializeFirebaseApp } from '../services/firebase';
import { getSavedSupabaseConfig } from '../services/supabaseService';
import { OHPSCalculationResult } from '../utils/ohpsCalculator';
import { buildPredictiveAnalytics } from '../utils/predictiveAnalytics';

interface PredictiveRiskDomain {
  domain: string;
  probabilityPercent: number;
  severity: 'Thấp' | 'Trung bình' | 'Cao';
  timeframe: string;
  evidence: string;
  preventiveAction: string;
}

interface AIPredictionResponse {
  engine: 'gemini-4-hydrogen' | 'statistical-engine';
  generatedAt: string;
  targetName: string;
  recordCountAnalyzed: number;
  executiveSummary: string;
  predictedOhpsNextShift: {
    score: number;
    confidencePercent: number;
    trendLabel: string;
    reasoning: string;
  };
  next2HourForecast?: {
    statusSummary: string;
    postureRiskPercent: number;
    recommendedActionNow: string;
  };
  vitalForecastSummary?: string;
  goldenHours: string;
  slumpWarningWindow: string;
  breakScheduleRecommendation: string;
  riskForecasts: PredictiveRiskDomain[];
  recommendedTasks?: Array<{
    title: string;
    content: string;
    priority: 'normal' | 'high' | 'urgent';
    suggestedTime?: string;
  }>;
  aiNote?: string;
}

interface AIPredictionHubProps {
  currentUser: AuthUser;
  isManager: boolean;
  allUsers: AuthUser[];
  telemetry: HealthTelemetry;
  history: TelemetryLog[];
  timeStats: TimeCalculations;
  thresholds: AlertThresholds;
  ohpsData: OHPSCalculationResult;
  tasks: UserTaskNotification[];
  onApplyThresholds: (nextThresholds: AlertThresholds) => Promise<void> | void;
  onCreateTask?: (task: {
    title: string;
    content: string;
    priority: 'normal' | 'high' | 'urgent';
    targetUserName?: string;
    deadline?: string;
  }) => Promise<void> | void;
  onOpenSettingsModal?: () => void;
}

export const AIPredictionHub: React.FC<AIPredictionHubProps> = ({
  currentUser,
  isManager,
  allUsers,
  telemetry,
  history,
  timeStats,
  thresholds,
  ohpsData,
  tasks,
  onApplyThresholds,
  onCreateTask,
  onOpenSettingsModal,
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string>(currentUser.id);
  const [aiForecast, setAiForecast] = useState<AIPredictionResponse | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isApplyingThresholds, setIsApplyingThresholds] = useState<boolean>(false);
  const [thresholdNotice, setThresholdNotice] = useState<string | null>(null);
  const [chartViewMode, setChartViewMode] = useState<'posture' | 'vitals'>('posture');
  const [creatingTaskKey, setCreatingTaskKey] = useState<string | null>(null);
  const [createdTaskKeys, setCreatedTaskKeys] = useState<Record<string, boolean>>({});
  const [taskNotice, setTaskNotice] = useState<string | null>(null);

  const selectedTargetUser = useMemo(() => {
    if (!isManager || selectedTargetId === currentUser.id) return currentUser;
    if (selectedTargetId === 'all') return null;
    return allUsers.find(u => u.id === selectedTargetId) || currentUser;
  }, [isManager, selectedTargetId, currentUser, allUsers]);

  const scopedHistory = useMemo(() => {
    if (!isManager || selectedTargetId === 'all') return history;
    const targetEmail = (selectedTargetUser?.email || '').toLowerCase().trim();
    const filtered = history.filter(item => {
      const uid = item.userId || (item as any).user_id;
      const email = (item.userEmail || '').toLowerCase().trim();
      return uid === selectedTargetId || (targetEmail && email === targetEmail) || !uid;
    });
    return filtered.length > 0 ? filtered : history;
  }, [history, isManager, selectedTargetId, selectedTargetUser]);

  const analytics = useMemo(() => {
    return buildPredictiveAnalytics({
      history: scopedHistory,
      timeStats,
      thresholds,
      currentUser: selectedTargetUser || currentUser,
      telemetry,
      ohpsData,
      tasks,
    });
  }, [scopedHistory, timeStats, thresholds, selectedTargetUser, currentUser, telemetry, ohpsData, tasks]);

  const targetDisplayName = useMemo(() => {
    if (isManager && selectedTargetId === 'all') return 'Toàn bộ đội ngũ';
    return selectedTargetUser?.fullName || selectedTargetUser?.username || currentUser.fullName;
  }, [isManager, selectedTargetId, selectedTargetUser, currentUser.fullName]);

  const runAIPrediction = useCallback(async () => {
    setIsLoadingAI(true);
    setAiError(null);
    try {
      const fbCfg = getSavedFirebaseConfig();
      const app = initializeFirebaseApp(fbCfg);
      const auth = getAuth(app);
      const token = await auth.currentUser?.getIdToken();

      if (!token) {
        throw new Error('Phiên đăng nhập Firebase chưa sẵn sàng để xác thực yêu cầu AI.');
      }

      const supaCfg = getSavedSupabaseConfig();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      if (supaCfg?.url && supaCfg?.anonKey) {
        headers['x-supabase-url'] = supaCfg.url;
        headers['x-supabase-key'] = supaCfg.anonKey;
      }

      const res = await fetch('/api/ai-predict', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetMemberId: isManager ? selectedTargetId : currentUser.id,
          targetMemberName: targetDisplayName,
          userName: currentUser.fullName || currentUser.username,
          analyticsSummary: analytics,
          recentLogs: scopedHistory.slice(0, 60),
          userProfile: {
            age: (selectedTargetUser || currentUser).age,
            gender: (selectedTargetUser || currentUser).gender,
            height: (selectedTargetUser || currentUser).height,
            weight: (selectedTargetUser || currentUser).weight,
            medicalConditions: (selectedTargetUser || currentUser).medicalConditions || [],
          },
          thresholds,
          supabaseConfig: supaCfg?.url && supaCfg?.anonKey ? { url: supaCfg.url, anonKey: supaCfg.anonKey } : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Không thể hoàn tất phân tích dự báo AI.');
      }

      setAiForecast(data as AIPredictionResponse);
    } catch (err: any) {
      setAiError(err?.message || 'Lỗi kết nối dịch vụ dự báo AI.');
    } finally {
      setIsLoadingAI(false);
    }
  }, [
    isManager,
    selectedTargetId,
    currentUser,
    targetDisplayName,
    analytics,
    scopedHistory,
    selectedTargetUser,
    thresholds,
  ]);

  useEffect(() => {
    runAIPrediction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTargetId]);

  const teamRiskRanking = useMemo(() => {
    if (!isManager || selectedTargetId !== 'all' || allUsers.length === 0) return [];
    return allUsers
      .map(member => {
        const memberEmail = (member.email || '').toLowerCase().trim();
        const logs = history.filter(item => {
          const uid = item.userId || (item as any).user_id;
          const email = (item.userEmail || '').toLowerCase().trim();
          return uid === member.id || (memberEmail && email === memberEmail);
        });
        const total = logs.length;
        const goodCount = logs.filter(l => l.postureStatus === 0).length;
        const badCount = logs.filter(l => l.postureStatus === 1 || l.postureStatus === 3).length;
        const alertCount = logs.filter(l => Boolean(l.hasAlert)).length;
        const validBpm = logs.filter(l => Number(l.bpm) > 0);
        const avgBpm = validBpm.length > 0
          ? Math.round(validBpm.reduce((s, l) => s + Number(l.bpm), 0) / validBpm.length)
          : (member.bpm || 0);
        const goodRatio = total > 0 ? Math.round((goodCount / total) * 100) : 100;
        const riskScore = total > 0 ? Math.min(99, Math.round((badCount / total) * 70 + Math.min(30, alertCount * 4))) : 0;
        const riskLevel: 'Cao' | 'Trung bình' | 'Thấp' =
          riskScore >= 55 ? 'Cao' : riskScore >= 25 ? 'Trung bình' : 'Thấp';

        return {
          id: member.id,
          name: member.fullName || member.username || member.email || 'Thành viên',
          department: member.department || 'Nhân sự',
          total,
          goodRatio,
          badCount,
          alertCount,
          avgBpm,
          riskScore,
          riskLevel,
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore || b.alertCount - a.alertCount);
  }, [isManager, selectedTargetId, allUsers, history]);

  const handleApplySuggestedThresholds = async () => {
    setIsApplyingThresholds(true);
    setThresholdNotice(null);
    try {
      await onApplyThresholds(analytics.suggestedThresholds);
      setThresholdNotice('Đã đồng bộ bộ ngưỡng tối ưu xuống Raspberry Pi 4 thành công.');
      setTimeout(() => setThresholdNotice(null), 5000);
    } catch (err: any) {
      setThresholdNotice(err?.message || 'Không thể lưu ngưỡng đề xuất.');
    } finally {
      setIsApplyingThresholds(false);
    }
  };

  const handleCreateRecommendedTask = async (
    key: string,
    task: { title: string; content: string; priority: 'normal' | 'high' | 'urgent' }
  ) => {
    if (!onCreateTask || creatingTaskKey || createdTaskKeys[key]) return;
    setCreatingTaskKey(key);
    setTaskNotice(null);
    try {
      await onCreateTask({
        title: task.title,
        content: task.content,
        priority: task.priority,
        targetUserName:
          isManager && selectedTargetUser && selectedTargetUser.id !== currentUser.id
            ? selectedTargetUser.fullName
            : undefined,
      });
      setCreatedTaskKeys(prev => ({ ...prev, [key]: true }));
      setTaskNotice(`Đã tạo nhiệm vụ nhắc nhở "${task.title}" thành công.`);
      setTimeout(() => setTaskNotice(null), 5000);
    } catch (err: any) {
      setTaskNotice(err?.message || 'Không thể tạo nhiệm vụ nhắc nhở.');
    } finally {
      setCreatingTaskKey(null);
    }
  };

  const handleExportReport = () => {
    const activeTasks = aiForecast?.recommendedTasks?.length
      ? aiForecast.recommendedTasks
      : analytics.suggestedTasks;
    const lines: string[] = [
      `# BÁO CÁO AI DỰ ĐOÁN SỨC KHỎE & CÔNG THÁI HỌC`,
      `Đối tượng: ${targetDisplayName}`,
      `Thời điểm xuất: ${new Date().toLocaleString('vi-VN')}`,
      `Số mẫu phân tích: ${analytics.sampleCount} bản ghi (${analytics.validVitalCount} mẫu MAX30102)`,
      ``,
      `## I. CHỈ SỐ DỰ BÁO`,
      `- OHPS hiện tại: ${analytics.ohpsForecast.currentScore}/100 → Dự báo ca tới: ${aiForecast?.predictedOhpsNextShift.score ?? analytics.ohpsForecast.predictedScore}/100 (${aiForecast?.predictedOhpsNextShift.trendLabel ?? analytics.ohpsForecast.trendLabel}, độ tin cậy ${aiForecast?.predictedOhpsNextShift.confidencePercent ?? analytics.ohpsForecast.confidencePercent}%)`,
      `- Dự báo 2 giờ tới: ${aiForecast?.next2HourForecast?.statusSummary || analytics.immediate2hRisk.headline}`,
      `- Nguy cơ Cổ C5-C7: ${analytics.postureFatigue.neckSpineRiskPercent}% | Thắt lưng L4-L5: ${analytics.postureFatigue.lumbarRiskPercent}% (~${analytics.postureFatigue.predictedMinutesUntilSlouch} phút ngồi tới ngưỡng mỏi)`,
      `- Dự báo sinh hiệu: ${aiForecast?.vitalForecastSummary || analytics.vitalForecast.summaryText}`,
      `- Giờ vàng tập trung: ${aiForecast?.goldenHours ?? analytics.circadian.goldenHoursWindow} | Dễ suy giảm: ${aiForecast?.slumpWarningWindow ?? analytics.circadian.slumpRiskWindow}`,
      ``,
      `## II. KIỂM ĐỊNH MÔ HÌNH (WLS · EWMA · SQI · Z-SCORE)`,
      `- R² = ${analytics.modelMetrics.rSquared} | MAE = ${analytics.modelMetrics.mae} | EWMA = ${analytics.modelMetrics.ewmaScore}% | Slope = ${analytics.modelMetrics.regressionSlope >= 0 ? '+' : ''}${analytics.modelMetrics.regressionSlope}`,
      `- SQI MAX30102: ${analytics.modelMetrics.sqiScore}/100 | Nền BPM: ${analytics.modelMetrics.baselineBpmMean || '--'} ± ${analytics.modelMetrics.baselineBpmStd || '--'} (Z-Score mới nhất: ${analytics.modelMetrics.latestBpmZScore}σ | Bất thường: ${analytics.modelMetrics.zScoreAnomalyCount})`,
      ``,
      `## III. NHẬN ĐỊNH & HÀNH ĐỘNG ĐỀ XUẤT (${aiForecast?.engine || 'statistical-engine'})`,
      aiForecast?.executiveSummary || analytics.ohpsForecast.trendReason,
      ``,
      ...activeTasks.map((t, i) => `${i + 1}. [${t.priority.toUpperCase()}] ${t.title}: ${t.content}`),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao-cao-ai-du-doan-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const displayedOhpsScore = aiForecast?.predictedOhpsNextShift?.score ?? analytics.ohpsForecast.predictedScore;
  const displayedConfidence = aiForecast?.predictedOhpsNextShift?.confidencePercent ?? analytics.ohpsForecast.confidencePercent;
  const displayedDelta = displayedOhpsScore - analytics.ohpsForecast.currentScore;

  return (
    <div className="space-y-5 sm:space-y-6 pb-8">
      {/* Header Control Bar (Tactile Neo-Brutalist Surface) */}
      <section className="p-4 sm:p-6 rounded-2xl glass-panel">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#B2F5BE] text-slate-900 border-2 border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-center shrink-0">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="text-base sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  AI Dự Đoán Sức Khỏe &amp; Công Thái Học
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#BAE0EC] text-slate-900 border-[1.5px] border-slate-800 whitespace-nowrap">
                  {aiForecast?.engine === 'gemini-4-hydrogen' ? 'Gemini 4 AI' : 'Statistical Trend Engine'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                Phân tích {analytics.sampleCount} bản ghi Pi 4 ({analytics.validVitalCount} mẫu MAX30102) — dự báo rủi ro 2 giờ tới, sinh hiệu &amp; tối ưu ngưỡng tự động.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isManager && (
              <div className="flex items-center gap-2 bg-white border-2 border-slate-800 shadow-[0_2px_0_#1E293B] rounded-xl px-3 min-h-[44px]">
                <Users className="w-4 h-4 text-slate-700 shrink-0" />
                <select
                  value={selectedTargetId}
                  onChange={e => setSelectedTargetId(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-none cursor-pointer pr-1"
                  aria-label="Chọn đối tượng phân tích dự báo"
                >
                  <option value={currentUser.id}>Cá nhân ({currentUser.fullName})</option>
                  <option value="all">Toàn bộ đội ngũ</option>
                  {allUsers
                    .filter(u => u.id !== currentUser.id)
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.fullName || u.username || u.email}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={runAIPrediction}
              disabled={isLoadingAI}
              className="min-h-[44px] px-4 py-2 rounded-xl tactile-btn-primary disabled:opacity-60 text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              {isLoadingAI ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{isLoadingAI ? 'Đang dự báo...' : 'Phân tích AI ngay'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportReport}
              className="min-h-[44px] px-3.5 py-2 rounded-xl tactile-btn-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap"
              title="Xuất báo cáo dự báo sức khỏe dưới dạng Markdown"
            >
              <Download className="w-4 h-4 text-slate-800" />
              <span>Xuất Báo Cáo</span>
            </button>
          </div>
        </div>

        {(aiError || aiForecast?.aiNote || thresholdNotice) && (
          <div className="mt-4 space-y-2">
            {aiError && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
                <span>{aiError}</span>
                <button
                  type="button"
                  onClick={runAIPrediction}
                  className="font-bold underline cursor-pointer shrink-0"
                >
                  Thử lại
                </button>
              </div>
            )}
            {aiForecast?.aiNote && !aiError && (
              <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                {aiForecast.aiNote}
              </div>
            )}
            {thresholdNotice && (
              <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{thresholdNotice}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Row 1: 4 Predictive KPI Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Next Shift OHPS Forecast */}
        <div className="p-4 sm:p-5 rounded-2xl glass-panel flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-600">
              Dự báo OHPS ca tới
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#B2F5BE] border-[1.5px] border-slate-800 flex items-center justify-center shrink-0">
              <TrendingUp className="w-3.5 h-3.5 text-slate-900" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 tabular-nums">
              {displayedOhpsScore}
            </span>
            <span className="text-xs font-mono text-slate-500">/ 100đ</span>
            <span
              className={`px-2 py-0.5 rounded-full border-[1.5px] border-slate-800 text-[11px] font-mono font-bold inline-flex items-center gap-0.5 ${
                displayedDelta >= 0 ? 'bg-[#B2F5BE] text-slate-900' : 'bg-[#FBC2C8] text-slate-900'
              }`}
            >
              {displayedDelta >= 0 ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              {displayedDelta >= 0 ? `+${displayedDelta}` : displayedDelta}đ
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Độ tin cậy <strong className="font-mono text-slate-900">{displayedConfidence}%</strong> · {aiForecast?.predictedOhpsNextShift.trendLabel || analytics.ohpsForecast.trendLabel}
          </p>
        </div>

        {/* Card 2: Musculoskeletal Risk */}
        <div className="p-4 sm:p-5 rounded-2xl glass-panel flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-600">
              Nguy cơ Cổ / Lưng
            </span>
            <div className={`w-7 h-7 rounded-lg border-[1.5px] border-slate-800 flex items-center justify-center shrink-0 ${
              analytics.postureFatigue.overallRiskLevel === 'Cao'
                ? 'bg-[#FBC2C8]'
                : analytics.postureFatigue.overallRiskLevel === 'Trung bình'
                ? 'bg-[#FDE68A]'
                : 'bg-[#B2F5BE]'
            }`}>
              <AlertTriangle className="w-3.5 h-3.5 text-slate-900" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 tabular-nums">
              {Math.max(analytics.postureFatigue.neckSpineRiskPercent, analytics.postureFatigue.lumbarRiskPercent)}%
            </span>
            <span
              className={`px-2 py-0.5 rounded-full border-[1.5px] border-slate-800 text-[11px] font-bold ${
                analytics.postureFatigue.overallRiskLevel === 'Cao'
                  ? 'bg-[#FBC2C8] text-slate-900'
                  : analytics.postureFatigue.overallRiskLevel === 'Trung bình'
                  ? 'bg-[#FDE68A] text-slate-900'
                  : 'bg-[#B2F5BE] text-slate-900'
              }`}
            >
              Mức {analytics.postureFatigue.overallRiskLevel}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Dự báo mỏi sau <strong className="font-mono text-slate-900">~{analytics.postureFatigue.predictedMinutesUntilSlouch} phút</strong> ngồi liên tục
          </p>
        </div>

        {/* Card 3: Vital Drift & Stress */}
        <div className="p-4 sm:p-5 rounded-2xl glass-panel flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-600">
              Stress &amp; Lệch Sinh hiệu
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#FBC2C8] border-[1.5px] border-slate-800 flex items-center justify-center shrink-0">
              <HeartPulse className="w-3.5 h-3.5 text-slate-900" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 tabular-nums">
              {analytics.vitalCorrelation.stressIndex}
            </span>
            <span className="text-xs font-mono text-slate-500">/ 100</span>
            <span className="px-2 py-0.5 rounded-full border-[1.5px] border-slate-800 bg-[#BAE0EC] text-[11px] font-mono font-bold text-slate-900">
              {analytics.vitalCorrelation.bpmDriftOnSlouch >= 0 ? '+' : ''}
              {analytics.vitalCorrelation.bpmDriftOnSlouch} BPM khi gù
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            TB: <strong className="font-mono text-slate-900">{analytics.avgBpm || '--'}</strong> BPM · Dự kiến{' '}
            <strong className="font-mono text-slate-900">{analytics.vitalForecast.predictedNextBpm || '--'}</strong> BPM · SpO₂{' '}
            <strong className="font-mono text-slate-900">{analytics.avgSpo2 || '--'}%</strong>
          </p>
        </div>

        {/* Card 4: Optimal Break Cadence */}
        <div className="p-4 sm:p-5 rounded-2xl glass-panel flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-600">
              Lịch nghỉ tối ưu AI
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#FDE68A] border-[1.5px] border-slate-800 flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5 text-slate-900" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 tabular-nums">
              {analytics.recommendedBreakCadence.sitMinutes}p
            </span>
            <span className="text-xs font-semibold text-slate-600">ngồi :</span>
            <span className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-700 tabular-nums">
              {analytics.recommendedBreakCadence.standMinutes}p
            </span>
            <span className="text-xs font-semibold text-slate-600">đứng</span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Giờ vàng: <strong className="font-mono text-slate-900">{aiForecast?.goldenHours || analytics.circadian.goldenHoursWindow}</strong>
          </p>
        </div>
      </section>

      {/* Row 1.5: Quantitative Model Diagnostics & Z-Score Anomaly Detection */}
      <section className="p-4 sm:p-5 rounded-2xl glass-panel space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b-2 border-slate-800/15">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#BAE0EC] text-slate-900 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                Độ Tin Cậy Mô Hình (WLS · EWMA · SQI · Z-Score)
              </h3>
              <p className="text-xs text-slate-600">
                Kiểm định hồi quy chuỗi thời gian, chất lượng tín hiệu MAX30102 và phát hiện bất thường cá nhân.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-[#FAF7F0] border-[1.5px] border-slate-800 text-xs font-mono font-bold text-slate-900 shrink-0 whitespace-nowrap">
            R² = {analytics.modelMetrics.rSquared} · MAE = {analytics.modelMetrics.mae}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Metric 1: WLS + EWMA */}
          <div className="p-3.5 rounded-xl glass-subcard space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Hồi quy WLS &amp; EWMA
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xl font-extrabold font-mono text-slate-900">
                {analytics.modelMetrics.ewmaScore}%
              </span>
              <span className="text-xs font-mono font-semibold text-teal-700">
                Slope {analytics.modelMetrics.regressionSlope >= 0 ? '+' : ''}
                {analytics.modelMetrics.regressionSlope}
              </span>
            </div>
            <p className="text-xs text-slate-600 font-mono">
              R² = {analytics.modelMetrics.rSquared} • MAE = {analytics.modelMetrics.mae}đ
            </p>
          </div>

          {/* Metric 2: Real SQI Score */}
          <div className="p-3.5 rounded-xl glass-subcard space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Chất lượng tín hiệu (SQI)
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xl font-extrabold font-mono text-slate-900">
                {analytics.modelMetrics.sqiScore}
              </span>
              <span className="text-xs font-mono text-slate-500">/ 100</span>
              <span
                className={`text-xs font-bold ${
                  analytics.modelMetrics.sqiScore >= 80
                    ? 'text-emerald-700'
                    : analytics.modelMetrics.sqiScore >= 55
                    ? 'text-amber-700'
                    : 'text-rose-700'
                }`}
              >
                {analytics.modelMetrics.sqiScore >= 80
                  ? 'Tín hiệu sạch'
                  : analytics.modelMetrics.sqiScore >= 55
                  ? 'Nhiễu nhẹ'
                  : 'Nhiễu chuyển động'}
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full tactile-progress-track">
              <div
                className={`h-full rounded-full ${
                  analytics.modelMetrics.sqiScore >= 80
                    ? 'bg-[#16B364]'
                    : analytics.modelMetrics.sqiScore >= 55
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, analytics.modelMetrics.sqiScore))}%` }}
              />
            </div>
          </div>

          {/* Metric 3: Personal BPM Baseline */}
          <div className="p-3.5 rounded-xl glass-subcard space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Đường cơ sở cá nhân (μ ± σ)
            </div>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xl font-extrabold font-mono text-slate-900">
                {analytics.modelMetrics.baselineBpmMean || '--'}
              </span>
              <span className="text-xs font-mono text-slate-600">
                ± {analytics.modelMetrics.baselineBpmStd || '--'} BPM
              </span>
            </div>
            <p className="text-xs text-slate-600 font-mono">
              Latest Z-Score:{' '}
              <strong
                className={
                  Math.abs(analytics.modelMetrics.latestBpmZScore) >= 2
                    ? 'text-rose-700'
                    : 'text-sky-700'
                }
              >
                {analytics.modelMetrics.latestBpmZScore >= 0 ? '+' : ''}
                {analytics.modelMetrics.latestBpmZScore}σ
              </strong>
            </p>
          </div>

          {/* Metric 4: Z-Score Anomalies */}
          <div className="p-3.5 rounded-xl glass-subcard space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Bất thường Z-Score (|Z| ≥ 2σ)
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xl font-extrabold font-mono text-slate-900">
                {analytics.modelMetrics.zScoreAnomalyCount}
              </span>
              <span className="text-xs font-semibold text-slate-600">sự kiện gần nhất</span>
            </div>
            <p className="text-xs text-slate-600">
              Ngưỡng lệch chuẩn ±2.0σ so với nền nhịp tim cá nhân.
            </p>
          </div>
        </div>

        {analytics.modelMetrics.anomalyDetails.length > 0 && (
          <div className="pt-2 border-t border-slate-200/70 space-y-2">
            <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Cảnh báo lệch chuẩn sinh học phát hiện gần đây:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {analytics.modelMetrics.anomalyDetails.slice(0, 4).map((anom, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-amber-950">{anom.reason}</div>
                    <div className="text-[11px] font-mono text-amber-800 mt-0.5">
                      {new Date(anom.timestamp).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {anom.bpm} BPM · {anom.spo2}% SpO₂
                    </div>
                  </div>
                  <span className="font-mono font-bold text-amber-900 shrink-0">
                    Z={anom.zScore >= 0 ? '+' : ''}
                    {anom.zScore}σ
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Row 2: Hourly Trajectory Chart (Posture / Vitals Toggle) + Gemini AI Risk Forecast */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
        {/* Left: Circadian & Vital Trajectory Chart */}
        <div className="lg:col-span-7 p-4 sm:p-6 rounded-2xl glass-panel flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                {chartViewMode === 'posture'
                  ? 'Nhịp Điệu Tập Trung & Dự Báo Tư Thế (08:00 – 18:00)'
                  : 'Biến Thiên Nhịp Tim & SpO₂ Theo Giờ (08:00 – 18:00)'}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {chartViewMode === 'posture'
                  ? 'Đối chiếu điểm tư thế thực tế với đường dự báo theo khung giờ.'
                  : aiForecast?.vitalForecastSummary || analytics.vitalForecast.summaryText}
              </p>
            </div>

            <div className="inline-flex items-center p-1 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setChartViewMode('posture')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap transition ${
                  chartViewMode === 'posture'
                    ? 'bg-[#B2F5BE] text-slate-900 border border-slate-800 shadow-[0_1px_0_#1E293B]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tư thế (%)
              </button>
              <button
                type="button"
                onClick={() => setChartViewMode('vitals')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap transition ${
                  chartViewMode === 'vitals'
                    ? 'bg-[#BAE0EC] text-slate-900 border border-slate-800 shadow-[0_1px_0_#1E293B]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Nhịp tim &amp; SpO₂
              </button>
            </div>
          </div>

          <div className="w-full h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              {chartViewMode === 'posture' ? (
                <ComposedChart data={analytics.circadian.hourlyCurve} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="focusActualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="hourLabel"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.92)',
                      borderColor: 'rgba(148, 163, 184, 0.25)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#f8fafc',
                      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.22)',
                    }}
                    itemStyle={{ color: '#f8fafc' }}
                    labelStyle={{ color: '#cbd5e1', fontWeight: 700 }}
                    formatter={(value: any, name: any) => {
                      if (name === 'actualFocusScore') return [`${value}%`, 'Điểm tư thế thực tế'];
                      if (name === 'predictedFocusScore') return [`${value}%`, 'AI Dự báo hiệu suất'];
                      return [value, name];
                    }}
                  />
                  <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Area
                    type="monotone"
                    dataKey="actualFocusScore"
                    name="actualFocusScore"
                    stroke="#0d9488"
                    strokeWidth={2.5}
                    fill="url(#focusActualGrad)"
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="predictedFocusScore"
                    name="predictedFocusScore"
                    stroke="#0284c7"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3, fill: '#0284c7' }}
                  />
                </ComposedChart>
              ) : (
                <ComposedChart data={analytics.circadian.hourlyCurve} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="hourLabel"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="bpm"
                    domain={[45, 130]}
                    tick={{ fontSize: 11, fill: '#e11d48' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="spo2"
                    orientation="right"
                    domain={[88, 100]}
                    tick={{ fontSize: 11, fill: '#0284c7' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.92)',
                      borderColor: 'rgba(148, 163, 184, 0.25)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#f8fafc',
                      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.22)',
                    }}
                    itemStyle={{ color: '#f8fafc' }}
                    labelStyle={{ color: '#cbd5e1', fontWeight: 700 }}
                    formatter={(value: any, name: any) => {
                      if (name === 'avgBpm') return [`${value} BPM`, 'Nhịp tim TB'];
                      if (name === 'avgSpo2') return [`${value}%`, 'SpO₂ TB'];
                      return [value, name];
                    }}
                  />
                  <Line
                    yAxisId="bpm"
                    type="monotone"
                    dataKey="avgBpm"
                    name="avgBpm"
                    stroke="#e11d48"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#e11d48' }}
                    connectNulls
                  />
                  <Line
                    yAxisId="spo2"
                    type="monotone"
                    dataKey="avgSpo2"
                    name="avgSpo2"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#0284c7' }}
                    connectNulls
                  />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-3.5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <div className="font-bold text-emerald-800">Khung giờ vàng tập trung</div>
              <div className="font-mono font-extrabold text-sm text-emerald-950 mt-0.5">
                {aiForecast?.goldenHours || analytics.circadian.goldenHoursWindow}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80">
              <div className="font-bold text-amber-800">Khung giờ dễ suy giảm</div>
              <div className="font-mono font-extrabold text-sm text-amber-950 mt-0.5">
                {aiForecast?.slumpWarningWindow || analytics.circadian.slumpRiskWindow}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Gemini AI 2-Hour & Risk Forecasts */}
        <div className="lg:col-span-5 p-4 sm:p-6 rounded-2xl glass-panel flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                Dự Báo Rủi Ro &amp; Khuyến Nghị AI
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Xác suất sự cố trong ca tiếp theo từ chuỗi cảm biến Pi 4.
              </p>
            </div>
            <button
              type="button"
              onClick={runAIPrediction}
              disabled={isLoadingAI}
              className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer shrink-0"
              title="Làm mới phân tích AI"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingAI ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* 2-Hour Immediate Forecast Highlight */}
          <div className="p-3.5 rounded-xl bg-[#FDE68A]/50 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-slate-900" />
                <span>Dự báo 2 giờ tới</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white border border-slate-800 text-[11px] font-mono font-bold text-slate-900 whitespace-nowrap">
                Rủi ro {aiForecast?.next2HourForecast?.postureRiskPercent ?? analytics.immediate2hRisk.postureRiskPercent}%
              </span>
            </div>
            <p className="text-xs font-bold text-slate-900 leading-snug">
              {aiForecast?.next2HourForecast?.statusSummary || analytics.immediate2hRisk.headline}
            </p>
            <p className="text-xs text-slate-700 leading-snug">
              {aiForecast?.next2HourForecast?.recommendedActionNow ||
                `Ngồi ${analytics.recommendedBreakCadence.sitMinutes}p : Đứng ${analytics.recommendedBreakCadence.standMinutes}p · Nghỉ giải lao sau ~${analytics.immediate2hRisk.minutesToNextBreak} phút.`}
            </p>
          </div>

          {/* Executive Summary Box */}
          <div className="p-3 rounded-xl glass-subcard text-xs text-slate-700 leading-relaxed">
            {isLoadingAI && !aiForecast ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span>Đang chạy mô hình dự báo...</span>
              </div>
            ) : (
              aiForecast?.executiveSummary || analytics.ohpsForecast.trendReason
            )}
          </div>

          {/* Risk Domains List */}
          <div className="space-y-2.5">
            {(aiForecast?.riskForecasts || []).map((risk, idx) => {
              const barColor =
                risk.severity === 'Cao'
                  ? 'bg-rose-600'
                  : risk.severity === 'Trung bình'
                  ? 'bg-amber-500'
                  : 'bg-[#16B364]';
              const badgeColor =
                risk.severity === 'Cao'
                  ? 'bg-[#FBC2C8] text-slate-900'
                  : risk.severity === 'Trung bình'
                  ? 'bg-[#FDE68A] text-slate-900'
                  : 'bg-[#B2F5BE] text-slate-900';
              return (
                <div key={idx} className="p-3 rounded-xl glass-subcard space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">{risk.domain}</span>
                    <span className={`px-2 py-0.5 rounded-full border-[1.5px] border-slate-800 text-[11px] font-mono font-extrabold ${badgeColor} whitespace-nowrap`}>
                      {risk.probabilityPercent}% · {risk.severity}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full tactile-progress-track">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${risk.probabilityPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-600 leading-snug">
                    <strong className="text-slate-800">{risk.timeframe}:</strong> {risk.evidence}
                  </p>
                  <p className="text-xs text-teal-800 font-medium">
                    Phòng ngừa: {risk.preventiveAction}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Break Recommendation Footer */}
          <div className="p-3 rounded-xl bg-sky-50/80 border border-sky-200/80 text-xs text-sky-900 leading-relaxed">
            <strong className="font-bold">Lịch nghỉ đề xuất:</strong>{' '}
            {aiForecast?.breakScheduleRecommendation || analytics.recommendedBreakCadence.rationale}
          </div>
        </div>
      </section>

      {/* Row 3: Closed-Loop Adaptive Threshold Optimization & 1-Click Recommended Tasks */}
      <section className="p-4 sm:p-6 rounded-2xl glass-panel space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FDE68A] text-slate-900 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-center shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                Tối Ưu Ngưỡng Pi 4 &amp; Nhiệm Vụ Hành Động
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Đồng bộ ngưỡng cá nhân hóa xuống Pi 4 hoặc tạo ngay nhiệm vụ nhắc nhở chỉ với 1 chạm.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenSettingsModal && isManager && (
              <button
                type="button"
                onClick={onOpenSettingsModal}
                className="min-h-[44px] px-3.5 py-2 rounded-xl tactile-btn-white text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Mở bảng ngưỡng chi tiết
              </button>
            )}
            <button
              type="button"
              onClick={handleApplySuggestedThresholds}
              disabled={isApplyingThresholds}
              className="min-h-[44px] px-4 py-2 rounded-xl tactile-btn-primary disabled:opacity-60 text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              {isApplyingThresholds ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Cpu className="w-4 h-4" />
              )}
              <span>Áp dụng ngưỡng đề xuất xuống Pi 4</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {analytics.thresholdDiffs.map(item => {
            const hasDiff = item.currentValue !== item.suggestedValue;
            return (
              <div
                key={String(item.key)}
                className={`p-3.5 rounded-xl border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] ${
                  hasDiff ? 'bg-[#BAE0EC]/40' : 'bg-[#FAF7F0]'
                }`}
              >
                <div className="text-xs font-bold text-slate-900">{item.label}</div>
                <div className="mt-2 flex items-center gap-2 font-mono">
                  <span className="text-xs text-slate-600">
                    Hiện tại: <strong>{item.currentValue}</strong> {item.unit}
                  </span>
                  <span className="text-slate-500">→</span>
                  <span className={`text-sm font-extrabold ${hasDiff ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {item.suggestedValue} {item.unit}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">{item.reason}</p>
              </div>
            );
          })}
        </div>

        {/* 1-Click AI Intervention Tasks */}
        <div className="pt-4 border-t-2 border-slate-800/15 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <ListPlus className="w-4 h-4 text-emerald-700" />
              <span>Nhiệm Vụ Đề Xuất Từ AI (Tạo 1 chạm)</span>
            </div>
            {taskNotice && (
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{taskNotice}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(aiForecast?.recommendedTasks?.length ? aiForecast.recommendedTasks : analytics.suggestedTasks).map(
              (taskItem, idx) => {
                const taskKey = `${selectedTargetId}-${idx}-${taskItem.title}`;
                const isDone = Boolean(createdTaskKeys[taskKey]);
                const isCreating = creatingTaskKey === taskKey;
                return (
                  <div
                    key={taskKey}
                    className="p-3.5 rounded-xl glass-subcard flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full border border-slate-800 text-[10px] font-mono font-bold uppercase ${
                            taskItem.priority === 'urgent'
                              ? 'bg-[#FBC2C8] text-slate-900'
                              : taskItem.priority === 'high'
                              ? 'bg-[#FDE68A] text-slate-900'
                              : 'bg-[#BAE0EC] text-slate-900'
                          }`}
                        >
                          {taskItem.priority === 'urgent'
                            ? 'Khẩn cấp'
                            : taskItem.priority === 'high'
                            ? 'Ưu tiên cao'
                            : 'Đề xuất'}
                        </span>
                        {'suggestedTime' in taskItem && typeof taskItem.suggestedTime === 'string' && taskItem.suggestedTime && (
                          <span className="text-[11px] font-mono text-slate-500">
                            {taskItem.suggestedTime}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                        {taskItem.title}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed">{taskItem.content}</p>
                    </div>

                    {onCreateTask && (
                      <button
                        type="button"
                        disabled={isDone || isCreating}
                        onClick={() => handleCreateRecommendedTask(taskKey, taskItem)}
                        className={`w-full min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                          isDone
                            ? 'bg-[#B2F5BE] border-[1.5px] border-slate-800 text-slate-900 cursor-default'
                            : 'tactile-btn-white'
                        }`}
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Đang tạo...</span>
                          </>
                        ) : isDone ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Đã thêm vào Nhiệm vụ</span>
                          </>
                        ) : (
                          <>
                            <ListPlus className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Đặt lịch nhắc</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              }
            )}
          </div>
        </div>
      </section>

      {/* Row 4 (Admin Only when viewing All Team): Team Risk Ranking */}
      {isManager && selectedTargetId === 'all' && teamRiskRanking.length > 0 && (
        <section className="p-4 sm:p-6 rounded-2xl glass-panel space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b-2 border-slate-800/15">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#FBC2C8] text-slate-900 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                  Xếp Hạng Rủi Ro Đội Ngũ
                </h3>
                <p className="text-xs text-slate-600">
                  Sắp xếp theo tỷ lệ sai tư thế và số cảnh báo; chọn thành viên để chạy dự báo chi tiết.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-[#FAF7F0] border-[1.5px] border-slate-800 text-xs font-mono font-bold text-slate-900 whitespace-nowrap">
              {teamRiskRanking.length} thành viên
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {teamRiskRanking.map((member, idx) => (
              <div
                key={member.id}
                className="p-3.5 rounded-xl glass-subcard-interactive flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-slate-500">#{idx + 1} · {member.department}</div>
                    <div className="text-sm font-extrabold text-slate-900 truncate">{member.name}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full border border-slate-800 text-[11px] font-bold whitespace-nowrap ${
                      member.riskLevel === 'Cao'
                        ? 'bg-[#FBC2C8] text-slate-900'
                        : member.riskLevel === 'Trung bình'
                        ? 'bg-[#FDE68A] text-slate-900'
                        : 'bg-[#B2F5BE] text-slate-900'
                    }`}
                  >
                    Rủi ro {member.riskLevel}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono bg-white/70 p-2 rounded-lg border border-slate-200">
                  <div>
                    <div className="text-[10px] text-slate-500 font-sans">Chuẩn</div>
                    <div className="font-bold text-slate-900">{member.goodRatio}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-sans">BPM TB</div>
                    <div className="font-bold text-slate-900">{member.avgBpm || '--'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-sans">Cảnh báo</div>
                    <div className="font-bold text-rose-700">{member.alertCount}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedTargetId(member.id)}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl tactile-btn-white text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  Phân tích chi tiết
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
