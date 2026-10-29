// src/components/CompanyBonusModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  Gift, 
  X, 
  Building2, 
  DollarSign, 
  CheckCircle2, 
  RotateCcw, 
  Info, 
  Sparkles,
  TrendingUp,
  Percent,
  Calendar
} from 'lucide-react';
import { 
  CompanyBonusPolicy, 
  loadCompanyBonusPolicy, 
  saveCompanyBonusPolicy, 
  DEFAULT_BONUS_POLICY,
  formatCurrencyVND,
  calculateEmployeeBonus
} from '../utils/bonusPolicy';

interface CompanyBonusModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentScore?: number;
  breakdown?: {
    S_posture: number;
    S_break: number;
    S_vital: number;
    S_task: number;
  };
  onPolicyChanged?: (newPolicy: CompanyBonusPolicy) => void;
}

const QUICK_AMOUNTS = [
  { label: '200K', value: 200000 },
  { label: '500K', value: 500000 },
  { label: '1 Triệu', value: 1000000 },
  { label: '2 Triệu', value: 2000000 },
  { label: '5 Triệu', value: 5000000 },
];

export const CompanyBonusModal: React.FC<CompanyBonusModalProps> = ({
  isOpen,
  onClose,
  currentScore = 80,
  breakdown = { S_posture: 85, S_break: 80, S_vital: 85, S_task: 90 },
  onPolicyChanged,
}) => {
  const [policy, setPolicy] = useState<CompanyBonusPolicy>(loadCompanyBonusPolicy());
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPolicy(loadCompanyBonusPolicy());
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveCompanyBonusPolicy(policy);
    setSaveSuccess(true);
    if (onPolicyChanged) {
      onPolicyChanged(policy);
    }
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 800);
  };

  const handleReset = () => {
    setPolicy(DEFAULT_BONUS_POLICY);
  };

  // Tính thử mức thưởng với dữ liệu hiện tại
  const previewResult = calculateEmployeeBonus(currentScore, breakdown, policy);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200/90 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Chính Sách Thưởng Công Thái Học Của Công Ty
              </h2>
              <p className="text-xs text-slate-500">
                Tùy chỉnh ngân sách và cơ chế khen thưởng gắn liền với điểm OHPS
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          
          {/* 1. Tên công ty & Chu kỳ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Tên Doanh Nghiệp / Tổ Chức</span>
              </label>
              <input
                type="text"
                value={policy.companyName}
                onChange={(e) => setPolicy({ ...policy, companyName: e.target.value })}
                placeholder="Ví dụ: Công ty Cổ phần Công nghệ ABC..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Chu Kỳ Xét Thưởng</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                {(['daily', 'weekly', 'monthly'] as const).map((cycle) => (
                  <button
                    key={cycle}
                    type="button"
                    onClick={() => setPolicy({ ...policy, cycle })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                      policy.cycle === cycle
                        ? 'bg-white text-teal-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cycle === 'daily' ? 'Hàng Ngày' : cycle === 'weekly' ? 'Hàng Tuần' : 'Hàng Tháng'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Mức thưởng tối đa & Chọn nhanh */}
          <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-amber-600" />
                <span>Mức Thưởng Tối Đa Mỗi Nhân Viên ({policy.cycle === 'daily' ? 'Ngày' : policy.cycle === 'weekly' ? 'Tuần' : 'Tháng'})</span>
              </label>
              <span className="font-mono font-black text-amber-800 text-base">
                {formatCurrencyVND(policy.maxRewardAmount)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="50000"
                value={policy.maxRewardAmount}
                onChange={(e) => setPolicy({ ...policy, maxRewardAmount: Math.max(0, Number(e.target.value)) })}
                className="flex-1 px-3 py-2 rounded-xl bg-white border border-amber-300 text-slate-900 text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-xs font-bold text-amber-700 font-mono">VNĐ</span>
            </div>

            {/* Quick amount chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-500 font-medium">Mức gợi ý:</span>
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt.value}
                  type="button"
                  onClick={() => setPolicy({ ...policy, maxRewardAmount: amt.value })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                    policy.maxRewardAmount === amt.value
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {amt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Ngưỡng điểm sàn nhận thưởng */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-slate-500" />
                <span>Điểm OHPS Tối Thiểu Để Nhận Thưởng</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={policy.minScoreToReward}
                  onChange={(e) => setPolicy({ ...policy, minScoreToReward: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-600 font-bold">điểm</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Dưới {policy.minScoreToReward} điểm: Nhân viên không đủ điều kiện nhận thưởng chu kỳ.
              </p>
            </div>

            {/* Thưởng Nóng Chuyên Cần */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>Thưởng Thêm Cho Tư Thế Chuẩn (≥90%)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={policy.specialBonuses.perfectPostureBonus}
                  onChange={(e) => setPolicy({
                    ...policy,
                    specialBonuses: {
                      ...policy.specialBonuses,
                      perfectPostureBonus: Math.max(0, Number(e.target.value))
                    }
                  })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-600 font-bold whitespace-nowrap">VNĐ</span>
              </div>
            </div>
          </div>

          {/* 4. Thưởng thêm giải lao & task */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Thưởng Thêm Cho Giải Lao & Đứng Đầy Đủ (≥90%)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={policy.specialBonuses.fullBreakBonus}
                  onChange={(e) => setPolicy({
                    ...policy,
                    specialBonuses: {
                      ...policy.specialBonuses,
                      fullBreakBonus: Math.max(0, Number(e.target.value))
                    }
                  })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-600 font-bold whitespace-nowrap">VNĐ</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Thưởng Thêm Cho Hoàn Thành 100% Nhiệm Vụ
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={policy.specialBonuses.taskCompletedBonus}
                  onChange={(e) => setPolicy({
                    ...policy,
                    specialBonuses: {
                      ...policy.specialBonuses,
                      taskCompletedBonus: Math.max(0, Number(e.target.value))
                    }
                  })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-600 font-bold whitespace-nowrap">VNĐ</span>
              </div>
            </div>
          </div>

          {/* 5. Khung mô phỏng tiền thưởng thực tế theo điểm số hiện tại */}
          <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-teal-700" />
                <span>Mô Phỏng Thưởng Với Điểm OHPS Hiện Tại ({currentScore}đ)</span>
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                previewResult.isEligible 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                  : 'bg-rose-100 text-rose-800 border border-rose-300'
              }`}>
                {previewResult.isEligible ? previewResult.tierAchieved?.tierName : 'Chưa đủ điều kiện'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-teal-200/80">
              <div className="text-xs text-teal-800 space-y-0.5">
                <div>Thưởng cơ bản: <strong className="font-mono">{formatCurrencyVND(previewResult.baseReward)}</strong></div>
                {(previewResult.postureBonus > 0 || previewResult.breakBonus > 0 || previewResult.taskBonus > 0) && (
                  <div className="text-[11px] text-teal-700">
                    Thưởng thêm: <strong className="font-mono">+{formatCurrencyVND(previewResult.postureBonus + previewResult.breakBonus + previewResult.taskBonus)}</strong>
                  </div>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] text-teal-700 uppercase font-bold block">Tổng Tiền Thưởng Dự Kiến</span>
                <span className="text-xl font-extrabold font-mono text-teal-900">
                  {formatCurrencyVND(previewResult.totalReward)}
                </span>
              </div>
            </div>

            <div className="mt-2.5 p-2 rounded-lg bg-white/70 border border-teal-200 text-[11px] text-teal-900 leading-relaxed flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
              <span>{previewResult.tipsToReachNextTier}</span>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50/80">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Mặc định</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-md shadow-teal-600/20 active:scale-95 transition cursor-pointer"
            >
              {saveSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Đã lưu thành công!</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Áp Dụng Chính Sách</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
