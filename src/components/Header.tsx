import React, { useState } from 'react';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  Cpu, 
  Volume2, 
  VolumeX, 
  Settings,
  Sparkles,
  Shield,
  User,
  LogOut,
  Menu,
  X,
  ChevronDown
} from 'lucide-react';
import { FirebaseConnectionConfig, AuthUser } from '../types';

interface HeaderProps {
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
  voiceAlertEnabled?: boolean;
  toggleSound: () => void;
  lastUpdate: string | null;
}

export const Header: React.FC<HeaderProps> = ({
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
  voiceAlertEnabled,
  toggleSound,
  lastUpdate,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isManager = currentUser?.role === 'manager';

  return (
    <header className="border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand & Title */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-500/20 shrink-0">
            <Activity className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-sm sm:text-base lg:text-lg font-bold tracking-tight text-white leading-tight truncate">
                <span className="sm:hidden">Sức Khỏe & Tư Thế IoT</span>
                <span className="hidden sm:inline">Hệ Thống Theo Dõi Sức Khỏe & Tư Thế</span>
              </h1>
              <span className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-sky-950/80 text-sky-400 border border-sky-800/50 shrink-0">
                Pi 4 IoT
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 flex items-center gap-1 mt-0.5 font-medium truncate">
              <span className="truncate">MAX30102 & AI Camera</span>
              {lastUpdate && (
                <>
                  <span className="text-slate-600 shrink-0">•</span>
                  <span className="text-slate-400 font-mono text-[10px] sm:text-[11px] shrink-0">
                    {lastUpdate}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Right: Desktop Action Bar */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {/* Firebase Connection Pill */}
          <button
            onClick={isManager ? onOpenFirebaseModal : undefined}
            title={isManager ? "Nhấp để cấu hình Firebase Firestore" : "Trạng thái kết nối Firebase Firestore"}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold border transition-all ${
              isConnected
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/50'
                : 'bg-rose-950/40 text-rose-300 border-rose-800/60 hover:bg-rose-900/50'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-mono truncate max-w-[110px]">
                  {firebaseConfig.documentId || 'pi4_node_1'}
                </span>
                <span className="text-emerald-400 text-[10px]">●</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Chờ kết nối</span>
              </>
            )}
          </button>

          {/* Simulation Toggle */}
          <button
            onClick={toggleSimulation}
            title="Bật/Tắt chế độ mô phỏng dữ liệu test từ cảm biến"
            className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold border transition-all ${
              isSimulating
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/10'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-700/80 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{isSimulating ? 'Đang giả lập' : 'Giả lập Pi 4'}</span>
          </button>

          {/* Raspberry Pi 4 Code Guide (Manager only) */}
          {isManager && (
            <button
              onClick={onOpenRpiGuideModal}
              title="Xem mã nguồn Python & hướng dẫn kết nối Raspberry Pi 4"
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-indigo-950/50 text-indigo-300 border border-indigo-800/60 hover:bg-indigo-900/60 transition shadow-sm"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Code Pi 4</span>
            </button>
          )}

          {/* Alert Thresholds Settings (Manager only) */}
          {isManager && (
            <button
              onClick={onOpenSettingsModal}
              title="Cài đặt ngưỡng cảnh báo BPM, SpO2 và thời gian"
              className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-300 bg-slate-800/80 border border-slate-700/80 hover:bg-slate-700/80 hover:text-white transition"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* Sound Alert Toggle */}
          <button
            onClick={toggleSound}
            title={
              soundEnabled
                ? voiceAlertEnabled
                  ? 'Âm thanh chuông & Giọng nói tiếng Việt đang BẬT (Bấm để tắt)'
                  : 'Âm thanh chuông đang BẬT (Bấm để tắt)'
                : 'Âm thanh cảnh báo đang TẮT (Bấm để bật)'
            }
            className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-300 bg-slate-800/80 border border-slate-700/80 hover:bg-slate-700/80 hover:text-white transition"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* User Profile & Role Indicator */}
          {currentUser && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                isManager 
                  ? 'bg-indigo-950/60 text-indigo-300 border-indigo-700/60' 
                  : 'bg-sky-950/60 text-sky-300 border-sky-700/60'
              }`}>
                {isManager ? (
                  <Shield className="w-3.5 h-3.5 text-indigo-400" />
                ) : (
                  <User className="w-3.5 h-3.5 text-sky-400" />
                )}
                <span>{isManager ? 'Quản Lý' : 'Nhân Viên'}</span>
              </div>

              <button
                onClick={onLogout}
                title="Đăng xuất khỏi hệ thống"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 border border-slate-800 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Mobile Compact Controls */}
        <div className="flex md:hidden items-center gap-2 shrink-0">
          {/* Mobile Role Badge */}
          {currentUser && (
            <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${
              isManager 
                ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60' 
                : 'bg-sky-950/80 text-sky-300 border-sky-700/60'
            }`}>
              {isManager ? (
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
              ) : (
                <User className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span>{isManager ? 'Quản Lý' : 'User'}</span>
            </div>
          )}

          {/* Mobile Sound Toggle */}
          <button
            onClick={toggleSound}
            aria-label="Toggle Sound"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-300 bg-slate-800/80 border border-slate-700/80 active:scale-95 transition"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Open Mobile Menu"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-200 bg-slate-800 border border-slate-700 active:scale-95 transition"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-3 pt-3 border-t border-slate-800 space-y-3 animate-fadeIn">
          {/* User Profile Card */}
          {currentUser && (
            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isManager ? 'bg-indigo-600/30 text-indigo-300' : 'bg-sky-600/30 text-sky-300'
                }`}>
                  {isManager ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-white leading-tight">{currentUser.fullName}</p>
                  <p className="text-[10px] text-slate-400">{currentUser.department || (isManager ? 'Quản trị viên' : 'Nhân viên')}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-950/60 border border-rose-800/80 text-rose-300 flex items-center gap-1"
              >
                <LogOut className="w-3 h-3" />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}

          {/* Quick Actions Grid on Mobile */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Connection Status Pill */}
            <button
              onClick={() => {
                if (isManager) {
                  setMobileMenuOpen(false);
                  onOpenFirebaseModal();
                }
              }}
              className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border font-semibold ${
                isConnected
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                  : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
              }`}
            >
              {isConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Online (Pi 4)</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>Chờ kết nối</span>
                </>
              )}
            </button>

            {/* Simulation Toggle */}
            <button
              onClick={() => {
                toggleSimulation();
                setMobileMenuOpen(false);
              }}
              className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border font-semibold ${
                isSimulating
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isSimulating ? 'Tắt Giả Lập' : 'Bật Giả Lập'}</span>
            </button>

            {/* Manager only buttons */}
            {isManager && (
              <>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenSettingsModal();
                  }}
                  className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 font-semibold"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <span>Ngưỡng Cảnh Báo</span>
                </button>

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenRpiGuideModal();
                  }}
                  className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-indigo-950/40 text-indigo-300 border border-indigo-800/60 font-semibold"
                >
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Hướng Dẫn Pi 4</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

