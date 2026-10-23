import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  Activity, 
  ChevronRight, 
  Dumbbell, 
  Check, 
  Sparkles,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { UserTaskNotification, TimeCalculations } from '../types';

interface NatureDailyTasksProps {
  userTasks?: UserTaskNotification[];
  timeStats?: TimeCalculations;
  onCompleteTask?: (taskId: string) => void;
  onOpenTasksTab?: () => void;
}

export const NatureDailyTasks: React.FC<NatureDailyTasksProps> = ({
  userTasks = [],
  timeStats,
  onCompleteTask,
  onOpenTasksTab,
}) => {
  const sittingMins = Math.floor((timeStats?.sittingSeconds || 0) / 60);
  const badPostureMins = Math.floor((timeStats?.badPostureSeconds || 0) / 60);
  const correctMins = Math.max(0, sittingMins - badPostureMins);

  // Local state for interactive missions
  const [exerciseDone, setExerciseDone] = useState(false);
  const [breakDone, setBreakDone] = useState(true);

  // Default Ergonomic Daily Missions
  const missions = [
    {
      id: 'm1',
      title: 'Làm 1 bài tập giãn cơ cổ',
      icon: <Dumbbell className="w-4 h-4 text-teal-400" />,
      completed: exerciseDone,
      progressText: exerciseDone ? '1/1 lần' : '0/1 lần',
      percent: exerciseDone ? 100 : 0,
      onClick: () => setExerciseDone(prev => !prev),
    },
    {
      id: 'm2',
      title: 'Ngồi đúng tư thế 30 phút',
      icon: <Clock className="w-4 h-4 text-teal-400" />,
      completed: correctMins >= 30,
      progressText: `${Math.min(30, correctMins)}/30 phút`,
      percent: Math.min(100, Math.round((correctMins / 30) * 100)),
      onClick: undefined,
    },
    {
      id: 'm3',
      title: 'Giải lao sau 45 phút làm việc',
      icon: <CheckCircle2 className="w-4 h-4 text-teal-400" />,
      completed: breakDone,
      progressText: breakDone ? 'Đã xong' : 'Chưa thực hiện',
      percent: breakDone ? 100 : 0,
      onClick: () => setBreakDone(prev => !prev),
    },
  ];

  const completedCount = missions.filter(m => m.completed).length + userTasks.filter(t => t.status === 'completed').length;
  const totalCount = missions.length + userTasks.length;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#0c221a] border border-emerald-500/20 text-white shadow-xl p-5 sm:p-6 flex flex-col justify-between space-y-4">
      {/* Background ambient lighting */}
      <div className="absolute left-0 bottom-0 w-44 h-44 rounded-full bg-teal-500/5 blur-2xl pointer-events-none" />

      {/* Header: Title + Progress Chip e.g. 1/3 (Exact style of image_ee54c780.png) */}
      <div className="relative z-10 flex items-center justify-between">
        <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
          <span>Nhiệm vụ hôm nay</span>
        </h3>

        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-950/80 text-teal-300 border border-teal-500/40">
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* Task List (Matching image_ee54c780.png) */}
      <div className="relative z-10 space-y-3">
        {missions.map(item => (
          <div
            key={item.id}
            onClick={item.onClick}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
              item.completed 
                ? 'bg-[#081b15]/90 border-teal-500/30 hover:border-teal-400' 
                : 'bg-[#081b15]/60 border-emerald-500/10 hover:border-emerald-500/30'
            }`}
          >
            {/* Left: Icon inside rounded squircle */}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105 ${
              item.completed 
                ? 'bg-teal-400 text-slate-950 border-teal-300 shadow-sm shadow-teal-400/20' 
                : 'bg-[#10271e] text-teal-400 border-teal-500/20'
            }`}>
              {item.completed ? <Check className="w-4 h-4 stroke-[3]" /> : item.icon}
            </div>

            {/* Center: Title + Progress Bar */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold truncate ${item.completed ? 'text-white' : 'text-emerald-100/90'}`}>
                  {item.title}
                </span>
                <span className={`text-[11px] font-mono shrink-0 ml-2 ${item.completed ? 'text-teal-300 font-bold' : 'text-emerald-200/50'}`}>
                  {item.progressText}
                </span>
              </div>

              {/* Progress track */}
              <div className="w-full h-1.5 bg-[#122a21] rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    item.completed ? 'bg-teal-400 shadow-xs' : 'bg-teal-600'
                  }`}
                  style={{ width: `${item.percent}%` }}
                />
              </div>
            </div>

            {/* Right: Chevron arrow */}
            <ChevronRight className="w-4 h-4 text-emerald-200/40 group-hover:text-teal-300 transition-transform group-hover:translate-x-0.5 shrink-0" />
          </div>
        ))}

        {/* Assigned tasks from manager if any */}
        {userTasks.slice(0, 2).map(task => (
          <div
            key={task.id}
            onClick={() => onCompleteTask?.(task.id)}
            className="p-3.5 rounded-2xl bg-[#081b15]/90 border border-amber-500/30 hover:border-amber-400 transition-all cursor-pointer flex items-center justify-between gap-3 group"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-200 truncate">
                  {task.title}
                </span>
                <span className="text-[10px] font-mono text-amber-400">
                  {task.status === 'completed' ? 'Đã xong' : 'Cần làm'}
                </span>
              </div>
              <p className="text-[10px] text-emerald-200/50 truncate mt-0.5">{task.content}</p>
            </div>

            <ChevronRight className="w-4 h-4 text-amber-300/40 group-hover:text-amber-300 transition" />
          </div>
        ))}
      </div>

      {/* Footer link to all tasks */}
      <div className="relative z-10 pt-1 flex items-center justify-between text-xs text-emerald-200/60 border-t border-emerald-500/10">
        <span>Cập nhật theo thời gian thực</span>
        <button
          type="button"
          onClick={onOpenTasksTab}
          className="text-teal-400 hover:text-teal-300 font-bold transition cursor-pointer"
        >
          Xem tất cả nhiệm vụ →
        </button>
      </div>
    </div>
  );
};
