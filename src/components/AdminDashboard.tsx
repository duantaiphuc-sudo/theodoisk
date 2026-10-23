import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  RefreshCw, 
  Eye, 
  Send, 
  Clock, 
  WifiOff, 
  Radio, 
  Trash2, 
  Database, 
  Calendar, 
  Download, 
  FileText, 
  BarChart3, 
  X,
  BellRing,
  Camera,
  Maximize2
} from 'lucide-react';
import { fetchAllUsers, isUserAdmin, adminDeleteUser, adminAssignDevice } from '../services/authService';
import { 
  subscribeToAllUsersTelemetry, 
  subscribeToUserTelemetry,
  subscribeToUsers,
  clearAllTelemetryDataFromFirebase 
} from '../services/firebase';
import { fetchFaceTemplate } from '../services/faceService';
import { fetchSupabaseHistory, TimeRangeFilter, deleteSingleLogFromSupabase } from '../services/supabaseService';
import { exportHealthReportToPDF } from '../services/pdfExportService';
import { AdminQueryCharts } from './AdminQueryCharts';

export interface RealtimeMetricsProps {
  bpm: number;
  spo2: number;
  isOnline?: boolean;
  postureStatus?: number;
  postureLabel?: string;
  inZone?: boolean;
  angleNeck?: number;
  compact?: boolean;
  hasAlert?: boolean;
}

export const RealtimeMetrics: React.FC<RealtimeMetricsProps> = React.memo(({
  bpm,
  spo2,
  isOnline = false,
  postureStatus = -1,
  postureLabel = 'Chưa có dữ liệu',
  inZone = true,
  angleNeck,
  compact = false,
  hasAlert = false
}) => {
  const displayBpm = isOnline && bpm > 0 ? bpm : 0;
  const displaySpo2 = isOnline && spo2 > 0 ? spo2 : 0;

  const isBpmAbnormal = displayBpm > 0 && (displayBpm < 50 || displayBpm > 110);
  const isSpo2Abnormal = displaySpo2 > 0 && displaySpo2 < 94;

  let postureBadgeStyle = 'bg-slate-100 text-slate-600 border-slate-200';
  if (isOnline) {
    if (postureStatus === 0) postureBadgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    else if (postureStatus === 5) postureBadgeStyle = 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold';
    else if (postureStatus === 1) postureBadgeStyle = 'bg-rose-50 text-rose-700 border-rose-200';
    else if (postureStatus === 3) postureBadgeStyle = 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold';
    else if (postureStatus === 2) postureBadgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
  }

  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block whitespace-nowrap">
              Nhịp tim
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`text-xl font-extrabold font-mono ${displayBpm > 0 ? (isBpmAbnormal ? 'text-rose-600' : 'text-slate-900') : 'text-slate-400'}`}>
                {displayBpm > 0 ? displayBpm : '--'}
              </span>
              <span className="text-[10px] font-semibold text-slate-500">BPM</span>
            </div>
          </div>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${displayBpm > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-400'}`}>
            <Heart className={`w-4 h-4 ${displayBpm > 0 ? 'animate-pulse' : ''}`} />
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block whitespace-nowrap">
              Oxy SpO₂
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`text-xl font-extrabold font-mono ${displaySpo2 > 0 ? (isSpo2Abnormal ? 'text-rose-600' : 'text-slate-900') : 'text-slate-400'}`}>
                {displaySpo2 > 0 ? `${displaySpo2}%` : '--'}
              </span>
            </div>
          </div>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${displaySpo2 > 0 ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-400'}`}>
            <Wind className="w-4 h-4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <motion.div 
          whileHover={{ y: -2 }}
          className="p-3 bg-slate-50 rounded-xl border border-slate-200"
        >
          <span className="text-[10px] font-bold text-slate-400 uppercase block whitespace-nowrap">Nhịp tim</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-2xl font-extrabold font-mono ${displayBpm > 0 ? (isBpmAbnormal ? 'text-rose-600' : 'text-slate-900') : 'text-slate-400'}`}>
              {displayBpm > 0 ? displayBpm : '--'}
            </span>
            <span className="text-[10px] font-semibold text-slate-500">BPM</span>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          className="p-3 bg-slate-50 rounded-xl border border-slate-200"
        >
          <span className="text-[10px] font-bold text-slate-400 uppercase block whitespace-nowrap">Oxy máu</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-2xl font-extrabold font-mono ${displaySpo2 > 0 ? (isSpo2Abnormal ? 'text-rose-600' : 'text-slate-900') : 'text-slate-400'}`}>
              {displaySpo2 > 0 ? `${displaySpo2}%` : '--'}
            </span>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          className="p-3 bg-slate-50 rounded-xl border border-slate-200"
        >
          <span className="text-[10px] font-bold text-slate-400 uppercase block whitespace-nowrap">Góc nghiêng cổ</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold font-mono text-slate-900">
              {angleNeck !== undefined ? `${angleNeck}°` : '155°'}
            </span>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          className="p-3 bg-slate-50 rounded-xl border border-slate-200"
        >
          <span className="text-[10px] font-bold text-slate-400 uppercase block whitespace-nowrap">Vùng quan sát</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-xs font-bold ${inZone ? 'text-emerald-700' : 'text-amber-700'}`}>
              {inZone ? 'Trong vùng' : 'Ngoài vùng'}
            </span>
          </div>
        </motion.div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[11px] font-semibold text-slate-500">Tư thế ngồi:</span>
          <span className="text-[10px] font-mono text-slate-400">
            {inZone ? 'Trong vùng camera' : 'Ngoài vùng camera'}
          </span>
        </div>
        <div className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between ${postureBadgeStyle}`}>
          <span className="truncate">{postureLabel}</span>
          {hasAlert && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
        </div>
      </div>
    </div>
  );
});

export interface AlertData {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  message: string;
  type: 'posture' | 'biometric' | 'zone';
  timestamp?: string;
  severity: 'critical' | 'warning';
}

export interface AlertPanelProps {
  alerts: AlertData[];
  onDismissAlert?: (id: string) => void;
  onSelectUserAlert?: (userId: string) => void;
}

export const AlertPanel: React.FC<AlertPanelProps> = React.memo(({
  alerts,
  onDismissAlert,
  onSelectUserAlert
}) => {
  if (alerts.length === 0) {
    return (
      <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
              Hệ Thống Ổn Định
            </h4>
            <p className="text-xs text-emerald-700 mt-0.5">
              Tất cả nhân viên đang duy trì tư thế đạt chuẩn và chỉ số nhịp tim, SpO₂ an toàn.
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold font-mono bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
          0 Cảnh báo
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-rose-200 shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-rose-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <BellRing className="w-4 h-4 text-rose-600 animate-bounce" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Bảng Điều Khiển Cảnh Báo Sức Khỏe & Tư Thế
            </h4>
            <p className="text-xs text-slate-500">
              Phát hiện các tình trạng cần can thiệp hoặc nhắc nhở ngay trong phiên làm việc
            </p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-full text-xs font-extrabold font-mono bg-rose-100 text-rose-800 border border-rose-200 whitespace-nowrap">
          {alerts.length} Sự cố hoạt động
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <AnimatePresence>
          {alerts.map(alert => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 transition ${
                alert.severity === 'critical'
                  ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                  : 'bg-amber-50/70 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs truncate text-slate-900">
                      {alert.userName}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                      alert.severity === 'critical'
                        ? 'bg-rose-200 text-rose-800'
                        : 'bg-amber-200 text-amber-800'
                    }`}>
                      {alert.type === 'biometric' ? 'Sinh trắc' : alert.type === 'zone' ? 'Khu vực' : 'Tư thế'}
                    </span>
                  </div>
                  {alert.userEmail && (
                    <span className="text-[10px] text-slate-500 font-mono block truncate mt-0.5">
                      {alert.userEmail}
                    </span>
                  )}
                </div>

                {onDismissAlert && (
                  <button
                    type="button"
                    onClick={() => onDismissAlert(alert.id)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/80 transition cursor-pointer"
                    title="Bỏ qua cảnh báo này"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-start gap-2 text-xs">
                <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                  alert.severity === 'critical' ? 'text-rose-600' : 'text-amber-600'
                }`} />
                <p className="font-medium leading-snug line-clamp-2">
                  {alert.message}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-mono text-[10px]">
                  {alert.timestamp || 'Vừa xảy ra'}
                </span>
                {onSelectUserAlert && (
                  <button
                    type="button"
                    onClick={() => onSelectUserAlert(alert.userId)}
                    className="font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                  >
                    Kiểm tra ngay →
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
});

export interface EmployeeListItem {
  user: AuthUser;
  live?: HealthTelemetry;
  isOnline: boolean;
  isRecent: boolean;
  hasAlert: boolean;
  isBadPosture: boolean;
}

export interface EmployeeListProps {
  items: EmployeeListItem[];
  currentUser: AuthUser;
  isSimulating?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: 'all' | 'online' | 'offline' | 'alerts' | 'bad_posture';
  onStatusFilterChange: (filter: 'all' | 'online' | 'offline' | 'alerts' | 'bad_posture') => void;
  totalUsersCount: number;
  onlineCount: number;
  offlineCount: number;
  alertCount: number;
  badPostureCount: number;
  onSelectUserForDetail: (user: AuthUser) => void;
  onOpenTaskModalWithUser?: (user: AuthUser) => void;
  onQueryUserHistory: (userId: string) => void;
  onDeleteUser: (user: AuthUser) => void;
  onAssignDevice?: (userId: string, device: string) => void;
}

export const EmployeeList: React.FC<EmployeeListProps> = React.memo(({
  items,
  currentUser,
  isSimulating,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  totalUsersCount,
  onlineCount,
  offlineCount,
  alertCount,
  badPostureCount,
  onSelectUserForDetail,
  onOpenTaskModalWithUser,
  onQueryUserHistory,
  onDeleteUser,
  onAssignDevice
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo tên thành viên, email hoặc phòng ban..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full h-10 pl-10 pr-3.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 shrink-0">
          {[
            { id: 'all', label: `Tất cả (${totalUsersCount})` },
            { id: 'online', label: `Trực tuyến (${onlineCount})` },
            { id: 'offline', label: `Ngoại tuyến (${offlineCount})` },
            { id: 'alerts', label: `Có cảnh báo (${alertCount})` },
            { id: 'bad_posture', label: `Sai tư thế (${badPostureCount})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => onStatusFilterChange(tab.id as any)}
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {items.map(({ user, live, isOnline, hasAlert }) => {
            const isAdmin = isUserAdmin(user);
            const hM = (user.height || 170) / 100;
            const bmiVal = ((user.weight || 65) / (hM * hM)).toFixed(1);

            const bpm = isOnline ? (live?.bpm ?? user.bpm ?? 0) : 0;
            const spo2 = isOnline ? (live?.spo2 ?? user.spo2 ?? 0) : 0;
            const postureStatus = isOnline ? (live?.postureStatus ?? (user.currentPosture === 'correct' ? 0 : user.currentPosture === 'standing' ? 5 : user.currentPosture === 'incorrect' ? 1 : -1)) : -1;
            const postureLabel = isOnline ? (live?.postureLabel || user.currentPostureText || 'Chưa có dữ liệu') : 'Chưa có dữ liệu';
            const isUserSimulating = isOnline ? Boolean(live?.isSimulating || (currentUser && (user.id === currentUser.id || (user.email && currentUser.email && user.email.toLowerCase() === currentUser.email.toLowerCase())) && isSimulating)) : false;

            return (
              <motion.div
                key={`${user.id}_${user.email}`}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm flex flex-col justify-between overflow-hidden ${
                  hasAlert 
                    ? 'border-rose-300 ring-2 ring-rose-100' 
                    : isOnline 
                    ? 'border-slate-300 hover:border-indigo-300' 
                    : 'border-slate-200/80 opacity-90'
                }`}
              >
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

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {isUserSimulating ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        Mô phỏng
                      </span>
                    ) : isOnline ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Trực tuyến
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                        <WifiOff className="w-3 h-3 text-slate-400" />
                        Ngoại tuyến
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                      {user.department || 'Văn Phòng IoT'}
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-3 flex-1">
                  <RealtimeMetrics
                    bpm={bpm}
                    spo2={spo2}
                    isOnline={isOnline}
                    postureStatus={postureStatus}
                    postureLabel={postureLabel}
                    inZone={live?.inZone !== false}
                    angleNeck={live?.angleNeck}
                    compact={true}
                    hasAlert={hasAlert}
                  />

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-semibold text-slate-500">Tư thế ngồi:</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {live?.inZone === false ? 'Ngoài vùng camera' : 'Trong vùng camera'}
                      </span>
                    </div>
                    <div className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between ${
                      postureStatus === 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      postureStatus === 5 ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold' :
                      postureStatus === 1 ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      postureStatus === 3 ? 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold' :
                      postureStatus === 2 ? 'bg-amber-50 text-amber-800 border-amber-200' :
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      <span className="truncate">{postureLabel}</span>
                      {hasAlert && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 font-mono">
                    <span>Tuổi: <b>{user.age || 28}</b> • BMI: <b>{bmiVal}</b></span>
                    <span>{user.height || 170}cm / {user.weight || 65}kg</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                    <span className="text-slate-500 font-medium flex items-center gap-1">
                      <Radio className="w-3 h-3 text-indigo-600" />
                      <span>Thiết bị:</span>
                    </span>
                    <select
                      value={user.device || ''}
                      onChange={(e) => onAssignDevice && onAssignDevice(user.id, e.target.value)}
                      className={`h-7 px-2 py-0.5 rounded text-[11px] font-mono font-bold border transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                        user.device
                          ? 'bg-indigo-50 text-indigo-900 border-indigo-300 shadow-2xs'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}
                      title={`Chọn gán thiết bị cho ${user.fullName}`}
                    >
                      <option value="">Trống (Chưa gán)</option>
                      <option value="pi4_node_1">pi4_node_1</option>
                      <option value="pi4_node_2">pi4_node_2</option>
                    </select>
                  </div>

                  {live?.postureWarning && (
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] leading-tight flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{live.postureWarning}</span>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectUserForDetail(user)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8.5 px-2.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-200/90 shadow-2xs transition cursor-pointer active:scale-95 whitespace-nowrap"
                    title={`Xem chi tiết sinh trắc học và lịch sử đo của ${user.fullName}`}
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate">Chi Tiết</span>
                  </button>

                  {/* Chỉ hiển thị Giao Việc cho tài khoản Nhân viên, không hiển thị trên thẻ Admin hoặc chính mình */}
                  {onOpenTaskModalWithUser && !isUserAdmin(user) && user.id !== currentUser.id && (
                    <button
                      type="button"
                      onClick={() => onOpenTaskModalWithUser(user)}
                      className="flex-1 flex items-center justify-center gap-1.5 h-8.5 px-2.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer active:scale-95 whitespace-nowrap"
                      title={`Giao việc cho ${user.fullName}`}
                    >
                      <Send className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="truncate">Giao Việc</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onQueryUserHistory(user.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8.5 px-2.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition cursor-pointer active:scale-95 whitespace-nowrap"
                    title={`Truy vấn lịch sử của ${user.fullName}`}
                  >
                    <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">Truy Vấn</span>
                  </button>

                  {((user.id !== currentUser.id && user.email.toLowerCase() !== currentUser.email.toLowerCase()) || (user.fullName !== currentUser.fullName)) && (
                    <button
                      type="button"
                      onClick={() => onDeleteUser(user)}
                      className="w-8.5 h-8.5 shrink-0 rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200/90 hover:border-rose-200 flex items-center justify-center transition cursor-pointer active:scale-95"
                      title={`Xóa tài khoản ${user.fullName}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {items.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 shadow-sm">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">Không tìm thấy tài khoản nào phù hợp bộ lọc.</p>
          <p className="text-xs text-slate-400 mt-1">Hãy thử xóa bộ lọc tìm kiếm hoặc làm mới dữ liệu.</p>
        </div>
      )}
    </div>
  );
});

export interface AdminDashboardProps {
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'alerts' | 'bad_posture'>('all');
  const [selectedUserForDetail, setSelectedUserForDetail] = useState<AuthUser | null>(null);
  const [detailTelemetry, setDetailTelemetry] = useState<HealthTelemetry | null>(null);
  const [detailUserLogs, setDetailUserLogs] = useState<TelemetryHistoryItem[]>([]);
  const [isLoadingDetailLogs, setIsLoadingDetailLogs] = useState(false);
  const [detailActiveTab, setDetailActiveTab] = useState<'metrics' | 'history'>('metrics');
  const [detailHistoryFilter, setDetailHistoryFilter] = useState<'all' | 'bad_posture' | 'alerts'>('all');
  const [detailFaceImage, setDetailFaceImage] = useState<string | null>(null);
  const [hasDetailFaceTemplate, setHasDetailFaceTemplate] = useState<boolean | null>(null);
  const [isDetailImageZoomed, setIsDetailImageZoomed] = useState(false);

  const [activeAdminTab, setActiveAdminTab] = useState<'live' | 'supabase_query'>('live');

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
  const [queryStatusFilter, setQueryStatusFilter] = useState<'all' | 'good' | 'bad' | 'alerts'>('all');

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

  const handleRunSupabaseQuery = useCallback(async (targetUser?: string, range?: TimeRangeFilter) => {
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
  }, [queryUserScope, queryRange, users]);

  const handleDeleteQueryLog = useCallback(async (logId: string) => {
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
  }, [supabaseQueryResult]);

  const handleExportQueryCSV = useCallback(() => {
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
  }, [supabaseQueryResult, queryUserScope]);

  const handleExportQueryPDF = useCallback(() => {
    if (!supabaseQueryResult || supabaseQueryResult.data.length === 0) return;
    const targetUser = users.find(u => u.id === queryUserScope);
    exportHealthReportToPDF({
      currentUser: targetUser || currentUser,
      historyLogs: supabaseQueryResult.data,
    });
  }, [supabaseQueryResult, users, queryUserScope, currentUser]);

  const loadUsersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAllUsers();
      setUsers(data);
    } catch (e) {
      console.warn('Lỗi tải danh sách người dùng:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleWipeAllTelemetryData = useCallback(async () => {
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
  }, [onWipeAllData, firebaseConfig, loadUsersData]);

  useEffect(() => {
    loadUsersData();
  }, [loadUsersData]);

  // Lắng nghe thay đổi thời gian thực của danh sách người dùng (Presence, Thiết bị, v.v.)
  useEffect(() => {
    const unsub = subscribeToUsers(firebaseConfig, (liveUsers) => {
      if (liveUsers && liveUsers.length > 0) {
        setUsers(liveUsers);
      }
    });
    return () => unsub();
  }, [firebaseConfig]);

  useEffect(() => {
    const unsub = subscribeToAllUsersTelemetry(firebaseConfig, (map) => {
      setTelemetryMap(map as any);
    });
    return () => unsub();
  }, [firebaseConfig]);

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

  useEffect(() => {
    if (!selectedUserForDetail) {
      setDetailFaceImage(null);
      setHasDetailFaceTemplate(null);
      return;
    }
    fetchFaceTemplate(selectedUserForDetail.id).then(tmpl => {
      const hasValidTemplate = Boolean(
        tmpl && 
        tmpl.enabled && 
        ((Array.isArray(tmpl.embedding) && tmpl.embedding.length === 128) || Boolean(tmpl.image || tmpl.snapshot))
      );
      if (hasValidTemplate && tmpl) {
        setHasDetailFaceTemplate(true);
        const img = tmpl.image || tmpl.snapshot;
        if (img && typeof img === 'string') {
          const formatted = img.startsWith('data:image') || img.startsWith('http') ? img : `data:image/jpeg;base64,${img}`;
          setDetailFaceImage(formatted);
        } else {
          setDetailFaceImage(null);
        }
      } else {
        setHasDetailFaceTemplate(false);
        setDetailFaceImage(null);
      }
    }).catch(() => {
      setHasDetailFaceTemplate(false);
      setDetailFaceImage(null);
    });
  }, [selectedUserForDetail]);

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

  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const totalUsersCount = users.length;

  const usersWithTelemetry: EmployeeListItem[] = useMemo(() => {
    const HEARTBEAT_TIMEOUT_MS = 60 * 1000; // 60 giây (1 phút): phát hiện offline nhanh chóng khi người dùng đóng tab / rời web
 
    return users.map(u => {
      const isCurrentActiveUser = currentUser && (
        u.id === currentUser.id ||
        (u.email && currentUser.email && u.email.toLowerCase().trim() === currentUser.email.toLowerCase().trim())
      );

      const remoteLive = telemetryMap[u.id] || (u.email ? telemetryMap[u.email.toLowerCase().trim()] : undefined);
      const live = (isCurrentActiveUser && currentTelemetry) ? currentTelemetry : remoteLive;

      let telemetryTime = 0;
      if (u.lastActive) {
        const t = new Date(u.lastActive).getTime();
        if (!isNaN(t)) telemetryTime = Math.max(telemetryTime, t);
      }
      if (live?.timestamp) {
        const t = new Date(live.timestamp).getTime();
        if (!isNaN(t)) telemetryTime = Math.max(telemetryTime, t);
      }
      if (live?.updatedAt) {
        const t = new Date(live.updatedAt).getTime();
        if (!isNaN(t)) telemetryTime = Math.max(telemetryTime, t);
      }

      const isHeartbeatValid = telemetryTime > 0 && (currentTime - telemetryTime) <= HEARTBEAT_TIMEOUT_MS;

      const hasValidMetrics = Boolean(
        live && (
          (Number(live.bpm) > 0 || Number(live.spo2) > 0) ||
          (live.postureStatus !== undefined && live.postureStatus >= 0)
        )
      );

      const isSimulatingActive = Boolean(
        live?.isSimulating || (isCurrentActiveUser && isSimulating)
      );

      let isOnline = false;
      if (isSimulatingActive || isCurrentActiveUser) {
        isOnline = true;
      } else if (u.isOnline && isHeartbeatValid) {
        isOnline = true;
      }

      const isRecent = isHeartbeatValid;
      const hasAlert = isOnline && Boolean(live?.hasAlert || (live && (live.postureStatus === 1 || live.postureStatus === 3)));
      const isBadPosture = isOnline && (live?.postureStatus === 1 || live?.postureStatus === 3);

      return {
        user: u,
        live,
        isOnline,
        isRecent,
        hasAlert,
        isBadPosture
      };
    });
  }, [users, currentUser, telemetryMap, currentTelemetry, currentTime, isSimulating]);

  const onlineCount = useMemo(() => usersWithTelemetry.filter(item => item.isOnline).length, [usersWithTelemetry]);
  const offlineCount = useMemo(() => usersWithTelemetry.filter(item => !item.isOnline).length, [usersWithTelemetry]);
  const alertCount = useMemo(() => usersWithTelemetry.filter(item => item.hasAlert).length, [usersWithTelemetry]);
  const badPostureCount = useMemo(() => usersWithTelemetry.filter(item => item.isBadPosture).length, [usersWithTelemetry]);
  const goodPostureCount = useMemo(() => usersWithTelemetry.filter(item => item.isOnline && !item.isBadPosture).length, [usersWithTelemetry]);
  const goodPostureRatio = onlineCount > 0 ? Math.round((goodPostureCount / onlineCount) * 100) : 100;

  const activeAlerts: AlertData[] = useMemo(() => {
    const list: AlertData[] = [];
    usersWithTelemetry.forEach(item => {
      if (item.hasAlert && item.live) {
        let message = item.live.postureWarning || item.live.postureLabel || 'Phát hiện tư thế ngồi sai chuẩn';
        let type: 'posture' | 'biometric' | 'zone' = 'posture';
        let severity: 'critical' | 'warning' = 'warning';

        if (item.live.bpm && (item.live.bpm < 50 || item.live.bpm > 110)) {
          message = `Nhịp tim bất thường: ${item.live.bpm} BPM`;
          type = 'biometric';
          severity = 'critical';
        } else if (item.live.spo2 && item.live.spo2 < 94) {
          message = `Nồng độ oxy SpO₂ suy giảm: ${item.live.spo2}%`;
          type = 'biometric';
          severity = 'critical';
        } else if (item.live.inZone === false) {
          message = 'Người dùng rời khỏi vùng camera theo dõi';
          type = 'zone';
        }

        list.push({
          id: `alert-${item.user.id}-${item.live.timestamp || Date.now()}`,
          userId: item.user.id,
          userName: item.user.fullName,
          userEmail: item.user.email,
          message,
          type,
          timestamp: item.live.timestamp ? new Date(item.live.timestamp).toLocaleTimeString() : undefined,
          severity
        });
      }
    });
    return list;
  }, [usersWithTelemetry]);

  const filteredItems = useMemo(() => {
    return usersWithTelemetry.filter(item => {
      const q = search.toLowerCase();
      const matchQuery = 
        (item.user.fullName || '').toLowerCase().includes(q) ||
        (item.user.email || '').toLowerCase().includes(q) ||
        (item.user.department || '').toLowerCase().includes(q);

      if (!matchQuery) return false;

      if (statusFilter === 'online') return item.isOnline;
      if (statusFilter === 'offline') return !item.isOnline;
      if (statusFilter === 'alerts') return item.hasAlert;
      if (statusFilter === 'bad_posture') return item.isBadPosture;
      return true;
    });
  }, [usersWithTelemetry, search, statusFilter]);

  const handleDeleteUser = useCallback(async (userToDelete: AuthUser) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa tài khoản "${userToDelete.fullName}" (${userToDelete.email}) khỏi hệ thống?`)) {
      await adminDeleteUser(userToDelete.id);
      setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
    }
  }, []);

  const handleAssignDeviceQuick = useCallback(async (userId: string, newDevice: string) => {
    const cleanDevice = newDevice.trim();
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, device: cleanDevice, deviceId: cleanDevice } : u));
    try {
      await adminAssignDevice(userId, cleanDevice);
    } catch (e) {
      console.error('Lỗi khi gán thiết bị:', e);
    }
  }, []);

  const handleQueryUserHistory = useCallback((userId: string) => {
    setQueryUserScope(userId);
    setActiveAdminTab('supabase_query');
    handleRunSupabaseQuery(userId);
  }, [handleRunSupabaseQuery]);

  return (
    <div className="space-y-6">
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
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap">
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
              className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer active:scale-95 disabled:opacity-50 whitespace-nowrap"
            >
              <Trash2 className={`w-3.5 h-3.5 text-rose-600 ${isWiping ? 'animate-spin' : ''}`} />
              <span>{isWiping ? 'Đang xóa...' : 'Xóa Dữ Liệu Mẫu'}</span>
            </button>

            <button
              onClick={loadUsersData}
              disabled={isLoading}
              className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer active:scale-95 disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Đang tải...' : 'Làm mới'}</span>
            </button>

            <button
              onClick={onOpenUserManagementModal}
              className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer active:scale-95 whitespace-nowrap"
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
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase whitespace-nowrap ${
            activeAdminTab === 'supabase_query' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
          }`}>
            PostgreSQL
          </span>
        </button>
      </div>

      {activeAdminTab === 'live' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/90 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
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
                <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">thành viên</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium truncate">
                1 Admin duy nhất • {Math.max(0, totalUsersCount - 1)} Nhân viên
              </p>
            </div>

            <div className="bg-slate-50/80 rounded-xl border border-slate-200/90 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
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
                <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">/{totalUsersCount} trực tuyến</span>
              </div>
              <p className="text-[11px] text-emerald-700 mt-1 font-medium flex items-center gap-1 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping shrink-0"></span>
                Đang nhận dữ liệu từ cảm biến / mô phỏng
              </p>
            </div>

            <div className="bg-slate-50/80 rounded-xl border border-slate-200/90 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
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
                <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">tỷ lệ đạt</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium truncate">
                {goodPostureCount} nhân viên ngồi thẳng chuẩn cột sống
              </p>
            </div>

            <div className="bg-slate-50/80 rounded-xl border border-slate-200/90 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
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
                <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">người cần nhắc</span>
              </div>
              <p className={`text-[11px] mt-1 font-medium truncate ${alertCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                {alertCount > 0 ? 'Cúi gù lâu / Nhịp tim hoặc SpO₂ bất thường' : 'Tất cả nhân viên an toàn ổn định'}
              </p>
            </div>
          </div>

          <AlertPanel
            alerts={activeAlerts}
            onSelectUserAlert={(targetId) => {
              const u = users.find(x => x.id === targetId);
              if (u) setSelectedUserForDetail(u);
            }}
          />

          <EmployeeList
            items={filteredItems}
            currentUser={currentUser}
            isSimulating={isSimulating}
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            totalUsersCount={totalUsersCount}
            onlineCount={onlineCount}
            offlineCount={offlineCount}
            alertCount={alertCount}
            badPostureCount={badPostureCount}
            onSelectUserForDetail={setSelectedUserForDetail}
            onOpenTaskModalWithUser={onOpenTaskModalWithUser}
            onQueryUserHistory={handleQueryUserHistory}
            onDeleteUser={handleDeleteUser}
            onAssignDevice={handleAssignDeviceQuick}
          />
        </div>
      )}

      {activeAdminTab === 'supabase_query' && (
        <div className="space-y-6 animate-fadeIn">
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
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                      PostgreSQL Time-Series
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Truy xuất chính xác theo từng nhân viên hoặc toàn bộ công ty trong khoảng thời gian ngày, tuần, tháng với độ chuẩn xác số học 100%.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleRunSupabaseQuery()}
                  disabled={isQueryingSupabase}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer active:scale-95 disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isQueryingSupabase ? 'animate-spin' : ''}`} />
                  <span>{isQueryingSupabase ? 'Đang truy xuất...' : 'Truy Xuất Dữ Liệu'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportQueryCSV}
                  disabled={!supabaseQueryResult || supabaseQueryResult.data.length === 0}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer active:scale-95 disabled:opacity-50 whitespace-nowrap"
                  title="Xuất dữ liệu kết quả thành file CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>Xuất CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportQueryPDF}
                  disabled={!supabaseQueryResult || supabaseQueryResult.data.length === 0}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer active:scale-95 disabled:opacity-50 whitespace-nowrap"
                  title="Xuất báo cáo PDF sức khỏe"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Báo Cáo PDF</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
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
                      className={`h-8 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center justify-center whitespace-nowrap ${
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

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block whitespace-nowrap">Tổng bản ghi</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-extrabold font-mono text-slate-900">
                  {supabaseQueryResult?.stats.totalRecords ?? 0}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">logs</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Lưu trữ trên PostgreSQL</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block whitespace-nowrap">Tỷ lệ ngồi chuẩn</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-extrabold font-mono text-emerald-600">
                  {supabaseQueryResult?.stats.goodPostureRatio ?? 0}%
                </span>
              </div>
              <p className="text-[10px] text-emerald-700 mt-1">Thẳng lưng, chuẩn cột sống</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block whitespace-nowrap">Nhịp tim TB</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-extrabold font-mono text-rose-600">
                  {(supabaseQueryResult?.stats.avgBpm ?? 0) > 0 ? `${supabaseQueryResult?.stats.avgBpm}` : '--'}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">BPM</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Cảm biến MAX30102</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block whitespace-nowrap">SpO2 TB</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-extrabold font-mono text-sky-600">
                  {(supabaseQueryResult?.stats.avgSpo2 ?? 0) > 0 ? `${supabaseQueryResult?.stats.avgSpo2}` : '--'}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">%</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Nồng độ oxy trong máu</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block whitespace-nowrap">Sai tư thế / Gù</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-2xl font-extrabold font-mono ${(supabaseQueryResult?.stats.incorrectCount ?? 0) > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                  {supabaseQueryResult?.stats.incorrectCount ?? 0}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">lần</span>
              </div>
              <p className="text-[10px] text-amber-700 mt-1">Cúi gù hoặc vẹo cổ</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block whitespace-nowrap">Đứng / Vận động</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-extrabold font-mono text-indigo-600">
                  {supabaseQueryResult?.stats.standingCount ?? 0}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">lần</span>
              </div>
              <p className="text-[10px] text-indigo-700 mt-1">Giải lao hoặc đi lại</p>
            </div>
          </div>

          {/* Biểu đồ phân tích trực quan Supabase Time-Series & Phân Bố Tư Thế */}
          {supabaseQueryResult && (
            <AdminQueryCharts
              data={supabaseQueryResult.data}
              stats={supabaseQueryResult.stats}
              queryUserScope={queryUserScope}
              queryRange={queryRange}
              users={users}
              memberStats={memberGroupStats}
              onSelectMember={(uid) => {
                setQueryUserScope(uid);
                handleRunSupabaseQuery(uid, queryRange);
              }}
            />
          )}

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
                <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 whitespace-nowrap">
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
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer whitespace-nowrap"
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

          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4">
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

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 shrink-0">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'good', label: 'Đúng tư thế' },
                  { id: 'bad', label: 'Sai tư thế' },
                  { id: 'alerts', label: 'Có cảnh báo' },
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
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                              isGood 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : isBad
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : isStanding
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
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
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 whitespace-nowrap">
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

      {selectedUserForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div 
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden text-slate-900"
            onClick={e => e.stopPropagation()}
          >
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
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
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

            <div className="flex items-center px-4 sm:px-5 border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => setDetailActiveTab('metrics')}
                className={`py-2.5 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  detailActiveTab === 'metrics'
                    ? 'border-indigo-600 text-indigo-700 font-bold bg-white'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Chỉ Số Thời Gian Thực</span>
              </button>

              {/* Nếu là Admin thì không hiển thị tab Lịch Sử Nhật Ký Đo */}
              {!isUserAdmin(selectedUserForDetail) && (
                <button
                  type="button"
                  onClick={() => setDetailActiveTab('history')}
                  className={`py-2.5 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    detailActiveTab === 'history'
                      ? 'border-indigo-600 text-indigo-700 font-bold bg-white'
                      : 'border-transparent hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Lịch Sử Nhật Ký Đo ({detailUserLogs.length})</span>
                </button>
              )}
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 max-h-[60vh]">
              {detailActiveTab === 'metrics' ? (
                <>
                  <RealtimeMetrics
                    bpm={detailTelemetry?.bpm ?? telemetryMap[selectedUserForDetail.id]?.bpm ?? 0}
                    spo2={detailTelemetry?.spo2 ?? telemetryMap[selectedUserForDetail.id]?.spo2 ?? 0}
                    isOnline={true}
                    postureStatus={detailTelemetry?.postureStatus ?? telemetryMap[selectedUserForDetail.id]?.postureStatus ?? -1}
                    postureLabel={detailTelemetry?.postureLabel || telemetryMap[selectedUserForDetail.id]?.postureLabel || 'Chưa có dữ liệu'}
                    inZone={detailTelemetry?.inZone !== false && telemetryMap[selectedUserForDetail.id]?.inZone !== false}
                    angleNeck={detailTelemetry?.angleNeck ?? telemetryMap[selectedUserForDetail.id]?.angleNeck ?? 155}
                    compact={false}
                    hasAlert={Boolean(detailTelemetry?.hasAlert || (detailTelemetry && (detailTelemetry.postureStatus === 1 || detailTelemetry.postureStatus === 3)))}
                  />

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <span className="text-xs font-bold text-slate-700 block">Thông Tin Hồ Sơ Cá Nhân:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase whitespace-nowrap">Tuổi</span>
                        <span className="font-bold text-slate-800">{selectedUserForDetail.age || 28} tuổi</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase whitespace-nowrap">Giới tính</span>
                        <span className="font-bold text-slate-800">{selectedUserForDetail.gender === 'female' ? 'Nữ' : 'Nam'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase whitespace-nowrap">Thể trạng</span>
                        <span className="font-bold text-slate-800">{selectedUserForDetail.height || 170}cm / {selectedUserForDetail.weight || 65}kg</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase whitespace-nowrap">Ngồi tối đa</span>
                        <span className="font-bold text-slate-800">{selectedUserForDetail.maxSittingHours || 6} tiếng/ngày</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase whitespace-nowrap">Thiết bị</span>
                        <span className="font-bold text-indigo-700 font-mono">{selectedUserForDetail.device || 'Trống'}</span>
                      </div>
                    </div>
                    {selectedUserForDetail.healthNotes && (
                      <p className="text-xs text-slate-600 mt-2 bg-white p-2.5 rounded-lg border border-slate-200">
                        <b>Ghi chú y tế:</b> {selectedUserForDetail.healthNotes}
                      </p>
                    )}
                  </div>

                  {/* Face Template Dossier (Admin Visibility) */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-sky-600" />
                        <span>Mẫu Khuôn Mặt Xác Thực SFace (YuNet):</span>
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        hasDetailFaceTemplate 
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        {hasDetailFaceTemplate ? '✓ Đã có mẫu trên hệ thống' : 'Chưa đăng ký mẫu'}
                      </span>
                    </div>

                    {detailFaceImage ? (
                      <div className="flex items-center gap-3 pt-1">
                        <div 
                          onClick={() => setIsDetailImageZoomed(true)}
                          className="w-16 h-16 rounded-xl overflow-hidden border border-sky-400 bg-slate-900 shadow-xs shrink-0 cursor-pointer group relative"
                          title="Bấm để phóng to ảnh khuôn mặt"
                        >
                          <img src={detailFaceImage} alt="Ảnh khuôn mặt thành viên" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Maximize2 className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="text-xs text-slate-600 space-y-0.5">
                          <p className="font-semibold text-slate-800">Ảnh trích xuất từ Camera Raspberry Pi 4</p>
                          <p className="text-[11px] text-slate-500 font-mono">Chuẩn: YuNet Detector + SFace 128D Embedding</p>
                          <button
                            type="button"
                            onClick={() => setIsDetailImageZoomed(true)}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Phóng to ảnh chất lượng cao</span>
                          </button>
                        </div>
                      </div>
                    ) : hasDetailFaceTemplate ? (
                      <p className="text-xs text-emerald-800 bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200">
                        Đã ghi nhận vector 128 chiều SFace trên trạm Pi 4 (chưa lưu kèm ảnh xem trước).
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        Thành viên này chưa đăng ký mẫu khuôn mặt qua camera trạm Pi 4.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setDetailHistoryFilter('all')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
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
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
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
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
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
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDetailLogs ? 'animate-spin' : ''}`} />
                      <span>{isLoadingDetailLogs ? 'Đang tải...' : 'Làm mới'}</span>
                    </button>
                  </div>

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
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold inline-block whitespace-nowrap ${
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
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                                        {item.alertType || 'Cảnh báo'}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300">-</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-center">
                                    <span className={`text-[10px] font-semibold whitespace-nowrap ${item.inZone !== false ? 'text-emerald-700' : 'text-amber-700'}`}>
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

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedUserForDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer transition whitespace-nowrap"
              >
                Đóng
              </button>

              <div className="flex items-center gap-2">
                {/* Chỉ hiển thị Giao Việc khi tài khoản được xem không phải là Admin */}
                {onOpenTaskModalWithUser && !isUserAdmin(selectedUserForDetail) && selectedUserForDetail.id !== currentUser.id && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenTaskModalWithUser(selectedUserForDetail);
                      setSelectedUserForDetail(null);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer active:scale-95 whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Giao Nhiệm Vụ Cho Thành Viên</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Phóng To Ảnh Khuôn Mặt Thành Viên (Dành Cho Admin) */}
      {isDetailImageZoomed && detailFaceImage && selectedUserForDetail && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-scaleUp">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs sm:text-sm font-bold tracking-tight">
                  Ảnh khuôn mặt: {selectedUserForDetail.fullName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailImageZoomed(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex flex-col items-center">
              <div className="w-full max-h-[380px] rounded-xl overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center shadow-inner">
                <img 
                  src={detailFaceImage} 
                  alt={selectedUserForDetail.fullName} 
                  className="max-h-[380px] w-auto object-contain"
                />
              </div>

              <div className="w-full mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Thành viên:</span>
                  <span className="font-semibold text-slate-900">{selectedUserForDetail.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mã UID:</span>
                  <span className="font-mono text-indigo-700 text-[11px] truncate max-w-[200px]">{selectedUserForDetail.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Trạm gán:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedUserForDetail.device || 'Chưa gán'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mô hình:</span>
                  <span className="font-mono text-emerald-700">YuNet Detector + SFace 128D</span>
                </div>
              </div>

              <div className="w-full mt-3 flex items-center justify-end gap-2">
                <a
                  href={detailFaceImage}
                  download={`khuon-mat-${selectedUserForDetail.fullName}.jpg`}
                  className="px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải ảnh về máy</span>
                </a>
                <button
                  type="button"
                  onClick={() => setIsDetailImageZoomed(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 transition cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
