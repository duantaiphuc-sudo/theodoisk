import React, { useState, useMemo } from 'react';
import { Download, Search, Filter, RefreshCw, AlertCircle, CheckCircle2, Cloud, BookmarkPlus, Trash2 } from 'lucide-react';
import { TelemetryLog } from '../types';

interface HistoryLogsProps {
  history: TelemetryLog[];
  onClearHistory?: () => void;
  onRefreshHistory?: () => void;
  onSaveSnapshot?: () => void;
  isSyncing?: boolean;
  firebaseHistoryCollection?: string;
  isManager: boolean;
}

export const HistoryLogs: React.FC<HistoryLogsProps> = ({ 
  history, 
  onClearHistory, 
  onRefreshHistory,
  onSaveSnapshot,
  isSyncing = false,
  firebaseHistoryCollection = 'theodoisk_history',
  isManager 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPosture, setFilterPosture] = useState<string>('all');
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const filteredLogs = useMemo(() => {
    return history.filter(item => {
      const matchesSearch =
        item.timeFormatted.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.postureLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(item.bpm).includes(searchTerm) ||
        String(item.spo2).includes(searchTerm);

      if (!matchesSearch) return false;

      if (filterPosture === 'all') return true;
      if (filterPosture === 'good') return item.postureStatus === 0;
      if (filterPosture === 'bad') return item.postureStatus === 1 || item.postureStatus === 3;
      if (filterPosture === 'sitting') return item.postureStatus === 4;
      if (filterPosture === 'alert') return item.hasAlert;
      return true;
    });
  }, [history, searchTerm, filterPosture]);

  const handleExportCSV = () => {
    if (history.length === 0) return;

    const headers = ['Thời gian', 'Thời gian gốc', 'Nhịp tim (BPM)', 'Nồng độ SpO2 (%)', 'Tư thế', 'Mã tư thế', 'Trạng thái theo dõi', 'Có cảnh báo'];
    const rows = history.map(item => [
      item.timeFormatted,
      item.timestamp,
      item.bpm > 0 ? item.bpm : '',
      item.spo2 > 0 ? item.spo2 : '',
      `"${item.postureLabel}"`,
      item.postureStatus,
      item.trackingActive ? 'Đang theo dõi' : 'Vắng mặt',
      item.hasAlert ? 'CÓ' : 'KHÔNG'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `theodoisk_health_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmClear = () => {
    if (onClearHistory) {
      onClearHistory();
    }
    setShowConfirmClear(false);
  };

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Lịch Sử Dữ Liệu Sinh Trắc & Tư Thế</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-sky-400 font-mono font-semibold">
                {history.length} bản ghi
              </span>
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-950/80 border border-sky-500/40 text-sky-300 text-[11px] font-mono">
              <Cloud className="w-3 h-3 text-sky-400 animate-pulse" />
              <span>Đám mây: {firebaseHistoryCollection}</span>
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Lịch sử được lưu trữ liên tục trên Firebase Firestore & bộ nhớ thiết bị, không bị mất khi đóng ứng dụng
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {onRefreshHistory && (
            <button
              onClick={onRefreshHistory}
              disabled={isSyncing}
              title="Tải lại các bản ghi mới nhất từ Firebase Firestore"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden xs:inline sm:inline">{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ'}</span>
              <span className="hidden sm:inline">Firestore</span>
            </button>
          )}

          {onSaveSnapshot && (
            <button
              onClick={onSaveSnapshot}
              title="Lưu ngay lập tức mốc dữ liệu hiện tại vào Firestore & lịch sử"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600/20 text-sky-300 border border-sky-500/40 hover:bg-sky-600/30 transition whitespace-nowrap"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-sky-400" />
              <span>Lưu mốc này</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            disabled={history.length === 0}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV</span>
          </button>

          {isManager && onClearHistory && (
            <>
              {showConfirmClear ? (
                <div className="flex items-center gap-1.5 bg-rose-950/90 border border-rose-600 px-2 py-1 rounded-lg animate-fadeIn">
                  <span className="text-[11px] text-rose-200 whitespace-nowrap">Xóa hết?</span>
                  <button
                    onClick={handleConfirmClear}
                    className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-500"
                  >
                    Xác nhận
                  </button>
                  <button
                    onClick={() => setShowConfirmClear(false)}
                    className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px] hover:bg-slate-700"
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirmClear(true)}
                  disabled={history.length === 0}
                  title="Xóa toàn bộ lịch sử trên máy và Firebase Firestore"
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800 transition disabled:opacity-40 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5 mb-3">
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo giờ, nhịp tim..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterPosture('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
              filterPosture === 'all'
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setFilterPosture('good')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
              filterPosture === 'good'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Tư thế đúng
          </button>
          <button
            onClick={() => setFilterPosture('bad')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
              filterPosture === 'bad'
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Tư thế sai
          </button>
          <button
            onClick={() => setFilterPosture('alert')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
              filterPosture === 'alert'
                ? 'bg-amber-600 text-white border-amber-500'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Có cảnh báo
          </button>
        </div>
      </div>

      {/* Table on Tablet/Desktop, Responsive Card Feed on Mobile */}
      <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60 max-h-[380px] overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500 text-xs">
            Chưa có bản ghi lịch sử nào phù hợp bộ lọc. Bật giám sát hoặc kết nối Pi 4 để bắt đầu lưu trữ tự động.
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-400 sticky top-0 border-b border-slate-800 z-10">
                  <tr>
                    <th className="px-4 py-2.5">Thời gian</th>
                    <th className="px-4 py-2.5">Tư thế</th>
                    <th className="px-4 py-2.5">Nhịp tim</th>
                    <th className="px-4 py-2.5">SpO₂</th>
                    <th className="px-4 py-2.5">Giám sát</th>
                    <th className="px-4 py-2.5 text-right">Cảnh báo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredLogs.map(item => {
                    let postureBadgeClass = 'bg-slate-800 text-slate-300';
                    if (item.postureStatus === 0) postureBadgeClass = 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40';
                    else if (item.postureStatus === 1 || item.postureStatus === 3) postureBadgeClass = 'bg-rose-950/60 text-rose-300 border border-rose-800/40';
                    else if (item.postureStatus === 4) postureBadgeClass = 'bg-amber-950/60 text-amber-300 border border-amber-800/40';

                    return (
                      <tr key={item.id} className="hover:bg-slate-900/50 transition">
                        <td className="px-4 py-2 font-mono text-slate-400 whitespace-nowrap">
                          {item.timeFormatted}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${postureBadgeClass}`}>
                            {item.postureLabel}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono font-medium text-slate-200">
                          {item.bpm > 0 ? `${item.bpm} bpm` : '--'}
                        </td>
                        <td className="px-4 py-2 font-mono font-medium text-slate-200">
                          {item.spo2 > 0 ? `${item.spo2}%` : '--'}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                            item.trackingActive ? 'bg-emerald-400' : 'bg-slate-600'
                          }`}></span>
                          <span className="text-slate-400">{item.trackingActive ? 'Trong vùng' : 'Vắng'}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {item.hasAlert ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded whitespace-nowrap">
                              <AlertCircle className="w-3 h-3" />
                              {item.alertType || 'Cảnh báo'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/80 whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3" />
                              Ổn định
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Feed View (No horizontal scrolling) */}
            <div className="block sm:hidden divide-y divide-slate-800/60 p-2 space-y-2">
              {filteredLogs.map(item => {
                let postureBadgeClass = 'bg-slate-800 text-slate-300';
                if (item.postureStatus === 0) postureBadgeClass = 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40';
                else if (item.postureStatus === 1 || item.postureStatus === 3) postureBadgeClass = 'bg-rose-950/60 text-rose-300 border border-rose-800/40';
                else if (item.postureStatus === 4) postureBadgeClass = 'bg-amber-950/60 text-amber-300 border border-amber-800/40';

                return (
                  <div key={item.id} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/70 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-slate-400">
                        {item.timeFormatted}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${postureBadgeClass}`}>
                        {item.postureLabel}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Nhịp tim</span>
                        <span className="font-mono font-bold text-rose-300">
                          {item.bpm > 0 ? `${item.bpm} bpm` : '--'}
                        </span>
                      </div>
                      <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">SpO₂</span>
                        <span className="font-mono font-bold text-sky-300">
                          {item.spo2 > 0 ? `${item.spo2}%` : '--'}
                        </span>
                      </div>
                      <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Vùng camera</span>
                        <span className="text-[11px] font-medium text-slate-300">
                          {item.trackingActive ? 'Trong vùng' : 'Vắng'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-slate-500 text-[10px]">Cảnh báo:</span>
                      {item.hasAlert ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                          <AlertCircle className="w-3 h-3" />
                          {item.alertType || 'Cảnh báo'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400/90 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Ổn định bình thường
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
