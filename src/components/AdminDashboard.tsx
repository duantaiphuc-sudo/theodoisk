import React, { useState, useEffect } from 'react';
import { 
  AuthUser, 
  FirebaseConnectionConfig, 
  UserTelemetryLive,
  HealthTelemetry,
  TelemetryLog 
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
  Trash2
} from 'lucide-react';
import { fetchAllUsers, isUserAdmin, saveCurrentUser } from '../services/authService';
import { 
  subscribeToAllUsersTelemetry, 
  subscribeToUserTelemetry,
  clearUserTelemetryFromFirebase,
  clearAllTelemetryDataFromFirebase 
} from '../services/firebase';

interface AdminDashboardProps {
  currentUser: AuthUser;
  firebaseConfig: FirebaseConnectionConfig;
  onOpenUserManagementModal: () => void;
  onOpenTaskModalWithUser?: (user: AuthUser) => void;
  onSwitchUser?: (user: AuthUser) => void;
  onWipeAllData?: () => Promise<void>;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  firebaseConfig,
  onOpenUserManagementModal,
  onOpenTaskModalWithUser,
  onSwitchUser,
  onWipeAllData
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

  // Compute live overview metrics
  const now = Date.now();
  const totalUsersCount = users.length;

  const usersWithTelemetry = users.map(u => {
    const live = telemetryMap[u.id];
    let isOnline = false;
    let isRecent = false;
    if (live && live.timestamp) {
      const packetAge = Math.floor((now - new Date(live.timestamp).getTime()) / 1000);
      isRecent = !isNaN(packetAge) && packetAge < 60;
      isOnline = isRecent && (Boolean(live.isSimulating) || (Boolean(live.trackingActive) && Number(live.bpm) > 0));
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

        {/* 4 Executive KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
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
          const isSimulating = isOnline ? Boolean(live?.isSimulating) : false;

          let postureColor = 'bg-slate-100 text-slate-600 border-slate-200';
          if (postureStatus === 0) postureColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
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
                  {isSimulating ? (
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

              {/* Card Footer: Quick Actions */}
              <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserForDetail(user)}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-200/90 shadow-2xs transition cursor-pointer active:scale-95"
                  title="Xem chi tiết các chỉ số sinh trắc học và lịch sử của tài khoản này"
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Xem Chi Tiết</span>
                </button>

                {onOpenTaskModalWithUser && (
                  <button
                    type="button"
                    onClick={() => onOpenTaskModalWithUser(user)}
                    className="flex items-center justify-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer active:scale-95"
                    title={`Giao nhiệm vụ hoặc gửi nhắc nhở sức khỏe cho ${user.fullName}`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Giao việc</span>
                  </button>
                )}

                {onSwitchUser && (
                  <button
                    type="button"
                    onClick={() => {
                      saveCurrentUser(user);
                      onSwitchUser(user);
                    }}
                    className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/90 flex items-center justify-center transition cursor-pointer"
                    title={`Đăng nhập thử tài khoản của ${user.fullName}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
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
                    {isUserAdmin(selectedUserForDetail) ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                        Admin Duy Nhất
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        Nhân viên
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    {selectedUserForDetail.email} • {selectedUserForDetail.department || 'Văn Phòng IoT'}
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

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
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
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedUserForDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Đóng
              </button>

              <div className="flex items-center gap-2">
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
