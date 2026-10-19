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
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-emerald-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-2xs">
              <Database className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Cấu Hình Supabase (PostgreSQL)</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Cloud SQL
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Lưu trữ và truy xuất lịch sử đo đạc sinh trắc học
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

        {/* Tab selection (Chỉ quản trị viên mới có quyền cấu hình kết nối Supabase) */}
        {isManager && (
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
              <span>Cấu Hình Kết Nối</span>
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
              <span>Truy Vấn Lịch Sử</span>
            </button>
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Status & Connection Controller Banner */}
          <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            isConnected 
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' 
              : (config.url && config.anonKey)
                ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                isConnected 
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-700' 
                  : (config.url && config.anonKey)
                    ? 'bg-amber-100 border-amber-300 text-amber-700'
                    : 'bg-slate-200 border-slate-300 text-slate-600'
              }`}>
                {isConnected ? <Plug className="w-4 h-4" /> : <Unplug className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-xs sm:text-sm">
                    {isConnected 
                      ? 'Đang kết nối Supabase' 
                      : (config.url && config.anonKey)
                        ? 'Đã ngắt kết nối Supabase (Chế độ test)'
                        : 'Chưa kết nối Supabase'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                    isConnected
                      ? 'bg-emerald-200/80 text-emerald-900 border border-emerald-300'
                      : (config.url && config.anonKey)
                        ? 'bg-amber-200 text-amber-900 border border-amber-300'
                        : 'bg-slate-200 text-slate-700 border border-slate-300'
                  }`}>
                    {isConnected ? '🟢 Đang lưu DB' : (config.url && config.anonKey) ? '⚪ Test Mode (Không lưu DB)' : 'Chưa cấu hình'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
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
                    className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold transition cursor-pointer"
                    title="Ngắt kết nối để chỉ test mà không lưu vào database"
                  >
                    Ngắt kết nối (Test)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleReconnect}
                    disabled={isTesting}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition cursor-pointer"
                    title="Bật lại kết nối và tự động lưu dữ liệu"
                  >
                    Kết nối lại
                  </button>
                )}

                {isManager && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
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
                    href="https://supabase.com/dashboard"
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
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || !config.anonKey}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold border border-slate-300 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</span>
                </button>

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
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'query' && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <h4 className="font-bold text-slate-900">Truy xuất lịch sử lưu trữ</h4>

                <div className="flex items-center gap-2 flex-wrap">
                  {isManager ? (
                    <select
                      value={accountScope}
                      onChange={(e) => setAccountScope(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 font-semibold text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="all">Tất cả tài khoản</option>
                      {currentUser && <option value={currentUser.id}>Tài khoản hiện tại ({currentUser.fullName || currentUser.username})</option>}
                    </select>
                  ) : (
                    <div className="px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>Chỉ dữ liệu cá nhân ({currentUser?.fullName || currentUser?.username || 'Nhân viên'})</span>
                    </div>
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
                            {queryResult.stats?.totalRecords ?? 0}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-semibold block">Nhịp tim TB</span>
                          <span className="text-lg font-bold font-mono text-rose-600">
                            {queryResult.stats?.avgBpm > 0 ? `${queryResult.stats.avgBpm} BPM` : '--'}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-semibold block">SpO2 TB</span>
                          <span className="text-lg font-bold font-mono text-sky-600">
                            {queryResult.stats?.avgSpo2 > 0 ? `${queryResult.stats.avgSpo2}%` : '--'}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-semibold block">Tỷ lệ đúng tư thế</span>
                          <span className="text-lg font-bold font-mono text-emerald-600">
                            {queryResult.stats?.totalRecords > 0 ? `${queryResult.stats.goodPostureRatio}%` : '--'}
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
                            {!queryResult.data || queryResult.data.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-3 text-center text-slate-400 font-sans">
                                  Chưa có bản ghi nào trong khoảng thời gian này.
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
            <span>Supabase PostgreSQL Database</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-200 text-xs font-semibold transition cursor-pointer"
            >
              {isManager && activeTab === 'config' ? 'Hủy' : 'Đóng'}
            </button>

            {isManager && activeTab === 'config' && (
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
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
