import React, { useState, useEffect, useMemo } from 'react';
import { 
  AuthUser, 
  FirebaseConnectionConfig, 
  UserTelemetryLive,
  HealthTelemetry,
  TelemetryLog,
  TelemetryHistoryItem
} from '../types';
import { 
  Shield, 
  Users, 
  Activity, 
  Heart, 
  Wind, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  RefreshCw, 
  Eye, 
  Send, 
  Clock, 
  Wifi, 
  WifiOff, 
  Radio, 
  UserCheck, 
  UserX, 
  User, 
  Sliders, 
  Compass, 
  ChevronRight, 
  X,
  ExternalLink,
  Flame,
  FileText,
  Trash2,
  Database,
  Calendar,
  Download,
  Filter,
  BarChart3,
  Layers
} from 'lucide-react';
import { fetchAllUsers, isUserAdmin, saveCurrentUser, adminDeleteUser } from '../services/authService';
import { 
  subscribeToAllUsersTelemetry, 
  subscribeToUserTelemetry,
  clearUserTelemetryFromFirebase,
  clearAllTelemetryDataFromFirebase 
} from '../services/firebase';
import { fetchSupabaseHistory, TimeRangeFilter, deleteSingleLogFromSupabase } from '../services/supabaseService';
import { exportHealthReportToPDF } from '../services/pdfExportService';

interface AdminDashboardProps {
  currentUser: AuthUser;
  firebaseConfig: FirebaseConnectionConfig;
  currentTelemetry?: HealthTelemetry;
  isSimulating?: boolean;
  history?: TelemetryHistoryItem[];
  onOpenUserManagementModal: () => void;
  onOpenTaskModalWithUser?: (user: AuthUser) => void;
  onWipeAllData?: () => Promise<void>;
  onViewUserHistory?: (user: AuthUser) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  firebaseConfig,
  currentTelemetry,
  isSimulating,
  history,
  onOpenUserManagementModal,
  onOpenTaskModalWithUser,
  onWipeAllData,
  onViewUserHistory,
}) => {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [telemetryMap, setTelemetryMap] = useState<Record<string, UserTelemetryLive>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeNotice, setWipeNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'alerts' | 'bad_posture' | 'absent'>('all');
  const [selectedUserForDetail, setSelectedUserForDetail] = useState<AuthUser | null>(null);
  const [detailTelemetry, setDetailTelemetry] = useState<HealthTelemetry | null>(null);
  const [detailUserLogs, setDetailUserLogs] = useState<TelemetryHistoryItem[]>([]);
  const [isLoadingDetailLogs, setIsLoadingDetailLogs] = useState(false);
  const [detailActiveTab, setDetailActiveTab] = useState<'metrics' | 'history'>('metrics');
  const [detailHistoryFilter, setDetailHistoryFilter] = useState<'all' | 'bad_posture' | 'alerts'>('all');

  // Sub-tab: Giám sát Trực tuyến vs Truy vấn Lịch sử Supabase SQL
  const [activeAdminTab, setActiveAdminTab] = useState<'live' | 'supabase_query'>('live');

  // Supabase Time-Series Query State
  const [queryUserScope, setQueryUserScope] = useState<string>('all');
  const [queryRange, setQueryRange] = useState<TimeRangeFilter>('day');
  const [isQueryingSupabase, setIsQueryingSupabase] = useState(false);
  const [supabaseQueryResult, setSupabaseQueryResult] = useState<{
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
    error?: string;
  } | null>(null);
  const [querySearch, setQuerySearch] = useState('');
  const [queryStatusFilter, setQueryStatusFilter] = useState<'all' | 'good' | 'bad' | 'alerts' | 'absent'>('all');

  // Thống kê phân nhóm theo từng thành viên khi truy vấn "Tất cả nhân viên"
  const memberGroupStats = useMemo(() => {
    if (!supabaseQueryResult?.data) return [];
    const map: Record<string, {
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
    }> = {};

    supabaseQueryResult.data.forEach(d => {
      const key = d.userId || d.userName || 'unknown';
      if (!map[key]) {
        map[key] = {
          userId: d.userId || key,
          userName: d.userName || key,
          userEmail: d.userEmail,
          total: 0,
          good: 0,
          bad: 0,
          standing: 0,
          alerts: 0,
          sumBpm: 0,
          countBpm: 0,
          sumSpo2: 0,
          countSpo2: 0,
          latestTime: `${d.timeFormatted} ${d.dateFormatted}`,
          latestPosture: d.postureLabel,
        };
      }
      const item = map[key];
      item.total++;
      if (d.postureStatus === 0) item.good++;
      if (d.postureStatus === 1 || d.postureStatus === 3) item.bad++;
      if (d.postureStatus === 5) item.standing++;
      if (d.hasAlert) item.alerts++;
      if (d.bpm > 0) {
        item.sumBpm += d.bpm;
        item.countBpm++;
      }
      if (d.spo2 > 0) {
        item.sumSpo2 += d.spo2;
        item.countSpo2++;
      }
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [supabaseQueryResult]);

  const filteredQueryLogs = useMemo(() => {
    if (!supabaseQueryResult?.data) return [];
    return supabaseQueryResult.data.filter(log => {
      if (queryStatusFilter === 'good' && log.postureStatus !== 0) return false;
      if (queryStatusFilter === 'bad' && log.postureStatus !== 1 && log.postureStatus !== 3) return false;
      if (queryStatusFilter === 'alerts' && !log.hasAlert) return false;
      if (queryStatusFilter === 'absent' && log.postureStatus !== 2) return false;

      if (!querySearch.trim()) return true;
      const q = querySearch.toLowerCase();
      return (
        (log.userName || '').toLowerCase().includes(q) ||
        (log.userEmail || '').toLowerCase().includes(q) ||
        (log.postureLabel || '').toLowerCase().includes(q) ||
        (log.timeFormatted || '').toLowerCase().includes(q) ||
        (log.dateFormatted || '').toLowerCase().includes(q)
      );
    });
  }, [supabaseQueryResult, querySearch, queryStatusFilter]);

  const handleRunSupabaseQuery = async (targetUser?: string, range?: TimeRangeFilter) => {
    setIsQueryingSupabase(true);
    const effectiveScope = targetUser !== undefined ? targetUser : queryUserScope;
    const effectiveRange = range !== undefined ? range : queryRange;
    const targetUserId = effectiveScope === 'all' ? undefined : effectiveScope;
    const selectedUserObj = targetUserId ? users.find(u => u.id === targetUserId) : undefined;

    try {
      const res = await fetchSupabaseHistory(effectiveRange, targetUserId, selectedUserObj?.email);
      setSupabaseQueryResult(res);
    } catch (err: any) {
      console.warn('Lỗi truy vấn Supabase:', err);
    } finally {
      setIsQueryingSupabase(false);
    }
  };

  const handleDeleteQueryLog = async (logId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bản ghi này khỏi Supabase?')) return;
    try {
      await deleteSingleLogFromSupabase(logId);
      if (supabaseQueryResult) {
        setSupabaseQueryResult({
          ...supabaseQueryResult,
          data: supabaseQueryResult.data.filter(d => d.id !== logId),
          stats: {
            ...supabaseQueryResult.stats,
            totalRecords: Math.max(0, supabaseQueryResult.stats.totalRecords - 1)
          }
        });
      }
    } catch (e) {
      console.warn('Lỗi xóa bản ghi Supabase:', e);
    }
  };

  const handleExportQueryCSV = () => {
    if (!supabaseQueryResult || supabaseQueryResult.data.length === 0) return;
    const headers = ['ID', 'Thời gian', 'Thành viên', 'Email', 'Tư thế', 'Nhịp tim', 'SpO2', 'Cảnh báo'];
    const rows = supabaseQueryResult.data.map(d => [
      d.id,
      d.timestamp,
      `"${d.userName || ''}"`,
      d.userEmail || '',
      `"${d.postureLabel}"`,
      d.bpm,
      d.spo2,
      d.hasAlert ? 'CÓ' : 'KHÔNG'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `supabase_telemetry_${queryUserScope}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportQueryPDF = () => {
    if (!supabaseQueryResult || supabaseQueryResult.data.length === 0) return;
    const targetUser = users.find(u => u.id === queryUserScope);
    exportHealthReportToPDF({
      currentUser: targetUser || currentUser,
      historyLogs: supabaseQueryResult.data,
    });
  };

  // Load registered users from Firestore
  const loadUsersData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAllUsers();
      setUsers(data);
    } catch (e) {
      console.warn('Lỗi tải danh sách người dùng:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWipeAllTelemetryData = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa toàn bộ dữ liệu mẫu/mô phỏng trên Firebase và đưa hệ thống về trạng thái chờ sạch sẽ?')) {
      return;
    }
    setIsWiping(true);
    try {
      if (onWipeAllData) {
        await onWipeAllData();
      } else {
        await clearAllTelemetryDataFromFirebase(firebaseConfig);
        try {
          localStorage.removeItem('theodoisk_telemetry_history_v2');
          localStorage.removeItem('theodoisk_historical_records_v1');
        } catch {}
      }
      setTelemetryMap({});
      setWipeNotice('Đã xóa sạch toàn bộ dữ liệu mô phỏng. Hệ thống đang ở trạng thái chờ sẵn sàng!');
      setTimeout(() => setWipeNotice(null), 4500);
      loadUsersData();
    } catch (err) {
      console.error('Lỗi khi xóa dữ liệu:', err);
      setWipeNotice('Có lỗi khi xóa dữ liệu.');
      setTimeout(() => setWipeNotice(null), 3000);
    } finally {
      setIsWiping(false);
    }
  };

  useEffect(() => {
    loadUsersData();
  }, []);

  // Subscribe to all users' real-time telemetry from Firestore collection `user_telemetry`
  useEffect(() => {
    const unsub = subscribeToAllUsersTelemetry(firebaseConfig, (map) => {
      setTelemetryMap(map);
    });
    return () => unsub();
  }, [firebaseConfig]);

  // Subscribe to detailed view of selected user
  useEffect(() => {
    if (!selectedUserForDetail) {
      setDetailTelemetry(null);
      return;
    }
    const unsub = subscribeToUserTelemetry(firebaseConfig, selectedUserForDetail.id, (data) => {
      setDetailTelemetry(data);
    });
    return () => unsub();
  }, [selectedUserForDetail, firebaseConfig]);

  // Load history logs for selected user
  useEffect(() => {
    if (!selectedUserForDetail) {
      setDetailUserLogs([]);
      return;
    }
    setIsLoadingDetailLogs(true);
    fetchSupabaseHistory('all', selectedUserForDetail.id, selectedUserForDetail.email)
      .then(res => {
        if (res && res.data && res.data.length > 0) {
          setDetailUserLogs(res.data as any);
        } else if (history && history.length > 0) {
          const matched = history.filter(h => 
            h.userId === selectedUserForDetail.id || 
            (h.userEmail && selectedUserForDetail.email && h.userEmail.toLowerCase() === selectedUserForDetail.email.toLowerCase())
          );
          setDetailUserLogs(matched);
        } else {
          setDetailUserLogs([]);
        }
      })
      .catch(() => {
        if (history && history.length > 0) {
          const matched = history.filter(h => 
            h.userId === selectedUserForDetail.id || 
            (h.userEmail && selectedUserForDetail.email && h.userEmail.toLowerCase() === selectedUserForDetail.email.toLowerCase())
          );
          setDetailUserLogs(matched);
        } else {
          setDetailUserLogs([]);
        }
      })
      .finally(() => {
        setIsLoadingDetailLogs(false);
      });
  }, [selectedUserForDetail, history]);

  // Compute live overview metrics
  const now = Date.now();
  const totalUsersCount = users.length;

  const usersWithTelemetry = users.map(u => {
    // Check if this card represents the current logged-in user in this session
    const isCurrentActiveUser = currentUser && (
      u.id === currentUser.id ||
      (u.email && currentUser.email && u.email.toLowerCase().trim() === currentUser.email.toLowerCase().trim())
    );

    // Prioritize active session telemetry for currentUser, then Firestore real-time map
    const remoteLive = telemetryMap[u.id] || (u.email ? telemetryMap[u.email.toLowerCase().trim()] : undefined);
    const live = (isCurrentActiveUser && currentTelemetry) ? currentTelemetry : remoteLive;

    let isOnline = false;
    let isRecent = false;

    if (isCurrentActiveUser) {
      isOnline = true;
      isRecent = true;
    } else if (live && live.timestamp) {
      const packetAge = Math.floor((now - new Date(live.timestamp).getTime()) / 1000);
      isRecent = !isNaN(packetAge) && packetAge < 90;
      isOnline = isRecent && (Boolean(live.isSimulating) || Boolean(live.trackingActive) || Number(live.bpm) > 0 || (live.postureStatus !== undefined && live.postureStatus >= 0));
    } else if (u.isOnline) {
      isOnline = true;
      isRecent = true;
    }

    const hasAlert = isOnline && Boolean(live?.hasAlert || (live && (live.postureStatus === 1 || live.postureStatus === 3)));
    const isBadPosture = isOnline && (live?.postureStatus === 1 || live?.postureStatus === 3);
    const isAbsent = isOnline && (live?.postureStatus === 2 || live?.inZone === false);

    return {
      user: u,
      live,
      isOnline,
      isRecent,
      hasAlert,
      isBadPosture,
      isAbsent
    };
  });

  const onlineCount = usersWithTelemetry.filter(item => item.isOnline).length;
  const alertCount = usersWithTelemetry.filter(item => item.hasAlert).length;
  const goodPostureCount = usersWithTelemetry.filter(item => item.isOnline && !item.isBadPosture && !item.isAbsent).length;
  const goodPostureRatio = onlineCount > 0 ? Math.round((goodPostureCount / onlineCount) * 100) : 100;

  // Filter users based on search and status
  const filteredItems = usersWithTelemetry.filter(item => {
    const q = search.toLowerCase();
    const matchQuery = 
      (item.user.fullName || '').toLowerCase().includes(q) ||
      (item.user.email || '').toLowerCase().includes(q) ||
      (item.user.department || '').toLowerCase().includes(q);

    if (!matchQuery) return false;

    if (statusFilter === 'online') return item.isOnline;
    if (statusFilter === 'alerts') return item.hasAlert;
    if (statusFilter === 'bad_posture') return item.isBadPosture;
    if (statusFilter === 'absent') return item.isAbsent;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0 shadow-xs">
              <Shield className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Danh Mục Quản Trị Hệ Thống
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Dành riêng cho Quản trị viên
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Giám sát tập trung toàn bộ tài khoản người dùng, chỉ số sinh trắc học thời gian thực và phân quyền Firestore.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0 flex-wrap">
            <button
              onClick={handleWipeAllTelemetryData}
              disabled={isWiping}
              title="Xóa toàn bộ dữ liệu mẫu / mô phỏng trên Firebase Firestore và đưa về trạng thái chờ sạch sẽ"
              className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Trash2 className={`w-3.5 h-3.5 text-rose-600 ${isWiping ? 'animate-spin' : ''}`} />
              <span>{isWiping ? 'Đang xóa...' : 'Xóa Dữ Liệu Mẫu'}</span>
            </button>

            <button
              onClick={loadUsersData}
              disabled={isLoading}
              className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Đang tải...' : 'Làm mới'}</span>
            </button>

            <button
              onClick={onOpenUserManagementModal}
              className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer active:scale-95"
            >
              <Users className="w-4 h-4" />
              <span>Phân Quyền & Quản Lý User</span>
            </button>
          </div>
        </div>

        {wipeNotice && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{wipeNotice}</span>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs: Live Monitoring vs Supabase Time-Series Query */}
      <div className="flex items-center gap-2 bg-white rounded-2xl p-1.5 shadow-sm border border-slate-200/90 overflow-x-auto">
        <button
          onClick={() => setActiveAdminTab('live')}
          className={`flex items-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
            activeAdminTab === 'live'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Radio className={`w-4 h-4 ${activeAdminTab === 'live' ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
          <span>Giám Sát Trực Tuyến & Phiên Hiện Tại</span>
        </button>

        <button
          onClick={() => {
            setActiveAdminTab('supabase_query');
            if (!supabaseQueryResult) {
              handleRunSupabaseQuery();
            }
          }}
          className={`flex items-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
            activeAdminTab === 'supabase_query'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          <Database className="w-4 h-4 text-emerald-300" />
          <span>Truy Vấn Lịch Sử Supabase SQL</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
            activeAdminTab === 'supabase_query' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
          }`}>
            PostgreSQL
          </span>
        </button>
      </div>

      {/* SUB-TAB 1: LIVE MONITORING */}
      {activeAdminTab === 'live' && (
        <div className="space-y-6">
          {/* 4 Executive KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Card 1: Total accounts */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/90 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Tổng Tài Khoản
                </span>
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                  {totalUsersCount}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">thành viên</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium truncate">
                1 Admin duy nhất • {Math.max(0, totalUsersCount - 1)} Nhân viên
              </p>
            </div>

            {/* Card 2: Online / active accounts */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/90 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Đang Đo / Trực Tuyến
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Radio className="w-4 h-4 animate-pulse" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-700">
                  {onlineCount}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">/{totalUsersCount} trực tuyến</span>
              </div>
              <p className="text-[11px] text-emerald-700 mt-1 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                Đang nhận dữ liệu từ cảm biến / mô phỏng
              </p>
            </div>

            {/* Card 3: Posture Quality */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/90 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Tư Thế Ngồi Chuẩn
                </span>
                <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono text-sky-700">
                  {onlineCount > 0 ? `${goodPostureRatio}%` : '100%'}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">tỷ lệ đạt</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium truncate">
                {goodPostureCount} nhân viên ngồi thẳng chuẩn cột sống
              </p>
            </div>

            {/* Card 4: Health Alerts */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/90 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Cảnh Báo Phát Hiện
                </span>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${alertCount > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
                  <AlertTriangle className={`w-4 h-4 ${alertCount > 0 ? 'animate-bounce' : ''}`} />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl sm:text-3xl font-extrabold font-mono ${alertCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                  {alertCount}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">người cần nhắc</span>
              </div>
              <p className={`text-[11px] mt-1 font-medium truncate ${alertCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                {alertCount > 0 ? 'Cúi gù lâu / Nhịp tim hoặc SpO₂ bất thường' : 'Tất cả nhân viên an toàn ổn định'}
              </p>
            </div>
          </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo tên thành viên, email hoặc phòng ban..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-3.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 shrink-0">
          {[
            { id: 'all', label: `Tất cả (${users.length})` },
            { id: 'online', label: `Trực tuyến (${onlineCount})` },
            { id: 'alerts', label: `Có cảnh báo (${alertCount})` },
            { id: 'bad_posture', label: 'Sai tư thế' },
            { id: 'absent', label: 'Vắng mặt' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* User Telemetry Overview Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredItems.map(({ user, live, isOnline, hasAlert, isBadPosture, isAbsent }) => {
          const isAdmin = isUserAdmin(user);
          const hM = (user.height || 170) / 100;
          const bmiVal = ((user.weight || 65) / (hM * hM)).toFixed(1);

          const bpm = isOnline ? (live?.bpm ?? 0) : 0;
          const spo2 = isOnline ? (live?.spo2 ?? 0) : 0;
          const postureStatus = isOnline ? (live?.postureStatus ?? -1) : -1;
          const postureLabel = isOnline ? (live?.postureLabel || 'Chưa có dữ liệu') : 'Chưa có dữ liệu';
          const isUserSimulating = isOnline ? Boolean(live?.isSimulating || (currentUser && (user.id === currentUser.id || (user.email && currentUser.email && user.email.toLowerCase() === currentUser.email.toLowerCase())) && isSimulating)) : false;

          let postureColor = 'bg-slate-100 text-slate-600 border-slate-200';
          if (postureStatus === 0) postureColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
          else if (postureStatus === 5) postureColor = 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold';
          else if (postureStatus === 1) postureColor = 'bg-rose-50 text-rose-700 border-rose-200';
          else if (postureStatus === 3) postureColor = 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold';
          else if (postureStatus === 2) postureColor = 'bg-amber-50 text-amber-800 border-amber-200';

          return (
            <div
              key={user.id}
              className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm flex flex-col justify-between overflow-hidden ${
                hasAlert 
                  ? 'border-rose-300 ring-2 ring-rose-100' 
                  : isOnline 
                  ? 'border-slate-300 hover:border-indigo-300' 
                  : 'border-slate-200/80 opacity-90'
              }`}
            >
              {/* Card Header: User identity & role badge */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0 overflow-hidden shadow-2xs">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      user.fullName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm truncate">{user.fullName}</span>
                      {isAdmin && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                          Admin
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 block truncate">
                      {user.email}
                    </span>
                  </div>
                </div>

                {/* Status indicator pill */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {isUserSimulating ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      <Sparkles className="w-3 h-3 text-amber-600 animate-spin" />
                      Mô phỏng
                    </span>
                  ) : isOnline ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Trực tuyến
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                      <WifiOff className="w-3 h-3" />
                      Chờ tín hiệu
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 font-medium">
                    {user.department || 'Văn Phòng IoT'}
                  </span>
                </div>
              </div>

              {/* Card Body: Live Telemetry Metrics */}
              <div className="p-4 space-y-3 flex-1">
                {/* 2 Vital Stat Pills: BPM & SpO2 */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* BPM */}
                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Nhịp tim
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className={`text-xl font-extrabold font-mono ${bpm > 0 ? (bpm < 50 || bpm > 110 ? 'text-rose-600' : 'text-slate-900') : 'text-slate-400'}`}>
                          {bpm > 0 ? bpm : '--'}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500">BPM</span>
                      </div>
                    </div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bpm > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-400'}`}>
                      <Heart className={`w-4 h-4 ${bpm > 0 ? 'animate-pulse' : ''}`} />
                    </div>
                  </div>

                  {/* SpO2 */}
                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Oxy SpO₂
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className={`text-xl font-extrabold font-mono ${spo2 > 0 ? (spo2 < 94 ? 'text-rose-600' : 'text-slate-900') : 'text-slate-400'}`}>
                          {spo2 > 0 ? `${spo2}%` : '--'}
                        </span>
                      </div>
                    </div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${spo2 > 0 ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-400'}`}>
                      <Wind className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Posture Status Badge */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-slate-500">Tư thế ngồi:</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {live?.inZone === false ? 'Ngoài vùng camera' : 'Trong vùng camera'}
                    </span>
                  </div>
                  <div className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between ${postureColor}`}>
                    <span className="truncate">{postureLabel}</span>
                    {hasAlert && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                  </div>
                </div>

                {/* Body Specs (Age, BMI) */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 font-mono">
                  <span>Tuổi: <b>{user.age || 28}</b> • BMI: <b>{bmiVal}</b></span>
                  <span>{user.height || 170}cm / {user.weight || 65}kg</span>
                </div>

                {/* Warning message if any */}
                {live?.postureWarning && (
                  <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] leading-tight flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{live.postureWarning}</span>
                  </div>
                )}
              </div>

              {/* Card Footer: Balanced Uniform Actions */}
              <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserForDetail(user)}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8.5 px-2.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-200/90 shadow-2xs transition cursor-pointer active:scale-95"
                  title={`Xem chi tiết sinh trắc học và lịch sử đo của ${user.fullName}`}
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="truncate">Xem Chi Tiết</span>
                </button>

                {onOpenTaskModalWithUser && (
                  <button
                    type="button"
                    onClick={() => onOpenTaskModalWithUser(user)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8.5 px-2.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer active:scale-95"
                    title={`Giao việc cho ${user.fullName}`}
                  >
                    <Send className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate">Giao Việc</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setQueryUserScope(user.id);
                    setActiveAdminTab('supabase_query');
                    handleRunSupabaseQuery(user.id);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8.5 px-2.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition cursor-pointer active:scale-95"
                  title={`Truy vấn lịch sử của ${user.fullName}`}
                >
                  <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">Truy Vấn</span>
                </button>

                {user.id !== currentUser.id && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm(`Bạn có chắc chắn muốn xóa tài khoản "${user.fullName}" (${user.email}) khỏi hệ thống?`)) {
                        await adminDeleteUser(user.id);
                        setUsers(prev => prev.filter(u => u.id !== user.id));
                      }
                    }}
                    className="w-8.5 h-8.5 shrink-0 rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200/90 hover:border-rose-200 flex items-center justify-center transition cursor-pointer active:scale-95"
                    title={`Xóa tài khoản ${user.fullName}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredItems.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 shadow-sm">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">Không tìm thấy tài khoản nào phù hợp bộ lọc.</p>
          <p className="text-xs text-slate-400 mt-1">Hãy thử xóa bộ lọc tìm kiếm hoặc làm mới dữ liệu.</p>
        </div>
      )}
    </div>
  )}

  {/* ========================================================================= */}
  {/* SUB-TAB 2: TRUY VẤN LỊCH SỬ SUPABASE POSTGRESQL CHO TỪNG HOẶC TẤT CẢ USER */}
  {/* ========================================================================= */}
  {activeAdminTab === 'supabase_query' && (
    <div className="space-y-6 animate-fadeIn">
      {/* Query Control Panel Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 shadow-xs">
              <Database className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Trung Tâm Truy Vấn Lịch Sử Supabase SQL
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  PostgreSQL Time-Series
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Truy xuất chính xác theo từng nhân viên hoặc toàn bộ công ty trong khoảng thời gian ngày, tuần, tháng với độ chuẩn xác số học 100%.
              </p>
            </div>
          </div>

          {/* Action Buttons: Run query, Export CSV, Export PDF */}
          <div className="flex items-center gap-2 w-full md:w-auto shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => handleRunSupabaseQuery()}
              disabled={isQueryingSupabase}
              className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isQueryingSupabase ? 'animate-spin' : ''}`} />
              <span>{isQueryingSupabase ? 'Đang truy xuất...' : 'Truy Xuất Dữ Liệu'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportQueryCSV}
              disabled={!supabaseQueryResult || supabaseQueryResult.data.length === 0}
              className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer active:scale-95 disabled:opacity-50"
              title="Xuất dữ liệu kết quả thành file CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Xuất CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportQueryPDF}
              disabled={!supabaseQueryResult || supabaseQueryResult.data.length === 0}
              className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer active:scale-95 disabled:opacity-50"
              title="Xuất báo cáo PDF sức khỏe"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>Báo Cáo PDF</span>
            </button>
          </div>
        </div>

        {/* Scope & Filter Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          {/* Target User Scope Selector */}
          <div className="lg:col-span-7 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>Đối tượng thành viên:</span>
              </label>
              <span className="text-[11px] text-slate-500">
                {queryUserScope === 'all' 
                  ? `Đang chọn: Toàn bộ công ty (${users.length} thành viên)` 
                  : `Đang chọn: ${users.find(u => u.id === queryUserScope)?.fullName || 'Thành viên cụ thể'}`}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                value={queryUserScope}
                onChange={(e) => {
                  const newScope = e.target.value;
                  setQueryUserScope(newScope);
                  handleRunSupabaseQuery(newScope, queryRange);
                }}
                className="flex-1 h-10 px-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-semibold text-xs focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer"
              >
                <option value="all">👥 Tất cả nhân viên (Toàn bộ thành viên công ty)</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    👤 {u.fullName || u.username} ({u.email}) - {u.role === 'admin' ? 'Quản trị viên' : (u.department || 'Nhân viên')}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick User Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => {
                  setQueryUserScope('all');
                  handleRunSupabaseQuery('all', queryRange);
                }}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                  queryUserScope === 'all'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Tất Cả ({users.length})
              </button>
              {users.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setQueryUserScope(u.id);
                    handleRunSupabaseQuery(u.id, queryRange);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition cursor-pointer ${
                    queryUserScope === u.id
                      ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {u.fullName || u.username}
                </button>
              ))}
            </div>
          </div>

          {/* Time Range Filter Buttons */}
          <div className="lg:col-span-5 space-y-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Khoảng thời gian:</span>
            </label>

            <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              {[
                { id: 'day' as TimeRangeFilter, label: '24 giờ qua' },
                { id: 'week' as TimeRangeFilter, label: '7 ngày' },
                { id: 'month' as TimeRangeFilter, label: '30 ngày' },
                { id: 'all' as TimeRangeFilter, label: 'Toàn bộ' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setQueryRange(t.id);
                    handleRunSupabaseQuery(queryUserScope, t.id);
                  }}
                  className={`h-8 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center justify-center ${
                    queryRange === t.id
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 6 Executive KPI Metrics Cards for Supabase Query */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tổng bản ghi</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold font-mono text-slate-900">
              {supabaseQueryResult?.stats.totalRecords ?? 0}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">logs</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Lưu trữ trên PostgreSQL</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tỷ lệ ngồi chuẩn</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold font-mono text-emerald-600">
              {supabaseQueryResult?.stats.goodPostureRatio ?? 0}%
            </span>
          </div>
          <p className="text-[10px] text-emerald-700 mt-1">Thẳng lưng, chuẩn cột sống</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Nhịp tim TB</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold font-mono text-rose-600">
              {(supabaseQueryResult?.stats.avgBpm ?? 0) > 0 ? `${supabaseQueryResult?.stats.avgBpm}` : '--'}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">BPM</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Cảm biến MAX30102</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">SpO2 TB</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold font-mono text-sky-600">
              {(supabaseQueryResult?.stats.avgSpo2 ?? 0) > 0 ? `${supabaseQueryResult?.stats.avgSpo2}` : '--'}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">%</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Nồng độ oxy trong máu</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Sai tư thế / Gù</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-2xl font-extrabold font-mono ${(supabaseQueryResult?.stats.incorrectCount ?? 0) > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {supabaseQueryResult?.stats.incorrectCount ?? 0}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">lần</span>
          </div>
          <p className="text-[10px] text-amber-700 mt-1">Cúi gù hoặc vẹo cổ</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Đứng / Vận động</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold font-mono text-indigo-600">
              {supabaseQueryResult?.stats.standingCount ?? 0}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">lần</span>
          </div>
          <p className="text-[10px] text-indigo-700 mt-1">Giải lao hoặc đi lại</p>
        </div>
      </div>

      {/* Member Comparison Table (Visible when querying ALL users) */}
      {queryUserScope === 'all' && memberGroupStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <span>Bảng Xếp Hạng & So Sánh Tư Thế Các Thành Viên</span>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Thống kê tự động từ cơ sở dữ liệu Supabase theo khoảng thời gian đã chọn
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
              {memberGroupStats.length} thành viên có dữ liệu
            </span>
          </div>

          <div className="border border-slate-200/90 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Thành viên</th>
                  <th className="p-3 text-center">Tổng bản ghi</th>
                  <th className="p-3 text-center">Tỷ lệ đúng</th>
                  <th className="p-3 text-center">Ngồi sai / Gù</th>
                  <th className="p-3 text-center">Nhịp tim TB</th>
                  <th className="p-3 text-center">SpO2 TB</th>
                  <th className="p-3 text-center">Cảnh báo</th>
                  <th className="p-3">Trạng thái gần nhất</th>
                  <th className="p-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {memberGroupStats.map((stat, idx) => {
                  const goodRatio = stat.total > 0 ? Math.round((stat.good / stat.total) * 100) : 0;
                  const avgBpm = stat.countBpm > 0 ? Math.round(stat.sumBpm / stat.countBpm) : 0;
                  const avgSpo2 = stat.countSpo2 > 0 ? Number((stat.sumSpo2 / stat.countSpo2).toFixed(1)) : 0;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{stat.userName}</div>
                        {stat.userEmail && <div className="text-[10px] text-slate-400 font-mono">{stat.userEmail}</div>}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-slate-700">{stat.total}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                          goodRatio >= 80 ? 'bg-emerald-100 text-emerald-800' : goodRatio >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {goodRatio}%
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-amber-700">{stat.bad}</td>
                      <td className="p-3 text-center font-mono text-rose-600 font-bold">{avgBpm > 0 ? `${avgBpm} BPM` : '--'}</td>
                      <td className="p-3 text-center font-mono text-sky-600 font-bold">{avgSpo2 > 0 ? `${avgSpo2}%` : '--'}</td>
                      <td className="p-3 text-center font-mono">
                        {stat.alerts > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            {stat.alerts} lần
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 text-[11px]">
                        <div>{stat.latestPosture || 'Chưa có'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{stat.latestTime}</div>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setQueryUserScope(stat.userId);
                            handleRunSupabaseQuery(stat.userId, queryRange);
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer"
                        >
                          Xem riêng
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Audit Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4">
        {/* Search & Filter within results */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Lọc theo giờ, tư thế, nhịp tim hoặc tên..."
              value={querySearch}
              onChange={(e) => setQuerySearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-emerald-500 focus:bg-white transition"
            />
          </div>

          {/* Status Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 shrink-0">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'good', label: 'Đúng tư thế' },
              { id: 'bad', label: 'Sai tư thế' },
              { id: 'alerts', label: 'Có cảnh báo' },
              { id: 'absent', label: 'Vắng mặt' },
            ].map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setQueryStatusFilter(s.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  queryStatusFilter === s.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Records Table */}
        <div className="border border-slate-200/90 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Mốc thời gian</th>
                <th className="p-3">Thành viên</th>
                <th className="p-3">Tư thế nhận diện</th>
                <th className="p-3 text-center">Nhịp tim</th>
                <th className="p-3 text-center">SpO2</th>
                <th className="p-3 text-center">Cảnh báo</th>
                <th className="p-3 text-right">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredQueryLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">Không tìm thấy bản ghi nào phù hợp.</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isQueryingSupabase ? 'Đang tải dữ liệu từ Supabase...' : 'Hãy bấm "Truy Xuất Dữ Liệu" hoặc chọn khoảng thời gian khác.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredQueryLogs.map((row, idx) => {
                  const isGood = row.postureStatus === 0;
                  const isBad = row.postureStatus === 1 || row.postureStatus === 3;
                  const isStanding = row.postureStatus === 5;
                  const isAbsent = row.postureStatus === 2;

                  return (
                    <tr key={row.id || idx} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono text-[10px] text-slate-400">#{idx + 1}</td>
                      <td className="p-3 font-mono text-slate-700 whitespace-nowrap">
                        <div className="font-bold">{row.timeFormatted}</div>
                        <div className="text-[10px] text-slate-400">{row.dateFormatted}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{row.userName || 'Thành viên'}</div>
                        {row.userEmail && <div className="text-[10px] text-slate-400 font-mono truncate max-w-[160px]">{row.userEmail}</div>}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          isGood 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : isBad
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : isStanding
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : isAbsent
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {row.postureLabel || 'Chưa xác định'}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-rose-600">
                        {row.bpm > 0 ? `${row.bpm} BPM` : '--'}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-sky-600">
                        {row.spo2 > 0 ? `${row.spo2}%` : '--'}
                      </td>
                      <td className="p-3 text-center">
                        {row.hasAlert ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            CẢNH BÁO
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteQueryLog(row.id)}
                          className="p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="Xóa bản ghi này khỏi Supabase"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredQueryLogs.length > 0 && (
          <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 font-mono">
            <span>Hiển thị {filteredQueryLogs.length} / {supabaseQueryResult?.data.length || 0} bản ghi</span>
            <span className="text-[11px] text-slate-400">Độ trễ truy vấn Supabase PostgreSQL: &lt;10ms</span>
          </div>
        )}
      </div>
    </div>
  )}

      {/* Modal: Detailed User Inspection */}
      {selectedUserForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div 
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden text-slate-900"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-300 flex items-center justify-center font-bold text-slate-700 text-sm">
                  {selectedUserForDetail.avatar ? (
                    <img src={selectedUserForDetail.avatar} alt={selectedUserForDetail.fullName} className="w-full h-full object-cover" />
                  ) : (
                    selectedUserForDetail.fullName.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 leading-tight">
                      {selectedUserForDetail.fullName}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      {selectedUserForDetail.department || 'Văn Phòng'}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    {selectedUserForDetail.email}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedUserForDetail(null)}
                className="w-8 h-8 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center px-4 sm:px-5 border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => setDetailActiveTab('metrics')}
                className={`py-2.5 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  detailActiveTab === 'metrics'
                    ? 'border-indigo-600 text-indigo-700 font-bold bg-white'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Chỉ Số Thời Gian Thực</span>
              </button>

              <button
                type="button"
                onClick={() => setDetailActiveTab('history')}
                className={`py-2.5 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  detailActiveTab === 'history'
                    ? 'border-indigo-600 text-indigo-700 font-bold bg-white'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Lịch Sử Nhật Ký Đo ({detailUserLogs.length})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 max-h-[60vh]">
              {detailActiveTab === 'metrics' ? (
                <>
                  {/* Live Metric Cards for this User */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Nhịp tim</span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-extrabold font-mono text-slate-900">
                          {detailTelemetry?.bpm ?? telemetryMap[selectedUserForDetail.id]?.bpm ?? 0}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500">BPM</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Oxy máu</span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-extrabold font-mono text-slate-900">
                          {detailTelemetry?.spo2 ?? telemetryMap[selectedUserForDetail.id]?.spo2 ?? 0}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500">%</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Góc nghiêng cổ</span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-extrabold font-mono text-slate-900">
                          {detailTelemetry?.angleNeck ?? telemetryMap[selectedUserForDetail.id]?.angleNeck ?? 155}°
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Vùng quan sát</span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className={`text-xs font-bold ${detailTelemetry?.inZone !== false ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {detailTelemetry?.inZone !== false ? 'Trong vùng' : 'Ngoài vùng'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Current Posture Details */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Trạng Thái Tư Thế Hiện Tại:</span>
                      <span className="text-xs font-mono text-slate-400">
                        Nguồn: {detailTelemetry?.source || telemetryMap[selectedUserForDetail.id]?.source || 'Cảm biến Raspberry Pi 4'}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-white border border-slate-200 font-bold text-sm text-slate-900 flex items-center justify-between">
                      <span>{detailTelemetry?.postureLabel || telemetryMap[selectedUserForDetail.id]?.postureLabel || 'Chưa có dữ liệu'}</span>
                      {detailTelemetry?.postureStatus === 0 ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : detailTelemetry?.postureStatus === 1 || detailTelemetry?.postureStatus === 3 ? (
                        <AlertTriangle className="w-5 h-5 text-rose-600" />
                      ) : null}
                    </div>
                    {detailTelemetry?.postureWarning && (
                      <p className="text-xs text-rose-700 font-medium">
                        ⚠️ {detailTelemetry.postureWarning}
                      </p>
                    )}
                  </div>

                  {/* User Health Profile */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <span className="text-xs font-bold text-slate-700 block">Thông Tin Hồ Sơ Cá Nhân:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Tuổi</span>
                        <span className="font-bold text-slate-800">{selectedUserForDetail.age || 28} tuổi</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Giới tính</span>
                        <span className="font-bold text-slate-800">{selectedUserForDetail.gender === 'female' ? 'Nữ' : 'Nam'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Thể trạng</span>
                        <span className="font-bold text-slate-800">{selectedUserForDetail.height || 170}cm / {selectedUserForDetail.weight || 65}kg</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Ngồi tối đa</span>
                        <span className="font-bold text-slate-800">{selectedUserForDetail.maxSittingHours || 6} tiếng/ngày</span>
                      </div>
                    </div>
                    {selectedUserForDetail.healthNotes && (
                      <p className="text-xs text-slate-600 mt-2 bg-white p-2.5 rounded-lg border border-slate-200">
                        <b>Ghi chú y tế:</b> {selectedUserForDetail.healthNotes}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                /* History Logs Tab for this specific user */
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setDetailHistoryFilter('all')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          detailHistoryFilter === 'all'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Tất cả ({detailUserLogs.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailHistoryFilter('bad_posture')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          detailHistoryFilter === 'bad_posture'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Sai tư thế ({detailUserLogs.filter(l => l.postureStatus === 1 || l.postureStatus === 3).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailHistoryFilter('alerts')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          detailHistoryFilter === 'alerts'
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Có cảnh báo ({detailUserLogs.filter(l => !!l.hasAlert || !!l.alertType).length})
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsLoadingDetailLogs(true);
                        fetchSupabaseHistory('all', selectedUserForDetail.id, selectedUserForDetail.email)
                          .then(res => {
                            if (res && res.data) setDetailUserLogs(res.data as any);
                          })
                          .finally(() => setIsLoadingDetailLogs(false));
                      }}
                      disabled={isLoadingDetailLogs}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingDetailLogs ? 'animate-spin' : ''}`} />
                      <span>{isLoadingDetailLogs ? 'Đang tải...' : 'Làm mới'}</span>
                    </button>
                  </div>

                  {/* History Logs Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    <div className="max-h-[300px] overflow-y-auto">
                      <table className="w-full text-[11px] text-left">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="p-2.5">Thời gian</th>
                            <th className="p-2.5 text-center">BPM</th>
                            <th className="p-2.5 text-center">SpO₂</th>
                            <th className="p-2.5">Tư thế</th>
                            <th className="p-2.5 text-center">Cảnh báo</th>
                            <th className="p-2.5 text-center">Vùng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detailUserLogs.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-slate-400">
                                {isLoadingDetailLogs ? 'Đang tải lịch sử...' : 'Chưa có bản ghi lịch sử đo đạc nào cho tài khoản này.'}
                              </td>
                            </tr>
                          ) : (
                            detailUserLogs
                              .filter(log => {
                                if (detailHistoryFilter === 'bad_posture') {
                                  return log.postureStatus === 1 || log.postureStatus === 3;
                                }
                                if (detailHistoryFilter === 'alerts') {
                                  return !!log.hasAlert || !!log.alertType;
                                }
                                return true;
                              })
                              .slice(0, 50)
                              .map((item, idx) => (
                                <tr key={item.id || idx} className="hover:bg-slate-50 transition">
                                  <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                                    <span className="font-bold text-slate-900">{item.timeFormatted || '--:--'}</span>
                                    <span className="text-[10px] text-slate-400 block">{item.dateFormatted || ''}</span>
                                  </td>
                                  <td className="p-2.5 font-mono text-center font-bold text-rose-600">
                                    {item.bpm || 0}
                                  </td>
                                  <td className="p-2.5 font-mono text-center font-bold text-sky-600">
                                    {item.spo2 ? `${item.spo2}%` : '--'}
                                  </td>
                                  <td className="p-2.5">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold inline-block ${
                                      item.postureStatus === 0 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : item.postureStatus === 1 || item.postureStatus === 3
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                                    }`}>
                                      {item.postureLabel || 'Bình thường'}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-center">
                                    {item.hasAlert || item.alertType ? (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                        {item.alertType || 'Cảnh báo'}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300">-</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-center">
                                    <span className={`text-[10px] font-semibold ${item.inZone !== false ? 'text-emerald-700' : 'text-amber-700'}`}>
                                      {item.inZone !== false ? 'Trong' : 'Ngoài'}
                                    </span>
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedUserForDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer transition"
              >
                Đóng
              </button>

              <div className="flex items-center gap-2">
                {onViewUserHistory && (
                  <button
                    type="button"
                    onClick={() => {
                      onViewUserHistory(selectedUserForDetail);
                      setSelectedUserForDetail(null);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs transition cursor-pointer active:scale-95"
                    title={`Mở toàn bộ nhật ký lịch sử của ${selectedUserForDetail.fullName}`}
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Xem Trong Nhật Ký Hệ Thống</span>
                  </button>
                )}

                {onOpenTaskModalWithUser && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenTaskModalWithUser(selectedUserForDetail);
                      setSelectedUserForDetail(null);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Giao Nhiệm Vụ Cho User</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
