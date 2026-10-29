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
      <div className={`rounded-2xl border shadow-xl overflow-hidden backdrop-blur-md transition-all ${
        isUrgent 
          ? 'bg-rose-50/95 dark:bg-slate-900/95 border-rose-300 dark:border-rose-800/80 text-rose-950 dark:text-rose-100 shadow-rose-200/50 ring-2 ring-rose-400/40' 
          : isHigh 
          ? 'bg-amber-50/95 dark:bg-slate-900/95 border-amber-300 dark:border-amber-800/80 text-amber-950 dark:text-amber-100 shadow-amber-200/50' 
          : 'bg-white/95 dark:bg-slate-900/95 border-sky-300 dark:border-sky-800/80 text-slate-900 dark:text-slate-100 shadow-slate-200/80 dark:shadow-none'
      }`}>
        {/* Top Priority Header */}
        <div className={`px-4 py-2.5 flex items-center justify-between border-b ${
          isUrgent 
            ? 'bg-rose-600 text-white border-rose-700' 
            : isHigh 
            ? 'bg-amber-500 text-white border-amber-600' 
            : 'bg-indigo-600 text-white border-indigo-700'
        }`}>
          <div className="flex items-center gap-2">
            {isUrgent ? (
              <AlertTriangle className="w-4 h-4 animate-bounce" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
            <span className="text-xs font-bold uppercase tracking-wider">
              {currentAlert.type === 'task' 
                ? 'Giao việc mới từ Quản trị viên' 
                : currentAlert.type === 'health_alert' 
                ? 'Nhắc nhở sức khỏe & tư thế' 
                : 'Thông báo từ hệ thống'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {activeAlerts.length > 1 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
                +{activeAlerts.length - 1} khác
              </span>
            )}
            <button
              onClick={() => handleDismiss(currentAlert.id)}
              className="p-1 rounded-lg hover:bg-white/20 text-white transition cursor-pointer"
              title="Đóng thông báo này"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900 leading-snug">
              {currentAlert.title}
            </h4>
            <p className="text-xs text-slate-700 mt-1.5 leading-relaxed whitespace-pre-wrap">
              {currentAlert.content}
            </p>
          </div>

          {/* Meta Information */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-600 border-t border-slate-200/80">
            <div className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Gửi bởi: <b>{currentAlert.senderName}</b></span>
            </div>

            {currentAlert.deadline && (
              <div className="flex items-center gap-1 font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md">
                <Clock className="w-3 h-3" />
                <span>Hạn chót: {currentAlert.deadline}</span>
              </div>
            )}

            <div className="ml-auto text-[10px] text-slate-600">
              {new Date(currentAlert.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            {currentAlert.status === 'pending' && (
              <button
                onClick={() => handleAcknowledge(currentAlert.id)}
                disabled={isUpdating === currentAlert.id}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Đã nhận việc</span>
              </button>
            )}

            <button
              onClick={() => handleComplete(currentAlert.id)}
              disabled={isUpdating === currentAlert.id}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
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
