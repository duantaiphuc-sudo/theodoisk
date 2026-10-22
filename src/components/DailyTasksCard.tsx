import React, { useState } from 'react';
import { UserTaskNotification, AuthUser } from '../types';
import { 
  CheckCircle2, 
  Circle, 
  Plus, 
  Trash2, 
  Clock, 
  AlertCircle, 
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ListTodo,
  Check
} from 'lucide-react';

interface DailyTasksCardProps {
  tasks: UserTaskNotification[];
  currentUser: AuthUser | null;
  onCompleteTask: (taskId: string) => Promise<void>;
  onAcknowledgeTask?: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddTask: (title: string, priority?: 'normal' | 'high' | 'urgent') => Promise<void>;
  className?: string;
}

export const DailyTasksCard: React.FC<DailyTasksCardProps> = ({
  tasks,
  currentUser,
  onCompleteTask,
  onDeleteTask,
  onAddTask,
  className,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter tasks targeted for current user or 'all'
  const myTasks = tasks.filter(t => {
    if (t.targetUserId === 'all') return true;
    if (currentUser?.id && t.targetUserId === currentUser.id) return true;
    if (currentUser?.email && t.targetUserId?.toLowerCase() === currentUser.email.toLowerCase()) return true;
    return false;
  });

  const completedCount = myTasks.filter(t => t.status === 'completed').length;
  const totalCount = myTasks.length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddTask(newTitle.trim(), newPriority);
      setNewTitle('');
      setIsAdding(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAdd = async (title: string) => {
    setIsSubmitting(true);
    try {
      await onAddTask(title, 'normal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`rounded-2xl glass-panel bg-white/75 backdrop-blur-xl border border-white/60 shadow-lg p-4 sm:p-5 flex flex-col justify-between transition-all ${className || ''}`}>
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
              <ListTodo className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Nhiệm vụ hôm nay
              </h3>
              <p className="text-[11px] text-slate-500">Mục tiêu công thái học & bài tập</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
              {completedCount}/{totalCount}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsAdding(!isAdding);
                if (isCollapsed) setIsCollapsed(false);
              }}
              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 flex items-center justify-center transition cursor-pointer"
              title="Thêm nhiệm vụ mới"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 flex items-center justify-center transition cursor-pointer"
              title={isCollapsed ? "Mở rộng nhiệm vụ" : "Thu gọn nhiệm vụ"}
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isCollapsed && myTasks.length > 0 && (
          <div className="pt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>Đã hoàn thành {completedCount}/{totalCount} nhiệm vụ</span>
            <button 
              type="button" 
              onClick={() => setIsCollapsed(false)}
              className="text-emerald-600 font-semibold hover:underline"
            >
              Xem chi tiết
            </button>
          </div>
        )}

        {/* Inline Add Task Form */}
        {isAdding && (
          <form onSubmit={handleCreate} className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 animate-fadeIn space-y-2.5">
            <input
              type="text"
              required
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Ví dụ: Đứng làm việc 15 phút..."
              className="w-full px-3 py-1.5 rounded-lg text-xs bg-white border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-900"
            />
            <div className="flex items-center justify-between gap-2">
              <select
                value={newPriority}
                onChange={e => setNewPriority(e.target.value as any)}
                className="px-2 py-1 rounded-lg text-[11px] bg-white border border-slate-200 text-slate-700 cursor-pointer"
              >
                <option value="normal">Bình thường</option>
                <option value="high">Ưu tiên cao</option>
                <option value="urgent">Khẩn cấp</option>
              </select>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTitle.trim()}
                  className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {isSubmitting ? 'Đang thêm...' : 'Thêm'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Task List */}
        {!isCollapsed && (
          <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
          {myTasks.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs text-slate-500">Chưa có nhiệm vụ nào hôm nay</p>
              <div className="flex flex-col gap-1.5 max-w-xs mx-auto pt-1">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleQuickAdd('Đứng dậy làm việc 15 phút')}
                  className="text-left px-2.5 py-1.5 rounded-lg text-xs bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200/80 transition cursor-pointer flex items-center justify-between"
                >
                  <span>+ Đứng dậy làm việc 15 phút</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleQuickAdd('Uống 500ml nước ấm')}
                  className="text-left px-2.5 py-1.5 rounded-lg text-xs bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200/80 transition cursor-pointer flex items-center justify-between"
                >
                  <span>+ Uống 500ml nước</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleQuickAdd('Bài tập xoay vai và cổ')}
                  className="text-left px-2.5 py-1.5 rounded-lg text-xs bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200/80 transition cursor-pointer flex items-center justify-between"
                >
                  <span>+ Bài tập xoay vai & cổ</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </div>
          ) : (
            myTasks.map(task => {
              const isCompleted = task.status === 'completed';
              return (
                <div
                  key={task.id}
                  className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 group ${
                    isCompleted 
                      ? 'bg-slate-50/60 border-slate-200/60 opacity-70' 
                      : 'bg-white hover:bg-slate-50/80 border-slate-200 shadow-2xs'
                  }`}
                >
                  {/* Left Toggle Button */}
                  <button
                    type="button"
                    onClick={() => onCompleteTask(task.id)}
                    className="shrink-0 cursor-pointer"
                    title={isCompleted ? 'Đã hoàn thành' : 'Đánh dấu hoàn thành'}
                  >
                    {isCompleted ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-3" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-slate-300 hover:border-emerald-500 transition" />
                    )}
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold leading-tight truncate ${
                      isCompleted ? 'line-through text-slate-400' : 'text-slate-900'
                    }`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                      {task.priority === 'urgent' && (
                        <span className="text-rose-600 font-bold">Khẩn cấp</span>
                      )}
                      {task.priority === 'high' && (
                        <span className="text-amber-600 font-bold">Ưu tiên cao</span>
                      )}
                      <span>
                        {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    className="w-6 h-6 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition cursor-pointer flex items-center justify-center shrink-0"
                    title="Xóa nhiệm vụ này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
          </div>
        )}
      </div>

      {/* Footer Quick Prompt */}
      {!isCollapsed && myTasks.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1 text-emerald-600 font-medium">
            <Sparkles className="w-3 h-3" />
            <span>{completedCount === totalCount && totalCount > 0 ? 'Xuất sắc! Đã hoàn thành tất cả' : 'Tiếp tục duy trì!'}</span>
          </span>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="text-emerald-700 font-bold hover:underline cursor-pointer"
          >
            + Thêm task
          </button>
        </div>
      )}
    </div>
  );
};
