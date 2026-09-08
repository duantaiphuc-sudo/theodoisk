import React, { useState } from 'react';
import { 
  Shield, 
  User, 
  Activity, 
  Lock, 
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight
} from 'lucide-react';
import { AuthUser, UserRole } from '../types';
import { loginWithCredentials, loginAsPreset } from '../services/authService';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = loginWithCredentials(identifier, password);
    if (res.success && res.user) {
      onLoginSuccess(res.user);
    } else {
      setError(res.error || 'Tên đăng nhập hoặc mật khẩu không chính xác');
    }
  };

  const handleFillAccount = (role: UserRole) => {
    if (role === 'manager') {
      setIdentifier('admin');
      setPassword('admin123');
    } else {
      setIdentifier('user');
      setPassword('user123');
    }
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-3 sm:px-4 py-8 sm:py-16 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[260px] h-[260px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md mx-auto space-y-6 sm:space-y-7">
        {/* Header Branding */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-xl shadow-sky-500/20 mb-1">
            <Activity className="w-7 h-7 sm:w-8 sm:h-8 animate-pulse" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug">
            Hệ Thống Giám Sát Sức Khỏe & Tư Thế IoT
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xs sm:max-w-sm mx-auto leading-relaxed">
            Đồng bộ dữ liệu cảm biến <span className="text-sky-400 font-medium">MAX30102</span> & <span className="text-indigo-400 font-medium">Camera AI</span> qua Raspberry Pi 4
          </p>
        </div>

        {/* Login Form Card */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 sm:p-6 shadow-2xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-sky-400" />
              Đăng nhập tài khoản
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => handleFillAccount('manager')}
                className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition active:scale-95 ${
                  identifier === 'admin'
                    ? 'bg-indigo-950 text-indigo-300 border-indigo-700/80'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-300'
                }`}
              >
                Mẫu Admin
              </button>
              <button
                type="button"
                onClick={() => handleFillAccount('employee')}
                className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition active:scale-95 ${
                  identifier === 'user'
                    ? 'bg-sky-950 text-sky-300 border-sky-700/80'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-300'
                }`}
              >
                Mẫu User
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Tên đăng nhập hoặc Email
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="admin hoặc user"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-sky-500 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-sky-500 transition"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle Password Visibility"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white transition shadow-lg shadow-sky-600/20 active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <span>Đăng Nhập Vào Hệ Thống</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Preset hint footer */}
          <div className="pt-3.5 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 flex flex-col gap-0.5">
              <span className="text-indigo-400 font-semibold flex items-center gap-1">
                <Shield className="w-3 h-3" /> Admin
              </span>
              <span className="font-mono text-slate-300">admin / admin123</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 flex flex-col gap-0.5">
              <span className="text-sky-400 font-semibold flex items-center gap-1">
                <User className="w-3 h-3" /> User
              </span>
              <span className="font-mono text-slate-300">user / user123</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] sm:text-xs text-slate-500">
          Phiên đăng nhập được lưu tự động trên thiết bị của bạn
        </div>
      </div>
    </div>
  );
};
