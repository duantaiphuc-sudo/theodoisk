import React, { useState } from 'react';
import {
  LayoutDashboard,
  Target,
  FileText,
  Bell,
  Users,
  Settings,
  Cpu,
  Activity,
  Wifi,
  WifiOff,
  Sparkles,
  LogOut,
  User,
  Shield,
  Volume2,
  VolumeX,
  X,
  Database,
  BookOpen,
  Sliders,
  Wrench,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { AuthUser, MainNavTab } from '../types';

interface SidebarProps {
  activeTab: MainNavTab;
  setActiveTab: (tab: MainNavTab) => void;
  currentUser: AuthUser | null;
  isManager: boolean;
  pendingTasksCount: number;
  totalLogsCount: number;
  isConnected: boolean;
  isSimulating: boolean;
  toggleSimulation: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  onOpenUserManagement: () => void;
  onOpenSettings: () => void;
  onOpenRpiGuide: () => void;
  onOpenFirebase: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenMobile?: () => void;
  isCollapsed?: boolean;
  setIsCollapsed?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  isManager,
  pendingTasksCount,
  totalLogsCount,
  isConnected,
  isSimulating,
  toggleSimulation,
  soundEnabled,
  toggleSound,
  onOpenUserManagement,
  onOpenSettings,
  onOpenRpiGuide,
  onOpenFirebase,
  onOpenProfile,
  onLogout,
  mobileOpen,
  onCloseMobile,
  onOpenMobile,
  isCollapsed = false,
  setIsCollapsed
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const collapsed = !!isCollapsed;
  // On mobile drawer, always expanded. On desktop, expanded if not collapsed OR if hovered
  const isExpanded = mobileOpen || !collapsed || isHovered;

  const handleLogoClick = () => {
    setActiveTab('overview');
    if (setIsCollapsed) {
      if (!collapsed) {
        setIsCollapsed(true);
      } else {
        if (activeTab === 'overview') {
          setIsCollapsed(false);
        } else {
          setIsCollapsed(true);
        }
      }
    }
    onCloseMobile();
  };

  const navItems = [
    {
      id: 'overview' as MainNavTab,
      label: 'Trang chủ',
      icon: LayoutDashboard,
      badge: null
    },
    ...(isManager ? [
      {
        id: 'admin_overview' as MainNavTab,
        label: 'Danh mục quản trị',
        icon: Shield,
        badge: 'Admin',
        badgeColor: 'bg-indigo-100 text-indigo-700 font-bold'
      }
    ] : []),
    {
      id: 'zone' as MainNavTab,
      label: 'Chỉnh vùng',
      icon: Target,
      badge: 'Cảm biến'
    },
    {
      id: 'logs' as MainNavTab,
      label: 'Nhật ký dữ liệu',
      icon: FileText,
      badge: totalLogsCount > 0 ? String(totalLogsCount) : null
    },
    {
      id: 'tasks' as MainNavTab,
      label: 'Giao việc & Task',
      icon: Bell,
      badge: pendingTasksCount > 0 ? `${pendingTasksCount} chờ` : null,
      badgeColor: pendingTasksCount > 0 ? 'bg-amber-100 text-amber-800' : undefined
    }
  ];

  return (
    <>
      {/* Mobile edge pull handle when sidebar is closed */}
      {!mobileOpen && onOpenMobile && (
        <button
          onClick={onOpenMobile}
          className="fixed top-1/2 -translate-y-1/2 left-0 z-30 lg:hidden py-3 px-1 rounded-r-xl bg-white/95 border-y border-r border-slate-300 shadow-md flex flex-col items-center gap-1 cursor-pointer hover:bg-slate-50 transition active:scale-95"
          title="Ấn cạnh bên để mở menu"
          aria-label="Ấn cạnh bên để mở menu"
        >
          <span className="w-1 h-4 bg-sky-500 rounded-full"></span>
          <span className="text-[9px] font-bold text-slate-700 [writing-mode:vertical-rl] rotate-180 tracking-widest uppercase">
            Menu
          </span>
        </button>
      )}

      {/* Mobile Backdrop overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Vertical Sidebar: Fixed on the left on desktop (collapsible to mini logo format), slide-in drawer on mobile */}
      <aside
        id="sidebar"
        onMouseEnter={() => {
          if (collapsed) setIsHovered(true);
        }}
        onMouseLeave={() => {
          if (collapsed) setIsHovered(false);
        }}
        className={`fixed top-0 bottom-0 left-0 z-40 h-screen bg-white border-r border-slate-200/90 flex flex-col justify-between transition-all duration-300 ease-in-out ${
          mobileOpen
            ? 'translate-x-0 w-64 shadow-2xl'
            : '-translate-x-full lg:translate-x-0 ' +
              (collapsed
                ? isHovered
                  ? 'lg:w-64 lg:shadow-2xl z-50'
                  : 'lg:w-[72px] z-40'
                : 'lg:w-64')
        }`}
      >
        {/* Top: Brand Header */}
        <div
          className={`border-b border-slate-100 flex items-center transition-all duration-300 ${
            isExpanded ? 'p-4 sm:p-5 justify-between' : 'p-3 justify-center'
          }`}
        >
          <button
            onClick={handleLogoClick}
            className="flex items-center gap-3 text-left group cursor-pointer min-w-0"
            title={collapsed ? "Nhấn để về Trang chủ & Mở rộng menu" : "Nhấn để về Trang chủ & Thu gọn menu dạng logo"}
            aria-label="Về Trang chủ và chuyển trạng thái menu"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-sky-500/20 shrink-0 group-hover:scale-105 transition-transform">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>

            {isExpanded && (
              <div className="min-w-0 transition-opacity duration-200">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base tracking-tight text-slate-900 leading-tight truncate">
                    Health IoT
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                    Pi 4
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate font-medium mt-0.5">
                  Theo Dõi Sức Khỏe & Tư Thế
                </p>
              </div>
            )}
          </button>

          {/* Close button on mobile / Pin button on desktop */}
          {isExpanded && (
            <div className="flex items-center gap-1">
              {/* Desktop pin toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (setIsCollapsed) setIsCollapsed(prev => !prev);
                }}
                className="hidden lg:flex w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 items-center justify-center transition cursor-pointer"
                title={collapsed ? "Ghim mở rộng menu" : "Thu gọn menu dạng logo"}
              >
                {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>

              {/* Close button on mobile */}
              <button
                onClick={onCloseMobile}
                className="lg:hidden w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center transition cursor-pointer"
                title="Đóng menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Middle: Navigation Items */}
        <div
          className={`flex-1 overflow-y-auto space-y-1.5 transition-all duration-300 ${
            isExpanded ? 'px-3 py-4' : 'px-2 py-3'
          }`}
        >
          {isExpanded ? (
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Menu Chính
            </div>
          ) : (
            <div className="w-6 h-0.5 bg-slate-200 rounded-full mx-auto my-1" />
          )}

          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  onCloseMobile();
                }}
                title={!isExpanded ? item.label : undefined}
                className={`w-full flex items-center transition-all cursor-pointer relative group ${
                  isExpanded
                    ? `justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    : `justify-center w-11 h-11 mx-auto rounded-xl ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                }`}
              >
                <div className={`flex items-center gap-3 ${!isExpanded ? 'justify-center' : 'min-w-0'}`}>
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  {isExpanded && <span className="whitespace-nowrap truncate">{item.label}</span>}
                </div>

                {isExpanded && item.badge && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold whitespace-nowrap ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : item.badgeColor || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {!isExpanded && item.badge && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
                )}
              </button>
            );
          })}

          {/* Quick controls section */}
          <div className="pt-3 mt-2 border-t border-slate-100 space-y-1">
            {isExpanded ? (
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Công Cụ Nhanh
              </div>
            ) : (
              <div className="w-6 h-0.5 bg-slate-200 rounded-full mx-auto my-1" />
            )}

            {/* Sound Toggle */}
            <button
              onClick={toggleSound}
              title={soundEnabled ? "Cảnh báo âm thanh: BẬT" : "Cảnh báo âm thanh: TẮT"}
              className={`w-full flex items-center transition cursor-pointer ${
                isExpanded
                  ? 'justify-between px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'justify-center w-11 h-11 mx-auto rounded-xl hover:bg-slate-100 text-slate-600 relative'
              }`}
            >
              <div className={`flex items-center gap-2.5 ${!isExpanded ? 'justify-center' : ''}`}>
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                {isExpanded && <span>Cảnh báo âm thanh</span>}
              </div>
              {isExpanded ? (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    soundEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {soundEnabled ? 'BẬT' : 'TẮT'}
                </span>
              ) : (
                <span
                  className={`absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full ${
                    soundEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                />
              )}
            </button>

            {/* Simulation Toggle */}
            <button
              onClick={toggleSimulation}
              title={isSimulating ? "Chế độ giả lập: Đang chạy" : "Chế độ giả lập: TẮT"}
              className={`w-full flex items-center transition cursor-pointer ${
                isExpanded
                  ? `justify-between px-3.5 py-2 rounded-xl text-xs font-semibold ${
                      isSimulating
                        ? 'bg-amber-50 text-amber-900 border border-amber-200'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  : `justify-center w-11 h-11 mx-auto rounded-xl relative ${
                      isSimulating ? 'bg-amber-100 text-amber-900' : 'hover:bg-slate-100 text-slate-600'
                    }`
              }`}
            >
              <div className={`flex items-center gap-2.5 ${!isExpanded ? 'justify-center' : ''}`}>
                <Sparkles className={`w-4 h-4 shrink-0 ${isSimulating ? 'text-amber-600' : 'text-slate-400'}`} />
                {isExpanded && <span>Chế độ giả lập</span>}
              </div>
              {isExpanded ? (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isSimulating ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isSimulating ? 'Đang chạy' : 'TẮT'}
                </span>
              ) : (
                <span
                  className={`absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full ${
                    isSimulating ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'
                  }`}
                />
              )}
            </button>
          </div>

          {/* Admin Tools Section with CSS class footer-links */}
          <div className="footer-links pt-3 mt-2 border-t border-slate-200/80 space-y-1">
            {isExpanded ? (
              <div className="px-3 pb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-slate-400" />
                  Công cụ quản trị
                </span>
                {isManager && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 uppercase">
                    Admin
                  </span>
                )}
              </div>
            ) : (
              <div className="w-6 h-0.5 bg-slate-200 rounded-full mx-auto my-1" />
            )}

            {/* Admin Links */}
            <div className="space-y-1">
              {/* 1. Firebase Configuration */}
              <button
                onClick={() => {
                  if (isManager) {
                    onOpenFirebase();
                    onCloseMobile();
                  }
                }}
                disabled={!isManager}
                className={`w-full flex items-center transition text-left group ${
                  isExpanded
                    ? `justify-between px-3 py-2 rounded-xl text-xs font-semibold ${
                        isManager
                          ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer'
                          : 'text-slate-400 cursor-not-allowed opacity-60'
                      }`
                    : `justify-center w-11 h-11 mx-auto rounded-xl ${
                        isManager ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-not-allowed opacity-60'
                      }`
                }`}
                title={isManager ? "Cấu hình kết nối Firebase Firestore" : "Chức năng dành cho Quản trị viên"}
              >
                <div className={`flex items-center gap-2.5 ${!isExpanded ? 'justify-center' : 'min-w-0'}`}>
                  <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 border border-amber-200/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <Database className="w-3.5 h-3.5" />
                  </div>
                  {isExpanded && <span className="truncate whitespace-nowrap">Cấu hình Firebase</span>}
                </div>
                {isExpanded && <span className="text-[10px] text-slate-400 font-mono shrink-0">DB</span>}
              </button>

              {/* 2. Raspberry Pi 4 Guide & Code */}
              <button
                onClick={() => {
                  if (isManager) {
                    onOpenRpiGuide();
                    onCloseMobile();
                  }
                }}
                disabled={!isManager}
                className={`w-full flex items-center transition text-left group ${
                  isExpanded
                    ? `justify-between px-3 py-2 rounded-xl text-xs font-semibold ${
                        isManager
                          ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer'
                          : 'text-slate-400 cursor-not-allowed opacity-60'
                      }`
                    : `justify-center w-11 h-11 mx-auto rounded-xl ${
                        isManager ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-not-allowed opacity-60'
                      }`
                }`}
                title={isManager ? "Mã nguồn Python & sơ đồ đấu nối Raspberry Pi 4" : "Chức năng dành cho Quản trị viên"}
              >
                <div className={`flex items-center gap-2.5 ${!isExpanded ? 'justify-center' : 'min-w-0'}`}>
                  <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <BookOpen className="w-3.5 h-3.5" />
                  </div>
                  {isExpanded && <span className="truncate whitespace-nowrap">Hướng dẫn Pi 4</span>}
                </div>
                {isExpanded && <span className="text-[10px] text-slate-400 font-mono shrink-0">Docs</span>}
              </button>

              {/* 3. Measurement Threshold Settings */}
              <button
                onClick={() => {
                  if (isManager) {
                    onOpenSettings();
                    onCloseMobile();
                  }
                }}
                disabled={!isManager}
                className={`w-full flex items-center transition text-left group ${
                  isExpanded
                    ? `justify-between px-3 py-2 rounded-xl text-xs font-semibold ${
                        isManager
                          ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer'
                          : 'text-slate-400 cursor-not-allowed opacity-60'
                      }`
                    : `justify-center w-11 h-11 mx-auto rounded-xl ${
                        isManager ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-not-allowed opacity-60'
                      }`
                }`}
                title={isManager ? "Cài đặt ngưỡng cảnh báo nhịp tim & SpO2" : "Chức năng dành cho Quản trị viên"}
              >
                <div className={`flex items-center gap-2.5 ${!isExpanded ? 'justify-center' : 'min-w-0'}`}>
                  <div className="w-6 h-6 rounded-lg bg-sky-50 text-sky-600 border border-sky-200/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <Sliders className="w-3.5 h-3.5" />
                  </div>
                  {isExpanded && <span className="truncate whitespace-nowrap">Cài đặt ngưỡng đo</span>}
                </div>
                {isExpanded && <span className="text-[10px] text-slate-400 font-mono shrink-0">BPM/SpO₂</span>}
              </button>

              {/* 4. User & Role Management */}
              {isManager && (
                <button
                  onClick={() => {
                    onOpenUserManagement();
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center transition text-left group ${
                    isExpanded
                      ? 'justify-between px-3 py-2 rounded-xl text-xs font-semibold text-indigo-700 hover:bg-indigo-50/90 cursor-pointer'
                      : 'justify-center w-11 h-11 mx-auto rounded-xl hover:bg-indigo-50/90 cursor-pointer'
                  }`}
                  title="Quản lý danh sách tài khoản & phân quyền hệ thống"
                >
                  <div className={`flex items-center gap-2.5 ${!isExpanded ? 'justify-center' : 'min-w-0'}`}>
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    {isExpanded && <span className="truncate whitespace-nowrap">Quản lý tài khoản</span>}
                  </div>
                  {isExpanded && <span className="text-[10px] text-indigo-500 font-mono shrink-0">Users</span>}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom: Connection Status & Current User Card */}
        <div
          className={`border-t border-slate-200/90 bg-slate-50/60 transition-all duration-300 ${
            isExpanded ? 'p-3 space-y-2.5' : 'p-2 space-y-2 flex flex-col items-center'
          }`}
        >
          {/* Live Connection Pill */}
          {isExpanded ? (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white border border-slate-200/80 text-xs">
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="font-semibold text-slate-700 text-[11px]">Firebase IoT</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                    <span className="font-semibold text-rose-700 text-[11px]">Chưa kết nối</span>
                  </>
                )}
              </div>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                  isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {isConnected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
          ) : (
            <div
              title={isConnected ? "Firebase IoT: Trực tuyến (LIVE)" : "Firebase IoT: Chưa kết nối (OFFLINE)"}
              className="w-10 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center cursor-help"
            >
              {isConnected ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-rose-500" />
              )}
            </div>
          )}

          {/* User Account Card */}
          {currentUser && (
            isExpanded ? (
              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <button
                  onClick={onOpenProfile}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left hover:opacity-80 transition cursor-pointer"
                  title="Nhấp để xem hồ sơ"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center font-bold text-slate-700 text-xs">
                    {currentUser.avatar ? (
                      <img
                        src={currentUser.avatar}
                        alt={currentUser.fullName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : isManager ? (
                      <Shield className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <User className="w-4 h-4 text-sky-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-slate-900 truncate block">
                      {currentUser.fullName}
                    </span>
                    <span className="text-[10px] text-slate-500 block truncate font-medium">
                      {isManager ? 'Quản trị viên' : 'Nhân viên'}
                    </span>
                  </div>
                </button>

                <button
                  onClick={onLogout}
                  title="Đăng xuất"
                  className="w-7 h-7 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 w-full">
                <button
                  onClick={onOpenProfile}
                  className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs hover:ring-2 hover:ring-sky-500 transition cursor-pointer"
                  title={`Tài khoản: ${currentUser.fullName} (${isManager ? 'Quản trị viên' : 'Nhân viên'})`}
                >
                  {currentUser.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt={currentUser.fullName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : isManager ? (
                    <Shield className="w-4 h-4 text-indigo-600" />
                  ) : (
                    <User className="w-4 h-4 text-sky-600" />
                  )}
                </button>
                <button
                  onClick={onLogout}
                  title="Đăng xuất"
                  className="w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          )}
        </div>
      </aside>
    </>
  );
};

