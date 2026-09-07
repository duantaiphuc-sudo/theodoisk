import React from 'react';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  Shield, 
  User, 
  Cpu, 
  Database, 
  Volume2, 
  VolumeX, 
  Settings,
  Sparkles,
  RefreshCw,
  LogOut
} from 'lucide-react';
import { UserRole, FirebaseConnectionConfig, AuthUser } from '../types';

interface HeaderProps {
  role: UserRole;
  setRole: (role: UserRole) => void;
  currentUser: AuthUser | null;
  onLogout: () => void;
  isConnected: boolean;
  isSimulating: boolean;
  toggleSimulation: () => void;
  firebaseConfig: FirebaseConnectionConfig;
  onOpenFirebaseModal: () => void;
  onOpenRpiGuideModal: () => void;
  onOpenSettingsModal: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  lastUpdate: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  role,
  setRole,
  currentUser,
  onLogout,
  isConnected,
  isSimulating,
  toggleSimulation,
  firebaseConfig,
  onOpenFirebaseModal,
  onOpenRpiGuideModal,
  onOpenSettingsModal,
  soundEnabled,
  toggleSound,
  lastUpdate,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left: Brand / Title */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-400 text-white shadow-lg shadow-sky-500/20">
            <Activity className="w-6 h-6 animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Hệ Thống Theo Dõi Sức Khỏe & Tư Thế
              </h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-950/80 text-sky-400 border border-sky-800/60">
                v2.5 IoT
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span>Raspberry Pi 4</span>
              <span className="text-slate-600">•</span>
              <span className="text-sky-400 font-mono">Firebase {firebaseConfig.projectId}</span>
              <span className="text-slate-600">•</span>
              <span>Phân quyền thông minh</span>
            </p>
          </div>
        </div>

        {/* Right: Actions & Status */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          {/* Connection Status Badge */}
          <button
            onClick={onOpenFirebaseModal}
            title="Nhấn để xem hoặc đổi cấu hình Firebase"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              isConnected
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/50'
                : 'bg-rose-950/40 text-rose-300 border-rose-800/60 hover:bg-rose-900/50'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="truncate max-w-[150px]">
                  Firebase: <span className="font-mono text-emerald-200">{firebaseConfig.projectId}</span>
                </span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                <span>Chờ Firebase / Giả lập</span>
              </>
            )}
          </button>

          {/* Test / Sim Toggle */}
          <button
            onClick={toggleSimulation}
            title="Bật/Tắt chế độ mô phỏng dữ liệu test từ Raspberry Pi 4"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              isSimulating
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10'
                : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isSimulating ? 'Đang giả lập Pi 4' : 'Giả lập Pi 4'}</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Tắt âm cảnh báo' : 'Bật âm cảnh báo'}
            className="p-2 rounded-lg text-slate-300 bg-slate-800/80 border border-slate-700 hover:bg-slate-700 transition"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* RPi 4 Guide Button */}
          <button
            onClick={onOpenRpiGuideModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/30 transition shadow-sm"
          >
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>Code Raspberry Pi 4</span>
          </button>

          {/* Settings Button (Only clickable or labeled for Admin) */}
          {role === 'manager' ? (
            <button
              onClick={onOpenSettingsModal}
              title="Cài đặt ngưỡng cảnh báo (Dành cho Quản trị viên)"
              className="p-2 rounded-lg text-slate-300 bg-slate-800/80 border border-slate-700 hover:bg-slate-700 transition"
            >
              <Settings className="w-4 h-4 text-slate-300" />
            </button>
          ) : (
            <button
              onClick={() => alert('Chỉ tài khoản Quản Trị Viên (Admin) mới có quyền tùy chỉnh ngưỡng đo và cấu hình hệ thống!')}
              title="Cài đặt hệ thống (Chỉ dành cho Admin)"
              className="p-2 rounded-lg text-slate-600 bg-slate-900 border border-slate-800 cursor-not-allowed opacity-60"
            >
              <Settings className="w-4 h-4 text-slate-600" />
            </button>
          )}

          {/* User Profile & Role Info */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                role === 'manager'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                  : 'bg-sky-600 text-white shadow-sm shadow-sky-500/20'
              }`}>
                {role === 'manager' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className="hidden xl:block text-left">
                <div className="text-xs font-bold text-slate-200 leading-tight truncate max-w-[130px]">
                  {currentUser?.fullName || (role === 'manager' ? 'Quản Trị Viên' : 'Nhân Viên')}
                </div>
                <div className={`text-[10px] font-semibold ${role === 'manager' ? 'text-indigo-400' : 'text-sky-400'}`}>
                  {role === 'manager' ? 'Admin • Toàn quyền' : 'User • Cá nhân'}
                </div>
              </div>
            </div>

            {/* Role switch toggle */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => setRole('employee')}
                title="Chuyển sang góc nhìn Nhân Viên"
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                  role === 'employee'
                    ? 'bg-sky-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>User</span>
              </button>
              <button
                onClick={() => setRole('manager')}
                title="Chuyển sang quyền Quản Trị Viên"
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                  role === 'manager'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Admin</span>
              </button>
            </div>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              title="Đăng xuất khỏi phiên làm việc"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-300 bg-rose-950/40 border border-rose-800/60 hover:bg-rose-900/50 hover:text-rose-200 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Thoát</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
