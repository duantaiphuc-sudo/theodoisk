import React from 'react';
import { 
  Menu, 
  Bell, 
  Volume2, 
  VolumeX, 
  FlaskConical, 
  Wifi, 
  WifiOff, 
  Radio, 
  User, 
  Shield, 
  LogOut,
  Calendar,
  Clock,
  Image as ImageIcon,
  Bot
} from 'lucide-react';
import { AuthUser, MainNavTab, SupabaseConnectionConfig } from '../types';

interface TopNavProps {
  activeTab: MainNavTab;
  onOpenMobileMenu: () => void;
  currentUser: AuthUser;
  isConnected: boolean;
  isSimulating: boolean;
  toggleSimulation: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  lastUpdate: string | null;
  pendingTasksCount: number;
  onOpenTasks: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
  onOpenWallpaper?: () => void;
  supabaseConfig?: SupabaseConnectionConfig;
  onToggleSupabaseConnection?: () => void;
  onOpenSupabaseModal?: () => void;
  onToggleChatbot?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onOpenMobileMenu,
  currentUser,
  isConnected,
  isSimulating,
  toggleSimulation,
  soundEnabled,
  toggleSound,
  lastUpdate,
  pendingTasksCount,
  onOpenTasks,
  onOpenProfile,
  onLogout,
  onOpenWallpaper,
  supabaseConfig,
  onToggleSupabaseConnection,
  onOpenSupabaseModal,
  onToggleChatbot
}) => {
  const isManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const tabTitles: Record<MainNavTab, { title: string; subtitle: string }> = {
    overview: {
      title: 'Trang chủ',
      subtitle: 'Giám sát chỉ số sinh trắc học & tư thế thời gian thực'
    },
    logs: {
      title: 'Nhật ký dữ liệu',
      subtitle: 'Lịch sử đo đạc, kiểm tra sự cố & trích xuất báo cáo CSV'
    },
    tasks: {
      title: 'Giao việc & Nhiệm vụ',
      subtitle: 'Danh sách nhắc nhở và thông báo tác vụ hệ thống'
    },
    ai_chat: {
      title: 'Trợ lý AI Gemini',
      subtitle: 'Tư vấn công thái học, chẩn đoán tư thế & hỏi đáp sức khỏe thông minh'
    },
    admin_overview: {
      title: 'Danh mục quản trị',
      subtitle: 'Giám sát tổng thể tài khoản & chỉ số sinh trắc học thời gian thực'
    }
  };

  const currentTabInfo = tabTitles[activeTab] || tabTitles.overview;

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-white/40 w-full transition-all shadow-xs">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Left: Mobile Drawer Trigger + Breadcrumb Title */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile hamburger button */}
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95"
            aria-label="Mở menu thanh điều hướng"
            title="Mở menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight truncate">
                {currentTabInfo.title}
              </h1>
              {isSimulating && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Mô phỏng
                </span>
              )}
            </div>
            <p className="text-xs text-slate-700 font-semibold truncate hidden sm:block">
              {currentTabInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Right: Quick Telemetry Status + Tools & User */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Real-time Status Badge */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs text-slate-600">
            {isConnected ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Trực tuyến</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                <span>Chờ kết nối</span>
              </span>
            )}
            {lastUpdate && (
              <span className="text-[11px] text-slate-400 font-mono hidden xl:inline">
                • {lastUpdate}
              </span>
            )}
          </div>

          {/* Quick Sound Toggle Button */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Tắt cảnh báo âm thanh' : 'Bật cảnh báo âm thanh'}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer border ${
              soundEnabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Quick Simulation Toggle */}
          <button
            onClick={toggleSimulation}
            title={isSimulating ? 'Dừng giả lập' : 'Bật giả lập thử nghiệm dữ liệu'}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer border ${
              isSimulating
                ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
            }`}
          >
            <FlaskConical className={`w-4 h-4 ${isSimulating ? 'text-amber-600' : ''}`} />
          </button>

          {/* Wallpaper Selector Button */}
          {onOpenWallpaper && (
            <button
              onClick={onOpenWallpaper}
              title="Đổi hình nền không gian (Glassmorphism)"
              className="w-9 h-9 rounded-xl bg-white/70 hover:bg-white border border-slate-200 text-teal-700 hover:text-teal-800 flex items-center justify-center transition cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          )}

          {/* Notifications Bell */}
          <button
            onClick={onOpenTasks}
            title="Xem thông báo nhiệm vụ"
            className="relative w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {pendingTasksCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                {pendingTasksCount > 9 ? '9+' : pendingTasksCount}
              </span>
            )}
          </button>

          {/* AI Assistant Quick Button */}
          {onToggleChatbot && (
            <button
              onClick={onToggleChatbot}
              title="Mở Cửa Sổ Trợ Lý AI"
              className="w-9 h-9 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 flex items-center justify-center transition cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
            >
              <Bot className="w-4 h-4 text-teal-600" />
            </button>
          )}

          {/* Divider */}
          <div className="h-6 w-px bg-slate-200 hidden sm:block mx-0.5" />

          {/* User Profile Quick Access */}
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 p-1 sm:pr-2.5 rounded-xl hover:bg-slate-100 transition cursor-pointer text-left"
            title="Hồ sơ tài khoản"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs overflow-hidden shrink-0">
              {currentUser.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt={currentUser.fullName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : isManager ? (
                <Shield className="w-4 h-4" />
              ) : (
                <User className="w-4 h-4" />
              )}
            </div>
            <div className="hidden sm:block min-w-0">
              <span className="text-xs font-bold text-slate-900 block truncate max-w-[110px] leading-tight">
                {currentUser.fullName}
              </span>
              <span className="text-[10px] text-slate-500 block truncate leading-tight">
                {isManager ? 'Quản trị viên' : 'Nhân viên'}
              </span>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
