import React, { useState } from 'react';
import { UserTaskNotification, AuthUser, FirebaseConnectionConfig } from '../types';
import { 
  Bell, 
  CheckSquare, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  X, 
  ChevronRight,
  User,
  ExternalLink
} from 'lucide-react';
import { updateTaskStatusInFirebase } from '../services/firebase';

interface UserTaskAlertBannerProps {
  notifications: UserTaskNotification[];
  currentUser: AuthUser;
  firebaseConfig: FirebaseConnectionConfig;
}

export const UserTaskAlertBanner: React.FC<UserTaskAlertBannerProps> = ({
  notifications,
  currentUser,
  firebaseConfig,
}) => {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // Filter tasks targeted for current user that are not yet marked completed and not dismissed in current view
  // CRITICAL: Personal tasks (tự tạo cv mỗi cá nhân) KHÔNG hiển thị banner giao việc từ Admin!
  const activeAlerts = notifications.filter(n => {
    // Nếu là task cá nhân tự tạo (isPersonal) hoặc chính user tự giao cho mình thì không hiện popup alert
    if (n.isPersonal || (n.senderId && n.senderId === currentUser.id)) return false;
    const isTarget = n.targetUserId === 'all' || 
                     n.targetUserId === currentUser.id || 
                     n.targetUserId === currentUser.email ||
                     n.targetUserId === currentUser.username;
    const isPending = n.status !== 'completed';
    const isNotDismissed = !dismissedIds.has(n.id);
    return isTarget && isPending && isNotDismissed;
  });

  if (activeAlerts.length === 0) return null;

  // Show the most recent urgent/high priority alert first
  const currentAlert = activeAlerts.sort((a, b) => {
    const pWeight = { urgent: 3, high: 2, normal: 1 };
    const diff = (pWeight[b.priority] || 1) - (pWeight[a.priority] || 1);
    if (diff !== 0) return diff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  })[0];

  const handleAcknowledge = async (taskId: string) => {
    setIsUpdating(taskId);
    try {
      await updateTaskStatusInFirebase(firebaseConfig, taskId, 'acknowledged');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleComplete = async (taskId: string) => {
    setIsUpdating(taskId);
    try {
      await updateTaskStatusInFirebase(firebaseConfig, taskId, 'completed');
      setDismissedIds(prev => new Set(prev).add(taskId));
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDismiss = (taskId: string) => {
    setDismissedIds(prev => new Set(prev).add(taskId));
  };

  const isUrgent = currentAlert.priority === 'urgent';
  const isHigh = currentAlert.priority === 'high';

  return (
    <aside 
      aria-label="Thông báo nhiệm vụ từ quản trị viên"
      className="fixed bottom-5 right-4 sm:right-6 z-50 max-w-md w-[calc(100vw-2rem)] animate-slideUp"
    >
      <div className="rounded-2xl border-2 border-slate-800 shadow-[0_6px_0_#1E293B] overflow-hidden bg-white text-slate-900 transition-all">
        {/* Top Priority Header */}
        <div className={`px-4 py-3 flex items-center justify-between border-b-2 border-slate-800 ${
          isUrgent 
            ? 'bg-[#FBC2C8] text-slate-900' 
            : isHigh 
            ? 'bg-[#FDE68A] text-slate-900' 
            : 'bg-[#BAE0EC] text-slate-900'
        }`}>
          <div className="flex items-center gap-2">
            {isUrgent ? (
              <AlertTriangle className="w-4 h-4 animate-bounce text-slate-900" />
            ) : (
              <Bell className="w-4 h-4 text-slate-900" />
            )}
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
              {currentAlert.type === 'task' 
                ? 'Giao việc mới từ Quản trị viên' 
                : currentAlert.type === 'health_alert' 
                ? 'Nhắc nhở sức khỏe & tư thế' 
                : 'Thông báo từ hệ thống'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {activeAlerts.length > 1 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white border-[1.5px] border-slate-800 text-slate-900">
                +{activeAlerts.length - 1} khác
              </span>
            )}
            <button
              onClick={() => handleDismiss(currentAlert.id)}
              className="p-1 rounded-lg bg-white/90 hover:bg-white text-slate-900 border-[1.5px] border-slate-800 transition cursor-pointer"
              title="Đóng thông báo này"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3 bg-white">
          <div>
            <h4 className="text-sm font-extrabold text-slate-900 leading-snug">
              {currentAlert.title}
            </h4>
            <p className="text-xs text-slate-700 mt-1.5 leading-relaxed whitespace-pre-wrap">
              {currentAlert.content}
            </p>
          </div>

          {/* Meta Information */}
          <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px] text-slate-600 border-t border-slate-200">
            <div className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Gửi bởi: <b className="text-slate-900">{currentAlert.senderName}</b></span>
            </div>

            {currentAlert.deadline && (
              <div className="flex items-center gap-1 font-bold text-slate-900 bg-[#FDE68A] border-[1.5px] border-slate-800 px-2 py-0.5 rounded-md">
                <Clock className="w-3 h-3" />
                <span>Hạn chót: {currentAlert.deadline}</span>
              </div>
            )}

            <div className="ml-auto text-[10px] font-mono font-semibold text-slate-600">
              {new Date(currentAlert.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 pt-1">
            {currentAlert.status === 'pending' && (
              <button
                onClick={() => handleAcknowledge(currentAlert.id)}
                disabled={isUpdating === currentAlert.id}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold tactile-btn-secondary flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Đã nhận việc</span>
              </button>
            )}

            <button
              onClick={() => handleComplete(currentAlert.id)}
              disabled={isUpdating === currentAlert.id}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold tactile-btn-primary flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Hoàn thành Task</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
