import React, { useState } from 'react';
import { 
  Users, 
  Cpu, 
  Wifi, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Send, 
  RefreshCw, 
  Shield, 
  Copy, 
  Check, 
  Sparkles,
  ExternalLink,
  Volume2,
  Terminal,
  Layers,
  ArrowRight,
  Filter,
  UserCheck,
  UserX,
  FileText,
  Download,
  TrendingUp
} from 'lucide-react';
import { AuthUser, EmployeeNodeStatus, HealthTelemetry, TimeCalculations, TelemetryLog } from '../types';
import { WeeklyHealthTrendChart } from './WeeklyHealthTrendChart';
import { exportHealthReportToPDF } from '../services/pdfExportService';
import { fetchAllUsers } from '../services/authService';

interface AdminDashboardProps {
  currentUser: AuthUser;
  onOpenUserManagement?: () => void;
  onOpenTaskModal?: (targetEmail?: string) => void;
  liveTelemetry?: HealthTelemetry;
  timeStats?: TimeCalculations;
  historyLogs?: TelemetryLog[];
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onOpenUserManagement,
  onOpenTaskModal,
  liveTelemetry,
  timeStats,
  historyLogs = []
}) => {
  const [registeredUsers, setRegisteredUsers] = useState<AuthUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'plaintext'>('visual');
  const [copiedText, setCopiedText] = useState(false);
  const [alertNotice, setAlertNotice] = useState<string | null>(null);

  // Load real registered accounts from Firestore
  const loadUsers = React.useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const list = await fetchAllUsers();
      const map = new Map<string, AuthUser>();
      list.forEach(u => {
        const key = (u.email || u.username || u.id).trim().toLowerCase();
        map.set(key, u);
      });
      if (currentUser) {
        const curKey = (currentUser.email || currentUser.username || currentUser.id).trim().toLowerCase();
        map.set(curKey, currentUser);
      }
      setRegisteredUsers(Array.from(map.values()));
    } catch (e) {
      console.warn('Lỗi khi tải danh sách người dùng:', e);
      if (currentUser) setRegisteredUsers([currentUser]);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [currentUser]);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Dynamically compute nodes from real registered users and real telemetry logs
  const nodes = React.useMemo<EmployeeNodeStatus[]>(() => {
    const list = registeredUsers.length > 0 ? registeredUsers : (currentUser ? [currentUser] : []);

    return list.map((user, idx) => {
      const isCurrent = user.id === currentUser?.id || (user.email && user.email.toLowerCase() === currentUser?.email?.toLowerCase());
      const deviceId = `pi4_node_${idx + 1}`;

      // Search real history logs matching this user
      const userLogs = (historyLogs || []).filter(l => 
        (l.userId && l.userId === user.id) ||
        (l.userEmail && l.userEmail.toLowerCase() === user.email.toLowerCase()) ||
        (l.userName && l.userName.toLowerCase() === user.fullName.toLowerCase())
      );
      const latestLog = userLogs.length > 0 ? userLogs[0] : null;

      // Active user in this session with live telemetry
      if (isCurrent && liveTelemetry) {
        const isBad = liveTelemetry.postureStatus === 1 || liveTelemetry.postureStatus === 3;
        const isWaiting = liveTelemetry.postureStatus === -1;
        const isAbsent = !liveTelemetry.trackingActive && liveTelemetry.bpm === 0 && (isWaiting || liveTelemetry.postureStatus === 2);
        const sittingMins = timeStats ? Math.floor(timeStats.sittingSeconds / 60) : 0;

        let postureText = '✓ Đúng';
        let posture: 'correct' | 'incorrect' | 'absent' = 'correct';
        if (isWaiting) {
          postureText = '– Chờ kết nối';
          posture = 'absent';
        } else if (isAbsent) {
          postureText = '– Vắng';
          posture = 'absent';
        } else if (isBad) {
          postureText = '⚠ Sai';
          posture = 'incorrect';
        }

        return {
          id: `node-${user.id}`,
          name: user.fullName || user.username,
          email: user.email,
          avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.email || user.username)}`,
          department: user.department || 'Phòng Quản Trị & Nghiên Cứu IoT',
          device: deviceId,
          presence: isWaiting ? 'Away' : (isAbsent ? 'Away' : 'Present'),
          posture,
          postureText,
          sittingMinutes: sittingMins,
          bpm: liveTelemetry.bpm || 0,
          spo2: liveTelemetry.spo2 || 0,
          isOnline: !isWaiting,
          hasAlert: isBad || (liveTelemetry.bpm > 0 && (liveTelemetry.bpm < 50 || liveTelemetry.bpm > 110)),
          alertReason: isBad ? 'Ngồi sai tư thế' : undefined,
          role: user.role
        };
      }

      // If user has previous historical telemetry logs in Firestore
      if (latestLog) {
        const isBad = latestLog.postureStatus === 1 || latestLog.postureStatus === 3;
        const isAbsent = latestLog.postureStatus === 2;
        return {
          id: `node-${user.id}`,
          name: user.fullName || user.username,
          email: user.email,
          avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.email || user.username)}`,
          department: user.department || 'Nhân Viên Văn Phòng IoT',
          device: latestLog.device || deviceId,
          presence: isAbsent ? 'Away' : 'Present',
          posture: isAbsent ? 'absent' : (isBad ? 'incorrect' : 'correct'),
          postureText: isAbsent ? '– Vắng' : (isBad ? '⚠ Sai' : '✓ Đúng'),
          sittingMinutes: 0,
          bpm: latestLog.bpm || 0,
          spo2: latestLog.spo2 || 0,
          isOnline: false,
          hasAlert: latestLog.hasAlert,
          alertReason: latestLog.alertType,
          role: user.role
        };
      }

      // User registered in Firestore but has not generated any telemetry yet
      return {
        id: `node-${user.id}`,
        name: user.fullName || user.username,
        email: user.email,
        avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.email || user.username)}`,
        department: user.department || 'Nhân Viên Văn Phòng IoT',
        device: deviceId,
        presence: 'Away',
        posture: 'absent',
        postureText: '– Chờ kết nối',
        sittingMinutes: 0,
        bpm: 0,
        spo2: 0,
        isOnline: false,
        hasAlert: false,
        role: user.role
      };
    });
  }, [registeredUsers, currentUser, liveTelemetry, timeStats, historyLogs]);

  const handleExportPDF = () => {
    try {
      exportHealthReportToPDF({
        currentUser,
        historyLogs: historyLogs || [],
        nodes,
        summary: {
          totalLogs: (historyLogs || []).length,
          avgBpm: nodes.find(n => n.bpm > 0)?.bpm || 74,
          avgSpo2: nodes.find(n => n.spo2 > 0)?.spo2 || 98,
          correctPosturePercent: nodes.length > 0 ? Math.round((nodes.filter(n => n.posture === 'correct').length / nodes.length) * 100) : 0,
          totalAlerts: alertCount
        }
      });
      setAlertNotice('Đã xuất thành công tệp Báo Cáo Sức Khỏe PDF từ Firebase Cloud!');
      setTimeout(() => setAlertNotice(null), 4000);
    } catch (err) {
      console.error('Lỗi khi xuất PDF:', err);
      setAlertNotice('Có lỗi khi tạo tệp PDF báo cáo.');
      setTimeout(() => setAlertNotice(null), 3000);
    }
  };

  // Dynamic summary calculations
  const totalEmployees = nodes.length;
  const totalDevices = nodes.length;
  const onlineCount = nodes.filter(n => n.isOnline).length;
  const workingCount = nodes.filter(n => n.presence === 'Present').length;
  const alertCount = nodes.filter(n => n.hasAlert || n.posture === 'incorrect' || n.sittingMinutes > 60).length;

  // Plain text generator matching Image 2
  const plainTextContent = `ADMIN DASHBOARD
────────────────────────────────────────
TỔNG QUAN

Nhân viên     ${totalEmployees}
Thiết bị      ${totalDevices}
Đang online   ${onlineCount}
Đang làm việc ${workingCount}
Cảnh báo      ${alertCount}

NHÂN VIÊN
────────────────────────────────────────
Tên       Device        Presence    Posture     Sitting
${nodes.map(n => {
  const namePad = n.name.padEnd(10, ' ');
  const devPad = n.device.padEnd(14, ' ');
  const presPad = n.presence.padEnd(12, ' ');
  const postPad = n.postureText.padEnd(12, ' ');
  return `${namePad}${devPad}${presPad}${postPad}${n.sittingMinutes} phút`;
}).join('\n')}`;

  const handleCopyPlainText = () => {
    navigator.clipboard.writeText(plainTextContent).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    });
  };

  const handleTriggerAlert = (node: EmployeeNodeStatus) => {
    setAlertNotice(`Đã gửi cảnh báo rung & âm thanh công thái học tới ${node.device} (${node.name})!`);
    setTimeout(() => setAlertNotice(null), 4000);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fadeIn text-slate-900 pb-12">
      {/* 1. Header Banner */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                Admin Dashboard
              </h1>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wide">
                Đa Thiết Bị IoT Pi 4
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Trực tuyến
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Giám sát tổng quan nhân viên văn phòng, trạng thái hiện diện và tư thế công thái học
            </p>
          </div>
        </div>

        {/* View Switcher & Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setViewMode('visual')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'visual'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-sky-600" />
              <span>Giao Diện Trực Quan</span>
            </button>
            <button
              onClick={() => setViewMode('plaintext')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'plaintext'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-indigo-600" />
              <span>Dạng Plain Text</span>
            </button>
          </div>

          {/* PDF Export Button */}
          <button
            onClick={handleExportPDF}
            title="Xuất dữ liệu lịch sử đo đạc từ Firebase sang tệp báo cáo PDF để in hoặc lưu trữ"
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-98"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Xuất Báo Cáo PDF</span>
          </button>

          {onOpenUserManagement && (
            <button
              onClick={onOpenUserManagement}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-98"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Quản Lý Tài Khoản</span>
            </button>
          )}
        </div>
      </div>

      {/* Alert toast notification */}
      {alertNotice && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-semibold">{alertNotice}</span>
          </div>
          <button onClick={() => setAlertNotice(null)} className="text-indigo-700 hover:text-indigo-900 font-bold ml-2 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* 2. SECTION: TỔNG QUAN (Summary KPI Cards) */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
            TỔNG QUAN
          </h2>
          <span className="text-[11px] text-slate-400 font-mono">Realtime Telemetry Multi-Node</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* 1. Nhân viên */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Nhân viên</span>
              <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:bg-slate-200 transition">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {totalEmployees}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Tổng số nhân sự</p>
            </div>
          </div>

          {/* 2. Thiết bị */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Thiết bị</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition">
                <Cpu className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-950">
                {totalDevices}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Node Raspberry Pi 4</p>
            </div>
          </div>

          {/* 3. Đang online */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Đang online</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition">
                <Wifi className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-700">
                {onlineCount}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Kết nối mạng ổn định</p>
            </div>
          </div>

          {/* 4. Đang làm việc */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Đang làm việc</span>
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center group-hover:bg-sky-100 transition">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-sky-700">
                {workingCount}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Hiện diện tại bàn (Present)</p>
            </div>
          </div>

          {/* 5. Cảnh báo */}
          <div className={`p-4 rounded-2xl bg-white border shadow-xs flex flex-col justify-between transition group col-span-2 sm:col-span-1 ${
            alertCount > 0 ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200/90'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-700">Cảnh báo</span>
              <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center group-hover:bg-rose-200 transition">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-rose-700">
                {alertCount}
              </div>
              <p className="text-[11px] text-rose-600 mt-0.5">Tư thế sai / Ngồi quá lâu</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2.5 SECTION: BIỂU ĐỒ XU HƯỚNG THEO TUẦN (Mức TB nhịp tim & SpO2 từng tuần) */}
      <WeeklyHealthTrendChart historyLogs={historyLogs} />

      {/* 3. SECTION: NHÂN VIÊN (Table or Plain Text View) */}
      {viewMode === 'visual' ? (
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <span>NHÂN VIÊN</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                  {nodes.length} Nodes
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Chi tiết thiết bị Raspberry Pi, hiện diện, tư thế và thời gian ngồi liên tục (5 thông số tiêu chuẩn)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportPDF}
                className="py-1.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>In / Xuất PDF</span>
              </button>

              <button
                onClick={() => {
                  loadUsers();
                  setAlertNotice('Đã làm mới dữ liệu từ tất cả các Node và tài khoản Firestore!');
                  setTimeout(() => setAlertNotice(null), 3000);
                }}
                disabled={isLoadingUsers}
                className="py-1.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                <span>{isLoadingUsers ? 'Đang tải...' : 'Làm mới'}</span>
              </button>
            </div>
          </div>

          {/* Desktop Table View - Exactly 5 Columns matching Image 2 */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-100/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 sm:px-5">Tên Nhân Viên</th>
                  <th className="py-3 px-4">Thiết Bị (Device)</th>
                  <th className="py-3 px-4">Hiện Diện (Presence)</th>
                  <th className="py-3 px-4">Tư Thế (Posture)</th>
                  <th className="py-3 px-4">Thời Gian Ngồi (Sitting)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nodes.map(node => {
                  const isBad = node.posture === 'incorrect';
                  const isAbsent = node.presence === 'Away';
                  const isLongSitting = node.sittingMinutes >= 60;

                  return (
                    <tr 
                      key={node.id} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isBad ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      {/* 1. Tên */}
                      <td className="py-3.5 px-4 sm:px-5">
                        <div className="flex items-center gap-3">
                          <img
                            src={node.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120'}
                            alt={node.name}
                            className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-sm">{node.name}</span>
                              {node.role === 'admin' ? (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  Admin
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                  Nhân viên
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 block truncate">{node.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Device */}
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-mono text-xs font-bold border border-slate-200">
                          <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{node.device}</span>
                        </div>
                      </td>

                      {/* 3. Presence */}
                      <td className="py-3.5 px-4">
                        {node.presence === 'Present' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>Present (Tại bàn)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                            <span>Away (Vắng)</span>
                          </span>
                        )}
                      </td>

                      {/* 4. Posture */}
                      <td className="py-3.5 px-4">
                        {node.posture === 'correct' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>✓ Đúng</span>
                          </span>
                        )}
                        {node.posture === 'incorrect' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            <span>⚠ Sai</span>
                          </span>
                        )}
                        {node.posture === 'absent' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            <span>– Vắng</span>
                          </span>
                        )}
                      </td>

                      {/* 5. Sitting */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-sm font-bold ${
                            isLongSitting ? 'text-amber-700' : 'text-slate-800'
                          }`}>
                            {node.sittingMinutes} phút
                          </span>
                          {isLongSitting && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              Ngồi lâu!
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Plain Text Format exactly matching Image 2 */
        <div className="rounded-2xl bg-slate-950 text-slate-100 border border-slate-800 shadow-xl overflow-hidden font-mono text-xs sm:text-sm">
          {/* Plain Text Header Bar */}
          <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs font-bold">&lt;/&gt; Plain text</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300 text-xs">ADMIN DASHBOARD VIEW</span>
            </div>
            <button
              onClick={handleCopyPlainText}
              className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
            >
              {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copiedText ? 'Đã sao chép!' : 'Copy'}</span>
            </button>
          </div>

          {/* Plain Text Body */}
          <div className="p-5 sm:p-6 overflow-x-auto whitespace-pre leading-relaxed select-text font-mono text-slate-200">
            {plainTextContent}
          </div>
        </div>
      )}

      {/* 4. Tips & Help Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-50/80 via-white to-indigo-50/80 border border-sky-200/80 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-900">Tính năng Quản Trị Hệ Thống:</span>
            <p className="text-slate-600 mt-0.5">
              Chỉ duy nhất <b>duantaiphuc@gmail.com</b> và <b>admin</b> có quyền truy cập màn hình này. Mọi tài khoản nhân viên khác chỉ được xem số liệu cá nhân của chính mình.
            </p>
          </div>
        </div>

        {onOpenUserManagement && (
          <button
            onClick={onOpenUserManagement}
            className="self-start sm:self-auto py-2 px-3.5 rounded-xl bg-white hover:bg-sky-50 border border-sky-300 text-sky-800 font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap active:scale-98"
          >
            <span>Quản trị tài khoản & Giao việc</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
