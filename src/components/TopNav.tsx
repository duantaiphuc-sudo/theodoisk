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
    ai_predict: {
      title: 'AI Dự đoán Sức khỏe',
      subtitle: 'Dự báo rủi ro 2 giờ tới, sinh hiệu theo giờ & tối ưu ngưỡng Pi 4'
    },
    admin_overview: {
      title: 'Danh mục quản trị',
      subtitle: 'Giám sát tổng thể tài khoản & chỉ số sinh trắc học thời gian thực'
    }
  };

  const currentTabInfo = tabTitles[activeTab] || tabTitles.overview;

  return (
    <header className="sticky top-0 z-30 glass-panel border-b-2 border-slate-800 w-full transition-all">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Left: Mobile Drawer Trigger + Breadcrumb Title */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile hamburger button */}
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden w-10 h-10 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer shrink-0"
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
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#FDE68A] text-slate-900 border-[1.5px] border-slate-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                  Mô phỏng
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 font-medium truncate hidden sm:block">
              {currentTabInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Right: Quick Telemetry Status + Tools & User */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Real-time Status Badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl glass-subcard text-xs text-slate-700 font-bold">
            {isConnected ? (
              <span className="flex items-center gap-1.5 text-[#16B364] font-extrabold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16B364] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16B364]"></span>
                </span>
                <span>Trực tuyến</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-600 font-semibold">
                <WifiOff className="w-3.5 h-3.5 text-slate-500" />
                <span>Chờ kết nối</span>
              </span>
            )}
            {lastUpdate && (
              <span className="text-[11px] text-slate-500 font-mono hidden xl:inline">
                • {lastUpdate}
              </span>
            )}
          </div>

          {/* Quick Sound Toggle Button */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Tắt cảnh báo âm thanh' : 'Bật cảnh báo âm thanh'}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer border-2 border-slate-800 shadow-[0_2px_0_#1E293B] active:translate-y-[1px] ${
              soundEnabled
                ? 'bg-[#B2F5BE] text-slate-900 hover:bg-[#9eeea9]'
                : 'bg-white text-slate-500 hover:bg-slate-100'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Quick Simulation Toggle */}
          <button
            onClick={toggleSimulation}
            title={isSimulating ? 'Dừng giả lập' : 'Bật giả lập thử nghiệm dữ liệu'}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer border-2 border-slate-800 shadow-[0_2px_0_#1E293B] active:translate-y-[1px] ${
              isSimulating
                ? 'bg-[#FDE68A] text-slate-900 hover:bg-[#fcd34d]'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FlaskConical className="w-4 h-4" />
          </button>

          {/* Theme & Wallpaper Selector Button */}
          {onOpenWallpaper && (
            <button
              onClick={onOpenWallpaper}
              title="Chuyển Sáng/Tối & Hình Nền Dashboard"
              className="w-9 h-9 rounded-xl bg-[#BAE0EC] hover:bg-[#a6d5e4] border-2 border-slate-800 shadow-[0_2px_0_#1E293B] text-slate-900 flex items-center justify-center transition cursor-pointer active:translate-y-[1px]"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          )}

          {/* Notifications Bell */}
          <button
            onClick={onOpenTasks}
            title="Xem thông báo nhiệm vụ"
            className="relative w-9 h-9 rounded-xl bg-white hover:bg-[#FAF7F0] border-2 border-slate-800 shadow-[0_2px_0_#1E293B] text-slate-900 flex items-center justify-center transition cursor-pointer active:translate-y-[1px]"
          >
            <Bell className="w-4 h-4" />
            {pendingTasksCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FBC2C8] border-[1.5px] border-slate-900 text-slate-900 text-[10px] font-black flex items-center justify-center">
                {pendingTasksCount > 9 ? '9+' : pendingTasksCount}
              </span>
            )}
          </button>

          {/* AI Assistant Quick Button */}
          {onToggleChatbot && (
            <button
              onClick={onToggleChatbot}
              title="Mở Cửa Sổ Trợ Lý AI"
              className="w-9 h-9 rounded-xl tactile-btn-primary flex items-center justify-center cursor-pointer"
            >
              <Bot className="w-4 h-4 text-white" />
            </button>
          )}

          {/* Divider */}
          <div className="h-6 w-0.5 bg-slate-800/20 hidden sm:block mx-0.5" />

          {/* User Profile Quick Access */}
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 p-1 sm:pr-2.5 rounded-xl hover:bg-[#FAF7F0] border-2 border-transparent hover:border-slate-800 transition cursor-pointer text-left"
            title="Hồ sơ tài khoản"
          >
            <div className="w-8 h-8 rounded-full bg-[#B2F5BE] border-2 border-slate-800 text-slate-900 flex items-center justify-center font-extrabold text-xs overflow-hidden shrink-0">
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
              <span className="text-xs font-extrabold text-slate-900 block truncate max-w-[110px] leading-tight">
                {currentUser.fullName}
              </span>
              <span className="text-[10px] text-slate-600 font-semibold block truncate leading-tight">
                {isManager ? 'Quản trị viên' : 'Nhân viên'}
              </span>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
