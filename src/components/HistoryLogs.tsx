import React, { useState, useMemo } from 'react';
import { Download, Search, Filter, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { TelemetryLog } from '../types';

interface HistoryLogsProps {
  history: TelemetryLog[];
  onClearHistory?: () => void;
  isManager: boolean;
}

export const HistoryLogs: React.FC<HistoryLogsProps> = ({ history, onClearHistory, isManager }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPosture, setFilterPosture] = useState<string>('all');

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

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>Lịch Sử Dữ Liệu Sinh Trắc & Tư Thế</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {history.length} bản ghi
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Nhật ký telemetry tự động lưu lại từ Firebase khi có thay đổi</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={history.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất file CSV</span>
          </button>
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

      {/* Table */}
      <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60 max-h-[340px] overflow-y-auto">
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
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Không tìm thấy bản ghi telemetry phù hợp
                </td>
              </tr>
            ) : (
              filteredLogs.map(item => {
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${postureBadgeClass}`}>
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
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                          <AlertCircle className="w-3 h-3" />
                          {item.alertType || 'Cảnh báo'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/80">
                          <CheckCircle2 className="w-3 h-3" />
                          Ổn định
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
