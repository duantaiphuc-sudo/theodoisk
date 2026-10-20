import React, { useState } from 'react';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  Cpu, 
  Volume2, 
  VolumeX, 
  Settings,
  FlaskConical,
  Shield,
  User,
  Users,
  LogOut,
  Menu,
  X,
  RefreshCw,
  Info,
  CheckCircle2,
  Database,
  Key,
  Layers,
  Bell,
  CheckSquare,
  Clock,
  Unplug,
  Plug
} from 'lucide-react';
import { FirebaseConnectionConfig, AuthUser, UserTaskNotification, SupabaseConnectionConfig } from '../types';
import { updateTaskStatusInFirebase } from '../services/firebase';

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
  onOpenProfileModal?: () => void;
  onOpenUserManagementModal?: () => void;
  notifications?: UserTaskNotification[];
  onOpenTasksModal?: () => void;
  soundEnabled: boolean;
  voiceAlertEnabled?: boolean;
  toggleSound: () => void;
  lastUpdate: string | null;
  onOpenMobileMenu?: () => void;
  activeTabTitle?: string;
  supabaseConfig?: SupabaseConnectionConfig;
  onToggleSupabaseConnection?: () => void;
  onOpenSupabaseModal?: () => void;
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
  onOpenProfileModal,
  onOpenUserManagementModal,
  notifications = [],
  onOpenTasksModal,
  soundEnabled,
  voiceAlertEnabled,
  toggleSound,
  lastUpdate,
  onOpenMobileMenu,
  activeTabTitle,
  supabaseConfig,
  onToggleSupabaseConnection,
  onOpenSupabaseModal,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSystemInfoModal, setShowSystemInfoModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showConnectionInfoModal, setShowConnectionInfoModal] = useState(false);
  const [showNotificationsPopover, setShowNotificationsPopover] = useState(false);
  const [refreshToast, setRefreshToast] = useState(false);

  const isManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const userTasks = (notifications || []).filter(n => {
    if (!currentUser) return false;
    return n.targetUserId === 'all' || 
           n.targetUserId === currentUser.id || 
           n.targetUserId === currentUser.email ||
           n.targetUserId === currentUser.username;
  });
  const pendingUserTasksCount = userTasks.filter(t => t.status !== 'completed').length;

  const handleRefreshClick = () => {
    setRefreshToast(true);
    setTimeout(() => setRefreshToast(false), 2000);
  };

  const handleOpenProfile = () => {
    if (onOpenProfileModal) {
      onOpenProfileModal();
    } else {
      setShowProfileModal(true);
    }
  };

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-6 lg:px-8 py-2.5 transition-all shadow-xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Left: Brand & Title - Fixed never to clip or truncate words */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowSystemInfoModal(true)}
            className="flex items-center gap-2.5 sm:gap-3 group text-left cursor-pointer transition active:scale-95 shrink-0"
            title="Nhấp để xem Thông tin Hệ thống & Chẩn đoán"
          >
            <div className="relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-500/20 shrink-0 group-hover:rotate-6 transition-transform">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>

            <div className="shrink-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-sm sm:text-base lg:text-lg font-bold tracking-tight text-slate-900 leading-normal group-hover:text-sky-600 transition whitespace-nowrap">
                  <span>Hệ Thống Theo Dõi Sức Khỏe & Tư Thế</span>
                </h1>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 shrink-0 whitespace-nowrap">
                  Pi 4 IoT
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 flex items-center gap-1 mt-0.5 font-medium whitespace-nowrap">
                <span>MAX30102 & Camera</span>
              </p>
            </div>
          </button>
        </div>

        {/* Right: Desktop Action Bar (All buttons have strictly unified h-9 height, rounded-xl geometry, and balanced padding) */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {/* Refresh & Last Update Pill */}
          {lastUpdate && (
            <button
              onClick={handleRefreshClick}
              title="Nhấp để làm mới dữ liệu"
              className="flex items-center gap-2 h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-mono font-semibold border border-slate-200 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${refreshToast ? 'animate-spin text-sky-600' : 'text-slate-500'}`} />
              <span className="whitespace-nowrap">Làm mới: {lastUpdate}</span>
            </button>
          )}

          {/* Firebase Connection Pill */}
          <button
            onClick={onOpenFirebaseModal}
            title="Nhấp để cấu hình kết nối Firebase"
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isConnected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-mono truncate max-w-[100px] whitespace-nowrap">
                  {firebaseConfig.documentId || 'pi4_node_1'}
                </span>
                <span className="text-emerald-600 text-[10px]">●</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span className="whitespace-nowrap">Chờ kết nối</span>
              </>
            )}
          </button>



          {/* Simulation Toggle */}
          <button
            onClick={toggleSimulation}
            title="Bật/Tắt chế độ mô phỏng dữ liệu test từ cảm biến"
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isSimulating
                ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="whitespace-nowrap">{isSimulating ? 'Đang giả lập' : 'Giả lập Pi 4'}</span>
          </button>

          {/* Raspberry Pi 4 Code Guide */}
          {isManager ? (
            <button
              onClick={onOpenRpiGuideModal}
              title="Xem mã nguồn Python & hướng dẫn kết nối Raspberry Pi 4"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition shadow-xs cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="whitespace-nowrap">Code Pi 4</span>
            </button>
          ) : (
            <button
              onClick={() => setShowSystemInfoModal(true)}
              title="Xem sơ đồ & thông tin phần cứng"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition shadow-xs cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="whitespace-nowrap">Phần cứng Pi 4</span>
            </button>
          )}

          {/* Alert Thresholds Settings */}
          {isManager && (
            <button
              onClick={onOpenSettingsModal}
              title="Cài đặt ngưỡng cảnh báo BPM, SpO2 và thời gian"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <span className="whitespace-nowrap">Ngưỡng</span>
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
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition cursor-pointer"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-emerald-700 whitespace-nowrap">Bật loa</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-slate-500 whitespace-nowrap">Tắt loa</span>
              </>
            )}
          </button>

          {/* User Management Button for Admin */}
          {isManager && onOpenUserManagementModal && (
            <button
              onClick={onOpenUserManagementModal}
              title="Quản lý danh sách tài khoản đã đăng nhập trong hệ thống"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition cursor-pointer shadow-2xs whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>Quản lý tài khoản</span>
            </button>
          )}

          {/* Notifications Bell Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNotificationsPopover(!showNotificationsPopover)}
              title="Thông báo & Task công việc"
              className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition cursor-pointer ${
                pendingUserTasksCount > 0 
                  ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
            >
              <Bell className="w-4 h-4" />
              {pendingUserTasksCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center animate-pulse">
                  {pendingUserTasksCount > 9 ? '9+' : pendingUserTasksCount}
                </span>
              )}
            </button>

            {/* Notification Popover Dropdown */}
            {showNotificationsPopover && (
              <div 
                className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 p-4 animate-fadeIn"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-900">Nhiệm Vụ & Thông Báo ({userTasks.length})</span>
                  </div>
                  {isManager && onOpenUserManagementModal && (
                    <button
                      onClick={() => {
                        setShowNotificationsPopover(false);
                        onOpenUserManagementModal();
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      Quản lý / Giao việc
                    </button>
                  )}
                </div>

                {userTasks.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    Không có thông báo hoặc task nào cần xử lý.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-2 divide-y divide-slate-100">
                    {userTasks.slice(0, 6).map(t => {
                      const isCompleted = t.status === 'completed';
                      return (
                        <div key={t.id} className="pt-2 first:pt-0 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              t.priority === 'urgent' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {t.priority === 'urgent' ? 'Khẩn' : t.type === 'task' ? 'Task' : 'Nhắc nhở'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(t.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className={`text-xs font-bold ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {t.title}
                          </p>
                          <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                            {t.content}
                          </p>
                          <div className="flex items-center justify-between pt-1 text-[11px]">
                            <span className="text-slate-400">Từ: <b>{t.senderName}</b></span>
                            <button
                              onClick={async () => {
                                await updateTaskStatusInFirebase(firebaseConfig, t.id, isCompleted ? 'pending' : 'completed');
                              }}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition ${
                                isCompleted 
                                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' 
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              }`}
                            >
                              {isCompleted ? 'Mở lại' : '✓ Hoàn thành'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Profile & Role Indicator */}
          {currentUser && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <button
                onClick={handleOpenProfile}
                title="Nhấp để xem và cài đặt hồ sơ thể trạng, độ tuổi"
                className={`flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer hover:opacity-90 active:scale-95 ${
                  isManager 
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                    : 'bg-sky-50 text-sky-700 border-sky-200'
                }`}
              >
                {currentUser.avatar ? (
                  <img src={currentUser.avatar} alt="avatar" className="w-4 h-4 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                ) : isManager ? (
                  <Shield className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                ) : (
                  <User className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                )}
                <span className="truncate max-w-[110px] whitespace-nowrap">{currentUser.fullName || (isManager ? 'Admin' : 'Nhân Viên')}</span>
              </button>

              <button
                onClick={onLogout}
                title="Đăng xuất khỏi hệ thống"
                className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Mobile Compact Controls */}
        <div className="flex md:hidden items-center gap-1.5 shrink-0">
          {/* Mobile Role Badge (Clickable) */}
          {currentUser && (
            <button
              onClick={handleOpenProfile}
              title="Xem hồ sơ & thông tin thể trạng"
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap cursor-pointer active:scale-95 transition ${
                isManager 
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                  : 'bg-sky-50 text-sky-700 border-sky-200'
              }`}
            >
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt="avatar" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
              ) : isManager ? (
                <Shield className="w-3 h-3 text-indigo-600" />
              ) : (
                <User className="w-3 h-3 text-sky-600" />
              )}
              <span className="truncate max-w-[80px]">{currentUser.fullName || (isManager ? 'Admin' : 'Nhân Viên')}</span>
            </button>
          )}

          {/* Mobile Notifications Bell */}
          <button
            onClick={() => setShowNotificationsPopover(!showNotificationsPopover)}
            aria-label="Toggle Notifications"
            className={`relative flex items-center justify-center w-8 h-8 rounded-lg border active:scale-95 transition cursor-pointer shrink-0 ${
              pendingUserTasksCount > 0 
                ? 'bg-amber-50 text-amber-800 border-amber-300' 
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            {pendingUserTasksCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-600 text-white text-[9px] font-extrabold flex items-center justify-center animate-pulse">
                {pendingUserTasksCount > 9 ? '9+' : pendingUserTasksCount}
              </span>
            )}
          </button>

          {/* Mobile Sound Toggle */}
          <button
            onClick={toggleSound}
            aria-label="Toggle Sound"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-700 bg-slate-100 border border-slate-200 active:scale-95 transition cursor-pointer shrink-0"
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Open Mobile Menu"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-700 bg-slate-100 border border-slate-200 active:scale-95 transition cursor-pointer shrink-0"
          >
            {mobileMenuOpen ? <X className="w-3.5 h-3.5" /> : <Menu className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-3 pt-3 border-t border-slate-200 space-y-3 animate-fadeIn">
          {/* User Profile Card */}
          {currentUser && (
            <div 
              onClick={() => {
                setMobileMenuOpen(false);
                handleOpenProfile();
              }}
              className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isManager ? 'bg-indigo-100 text-indigo-700' : 'bg-sky-100 text-sky-700'
                }`}>
                  {isManager ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 leading-tight">{currentUser.fullName}</p>
                  <p className="text-[10px] text-slate-500">{currentUser.department || (isManager ? 'Quản trị viên (Admin)' : 'Nhân viên')}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-1 cursor-pointer"
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
                setMobileMenuOpen(false);
                if (isManager) {
                  onOpenFirebaseModal();
                } else {
                  setShowConnectionInfoModal(true);
                }
              }}
              className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border font-semibold cursor-pointer ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-rose-50 text-rose-800 border-rose-300'
              }`}
            >
              {isConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Online (Pi 4)</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-600" />
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
              className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border font-semibold cursor-pointer ${
                isSimulating
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5 text-amber-600" />
              <span>{isSimulating ? 'Tắt Giả Lập' : 'Bật Giả Lập'}</span>
            </button>

            {/* System Info */}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                setShowSystemInfoModal(true);
              }}
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-semibold cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-slate-500" />
              <span>Thông Tin Hệ Thống</span>
            </button>

            {/* Manager only buttons or Hardware for user */}
            {isManager ? (
              <>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenSettingsModal();
                  }}
                  className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-semibold cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  <span>Ngưỡng Cảnh Báo</span>
                </button>

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenRpiGuideModal();
                  }}
                  className="col-span-2 flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold cursor-pointer"
                >
                  <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Xem Mã Nguồn & Hướng Dẫn Pi 4</span>
                </button>

                {onOpenUserManagementModal && (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenUserManagementModal();
                    }}
                    className="col-span-2 flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Quản Lý Danh Sách Tài Khoản</span>
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleOpenProfile();
                }}
                className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 font-semibold cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-sky-600" />
                <span>Hồ Sơ Của Tôi</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: SYSTEM INFORMATION & DIAGNOSTICS */}
      {showSystemInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Thông Tin Hệ Thống & Chẩn Đoán</h3>
                  <p className="text-xs text-slate-500">Giám sát sức khỏe IoT & Thị giác máy tính Pi 4</p>
                </div>
              </div>
              <button
                onClick={() => setShowSystemInfoModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="grid grid-cols-2 gap-2.5 font-mono text-[11px]">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-slate-500 text-[10px]">Thiết bị trung tâm</p>
                  <p className="font-bold text-slate-900">Raspberry Pi 4 Model B</p>
                  <p className="text-emerald-600 font-semibold text-[10px]">● Đang trực tuyến</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-slate-500 text-[10px]">Cơ sở dữ liệu đám mây</p>
                  <p className="font-bold text-slate-900">{firebaseConfig.projectId || 'theodoisk-66ddb'}</p>
                  <p className="text-sky-600 font-semibold text-[10px]">Firestore Realtime Sync</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-slate-500 text-[10px]">Cảm biến nhịp tim & oxy</p>
                  <p className="font-bold text-slate-900">MAX30102 (I2C: 0x57)</p>
                  <p className="text-slate-600 text-[10px]">100 - 400Hz PPG</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-slate-500 text-[10px]">Thị giác máy tính & Tư thế</p>
                  <p className="font-bold text-slate-900">MediaPipe Pose (33 points)</p>
                  <p className="text-slate-600 text-[10px]">30 FPS Edge Processing</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-sky-600" /> Luồng truyền dữ liệu:
                </h4>
                <p className="text-slate-600 text-[11px]">
                  [Cảm biến MAX30102 & CSI Camera] → [Raspberry Pi 4 (Python / MediaPipe)] → [Firebase Firestore (devices/pi4_node_1)] → [Web Dashboard (React / Vite)].
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button
                onClick={() => setShowSystemInfoModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-xs cursor-pointer"
              >
                Đã Hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: USER PROFILE & PERMISSIONS */}
      {showProfileModal && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-md flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${isManager ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}`}>
                  {isManager ? <Shield className="w-6 h-6" /> : <User className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Hồ Sơ Người Dùng</h3>
                  <p className="text-xs text-slate-500">Thông tin tài khoản & quyền hạn hệ thống</p>
                </div>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="space-y-2">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Họ và tên:</span>
                  <span className="font-bold text-slate-900">{currentUser.fullName}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Tên đăng nhập:</span>
                  <span className="font-mono font-bold text-slate-900">{currentUser.username}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Vai trò:</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${isManager ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}`}>
                    {isManager ? 'Quản Trị Viên (Manager)' : 'Nhân Viên (Employee)'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Phòng ban:</span>
                  <span className="font-medium text-slate-800">{currentUser.department || 'Ban Quản Trị'}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <h5 className="font-bold text-slate-900 text-[11px]">Danh sách quyền hạn được cấp:</h5>
                <ul className="space-y-1 text-slate-600 text-[11px]">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Xem số đo nhịp tim & SpO2 thời gian thực</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Theo dõi tư thế 2D và nhận diện góc cúi gù</span>
                  </li>
                  {isManager && (
                    <>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Cài đặt ngưỡng cảnh báo & kết nối Firebase</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Xem mã nguồn Python & hướng dẫn đấu dây</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center">
              <button
                onClick={() => {
                  setShowProfileModal(false);
                  onLogout();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
              >
                Đăng Xuất
              </button>
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CONNECTION INFO FOR USER */}
      {showConnectionInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-md flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Trạng Thái Kết Nối Đám Mây</h3>
                  <p className="text-xs text-slate-500">Firebase Firestore Cloud Channel</p>
                </div>
              </div>
              <button
                onClick={() => setShowConnectionInfoModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs leading-relaxed text-slate-700">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Trạng thái:</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${isConnected ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-rose-50 text-rose-800 border border-rose-300'}`}>
                    {isConnected ? 'Đang kết nối trực tiếp' : 'Đang chờ luồng dữ liệu'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Firebase Project:</span>
                  <span className="font-mono font-bold text-slate-900">{firebaseConfig.projectId || 'theodoisk-66ddb'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Tài liệu lắng nghe:</span>
                  <span className="font-mono text-sky-700 font-bold">{firebaseConfig.collectionName}/{firebaseConfig.documentId}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button
                onClick={() => setShowConnectionInfoModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
