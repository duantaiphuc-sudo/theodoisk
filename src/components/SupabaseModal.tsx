import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  ExternalLink, 
  RefreshCw, 
  Key, 
  Table, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Layers
} from 'lucide-react';
import { SupabaseConnectionConfig } from '../types';
import { 
  getSavedSupabaseConfig, 
  saveSupabaseConfig, 
  testSupabaseConnection, 
  SUPABASE_SQL_SETUP_SCRIPT,
  fetchSupabaseHistory,
  TimeRangeFilter
} from '../services/supabaseService';

interface SupabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: (config: SupabaseConnectionConfig) => void;
  currentUser?: any;
  onNavigateToAdminQuery?: () => void;
}

export const SupabaseModal: React.FC<SupabaseModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
  currentUser,
  onNavigateToAdminQuery,
}) => {
  const [config, setConfig] = useState<SupabaseConnectionConfig>(() => getSavedSupabaseConfig());
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    tableExists?: boolean;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'sql' | 'query'>('config');

  // Query test state
  const isManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const [accountScope, setAccountScope] = useState<string>(() => (currentUser?.id || 'all'));
  const [queryRange, setQueryRange] = useState<TimeRangeFilter>('day');
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      const saved = getSavedSupabaseConfig();
      setConfig(saved);
      setTestResult(null);
      setQueryResult(null);
      if (currentUser?.role === 'employee') {
        setAccountScope(currentUser.id);
      }
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const result = await testSupabaseConnection(config);
    setIsTesting(false);
    setTestResult(result);
  };

  const handleSave = () => {
    saveSupabaseConfig(config);
    onConfigSaved?.(config);
    onClose();
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SETUP_SCRIPT);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleRunTestQuery = async () => {
    setIsQuerying(true);
    // BẢO MẬT & PHÂN QUYỀN TÀI KHOẢN:
    // Nếu là nhân viên: Bắt buộc chỉ truy vấn dữ liệu của chính mình (currentUser.id)
    // Nếu là quản trị viên: Cho phép chọn tài khoản của mình hoặc tất cả
    const targetUserId = !isManager 
      ? currentUser?.id 
      : (accountScope === 'all' ? undefined : accountScope);
    const targetUserEmail = !isManager ? currentUser?.email : undefined;

    const res = await fetchSupabaseHistory(queryRange, targetUserId, targetUserEmail);
    setIsQuerying(false);
    setQueryResult(res);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50/60 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100/80 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-xs">
              <Database className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Kết Nối Supabase (PostgreSQL)</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  SQL Time-Series
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Lưu trữ lịch sử đo đạc và truy xuất ngày/tuần/tháng với độ chính xác số học 100%
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex items-center px-4 sm:px-5 border-b border-slate-200 bg-slate-50/60 text-xs font-semibold text-slate-600">
          <button
            onClick={() => setActiveTab('config')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'config'
                ? 'border-emerald-600 text-emerald-800 font-bold bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Cấu Hình API</span>
          </button>

          <button
            onClick={() => setActiveTab('sql')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sql'
                ? 'border-emerald-600 text-emerald-800 font-bold bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Tạo Bảng SQL (Schema)</span>
          </button>

          <button
            onClick={() => setActiveTab('query')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'query'
                ? 'border-emerald-600 text-emerald-800 font-bold bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Truy Vấn Ngày / Tuần / Tháng</span>
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === 'config' && (
            <div className="space-y-4 text-xs">
              {/* Project Notice */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-slate-600 leading-relaxed">
                  Dự án Supabase: <strong className="text-slate-900">Health IOT Project</strong> (Khu vực Tokyo).
                  URL đã được tự động điền sẵn từ ảnh bảng điều khiển Supabase của bạn.
                </div>
              </div>

              {/* Supabase URL */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Supabase Project URL:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={config.url}
                    onChange={(e) => {
                      let val = e.target.value.trim();
                      const matchUrl = val.match(/NEXT_PUBLIC_SUPABASE_URL=["']?([^"'\s\n\r]+)["']?/);
                      if (matchUrl && matchUrl[1]) val = matchUrl[1];
                      setConfig({ ...config, url: val });
                    }}
                    placeholder="https://your-project.supabase.co"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                  <a
                    href="https://supabase.com/dashboard/project/chftlvnbzudreqfsyeyj"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition"
                    title="Mở Supabase Dashboard"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Anon Public Key */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-700 font-semibold">
                    Supabase Anon Key (Public Key):
                  </label>
                  <a
                    href="https://supabase.com/dashboard/project/chftlvnbzudreqfsyeyj/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
                  >
                    Mở trang API Keys <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={config.anonKey}
                    onChange={(e) => {
                      let val = e.target.value.trim();
                      // Tự động nhận diện nếu người dùng dán cả cụm .env.local
                      const matchKey = val.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=["']?([^"'\s\n\r]+)["']?/);
                      if (matchKey && matchKey[1]) {
                        val = matchKey[1];
                      }
                      setConfig({ ...config, anonKey: val });
                    }}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full pl-3 pr-20 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-md cursor-pointer"
                  >
                    {showKey ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  💡 Bạn có thể dán trực tiếp mã khóa <code>eyJhbGci...</code> hoặc dán cả dòng <code>NEXT_PUBLIC_SUPABASE_ANON_KEY=...</code>, hệ thống sẽ tự động trích xuất.
                </p>
              </div>

              {/* Table Name & Auto Sync */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Tên bảng dữ liệu (Table name):
                  </label>
                  <input
                    type="text"
                    value={config.tableName}
                    onChange={(e) => setConfig({ ...config, tableName: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none hover:bg-slate-100 transition">
                    <input
                      type="checkbox"
                      checked={config.autoSync}
                      onChange={(e) => setConfig({ ...config, autoSync: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-slate-700 font-medium">
                      Tự động ghi telemetry vào Supabase
                    </span>
                  </label>
                </div>
              </div>

              {/* Test Connection Button & Result */}
              <div className="pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || !config.anonKey}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold border border-slate-300 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('sql')}
                    className="px-3 py-2 rounded-xl text-emerald-700 hover:bg-emerald-50 font-medium transition cursor-pointer flex items-center gap-1"
                  >
                    <span>Xem mã SQL tạo bảng</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`mt-3 p-3 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                      testResult.success
                        ? testResult.tableExists === false
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    {testResult.success ? (
                      testResult.tableExists === false ? (
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      )
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-semibold">{testResult.message}</p>
                      {testResult.tableExists === false && (
                        <button
                          onClick={() => setActiveTab('sql')}
                          className="mt-1.5 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] cursor-pointer inline-flex items-center gap-1"
                        >
                          <Table className="w-3 h-3" />
                          <span>Mở mã SQL để copy và tạo bảng</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900">Mã SQL khởi tạo bảng & Index</h4>
                  <p className="text-[11px] text-slate-500">
                    Vào <strong>Supabase Dashboard $\rightarrow$ SQL Editor</strong> $\rightarrow$ Dán đoạn mã này và bấm <strong>Run</strong>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCopySql}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Đã sao chép!' : 'Sao chép mã SQL'}</span>
                </button>
              </div>

              <div className="relative">
                <pre className="p-3.5 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800 max-h-[320px]">
                  {SUPABASE_SQL_SETUP_SCRIPT}
                </pre>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
                💡 <strong>Lợi ích vượt trội:</strong> Bảng được thiết kế có sẵn các chỉ mục <code>idx_telemetry_created_at</code> giúp các truy vấn ngày trước, tuần trước, tháng trước trả về kết quả trong chưa đầy <strong>5 mili-giây</strong> với chi phí tài nguyên gần như bằng 0.
              </div>
            </div>
          )}

          {activeTab === 'query' && (
            <div className="space-y-3 text-xs">
              {isManager && onNavigateToAdminQuery && (
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
                  <div>
                    <span className="font-bold flex items-center gap-1.5 text-xs text-indigo-950">
                      <span>✨ Truy vấn Lịch sử Nâng cao trong Danh Mục Quản Trị</span>
                    </span>
                    <span className="text-[11px] text-indigo-700 leading-relaxed block mt-0.5">
                      Giao diện truy vấn phân tích chi tiết cho từng nhân viên, bảng xếp hạng công ty và xuất báo cáo CSV/PDF đã được tích hợp tập trung vào <strong>Danh Mục Quản Trị Hệ Thống</strong>.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToAdminQuery();
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs whitespace-nowrap shadow-xs cursor-pointer active:scale-95 shrink-0"
                  >
                    Mở Danh Mục Quản Trị
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-slate-900">Truy xuất dữ liệu lịch sử chuẩn xác</h4>
                  <p className="text-[11px] text-slate-500">
                    {isManager ? 'Quản trị viên: Có thể chọn xem toàn bộ hoặc lọc theo tài khoản' : `Nhân viên: Khóa bảo mật tài khoản cá nhân (${currentUser?.fullName || currentUser?.username})`}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {isManager && (
                    <select
                      value={accountScope}
                      onChange={(e) => setAccountScope(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 font-semibold text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="all">Tất cả nhân viên</option>
                      {currentUser && <option value={currentUser.id}>Chỉ mình tôi ({currentUser.fullName || currentUser.username})</option>}
                    </select>
                  )}

                  <select
                    value={queryRange}
                    onChange={(e) => setQueryRange(e.target.value as TimeRangeFilter)}
                    className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 font-bold text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="day">24 giờ qua (Ngày)</option>
                    <option value="week">7 ngày qua (Tuần)</option>
                    <option value="month">30 ngày qua (Tháng)</option>
                    <option value="all">Toàn bộ lịch sử</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleRunTestQuery}
                    disabled={isQuerying || !config.anonKey}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isQuerying ? 'animate-spin' : ''}`} />
                    <span>{isQuerying ? 'Đang tải...' : 'Truy xuất'}</span>
                  </button>
                </div>
              </div>

              {queryResult && (
                <div className="space-y-3">
                  {queryResult.error ? (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                      {queryResult.error}
                    </div>
                  ) : (
                    <>
                      {/* Metric cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-semibold block">Tổng bản ghi</span>
                          <span className="text-lg font-bold font-mono text-slate-900">
                            {queryResult.stats.totalRecords}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-semibold block">Nhịp tim TB</span>
                          <span className="text-lg font-bold font-mono text-rose-600">
                            {queryResult.stats.avgBpm > 0 ? `${queryResult.stats.avgBpm} BPM` : '--'}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-semibold block">SpO2 TB</span>
                          <span className="text-lg font-bold font-mono text-sky-600">
                            {queryResult.stats.avgSpo2 > 0 ? `${queryResult.stats.avgSpo2}%` : '--'}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-semibold block">Tỷ lệ ngồi đúng</span>
                          <span className="text-lg font-bold font-mono text-emerald-600">
                            {queryResult.stats.totalRecords > 0 ? `${queryResult.stats.goodPostureRatio}%` : '--'}
                          </span>
                        </div>
                      </div>

                      {/* Data table preview */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto">
                        <table className="w-full text-[11px] text-left">
                          <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                            <tr>
                              <th className="p-2">Thời gian</th>
                              <th className="p-2">Nhịp tim</th>
                              <th className="p-2">SpO2</th>
                              <th className="p-2">Tư thế</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                            {queryResult.data.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-3 text-center text-slate-400 font-sans">
                                  Chưa có bản ghi nào trong mốc thời gian này.
                                </td>
                              </tr>
                            ) : (
                              queryResult.data.slice(0, 15).map((row: any) => (
                                <tr key={row.id} className="hover:bg-slate-50">
                                  <td className="p-2">{row.timeFormatted} {row.dateFormatted}</td>
                                  <td className="p-2 text-rose-600 font-bold">{row.bpm} BPM</td>
                                  <td className="p-2 text-sky-600 font-bold">{row.spo2}%</td>
                                  <td className="p-2 text-slate-800 font-sans font-medium">{row.postureLabel}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Chạy song song: Firebase Realtime + Supabase SQL</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-200 text-xs font-semibold transition cursor-pointer"
            >
              Hủy
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
            >
              Lưu cấu hình
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
