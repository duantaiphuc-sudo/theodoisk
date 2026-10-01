import React from 'react';
import { 
  Sparkles, 
  Play, 
  Pause, 
  RotateCcw, 
  Heart, 
  Wind, 
  UserCheck, 
  AlertTriangle, 
  UserX, 
  Flame, 
  PlusCircle, 
  Users, 
  CheckCircle2, 
  Volume2, 
  Clock 
} from 'lucide-react';

export type SimulationScenario = 
  | 'auto' 
  | 'correct' 
  | 'slouch' 
  | 'long_incorrect' 
  | 'absent' 
  | 'tachycardia' 
  | 'low_spo2';

interface SimulationBarProps {
  isSimulating: boolean;
  onToggleSimulating: () => void;
  currentScenario: SimulationScenario;
  onSelectScenario: (scenario: SimulationScenario) => void;
  onSeedSampleHistory: () => void;
  simulateMultiUser: boolean;
  onToggleSimulateMultiUser: () => void;
}

export const SimulationBar: React.FC<SimulationBarProps> = ({
  isSimulating,
  onToggleSimulating,
  currentScenario,
  onSelectScenario,
  onSeedSampleHistory,
  simulateMultiUser,
  onToggleSimulateMultiUser,
}) => {
  if (!isSimulating) {
    return (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
            <Sparkles className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                Chế độ Giả lập Dữ liệu IoT (Simulation Studio)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                Chưa kích hoạt
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Bật mô phỏng để tạo luồng dữ liệu nhịp tim, SpO2, nhận diện tư thế và kiểm tra toàn diện biểu đồ trước khi kết nối Raspberry Pi 4 thật.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            onClick={onSeedSampleHistory}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-2xs transition cursor-pointer active:scale-95"
            title="Nạp ngay 20 bản ghi lịch sử sinh trắc học biến thiên trong 24 giờ qua để vẽ biểu đồ và xuất PDF"
          >
            <PlusCircle className="w-3.5 h-3.5 text-indigo-600" />
            <span>Nạp 20 Mẫu Lịch Sử</span>
          </button>

          <button
            onClick={onToggleSimulating}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition cursor-pointer active:scale-95"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Kích Hoạt Giả Lập</span>
          </button>
        </div>
      </div>
    );
  }

  const scenarios: { id: SimulationScenario; label: string; icon: React.FC<{ className?: string }>; color: string }[] = [
    { id: 'auto', label: 'Tự động luân phiên', icon: RotateCcw, color: 'text-indigo-600' },
    { id: 'correct', label: 'Tư thế Chuẩn', icon: UserCheck, color: 'text-emerald-600' },
    { id: 'slouch', label: 'Cúi gù / Vẹo cổ', icon: AlertTriangle, color: 'text-rose-600' },
    { id: 'long_incorrect', label: 'Gù lưng > 2 phút', icon: Clock, color: 'text-rose-700 font-extrabold' },
    { id: 'absent', label: 'Rời bàn / Vắng', icon: UserX, color: 'text-amber-600' },
    { id: 'tachycardia', label: 'Nhịp tim nhanh (125)', icon: Heart, color: 'text-rose-600' },
    { id: 'low_spo2', label: 'Thiếu oxy (92%)', icon: Wind, color: 'text-sky-600' },
  ];

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-sm overflow-hidden animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-amber-50/80 px-4 py-3 border-b border-amber-200/90 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Sparkles className="w-4 h-4 animate-spin" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight">
                Studio Giả Lập Trực Quan (Interactive IoT Simulation)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Đang phát tín hiệu
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Chọn từng kịch bản bên dưới để ép trạng thái test ngay lập tức mà không phải chờ đợi.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          {/* Toggle Multi-user simulation for Admin */}
          <button
            onClick={onToggleSimulateMultiUser}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border transition cursor-pointer active:scale-95 ${
              simulateMultiUser
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Đồng thời giả lập dữ liệu cho tất cả các nhân viên để kiểm tra Danh mục Quản trị viên"
          >
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span>Mô phỏng đa nhân viên: <b>{simulateMultiUser ? 'BẬT' : 'TẮT'}</b></span>
          </button>

          {/* Seed 20 historical records */}
          <button
            onClick={onSeedSampleHistory}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-2xs transition cursor-pointer active:scale-95"
            title="Tạo ngay 20 mẫu lịch sử trải dài trong 24 giờ qua để biểu đồ TrendChart hiển thị đường cong đầy đủ"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Nạp 20 Mẫu Lịch Sử</span>
          </button>

          {/* Stop Simulation */}
          <button
            onClick={onToggleSimulating}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer active:scale-95"
          >
            <Pause className="w-3.5 h-3.5 fill-current" />
            <span>Dừng Giả Lập</span>
          </button>
        </div>
      </div>

      {/* Scenario Selector Chips */}
      <div className="p-3 sm:p-4 bg-slate-50/50">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <span>Chọn Kịch Bản Kiểm Thử Thời Gian Thực:</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {scenarios.map(sc => {
            const Icon = sc.icon;
            const isSelected = currentScenario === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => onSelectScenario(sc.id)}
                className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold border transition cursor-pointer active:scale-95 text-center ${
                  isSelected
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-300'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200/90 shadow-2xs'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : sc.color}`} />
                <span className="truncate">{sc.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
