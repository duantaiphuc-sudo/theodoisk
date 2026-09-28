import React, { useState, useMemo } from 'react';
import { 
  Download, 
  Search, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Cloud, 
  BookmarkPlus, 
  Trash2, 
  Calendar, 
  Clock, 
  Filter, 
  Sparkles,
  Database,
  FileText,
  UserCheck
} from 'lucide-react';
import { TelemetryLog, AuthUser } from '../types';
import { exportHealthReportToPDF } from '../services/pdfExportService';
import { getCurrentUser } from '../services/authService';

interface HistoryLogsProps {
  history: TelemetryLog[];
  currentUser?: AuthUser | null;
  onClearHistory?: () => void;
  onDeleteSingleLog?: (id: string) => void;
  onRefreshHistory?: () => void;
  onSaveSnapshot?: () => void;
  isSyncing?: boolean;
  firebaseHistoryCollection?: string;
  isManager: boolean;
}

export const HistoryLogs: React.FC<HistoryLogsProps> = ({ 
  history, 
  currentUser,
  onClearHistory, 
  onDeleteSingleLog,
  onRefreshHistory,
  onSaveSnapshot,
  isSyncing = false,
  firebaseHistoryCollection = 'theodoisk_history',
  isManager 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPosture, setFilterPosture] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Distinct accounts found in history
  const distinctAccounts = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string; count: number }>();
    
    if (currentUser) {
      map.set(currentUser.id, {
        id: currentUser.id,
        name: currentUser.fullName || currentUser.username,
        email: currentUser.email,
        count: 0
      });
    }

    history.forEach(item => {
      const accId = item.userId || item.userEmail || 'unknown';
      let accName = item.userName || item.userEmail || 'Người dùng';
      if (currentUser && (accId === currentUser.id || item.userEmail?.toLowerCase() === currentUser.email?.toLowerCase())) {
        accName = currentUser.fullName || currentUser.username;
      }
      const accEmail = item.userEmail || '';

      if (!map.has(accId)) {
        map.set(accId, { id: accId, name: accName, email: accEmail, count: 0 });
      }
      map.get(accId)!.count++;
    });

    return Array.from(map.values());
  }, [history, currentUser]);

  // Account filter:
  // For employees: strictly locked to their own account records!
  // For admin/manager: defaults to their own account, can switch between employees or view all
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>(() => {
    return currentUser ? currentUser.id : 'all';
  });

  // Base history filtered by user account isolation
  const userFilteredHistory = useMemo(() => {
    // If not a manager, STRICTLY only allow currentUser's records
    if (!isManager && currentUser) {
      return history.filter(item => 
        !item.userId || item.userId === currentUser.id || 
        (item.userEmail && currentUser.email && item.userEmail.toLowerCase() === currentUser.email.toLowerCase())
      );
    }

    // If manager, check selectedAccountFilter
    if (selectedAccountFilter === 'all') {
      return history;
    }

    return history.filter(item => {
      const matchId = item.userId === selectedAccountFilter;
      const matchEmail = item.userEmail && item.userEmail.toLowerCase() === selectedAccountFilter.toLowerCase();
      const matchCurrent = currentUser && selectedAccountFilter === currentUser.id && 
        (item.userId === currentUser.id || (item.userEmail && item.userEmail.toLowerCase() === currentUser.email.toLowerCase()));
      return matchId || matchEmail || matchCurrent;
    });
  }, [history, selectedAccountFilter, isManager, currentUser]);

  // Extract unique available dates from user-filtered logs
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    userFilteredHistory.forEach(item => {
      if (item.dateFormatted) {
        dates.add(item.dateFormatted);
      } else if (item.timestamp) {
        try {
          const d = new Date(item.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
          dates.add(d);
        } catch {}
      }
    });
    return Array.from(dates);
  }, [userFilteredHistory]);

  const filteredLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return userFilteredHistory.filter(item => {
      const dateStr = item.dateFormatted || '';
      const timeStr = item.timeFormatted || '';
      const dateTimeStr = item.dateTimeFormatted || `${dateStr} ${timeStr}`;

      const matchesSearch =
        !term ||
        dateStr.toLowerCase().includes(term) ||
        timeStr.toLowerCase().includes(term) ||
        dateTimeStr.toLowerCase().includes(term) ||
        item.postureLabel.toLowerCase().includes(term) ||
        (item.userName && item.userName.toLowerCase().includes(term)) ||
        (item.userEmail && item.userEmail.toLowerCase().includes(term)) ||
        String(item.bpm).includes(term) ||
        String(item.spo2).includes(term);

      if (!matchesSearch) return false;

      if (filterDate !== 'all' && dateStr !== filterDate) {
        return false;
      }

      if (filterPosture === 'all') return true;
      if (filterPosture === 'good') return item.postureStatus === 0;
      if (filterPosture === 'bad') return item.postureStatus === 1 || item.postureStatus === 3;
      if (filterPosture === 'absent') return item.postureStatus === 2;
      return true;
    });
  }, [userFilteredHistory, searchTerm, filterPosture, filterDate]);

  const handleExportCSV = () => {
    if (userFilteredHistory.length === 0) return;

    const headers = ['Mã bản ghi', 'Tài khoản', 'Ngày ghi', 'Giờ ghi', 'Thời gian chuẩn (ISO)', 'Nhịp tim (BPM)', 'Nồng độ oxy (SpO2 %)', 'Mã tư thế', 'Tên tư thế', 'Trong vùng quan sát', 'Có cảnh báo', 'Loại cảnh báo'];
    const rows = userFilteredHistory.map(item => [
      `"${item.id}"`,
      `"${item.userName || item.userEmail || ''}"`,
      `"${item.dateFormatted || ''}"`,
      `"${item.timeFormatted}"`,
      `"${item.timestamp}"`,
      item.bpm,
      item.spo2,
      item.postureStatus,
      `"${item.postureLabel}"`,
      item.trackingActive ? 'Có' : 'Không',
      item.hasAlert ? 'Có' : 'Không',
      `"${item.alertType || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const todayStr = new Date().toISOString().split('T')[0];
    const accSlug = selectedAccountFilter !== 'all' ? `_${selectedAccountFilter}` : '';
    link.setAttribute('download', `nhat_ky_suc_khoe_tu_the${accSlug}_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (userFilteredHistory.length === 0) return;
    const user = getCurrentUser();
    exportHealthReportToPDF({
      currentUser: user,
      historyLogs: userFilteredHistory,
    });
  };

  const handleConfirmClear = () => {
    if (onClearHistory) {
      onClearHistory();
    }
    setShowConfirmClear(false);
  };

  const handleDeleteItem = (id: string) => {
    if (onDeleteSingleLog) {
      onDeleteSingleLog(id);
    }
    setDeletingId(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 lg:p-6 text-slate-900 transition-all">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Nhật Ký Dữ Liệu Sức Khỏe & Tư Thế</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {filteredLogs.length}/{userFilteredHistory.length} bản ghi
              </span>
            </h2>
            {/* Account scope badge */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-mono font-medium whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              <span>
                {selectedAccountFilter === 'all' 
                  ? 'Tất cả tài khoản' 
                  : (selectedAccountFilter === currentUser?.id ? `Dữ liệu riêng: ${currentUser?.fullName || currentUser?.username}` : `Dữ liệu: ${distinctAccounts.find(a => a.id === selectedAccountFilter)?.name || selectedAccountFilter}`)}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-mono font-medium whitespace-nowrap">
              <Cloud className="w-3 h-3 text-sky-600 shrink-0" />
              <span>Firestore: {selectedAccountFilter !== 'all' ? `/users/${selectedAccountFilter}/history` : firebaseHistoryCollection}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Hệ thống tự động lưu dữ liệu thời gian thực theo phân vùng tài khoản độc lập trên Firebase Cloud & bộ nhớ thiết bị.
          </p>
        </div>

        {/* Action Controls Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Real-time Auto-save Indicator (Replaces manual save button as requested) */}
          <div 
            title="Dữ liệu cảm biến & camera IoT được tự động lưu lên Firebase Cloud liên tục"
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold whitespace-nowrap shadow-2xs"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Tự động lưu Firebase Cloud</span>
          </div>

          {/* Sync Button */}
          {onRefreshHistory && (
            <button
              onClick={onRefreshHistory}
              disabled={isSyncing}
              title="Đồng bộ 2 chiều với Firebase Firestore"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ'}</span>
            </button>
          )}

          {/* Save Snapshot Button */}
          {onSaveSnapshot && (
            <button
              onClick={onSaveSnapshot}
              title="Lưu ngay lập tức mốc dữ liệu hiện tại vào Firestore & lịch sử"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition whitespace-nowrap cursor-pointer shadow-2xs"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-sky-600" />
              <span>Lưu mốc hiện tại</span>
            </button>
          )}

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            disabled={history.length === 0}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition disabled:opacity-50 whitespace-nowrap cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV</span>
          </button>

          {/* Export PDF Report Button */}
          <button
            onClick={handleExportPDF}
            disabled={history.length === 0}
            title="Xuất dữ liệu lịch sử đo đạc từ Firebase sang tệp báo cáo PDF để in hoặc lưu trữ"
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition disabled:opacity-50 whitespace-nowrap cursor-pointer shadow-2xs"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-600" />
            <span>Xuất Báo Cáo PDF</span>
          </button>

          {/* RESTORED CLEAR HISTORY BUTTON - ALWAYS VISIBLE & CLEAR */}
          {onClearHistory && (
            <>
              {showConfirmClear ? (
                <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-300 h-9 px-2.5 rounded-xl animate-fadeIn">
                  <span className="text-xs text-rose-800 whitespace-nowrap font-medium">Xác nhận xóa hết?</span>
                  <button
                    onClick={handleConfirmClear}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 cursor-pointer whitespace-nowrap shadow-2xs"
                  >
                    Xóa hết
                  </button>
                  <button
                    onClick={() => setShowConfirmClear(false)}
                    className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs hover:bg-slate-300 cursor-pointer whitespace-nowrap"
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirmClear(true)}
                  disabled={history.length === 0}
                  title="Xóa toàn bộ lịch sử trên máy và Firebase Firestore"
                  className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300 transition disabled:opacity-40 whitespace-nowrap cursor-pointer shadow-2xs"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Xóa lịch sử</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Account Selector Bar (Separates data clearly per account) */}
      {isManager && distinctAccounts.length > 1 && (
        <div className="mb-3 p-2 sm:p-2.5 bg-slate-50/90 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 whitespace-nowrap">
            <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Xem lịch sử theo tài khoản:</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {distinctAccounts.map(acc => {
              const isSelected = selectedAccountFilter === acc.id;
              const isMe = acc.id === currentUser?.id;
              return (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAccountFilter(acc.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                    isSelected 
                      ? 'bg-indigo-600 text-white shadow-2xs' 
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>{isMe ? `Tôi (${acc.name})` : acc.name}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {acc.count}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => setSelectedAccountFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                selectedAccountFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <span>Tất cả tài khoản</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                selectedAccountFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {history.length}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 mb-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo ngày (vd: 21/09/2026), giờ, nhịp tim..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white transition"
          />
        </div>

        {/* Date Filter Dropdown if multiple dates */}
        {availableDates.length > 1 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" />
              Ngày:
            </span>
            <select
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:border-sky-500 transition cursor-pointer"
            >
              <option value="all">Tất cả ngày ({availableDates.length})</option>
              {availableDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}

        {/* Posture Type Filter Buttons */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setFilterPosture('all')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition ${
              filterPosture === 'all' 
                ? 'bg-slate-900 text-white shadow-2xs' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tất cả ({userFilteredHistory.length})
          </button>
          <button
            onClick={() => setFilterPosture('good')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition ${
              filterPosture === 'good' 
                ? 'bg-emerald-600 text-white shadow-2xs' 
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            Tư thế Đúng
          </button>
          <button
            onClick={() => setFilterPosture('bad')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition ${
              filterPosture === 'bad' 
                ? 'bg-rose-600 text-white shadow-2xs' 
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            Tư thế Sai / Gù
          </button>
          <button
            onClick={() => setFilterPosture('absent')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition ${
              filterPosture === 'absent' 
                ? 'bg-amber-600 text-white shadow-2xs' 
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            Vắng mặt
          </button>
        </div>
      </div>

      {/* Main Table / Feed Area */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            {history.length === 0 
              ? 'Chưa có bản ghi nào. Dữ liệu cảm biến & camera Pi 4 sẽ tự động lưu liên tục tại đây.' 
              : 'Không tìm thấy bản ghi nào khớp với điều kiện lọc.'}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider z-10">
                  <tr>
                    <th className="px-4 py-2.5">Thời Gian (Ngày & Giờ)</th>
                    <th className="px-4 py-2.5">Trạng Thái Tư Thế</th>
                    <th className="px-4 py-2.5">Nhịp Tim (BPM)</th>
                    <th className="px-4 py-2.5">SpO₂ (%)</th>
                    <th className="px-4 py-2.5">Vùng Camera</th>
                    <th className="px-4 py-2.5">Cảnh Báo</th>
                    <th className="px-4 py-2.5 text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map(item => {
                    let postureBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                    if (item.postureStatus === 0) postureBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    else if (item.postureStatus === 1 || item.postureStatus === 3) postureBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
                    else if (item.postureStatus === 4) postureBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition group">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-sky-600 shrink-0" />
                            <div className="flex flex-col">
                              <span className="font-mono text-slate-900 font-bold">
                                {item.dateFormatted || '--/--/----'}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-[11px] text-slate-500">
                                  {item.timeFormatted}
                                </span>
                                {(item.userName || item.userEmail) && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100 max-w-[120px] truncate" title={item.userEmail}>
                                    {item.userName || item.userEmail}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border whitespace-nowrap ${postureBadgeClass}`}>
                            {item.postureLabel}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {item.bpm > 0 ? `${item.bpm} bpm` : '--'}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {item.spo2 > 0 ? `${item.spo2}%` : '--'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                            item.trackingActive ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}></span>
                          <span className="text-slate-600">{item.trackingActive ? 'Trong vùng' : 'Vắng'}</span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {item.hasAlert ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                              <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                              {item.alertType || 'Cảnh báo'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              Bình thường
                            </span>
                          )}
                        </td>

                        {/* RESTORED ROW-LEVEL DELETE BUTTON */}
                        <td className="px-4 py-2.5 text-center whitespace-nowrap">
                          {onDeleteSingleLog && (
                            deletingId === item.id ? (
                              <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-300 px-1.5 py-0.5 rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                                >
                                  Xóa
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingId(null)}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                                >
                                  Hủy
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingId(item.id)}
                                title="Xóa bản ghi này"
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 flex items-center justify-center transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Feed View (Zero horizontal scroll, perfectly balanced) */}
            <div className="block sm:hidden divide-y divide-slate-100 p-2 space-y-2 max-h-[400px] overflow-y-auto">
              {filteredLogs.map(item => {
                let postureBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                if (item.postureStatus === 0) postureBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                else if (item.postureStatus === 1 || item.postureStatus === 3) postureBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
                else if (item.postureStatus === 4) postureBadgeClass = 'bg-amber-100 text-amber-800 border-amber-300';

                return (
                  <div key={item.id} className="p-3 rounded-xl bg-slate-50/90 border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono text-xs min-w-0">
                        <Calendar className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span className="font-bold text-slate-900">{item.dateFormatted || '--/--/----'}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600">{item.timeFormatted}</span>
                        {(item.userName || item.userEmail) && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100 max-w-[90px] truncate" title={item.userEmail}>
                            {item.userName || item.userEmail}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap shrink-0 ${postureBadgeClass}`}>
                          {item.postureLabel}
                        </span>
                        {/* Mobile Delete Button */}
                        {onDeleteSingleLog && (
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            title="Xóa bản ghi này"
                            className="w-6 h-6 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-slate-200 text-center">
                        <span className="text-[10px] text-slate-500 block mb-0.5">Nhịp tim</span>
                        <span className="font-mono font-bold text-rose-700 text-xs">
                          {item.bpm > 0 ? `${item.bpm} bpm` : '--'}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200 text-center">
                        <span className="text-[10px] text-slate-500 block mb-0.5">SpO₂</span>
                        <span className="font-mono font-bold text-sky-700 text-xs">
                          {item.spo2 > 0 ? `${item.spo2}%` : '--'}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200 text-center">
                        <span className="text-[10px] text-slate-500 block mb-0.5">Vùng AI</span>
                        <span className="text-[11px] font-semibold text-slate-700">
                          {item.trackingActive ? 'Trong vùng' : 'Vắng'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-slate-500 text-[11px]">Trạng thái:</span>
                      {item.hasAlert ? (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-[11px] whitespace-nowrap">
                          <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                          <span>{item.alertType || 'Cảnh báo'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-[11px] whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>Bình thường</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
