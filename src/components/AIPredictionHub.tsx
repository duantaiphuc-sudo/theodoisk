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
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  HeartPulse,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
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
  goldenHours: string;
  slumpWarningWindow: string;
  breakScheduleRecommendation: string;
  riskForecasts: PredictiveRiskDomain[];
  dataExploitationSummary: Array<{
    purpose: string;
    insight: string;
    recommendedAction: string;
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
  onOpenSettingsModal,
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string>(currentUser.id);
  const [aiForecast, setAiForecast] = useState<AIPredictionResponse | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isApplyingThresholds, setIsApplyingThresholds] = useState<boolean>(false);
  const [thresholdNotice, setThresholdNotice] = useState<string | null>(null);

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

  const handleExportThesisReport = () => {
    const lines: string[] = [
      `# BÁO CÁO AI DỰ ĐOÁN & KHAI THÁC DỮ LIỆU CÔNG THÁI HỌC`,
      `Đối tượng phân tích: ${targetDisplayName}`,
      `Thời điểm xuất báo cáo: ${new Date().toLocaleString('vi-VN')}`,
      `Tổng số bản ghi phân tích: ${analytics.sampleCount} bản ghi (Sinh hiệu hợp lệ: ${analytics.validVitalCount})`,
      ``,
      `## I. CHỈ SỐ DỰ BÁO ĐỊNH LƯỢNG`,
      `- Điểm OHPS hiện tại: ${analytics.ohpsForecast.currentScore}/100`,
      `- Dự báo OHPS ca tới: ${aiForecast?.predictedOhpsNextShift.score ?? analytics.ohpsForecast.predictedScore}/100 (Xu hướng: ${aiForecast?.predictedOhpsNextShift.trendLabel ?? analytics.ohpsForecast.trendLabel}, Độ tin cậy: ${aiForecast?.predictedOhpsNextShift.confidencePercent ?? analytics.ohpsForecast.confidencePercent}%)`,
      `- Nguy cơ đốt sống cổ C5-C7: ${analytics.postureFatigue.neckSpineRiskPercent}% | Nguy cơ thắt lưng L4-L5: ${analytics.postureFatigue.lumbarRiskPercent}%`,
      `- Thời gian ước tính tới ngưỡng mỏi cổ/lưng: ~${analytics.postureFatigue.predictedMinutesUntilSlouch} phút ngồi liên tục`,
      `- Tương quan sinh hiệu: Ngồi chuẩn ${analytics.vitalCorrelation.goodPostureAvgBpm} BPM (${analytics.vitalCorrelation.goodPostureAvgSpo2}% SpO2) vs Sai tư thế ${analytics.vitalCorrelation.badPostureAvgBpm} BPM (${analytics.vitalCorrelation.badPostureAvgSpo2}% SpO2)`,
      `- Khung giờ vàng tập trung: ${aiForecast?.goldenHours ?? analytics.circadian.goldenHoursWindow}`,
      `- Khung giờ dễ suy giảm năng lượng: ${aiForecast?.slumpWarningWindow ?? analytics.circadian.slumpRiskWindow}`,
      ``,
      `## II. NHẬN ĐỊNH TỪ MÔ HÌNH AI (${aiForecast?.engine || 'statistical-engine'})`,
      aiForecast?.executiveSummary || analytics.ohpsForecast.trendReason,
      ``,
      `## III. 6 MỤC ĐÍCH KHAI THÁC DỮ LIỆU THU THẬP ĐƯỢC`,
      ...analytics.exploitationMatrix.flatMap(item => [
        `### ${item.title}`,
        `- Nhóm ứng dụng: ${item.category}`,
        `- Dữ liệu đầu vào: ${item.inputSignals.join(', ')}`,
        `- Phương pháp xử lý: ${item.processingMethod}`,
        `- Kết quả đo được: ${item.liveMetricLabel} = ${item.liveMetricValue}`,
        `- Giá trị thực tiễn: ${item.businessValue}`,
        ``,
      ]),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao-cao-ai-khai-thac-du-lieu-${new Date().toISOString().slice(0, 10)}.md`;
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
      {/* Header Control Bar (Clinical Light Surface) */}
      <section className="p-4 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="text-base sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  AI Dự Đoán &amp; Khai Thác Dữ Liệu Đa Mục Đích
                </h2>
                <span className="text-xs font-mono font-semibold text-teal-700">
                  {aiForecast?.engine === 'gemini-4-hydrogen' ? 'Gemini 4 AI' : 'Statistical Trend Engine'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                Phân tích dữ liệu thu thập từ Raspberry Pi 4 ({analytics.sampleCount} bản ghi · {analytics.validVitalCount} mẫu sinh hiệu MAX30102) để dự báo rủi ro sức khỏe, nhịp điệu tập trung và tối ưu ngưỡng thiết bị ngoài bài toán tính năng suất OHPS.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isManager && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 min-h-[44px]">
                <Users className="w-4 h-4 text-slate-500 shrink-0" />
                <select
                  value={selectedTargetId}
                  onChange={e => setSelectedTargetId(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none cursor-pointer pr-1"
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
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-xs whitespace-nowrap"
            >
              {isLoadingAI ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-teal-400" />
              )}
              <span>{isLoadingAI ? 'Đang dự báo...' : 'Phân tích AI ngay'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportThesisReport}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs sm:text-sm font-semibold flex items-center gap-2 transition cursor-pointer whitespace-nowrap"
              title="Xuất báo cáo phân tích và 6 mục đích khai thác dữ liệu dưới dạng Markdown"
            >
              <Download className="w-4 h-4 text-slate-500" />
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
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">
              Dự báo OHPS ca tới
            </span>
            <TrendingUp className="w-4 h-4 text-teal-600 shrink-0" />
          </div>
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
              {displayedOhpsScore}
            </span>
            <span className="text-xs font-mono text-slate-500">/ 100đ</span>
            <span
              className={`text-xs font-mono font-bold inline-flex items-center gap-0.5 ${
                displayedDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {displayedDelta >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" />
              )}
              {displayedDelta >= 0 ? `+${displayedDelta}` : displayedDelta}đ
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Độ tin cậy <strong className="font-mono text-slate-800">{displayedConfidence}%</strong> · {aiForecast?.predictedOhpsNextShift.trendLabel || analytics.ohpsForecast.trendLabel}
          </p>
        </div>

        {/* Card 2: Musculoskeletal Risk */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">
              Nguy cơ Cổ / Lưng
            </span>
            <AlertTriangle
              className={`w-4 h-4 shrink-0 ${
                analytics.postureFatigue.overallRiskLevel === 'Cao'
                  ? 'text-rose-600'
                  : analytics.postureFatigue.overallRiskLevel === 'Trung bình'
                  ? 'text-amber-600'
                  : 'text-emerald-600'
              }`}
            />
          </div>
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
              {Math.max(analytics.postureFatigue.neckSpineRiskPercent, analytics.postureFatigue.lumbarRiskPercent)}%
            </span>
            <span
              className={`text-xs font-bold ${
                analytics.postureFatigue.overallRiskLevel === 'Cao'
                  ? 'text-rose-700'
                  : analytics.postureFatigue.overallRiskLevel === 'Trung bình'
                  ? 'text-amber-700'
                  : 'text-emerald-700'
              }`}
            >
              Mức {analytics.postureFatigue.overallRiskLevel}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Dự báo mỏi sau <strong className="font-mono text-slate-800">~{analytics.postureFatigue.predictedMinutesUntilSlouch} phút</strong> ngồi liên tục
          </p>
        </div>

        {/* Card 3: Vital Drift & Stress */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">
              Stress &amp; Lệch Sinh hiệu
            </span>
            <HeartPulse className="w-4 h-4 text-sky-600 shrink-0" />
          </div>
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
              {analytics.vitalCorrelation.stressIndex}
            </span>
            <span className="text-xs font-mono text-slate-500">/ 100</span>
            <span className="text-xs font-mono font-semibold text-sky-700">
              {analytics.vitalCorrelation.bpmDriftOnSlouch >= 0 ? '+' : ''}
              {analytics.vitalCorrelation.bpmDriftOnSlouch} BPM khi gù
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            TB: <strong className="font-mono text-slate-800">{analytics.avgBpm || '--'}</strong> BPM · SpO₂{' '}
            <strong className="font-mono text-slate-800">{analytics.avgSpo2 || '--'}%</strong>
          </p>
        </div>

        {/* Card 4: Optimal Break Cadence */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">
              Lịch nghỉ tối ưu AI
            </span>
            <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div className="mt-3 flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
              {analytics.recommendedBreakCadence.sitMinutes}p
            </span>
            <span className="text-xs font-semibold text-slate-500">ngồi :</span>
            <span className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-700">
              {analytics.recommendedBreakCadence.standMinutes}p
            </span>
            <span className="text-xs font-semibold text-slate-500">đứng</span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Giờ vàng: <strong className="font-mono text-slate-800">{aiForecast?.goldenHours || analytics.circadian.goldenHoursWindow}</strong>
          </p>
        </div>
      </section>

      {/* Row 2: Hourly Trajectory Chart + Gemini AI Risk Forecast */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
        {/* Left: Circadian & Forecast Trajectory Chart */}
        <div className="lg:col-span-7 p-4 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Đường Cong Nhịp Điệu Tập Trung &amp; Dự Báo Theo Giờ (08:00 – 18:00)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Đối chiếu hiệu suất tư thế thực tế với đường dự báo suy giảm công thái học theo khung giờ làm việc.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium text-slate-600 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-teal-500" />
                Thực tế
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-sky-600" />
                AI Dự báo
              </span>
            </div>
          </div>

          <div className="w-full h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
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
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: '12px',
                    fontSize: '12px',
                    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
                  }}
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
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-3.5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <div className="font-bold text-emerald-800">Khung giờ vàng tập trung</div>
              <div className="font-mono font-extrabold text-sm text-emerald-950 mt-0.5">
                {aiForecast?.goldenHours || analytics.circadian.goldenHoursWindow}
              </div>
              <p className="text-emerald-800 mt-1 leading-relaxed">
                Tư thế ổn định và nhịp tim cân bằng nhất; phù hợp xếp việc phân tích chuyên sâu.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80">
              <div className="font-bold text-amber-800">Khung giờ dễ suy giảm năng lượng</div>
              <div className="font-mono font-extrabold text-sm text-amber-950 mt-0.5">
                {aiForecast?.slumpWarningWindow || analytics.circadian.slumpRiskWindow}
              </div>
              <p className="text-amber-800 mt-1 leading-relaxed">
                Tần suất cúi gù và mệt mỏi tăng; nên chuyển sang chế độ đứng làm việc 5-10 phút.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Gemini AI Structured Clinical & Ergonomic Risks */}
        <div className="lg:col-span-5 p-4 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Chẩn Đoán Dự Báo Rủi Ro Sức Khỏe (AI Forecast)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Phân tích xác suất phát sinh sự cố trong phiên tiếp theo từ chuỗi dữ liệu tích lũy.
              </p>
            </div>
            <button
              type="button"
              onClick={runAIPrediction}
              disabled={isLoadingAI}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
              title="Làm mới phân tích AI"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingAI ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Executive Summary Box */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs sm:text-sm text-slate-700 leading-relaxed">
            {isLoadingAI && !aiForecast ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                <span>Đang tổng hợp dữ liệu sinh trắc học &amp; chạy mô hình dự báo...</span>
              </div>
            ) : (
              aiForecast?.executiveSummary || analytics.ohpsForecast.trendReason
            )}
          </div>

          {/* Risk Domains List */}
          <div className="space-y-3">
            {(aiForecast?.riskForecasts || []).map((risk, idx) => {
              const barColor =
                risk.severity === 'Cao'
                  ? 'bg-rose-600'
                  : risk.severity === 'Trung bình'
                  ? 'bg-amber-500'
                  : 'bg-emerald-600';
              const textColor =
                risk.severity === 'Cao'
                  ? 'text-rose-700'
                  : risk.severity === 'Trung bình'
                  ? 'text-amber-700'
                  : 'text-emerald-700';
              return (
                <div key={idx} className="p-3 rounded-xl border border-slate-200/80 bg-white space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-bold text-slate-900">{risk.domain}</span>
                    <span className={`text-xs font-mono font-extrabold ${textColor} whitespace-nowrap`}>
                      {risk.probabilityPercent}% · {risk.severity}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${risk.probabilityPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
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
            <strong className="font-bold">Khuyến nghị lịch giải lao:</strong>{' '}
            {aiForecast?.breakScheduleRecommendation || analytics.recommendedBreakCadence.rationale}
          </div>
        </div>
      </section>

      {/* Row 3: Closed-Loop Adaptive Threshold Optimization -> Raspberry Pi 4 */}
      <section className="p-4 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Tối Ưu Ngưỡng Cảnh Báo Thích Ứng (Closed-Loop AI → Raspberry Pi 4)
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Hệ thống đối chiếu hồ sơ bệnh nền + hành vi sai tư thế thực tế để đề xuất bộ ngưỡng tối ưu và ghi trực tiếp xuống Pi 4 qua Firestore.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenSettingsModal && isManager && (
              <button
                type="button"
                onClick={onOpenSettingsModal}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
              >
                Mở bảng ngưỡng chi tiết
              </button>
            )}
            <button
              type="button"
              onClick={handleApplySuggestedThresholds}
              disabled={isApplyingThresholds}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-xs whitespace-nowrap"
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
                className={`p-3.5 rounded-xl border ${
                  hasDiff ? 'bg-sky-50/50 border-sky-200' : 'bg-slate-50/70 border-slate-200'
                }`}
              >
                <div className="text-xs font-bold text-slate-800">{item.label}</div>
                <div className="mt-2 flex items-center gap-2 font-mono">
                  <span className="text-xs text-slate-500">
                    Hiện tại: <strong>{item.currentValue}</strong> {item.unit}
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className={`text-sm font-extrabold ${hasDiff ? 'text-teal-700' : 'text-slate-800'}`}>
                    {item.suggestedValue} {item.unit}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">{item.reason}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Row 4: 6 Multi-Purpose Data Exploitation Matrix (Answering Advisor Question) */}
      <section className="p-4 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Bản Đồ Khai Thác Dữ Liệu Đa Mục Đích (6 Hướng Ứng Dụng Thực Tiễn)
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Ngoài việc tính Điểm Năng Suất OHPS, dữ liệu cảm biến MAX30102 và Camera AI được xử lý cho 5 bài toán chuyên sâu khác dưới đây.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-500 shrink-0">
            6 luồng xử lý đang hoạt động
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {analytics.exploitationMatrix.map(card => (
            <div
              key={card.id}
              className="p-4 rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-slate-300 transition flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
                  <span className="text-teal-700 font-bold uppercase tracking-wider">{card.category}</span>
                  <span className="font-mono">{card.statusLabel}</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 leading-snug">{card.title}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{card.processingMethod}</p>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-slate-200/70">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">{card.liveMetricLabel}:</span>
                  <span className="font-mono font-extrabold text-slate-900">{card.liveMetricValue}</span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Đầu vào: {card.inputSignals.join(' · ')}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 inline mr-1 -mt-0.5" />
                  {card.businessValue}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* AI Synthesized Exploitation Highlights (if available) */}
        {aiForecast?.dataExploitationSummary && aiForecast.dataExploitationSummary.length > 0 && (
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-teal-600" />
              <span>Gợi ý khai thác chuyên sâu theo tập dữ liệu của {targetDisplayName}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {aiForecast.dataExploitationSummary.map((item, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-teal-50/50 border border-teal-200/70 space-y-1">
                  <div className="text-xs font-bold text-teal-900">{item.purpose}</div>
                  <p className="text-xs text-slate-700 leading-relaxed">{item.insight}</p>
                  <p className="text-xs font-semibold text-teal-800 pt-1">
                    Hành động: {item.recommendedAction}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
