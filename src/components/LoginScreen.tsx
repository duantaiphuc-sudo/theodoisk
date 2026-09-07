import React, { useState } from 'react';
import { 
  Shield, 
  User, 
  Activity, 
  Lock, 
  CheckCircle2, 
  ArrowRight, 
  Cpu, 
  Sparkles, 
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { AuthUser, UserRole } from '../types';
import { PRESET_ACCOUNTS, loginWithCredentials, loginAsPreset } from '../services/authService';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'form' | 'cards'>('cards');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = loginWithCredentials(identifier, password);
    if (res.success && res.user) {
      onLoginSuccess(res.user);
    } else {
      setError(res.error || 'Đăng nhập không thành công');
    }
  };

  const handleQuickLogin = (role: UserRole) => {
    const user = loginAsPreset(role);
    onLoginSuccess(user);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-4xl mx-auto space-y-8">
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-xl shadow-sky-500/20 mb-2">
            <Activity className="w-8 h-8 animate-pulse" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Hệ Thống Giám Sát Sức Khỏe & Tư Thế IoT
          </h1>
          <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            Đồng bộ cảm biến <span className="text-sky-400 font-medium">MAX30102</span> & <span className="text-indigo-400 font-medium">Camera AI MediaPipe</span> qua Raspberry Pi 4 & Firebase Firestore.
          </p>
        </div>

        {/* 2-Role Cards (Admin vs User) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Card 1: Admin / Quản Trị Viên */}
          <div className="relative rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/50 border border-slate-800 p-6 flex flex-col justify-between shadow-xl hover:border-indigo-500/50 transition-all group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  <Shield className="w-6 h-6" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800/80">
                  Phân Quyền Quản Trị
                </span>
              </div>

              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Quản Trị Viên (Admin)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Dành cho ban quản lý doanh nghiệp, kỹ sư y tế hoặc trưởng phòng an toàn lao động.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <p className="text-xs font-semibold text-slate-300">Đặc quyền phân quyền:</p>
                <ul className="text-xs text-slate-400 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span>Toàn quyền cấu hình Firebase & đổi kết nối</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span>Hiệu chỉnh ngưỡng cảnh báo BPM & SpO₂</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span>Căn chỉnh tọa độ vùng giám sát camera</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span>Xuất báo cáo CSV & dọn dẹp lịch sử đo</span>
                  </li>
                </ul>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 font-mono">
                Tài khoản: <b className="text-indigo-300">admin</b> • MK: <b className="text-indigo-300">admin123</b>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => handleQuickLogin('manager')}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg shadow-indigo-600/25 group-hover:scale-[1.01]"
              >
                <Shield className="w-4 h-4" />
                <span>Đăng nhập quyền Admin</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card 2: User / Nhân Viên */}
          <div className="relative rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/50 border border-slate-800 p-6 flex flex-col justify-between shadow-xl hover:border-sky-500/50 transition-all group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  <User className="w-6 h-6" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-950 text-sky-300 border border-sky-800/80">
                  Phân Quyền Người Dùng
                </span>
              </div>

              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Người Dùng (User)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Dành cho nhân viên văn phòng theo dõi sức khỏe và điều chỉnh tư thế công thái học cá nhân.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <p className="text-xs font-semibold text-slate-300">Đặc quyền phân quyền:</p>
                <ul className="text-xs text-slate-400 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <span>Theo dõi trực quan nhịp tim, SpO₂ & tư thế ngồi</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <span>Âm thanh nhắc nhở khi cúi gù lưng hoặc ngồi quá lâu</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <span>Tra cứu dữ liệu với Trợ lý AI (1 giờ trước, 3 ngày trước...)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <span>Gợi ý bài tập giãn cơ & bảo vệ cột sống cổ</span>
                  </li>
                </ul>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 font-mono">
                Tài khoản: <b className="text-sky-300">user</b> • MK: <b className="text-sky-300">user123</b>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => handleQuickLogin('employee')}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-lg shadow-sky-600/25 group-hover:scale-[1.01]"
              >
                <User className="w-4 h-4" />
                <span>Đăng nhập quyền User</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Manual Login Form Dropdown / Accordion */}
        <div className="max-w-md mx-auto rounded-2xl bg-slate-900/60 border border-slate-800 p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Đăng nhập bằng tài khoản & mật khẩu
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIdentifier('admin');
                  setPassword('admin123');
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/80 hover:bg-indigo-900"
              >
                Điền Admin
              </button>
              <button
                type="button"
                onClick={() => {
                  setIdentifier('user');
                  setPassword('user123');
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800/80 hover:bg-sky-900"
              >
                Điền User
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Tên đăng nhập hoặc Email
              </label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="admin hoặc user"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 pr-9 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition border border-slate-700"
            >
              Xác Nhận Đăng Nhập
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-500">
          Hệ thống bảo mật cục bộ • Phiên đăng nhập được lưu tự động trên trình duyệt của bạn
        </div>
      </div>
    </div>
  );
};
