import React from 'react';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  Cpu, 
  Volume2, 
  VolumeX, 
  Settings,
  Sparkles
} from 'lucide-react';
import { FirebaseConnectionConfig } from '../types';

interface HeaderProps {
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
    <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Clean Brand & Title */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-500/20 shrink-0">
            <Activity className="w-5 h-5 animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight">
                Hệ Thống Theo Dõi Sức Khỏe & Tư Thế
              </h1>
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-950/80 text-sky-400 border border-sky-800/50">
                IoT Pi 4
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 font-medium">
              <span>Cảm biến MAX30102 & AI Camera</span>
              {lastUpdate && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400 font-mono text-[11px]">Cập nhật: {lastUpdate}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Right: Balanced Action Bar */}
        <div className="flex items-center gap-2">
          {/* Firebase Connection Pill */}
          <button
            onClick={onOpenFirebaseModal}
            title="Nhấp để xem hoặc chỉnh sửa cấu hình kết nối Firebase"
            className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold border transition-all ${
              isConnected
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/50'
                : 'bg-rose-950/40 text-rose-300 border-rose-800/60 hover:bg-rose-900/50'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="hidden sm:inline font-mono truncate max-w-[130px]">
                  {firebaseConfig.projectId || 'Firebase'}
                </span>
                <span className="sm:hidden">Online</span>
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
            <span className="hidden sm:inline">{isSimulating ? 'Đang giả lập' : 'Giả lập Pi 4'}</span>
          </button>

          {/* Raspberry Pi 4 Code Guide */}
          <button
            onClick={onOpenRpiGuideModal}
            title="Xem mã nguồn Python & hướng dẫn đấu dây Raspberry Pi 4"
            className="hidden md:flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-indigo-950/50 text-indigo-300 border border-indigo-800/60 hover:bg-indigo-900/60 transition shadow-sm"
          >
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>Code Pi 4</span>
          </button>

          {/* Alert Thresholds Settings */}
          <button
            onClick={onOpenSettingsModal}
            title="Cài đặt ngưỡng cảnh báo nhịp tim, SpO2 và thời gian"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-300 bg-slate-800/80 border border-slate-700/80 hover:bg-slate-700/80 hover:text-white transition"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Sound Alert Toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Tắt âm thanh cảnh báo' : 'Bật âm thanh cảnh báo'}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-300 bg-slate-800/80 border border-slate-700/80 hover:bg-slate-700/80 hover:text-white transition"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
