import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Key, 
  Calendar,
  ExternalLink,
  Unplug,
  Plug,
  Trash2
} from 'lucide-react';
import { SupabaseConnectionConfig } from '../types';
import { 
  getSavedSupabaseConfig, 
  saveSupabaseConfig, 
  testSupabaseConnection, 
  fetchSupabaseHistory,
  disconnectSupabase,
  reconnectSupabase,
  clearSupabaseConfig,
  TimeRangeFilter
} from '../services/supabaseService';
import { isUserAdmin } from '../services/authService';

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
}) => {
  const isManager = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager' || isUserAdmin(currentUser)));
  const [config, setConfig] = useState<SupabaseConnectionConfig>(() => getSavedSupabaseConfig());
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    tableExists?: boolean;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | 'query'>('config');

  // Query test state
  const [accountScope, setAccountScope] = useState<string>('all');
  const [queryRange, setQueryRange] = useState<TimeRangeFilter>('day');
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<any>(null);

  const isConnected = Boolean(config.isConnected !== false && config.url && config.anonKey);

  useEffect(() => {
    if (isOpen) {
      const saved = getSavedSupabaseConfig();
      setConfig(saved);
      setTestResult(null);
      setQueryResult(null);
      // Quản trị viên được xem toàn bộ, nhân viên BẮT BUỘC chỉ xem tài khoản của chính mình
      setAccountScope(isManager ? 'all' : (currentUser?.id || ''));
      setActiveTab(isManager ? 'config' : 'query');
    }
  }, [isOpen, currentUser, isManager]);

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

  const handleDisconnect = () => {
    const updated = disconnectSupabase();
    setConfig(updated);
    onConfigSaved?.(updated);
    setTestResult({
      success: true,
      message: 'Đã ngắt kết nối Supabase thành công! Hệ thống đang ở chế độ Test thử nghiệm (KHÔNG lưu dữ liệu vào database).'
    });
  };

  const handleReconnect = async () => {
    const updated = reconnectSupabase();
    setConfig(updated);
    onConfigSaved?.(updated);
    setIsTesting(true);
    const result = await testSupabaseConnection(updated);
    setIsTesting(false);
    setTestResult(result);
  };

  const handleClear = () => {
    if (window.confirm('Bạn có chắc chắn muốn ngắt kết nối và xóa toàn bộ cấu hình Supabase không?')) {
      const reset = clearSupabaseConfig();
      setConfig(reset);
      onConfigSaved?.(reset);
      setTestResult({
        success: true,
        message: 'Đã xóa toàn bộ cấu hình Supabase.'
      });
    }
  };

  const handleRunTestQuery = async () => {
    setIsQuerying(true);
    // Bảo mật phân quyền: Nhân viên chỉ có thể truy vấn chính tài khoản của mình
    const targetUserId = isManager 
      ? (accountScope === 'all' ? undefined : accountScope) 
      : (currentUser?.id || 'none');
    const targetUserEmail = !isManager ? (currentUser?.email || undefined) : undefined;

    const res = await fetchSupabaseHistory(queryRange, targetUserId, targetUserEmail);
    setIsQuerying(false);
    setQueryResult(res);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white border-2 border-slate-800 shadow-[0_8px_0_#1E293B] text-slate-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b-2 border-slate-800 bg-[#FDFBF7] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#B2F5BE] border-[1.5px] border-slate-800 flex items-center justify-center text-slate-900 shadow-[0_2px_0_#1E293B] shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-slate-900">Cấu Hình Supabase (PostgreSQL)</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#BAE0EC] text-slate-900 border-[1.5px] border-slate-800">
                  Cloud SQL
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Lưu trữ và truy xuất lịch sử đo đạc sinh trắc học
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab selection (Chỉ quản trị viên mới có quyền cấu hình kết nối Supabase) */}
        {isManager && (
          <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5 border-b-2 border-slate-800 bg-[#FAF7F0] text-xs font-bold shrink-0">
            <button
              onClick={() => setActiveTab('config')}
              className={`py-2 px-3.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'config'
                  ? 'bg-[#16B364] text-white border-[1.5px] border-slate-900 shadow-[0_2px_0_#0F172A]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white border-[1.5px] border-transparent'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Cấu Hình Kết Nối</span>
            </button>

            <button
              onClick={() => setActiveTab('query')}
              className={`py-2 px-3.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'query'
                  ? 'bg-[#16B364] text-white border-[1.5px] border-slate-900 shadow-[0_2px_0_#0F172A]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white border-[1.5px] border-transparent'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Truy Vấn Lịch Sử</span>
            </button>
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Status & Connection Controller Banner */}
          <div className={`p-3.5 rounded-xl border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            isConnected 
              ? 'bg-[#B2F5BE]/45 text-slate-900' 
              : (config.url && config.anonKey)
                ? 'bg-[#FDE68A]/50 text-slate-900'
                : 'bg-[#FAF7F0] text-slate-900'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border-[1.5px] border-slate-800 ${
                isConnected 
                  ? 'bg-[#B2F5BE] text-slate-900' 
                  : (config.url && config.anonKey)
                    ? 'bg-[#FDE68A] text-slate-900'
                    : 'bg-white text-slate-700'
              }`}>
                {isConnected ? <Plug className="w-4 h-4" /> : <Unplug className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                    {isConnected 
                      ? 'Đang kết nối Supabase' 
                      : (config.url && config.anonKey)
                        ? 'Đã ngắt kết nối Supabase (Chế độ test)'
                        : 'Chưa kết nối Supabase'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border-[1.5px] border-slate-800 ${
                    isConnected
                      ? 'bg-white text-emerald-800'
                      : (config.url && config.anonKey)
                        ? 'bg-white text-amber-900'
                        : 'bg-white text-slate-700'
                  }`}>
                    {isConnected ? 'Đang lưu DB' : (config.url && config.anonKey) ? 'Test Mode (Không lưu DB)' : 'Chưa cấu hình'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 mt-0.5 leading-relaxed">
                  {isConnected 
                    ? `Dữ liệu sinh trắc học và tư thế đang được tự động lưu vào bảng '${config.tableName || 'telemetry_logs'}'.` 
                    : (config.url && config.anonKey)
                      ? 'Hệ thống đã ngắt kết nối tạm thời. Bạn có thể test thoải mái mà không lo ghi dữ liệu vào database.'
                      : 'Vui lòng dán Supabase Project URL và Anon Key để đồng bộ dữ liệu.'}
                </p>
              </div>
            </div>

            {(config.url && config.anonKey) && (
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {isConnected ? (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="px-3 py-1.5 rounded-xl bg-[#FDE68A] hover:bg-[#fcd34d] text-slate-900 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] text-xs font-bold transition cursor-pointer"
                    title="Ngắt kết nối để chỉ test mà không lưu vào database"
                  >
                    Ngắt kết nối (Test)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleReconnect}
                    disabled={isTesting}
                    className="px-3 py-1.5 rounded-xl tactile-btn-primary text-xs font-bold cursor-pointer"
                    title="Bật lại kết nối và tự động lưu dữ liệu"
                  >
                    Kết nối lại
                  </button>
                )}

                {isManager && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-2 rounded-xl bg-[#FBC2C8] hover:bg-[#f9aeb6] text-slate-900 border-[1.5px] border-slate-800 transition cursor-pointer"
                    title="Xóa cấu hình"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {activeTab === 'config' && (
            <div className="space-y-4 text-xs">
              {/* Supabase URL */}
              <div>
                <label className="block text-slate-800 font-bold mb-1">
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
                    className="flex-1 px-3 py-2 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  />
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl tactile-btn-white"
                    title="Mở Supabase Dashboard"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Anon Public Key */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-800 font-bold">
                    Supabase Anon Key:
                  </label>
                </div>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={config.anonKey}
                    onChange={(e) => {
                      let val = e.target.value.trim();
                      const matchKey = val.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=["']?([^"'\s\n\r]+)["']?/);
                      if (matchKey && matchKey[1]) {
                        val = matchKey[1];
                      }
                      setConfig({ ...config, anonKey: val });
                    }}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full pl-3 pr-20 py-2 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px] font-bold text-slate-800 bg-[#FAF7F0] border border-slate-800 rounded-md cursor-pointer hover:bg-slate-100"
                  >
                    {showKey ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
              </div>

              {/* Table Name & Auto Sync */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-slate-800 font-bold mb-1">
                    Tên bảng dữ liệu (Table name):
                  </label>
                  <input
                    type="text"
                    value={config.tableName}
                    onChange={(e) => setConfig({ ...config, tableName: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 cursor-pointer select-none hover:bg-white transition">
                    <input
                      type="checkbox"
                      checked={config.autoSync}
                      onChange={(e) => setConfig({ ...config, autoSync: e.target.checked })}
                      className="w-4 h-4 rounded accent-[#16B364] cursor-pointer"
                    />
                    <span className="text-slate-900 font-bold">
                      Tự động ghi telemetry vào Supabase
                    </span>
                  </label>
                </div>
              </div>

              {/* Test Connection Button & Result */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || !config.anonKey}
                  className="px-4 py-2 rounded-xl tactile-btn-white font-bold cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-700 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</span>
                </button>

                {testResult && (
                  <div
                    className={`mt-3 p-3 rounded-xl border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] text-xs leading-relaxed flex items-start gap-2.5 ${
                      testResult.success
                        ? testResult.tableExists === false
                          ? 'bg-[#FDE68A]/55 text-slate-900'
                          : 'bg-[#B2F5BE]/55 text-slate-900'
                        : 'bg-[#FBC2C8]/65 text-slate-900'
                    }`}
                  >
                    {testResult.success ? (
                      testResult.tableExists === false ? (
                        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      )
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-bold">{testResult.message}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'query' && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                <h4 className="font-extrabold text-slate-900">Truy xuất lịch sử lưu trữ</h4>

                <div className="flex items-center gap-2 flex-wrap">
                  {isManager ? (
                    <select
                      value={accountScope}
                      onChange={(e) => setAccountScope(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-bold text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="all">Tất cả tài khoản</option>
                      {currentUser && <option value={currentUser.id}>Tài khoản hiện tại ({currentUser.fullName || currentUser.username})</option>}
                    </select>
                  ) : (
                    <div className="px-2.5 py-1.5 rounded-xl bg-[#BAE0EC] border-[1.5px] border-slate-800 text-slate-900 font-bold text-xs flex items-center gap-1.5 select-none">
                      <span className="w-2 h-2 rounded-full bg-[#16B364] border border-slate-800"></span>
                      <span>Chỉ dữ liệu cá nhân ({currentUser?.fullName || currentUser?.username || 'Nhân viên'})</span>
                    </div>
                  )}

                  <select
                    value={queryRange}
                    onChange={(e) => setQueryRange(e.target.value as TimeRangeFilter)}
                    className="px-3 py-1.5 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-bold text-xs focus:outline-none cursor-pointer"
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
                    className="px-3.5 py-1.5 rounded-xl tactile-btn-primary font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isQuerying ? 'animate-spin' : ''}`} />
                    <span>{isQuerying ? 'Đang tải...' : 'Truy xuất'}</span>
                  </button>
                </div>
              </div>

              {queryResult && (
                <div className="space-y-3">
                  {queryResult.error ? (
                    <div className="p-3 rounded-xl bg-[#FBC2C8]/65 border-[1.5px] border-slate-800 text-slate-900 font-bold">
                      {queryResult.error}
                    </div>
                  ) : (
                    <>
                      {/* Metric cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="p-3 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B]">
                          <span className="text-[10px] text-slate-600 font-bold uppercase block">Tổng bản ghi</span>
                          <span className="text-lg font-extrabold font-mono text-slate-900 tabular-nums">
                            {queryResult.stats?.totalRecords ?? 0}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-[#FBC2C8]/40 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B]">
                          <span className="text-[10px] text-slate-700 font-bold uppercase block">Nhịp tim TB</span>
                          <span className="text-lg font-extrabold font-mono text-rose-700 tabular-nums">
                            {queryResult.stats?.avgBpm > 0 ? `${queryResult.stats.avgBpm} BPM` : '--'}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-[#BAE0EC]/45 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B]">
                          <span className="text-[10px] text-slate-700 font-bold uppercase block">SpO2 TB</span>
                          <span className="text-lg font-extrabold font-mono text-sky-800 tabular-nums">
                            {queryResult.stats?.avgSpo2 > 0 ? `${queryResult.stats.avgSpo2}%` : '--'}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-[#B2F5BE]/50 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B]">
                          <span className="text-[10px] text-slate-700 font-bold uppercase block">Tỷ lệ đúng tư thế</span>
                          <span className="text-lg font-extrabold font-mono text-emerald-800 tabular-nums">
                            {queryResult.stats?.totalRecords > 0 ? `${queryResult.stats.goodPostureRatio}%` : '--'}
                          </span>
                        </div>
                      </div>

                      {/* Data table preview */}
                      <div className="border-2 border-slate-800 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto bg-white">
                        <table className="w-full text-[11px] text-left">
                          <thead className="bg-[#FAF7F0] border-b-[1.5px] border-slate-800 text-slate-900 font-extrabold sticky top-0">
                            <tr>
                              <th className="p-2.5">Thời gian</th>
                              <th className="p-2.5">Nhịp tim</th>
                              <th className="p-2.5">SpO2</th>
                              <th className="p-2.5">Tư thế</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-slate-800 font-mono">
                            {!queryResult.data || queryResult.data.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-3 text-center text-slate-500 font-sans">
                                  Chưa có bản ghi nào trong khoảng thời gian này.
                                </td>
                              </tr>
                            ) : (
                              queryResult.data.slice(0, 15).map((row: any) => (
                                <tr key={row.id} className="hover:bg-[#FAF7F0]">
                                  <td className="p-2.5">{row.timeFormatted} {row.dateFormatted}</td>
                                  <td className="p-2.5 text-rose-700 font-bold">{row.bpm} BPM</td>
                                  <td className="p-2.5 text-sky-700 font-bold">{row.spo2}%</td>
                                  <td className="p-2.5 text-slate-900 font-sans font-semibold">{row.postureLabel}</td>
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
        <div className="flex items-center justify-between p-4 sm:p-5 border-t-2 border-slate-800 bg-[#FDFBF7] shrink-0">
          <div className="text-[11px] text-slate-700 font-semibold flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#16B364] border border-slate-800"></span>
            <span>Supabase PostgreSQL Database</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl tactile-btn-white text-xs font-bold cursor-pointer"
            >
              {isManager && activeTab === 'config' ? 'Hủy' : 'Đóng'}
            </button>

            {isManager && activeTab === 'config' && (
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 rounded-xl tactile-btn-primary text-xs font-extrabold cursor-pointer"
              >
                Lưu cấu hình
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
